import {validateTargetContext,validAllowedRelations,validateCombatAction,startCombatAction} from '../combat/combat-state.js';
import {cooldownDurationMs} from '../stats/stat-calculation.js';
import type {CombatEntity} from '../combat/combat-entity.js';
import type {TargetContext,FactionRelation,CombatValidationContext,CombatRejection,ActiveCombatAction,EntityCombatEvent,CombatActionSlot,ActionClassification} from '../combat/combat-state.js';
import {validateSkillEffects,freezeGameplayData,type SkillGameplayEffect} from './skill-effects.js';

/** Definition identity, independent of caster, class, progression and art IDs. */
export type SkillIdentity=string;
export interface SkillEngineDefinition {
 readonly skillId:SkillIdentity;
 readonly targetMode:TargetContext['mode'];
 readonly allowedTargetRelations:readonly FactionRelation[];
 readonly baseActionDurationMs:number;
 readonly mpCost:number;
 readonly cooldownMs:number;
 readonly castRange:number;
 readonly activationPercent:number;
 readonly effects?:readonly SkillGameplayEffect[];
 readonly classification?:ActionClassification;
}
/** Caller supplies trusted Combat Core lookup; no copied stats/resources. */
export interface SkillExecutionContext {
 readonly skillId:SkillIdentity;
 readonly casterId:CombatEntity['entityId'];
 readonly target:TargetContext;
 readonly combat:CombatValidationContext;
}
export type SkillRejection='invalid_definition'|'invalid_context'|'skill_mismatch'|'skill_on_cooldown'|'insufficient_mp'|'stale_action'|'out_of_range'|'blocked'|CombatRejection;
export type SkillResult=
 | {success:false;reason:SkillRejection;errors?:readonly string[];remainingCooldownMs?:number}
 | {success:true;action?:Readonly<ActiveCombatAction>;events?:readonly EntityCombatEvent[]};

const fields=['skillId','targetMode','allowedTargetRelations','baseActionDurationMs','mpCost','cooldownMs','castRange','activationPercent','effects','classification'];
const validId=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.trim()===id;
/** Closed foundation schema: presentation/execution extensions are not accepted. */
export function validateSkillDefinition(value:unknown):string[]{
 if(!value||typeof value!=='object'||Array.isArray(value))return ['skill: object required'];
 const d=value as Record<string,unknown>,errors:string[]=[];
 if(Object.keys(d).some(key=>!fields.includes(key)))errors.push('skill: unknown fields');
 if(Object.hasOwn(d,'classification')&&d.classification!=='basic'&&d.classification!=='active')errors.push('classification: basic/active required');
 if(!validId(d.skillId))errors.push('skillId: nonempty trimmed string required');
 if(typeof d.targetMode!=='string'||!['self','entity','ground'].includes(d.targetMode))errors.push('targetMode: self/entity/ground required');
 if(!validAllowedRelations(d.allowedTargetRelations))errors.push('allowedTargetRelations: unique nonempty Combat relations required');
 if(typeof d.baseActionDurationMs!=='number'||!Number.isFinite(d.baseActionDurationMs)||d.baseActionDurationMs<=0)
  errors.push('baseActionDurationMs: finite positive duration required');
 for(const key of ['mpCost','cooldownMs','castRange','activationPercent'])if(typeof d[key]!=='number'||!Number.isFinite(d[key])||Number(d[key])<0)errors.push(key+': finite nonnegative number required');
 if(Number(d.activationPercent)>100)errors.push('activationPercent: maximum 100');
 if(Object.hasOwn(d,'effects'))errors.push(...validateSkillEffects(d.effects));
 return errors;
}

/** Session-owned deadlines, not another resource store or wall-clock manager.
 * Adapters persist/restore this alongside the existing simulation action serial. */
export interface SkillCooldownState {
 readyAt:Map<string,Map<SkillIdentity,number>>;
 replacementRevisions:Map<string,number>;
}
export function createSkillCooldownState():SkillCooldownState{return {readyAt:new Map(),replacementRevisions:new Map()};}
export function remainingSkillCooldown(state:SkillCooldownState,entityId:string,skillId:string,now:number):number {
 if(!Number.isFinite(now)||now<0)throw Error('Invalid simulation time');
 return Math.max(0,(state.readyAt.get(entityId)?.get(skillId)??0)-now);
}
function setDeadline(state:SkillCooldownState,entityId:string,skillId:string,readyAt:number):void {
 let deadlines=state.readyAt.get(entityId);if(!deadlines){deadlines=new Map();state.readyAt.set(entityId,deadlines);}
 deadlines.set(skillId,readyAt);
}
export type SkillAvailability={available:true}|{available:false;reason:SkillRejection;remainingCooldownMs?:number};
export function skillActionAdmission(definition:SkillEngineDefinition,context:SkillExecutionContext,slot:CombatActionSlot):SkillAvailability {
 const refs=validateSkillContext(definition,context);if(!refs.success)return {available:false,reason:refs.reason};
 const admission=validateCombatAction({actorId:context.casterId,classification:definition.classification??'active',actionState:slot.activeAction?'acting':'idle',target:context.target,allowedRelations:definition.allowedTargetRelations,requiresLivingTarget:true},context.combat);
 return admission.allowed?{available:true}:{available:false,reason:admission.reason};
}
/** Read-only admission; callers retain their existing auto-selection policy. */
export function skillAvailability(definition:SkillEngineDefinition,context:SkillExecutionContext,slot:CombatActionSlot,state:SkillCooldownState,now:number):SkillAvailability {
 const admission=skillActionAdmission(definition,context,slot);if(!admission.available)return admission;
 if(!Number.isFinite(now)||now<0)return {available:false,reason:'invalid_context'};
 const remaining=remainingSkillCooldown(state,context.casterId,definition.skillId,now);
 if(remaining>0)return {available:false,reason:'skill_on_cooldown',remainingCooldownMs:remaining};
 const mp=context.combat.findEntity(context.casterId)!.currentMp;
 if(!Number.isFinite(mp)||mp<0)return {available:false,reason:'invalid_context'};
 return mp<definition.mpCost?{available:false,reason:'insufficient_mp'}:{available:true};
}
/** Minimal ActionStarted integration, NOT effect/damage/selection execution.
 * expectedSerial is the trusted next action serial, retained on completion/cancel;
 * retrying that admission cannot spend twice even for zero cooldown/cost.
 * Lookup must return the live CombatEntity resource view; game adapters write its
 * currentMp back to their existing resource field, never a second MP ledger. */
export function startSkillAction(definition:SkillEngineDefinition,context:SkillExecutionContext,slot:CombatActionSlot,state:SkillCooldownState,
 timing:{now:number;expectedSerial:number;speedMultiplier:number;effectiveCdr:number;activationDelayMs?:number},out?:EntityCombatEvent[]):SkillResult {
 const available=skillAvailability(definition,context,slot,state,timing.now);
 if(!available.available)return {success:false,reason:available.reason,...(available.remainingCooldownMs!==undefined?{remainingCooldownMs:available.remainingCooldownMs}:{})};
 if(!Number.isSafeInteger(timing.expectedSerial)||timing.expectedSerial!==(slot.actionSerial??0)+1)return {success:false,reason:'stale_action'};
 const duration=cooldownDurationMs(definition.cooldownMs,timing.effectiveCdr),deadline=timing.now+duration;
 if(!Number.isFinite(deadline))return {success:false,reason:'invalid_context'};
 const entity=context.combat.findEntity(context.casterId)!;
 const events:EntityCombatEvent[]=[];
 const started=startCombatAction(slot,{actorId:context.casterId,classification:definition.classification??'active',target:context.target,allowedRelations:definition.allowedTargetRelations,requiresLivingTarget:true},context.combat,definition.skillId,timing.now,definition.baseActionDurationMs,timing.speedMultiplier,events,undefined,timing.activationDelayMs??0);
 if(!started.allowed)return {success:false,reason:started.reason};
 entity.currentMp-=definition.mpCost;
 setDeadline(state,context.casterId,definition.skillId,deadline);
 out?.push(...events);
 return {success:true,action:{...slot.activeAction!},events};
}
export interface AcceptedSkillReplacement {outgoingSkillId:string|null;incomingSkillId:string|null}
/** One accepted revision per entity. Snapshot all inputs before writing; equipment
 * changes send an empty list. No active action/delivery/resource access here. */
export function inheritSkillCooldowns(state:SkillCooldownState,entityId:string,revision:number,now:number,replacements:readonly AcceptedSkillReplacement[]):boolean {
 if(!validId(entityId)||!Number.isSafeInteger(revision)||revision<0||!Number.isFinite(now)||now<0||replacements.some(r=>[r.outgoingSkillId,r.incomingSkillId].some(id=>id!==null&&!validId(id))))throw Error('Invalid accepted replacement');
 if(revision<=(state.replacementRevisions.get(entityId)??-1))return false;
 const before=state.readyAt.get(entityId)??new Map<string,number>(),pending=new Map<string,number>();
 for(const r of replacements){
  if(r.incomingSkillId===null||r.outgoingSkillId===null||r.incomingSkillId===r.outgoingSkillId)continue;
  const deadline=Math.max(now,before.get(r.outgoingSkillId)??0,before.get(r.incomingSkillId)??0);
  pending.set(r.incomingSkillId,Math.max(deadline,pending.get(r.incomingSkillId)??0));
 }
 for(const [id,deadline]of pending)setDeadline(state,entityId,id,deadline);
 state.replacementRevisions.set(entityId,revision);return true;
}
/** Detached immutable copy; validation never mutates source/configuration. */
export function defineSkill(value:unknown):
 {success:true;definition:SkillEngineDefinition}|{success:false;reason:'invalid_definition';errors:readonly string[]}{
 const errors=validateSkillDefinition(value);
 if(errors.length)return {success:false,reason:'invalid_definition',errors};
 const d=value as SkillEngineDefinition;
 return {success:true,definition:freezeGameplayData(d)};
}
/** Reference/shape validation only, NOT cast admission, targeting or execution.
 * Admission belongs to skillAvailability/startSkillAction through Combat Core. */
export function validateSkillContext(definition:unknown,value:unknown):SkillResult {
 const errors=validateSkillDefinition(definition);
 if(errors.length)return {success:false,reason:'invalid_definition',errors};
 if(!value||typeof value!=='object'||Array.isArray(value))return {success:false,reason:'invalid_context'};
 if(Object.keys(value).some(key=>!['skillId','casterId','target','combat'].includes(key)))return {success:false,reason:'invalid_context'};
 const c=value as SkillExecutionContext,d=definition as SkillEngineDefinition;
 if(c.skillId!==d.skillId)return {success:false,reason:'skill_mismatch'};
 if(!validId(c.casterId)||!c.combat||typeof c.combat.findEntity!=='function'||typeof c.combat.relation!=='function')
  return {success:false,reason:'invalid_context'};
 const target=validateTargetContext(c.target);
 if(!target.allowed)return {success:false,reason:target.reason};
 if(c.target.mode!==d.targetMode)return {success:false,reason:'invalid_target_mode'};
 if(c.target.casterId!==c.casterId||!c.combat.findEntity(c.casterId))return {success:false,reason:'entity_not_found'};
 if(c.target.mode==='entity'&&!c.combat.findEntity(c.target.targetId))return {success:false,reason:'target_not_found'};
 return {success:true};
}
