import type {NumericRule, NumericValues} from './common.js';
import type {NumericalModifier, ModifierResult} from './modifiers.js';

export interface AttributeScaling<A extends string = string> {
  readonly attribute: A;
  readonly coefficient: number;
  readonly enabled: boolean;
}
export interface DerivedStatRule<A extends string = string> extends NumericRule {
  readonly scaling: readonly AttributeScaling<A>[];
  readonly training: number;
}
export interface StatCalculationInput<A extends string = string, S extends string = string, Source extends string = string> {
  readonly attributeBases: NumericValues<A>;
  readonly attributeRules: Readonly<Record<A, NumericRule>>;
  readonly attributeBaselines: NumericValues<A>;
  readonly baseStats: Readonly<Partial<Record<S, number>>>;
  readonly rules: Readonly<Record<S, DerivedStatRule<A>>>;
  readonly flatContributions: Readonly<Partial<Record<S, number>>>;
  readonly modifiers: readonly NumericalModifier<A | S, Source>[];
  /** Synchronous pure functions, once per derived stat after modifiers, including
   * disabled stats, before bounds/precision. No call for attributes. Omission is
   * identity. Caller owns deterministic behavior; TypeScript cannot enforce
   * purity, finite returns, or independence from closed-over mutable state.
   * No callbacks are captured in numerical snapshots. */
  readonly transforms?: Readonly<Partial<Record<S, (value: number) => number>>>;
}
export interface StatBreakdown<A extends string = string, S extends string = string, Source extends string = string> {
  readonly base: number;
  readonly scaling: number;
  readonly flat: number;
  readonly resolved: ModifierResult<A | S, Source>;
  readonly uncapped: number;
  readonly value: number;
}
export interface StatCalculationResult<A extends string = string, S extends string = string, Source extends string = string> {
  readonly attributes: NumericValues<A>;
  /** Attribute pass diagnostics; permits projection of Legacy core without
   * invoking the resolver again. base/resolved/uncapped/value are final outputs. */
  readonly attributeDetails: Readonly<Record<A, {
    readonly base: number;
    readonly resolved: ModifierResult<A | S, Source>;
    readonly uncapped: number;
    readonly value: number;
  }>>;
  readonly values: NumericValues<S>;
  /** Each detail includes the evaluated scaling total and modifier result.
   * Legacy projects scaling[id] from details[id].scaling, and details/core from
   * their stored value/uncapped/resolved, without repeating any arithmetic. */
  readonly details: Readonly<Record<S, StatBreakdown<A, S, Source>>>;
}
