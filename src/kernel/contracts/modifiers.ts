export type ModifierOperation = 'add_flat' | 'add_percent' | 'add_percentage_points';
export interface ModifierIdentity<Source extends string = string> {
  readonly source: Source;
  readonly sourceInstanceId: string;
  readonly id: string;
}
export interface NumericalModifier<Target extends string = string, Source extends string = string> {
  readonly identity: ModifierIdentity<Source>;
  readonly target: Target;
  readonly operation: ModifierOperation;
  readonly value: number;
  readonly enabled: boolean;
}
export interface ModifierResult<Target extends string = string, Source extends string = string> {
  readonly target: Target;
  readonly base: number;
  readonly flat: number;
  readonly percent: number;
  readonly percentagePoints: number;
  readonly totalFlat: number;
  readonly value: number;
  readonly contributions: readonly NumericalModifier<Target, Source>[];
}
