export {applyEntityDamage,validateCombatEntity,validateCombatEntities} from './combat-entity.js';
export {combatState,validAllowedRelations,validateTargetContext,factionRelation,validateCombatAction,validateCombatHit,startCombatAction,completeCombatAction,cancelCombatAction,reconcileCombatRestrictions,validateMovementIntent,combatActionPhase} from './combat-state.js';
export type {CombatEntity,CombatEntityIdentity} from '../contracts/combat-entity.js';
export type {LifeState,ActionState,ActionClassification,CombatRestriction,FactionRelation,ValidationStage,TargetContext,CombatRejection,CombatValidationResult,CombatValidationContext,CombatActionContext,ActiveCombatAction,CombatActionSlot,EntityCombatEvent} from '../contracts/combat-state.js';
