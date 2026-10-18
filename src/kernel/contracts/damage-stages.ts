/** Synchronous numerical accessors. resolveFlat runs once after ordered scaling,
 * before its numerical fields are read. Stable/pure caller policies make generic
 * calculations deterministic; these callbacks are not snapshot data. */
export interface DamageB0Input<Source extends string = string> {
  readonly perRank: number;
  readonly rank: number;
  readonly base: number;
  readonly sourceOrder: readonly Source[];
  readonly sourceValue: (source: Source) => number;
  readonly coefficient: (source: Source) => number;
  readonly resolveFlat: () => {
    readonly definition: number;
    readonly additional: number;
    readonly resolved: number;
  };
}
/** Mutable diagnostics preserve adapter compatibility. No clone/freeze guarantee. */
export interface DamageB0Result<Source extends string = string> {
  base: number;
  scaling: {source: Source; value: number}[];
  flat: number;
  raw: number;
}
