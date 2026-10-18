// Compile-only numerical scenarios. Installed consumer replaces this sole import.
import type {
  Identifier, Scalar, NumericValues, NumericBounds, DecimalPrecision, NumericRule, CalculationIssue,
  ModifierOperation, ModifierIdentity, NumericalModifier, ModifierResult,
  AttributeScaling, DerivedStatRule, StatCalculationInput, StatBreakdown, StatCalculationResult,
  NumericContribution, DamageScaling, ResolvedDamageBonus, DamageCalculationInput, DamageCalculationResult,
  RandomRoll, ProbabilityRule, HitCalculationInput, HitCalculationResult,
  CriticalCalculationInput, CriticalCalculationResult, RatingMitigationRule, MitigationCalculationInput, MitigationCalculationResult,
  ResourceTransitionRule, ResourceTransitionInput, ResourceTransitionResult,
  ResourceNormalizationInput, ResourceNormalizationResult, ResourceRegenerationInput,
  CalculationContext, NumericalOffenseSnapshot, CalculationSnapshot,
} from '../../src/kernel/index.js';

export const identifier: Identifier = 'nội_lực:custom/命中';
export const scalar: Scalar = 10;
export const bounds: NumericBounds = {min: 0};
export const precision: DecimalPrecision = {decimalPlaces: 4};
export const rule: NumericRule = {default: 0, bounds, enabled: true, precision};
export const issue: CalculationIssue = {code: 'caller_diagnostic', path: ['damage', 0], message: 'caller-owned'};
export const operation: ModifierOperation = 'add_flat';
export const identity: ModifierIdentity<'menu-choice'> = {source: 'menu-choice', sourceInstanceId: 'turn:1', id: 'attack'};
export const modifier: NumericalModifier<'power', 'menu-choice'> = {identity, target: 'power', operation, value: 2, enabled: true};
export const modifierResult: ModifierResult<'luck' | 'power', 'menu-choice'> = {
  target: 'power', base: 10, flat: 2, percent: 0, percentagePoints: 0, totalFlat: 12, value: 12, contributions: [modifier],
};
export const scaling: AttributeScaling<'luck'> = {attribute: 'luck', coefficient: 2, enabled: true};
export const derived: DerivedStatRule<'luck'> = {...rule, scaling: [scaling], training: 0};
export const values: NumericValues<'luck'> = {luck: 4};
// Text RPG: no HP/MP, position, projectile or Skill.
export const textRpg: StatCalculationInput<'luck', 'power', 'menu-choice'> = {
  attributeBases: values, attributeRules: {luck: rule}, attributeBaselines: {luck: 0},
  baseStats: {}, rules: {power: derived}, flatContributions: {}, modifiers: [modifier],
  transforms: {power: value => value},
};
export const detail: StatBreakdown<'luck', 'power', 'menu-choice'> = {
  base: 0, scaling: 8, flat: 0, resolved: modifierResult, uncapped: 12, value: 12,
};
export const statResult: StatCalculationResult<'luck', 'power', 'menu-choice'> = {
  attributes: values,
  attributeDetails: {luck: {base: 4, resolved: {...modifierResult, target: 'luck'}, uncapped: 4, value: 4}},
  values: {power: 12}, details: {power: detail},
};
// Compile-only projection evidence for all five Legacy result fields.
// Field reads only: no resolver, transform or calculation is invoked.
export const projections = {
  attributes: statResult.attributes,
  core: {luck: {value: statResult.attributeDetails.luck.value, uncapped: statResult.attributeDetails.luck.uncapped, resolved: statResult.attributeDetails.luck.resolved}},
  values: statResult.values,
  details: {power: {value: statResult.details.power.value, uncapped: statResult.details.power.uncapped, resolved: statResult.details.power.resolved}},
  scaling: {power: statResult.details.power.scaling},
};
export const term: NumericContribution<'choice'> = {id: 'choice', value: 3};
export const damageScaling: DamageScaling<'omen'> = {source: 'omen', value: 4, coefficient: 2};
export const bonus: ResolvedDamageBonus<'omen-bonus'> = {id: 'omen-bonus', source: 'dialogue', eligible: true, reason: 'resolved', value: .1, contributions: [term]};
export const damage: DamageCalculationInput<'omen', 'omen-bonus'> = {
  base: 10, scaling: [damageScaling], rank: 1, perRank: 0, flat: 0, flatContributions: [term], bonuses: [bonus], criticalBonus: 0,
};
export const damageResult: DamageCalculationResult<'omen', 'omen-bonus'> = {
  b0: {base: 10, scaling: [{source: 'omen', value: 8}], flat: 3, raw: 21},
  b1: {bonuses: [bonus], criticalBonus: 0, totalBonus: .1}, beforeDefense: 23.1,
};
export const random: RandomRoll = () => .5;
export const probability: ProbabilityRule = {enabled: true, bounds: {min: 0, max: .85}};
export const hit: HitCalculationInput = {eligible: true, rule: probability, roll: random};
export const hitResult: HitCalculationResult = {hit: true, dodged: false, onHitSuccess: true, eligible: true, enabled: true, chance: 0, roll: null};
export const critical: CriticalCalculationInput = {chance: .1, bonus: .5, eligible: true, rule: probability, roll: random};
export const criticalResult: CriticalCalculationResult = {chance: .1, roll: .5, isCritical: false, bonus: 0, multiplier: 1};
export const ratingRule: RatingMitigationRule = {enabled: true, bounds: {min: 0, max: .85}, levelScalingEnabled: false};
export const defense: MitigationCalculationInput<'ward'> = {damage: 10, ruleKey: 'ward', rating: 20, rule: ratingRule};
export const defenseResult: MitigationCalculationResult<'ward'> = {
  ruleKey: 'ward', status: 'missing_config', missing: ['baseK', 'levelPenalty'], levelGap: null, levelScalingEnabled: false,
  effectiveK: null, rawReduction: 0, reduction: 0, inputDamage: 10, preventedDamage: 0, finalDamage: 10,
};
export const transitionRule: ResourceTransitionRule = {minimum: 0, currentAboveMaximum: 'reject', allowIncreaseFromMinimum: true};
export const resource: ResourceTransitionInput<'resolve'> = {resource: 'resolve', current: 5, maximum: 10, amount: 2, operation: 'increase', rule: transitionRule};
export const resourceResult: ResourceTransitionResult<'resolve'> = {resource: 'resolve', before: 5, after: 7, applied: 2, reachedMinimum: false};
export const normalize: ResourceNormalizationInput<'rage'> = {resource: 'rage', minimum: 0, maximum: 100};
export const normalized: ResourceNormalizationResult<'rage'> = {resource: 'rage', before: undefined, after: 100, initialized: true};
export const regen: ResourceRegenerationInput<'energy'> = {resource: 'energy', current: 10, minimum: 0, maximum: 100, ratePerSecond: 1, elapsedSeconds: 1, eligible: true, precision: {decimalPlaces: 12}};
// Vo Lam-style vocabulary without Skill/Mechanics schema imports.
export const voLam: NumericalOffenseSnapshot<'str' | 'dex' | 'int' | 'vit'> = {
  sources: {str: 10, dex: 20, int: 30, vit: 40}, flatContributions: [], bonuses: [], criticalChance: .1, criticalBonus: .5,
};
export const context: CalculationContext<'nội-công', 'direct' | 'custom/tag'> = {damageType: 'nội-công', tags: ['custom/tag'], ownerId: 'opaque-label', revision: 'rules-a'};
// ARPG: resolved numeric terms, no Support Gem, Buff or equipment objects.
export const arpg: CalculationSnapshot<'spirit', 'ward', 'aspect:custom', 'void', 'spell/custom'> = {
  attributes: {spirit: 4}, stats: {ward: 10},
  statRules: {ward: {...rule, scaling: [{attribute: 'spirit', coefficient: 1, enabled: true}], training: 0}},
  modifiers: [{identity: {source: 'aspect:custom', sourceInstanceId: 'choice', id: 'ward'}, target: 'ward', operation: 'add_percentage_points', value: .1, enabled: true}],
  context: {damageType: 'void', tags: ['spell/custom']},
};
// @ts-expect-error readonly keyed values
values.luck = 2;
// @ts-expect-error deeply readonly numerical contribution
modifier.identity.id = 'changed';
// @ts-expect-error narrowed caller key space
const badKey: NumericValues<'luck'> = {str: 1};
// @ts-expect-error no new modifier operation
const badOperation: ModifierOperation = 'more';
// @ts-expect-error explicit undefined is not omission
const badBounds: NumericBounds = {min: undefined};
// @ts-expect-error current may be omitted, but not explicitly undefined
const badCurrent: ResourceNormalizationInput = {resource: 'x', current: undefined, minimum: 0, maximum: 1};
// @ts-expect-error transform is synchronous numeric, never a Promise
const badTransform: StatCalculationInput<'luck', 'power'> = {...textRpg, transforms: {power: async n => n}};
// @ts-expect-error snapshots contain no transform callbacks
const badSnapshot: CalculationSnapshot = {...arpg, transforms: {ward: (n: number) => n}};
// Numeric aliases cannot enforce finite values or callback purity.
export const typeSafetyIsNotValidation: Scalar = NaN;
