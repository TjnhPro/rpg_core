import type {NumericRule} from '../contracts/common.js';
import type {PreparedStatCalculationInput, StatModifierResolver, StatCalculationResult, StatBreakdown} from '../contracts/stats.js';

// Caller identifiers include ordinary object property names such as __proto__.
function setValue<K extends string, V>(record: Record<K, V>, key: K, value: V) {
  Object.defineProperty(record, key, {value, enumerable: true, writable: true, configurable: true});
}

/** Already-resolved reduction: do not apply an additional balance cap. */
export function calculateCooldownDurationMs(baseMs: number, effectiveCdr: number): number {
  if (!Number.isFinite(baseMs) || baseMs < 0 || !Number.isFinite(effectiveCdr) || effectiveCdr < 0 || effectiveCdr > 1) throw Error('Invalid resolved cooldown');
  return baseMs * (1 - effectiveCdr);
}

/** Resolver then transform, even when disabled; clamp, precision, re-clamp.
 * No new finite checks: callback errors/nonfinite results preserve JS semantics.
 * Missing bounds are unbounded. No copy/freeze of callback diagnostics. */
export function calculateEffectiveValue<Target extends string, Resolved extends {readonly value: number}>(
  base: number, target: Target, resolve: StatModifierResolver<Target, Resolved>,
  rule: Pick<NumericRule, 'bounds' | 'enabled' | 'precision'>,
  transform: (value: number) => number = value => value,
) {
  const resolved = resolve(base, target), uncapped = transform(resolved.value);
  const clamp = (value: number) => Math.max(rule.bounds.min ?? -Infinity, Math.min(rule.bounds.max ?? Infinity, value));
  let value = rule.enabled === false ? 0 : clamp(uncapped);
  if (rule.precision !== undefined && rule.enabled !== false) value = clamp(Number(value.toFixed(rule.precision.decimalPlaces)));
  return {value, uncapped, resolved};
}

/** One ordered attribute pass followed by one ordered derived-stat pass.
 * The prepared resolver owns modifiers; this function contains no modifier math.
 * Caller supplies complete rules/orders. Training is not an implicit extra. */
export function calculateStats<A extends string, S extends string, Source extends string, Resolved extends {readonly value: number}>(
  input: PreparedStatCalculationInput<A, S, Source>, resolve: StatModifierResolver<A | S, Resolved>,
): StatCalculationResult<A, S, Source, Resolved> {
  const attributes = {} as Record<A, number>;
  const attributeDetails = {} as Record<A, StatCalculationResult<A, S, Source, Resolved>['attributeDetails'][A]>;
  for (const id of input.attributeOrder) {
    const base = input.attributeBases[id];
    const result = calculateEffectiveValue(base, id, resolve, input.attributeRules[id]);
    setValue(attributeDetails, id, {base, ...result});
    setValue(attributes, id, result.value);
  }
  const values = {} as Record<S, number>, details = {} as Record<S, StatBreakdown<A, S, Source, Resolved>>;
  for (const id of input.statOrder) {
    const rule = input.rules[id];
    const scaling = rule.scaling.reduce((n, term) => n + (term.enabled === false ? 0 : (attributes[term.attribute] - input.attributeBaselines[term.attribute]) * term.coefficient), 0);
    const base = (Object.hasOwn(input.baseStats, id) ? input.baseStats[id] : undefined) ?? rule.default;
    const flat = (Object.hasOwn(input.flatContributions, id) ? input.flatContributions[id] : undefined) ?? 0;
    const transform = input.transforms && Object.hasOwn(input.transforms, id) ? input.transforms[id] : undefined;
    const result = calculateEffectiveValue(base + scaling + flat, id, resolve, rule, transform);
    setValue(details, id, {base, scaling, flat, ...result});
    setValue(values, id, result.value);
  }
  return {attributes, attributeDetails, values, details};
}
