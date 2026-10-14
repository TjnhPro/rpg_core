export {MAX_DAMAGE_SNAPSHOT_MODIFIERS,calculateDamage,snapshotActorDamage} from './damage-core.js';
export type {DamageSnapshot} from './damage-core.js';
export {validateDefenseContext,resolveDefenseHit,mitigateDefense} from './defense-engine.js';
export {damageDefinition,DAMAGE_SOURCES,DAMAGE_TAGS} from '../contracts/damage-contracts.js';
export type {DamageSource,DamageDefinition,DamageContext,DamageModifier,DamageSettings} from '../contracts/damage-contracts.js';
export {DEFAULT_DEFENSE_SETTINGS,validateDefenseSettings} from '../contracts/defense-settings.js';
export type {DefenseType,DefenseRule,DefenseSettings,DamageDelivery,DefenseActor,DefenseContext,DefenseConfigSnapshot} from '../contracts/defense-settings.js';
