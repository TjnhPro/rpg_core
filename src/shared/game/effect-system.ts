import type {CombatEntity} from './combat-entity.js';
import {validateCombatEntity} from './combat-entity.js';
import {validAllowedRelations,type CombatValidationContext,type FactionRelation,type CombatRestriction} from './combat-state.js';
import {validateCombatModifiers,type CombatModifier} from '../data/combat-modifiers.js';
import {ATTRIBUTE_IDS,STAT_IDS,ELEMENTAL_STATS} from '../data/stat-contracts.js';

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

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,fields:readonly string[])=>Object.keys(v).sort().join() === [...fields].sort().join();
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.trim()===v;
const time=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const reject=(reason:EffectRejection,errors?:readonly string[]):EffectValidationResult=>({success:false,reason,...(errors?{errors}:{})});
export function validateEffectDefinition(value:unknown):EffectValidationResult {
 if(!object(value))return reject('invalid_effect_definition');
 if(!id(value.effectId))return reject('invalid_effect_id');
 if(typeof value.durationMs!=='number'||!Number.isFinite(value.durationMs)||value.durationMs<=0)return reject('invalid_duration');
 if(!exact(value,['effectId','durationMs',...['modifiers','restrictions','stackingPolicy','maxStacks'].filter(k=>Object.hasOwn(value,k))]))return reject('invalid_effect_definition',['effect: exact gameplay fields required']);
 if(Object.hasOwn(value,'restrictions')&&(!Array.isArray(value.restrictions)||new Set(value.restrictions).size!==value.restrictions.length||value.restrictions.some(r=>r!=='stun'&&r!=='silence')))return reject('invalid_effect_definition',['effect: unique stun/silence restrictions required']);
 if(Object.hasOwn(value,'stackingPolicy')&&value.stackingPolicy!=='refresh'&&value.stackingPolicy!=='stack')return reject('invalid_effect_definition',['effect: unsupported stacking policy']);
 if(value.stackingPolicy==='stack'&&(!Number.isSafeInteger(value.maxStacks)||Number(value.maxStacks)<=0))return reject('invalid_effect_definition',['effect: stack requires positive integer maxStacks']);
 if(Object.hasOwn(value,'maxStacks')&&(!Number.isSafeInteger(value.maxStacks)||Number(value.maxStacks)<=0))return reject('invalid_effect_definition',['effect: invalid maxStacks']);
 if(Object.hasOwn(value,'modifiers')){
  if(!Array.isArray(value.modifiers)||value.modifiers.some(m=>!object(m)||Object.hasOwn(m,'source')||Object.hasOwn(m,'sourceInstanceId')))return reject('invalid_effect_definition',['effect: modifier payload required']);
  const errors=validateCombatModifiers(value.modifiers.map(m=>({...m,source:'buff',sourceInstanceId:'definition'})),[...ATTRIBUTE_IDS,...STAT_IDS.filter(s=>!ELEMENTAL_STATS.has(s))]);
  if(errors.length)return reject('invalid_effect_definition',errors);
 }
 return {success:true};
}
/** Detached frozen config, pinned by the caller's existing execution context.
 * No new version catalog or implicit registry. */
export function defineEffect(value:unknown):
 {success:true;definition:EffectDefinition}|Extract<EffectValidationResult,{success:false}> {
 const result=validateEffectDefinition(value);if(!result.success)return result;
 const d=value as EffectDefinition;
 const copy=structuredClone(d);
 const freeze=(v:unknown):void=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};
 freeze(copy);return {success:true,definition:copy};
}
function definitionReference(effectId:unknown,definition:unknown):EffectValidationResult {
 if(!id(effectId))return reject('invalid_effect_id');
 if(definition===undefined||definition===null)return reject('missing_effect_definition');
 const result=validateEffectDefinition(definition);if(!result.success)return result;
 return (definition as EffectDefinition).effectId===effectId?{success:true}:reject('missing_effect_definition');
}
function entityReferences(source:unknown,target:unknown,combat:CombatValidationContext):EffectValidationResult {
 if(!id(source)||!id(target)||!combat||typeof combat.findEntity!=='function'||typeof combat.relation!=='function')return reject('invalid_entity_context');
 // Trusted session lookup; shape/reference validation is NOT target eligibility.
 // Defeated sources remain valid. No faction decision or HP mutation here.
 for(const entityId of [source,target]){
  const entity=combat.findEntity(entityId);
  if(!entity||entity.entityId!==entityId||validateCombatEntity(entity).length)return reject('invalid_entity_context');
 }
 return {success:true};
}
/** Reference validation only, not Apply, stack/refresh, alive/faction admission
 * or scheduling. v0.9.1 must use Combat Core eligibility before actual Apply. */
export function validateEffectApplyRequest(value:unknown,definition:unknown,context:EffectApplyContext):EffectValidationResult {
 if(!object(value)||!exact(value,['effectId','sourceEntityId','targetEntityId','allowedTargetRelations']))return reject('invalid_apply_request');
 const ref=definitionReference(value.effectId,definition);if(!ref.success)return ref;
 if(!context||!time(context.now))return reject('invalid_timeline');
 const end=context.now+(definition as EffectDefinition).durationMs;
 if(!Number.isFinite(end)||end<=context.now)return reject('invalid_timeline');
 if(!validAllowedRelations(value.allowedTargetRelations))return reject('invalid_apply_request');
 return entityReferences(value.sourceEntityId,value.targetEntityId,context.combat);
}
/** Validates supplied data only. No generated identity, runtime Apply, active
 * instance collection, tick, expiry/removal or source-liveness requirement. */
export function validateEffectInstance(value:unknown,definition:unknown,combat:CombatValidationContext):EffectValidationResult {
 if(!object(value)||!exact(value,['effectInstanceId','effectId','sourceEntityId','targetEntityId','appliedAt','expiresAt',...(Object.hasOwn(value,'refreshedAt')?['refreshedAt']:[])])||!id(value.effectInstanceId))return reject('invalid_instance_identity');
 const ref=definitionReference(value.effectId,definition);if(!ref.success)return ref;
 const d=definition as EffectDefinition;
 if(!time(value.appliedAt)||!time(value.expiresAt))return reject('invalid_timeline');
 const renewed=Object.hasOwn(value,'refreshedAt')?value.refreshedAt:value.appliedAt;
 if(!time(renewed)||renewed<value.appliedAt)return reject('invalid_timeline');
 const end=renewed+d.durationMs;
 // Positive duration must remain representable at this simulation timestamp.
 if(!Number.isFinite(end)||end<=renewed||value.expiresAt!==end)return reject('invalid_timeline');
 return entityReferences(value.sourceEntityId,value.targetEntityId,combat);
}
