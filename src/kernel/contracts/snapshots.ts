import type {NumericValues} from './common.js';
import type {NumericalModifier} from './modifiers.js';
import type {DerivedStatRule} from './stats.js';
import type {NumericContribution, ResolvedDamageBonus} from './damage.js';

export interface CalculationContext<DamageType extends string = string, Tag extends string = string> {
  readonly damageType?: DamageType;
  readonly tags?: readonly Tag[];
  readonly ownerId?: string;
  readonly revision?: string;
}
/** TypeScript readonly is a compile-time access restriction only. It neither
 * detaches aliases nor freezes objects. v2.0.2 implements no capture/copy/freeze;
 * v2.0.8 owns those guarantees under its separately approved extraction plan.
 * Caller owns capture timing, identity and storage. No runtime trust is conveyed. */
export interface NumericalOffenseSnapshot<Source extends string = string, Bonus extends string = string> {
  readonly sources: NumericValues<Source>;
  readonly flatContributions: readonly NumericContribution[];
  readonly bonuses: readonly ResolvedDamageBonus<Bonus>[];
  readonly criticalChance: number;
  readonly criticalBonus: number;
}
/** Readonly data representation, not a detached or runtime-frozen object.
 * No callbacks, RNG, live reads, clocks or gameplay session authority. Detached
 * copy means independent backing objects; runtime freeze separately prevents
 * writes (deep freeze must cover nested objects). Neither is supplied in .2. */
export interface CalculationSnapshot<A extends string = string, S extends string = string, Source extends string = string, DamageType extends string = string, Tag extends string = string> {
  readonly attributes: NumericValues<A>;
  readonly stats: NumericValues<S>;
  readonly statRules: Readonly<Record<S, DerivedStatRule<A>>>;
  readonly modifiers: readonly NumericalModifier<A | S, Source>[];
  readonly context: CalculationContext<DamageType, Tag>;
}
