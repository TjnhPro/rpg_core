import type {SkillInstanceDefinition,SkillInstanceView} from './skill-instance.js';
import type {SkillEngineDefinition} from './skill-engine.js';
import type {SkillEffectRuntime} from './skill-effect-integration.js';
import type {RootOffensiveSnapshot} from './root-offense.js';
import type {MapPoint} from '../spatial/grid-geometry.js';
import type {CombatValidationContext} from '../combat/combat-state.js';
import {validateCombatHit} from '../combat/combat-state.js';
import type {EffectLifecycleEvent,EffectStackConsumePlan} from '../effects/effect-lifecycle.js';
import type {CombatEntity} from '../combat/combat-entity.js';

export const SKILL_TRIGGER_LIMITS=Object.freeze({maxDepth:8,maxIntentsPerRoot:128,maxLiveChildren:32,maxQueuedPerBoundary:256,maxWorkPerBoundary:512});
export type SkillTrigger='OnImpact'|'OnExpire'|'OnHit'|'OnKill'|'OnStackThreshold';
export interface SkillStackPredicate {readonly effectId:string;readonly minStacks:number;readonly sourceScope:'currentSource'}
export interface SkillStackThreshold {readonly effectId:string;readonly threshold:number}
export interface SkillTriggerLink {
 readonly linkId:string;readonly sourceSkillId:string;readonly childSkillId:string;
 readonly trigger:SkillTrigger;readonly delayMs:number;readonly maxOccurrences:number;
 readonly requiresStacks?:SkillStackPredicate;readonly consumeExactly?:number;readonly stackThreshold?:SkillStackThreshold;
}
export interface SkillTriggerBundle {
 readonly version:string;readonly rootSkillId:string;
 readonly definitions:readonly SkillInstanceDefinition[];readonly links:readonly SkillTriggerLink[];
}
/** Core-issued immutable capability, not a JSON/network event. instanceId is
 * the triggering instance (the prospective child's parent), not a spawned child. */
export interface SkillTriggerReceipt {
 readonly receiptId:string;readonly sessionNamespace:string;readonly rootInstanceId:string;
 readonly instanceId:string;readonly parentInstanceId:string|null;readonly sourceEntityId:string;
 readonly trigger:SkillTrigger;readonly occurrenceId:string;readonly atMs:number;readonly executeAtMs:number;
 readonly linkId:string;readonly childSkillId:string;readonly depth:number;readonly origin:Readonly<MapPoint>;
 readonly deliveryId?:string;readonly targetId?:string;readonly beforeStacks?:number;readonly afterStacks?:number;
}
export type SkillTriggerDimension='maxDepth'|'maxIntentsPerRoot'|'maxQueuedPerBoundary'|'maxWorkPerBoundary'|'maxOccurrences'|'maxLiveChildren'|'maxProjectilesPerRoot';
export interface SkillTriggerResult {
 readonly status:'accepted'|'rejected';readonly atMs:number;readonly instanceId:string;readonly rootInstanceId:string;
 readonly linkIds:readonly string[];readonly receipt?:SkillTriggerReceipt;
 readonly reason?:'budget_exceeded'|'invalid_ancestry'|'invalid_time'|'entity_not_found'|'invalid_child_target'|'condition_not_met'|'stack_consume_failed';readonly dimension?:SkillTriggerDimension;
 /** Work-overflow diagnostics aggregate further rejected batches, never intents. */
 readonly rejectedBatches?:number;
}
export interface SkillTriggerBinding {readonly bundle:SkillTriggerBundle;readonly executeChildren?:boolean;observe(result:SkillTriggerResult):void}
export type SkillTriggerReceiptResult={success:true;changed:false}|{success:false;reason:'invalid_session'|'invalid_receipt'};

// One canonical pin trust table, reused by instance registration and bundle validation.
const definitionTokens=new WeakMap<SkillInstanceDefinition,object>();
export function trustSkillInstanceDefinition(pin:SkillInstanceDefinition):void {definitionTokens.set(pin,{});}
export function skillInstanceDefinitionToken(pin:SkillInstanceDefinition):object|undefined {return definitionTokens.get(pin);}
interface BundleData {definitions:Map<string,SkillInstanceDefinition>;links:Map<string,readonly SkillTriggerLink[]>}
const bundles=new WeakMap<SkillTriggerBundle,BundleData>();
export function isPinnedSkillTriggerBundle(value:SkillTriggerBundle):boolean {return bundles.has(value);}
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.trim()===v;
const point=(v:Readonly<MapPoint>|undefined):v is Readonly<MapPoint>=>!!v&&Number.isFinite(v.x)&&Number.isFinite(v.y);
const closed=(v:object,keys:readonly string[])=>Object.keys(v).every(k=>keys.includes(k));
function invalid(detail:string):never {throw Error('invalid_trigger_bundle: '+detail);}
/** Pins are already validated/frozen by v1.1.2; no definition deep clones here. */
export function pinSkillTriggerBundle(input:SkillTriggerBundle):SkillTriggerBundle {
 if(!input||!closed(input,['version','rootSkillId','definitions','links'])||!id(input.version)||!id(input.rootSkillId)
  ||!Array.isArray(input.definitions)||!Array.isArray(input.links))invalid('shape');
 if(input.definitions.length>SKILL_TRIGGER_LIMITS.maxIntentsPerRoot+1||input.links.length>SKILL_TRIGGER_LIMITS.maxIntentsPerRoot)invalid('size');
 const definitions=new Map<string,SkillInstanceDefinition>(),links=new Map<string,SkillTriggerLink[]>(),linkIds=new Set<string>();
 for(const pin of input.definitions){
  if(!pin||!definitionTokens.has(pin)||definitions.has(pin.definition.skillId))invalid('definition');
  definitions.set(pin.definition.skillId,pin);
 }
 if(!definitions.has(input.rootSkillId))invalid('root');
 const pinnedLinks:SkillTriggerLink[]=[];
 for(const link of input.links){
  if(!link||!closed(link,['linkId','sourceSkillId','childSkillId','trigger','delayMs','maxOccurrences','requiresStacks','consumeExactly','stackThreshold'])||!id(link.linkId)||linkIds.has(link.linkId)
   ||!definitions.has(link.sourceSkillId)||!definitions.has(link.childSkillId)||!['OnImpact','OnExpire','OnHit','OnKill','OnStackThreshold'].includes(link.trigger)
   ||!Number.isFinite(link.delayMs)||link.delayMs<0||!Number.isSafeInteger(link.maxOccurrences)||link.maxOccurrences<1
   ||link.maxOccurrences>SKILL_TRIGGER_LIMITS.maxIntentsPerRoot)invalid('link');
  if(link.trigger==='OnExpire'&&definitions.get(link.sourceSkillId)!.lifetimeMs===undefined)invalid('OnExpire requires lifetime');
  const knownEffect=(effectId:string)=>[...definitions.values()].some(p=>(p.definition.effects??[]).some(e=>e.type==='modifier_effect'&&e.definition.effectId===effectId&&e.definition.stackingPolicy==='stack'));
  const predicate=link.requiresStacks,threshold=link.stackThreshold;
  if(predicate!==undefined&&(!predicate||!closed(predicate,['effectId','minStacks','sourceScope'])||!id(predicate.effectId)||!knownEffect(predicate.effectId)
   ||!Number.isSafeInteger(predicate.minStacks)||predicate.minStacks<1||predicate.sourceScope!=='currentSource'))invalid('requiresStacks');
  if(link.trigger==='OnKill'&&predicate)invalid('OnKill requiresStacks unsupported');
  if((link.trigger==='OnStackThreshold')!==!!threshold)invalid('stackThreshold');
  if(threshold!==undefined&&(!threshold||!closed(threshold,['effectId','threshold'])||!id(threshold.effectId)||!knownEffect(threshold.effectId)||!Number.isSafeInteger(threshold.threshold)||threshold.threshold<1))invalid('stackThreshold');
  if(link.consumeExactly!==undefined&&(!predicate||!Number.isSafeInteger(link.consumeExactly)||link.consumeExactly<1||link.delayMs!==0))invalid('consumeExactly');
  const pinned=Object.freeze({...link,...(predicate?{requiresStacks:Object.freeze({...predicate})}:{}),...(threshold?{stackThreshold:Object.freeze({...threshold})}:{})});pinnedLinks.push(pinned);linkIds.add(link.linkId);
  const outgoing=links.get(link.sourceSkillId)??[];outgoing.push(pinned);links.set(link.sourceSkillId,outgoing);
 }
 // One consuming link for any possible occurrence; threshold pools are disjoint.
 for(const outgoing of links.values())for(const link of outgoing.filter(l=>l.consumeExactly!==undefined)){
  if(outgoing.some(l=>l!==link&&l.consumeExactly!==undefined&&l.trigger===link.trigger
   &&(link.trigger!=='OnStackThreshold'||l.stackThreshold!.effectId===link.stackThreshold!.effectId)))invalid('multiple consuming links');
 }
 const visiting=new Set<string>(),heights=new Map<string,number>();
 const visit=(skillId:string):number=>{
  if(visiting.has(skillId))invalid('cycle');
  if(heights.has(skillId))return heights.get(skillId)!;
  visiting.add(skillId);let height=0;
  for(const link of links.get(skillId)??[])height=Math.max(height,1+visit(link.childSkillId));
  visiting.delete(skillId);heights.set(skillId,height);return height;
 };
 if(visit(input.rootSkillId)>SKILL_TRIGGER_LIMITS.maxDepth)invalid('maxDepth');
 if(heights.size!==definitions.size)invalid('unreachable definition');
 const bundle=Object.freeze({version:input.version,rootSkillId:input.rootSkillId,definitions:Object.freeze([...input.definitions]),links:Object.freeze(pinnedLinks)});
 bundles.set(bundle,{definitions,links});return bundle;
}
interface RootContext {order:number;used:number;pending:number;projectiles:number}
interface Context {
 binding:SkillTriggerBinding;root:RootContext;instanceId:string;rootInstanceId:string;parentInstanceId:string|null;
 casterId:string;skillId:string;source?:CombatEntity;target?:CombatEntity;anchor:Readonly<MapPoint>;path:readonly string[];sequence:number;occurrences:Map<string,number>;
}
interface Occurrence {trigger:SkillTrigger;atMs:number;occurrenceId:string;origin:Readonly<MapPoint>;deliveryId?:string;targetId?:string;target?:CombatEntity;effectId?:string;beforeStacks?:number;afterStacks?:number}
interface Batch {context:Context;occurrence:Occurrence;sequence:number;links:readonly SkillTriggerLink[];offense:RootOffensiveSnapshot;
 reason?:SkillTriggerResult['reason'];dimension?:SkillTriggerDimension;reserved:boolean;executionPaid?:boolean}
interface TriggerSession {
 runtime:SkillEffectRuntime;namespace:string;receiptData:WeakMap<SkillTriggerReceipt,{offense:RootOffensiveSnapshot;pin:SkillInstanceDefinition;consumed:boolean}>;contexts:Map<string,Context>;nextRoot:number;enabled:boolean;
 notifying:boolean;advancing:boolean;boundary:number;work:number;queued:number;batches:Batch[];overflow?:{batch:Batch;count:number};
 executions:{receipt:SkillTriggerReceipt;child:SkillInstanceView;batch:Batch;source:CombatEntity;target?:CombatEntity}[];
}
const sessions=new WeakMap<SkillEffectRuntime,TriggerSession>();
// Payloads are weakly held within the session and released on shutdown, even
// when a consumer keeps its now-invalid receipt metadata.
const receipts=new WeakMap<SkillTriggerReceipt,TriggerSession>();
const deliveries=new WeakMap<object,{session:TriggerSession;context:Context;offense:RootOffensiveSnapshot}>();
export function initializeSkillTriggerSession(runtime:SkillEffectRuntime,namespace:string):void {
 sessions.set(runtime,{runtime,namespace,receiptData:new WeakMap(),contexts:new Map(),nextRoot:0,enabled:false,notifying:false,advancing:false,boundary:runtime.now,work:0,queued:0,batches:[],executions:[]});
}
export function disposeSkillTriggers(runtime:SkillEffectRuntime):void {
 const s=sessions.get(runtime);if(!s)return;
 s.receiptData=new WeakMap();s.contexts.clear();s.batches=[];s.executions=[];delete s.overflow;s.queued=0;sessions.delete(runtime);
}
export function skillTriggerMutationAllowed(runtime:SkillEffectRuntime|undefined):boolean {return !runtime||!sessions.get(runtime)?.notifying;}
/** Existing emit callbacks keep their API; only opt-in sessions get the guard. */
export function observeSkillTriggerBoundary(runtime:SkillEffectRuntime,notify:()=>void):void {
 const s=sessions.get(runtime);if(!s?.enabled){notify();return;}
 const previous=s.notifying;s.notifying=true;try{notify();}finally{s.notifying=previous;}
}
export function beginSkillTriggerAdvance(runtime:SkillEffectRuntime):void {
 const s=sessions.get(runtime);if(!s?.enabled)return;
 if(s.advancing||s.notifying)throw Error('trigger_reentrancy');s.advancing=true;
}
export function endSkillTriggerAdvance(runtime:SkillEffectRuntime):void {const s=sessions.get(runtime);if(s)s.advancing=false;}
// Closed definitions are compared once at admission; property insertion order is irrelevant.
function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
 return JSON.stringify(value)??'undefined';
}
export function prepareSkillTriggers(runtime:SkillEffectRuntime|undefined,definition:SkillEngineDefinition,version:string,lifetime:number|undefined,
 anchor:Readonly<MapPoint>|undefined,binding:SkillTriggerBinding|undefined):boolean {
 if(!skillTriggerMutationAllowed(runtime))return false;
 if(!binding)return true;
 const s=runtime&&sessions.get(runtime),data=binding.bundle&&bundles.get(binding.bundle),pin=data?.definitions.get(definition.skillId);
 return !!s&&runtime!.active&&Number.isSafeInteger(s.nextRoot+1)&&!!pin&&binding.bundle.rootSkillId===definition.skillId
  &&pin.configVersion===version&&pin.lifetimeMs===lifetime&&typeof binding.observe==='function'
  &&(binding.executeChildren===undefined||typeof binding.executeChildren==='boolean')&&point(anchor)&&canonical(definition)===canonical(pin.definition);
}
export function bindRootSkillTriggers(runtime:SkillEffectRuntime,view:SkillInstanceView,anchor:Readonly<MapPoint>|undefined,binding:SkillTriggerBinding|undefined,target?:CombatEntity,source?:CombatEntity):void {
 if(!binding)return;const s=sessions.get(runtime)!;s.enabled=true;
 const context:Context={binding:Object.freeze({...binding}),root:{order:++s.nextRoot,used:0,pending:0,projectiles:0},
  instanceId:view.instanceId,rootInstanceId:view.rootInstanceId,parentInstanceId:null,casterId:view.casterId,skillId:view.skillId,
  ...(source?{source}:{}),...(target?{target}:{}),anchor:Object.freeze({...anchor!}),path:Object.freeze([view.skillId]),sequence:0,occurrences:new Map()};
 s.contexts.set(view.instanceId,context);
}
export function bindChildSkillTriggers(runtime:SkillEffectRuntime,parentId:string,view:SkillInstanceView,pin:SkillInstanceDefinition,anchor?:Readonly<MapPoint>,target?:CombatEntity):void {
 const s=sessions.get(runtime),parent=s?.contexts.get(parentId);
 if(!parent||bundles.get(parent.binding.bundle)!.definitions.get(view.skillId)!==pin)return;
 s!.contexts.set(view.instanceId,{...parent,...(target?{target}:{}),anchor:anchor??parent.anchor,instanceId:view.instanceId,parentInstanceId:parentId,skillId:view.skillId,
  path:Object.freeze([...parent.path,view.skillId]),sequence:0,occurrences:new Map()});
}
export function bindSkillTriggerDelivery(runtime:SkillEffectRuntime,delivery:object,instanceId:string,offense:RootOffensiveSnapshot|undefined):void {
 const s=sessions.get(runtime),context=s?.contexts.get(instanceId);if(s&&context&&offense)deliveries.set(delivery,{session:s,context,offense});
}
function boundary(s:TriggerSession,at:number):void {
 if(at!==s.boundary){
  if(s.batches.length||s.overflow)throw Error('Drain trigger boundary before advancing');
  s.boundary=at;s.work=0;s.queued=0;
 }
}
function intake(s:TriggerSession,c:Context,o:Occurrence,offense:RootOffensiveSnapshot):void {
 const links=(bundles.get(c.binding.bundle)!.links.get(c.skillId)??[]).filter(l=>l.trigger===o.trigger&&(o.trigger!=='OnStackThreshold'||l.stackThreshold!.effectId===o.effectId&&o.beforeStacks!<l.stackThreshold!.threshold&&o.afterStacks!>=l.stackThreshold!.threshold));if(!links.length)return;
 boundary(s,o.atMs);
 const batch:Batch={context:c,occurrence:o,sequence:++c.sequence,links,offense,reserved:false};
 const exhausted=links.some(l=>(c.occurrences.get(l.linkId)??0)>=l.maxOccurrences);
 for(const link of links)c.occurrences.set(link.linkId,Math.min(link.maxOccurrences,(c.occurrences.get(link.linkId)??0)+1));
 if(exhausted){batch.reason='budget_exceeded';batch.dimension='maxOccurrences';}
 else if(c.path.length>SKILL_TRIGGER_LIMITS.maxDepth){batch.reason='budget_exceeded';batch.dimension='maxDepth';}
 else if(links.some(l=>c.path.includes(l.childSkillId))){batch.reason='invalid_ancestry';}
 else if(links.some(l=>!Number.isFinite(o.atMs+l.delayMs))){batch.reason='invalid_time';}
 s.batches.push(batch);s.batches.sort(compare);
 // Keep at most 512 units of staged work in priority order. One aggregate
 // diagnostic represents overflow; no unbounded rejected-event history.
 // s.work includes previous drains at this timestamp, plus earlier staged work.
 let work=s.work-(s.batches.reduce((n,b)=>n+b.links.length,0)-links.length);
 s.batches=s.batches.filter(b=>{
  if(work+b.links.length<=SKILL_TRIGGER_LIMITS.maxWorkPerBoundary){work+=b.links.length;return true;}
  if(b.reserved){b.context.root.pending-=b.links.length;b.reserved=false;}
  if(s.overflow){s.overflow.count++;if(compare(b,s.overflow.batch)<0)s.overflow.batch=b;}else s.overflow={batch:b,count:1};
  return false;
 });s.work=work;
 // Recompute reservations in the same order used by drain. Rejected diagnostics
 // are bounded by the work cap; the intent queue itself never reserves >256.
 for(const b of s.batches){
  if(b.reserved){b.context.root.pending-=b.links.length;b.reserved=false;}
  if(b.dimension==='maxIntentsPerRoot'||b.dimension==='maxQueuedPerBoundary'){delete b.reason;delete b.dimension;}
 }
 s.queued=0;s.batches.sort(compare);
 for(const b of s.batches){
  if(b.reason)continue;
  if(b.context.root.used+b.context.root.pending+b.links.length>SKILL_TRIGGER_LIMITS.maxIntentsPerRoot){b.reason='budget_exceeded';b.dimension='maxIntentsPerRoot';}
  else if(s.queued+b.links.length>SKILL_TRIGGER_LIMITS.maxQueuedPerBoundary){b.reason='budget_exceeded';b.dimension='maxQueuedPerBoundary';}
  else{b.reserved=true;b.context.root.pending+=b.links.length;s.queued+=b.links.length;}
 }
}
export function captureSkillExpiry(runtime:SkillEffectRuntime,view:SkillInstanceView,at:number):void {
 const s=sessions.get(runtime),c=s?.contexts.get(view.instanceId);
 if(s&&c&&view.rootOffense)intake(s,c,{trigger:'OnExpire',atMs:at,occurrenceId:'expiry',origin:c.anchor,...(c.target&&(bundles.get(c.binding.bundle)!.links.get(c.skillId)??[]).some(l=>l.trigger==='OnExpire'&&l.requiresStacks)?{targetId:c.target.entityId,target:c.target}:{})},view.rootOffense);
}
export function captureSkillImpact(runtime:SkillEffectRuntime,delivery:object,deliveryId:string,targetId:string,origin:Readonly<MapPoint>,target?:CombatEntity):void {
 const s=sessions.get(runtime),d=deliveries.get(delivery);
 if(s&&d?.session===s)intake(s,d.context,{trigger:'OnImpact',atMs:runtime.now,occurrenceId:JSON.stringify([deliveryId,targetId]),origin:Object.freeze({...origin}),deliveryId,targetId,...(target?{target}:{})},d.offense);
}
/** Avoid adding adapter reads to legacy or unrelated opt-in paths. */
export function observesSkillConditionalHit(runtime:SkillEffectRuntime,delivery:object):boolean {
 const s=sessions.get(runtime),d=deliveries.get(delivery);
 return !!s&&d?.session===s&&(bundles.get(d.context.binding.bundle)!.links.get(d.context.skillId)??[]).some(l=>l.trigger==='OnHit'||l.trigger==='OnKill');
}
export function observesSkillStackApply(runtime:SkillEffectRuntime,instanceId:string):boolean {
 const c=sessions.get(runtime)?.contexts.get(instanceId);
 return !!c&&(bundles.get(c.binding.bundle)!.links.get(c.skillId)??[]).some(l=>l.trigger==='OnStackThreshold');
}
/** Only canonical delivery resolution calls this, before external notifications. */
export function captureSkillHit(runtime:SkillEffectRuntime,delivery:object,deliveryId:string,target:CombatEntity,origin:Readonly<MapPoint>,killed:boolean):void {
 const s=sessions.get(runtime),d=deliveries.get(delivery);
 if(!s||d?.session!==s||!point(origin))return;
 const occurrence={atMs:runtime.now,occurrenceId:JSON.stringify([deliveryId,target.entityId]),origin:Object.freeze({...origin}),deliveryId,targetId:target.entityId,target};
 intake(s,d.context,{...occurrence,trigger:'OnHit'},d.offense);
 if(killed)intake(s,d.context,{...occurrence,trigger:'OnKill'},d.offense);
}
/** Reads are immediate around accepted canonical Skill Apply, never polling. */
export function skillStackCount(runtime:SkillEffectRuntime,source:string,target:string,effectId:string):number {
 return runtime.effects.groups(target).find(g=>g.sourceEntityId===source&&g.effectId===effectId&&g.stackingPolicy==='stack'&&g.remainingDurationMs>0)?.currentStacks??0;
}
export function captureSkillStackApply(runtime:SkillEffectRuntime,instanceId:string,offense:RootOffensiveSnapshot|undefined,target:CombatEntity,effectId:string,beforeStacks:number,afterStacks:number,applicationId:string,origin:Readonly<MapPoint>):void {
 const s=sessions.get(runtime),c=s?.contexts.get(instanceId);
 if(s&&c&&offense&&point(origin))intake(s,c,{trigger:'OnStackThreshold',atMs:runtime.now,occurrenceId:applicationId,origin:Object.freeze({...origin}),targetId:target.entityId,target,effectId,beforeStacks,afterStacks},offense);
}
const phase=(b:Batch)=>b.occurrence.trigger==='OnExpire'?0:1;
function compare(a:Batch,b:Batch):number {
 return a.occurrence.atMs-b.occurrence.atMs||phase(a)-phase(b)||a.context.root.order-b.context.root.order||a.sequence-b.sequence
  ||(a.context.instanceId<b.context.instanceId?-1:a.context.instanceId>b.context.instanceId?1:0)
  ||(a.occurrence.occurrenceId<b.occurrence.occurrenceId?-1:a.occurrence.occurrenceId>b.occurrence.occurrenceId?1:0);
}
function result(batch:Batch,reason:NonNullable<SkillTriggerResult['reason']>,dimension?:SkillTriggerDimension,count?:number):SkillTriggerResult {
 return Object.freeze({status:'rejected',atMs:batch.occurrence.atMs,instanceId:batch.context.instanceId,rootInstanceId:batch.context.rootInstanceId,
  linkIds:Object.freeze(batch.links.map(l=>l.linkId)),reason,...(dimension?{dimension}:{}),...(count===undefined?{}:{rejectedBatches:count})});
}
/** Runs at the end of existing gameplay boundary, never recursively from contact. */
export interface TriggerChildDispatcher {
 admit(receipts:readonly SkillTriggerReceipt[],beforeCommit?:()=>boolean):{children:readonly SkillInstanceView[]}|{reason:NonNullable<SkillTriggerResult['reason']>;dimension?:SkillTriggerDimension};
 execute(child:SkillInstanceView,receipt:SkillTriggerReceipt):boolean;
 cancel(child:SkillInstanceView):void;
 consumed(events:readonly EffectLifecycleEvent[]):void;
}
export function drainSkillTriggers(runtime:SkillEffectRuntime,combat:CombatValidationContext,children?:TriggerChildDispatcher):void {
 const s=sessions.get(runtime);if(!s?.enabled)return;
 boundary(s,runtime.now);
 const batches=s.batches;s.batches=[];
 for(const b of batches)if(b.reserved)b.context.root.pending-=b.links.length;
 const overflow=s.overflow;delete s.overflow;s.queued=0;
 if(overflow){overflow.batch.reason='budget_exceeded';overflow.batch.dimension='maxWorkPerBoundary';batches.push(overflow.batch);}
 batches.sort(compare);
 for(const b of batches){
  if(!runtime.active||sessions.get(runtime)!==s)break;
  let filteredResult:SkillTriggerResult|undefined;
  const notify=(r:SkillTriggerResult)=>{
   if(filteredResult){const filtered=filteredResult;filteredResult=undefined;observeSkillTriggerBoundary(runtime,()=>b.context.binding.observe(filtered));}
   if(runtime.active&&sessions.get(runtime)===s)observeSkillTriggerBoundary(runtime,()=>b.context.binding.observe(r));
  };
  if(b.reason){notify(result(b,b.reason,b.dimension,b===overflow?.batch?overflow.count:undefined));continue;}
  const conditional=b.occurrence.trigger!=='OnImpact'&&b.occurrence.trigger!=='OnExpire'||b.links.some(l=>l.requiresStacks);
  if(!combat.findEntity(b.context.casterId)||conditional&&b.context.source&&combat.findEntity(b.context.casterId)!==b.context.source){notify(result(b,'entity_not_found'));continue;}
  if(b.context.binding.executeChildren&&s.executions.length+b.links.length>SKILL_TRIGGER_LIMITS.maxQueuedPerBoundary){notify(result(b,'budget_exceeded','maxQueuedPerBoundary'));continue;}
  const o=b.occurrence,source=combat.findEntity(b.context.casterId)!;
  if(conditional&&o.target&&combat.findEntity(o.target.entityId)!==o.target){notify(result(b,'invalid_child_target'));continue;}
  let consumePlan:EffectStackConsumePlan|undefined;
  const selected=b.links.filter(link=>{
   if(!link.requiresStacks)return true;
   const p=link.requiresStacks;
   return !!o.targetId&&!!o.target&&validateCombatHit({casterId:source.entityId,targetId:o.targetId,allowedRelations:bundles.get(b.context.binding.bundle)!.definitions.get(b.context.skillId)!.definition.allowedTargetRelations,requiresLivingTarget:true},combat).allowed
    &&skillStackCount(runtime,source.entityId,o.targetId,p.effectId)>=p.minStacks;
  });
  if(selected.length!==b.links.length)filteredResult=result({...b,links:b.links.filter(l=>!selected.includes(l))},'condition_not_met');
  b.links=selected;if(!selected.length){const filtered=filteredResult!;filteredResult=undefined;notify(filtered);continue;}
  const consuming=selected.find(l=>l.consumeExactly!==undefined);
  if(consuming){
   if(!b.context.binding.executeChildren||!children){notify(result(b,'stack_consume_failed'));continue;}
   if(s.work+b.links.length+1>SKILL_TRIGGER_LIMITS.maxWorkPerBoundary){notify(result(b,'budget_exceeded','maxWorkPerBoundary'));continue;}
   const prepared=runtime.effects.prepareConsumeStacks({effectId:consuming.requiresStacks!.effectId,sourceEntityId:source.entityId,targetEntityId:o.targetId!,requiredStacks:consuming.consumeExactly!,allowedTargetRelations:bundles.get(b.context.binding.bundle)!.definitions.get(b.context.skillId)!.definition.allowedTargetRelations},{now:runtime.now,combat});
   if(!prepared.success){notify(result(b,'stack_consume_failed'));continue;}consumePlan=prepared.plan;
  }
  // Commit the complete batch before observing it; nested mode registers real pending children.
  const accepted=b.links.map(link=>{
   const o=b.occurrence,c=b.context;
   const receipt:SkillTriggerReceipt=Object.freeze({receiptId:JSON.stringify([c.instanceId,o.trigger,o.occurrenceId,link.linkId,o.atMs]),
    sessionNamespace:s.namespace,rootInstanceId:c.rootInstanceId,instanceId:c.instanceId,parentInstanceId:c.parentInstanceId,sourceEntityId:c.casterId,
    trigger:o.trigger,occurrenceId:o.occurrenceId,atMs:o.atMs,executeAtMs:o.atMs+link.delayMs,linkId:link.linkId,childSkillId:link.childSkillId,
    depth:c.path.length,origin:o.origin,...(o.deliveryId===undefined?{}:{deliveryId:o.deliveryId}),...(o.targetId===undefined?{}:{targetId:o.targetId}),...(o.beforeStacks===undefined?{}:{beforeStacks:o.beforeStacks,afterStacks:o.afterStacks!})});
   receipts.set(receipt,s);s.receiptData.set(receipt,{offense:b.offense,pin:bundles.get(c.binding.bundle)!.definitions.get(link.childSkillId)!,consumed:false});
   return Object.freeze({status:'accepted' as const,atMs:o.atMs,instanceId:c.instanceId,rootInstanceId:c.rootInstanceId,linkIds:Object.freeze([link.linkId]),receipt});
  });
  let consumedEvents:readonly EffectLifecycleEvent[]=[];
  if(b.context.binding.executeChildren){
   const admission=children?.admit(accepted.map(r=>r.receipt),consumePlan?()=>{
    const consumed=runtime.effects.consumeStacks(consumePlan!,{now:runtime.now,combat});
    if(!consumed.success)return false;consumedEvents=consumed.events;return true;
   }:undefined);
   if(!admission||!('children' in admission)){
    for(const r of accepted){s.receiptData.delete(r.receipt);receipts.delete(r.receipt);}
    notify(result(b,admission?.reason??'invalid_ancestry',admission?.dimension));continue;
   }
   if(consumePlan){s.work+=b.links.length+1;b.executionPaid=true;}
   accepted.forEach((r,i)=>{
    s.receiptData.get(r.receipt)!.consumed=true;
    const child=admission.children[i]!,source=combat.findEntity(child.casterId)!;
    const target=child.definition!.targetMode==='entity'&&r.receipt.targetId?combat.findEntity(r.receipt.targetId):undefined;
    s.executions.push({receipt:r.receipt,child,batch:b,source,...(target?{target}:{})});
   });
  }
  if(consumedEvents.length)children!.consumed(consumedEvents);
  b.context.root.used+=b.links.length;
  for(const r of accepted){if(!runtime.active||sessions.get(runtime)!==s)break;notify(r);}
 }
 if(!children)return;
 s.executions.sort((a,b)=>a.receipt.executeAtMs-b.receipt.executeAtMs||compare(a.batch,b.batch)||a.batch.links.findIndex(l=>l.linkId===a.receipt.linkId)-b.batch.links.findIndex(l=>l.linkId===b.receipt.linkId));
 const due=s.executions.filter(e=>e.receipt.executeAtMs<=runtime.now);s.executions=s.executions.filter(e=>e.receipt.executeAtMs>runtime.now);
 const admitted=new Set<Batch>(),rejected=new Set<Batch>();
 for(const e of due){
  if(!runtime.active||sessions.get(runtime)!==s)break;
  if(!admitted.has(e.batch)&&!rejected.has(e.batch)){
   const cost=e.batch.executionPaid?0:due.filter(n=>n.batch===e.batch).length;
   if(s.work+cost>SKILL_TRIGGER_LIMITS.maxWorkPerBoundary){
    rejected.add(e.batch);
    for(const n of due)if(n.batch===e.batch)children.cancel(n.child);
    observeSkillTriggerBoundary(runtime,()=>e.batch.context.binding.observe(result(e.batch,'budget_exceeded','maxWorkPerBoundary')));
   }else{s.work+=cost;admitted.add(e.batch);}
  }
  if(rejected.has(e.batch))continue;
  if(combat.findEntity(e.child.casterId)!==e.source||e.target&&combat.findEntity(e.target.entityId)!==e.target){
   children.cancel(e.child);
   observeSkillTriggerBoundary(runtime,()=>e.batch.context.binding.observe(Object.freeze({...result(e.batch,combat.findEntity(e.child.casterId)!==e.source?'entity_not_found':'invalid_child_target'),atMs:runtime.now})));continue;
  }
  children.execute(e.child,e.receipt);
 }
}
/** Delays share the trigger session and existing effect-loop clock. */
export function nextSkillTriggerExecution(runtime:SkillEffectRuntime):number {
 const s=sessions.get(runtime);if(s?.batches.length||s?.overflow)return runtime.now;return s?.executions.reduce((at,e)=>Math.min(at,e.receipt.executeAtMs),Infinity)??Infinity;
}
/** Internal capability lookup. Consumed receipts cannot register another child. */
export function pendingSkillTriggerPayload(runtime:SkillEffectRuntime,receipt:SkillTriggerReceipt){
 const s=sessions.get(runtime),data=s?.receiptData.get(receipt);
 return runtime.active&&receipts.get(receipt)===s&&data&&!data.consumed?data:undefined;
}
export function skillCompositionEnabled(runtime:SkillEffectRuntime,instanceId:string):boolean {
 return sessions.get(runtime)?.contexts.get(instanceId)?.binding.executeChildren===true;
}
/** Count only traversable bullets in a whole actual emission, never future bursts. */
export function admitSkillProjectiles(runtime:SkillEffectRuntime,instanceId:string,count:number):boolean {
 const s=sessions.get(runtime),c=s?.contexts.get(instanceId);if(!s||!c?.binding.executeChildren)return true;
 boundary(s,runtime.now);
 const dimension=c.root.projectiles+count>256?'maxProjectilesPerRoot':s.work+count>SKILL_TRIGGER_LIMITS.maxWorkPerBoundary?'maxWorkPerBoundary':undefined;
 if(dimension){
  observeSkillTriggerBoundary(runtime,()=>c.binding.observe(Object.freeze({status:'rejected',atMs:runtime.now,instanceId,rootInstanceId:c.rootInstanceId,linkIds:Object.freeze([]),reason:'budget_exceeded',dimension})));
  return false;
 }
 return true;
}
export function recordSkillProjectile(runtime:SkillEffectRuntime,instanceId:string):void {
 const s=sessions.get(runtime),c=s?.contexts.get(instanceId);
 if(s&&c?.binding.executeChildren){c.root.projectiles++;s.work++;}
}
/** Stack operations reuse the session boundary budget; no independent counter. */
export function skillEffectWork(runtime:SkillEffectRuntime,commit=false):boolean {
 const s=sessions.get(runtime);if(!s||!runtime.active)return false;
 boundary(s,runtime.now);
 if(s.work>=SKILL_TRIGGER_LIMITS.maxWorkPerBoundary)return false;
 if(commit)s.work++;
 return true;
}
/** Validation/replay is read-only: no requeue, observer call, RNG or resource work. */
export function validateSkillTriggerReceipt(runtime:SkillEffectRuntime,receipt:SkillTriggerReceipt):SkillTriggerReceiptResult {
 const s=sessions.get(runtime);if(!s||!runtime.active)return {success:false,reason:'invalid_session'};
 return receipts.get(receipt)===s?{success:true,changed:false}:{success:false,reason:'invalid_receipt'};
}
