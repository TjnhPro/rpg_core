import type {CombatEntity} from './combat-entity.js';
import type {CombatValidationContext,FactionRelation,CombatRestriction} from './combat-state.js';
import type {CombatModifier} from './combat-modifiers.js';


/** Gameplay identities, not Skill IDs or asset resource IDs. Caller allocates
 * replayable instance IDs; uniqueness/stack admission belongs to v0.9.1+. */
export type EffectId=string;

export type EffectInstanceId=string;

export type EffectModifier=Omit<CombatModifier,'source'|'sourceInstanceId'>;

export interface EffectDefinition {
 readonly effectId:EffectId;
 readonly durationMs:number;
 readonly modifiers?:readonly EffectModifier[];
 readonly restrictions?:readonly CombatRestriction[];
 readonly stackingPolicy?:'refresh'|'stack';
 readonly maxStacks?:number;
}

/** Effect module owns active instances, never CombatEntity or Skill actions.
 * No stats snapshot, second resource store or cached modifier calculation. */
export interface EffectInstance {
 readonly effectInstanceId:EffectInstanceId;
 readonly effectId:EffectId;
 readonly sourceEntityId:CombatEntity['entityId'];
 readonly targetEntityId:CombatEntity['entityId'];
 readonly appliedAt:number;
 readonly expiresAt:number;
 /** Last accepted group duration renewal; absent on first application. */
 readonly refreshedAt?:number;
}

/** Any gameplay caller (not only Skills) may request an entity effect. Relations
 * are explicit input for future admission through existing Combat validation. */
export interface EffectApplyRequest {
 readonly effectId:EffectId;
 readonly sourceEntityId:CombatEntity['entityId'];
 readonly targetEntityId:CombatEntity['entityId'];
 readonly allowedTargetRelations:readonly FactionRelation[];
}

export interface EffectApplyContext {
 readonly combat:CombatValidationContext;
 readonly now:number;
}

export type EffectRejection='invalid_effect_id'|'missing_effect_definition'|'invalid_effect_definition'
 | 'invalid_duration'|'invalid_entity_context'|'invalid_instance_identity'|'invalid_timeline'|'invalid_apply_request';

export type EffectValidationResult={success:true}|{success:false;reason:EffectRejection;errors?:readonly string[]};

/** Transition result contracts only. Runtime must emit ONE terminal outcome
 * per instance and remove its contributions; no lifecycle state store here. */
export type EffectTerminalOutcome=
 | {phase:'expired';instance:EffectInstance;atMs:number}
 | {phase:'removed';instance:EffectInstance;atMs:number};

export type EffectLifecycleResult={phase:'active';instance:EffectInstance;atMs:number}|EffectTerminalOutcome;

/** Existing source namespace and instance identity for v0.5 collection/resolution. */
export interface EffectModifierSource extends Pick<CombatModifier,'sourceInstanceId'> {
 readonly source:Extract<CombatModifier['source'],'buff'>;
 readonly sourceInstanceId:EffectInstanceId;
}
