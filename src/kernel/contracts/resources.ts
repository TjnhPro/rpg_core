import type {DecimalPrecision} from './common.js';

export interface ResourceTransitionRule {
  readonly minimum: number;
  readonly currentAboveMaximum: 'allow' | 'reject';
  readonly allowIncreaseFromMinimum: boolean;
}
export interface ResourceTransitionInput<Resource extends string = string> {
  readonly resource: Resource;
  readonly current: number;
  readonly maximum: number;
  readonly amount: number;
  readonly operation: 'increase' | 'decrease';
  readonly rule: ResourceTransitionRule;
}
export interface ResourceTransitionResult<Resource extends string = string> {
  readonly resource: Resource;
  readonly before: number;
  readonly after: number;
  /** Authoritative applied magnitude: above-max damage clamping means this must
   * not universally be reconstructed as abs(after - before). */
  readonly applied: number;
  /** A transition: before > minimum && after === minimum; no death authority. */
  readonly reachedMinimum: boolean;
}
export interface ResourceNormalizationInput<Resource extends string = string> {
  readonly resource: Resource;
  readonly current?: number;
  readonly minimum: number;
  readonly maximum: number;
}
export interface ResourceNormalizationResult<Resource extends string = string> {
  readonly resource: Resource;
  readonly before: number | undefined;
  readonly after: number;
  readonly initialized: boolean;
}
export interface ResourceRegenerationInput<Resource extends string = string> {
  readonly resource: Resource;
  readonly current: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly ratePerSecond: number;
  readonly elapsedSeconds: number;
  readonly eligible: boolean;
  readonly precision: DecimalPrecision;
}
