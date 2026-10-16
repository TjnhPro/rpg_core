import {prepareSkillTriggers,bindRootSkillTriggers,type SkillTriggerBinding} from './skill-trigger.js';
import {prepareRootSkillInstance,bindRootSkillInstance,rootSkillInstance,validateRootInstanceTime,activateRootSkillInstance,cancelRootSkillInstance} from './skill-instance.js';
import {activateRootOffense,prepareRootOffense,bindRootOffense,type SkillRootOffenseCapture,type RootOffensiveSnapshot} from './root-offense.js';
import {skillActionAdmission,skillAvailability,startSkillAction,defineSkill,type SkillEngineDefinition,type SkillExecutionContext,type SkillCooldownState,type SkillResult,type SkillAvailability} from './skill-engine.js';
import {completeCombatAction,cancelCombatAction,reconcileCombatRestrictions,type CombatActionSlot,type EntityCombatEvent,type CombatValidationContext,type ActiveCombatAction} from '../combat/combat-state.js';
import {distance,inRange} from '../spatial/range.js';
import type {MapPoint,Walkability} from '../spatial/grid-geometry.js';
import type {CombatEntity} from '../combat/combat-entity.js';

/** Trusted game adapter, not request-body stats or player-only state. */
export interface SkillExecutionEnvironment {
 readonly rootOffense?:SkillRootOffenseCapture;
 readonly triggers?:SkillTriggerBinding;
 /** Explicit gameplay lifetime from activation; requires opt-in instance session. */
 readonly skillInstanceLifetimeMs?:number;
 readonly grid:Walkability;
 position(entityId:string):Readonly<MapPoint>|undefined;
 resolveStats(entity:CombatEntity):{attackSpeed:number;cooldownReduction:number};
 facing?(entityId:string):Readonly<MapPoint>|undefined;
}
export interface SkillExecutionSnapshot {
 readonly rootOffense?:RootOffensiveSnapshot;
 readonly actionInstanceId:string;
 readonly casterId:string;
 readonly skillId:string;
 readonly configVersion:string;
 readonly definition:SkillEngineDefinition;
 readonly target:TargetContextSnapshot;
 readonly startedAt:number;
 readonly durationMs:number;
 readonly activationTime:number;
 readonly casterPosition?:Readonly<MapPoint>;
 readonly aimPosition?:Readonly<MapPoint>;
 readonly facing?:Readonly<MapPoint>;
}
type TargetContextSnapshot=Readonly<SkillExecutionContext['target']>;
/** Metadata attached to the existing actor slot; activeAction remains the only
 * Acting/Idle truth. Caller advances using its existing simulation clock. */
export interface SkillExecutionSlot extends CombatActionSlot {
 skillExecution?:{readonly snapshot:Readonly<SkillExecutionSnapshot>;activated:boolean};
}
export interface SkillActivatedEvent {
 type:'skill-activated';status:'activated';atMs:number;
 actionInstanceId:string;skillId:string;casterId:string;
 target:TargetContextSnapshot;snapshot:Readonly<SkillExecutionSnapshot>;
}
export type SkillExecutionEvent=EntityCombatEvent|SkillActivatedEvent;
export type SkillExecutionResult=Extract<SkillResult,{success:false}>|{success:true;action:Readonly<ActiveCombatAction>;events:readonly SkillExecutionEvent[]};
// Private admission identities for opt-in Healing/Lifesteal; no entity/resource registry.
const healingEntities=new WeakMap<SkillExecutionSnapshot|RootOffensiveSnapshot,{source:CombatEntity;target:CombatEntity|undefined}>();
export function skillHealingEntities(snapshot:SkillExecutionSnapshot|RootOffensiveSnapshot){return healingEntities.get(snapshot);}
const pointValid=(p:Readonly<MapPoint>|undefined):p is Readonly<MapPoint>=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

export function skillRangeAvailability(definition:SkillEngineDefinition,context:SkillExecutionContext,env:SkillExecutionEnvironment):SkillAvailability {
 if(context.target.mode==='self')return {available:true};
 const source=env.position(context.casterId),target=context.target.mode==='ground'?context.target.position:env.position(context.target.targetId);
 if(!pointValid(source)||!pointValid(target))return {available:false,reason:'invalid_target_position'};
 if(distance(source,target)>definition.castRange)return {available:false,reason:'out_of_range'};
 return inRange(env.grid,source,target,definition.castRange)?{available:true}:{available:false,reason:'blocked'};
}

/** Full read-only preflight for game/AI callers, without selecting or approaching. */
export function skillExecutionAvailability(definition:SkillEngineDefinition,context:SkillExecutionContext,slot:SkillExecutionSlot,cooldowns:SkillCooldownState,env:SkillExecutionEnvironment,now:number):SkillAvailability {
 const admission=skillActionAdmission(definition,context,slot);if(!admission.available)return admission;
 if(!Number.isFinite(now)||now<0)return {available:false,reason:'invalid_context'};
 const range=skillRangeAvailability(definition,context,env);if(!range.available)return range;
 return skillAvailability(definition,context,slot,cooldowns,now);
}

/** Admission/start only. No target selection, movement or gameplay dispatch. */
export function executeSkill(definition:SkillEngineDefinition,context:SkillExecutionContext,slot:SkillExecutionSlot,cooldowns:SkillCooldownState,
 env:SkillExecutionEnvironment,request:{now:number;expectedSerial:number;configVersion:string},out?:SkillExecutionEvent[]):SkillExecutionResult {
 const admission=skillExecutionAvailability(definition,context,slot,cooldowns,env,request.now);
 if(!admission.available)return {success:false,reason:admission.reason,...(admission.remainingCooldownMs!==undefined?{remainingCooldownMs:admission.remainingCooldownMs}:{})};
 if(!Number.isFinite(request.now)||request.now<0||typeof request.configVersion!=='string'||!request.configVersion.trim())return {success:false,reason:'invalid_context'};
 const rates=env.resolveStats(context.combat.findEntity(context.casterId)!);
 const duration=definition.baseActionDurationMs/rates.attackSpeed,offset=duration*(definition.activationPercent/100);
 if(!Number.isFinite(rates.attackSpeed)||rates.attackSpeed<=0||!Number.isFinite(duration)||duration<=0||!Number.isFinite(request.now+duration)
  ||!Number.isFinite(rates.cooldownReduction)||rates.cooldownReduction<0||rates.cooldownReduction>1)return {success:false,reason:'invalid_context'};
 // Prepare detached copies before mutating action/resources; definitions/config
 // and ground coordinates cannot change an already accepted action.
 const pinned=defineSkill(definition);if(!pinned.success)return pinned;
 const casterPosition=env.position(context.casterId),aimPosition=context.target.mode==='ground'?context.target.position:env.position(context.target.mode==='self'?context.casterId:context.target.targetId);
 const spatial=definition.effects?.some(e=>e.type!=='direct_hit'&&e.type!=='modifier_effect'&&e.type!=='heal');
 if(spatial&&(!pointValid(casterPosition)||!pointValid(aimPosition)))return {success:false,reason:'invalid_target_position'};
 const facing=env.facing?.(context.casterId)??(pointValid(casterPosition)&&pointValid(aimPosition)?{x:aimPosition.x-casterPosition.x,y:aimPosition.y-casterPosition.y}:{x:1,y:0});
 if(spatial&&!pointValid(facing))return {success:false,reason:'invalid_target_position'};
 const length=Math.hypot(facing.x,facing.y)||1;
 const target=context.target.mode==='ground'?Object.freeze({...context.target,position:Object.freeze({...context.target.position})}):Object.freeze({...context.target});
 if(!prepareRootSkillInstance(env.rootOffense?.runtime,`${context.casterId}#${request.expectedSerial}`,request.now,request.now+offset,env.skillInstanceLifetimeMs))return {success:false,reason:'invalid_context'};
 if(!prepareSkillTriggers(env.rootOffense?.runtime,pinned.definition,request.configVersion,env.skillInstanceLifetimeMs,aimPosition??casterPosition,env.triggers))return {success:false,reason:'invalid_context'};
 let rootOffense:RootOffensiveSnapshot|undefined;
 if(env.rootOffense){
  // Reject stale admission before calling the trusted offense adapter.
  if(!Number.isSafeInteger(request.expectedSerial)||request.expectedSerial!==(slot.actionSerial??0)+1)return {success:false,reason:'stale_action'};
  try {rootOffense=prepareRootOffense(env.rootOffense,context.combat.findEntity(context.casterId)!,request.configVersion,request.now,request.expectedSerial);}
  catch {return {success:false,reason:'invalid_context',errors:['invalid_root_offense']};}
 }
 const events:EntityCombatEvent[]=[];
 const result=startSkillAction(pinned.definition,context,slot,cooldowns,{now:request.now,expectedSerial:request.expectedSerial,speedMultiplier:rates.attackSpeed,effectiveCdr:rates.cooldownReduction,activationDelayMs:offset},events);
 if(!result.success)return result;
 const action=slot.activeAction!;
 slot.skillExecution={snapshot:Object.freeze({...(rootOffense?{rootOffense}:{}),actionInstanceId:action.actionInstanceId,casterId:context.casterId,skillId:definition.skillId,configVersion:request.configVersion,definition:pinned.definition,target,startedAt:action.startedAt,durationMs:action.durationMs,activationTime:action.startedAt+offset,
  ...(spatial?{casterPosition:Object.freeze({...casterPosition!}),aimPosition:Object.freeze({...aimPosition!}),facing:Object.freeze(length===1&&facing.x===0&&facing.y===0?{x:1,y:0}:{x:facing.x/length,y:facing.y/length})}:{})}),activated:false};
 if(pinned.definition.effects?.some(e=>e.type==='heal'||'lifesteal' in e)||env.triggers?.bundle.definitions.some(p=>p.definition.effects?.some(e=>'lifesteal' in e))){
  const identities={source:context.combat.findEntity(context.casterId)!,target:target.mode==='entity'?context.combat.findEntity(target.targetId):target.mode==='self'?context.combat.findEntity(context.casterId):undefined};
  healingEntities.set(slot.skillExecution.snapshot,identities);
  if(rootOffense)healingEntities.set(rootOffense,identities);
 }
 if(rootOffense){bindRootOffense(env.rootOffense!.runtime,slot.skillExecution.snapshot);bindRootSkillInstance(env.rootOffense!.runtime,slot.skillExecution.snapshot,env.skillInstanceLifetimeMs);
  bindRootSkillTriggers(env.rootOffense!.runtime,rootSkillInstance(env.rootOffense!.runtime,slot.skillExecution.snapshot)!,aimPosition??casterPosition,env.triggers,context.target.mode==='entity'?context.combat.findEntity(context.target.targetId):context.target.mode==='self'?context.combat.findEntity(context.casterId):undefined,context.combat.findEntity(context.casterId));}
 const emitted:SkillExecutionEvent[]=[...events];
 // Zero-percent activation is part of successful start, after MP/deadline commit.
 advanceSkillExecution(slot,context.combat,request.now,emitted);
 out?.push(...emitted);
 return {success:true,action:{...action},events:emitted};
}

export function cancelSkillExecution(slot:SkillExecutionSlot,now:number,reason:Extract<EntityCombatEvent,{type:'action-cancelled'}>['reason'],out?:SkillExecutionEvent[]):boolean {
 validateRootInstanceTime(slot.skillExecution?.snapshot,now);
 const events:EntityCombatEvent[]=[];const cancelled=cancelCombatAction(slot,now,reason,events);
 if(cancelled)cancelRootSkillInstance(slot.skillExecution?.snapshot,now,reason);
 delete slot.skillExecution;out?.push(...events);return cancelled;
}
/** Trusted Apply event consumer calls this at the Apply timestamp. The Effect
 * layer never imports Skill/actions. Already-dispatched deliveries are untouched. */
export function reconcileSkillRestrictions(slot:SkillExecutionSlot,combat:CombatValidationContext,now:number,out?:SkillExecutionEvent[]):boolean {
 const events:EntityCombatEvent[]=[];
 validateRootInstanceTime(slot.skillExecution?.snapshot,now);
 const cancelled=reconcileCombatRestrictions(slot,combat,now,events);
 if(cancelled)cancelRootSkillInstance(slot.skillExecution?.snapshot,now,events.find(e=>e.type==='action-cancelled')?.reason??'restriction');
 if(!slot.activeAction){cancelRootSkillInstance(slot.skillExecution?.snapshot,now,'action_lost');delete slot.skillExecution;}
 out?.push(...events);return cancelled;
}
/** One tick hook, not a scheduler/clock/state machine. Terminal helpers are v0.7.
 * Activation has the exact due timestamp even when caller crosses it in a larger
 * tick; same epsilon as Combat State completion, activation precedes completion.
 * Caller resolves defeat before this hook; no inferred historical hit or retarget. */
export function advanceSkillExecution(slot:SkillExecutionSlot,combat:CombatValidationContext,now:number,out?:SkillExecutionEvent[]):void {
 if(!Number.isFinite(now)||now<0)throw Error('Invalid simulation time');
 if(reconcileSkillRestrictions(slot,combat,now,out))return;
 const execution=slot.skillExecution,action=slot.activeAction;
 if(!execution)return;
 if(!action||action.actionInstanceId!==execution.snapshot.actionInstanceId){cancelRootSkillInstance(execution.snapshot,now,'action_lost');delete slot.skillExecution;return;}
 const caster=combat.findEntity(execution.snapshot.casterId);
 if(!caster||caster.currentHp<=0){cancelSkillExecution(slot,now,caster?'defeated':'session_end',out);return;}
 const s=execution.snapshot;
 if(!execution.activated&&now+1e-6>=s.activationTime){
  execution.activated=true;activateRootOffense(s);activateRootSkillInstance(s);
  out?.push({type:'skill-activated',status:'activated',atMs:s.activationTime,actionInstanceId:s.actionInstanceId,skillId:s.skillId,casterId:s.casterId,target:s.target,snapshot:s});
 }
 const events:EntityCombatEvent[]=[];
 if(completeCombatAction(slot,now,events))delete slot.skillExecution;
 out?.push(...events);
}
