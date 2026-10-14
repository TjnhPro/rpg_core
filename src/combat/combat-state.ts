import type {LifeState,ActionState,ActionClassification,CombatRestriction,FactionRelation,ValidationStage,TargetContext,CombatRejection,CombatValidationResult,CombatValidationContext,CombatActionContext,ActiveCombatAction,CombatActionSlot,EntityCombatEvent} from '../contracts/combat-state.js';
export type {LifeState,ActionState,ActionClassification,CombatRestriction,FactionRelation,ValidationStage,TargetContext,CombatRejection,CombatValidationResult,CombatValidationContext,CombatActionContext,ActiveCombatAction,CombatActionSlot,EntityCombatEvent} from '../contracts/combat-state.js';
import type {CombatEntity} from './combat-entity.js';
import type {MapPoint} from '../spatial/grid-geometry.js';
export function combatState(entity:CombatEntity,actionState:ActionState){
 return {lifeState:entity.currentHp>0?'alive' as LifeState:'defeated' as LifeState,actionState};
}
const reject=(reason:CombatRejection):CombatValidationResult=>({allowed:false,reason});
const validId=(id:unknown):id is string=>typeof id==='string'&&id.trim().length>0;
export function validAllowedRelations(v:unknown):v is readonly FactionRelation[]{
 return Array.isArray(v)&&v.length>0&&new Set(v).size===v.length&&v.every(r=>['self','ally','enemy'].includes(r));
}
export function validateTargetContext(target:unknown):CombatValidationResult {
 if(!target||typeof target!=='object')return reject('invalid_target_mode');
 const t=target as Record<string,unknown>;
 if(!['self','entity','ground'].includes(String(t.mode)))return reject('invalid_target_mode');
 if(!validId(t.casterId))return reject('entity_not_found');
 if(t.mode==='entity'&&!validId(t.targetId))return reject('target_not_found');
 if(t.mode==='ground'){
  const p=t.position as MapPoint|undefined;
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return reject('invalid_target_position');
 }
 return {allowed:true};
}
export function factionRelation(source:CombatEntity,target:CombatEntity,context:CombatValidationContext):FactionRelation|undefined {
 if(source.entityId===target.entityId)return 'self';
 const relation=context.relation(source,target);
 // Same faction is not necessarily ally; different faction is not necessarily enemy.
 return relation==='ally'||relation==='enemy'?relation:undefined;
}
export function validateCombatAction(action:CombatActionContext,context:CombatValidationContext):CombatValidationResult {
 if(action.actionState!=='idle'&&action.actionState!=='acting')throw Error('Invalid configured action state');
 const source=context.findEntity(action.actorId);
 if(!source)return reject('entity_not_found');
 if(source.currentHp<=0)return reject('entity_defeated');
 if(action.classification!==undefined&&action.classification!=='basic'&&action.classification!=='active')return reject('invalid_action_classification');
 if(context.hasRestriction?.(source.entityId,'stun'))return reject('stunned');
 // Missing classification is active, never an implicit Basic exemption.
 if(action.classification!=='basic'&&context.hasRestriction?.(source.entityId,'silence'))return reject('silenced');
 if(action.actionState==='acting')return reject('entity_busy');
 const structure=validateTargetContext(action.target);if(!structure.allowed)return structure;
 if(action.target.casterId!==source.entityId)return reject('entity_not_found');
 if(!validAllowedRelations(action.allowedRelations))return reject('invalid_target_relation');
 if(action.target.mode==='ground')return {allowed:true};
 const target=action.target.mode==='self'?source:context.findEntity(action.target.targetId);
 if(!target)return reject('target_not_found');
 if(action.requiresLivingTarget&&target.currentHp<=0)return reject('target_defeated');
 const relation=factionRelation(source,target,context);
 if(!relation||!action.allowedRelations.includes(relation))return reject('invalid_target_relation');
 return {allowed:true};
}
// Called with the validated mechanic contact, separately from Action Start.
// Source liveness is deliberately absent: existing snapshots may outlive caster.
export function validateCombatHit(hit:{casterId:string;targetId:string;allowedRelations:readonly FactionRelation[];requiresLivingTarget:boolean},context:CombatValidationContext):CombatValidationResult {
 const target=context.findEntity(hit.targetId);
 if(!target)return reject('target_not_found');
 if(hit.requiresLivingTarget&&target.currentHp<=0)return reject('target_defeated');
 const source=context.findEntity(hit.casterId);if(!source)return reject('entity_not_found');
 const relation=factionRelation(source,target,context);
 if(!validAllowedRelations(hit.allowedRelations)||!relation||!hit.allowedRelations.includes(relation))return reject('invalid_target_relation');
 return {allowed:true};
}

// Slot is the existing runtime actor's action, not a scheduler or Life State.
// Callers supply resolved stats and session entities, never request timings.
export function startCombatAction(slot:CombatActionSlot,action:Omit<CombatActionContext,'actionState'>,
 context:CombatValidationContext,actionId:string,now:number,baseDurationMs:number,speedMultiplier:number,
 out?:Pick<EntityCombatEvent[],'push'>|null,direction?:MapPoint,activationDelayMs=0):CombatValidationResult {
 const result=validateCombatAction({...action,actionState:slot.activeAction?'acting':'idle'},context);
 if(!result.allowed)return result;
 if(!validId(actionId)||!Number.isFinite(now)||now<0||!Number.isFinite(baseDurationMs)||baseDurationMs<=0
  ||!Number.isFinite(speedMultiplier)||speedMultiplier<=0||!Number.isFinite(activationDelayMs)||activationDelayMs<0||activationDelayMs>baseDurationMs/speedMultiplier)throw Error('Invalid resolved action timing');
 const serial=(slot.actionSerial??0)+1;
 if(!Number.isSafeInteger(serial))throw Error('Action identity exhausted');
 slot.actionSerial=serial;
 slot.activeAction={actionInstanceId:`${action.actorId}#${serial}`,entityId:action.actorId,actionId,
  startedAt:now,durationMs:baseDurationMs/speedMultiplier,speedMultiplier,activationDelayMs,...(direction?{direction:{...direction}}:{})};
 out?.push({...slot.activeAction,type:'action-started',atMs:now});return result;
}
export function completeCombatAction(slot:CombatActionSlot,now:number,out?:Pick<EntityCombatEvent[],'push'>|null):boolean {
 const a=slot.activeAction;if(!a||now+1e-6<a.startedAt+a.durationMs)return false;
 delete slot.activeAction;
 out?.push({...a,type:'action-completed',atMs:a.startedAt+a.durationMs});return true;
}
export function cancelCombatAction(slot:CombatActionSlot,now:number,reason:Extract<EntityCombatEvent,{type:'action-cancelled'}>['reason'],out?:Pick<EntityCombatEvent[],'push'>|null):boolean {
 const a=slot.activeAction;if(!a)return false;delete slot.activeAction;
 out?.push({...a,type:'action-cancelled',atMs:now,reason});return true;
}
/** Call immediately after status Apply (and before activation/completion).
 * One existing terminal transition; no restriction store or resource rollback.
 * Defeat wins when already visible at this ordered operation. */
export function reconcileCombatRestrictions(slot:CombatActionSlot,context:CombatValidationContext,now:number,out?:Pick<EntityCombatEvent[],'push'>|null):boolean {
 const action=slot.activeAction;if(!action)return false;
 const entity=context.findEntity(action.entityId);
 if(!entity||entity.currentHp<=0)return cancelCombatAction(slot,now,entity?'defeated':'session_end',out);
 return context.hasRestriction?.(entity.entityId,'stun')?cancelCombatAction(slot,now,'interrupted',out):false;
}
/** Intent admission only; no path, position or movement state is owned here. */
export function validateMovementIntent(entityId:string,context:CombatValidationContext):CombatValidationResult {
 const entity=context.findEntity(entityId);
 if(!entity)return reject('entity_not_found');
 if(entity.currentHp<=0)return reject('entity_defeated');
 return context.hasRestriction?.(entityId,'stun')?reject('stunned'):{allowed:true};
}
export function combatActionPhase(action:ActiveCombatAction,now:number):number {
 return Math.max(0,Math.min(1,(now-action.startedAt)/action.durationMs));
}
export function sanitizeActionSlot(slot:CombatActionSlot,entityId:string,now:number,baseDurationMs:number):void {
 if(!Number.isSafeInteger(slot.actionSerial)||slot.actionSerial!<0)delete slot.actionSerial;
 const a=slot.activeAction;
 if(a&&(!validId(a.actionId)||a.entityId!==entityId||a.actionInstanceId!==`${entityId}#${slot.actionSerial}`
  ||![a.startedAt,a.durationMs,a.speedMultiplier].every(Number.isFinite)||a.startedAt<0||a.startedAt>now||a.durationMs<=0||a.speedMultiplier<=0
  ||Math.abs(a.durationMs*a.speedMultiplier-baseDurationMs)>1e-6
  ||a.activationDelayMs!==undefined&&(!Number.isFinite(a.activationDelayMs)||a.activationDelayMs<0||a.activationDelayMs>a.durationMs)
  ||a.direction&&(!Number.isFinite(a.direction.x)||!Number.isFinite(a.direction.y))))delete slot.activeAction;
}
