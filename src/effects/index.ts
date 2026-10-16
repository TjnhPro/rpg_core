export {applyDotSnapshot,tickDotRuntime,dotDamage} from './dot-core.js';
export type {DotStack,DotGroup,DotRuntime} from './dot-core.js';
export {EffectLifecycle} from './effect-lifecycle.js';
export type {EffectStackConsumeRequest,EffectStackConsumePlan,EffectStackConsumeResult,EffectStackConsumeRejection} from './effect-lifecycle.js';
export type {EffectRemovalReason,EffectLifecycleEvent,EffectOperationResult,EffectGroupView} from './effect-lifecycle.js';
export {validateEffectDefinition,defineEffect,validateEffectApplyRequest,validateEffectInstance} from './effect-system.js';
export type {EffectId,EffectInstanceId,EffectModifier,EffectDefinition,EffectInstance,EffectApplyRequest,EffectApplyContext,EffectRejection,EffectValidationResult,EffectTerminalOutcome,EffectLifecycleResult,EffectModifierSource} from '../contracts/effects.js';
export {DEFAULT_DOT,validateDots} from '../contracts/dot-contracts.js';
export type {DotConfig} from '../contracts/dot-contracts.js';
