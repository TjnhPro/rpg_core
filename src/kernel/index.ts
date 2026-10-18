/** Universal numerical contracts and canonical attribute/stat calculations. */
export type {Identifier, Scalar, NumericValues, NumericBounds, DecimalPrecision, NumericRule, CalculationIssue} from './contracts/common.js';
export type {ModifierOperation, ModifierIdentity, NumericalModifier, ModifierResult} from './contracts/modifiers.js';
export type {AttributeScaling, DerivedStatRule, StatCalculationInput, StatBreakdown, StatCalculationResult, PreparedStatCalculationInput, StatModifierResolver} from './contracts/stats.js';
export {calculateEffectiveValue, calculateStats, calculateCooldownDurationMs} from './stats/stat-calculation.js';
export type {NumericContribution, DamageScaling, ResolvedDamageBonus, DamageCalculationInput, DamageCalculationResult} from './contracts/damage.js';
export type {RandomRoll, ProbabilityRule, HitCalculationInput, HitCalculationResult, CriticalCalculationInput, CriticalCalculationResult, RatingMitigationRule, MitigationCalculationInput, MitigationCalculationResult} from './contracts/defense.js';
export type {ResourceTransitionRule, ResourceTransitionInput, ResourceTransitionResult, ResourceNormalizationInput, ResourceNormalizationResult, ResourceRegenerationInput} from './contracts/resources.js';
export type {CalculationContext, NumericalOffenseSnapshot, CalculationSnapshot} from './contracts/snapshots.js';
