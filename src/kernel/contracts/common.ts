/** Exact, nonempty caller key by contract: no normalization, universal vocabulary
 * or arbitrary length/ASCII limit. This alias performs no runtime validation. */
export type Identifier = string;
/** A TypeScript number; finite/sign/range validation is primitive-specific and
 * remains unimplemented in v2.0.2. NaN/Infinity also have type number. */
export type Scalar = number;
export type NumericValues<K extends string = string> = Readonly<Record<K, Scalar>>;
export interface NumericBounds {
  readonly min?: number;
  readonly max?: number;
}
export interface DecimalPrecision {
  /** Integer 0..100 for the toFixed numerical convention; no rounding helper is
   * implemented. Stat rounding re-clamps; regen additionally preserves current. */
  readonly decimalPlaces: number;
}
export interface NumericRule {
  readonly default: number;
  readonly bounds: NumericBounds;
  readonly enabled: boolean;
  /** Omission means no decimal rounding, not an implicit game balance default. */
  readonly precision?: DecimalPrecision;
}
export interface CalculationIssue {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}
