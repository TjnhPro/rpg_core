import type {NumericBounds} from './common.js';

/** Per-step lazy caller RNG (or explicit roll), never an eagerly sampled pair.
 * Orchestrator resolves Dodge before Crit. Eligible landed Crit still draws at
 * zero chance; zero/disabled/ineligible Dodge does not. No RNG implementation. */
export type RandomRoll = number | (() => number);
export interface ProbabilityRule {
  readonly enabled: boolean;
  readonly bounds: NumericBounds;
}
export interface HitCalculationInput {
  readonly dodgeChance?: number;
  readonly eligible: boolean;
  readonly rule: ProbabilityRule;
  readonly roll: RandomRoll;
}
export interface HitCalculationResult {
  readonly hit: boolean;
  readonly dodged: boolean;
  readonly onHitSuccess: boolean;
  readonly eligible: boolean;
  readonly enabled: boolean;
  readonly chance: number;
  readonly roll: number | null;
}
export interface CriticalCalculationInput {
  readonly chance: number;
  readonly bonus: number;
  readonly eligible: boolean;
  readonly rule: ProbabilityRule;
  readonly roll: RandomRoll;
}
export interface CriticalCalculationResult {
  readonly chance: number;
  readonly roll: number | null;
  readonly isCritical: boolean;
  readonly bonus: number;
  /** Diagnostic 1 + bonus. B1 keeps the additive bonus; no independent damage
   * multiplication or bonus->multiplier->bonus round-trip is implied. */
  readonly multiplier: number;
}
export interface RatingMitigationRule {
  readonly enabled: boolean;
  readonly bounds: NumericBounds;
  readonly baseK?: number;
  readonly levelPenalty?: number;
  readonly levelScalingEnabled: boolean;
}
export interface MitigationCalculationInput<RuleKey extends string = string> {
  readonly damage: number;
  readonly ruleKey: RuleKey;
  readonly rating: number;
  readonly sourceLevel?: number;
  readonly targetLevel?: number;
  readonly rule: RatingMitigationRule;
}
export interface MitigationCalculationResult<RuleKey extends string = string> {
  readonly ruleKey: RuleKey;
  readonly status: 'disabled' | 'missing_config' | 'applied';
  readonly missing: readonly string[];
  readonly levelGap: number | null;
  readonly levelScalingEnabled: boolean;
  readonly effectiveK: number | null;
  readonly rawReduction: number;
  readonly reduction: number;
  readonly inputDamage: number;
  readonly preventedDamage: number;
  readonly finalDamage: number;
}
