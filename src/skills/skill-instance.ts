import {trustSkillInstanceDefinition,skillInstanceDefinitionToken,captureSkillExpiry,skillTriggerMutationAllowed,bindChildSkillTriggers} from './skill-trigger.js';
import {defineSkill,type SkillEngineDefinition} from './skill-engine.js';
import type {SkillEffectRuntime} from './skill-effect-integration.js';
import type {SkillExecutionSnapshot} from './skill-execution.js';
import type {RootOffensiveSnapshot} from './root-offense.js';
import type {CombatValidationContext} from '../combat/combat-state.js';

type Immutable<T> = T extends object ? {readonly [K in keyof T]:Immutable<T[K]>} : T;
export interface SkillInstanceDefinition {
 readonly definition:Immutable<SkillEngineDefinition>;readonly configVersion:string;readonly lifetimeMs?:number;
}
export type SkillInstanceStatus='pending'|'active'|'finished'|'expired'|'cancelled';
/** Frozen observation and trusted session handle. Terminal observations omit
 * heavy payloads; caller-held older observations naturally retain their data. */
export interface SkillInstanceView {
 readonly instanceId:string;readonly skillId:string;readonly rootInstanceId:string;readonly parentInstanceId:string|null;
 readonly casterId:string;readonly actionInstanceId:string;readonly configVersion:string;readonly createdAt:number;
 readonly status:SkillInstanceStatus;readonly activatedAt?:number;readonly expiresAt?:number;
 readonly endedAt?:number;readonly reason?:string;
 readonly definition?:Immutable<SkillEngineDefinition>;readonly rootOffense?:RootOffensiveSnapshot;
}
export type SkillInstanceRejection='invalid_session'|'invalid_time'|'invalid_instance'|'invalid_definition'
 |'invalid_receipt'|'conflicting_replay'|'parent_terminal'|'invalid_transition'|'action_owned'|'entity_not_found';
export type SkillInstanceResult={success:true;instance:SkillInstanceView;changed:boolean}|{success:false;reason:SkillInstanceRejection};
interface RecordEntry {view:SkillInstanceView;pinToken:object; lifetimeMs?:number}
interface InstanceSession {
 runtime:SkillEffectRuntime;namespace:string;now:number;records:Map<string,RecordEntry>;handles:WeakSet<SkillInstanceView>;
}
// Weak trust associations, no global ID allocation or retained instance registry.
const instanceSessions=new WeakMap<SkillEffectRuntime,InstanceSession>();
const executionInstances=new WeakMap<SkillExecutionSnapshot,{session:InstanceSession;id:string}>();
const instanceIdPart=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.trim()===v;
const validLifetime=(v:unknown):v is number|undefined=>v===undefined||typeof v==='number'&&Number.isFinite(v)&&v>0;
const validDeadline=(at:number,lifetime:number|undefined)=>lifetime===undefined||Number.isFinite(at+lifetime)&&at+lifetime>at;
const isLive=(v:SkillInstanceView)=>v.status==='pending'||v.status==='active';
const fail=(reason:SkillInstanceRejection):SkillInstanceResult=>({success:false,reason});
const ok=(r:RecordEntry,changed:boolean):SkillInstanceResult=>({success:true,instance:r.view,changed});

/** Validate/freeze once, then reuse the exact pin handle across registrations.
 * Pin identity is part of receipt payload; a different pin is a different payload. */
export function pinSkillInstanceDefinition(definition:SkillEngineDefinition,configVersion:string,lifetimeMs?:number):SkillInstanceDefinition {
 if(!instanceIdPart(configVersion)||!validLifetime(lifetimeMs))throw Error('invalid_instance_definition');
 const pinned=defineSkill(definition);if(!pinned.success)throw Error('invalid_instance_definition');
 const pin=Object.freeze({definition:pinned.definition,configVersion,...(lifetimeMs===undefined?{}:{lifetimeMs})});
 trustSkillInstanceDefinition(pin);return pin;
}
export function initializeSkillInstances(runtime:SkillEffectRuntime,namespace:string):void {
 if(!instanceIdPart(namespace))throw Error('invalid_instance_session');
 instanceSessions.set(runtime,{runtime,namespace,now:runtime.now,records:new Map(),handles:new WeakSet()});
}
function timeError(s:InstanceSession,now:number):boolean {
 return !Number.isFinite(now)||now<0||now<s.now||now!==s.runtime.now;
}
function observe(s:InstanceSession,r:RecordEntry,view:SkillInstanceView):void {
 r.view=Object.freeze(view);s.handles.add(r.view);
}
function terminal(s:InstanceSession,r:RecordEntry,status:'finished'|'expired'|'cancelled',at:number,reason:string):void {
 if(status==='expired')captureSkillExpiry(s.runtime,r.view,at);
 const {definition:_,rootOffense:__,...metadata}=r.view;
 observe(s,r,{...metadata,status,endedAt:at,reason});
}
/** Existing delivery loop calls at its own boundaries. No clock or event queue. */
export function advanceSkillInstances(runtime:SkillEffectRuntime,now:number):void {
 const s=instanceSessions.get(runtime);if(!s)return;
 if(timeError(s,now))throw Error('invalid_instance_time');
 const due=[...s.records.values()].filter(r=>r.view.status==='active'&&r.view.expiresAt!==undefined&&r.view.expiresAt<=now)
  .sort((a,b)=>a.view.expiresAt!-b.view.expiresAt!||(a.view.instanceId<b.view.instanceId?-1:1));
 for(const r of due)terminal(s,r,'expired',r.view.expiresAt!,'lifetime');
 s.now=now;
}
export function nextSkillInstanceExpiration(runtime:SkillEffectRuntime):number {
 const s=instanceSessions.get(runtime);let next=Infinity;
 if(s)for(const r of s.records.values())if(r.view.status==='active'&&r.view.expiresAt!==undefined)next=Math.min(next,r.view.expiresAt);
 return next;
}
export function disposeSkillInstances(runtime:SkillEffectRuntime):readonly SkillInstanceView[]|undefined {
 const s=instanceSessions.get(runtime);if(!s)return;
 advanceSkillInstances(runtime,runtime.now);
 const cancelled:SkillInstanceView[]=[];
 for(const r of s.records.values())if(isLive(r.view)){terminal(s,r,'cancelled',runtime.now,'session_end');cancelled.push(r.view);}
 s.records.clear();s.handles=new WeakSet();instanceSessions.delete(runtime);return Object.freeze(cancelled);
}
/** Precommit guard; no capture, records or resource mutation. */
export function prepareRootSkillInstance(runtime:SkillEffectRuntime|undefined,actionId:string,now:number,activationAt:number,lifetimeMs?:number):boolean {
 const s=runtime&&instanceSessions.get(runtime);
 if(!s)return lifetimeMs===undefined;
 return runtime!.active&&!timeError(s,now)&&validLifetime(lifetimeMs)&&validDeadline(activationAt,lifetimeMs)
  &&!s.records.has(JSON.stringify([s.namespace,actionId]));
}
export function bindRootSkillInstance(runtime:SkillEffectRuntime,snapshot:SkillExecutionSnapshot,lifetimeMs?:number):void {
 const s=instanceSessions.get(runtime);if(!s)return;
 const id=JSON.stringify([s.namespace,snapshot.actionInstanceId]);
 const r:RecordEntry={view:undefined as unknown as SkillInstanceView,pinToken:{},...(lifetimeMs===undefined?{}:{lifetimeMs})};
 observe(s,r,{instanceId:id,rootInstanceId:id,parentInstanceId:null,skillId:snapshot.skillId,casterId:snapshot.casterId,
  actionInstanceId:snapshot.actionInstanceId,configVersion:snapshot.configVersion,createdAt:snapshot.startedAt,status:'pending',
  definition:snapshot.definition,rootOffense:snapshot.rootOffense!});
 s.records.set(id,r);s.now=snapshot.startedAt;executionInstances.set(snapshot,{session:s,id});
}
export function validateRootInstanceTime(snapshot:SkillExecutionSnapshot|undefined,now:number):void {
 const link=snapshot&&executionInstances.get(snapshot);
 if(link&&!skillTriggerMutationAllowed(link.session.runtime))throw Error('trigger_reentrancy');
 if(link&&(!link.session.runtime.active||!instanceSessions.has(link.session.runtime)||timeError(link.session,now)))throw Error('invalid_instance_time');
}
function activate(s:InstanceSession,r:RecordEntry,at:number):void {
 observe(s,r,{...r.view,status:'active',activatedAt:at,...(r.lifetimeMs===undefined?{}:{expiresAt:at+r.lifetimeMs})});
 if(r.lifetimeMs===undefined)terminal(s,r,'finished',at,'instant');
}
export function activateRootSkillInstance(snapshot:SkillExecutionSnapshot):void {
 const link=executionInstances.get(snapshot);if(!link)return;
 const r=link.session.records.get(link.id);if(!r||r.view.status!=='pending')return;
 activate(link.session,r,snapshot.activationTime);
 advanceSkillInstances(link.session.runtime,link.session.runtime.now);
}
export function cancelRootSkillInstance(snapshot:SkillExecutionSnapshot|undefined,now:number,reason:string):void {
 const link=snapshot&&executionInstances.get(snapshot);if(!link)return;
 advanceSkillInstances(link.session.runtime,now);
 const r=link.session.records.get(link.id);if(r&&isLive(r.view))terminal(link.session,r,'cancelled',now,reason);
}
/** Returns only Core-bound roots. Cloned or cross-session execution is inert. */
export function rootSkillInstance(runtime:SkillEffectRuntime,snapshot:SkillExecutionSnapshot):SkillInstanceView|undefined {
 const link=executionInstances.get(snapshot);
 return runtime.active&&link?.session===instanceSessions.get(runtime)?link?.session.records.get(link.id)?.view:undefined;
}
export function inspectSkillInstance(runtime:SkillEffectRuntime,instanceId:string):SkillInstanceView|undefined {
 return runtime.active?instanceSessions.get(runtime)?.records.get(instanceId)?.view:undefined;
}
function owner(runtime:SkillEffectRuntime,handle:SkillInstanceView,now:number):InstanceSession|SkillInstanceRejection {
 const s=instanceSessions.get(runtime);if(!s||!runtime.active)return 'invalid_session';
 if(!skillTriggerMutationAllowed(runtime))return 'invalid_transition';
 if(timeError(s,now))return 'invalid_time';
 if(!handle||!s.handles.has(handle)||!s.records.has(handle.instanceId))return 'invalid_instance';
 return s;
}
/** Trusted manual registration only. Later authenticated terminal-trigger
 * admission must validate its own receipt; no public terminal-parent bypass. */
export function registerChildSkillInstance(runtime:SkillEffectRuntime,parent:SkillInstanceView,pin:SkillInstanceDefinition,
 receipt:string,now:number,combat:CombatValidationContext):SkillInstanceResult {
 const s=owner(runtime,parent,now);if(typeof s==='string')return fail(s);
 if(!pin||!skillInstanceDefinitionToken(pin))return fail('invalid_definition');
 if(!instanceIdPart(receipt))return fail('invalid_receipt');
 const id=JSON.stringify([...JSON.parse(parent.instanceId) as string[],receipt]);
 const existing=s.records.get(id),token=skillInstanceDefinitionToken(pin)!;
 if(existing)return existing.pinToken===token?ok(existing,false):fail('conflicting_replay');
 const p=s.records.get(parent.instanceId)!;
 if(!isLive(p.view))return fail('parent_terminal');
 if(!combat.findEntity(p.view.casterId))return fail('entity_not_found');
 if(!validDeadline(now,pin.lifetimeMs))return fail('invalid_time');
 const r:RecordEntry={view:undefined as unknown as SkillInstanceView,pinToken:token,...(pin.lifetimeMs===undefined?{}:{lifetimeMs:pin.lifetimeMs})};
 observe(s,r,{instanceId:id,skillId:pin.definition.skillId,rootInstanceId:p.view.rootInstanceId,parentInstanceId:p.view.instanceId,
  actionInstanceId:p.view.actionInstanceId,casterId:p.view.casterId,createdAt:now,configVersion:pin.configVersion,status:'pending',
  definition:pin.definition,rootOffense:p.view.rootOffense!});
 s.records.set(id,r);bindChildSkillTriggers(runtime,p.view.instanceId,r.view,pin);s.now=now;return ok(r,true);
}
export function activateSkillInstance(runtime:SkillEffectRuntime,handle:SkillInstanceView,now:number,combat:CombatValidationContext):SkillInstanceResult {
 const s=owner(runtime,handle,now);if(typeof s==='string')return fail(s);
 const r=s.records.get(handle.instanceId)!;
 if(r.view.parentInstanceId===null)return fail('action_owned');
 if(r.view.activatedAt!==undefined)return ok(r,false);
 if(r.view.status!=='pending')return fail('invalid_transition');
 if(!combat.findEntity(r.view.casterId))return fail('entity_not_found');
 if(!validDeadline(now,r.lifetimeMs))return fail('invalid_time');
 activate(s,r,now);s.now=now;return ok(r,true);
}
export function finishSkillInstance(runtime:SkillEffectRuntime,handle:SkillInstanceView,now:number):SkillInstanceResult {
 const s=owner(runtime,handle,now);if(typeof s==='string')return fail(s);
 const r=s.records.get(handle.instanceId)!;
 if(r.view.status==='finished')return ok(r,false);
 if(r.view.status!=='active')return fail('invalid_transition');
 terminal(s,r,'finished',now,'manual');s.now=now;return ok(r,true);
}
export function cancelSkillInstance(runtime:SkillEffectRuntime,handle:SkillInstanceView,now:number):SkillInstanceResult {
 const s=owner(runtime,handle,now);if(typeof s==='string')return fail(s);
 const r=s.records.get(handle.instanceId)!;
 if(r.view.parentInstanceId===null&&r.view.status==='pending')return fail('action_owned');
 if(r.view.status==='cancelled')return ok(r,false);
 if(!isLive(r.view))return fail('invalid_transition');
 terminal(s,r,'cancelled',now,'manual');s.now=now;return ok(r,true);
}
