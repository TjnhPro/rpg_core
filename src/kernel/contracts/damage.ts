export interface NumericContribution<Key extends string = string> {
  readonly id: Key;
  readonly value: number;
}
export interface DamageScaling<Source extends string = string> {
  readonly source: Source;
  readonly value: number;
  readonly coefficient: number;
}
export interface ResolvedDamageBonus<Key extends string = string> {
  readonly id: Key;
  readonly source: string;
  readonly eligible: boolean;
  readonly reason: string;
  readonly value: number;
  readonly contributions: readonly NumericContribution[];
}
export interface DamageCalculationInput<Source extends string = string, Bonus extends string = string> {
  readonly base: number;
  readonly scaling: readonly DamageScaling<Source>[];
  readonly rank: number;
  readonly perRank: number;
  readonly flat: number;
  /** Ordered, already resolved numeric flat terms, not raw modifier values.
   * Legacy retains its original modifier objects for contribution diagnostics. */
  readonly flatContributions: readonly NumericContribution[];
  readonly bonuses: readonly ResolvedDamageBonus<Bonus>[];
  readonly criticalBonus: number;
}
export interface DamageCalculationResult<Source extends string = string, Bonus extends string = string> {
  readonly b0: {
    readonly base: number;
    readonly scaling: readonly {readonly source: Source; readonly value: number}[];
    readonly flat: number;
    readonly raw: number;
  };
  readonly b1: {
    readonly bonuses: readonly ResolvedDamageBonus<Bonus>[];
    readonly criticalBonus: number;
    readonly totalBonus: number;
  };
  readonly beforeDefense: number;
}
