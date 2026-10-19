import type {DamageB0Input, DamageB0Result} from '../contracts/damage-stages.js';

/** Landed-hit B0 stage. Source order and live numerical read boundaries are
 * explicit; validation, eligibility, modifier resolution and RNG are caller-owned. */
export function calculateDamageB0<Source extends string = string>(input: DamageB0Input<Source>): DamageB0Result<Source> {
  const rankFactor = 1 + input.perRank * Math.max(0, input.rank - 1);
  const base = input.base * rankFactor;
  const scaling = input.sourceOrder.map(source => ({source, value: input.sourceValue(source) * input.coefficient(source) * rankFactor}));
  const terms = input.resolveFlat();
  const flat = terms.definition + terms.additional + terms.resolved;
  const raw = base + scaling.reduce((sum, s) => sum + s.value, 0) + flat;
  return {base, scaling, flat, raw};
}

/** Ordered selected-source products. Each value is read before its coefficient;
 * an empty list reads neither. Selection/eligibility/diagnostics stay with caller. */
export function calculateDamageBonusValue<Source>(sources: readonly Source[], value: (source: Source) => number, coefficient: () => number): number {
  return sources.reduce((n, source) => n + value(source) * coefficient(), 0);
}

/** B1 consumes already effective bonuses and an already selected additive Crit
 * bonus. No eligibility, RNG, validation, rounding or defense is performed here. */
export function calculateDamageB1<Bonus extends {readonly value: number}>(raw: number, bonuses: readonly Bonus[], criticalBonus: number): {criticalBonus: number; totalBonus: number; beforeDefense: number} {
  const totalBonus = bonuses.reduce((sum, bonus) => sum + bonus.value, 0) + criticalBonus;
  const beforeDefense = Math.max(0, Math.max(0, raw) * (1 + totalBonus));
  return {criticalBonus, totalBonus, beforeDefense};
}
