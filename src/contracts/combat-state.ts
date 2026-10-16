import type {CombatEntity} from './combat-entity.js';
import type {MapPoint} from './spatial.js';


export type LifeState='alive'|'defeated';

export type ActionState='idle'|'acting';

export type ActionClassification='basic'|'active';

export type CombatRestriction='stun'|'silence';

export type FactionRelation='self'|'ally'|'enemy';

export type ValidationStage='action_start'|'hit_resolution';

export type TargetContext=
 | {mode:'self';casterId:string}
 | {mode:'entity';casterId:string;targetId:string}
 | {mode:'ground';casterId:string;position:MapPoint};

export type CombatRejection='entity_not_found'|'entity_defeated'|'entity_busy'
 | 'stunned'|'silenced'|'invalid_action_classification'
 | 'invalid_target_mode'|'target_not_found'|'target_defeated'
 | 'invalid_target_relation'|'invalid_target_position';

export type CombatValidationResult={allowed:true}|{allowed:false;reason:CombatRejection};

export interface CombatValidationContext {
 // Resolved session state supplied by caller, never a request-body entity map.
 findEntity(id:string):CombatEntity|undefined;
 relation(source:CombatEntity,target:CombatEntity):FactionRelation|undefined;
 // Optional for legacy adapters. Bind to the session's active Effect owner;
 // advance expiry before gameplay operations, never request-body flags.
 hasRestriction?(entityId:string,restriction:CombatRestriction):boolean;
}

export interface CombatActionContext {
 actorId:string;
 actionState:ActionState;
 target:TargetContext;
 allowedRelations:readonly FactionRelation[];
 requiresLivingTarget:boolean;
 classification?:ActionClassification;
}

export interface ActiveCombatAction {
 actionInstanceId:string;entityId:string;actionId:string;
 startedAt:number;durationMs:number;speedMultiplier:number;
 direction?:MapPoint;
 activationDelayMs?:number;
}

export interface CombatActionSlot {activeAction?:ActiveCombatAction;actionSerial?:number}

export type EntityCombatEvent=
 | (ActiveCombatAction & {type:'action-started'|'action-completed';atMs:number})
 | (ActiveCombatAction & {type:'action-cancelled';atMs:number;reason:'defeated'|'interrupted'|'session_end'})
 | {type:'damage-applied';entityId:string;atMs:number;before:number;after:number;appliedDamage:number}
 | {type:'healing-applied';entityId:string;atMs:number;before:number;after:number;appliedHealing:number}
 | {type:'mana-gained';entityId:string;atMs:number;before:number;after:number;appliedMana:number}
 | {type:'entity-defeated';entityId:string;atMs:number};
