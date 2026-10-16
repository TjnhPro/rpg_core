import {initializeSkillTriggerSession,disposeSkillTriggers,bindSkillTriggerDelivery,captureSkillImpact,captureSkillHit,captureSkillStackApply,skillStackCount,observesSkillConditionalHit,observesSkillStackApply,drainSkillTriggers,skillTriggerMutationAllowed,observeSkillTriggerBoundary,beginSkillTriggerAdvance,endSkillTriggerAdvance,nextSkillTriggerExecution,admitSkillProjectiles,recordSkillProjectile,skillCompositionEnabled,pendingSkillTriggerPayload,skillEffectWork,type SkillTriggerReceipt,type TriggerChildDispatcher} from './skill-trigger.js';
import {rootSkillInstance,initializeSkillInstances,disposeSkillInstances,advanceSkillInstances,nextSkillInstanceExpiration,registerTriggeredSkillChildren,canRegisterTriggeredSkillChildren,activateSkillInstance,cancelSkillInstance,inspectSkillInstance,childInstanceDamage,type SkillInstanceView} from './skill-instance.js';
import {initializeRootOffense,clearRootOffense,validateRootActivation,rootDamageSnapshot} from './root-offense.js';
import type { DamageContext } from '../contracts/damage-contracts.js';
import type { ProjectileConfig,TimedAOESequence,TimedObjectConfig } from '../contracts/mechanic-contracts.js';
import {validateSkillEffects,type SkillStackConsumption,type SkillDamageComponent,type SkillGameplayEffect } from './skill-effects.js';
import { strikeAOE,tickAOESequenceRuntime } from '../mechanics/aoe-sequence-core.js';
import { canTraverse,type MapPoint,type Walkability } from '../spatial/grid-geometry.js';
import { applyEntityDamage,type CombatEntity } from '../combat/combat-entity.js';
import { validateCombatHit,type CombatValidationContext,type EntityCombatEvent,type FactionRelation } from '../combat/combat-state.js';
import { calculateDamage,type DamageSnapshot } from '../damage/damage-core.js';
import { applyDotSnapshot,dotDamage,tickDotRuntime,type DotGroup,type DotRuntime } from '../effects/dot-core.js';
import { EffectLifecycle,type EffectLifecycleEvent,type EffectOperationResult } from '../effects/effect-lifecycle.js';
import { emitterProjectileConfig,tickEmitterRuntime } from '../mechanics/emitter-core.js';
import { detectInstantAOE,lockAOEPosition } from '../mechanics/instant-aoe.js';
import { detectMeleeHitbox } from '../mechanics/melee-hitbox.js';
import { nextProjectileBodyBoundary,projectileDirections,tickProjectileBodies,type ProjectileBody } from '../mechanics/projectile.js';
import { inRange } from '../spatial/range.js';
import { reconcileSkillRestrictions,type SkillActivatedEvent,type SkillExecutionSlot,type SkillExecutionSnapshot } from './skill-execution.js';
import type {SkillEngineDefinition} from './skill-engine.js';
import type {TargetContext} from '../combat/combat-state.js';
import {validateCombatModifiers} from '../contracts/combat-modifiers.js';

/** Trusted session adapter. Actor-owned base/config/modifiers use existing stat
 * resolver + snapshotActorDamage; never client-supplied damage/HP or UI values. */
export interface SkillEffectEnvironment {
 combat:CombatValidationContext;grid:Walkability;
 entityIds():readonly string[];
 position(id:string):Readonly<MapPoint>|undefined;
 snapshotDamage(caster:CombatEntity,component:SkillDamageComponent,configVersion:string):DamageSnapshot;
 defenseStats(target:CombatEntity):{maxHp:number;armor:number;magicResistance:number;dodgeChance:number};
 statuses(targetId:string):readonly string[];
 criticalRoll():number;dodgeRoll():number;positionRoll():number;
 emit(event:SkillEffectEvent):void;
 /** Trusted existing actor slots, never a new action store. Status Apply needs
  * immediate cancellation even when the next frame is after effect expiry. */
 actionSlot?(entityId:string):SkillExecutionSlot|undefined;
}
/** Gameplay dispatch data, not a synthetic root action/SkillActivatedEvent. */
interface GameplayActivation {
 actionInstanceId:string;skillId:string;casterId:string;target:Readonly<TargetContext>;
 snapshot:Pick<SkillExecutionSnapshot,'configVersion'|'rootOffense'|'casterPosition'|'aimPosition'|'facing'> & {readonly definition:SkillEngineDefinition};
 rootExecution?:SkillExecutionSnapshot;child?:SkillInstanceView;
}
interface Delivery {id:string;activation:GameplayActivation;effect:Exclude<SkillGameplayEffect,{type:'modifier_effect'|'consume_stacks'}>;relations:readonly FactionRelation[]}
interface Bullet extends Delivery,ProjectileBody {config:ProjectileConfig;snapshot:DamageSnapshot}
interface Emitter extends Delivery {position:MapPoint;remainingMs:number;config:TimedObjectConfig}
interface Sequence extends Delivery {center:MapPoint;nextStrike:number;remainingMs:number;config:TimedAOESequence}
export type SkillEffectEvent=EntityCombatEvent|EffectLifecycleEvent
 | {type:'effect-created';atMs:number;instanceId:string;actionInstanceId:string;mechanic:SkillGameplayEffect['type']}
 | {type:'effect-hit';atMs:number;instanceId:string;targetId:string;mechanic:string;breakdown:ReturnType<typeof calculateDamage>}
 | {type:'effect-rejected';atMs:number;instanceId:string;targetId:string;reason:string};
/** Only existing mechanic instance stores and activation receipt frontier. No
 * action state, resources, polling, second combat engine or general manager. */
export interface SkillEffectRuntime {
 now:number;active:boolean;lastActivation:Map<string,number>;
 bullets:Bullet[];objects:Emitter[];sequences:Sequence[];dots:DotRuntime<string>;
 dotPolicies:Map<DotGroup<string>,Delivery>;
 readonly effects:EffectLifecycle;
}
export function createSkillEffectRuntime(now=0,effects=new EffectLifecycle(now),options:{offenseMode?:'legacy'|'root';instanceSession?:string}={}):SkillEffectRuntime {
 if(!Number.isFinite(now)||now<0)throw Error('Invalid simulation time');
 if(options.offenseMode!==undefined&&options.offenseMode!=='legacy'&&options.offenseMode!=='root')throw Error('invalid_root_offense');
 if(!effects.active||effects.now!==now)throw Error('Reuse the active session effect owner at the same simulation time');
 if(options.instanceSession!==undefined&&options.offenseMode!=='root')throw Error('invalid_instance_session');
 const runtime:SkillEffectRuntime={now,active:true,lastActivation:new Map(),bullets:[],objects:[],sequences:[],dots:{groups:[]},dotPolicies:new Map(),effects};
 if(options.offenseMode==='root')initializeRootOffense(runtime);
 if(options.instanceSession!==undefined){initializeSkillInstances(runtime,options.instanceSession);initializeSkillTriggerSession(runtime,options.instanceSession);}
 return runtime;
}
export function clearSkillEffects(r:SkillEffectRuntime,env?:SkillEffectEnvironment):readonly SkillInstanceView[]|undefined {
 disposeSkillTriggers(r);
 const instances=disposeSkillInstances(r);
 clearRootOffense(r);
 r.active=false;r.bullets=[];r.objects=[];r.sequences=[];r.dots.groups=[];r.dotPolicies.clear();r.lastActivation.clear();
 const result=r.effects.dispose(r.now);if(result.success)for(const event of result.events)env?.emit(event);
 return instances;
}
function effectEvents(result:EffectOperationResult,env:SkillEffectEnvironment):void {
 if(!result.success)throw Error('Invalid trusted effect lifecycle: '+result.reason);
 for(const event of result.events){
  env.emit(event);
  const slot=env.actionSlot?.(event.instance.targetEntityId);
  if(slot){const events:EntityCombatEvent[]=[];reconcileSkillRestrictions(slot,env.combat,event.atMs,events);for(const e of events)env.emit(e);}
 }
}
const targets=(env:SkillEffectEnvironment)=>[...new Set(env.entityIds())].sort().flatMap(id=>{
 const entity=env.combat.findEntity(id),position=env.position(id);
 return entity&&position&&Number.isFinite(position.x)&&Number.isFinite(position.y)?[{id,position:{...position},hp:entity.currentHp}]:[];
});
function eligible(d:Delivery,targetId:string,env:SkillEffectEnvironment){
 return validateCombatHit({casterId:d.activation.casterId,targetId,allowedRelations:d.relations,requiresLivingTarget:true},env.combat);
}
function component(d:Delivery):SkillDamageComponent {return d.effect.type==='timed_object'?d.effect.projectile.damage:d.effect.damage;}
function snapshot(r:SkillEffectRuntime,d:Delivery,env:SkillEffectEnvironment,c=component(d)):DamageSnapshot|undefined {
 const instance=d.activation.child??(d.activation.rootExecution&&rootSkillInstance(r,d.activation.rootExecution));
 if(instance)bindSkillTriggerDelivery(r,d,instance.instanceId,d.activation.snapshot.rootOffense);
 const caster=env.combat.findEntity(d.activation.casterId);if(!caster){
  if(d.activation.snapshot.rootOffense)env.emit({type:'effect-rejected',atMs:r.now,instanceId:d.id,targetId:d.activation.casterId,reason:'entity_not_found'});
  return;
 }
 if(d.activation.child)return childInstanceDamage(r,d.activation.child,c);
 if(d.activation.snapshot.rootOffense)return rootDamageSnapshot(r,d.activation.rootExecution!,c);
 return structuredClone({...env.snapshotDamage(caster,c,d.activation.snapshot.configVersion),definition:c.definition,rank:c.rank,
  attacker:{entityId:caster.entityId,entityType:caster.entityType,level:caster.level,targetTags:[...caster.targetTags]}});
}
function damageContext(d:Delivery,target:CombatEntity,env:SkillEffectEnvironment,mechanic:NonNullable<DamageContext['defender']>['mechanic'],c=component(d)):DamageContext {
 const source=env.combat.findEntity(d.activation.casterId)!,stats=env.defenseStats(target);
 return {type:c.damageType,tags:c.tags,eventTags:c.tags,target:'Normal',statuses:env.statuses(target.entityId),
  entities:{attacker:source,defender:target,defenderStats:stats},defender:{source:{id:source.entityId,level:source.level},target:{id:target.entityId,level:target.level},mechanic}};
}
function applyDamage(r:SkillEffectRuntime,target:CombatEntity,damage:number,env:SkillEffectEnvironment,resolved?:(killed:boolean)=>void):void {
 if(!r.active)return;
 const hp=applyEntityDamage(target.currentHp,damage,env.defenseStats(target).maxHp);target.currentHp=hp.after;
 resolved?.(hp.before>0&&hp.after===0);
 if(hp.appliedDamage>0)env.emit({type:'damage-applied',entityId:target.entityId,atMs:r.now,...hp});
 if(hp.defeated){r.dots.groups=r.dots.groups.filter(g=>g.targetId!==target.entityId);if(r.effects.active)effectEvents(r.effects.targetDefeated(target.entityId,{combat:env.combat,now:r.now}),env);env.emit({type:'entity-defeated',entityId:target.entityId,atMs:r.now});}
}
function hit(r:SkillEffectRuntime,d:Delivery,targetId:string,offense:DamageSnapshot,env:SkillEffectEnvironment,mechanic:NonNullable<DamageContext['defender']>['mechanic']):void {
 if(!r.active)return;
 const validation=eligible(d,targetId,env);
 if(!validation.allowed){env.emit({type:'effect-rejected',atMs:r.now,instanceId:d.id,targetId,reason:validation.reason});return;}
 const target=env.combat.findEntity(targetId)!;
 const breakdown=calculateDamage({...offense,context:damageContext(d,target,env,mechanic),roll:env.criticalRoll,dodgeRoll:env.dodgeRoll});
 const origin=observesSkillConditionalHit(r,d)?env.position(targetId):undefined;
 applyDamage(r,target,breakdown.finalDamage,env,killed=>{if(breakdown.defense.hit.hit&&origin)captureSkillHit(r,d,d.id,target,origin,killed);});
 env.emit({type:'effect-hit',atMs:r.now,instanceId:d.id,targetId,mechanic,breakdown});
 if(!r.active||!breakdown.defense.hit.hit||target.currentHp<=0)return;
 for(const dot of d.effect.onHit??[]){
  if(!eligible(d,targetId,env).allowed)break;
  applyDotSnapshot(r.dots,targetId,d.activation.casterId,d.activation.skillId,dot.config,()=>snapshot(r,d,env,dot.damage)!);
  const group=r.dots.groups.find(g=>g.targetId===targetId&&g.sourcePlayerId===d.activation.casterId&&g.effectId===dot.config.effectId);
  if(group&&!r.dotPolicies.has(group))r.dotPolicies.set(group,d);
 }
}
function launch(r:SkillEffectRuntime,d:Delivery,config:ProjectileConfig,origin:MapPoint,direction:MapPoint,env:SkillEffectEnvironment):void {
 if(!r.active||!config.enabled)return;
 const offense=snapshot(r,d,env);if(!offense)return;
 const instance=d.activation.child?inspectSkillInstance(r,d.activation.child.instanceId):d.activation.rootExecution&&rootSkillInstance(r,d.activation.rootExecution);
 const composition=instance&&skillCompositionEnabled(r,instance.instanceId);
 const headings=projectileDirections(direction,config.spreadAngles).map((heading,index)=>({heading,index,position:{x:origin.x+heading.x*config.spawnOffset,y:origin.y+heading.y*config.spawnOffset}}))
  .filter(b=>!composition||canTraverse(env.grid,origin,b.position));
 if(instance&&!admitSkillProjectiles(r,instance.instanceId,headings.length))return;
 for(const {index,heading,position}of headings){
  if(!r.active)break;
  if(!composition&&!canTraverse(env.grid,origin,position))continue;
  const bullet:Bullet={...d,id:`${d.id}/bullet${index}`,config,position,direction:heading,travelled:0,remainingMs:config.lifetime,hitTargets:[],snapshot:offense};
  if(instance&&instance.status!=='cancelled')bindSkillTriggerDelivery(r,bullet,instance.instanceId,d.activation.snapshot.rootOffense);
  r.bullets.push(bullet);if(instance)recordSkillProjectile(r,instance.instanceId);env.emit({type:'effect-created',atMs:r.now,instanceId:bullet.id,actionInstanceId:d.activation.actionInstanceId,mechanic:'projectile'});
 }
}
function aoe(r:SkillEffectRuntime,d:Delivery,center:MapPoint,radius:number,env:SkillEffectEnvironment,config=strikeAOE(radius),mechanic:'instant_aoe'|'timed_aoe_sequence'='instant_aoe',prepared?:DamageSnapshot):void {
 const offense=prepared??snapshot(r,d,env);if(!offense)return;
 for(const id of detectInstantAOE(config,center,targets(env).filter(t=>eligible(d,t.id,env).allowed),env.grid))hit(r,d,id,offense,env,mechanic);
}
/** Call at the activation boundary on the same simulation clock. Never apply a
 * historical activation using present-day stats; callers partition before it. */
export function dispatchSkillEffects(r:SkillEffectRuntime,event:SkillActivatedEvent,env:SkillEffectEnvironment):boolean {
 if(!r.active||!skillTriggerMutationAllowed(r))return false;
 env=guardedEnvironment(r,env);
 if(!validateRootActivation(r,event.snapshot))throw Error('invalid_root_offense');
 if(event.snapshot.rootOffense&&(event.atMs!==event.snapshot.activationTime||event.target!==event.snapshot.target))throw Error('invalid_root_offense');
 if(Math.abs(r.now-event.atMs)>1e-6)throw Error('Advance to SkillActivated boundary before dispatch');
 const prefix=event.casterId+'#',serial=Number(event.actionInstanceId.slice(prefix.length));
 if(!event.actionInstanceId.startsWith(prefix)||!Number.isSafeInteger(serial)||serial<1||event.snapshot.actionInstanceId!==event.actionInstanceId||event.snapshot.casterId!==event.casterId||event.snapshot.skillId!==event.skillId||event.snapshot.definition.skillId!==event.skillId)throw Error('Invalid trusted activation identity');
 if(serial<=(r.lastActivation.get(event.casterId)??0))return false;
 if(event.snapshot.rootOffense&&!env.combat.findEntity(event.casterId))throw Error('invalid_root_offense');
 r.lastActivation.set(event.casterId,serial);
 dispatchGameplayEffects(r,{...event,rootExecution:event.snapshot},env,event.actionInstanceId);
 return true;
}
function dispatchGameplayEffects(r:SkillEffectRuntime,event:GameplayActivation,env:SkillEffectEnvironment,instanceId:string):void {
 for(const [index,effect]of (event.snapshot.definition.effects??[]).entries()){
  if(!r.active)break;
  if(effect.type==='consume_stacks'){consumeStackEffect(r,event,effect,env,`${instanceId}/effect${index}`);continue;}
  if(effect.type==='modifier_effect'){
   const targetId=effect.target==='self'?event.casterId:event.target.mode==='self'?event.casterId:event.target.mode==='entity'?event.target.targetId:undefined;
   if(!targetId){env.emit({type:'effect-rejected',atMs:r.now,instanceId:`${instanceId}/effect${index}`,targetId:event.casterId,reason:'invalid_target_mode'});continue;}
   const instance=event.child??(event.rootExecution&&rootSkillInstance(r,event.rootExecution));
   const tracked=instance&&observesSkillStackApply(r,instance.instanceId);
   const before=tracked?skillStackCount(r,event.casterId,targetId,effect.definition.effectId):0,target=tracked?env.combat.findEntity(targetId):undefined,origin=tracked?env.position(targetId):undefined;
   const applicationSerial=r.effects.nextApplicationSerial(event.casterId);
   const result=r.effects.apply({effectId:effect.definition.effectId,sourceEntityId:event.casterId,targetEntityId:targetId,
    allowedTargetRelations:effect.allowedTargetRelations??event.snapshot.definition.allowedTargetRelations},effect.definition,{now:r.now,combat:env.combat},applicationSerial);
   if(result.success){
    if(!result.duplicate&&instance&&target&&origin&&result.instance)captureSkillStackApply(r,instance.instanceId,event.snapshot.rootOffense,target,effect.definition.effectId,before,skillStackCount(r,event.casterId,targetId,effect.definition.effectId),JSON.stringify([event.casterId,applicationSerial]),origin);
    effectEvents(result,env);
   }else env.emit({type:'effect-rejected',atMs:r.now,instanceId:`${instanceId}/effect${index}`,targetId,reason:result.reason});
   continue;
  }
  const d:Delivery={id:`${instanceId}/effect${index}`,activation:event,effect,relations:effect.allowedTargetRelations??event.snapshot.definition.allowedTargetRelations};
  if(effect.type!=='direct_hit'&&!effect.config.enabled)continue;
  const s=event.snapshot,source=event.child?s.casterPosition:env.position(event.casterId),aim=s.aimPosition,origin=s.casterPosition,facing=s.facing;
  switch(effect.type){
   case 'direct_hit':{
    if(event.target.mode==='ground')break;
    const id=event.target.mode==='self'?event.casterId:event.target.targetId,target=env.position(id);
    if(event.target.mode!=='self'&&(!source||!target||!inRange(env.grid,source,target,s.definition.castRange))){env.emit({type:'effect-rejected',atMs:r.now,instanceId:d.id,targetId:id,reason:'out_of_range'});break;}
    const offense=snapshot(r,d,env);if(offense)hit(r,d,id,offense,env,'direct_hit');break;
   }
   case 'melee_hitbox':{
    if(!source||!facing)break;
    const offense=snapshot(r,d,env);if(!offense)break;
    for(const id of detectMeleeHitbox(effect.config,source,facing,targets(env),env.grid))hit(r,d,id,offense,env,'melee_hitbox');break;
   }
   case 'projectile':if(source&&aim&&facing){const delta={x:aim.x-source.x,y:aim.y-source.y};launch(r,d,effect.config,source,effect.config.direction==='facing'?facing:Math.hypot(delta.x,delta.y)?delta:facing,env);}break;
   case 'instant_aoe':if(origin&&aim)aoe(r,d,lockAOEPosition(effect.config,origin,aim,aim),effect.config.radius,env,effect.config);break;
   case 'timed_object':if(origin&&aim){r.objects.push({...d,position:{...(effect.config.placement==='self'?origin:aim)},remainingMs:effect.config.delayMs,config:effect.config});env.emit({type:'effect-created',atMs:r.now,instanceId:d.id,actionInstanceId:event.actionInstanceId,mechanic:effect.type});}break;
   case 'timed_aoe_sequence':if(aim){r.sequences.push({...d,center:{...aim},nextStrike:0,remainingMs:effect.config.firstDelayMs,config:effect.config});env.emit({type:'effect-created',atMs:r.now,instanceId:d.id,actionInstanceId:event.actionInstanceId,mechanic:effect.type});}break;
  }
 }
}
function childTarget(child:SkillInstanceView,receipt:SkillTriggerReceipt):Readonly<TargetContext>|undefined {
 const mode=child.definition!.targetMode,casterId=child.casterId;
 return mode==='self'?{mode,casterId}:mode==='ground'?{mode,casterId,position:receipt.origin}:receipt.targetId?{mode,casterId,targetId:receipt.targetId}:undefined;
}
/** One synchronous consume/admission boundary; never a cast or callback-based spawn. */
function consumeStackEffect(r:SkillEffectRuntime,event:GameplayActivation,operation:SkillStackConsumption,env:SkillEffectEnvironment,id:string):void {
 const targetId=event.target.mode==='entity'?event.target.targetId:event.casterId;
 const reject=(reason:string)=>env.emit({type:'effect-rejected',atMs:r.now,instanceId:id,targetId,reason});
 if(event.target.mode!=='entity'||!event.snapshot.rootOffense||validateSkillEffects([operation]).length){reject('invalid_stack_operation');return;}
 if(!event.child&&(!event.rootExecution||!rootSkillInstance(r,event.rootExecution))){reject('invalid_instance_session');return;}
 const outcome=operation.outcome,s=event.snapshot,origin=s.casterPosition,aim=s.aimPosition;
 if(!outcome.config.enabled||!origin||!aim||![origin.x,origin.y,aim.x,aim.y].every(Number.isFinite)||!env.position(targetId)){reject('invalid_stack_origin');return;}
 const d:Delivery={id,activation:event,effect:outcome,relations:s.definition.allowedTargetRelations};
 if(!eligible(d,targetId,env).allowed){reject('invalid_child_target');return;}
 const context={now:r.now,combat:env.combat};
 const selection=r.effects.prepareConsumeStacks({effectId:operation.effectId,requiredStacks:operation.requiredStacks,sourceEntityId:event.casterId,targetEntityId:targetId,allowedTargetRelations:d.relations},context);
 if(!selection.success){reject(selection.reason);return;}
 let offense:DamageSnapshot|undefined;
 try{
  offense=snapshot(r,d,env);if(!offense)return;
  if(offense.flatModifiers.length+offense.bonusModifiers.length>=256){reject('modifier_capacity');return;}
  let suffix=0;while(offense.flatModifiers.some(m=>m.source==='setting'&&m.sourceInstanceId==='stack-consumption'&&m.id===String(suffix)))suffix++;
  const modifier={id:String(suffix),source:'setting' as const,sourceInstanceId:'stack-consumption',target:'flat_damage',operation:'add_flat' as const,value:operation.flatPerStack*selection.plan.consumedCount,enabled:true,conditions:[]};
  offense={...offense,flatModifiers:[...offense.flatModifiers,modifier]};
  if(validateCombatModifiers(offense.flatModifiers,[]).length){reject('invalid_stack_damage');return;}
 }catch{reject('invalid_stack_damage');return;}
 if(!skillEffectWork(r)){reject('maxWorkPerBoundary');return;}
 const consumed=r.effects.consumeStacks(selection.plan,context);
 if(!consumed.success){reject(consumed.reason);return;}
 if(consumed.duplicate)return;
 skillEffectWork(r,true);
 // Notifications cannot interrupt stack commit -> canonical outcome dispatch.
 // Observers receive removals first, then the outcome events, after dispatch.
 const events:SkillEffectEvent[]=[];
 aoe(r,d,lockAOEPosition(outcome.config,origin,aim,aim),outcome.config.radius,{...env,emit:e=>events.push(e)},outcome.config,'instant_aoe',offense);
 effectEvents(consumed,env);
 for(const e of events)env.emit(e);
}
function childDispatcher(r:SkillEffectRuntime,env:SkillEffectEnvironment):TriggerChildDispatcher {
 return {
  cancel(child){cancelSkillInstance(r,child,r.now);},
  consumed(events){for(const event of events)env.emit(event);},
  admit(receipts,beforeCommit){
   for(const receipt of receipts){
    const payload=pendingSkillTriggerPayload(r,receipt);if(!payload)return {reason:'invalid_ancestry'};
    if(payload.pin.definition.targetMode==='entity'){
     if(!receipt.targetId||!validateCombatHit({casterId:receipt.sourceEntityId,targetId:receipt.targetId,allowedRelations:payload.pin.definition.allowedTargetRelations,requiresLivingTarget:true},env.combat).allowed)return {reason:'invalid_child_target'};
    }
   }
   if(!canRegisterTriggeredSkillChildren(r,receipts[0]!.rootInstanceId,receipts.length))return {reason:'budget_exceeded',dimension:'maxLiveChildren'};
   const children=registerTriggeredSkillChildren(r,receipts,env.combat,beforeCommit);
   return children?{children}:{reason:'invalid_ancestry'};
  },
  execute(child,receipt){
   const current=inspectSkillInstance(r,child.instanceId);if(current?.status!=='pending')return false;
   const target=childTarget(child,receipt);
   const source=env.combat.findEntity(child.casterId);
   if(!source||!target||target.mode==='entity'&&!validateCombatHit({casterId:child.casterId,targetId:target.targetId,allowedRelations:child.definition!.allowedTargetRelations,requiresLivingTarget:true},env.combat).allowed){
    cancelSkillInstance(r,child,r.now);env.emit({type:'effect-rejected',atMs:r.now,instanceId:child.instanceId,targetId:receipt.targetId??child.casterId,reason:source?'invalid_child_target':'entity_not_found'});return false;
   }
   const activated=activateSkillInstance(r,child,r.now,env.combat);if(!activated.success||!activated.changed)return false;
   const aim=target.mode==='entity'?env.position(target.targetId):receipt.origin;
   // Each child starts at its authenticated contact/expiry anchor, not root/caster position.
   dispatchGameplayEffects(r,{actionInstanceId:child.actionInstanceId,skillId:child.skillId,casterId:child.casterId,target,child,
    snapshot:{definition:child.definition as SkillEngineDefinition,configVersion:child.configVersion,rootOffense:child.rootOffense!,casterPosition:receipt.origin,...(aim?{aimPosition:aim}:{}),facing:{x:1,y:0}}},env,child.instanceId);
   return true;
  }
 };
}
export function nextSkillEffectBoundary(r:SkillEffectRuntime,env:SkillEffectEnvironment,horizon:number):number {
 if(!r.active)return Infinity;
 return Math.min(nextProjectileBodyBoundary(r.bullets,horizon,b=>targets(env).filter(t=>eligible(b,t.id,env).allowed),env.grid),
  Math.max(0,nextSkillInstanceExpiration(r)-r.now),Math.max(0,nextSkillTriggerExecution(r)-r.now),Math.max(0,r.effects.nextExpiration()-r.now),...r.objects.map(o=>o.remainingMs),...r.sequences.map(s=>s.remainingMs),...r.dots.groups.map(g=>Math.min(g.remainingMs,g.nextTickMs)));
}
/** Existing simulation loop supplies elapsed time. Partitioning preserves live
 * per-wave/strike stats and lets on-hit stacks start at the actual contact time. */
export function advanceSkillEffects(r:SkillEffectRuntime,now:number,env:SkillEffectEnvironment):void {
 beginSkillTriggerAdvance(r);
 env=guardedEnvironment(r,env);
 try{
 if(!Number.isFinite(now)||now<r.now)throw Error('Invalid simulation time');
 while(r.active){
  const horizon=now-r.now,boundary=nextSkillEffectBoundary(r,env,horizon),step=Math.min(horizon,boundary);
  r.now+=step;
  advanceSkillInstances(r,r.now);
  effectEvents(r.effects.advance(r.now,env.combat),env);
  if(!r.active)break;
  tickDotRuntime(r.dots,step,g=>{
   const d=r.dotPolicies.get(g);if(!d||!eligible(d,g.targetId,env).allowed){r.dots.groups=r.dots.groups.filter(n=>n!==g);return;}
   const target=env.combat.findEntity(g.targetId)!,result=dotDamage(g,damageContext(d,target,env,'dot'),env.defenseStats(target).armor);
   applyDamage(r,target,result.amount,env);
   for(const breakdown of result.breakdowns)env.emit({type:'effect-hit',atMs:r.now,instanceId:d.id+'/dot/'+g.effectId,targetId:g.targetId,mechanic:'dot',breakdown});
  },()=>r.active);
  if(!r.active)break;
  tickProjectileBodies(r,step,b=>targets(env).filter(t=>eligible(b,t.id,env).allowed),env.grid,(b,id,_elapsed,point)=>{if(eligible(b,id,env).allowed)captureSkillImpact(r,b,b.id,id,point,env.combat.findEntity(id));hit(r,b,id,b.snapshot,env,'projectile');},()=>r.active);
  if(!r.active)break;
  tickEmitterRuntime(r,step,o=>{if(o.effect.type==='timed_object')launch(r,o,emitterProjectileConfig(o.effect.projectile.config,o.config),o.position,{x:1,y:0},env);},()=>r.active);
  if(!r.active)break;
  tickAOESequenceRuntime(r,step,env.positionRoll,(s,center,index)=>aoe(r,{...s,id:`${s.id}/strike${index}`},center,s.config.aoeRadius,env,undefined,'timed_aoe_sequence'),()=>r.active);
  for(const group of r.dotPolicies.keys())if(!r.dots.groups.includes(group))r.dotPolicies.delete(group);
  drainSkillTriggers(r,env.combat,childDispatcher(r,env));
  if(r.now>=now&&nextSkillEffectBoundary(r,env,0)>1e-6)break;
 }
 }finally{endSkillTriggerAdvance(r);}
}

function guardedEnvironment(r:SkillEffectRuntime,env:SkillEffectEnvironment):SkillEffectEnvironment {
 return {...env,emit:event=>observeSkillTriggerBoundary(r,()=>env.emit(event))};
}
