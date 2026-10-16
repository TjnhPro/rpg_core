import {defineEffect,validateEffectApplyRequest,type EffectApplyRequest,type EffectApplyContext,type EffectDefinition,
 type EffectInstance,type EffectRejection} from './effect-system.js';
import {validateCombatHit,validAllowedRelations,type CombatRejection,type CombatValidationContext,type CombatRestriction} from '../combat/combat-state.js';
import type {CombatModifier} from '../contracts/combat-modifiers.js';

export type EffectRemovalReason='explicit'|'target_defeated'|'session_cleanup'|'consumed';
export type EffectLifecycleEvent=
 | {type:'effect-applied'|'effect-refreshed'|'effect-stack-refreshed'|'effect-expired';instance:EffectInstance;atMs:number}
 | {type:'effect-removed';instance:EffectInstance;atMs:number;reason:EffectRemovalReason};
type Rejection=EffectRejection|CombatRejection|'session_ended'|'apply_identity_conflict'|'effect_not_active'|'group_policy_conflict';
export type EffectOperationResult=
 | {success:false;reason:Rejection}
 | {success:true;events:readonly EffectLifecycleEvent[];instance?:EffectInstance;duplicate?:boolean};
interface ActiveEffect {instance:EffectInstance;definition:EffectDefinition;modifiers:readonly CombatModifier[];restrictions:readonly CombatRestriction[]}
export interface EffectStackConsumeRequest extends EffectApplyRequest {readonly requiredStacks:number}
/** Owner-issued capability, not a writable selection or caller-allocated receipt. */
export interface EffectStackConsumePlan {
 readonly consumedInstanceIds:readonly string[];readonly consumedCount:number;readonly remainingStacks:number;
}
export type EffectStackConsumeRejection=Rejection|'invalid_consume_request'|'invalid_consume_plan'|'stale_consume_plan'|'insufficient_stacks'|'not_stack_policy'|'pending_expiry';
export type EffectStackConsumeResult=
 | {readonly success:false;readonly reason:EffectStackConsumeRejection}
 | ({readonly success:true;readonly duplicate:boolean;readonly events:readonly EffectLifecycleEvent[]}&EffectStackConsumePlan);
export interface EffectGroupView {
 readonly effectId:string;readonly targetEntityId:string;readonly sourceEntityId:string;
 readonly stackingPolicy:'refresh'|'stack';readonly currentStacks:number;readonly maxStacks:number;
 readonly remainingDurationMs:number;readonly instanceIds:readonly string[];readonly contributions:readonly CombatModifier[];
}
const policy=(d:EffectDefinition)=>d.stackingPolicy??'refresh';
const maximum=(d:EffectDefinition)=>policy(d)==='stack'?d.maxStacks!:1;
const validTime=(now:number)=>Number.isFinite(now)&&now>=0;
const failure=(reason:Rejection):EffectOperationResult=>({success:false,reason});
const sorted=(effects:Iterable<ActiveEffect>)=>[...effects].sort((a,b)=>a.instance.expiresAt-b.instance.expiresAt
 ||(a.instance.effectInstanceId<b.instance.effectInstanceId?-1:a.instance.effectInstanceId>b.instance.effectInstanceId?1:0));

/** One temporary-effect owner per existing combat session. Call advance BEFORE
 * actions/hits at each simulation boundary and after defeat at that timestamp.
 * No background loop, stats cache, Skill dispatch, modifier calculation or DoT.
 * Maps are private: queries/events expose frozen instances, never writable stores. */
export class EffectLifecycle {
 private effects=new Map<string,ActiveEffect>();
 // One latest accepted receipt per source generation, not unbounded history.
 // Caller must submit positive increasing serials, in order, for every application
 // (including separate targets of one cast). Rejected serials aren't consumed.
 private frontiers=new Map<string,{serial:number;fingerprint:string;instanceId:string}>();
 private clock:number;
 private ended=false;
 // Weak owner capabilities retain no session-wide operation history or stack cache.
 #consumePlans=new WeakMap<EffectStackConsumePlan,{request:EffectStackConsumeRequest;atMs:number;group:readonly EffectInstance[];source:unknown;target:unknown;result?:EffectStackConsumeResult}>();
 constructor(now=0){if(!validTime(now))throw Error('Invalid simulation time');this.clock=now;}
 get now():number{return this.clock;}
 get active():boolean{return !this.ended;}
 /** Trusted adapters allocate a serial from the bounded source receipt. */
 nextApplicationSerial(sourceEntityId:string):number{return (this.frontiers.get(sourceEntityId)?.serial??0)+1;}
 instances(targetEntityId?:string):readonly EffectInstance[]{
  return sorted(this.effects.values()).map(e=>e.instance).filter(i=>targetEntityId===undefined||i.targetEntityId===targetEntityId);
 }
 /** Frozen Apply payloads, not computed/cached Effective Stats. Merge with
  * other live sources at each existing resolver boundary. */
 modifiers(targetEntityId:string):readonly CombatModifier[]{
  return sorted(this.effects.values()).filter(e=>e.instance.targetEntityId===targetEntityId).flatMap(e=>e.modifiers);
 }
 /** OR across active Apply snapshots. No cached flags/count strength; refreshed
  * duration definitions never overwrite retained stack payloads. */
 hasRestriction(targetEntityId:string,restriction:CombatRestriction):boolean {
  return [...this.effects.values()].some(e=>e.instance.targetEntityId===targetEntityId&&e.instance.expiresAt>this.clock&&e.restrictions.includes(restriction));
 }
 /** Inspector-only derivation from the single active store; never cached stats. */
 groups(targetEntityId?:string):readonly EffectGroupView[]{
  const groups=new Map<string,ActiveEffect[]>();
  for(const e of sorted(this.effects.values())){
   if(targetEntityId!==undefined&&e.instance.targetEntityId!==targetEntityId)continue;
   const key=JSON.stringify([e.instance.targetEntityId,e.instance.effectId,e.instance.sourceEntityId]);
   groups.set(key,[...(groups.get(key)??[]),e]);
  }
  return Object.freeze([...groups.values()].map(group=>{
   const first=group[0]!;
   return Object.freeze({effectId:first.instance.effectId,targetEntityId:first.instance.targetEntityId,sourceEntityId:first.instance.sourceEntityId,
    stackingPolicy:policy(first.definition),currentStacks:group.length,maxStacks:maximum(first.definition),
    remainingDurationMs:Math.max(0,first.instance.expiresAt-this.clock),instanceIds:Object.freeze(group.map(e=>e.instance.effectInstanceId)),
    contributions:Object.freeze(group.flatMap(e=>e.modifiers))});
  }));
 }
 /** Expose a boundary for the caller's existing loop; not a scheduler. */
 nextExpiration():number{return sorted(this.effects.values())[0]?.instance.expiresAt??Infinity;}
 advance(now:number,combat:CombatValidationContext):EffectOperationResult {
  if(this.ended)return failure('session_ended');
  if(!validTime(now)||now<this.clock)return failure('invalid_timeline');
  if(!combat||typeof combat.findEntity!=='function'||typeof combat.relation!=='function')return failure('invalid_entity_context');
  this.clock=now;
  const events=this.expire();
  for(const effect of sorted(this.effects.values())){
   const target=combat.findEntity(effect.instance.targetEntityId);
   if(target&&target.currentHp<=0)events.push(this.removeActive(effect,'target_defeated'));
  }
  return {success:true,events};
 }
 /** Context now must equal the already-advanced clock. Rejections never sweep
 * or mutate active effects. Admission uses existing contact eligibility, so an
 * emitted effect can apply after source defeat but never to a defeated target. */
 apply(request:EffectApplyRequest,definition:unknown,context:EffectApplyContext,applySerial:number):EffectOperationResult {
  if(this.ended)return failure('session_ended');
  if(!context||context.now!==this.clock)return failure('invalid_timeline');
  const validation=validateEffectApplyRequest(request,definition,context);if(!validation.success)return failure(validation.reason);
  if(!Number.isSafeInteger(applySerial)||applySerial<=0)return failure('invalid_instance_identity');
  const frozen=defineEffect(definition);if(!frozen.success)return failure(frozen.reason);
  const instanceId=JSON.stringify([request.sourceEntityId,applySerial]);
  const fingerprint=JSON.stringify([request.effectId,request.targetEntityId,[...request.allowedTargetRelations].sort(),frozen.definition]);
  const frontier=this.frontiers.get(request.sourceEntityId);
  if(frontier&&applySerial<=frontier.serial){
   if(applySerial===frontier.serial&&fingerprint!==frontier.fingerprint)return failure('apply_identity_conflict');
   // Ordered serial protocol: older requests are inert, including terminal retries.
   // Only the latest receipt is retained; no history proportional to refresh count.
   const instance=applySerial===frontier.serial?this.effects.get(frontier.instanceId)?.instance:undefined;
   return {success:true,...(instance?{instance}:{}),duplicate:true,events:[]};
  }
  const admission=validateCombatHit({casterId:request.sourceEntityId,targetId:request.targetEntityId,
   allowedRelations:request.allowedTargetRelations,requiresLivingTarget:true},context.combat);
  if(!admission.allowed)return failure(admission.reason);
  // Existing v0.5 source identity limit; never truncate and collide identities.
  if((frozen.definition.modifiers?.length??0)>0&&instanceId.length>128)return failure('invalid_instance_identity');
  const group=sorted(this.effects.values()).filter(e=>e.instance.targetEntityId===request.targetEntityId
   &&e.instance.effectId===request.effectId&&e.instance.sourceEntityId===request.sourceEntityId);
  if(group.some(e=>policy(e.definition)!==policy(frozen.definition)||maximum(e.definition)!==maximum(frozen.definition)))return failure('group_policy_conflict');
  const refresh=group.length>0&&(policy(frozen.definition)==='refresh'||group.length>=maximum(frozen.definition));
  const chosenId=refresh?group[0]!.instance.effectInstanceId:instanceId;
  const instance:EffectInstance=Object.freeze({effectInstanceId:chosenId,effectId:request.effectId,
   sourceEntityId:request.sourceEntityId,targetEntityId:request.targetEntityId,
   appliedAt:refresh?group[0]!.instance.appliedAt:this.clock,...(refresh?{refreshedAt:this.clock}:{}),expiresAt:this.clock+frozen.definition.durationMs});
  const modifiers=Object.freeze((frozen.definition.modifiers??[]).map(m=>Object.freeze({...m,source:'buff' as const,sourceInstanceId:chosenId})));
  for(const e of group){
   e.instance=Object.freeze({...e.instance,refreshedAt:this.clock,expiresAt:instance.expiresAt});
   // Latest duration contract, not a resnapshot of old stack contributions.
   e.definition=frozen.definition;
  }
  if(!refresh||policy(frozen.definition)==='refresh')this.effects.set(chosenId,{instance,definition:frozen.definition,modifiers,restrictions:frozen.definition.restrictions??Object.freeze([])});
  const resultInstance=this.effects.get(chosenId)!.instance;
  this.frontiers.set(request.sourceEntityId,{serial:applySerial,fingerprint,instanceId:chosenId});
  const type=!refresh?'effect-applied':policy(frozen.definition)==='refresh'?'effect-refreshed':'effect-stack-refreshed';
  return {success:true,instance:resultInstance,events:[{type,instance:resultInstance,atMs:this.clock}]};
 }
 remove(effectInstanceId:string,now:number):EffectOperationResult {
  if(this.ended)return failure('session_ended');
  if(now!==this.clock||!validTime(now))return failure('invalid_timeline');
  const effect=this.effects.get(effectInstanceId);if(!effect)return failure('effect_not_active');
  return {success:true,events:[this.removeActive(effect,'explicit')]};
 }
 /** Pure preflight on the authoritative store, at an already-advanced boundary. */
 prepareConsumeStacks(request:EffectStackConsumeRequest,context:EffectApplyContext):{readonly success:true;readonly plan:EffectStackConsumePlan}|{readonly success:false;readonly reason:EffectStackConsumeRejection} {
  const fail=(reason:EffectStackConsumeRejection)=>Object.freeze({success:false as const,reason});
  if(this.ended)return fail('session_ended');
  if(!context||context.now!==this.clock||!validTime(context.now))return fail('invalid_timeline');
  if(!request||Object.keys(request).sort().join()!=='allowedTargetRelations,effectId,requiredStacks,sourceEntityId,targetEntityId'
   ||![request.effectId,request.sourceEntityId,request.targetEntityId].every(id=>typeof id==='string'&&id.trim().length>0)
   ||!Number.isSafeInteger(request.requiredStacks)||request.requiredStacks<=0||!validAllowedRelations(request.allowedTargetRelations))return fail('invalid_consume_request');
  if(!context.combat||typeof context.combat.findEntity!=='function'||typeof context.combat.relation!=='function')return fail('invalid_entity_context');
  const hit=validateCombatHit({casterId:request.sourceEntityId,targetId:request.targetEntityId,allowedRelations:request.allowedTargetRelations,requiresLivingTarget:true},context.combat);
  if(!hit.allowed)return fail(hit.reason);
  const group=sorted(this.effects.values()).filter(e=>e.instance.sourceEntityId===request.sourceEntityId&&e.instance.targetEntityId===request.targetEntityId&&e.instance.effectId===request.effectId);
  if(group.some(e=>e.instance.expiresAt<=this.clock))return fail('pending_expiry');
  if(group.some(e=>policy(e.definition)!=='stack'))return fail('not_stack_policy');
  if(group.length<request.requiredStacks)return fail('insufficient_stacks');
  const plan=Object.freeze({consumedInstanceIds:Object.freeze(group.slice(0,request.requiredStacks).map(e=>e.instance.effectInstanceId)),consumedCount:request.requiredStacks,remainingStacks:group.length-request.requiredStacks});
  this.#consumePlans.set(plan,{request:Object.freeze({...request,allowedTargetRelations:Object.freeze([...request.allowedTargetRelations])}),atMs:this.clock,group:group.map(e=>e.instance),source:context.combat.findEntity(request.sourceEntityId),target:context.combat.findEntity(request.targetEntityId)});
  return Object.freeze({success:true,plan});
 }
 /** Exact-N commit has no callbacks. A stale selection cannot partially remove. */
 consumeStacks(plan:EffectStackConsumePlan,context:EffectApplyContext):EffectStackConsumeResult {
  const fail=(reason:EffectStackConsumeRejection):EffectStackConsumeResult=>Object.freeze({success:false,reason});
  if(this.ended)return fail('session_ended');
  const data=this.#consumePlans.get(plan);if(!data)return fail('invalid_consume_plan');
  if(!context||context.now!==this.clock||context.now!==data.atMs)return fail('invalid_timeline');
  if(data.result)return Object.freeze({...data.result,duplicate:true,events:Object.freeze([])}) as EffectStackConsumeResult;
  const check=this.prepareConsumeStacks(data.request,context);if(!check.success)return check;
  if(context.combat.findEntity(data.request.sourceEntityId)!==data.source||context.combat.findEntity(data.request.targetEntityId)!==data.target)return fail('stale_consume_plan');
  const group=sorted(this.effects.values()).filter(e=>e.instance.sourceEntityId===data.request.sourceEntityId&&e.instance.targetEntityId===data.request.targetEntityId&&e.instance.effectId===data.request.effectId);
  if(group.length!==data.group.length||group.some((e,i)=>e.instance!==data.group[i]))return fail('stale_consume_plan');
  const events=Object.freeze(group.slice(0,plan.consumedCount).map(e=>Object.freeze(this.removeActive(e,'consumed'))));
  const result=Object.freeze({success:true as const,...plan,duplicate:false,events});data.result=result;data.group=[];
  return result;
 }
 /** Forward the existing EntityDefeated after its HP write, not a second death
 * emitter. Expiration precedes removal at equal time. Missing/dead sources are
 * not queried; their effects retain duration. */
 targetDefeated(targetEntityId:string,context:EffectApplyContext):EffectOperationResult {
  if(this.ended)return failure('session_ended');
  if(!context||context.now!==this.clock)return failure('invalid_timeline');
  const entity=context.combat?.findEntity(targetEntityId);
  if(!entity||entity.entityId!==targetEntityId||!(entity.currentHp<=0))return failure('invalid_entity_context');
  const events:EffectLifecycleEvent[]=[];
  for(const effect of sorted(this.effects.values()))if(effect.instance.targetEntityId===targetEntityId)events.push(this.removeActive(effect,'target_defeated'));
  return {success:true,events};
 }
 /** End is terminal, idempotent and releases source frontiers + config refs.
 * Caller supplies end timestamp; due expiry wins over session removal. */
 dispose(now:number):EffectOperationResult {
  if(this.ended)return {success:true,events:[]};
  if(!validTime(now)||now<this.clock)return failure('invalid_timeline');
  this.clock=now;const events=this.expire();
  for(const effect of sorted(this.effects.values()))events.push(this.removeActive(effect,'session_cleanup'));
  this.effects.clear();this.frontiers.clear();this.#consumePlans=new WeakMap();this.ended=true;
  return {success:true,events};
 }
 private expire():EffectLifecycleEvent[]{
  const events:EffectLifecycleEvent[]=[];
  for(const effect of sorted(this.effects.values())){
   if(effect.instance.expiresAt>this.clock)break;
   this.effects.delete(effect.instance.effectInstanceId);
   events.push({type:'effect-expired',instance:effect.instance,atMs:effect.instance.expiresAt});
  }
  return events;
 }
 private removeActive(effect:ActiveEffect,reason:EffectRemovalReason):EffectLifecycleEvent {
  this.effects.delete(effect.instance.effectInstanceId);
  return {type:'effect-removed',instance:effect.instance,atMs:this.clock,reason};
 }
}
