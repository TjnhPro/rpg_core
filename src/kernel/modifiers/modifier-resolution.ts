import type {NumericalModifier, ModifierOperation, ModifierResult} from '../contracts/modifiers.js';
import type {ModifierAdapter, ModifierSourceSelection, PreparedModifierResult} from '../contracts/modifier-resolution.js';

const numericalAdapter: ModifierAdapter<NumericalModifier> = {
  identity: m => m.identity, enabled: m => m.enabled, target: m => m.target,
  operation: m => m.operation, value: m => m.value,
  equivalent: (previous, next) => JSON.stringify(previous) === JSON.stringify(next),
};

function select<M, Target extends string>(modifiers: readonly M[], adapter: ModifierAdapter<M, Target>, sources?: ModifierSourceSelection): M[] {
  // Complete source selection before enabled filtering/conflict detection.
  const selected = sources ? modifiers.filter(m => {
    const identity = adapter.identity(m);
    return sources.alwaysActive.has(identity.source) || sources.activeInstances.get(identity.source)?.has(identity.sourceInstanceId);
  }) : modifiers;
  const instances = new Map<string, M>();
  for (const m of selected) {
    if (!adapter.enabled(m)) continue;
    const identity = adapter.identity(m);
    const key = JSON.stringify([identity.source, identity.sourceInstanceId, identity.id]), previous = instances.get(key);
    if (instances.has(key) && !adapter.equivalent(previous!, m)) throw Error('Conflicting Modifier instance');
    instances.set(key, m);
  }
  return [...instances.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, m]) => m);
}

/** Source membership, enabled filtering, last-identical dedup and lexical tuple order.
 * Does not validate payload schemas or infer active sources. */
export function selectCanonicalModifiers<Target extends string = string, Source extends string = string>(
  modifiers: readonly NumericalModifier<Target, Source>[], sources?: ModifierSourceSelection,
): NumericalModifier<Target, Source>[];
export function selectCanonicalModifiers<M, Target extends string = string>(
  modifiers: readonly M[], adapter: ModifierAdapter<M, Target>, sources?: ModifierSourceSelection,
): M[];
export function selectCanonicalModifiers<M, Target extends string>(
  modifiers: readonly M[], adapterOrSources?: ModifierAdapter<M, Target> | ModifierSourceSelection, sources?: ModifierSourceSelection,
) {
  if (adapterOrSources && 'identity' in adapterOrSources) return select(modifiers, adapterOrSources, sources);
  // The default overload accepts only NumericalModifier; custom inputs require an
  // adapter and never enter this branch. No Legacy payload is cast/projected.
  return select(modifiers as readonly NumericalModifier[], numericalAdapter, adapterOrSources);
}

function prepare<M, Target extends string>(modifiers: readonly M[], adapter: ModifierAdapter<M, Target>, validate?: (selected: readonly M[]) => void) {
  const selected = select(modifiers, adapter);
  validate?.(selected);
  const groups = new Map<Target, M[]>();
  for (const m of selected) {
    const group = groups.get(adapter.target(m)) ?? [];
    group.push(m);
    groups.set(adapter.target(m), group);
  }
  return (base: number, target: Target): PreparedModifierResult<M, Target> => {
    const contributions = groups.get(target) ?? [];
    // Keep separate filter/reduce passes: operations and values remain live, and
    // filter finishes before any value is read for that operation.
    const sum = (op: ModifierOperation) => contributions.filter(m => adapter.operation(m) === op).reduce((n, m) => n + adapter.value(m), 0);
    const flat = sum('add_flat'), percent = sum('add_percent'), percentagePoints = sum('add_percentage_points');
    const totalFlat = base + flat, value = totalFlat * (1 + percent) + percentagePoints;
    if (!Number.isFinite(value)) throw Error('Nonfinite Modifier result');
    return {target, base, flat, percent, percentagePoints, totalFlat, value, contributions};
  };
}

/** Prepare at one caller calculation boundary. Targets/order/selection are fixed;
 * operation/value and original payloads remain live. No global cache or freezing.
 * The optional synchronous validator runs after dedup and before target grouping. */
export function prepareNumericalModifiers<Target extends string = string, Source extends string = string>(
  modifiers: readonly NumericalModifier<Target, Source>[],
): (base: number, target: Target) => ModifierResult<Target, Source>;
export function prepareNumericalModifiers<M, Target extends string = string>(
  modifiers: readonly M[], adapter: ModifierAdapter<M, Target>, validate?: (selected: readonly M[]) => void,
): (base: number, target: Target) => PreparedModifierResult<M, Target>;
export function prepareNumericalModifiers<M, Target extends string>(
  modifiers: readonly M[], adapter?: ModifierAdapter<M, Target>, validate?: (selected: readonly M[]) => void,
) {
  if (adapter) return prepare(modifiers, adapter, validate);
  return prepare(modifiers as readonly NumericalModifier[], numericalAdapter);
}

/** Exact match-any, required order then available order, with lazy normalization.
 * Empty required input is false. Vocabulary/case policy is caller-owned. */
export function matchesAnyTag(required: readonly string[], available: readonly string[], normalizeAvailable: (tag: string) => string = tag => tag): boolean {
  return required.some(t => available.some(tag => normalizeAvailable(tag) === t));
}
