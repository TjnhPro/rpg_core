import type {ModifierIdentity, ModifierOperation, ModifierResult} from './modifiers.js';

/** Synchronous accessors over original inputs. Stable/pure caller policies give
 * deterministic generic results; no projection, snapshot or clone is performed. */
export interface ModifierAdapter<M, Target extends string = string> {
  readonly identity: (modifier: M) => ModifierIdentity;
  readonly enabled: (modifier: M) => boolean;
  readonly target: (modifier: M) => Target;
  readonly operation: (modifier: M) => ModifierOperation;
  readonly value: (modifier: M) => number;
  readonly equivalent: (previous: M, next: M) => boolean;
}

/** Caller has already resolved lifecycle/ownership. Keys have no built-in meaning. */
export interface ModifierSourceSelection {
  readonly alwaysActive: ReadonlySet<string>;
  readonly activeInstances: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Original payloads and mutable per-target array aliases for adapter compatibility.
 * A readonly property does not freeze the array or detach its elements. */
export interface PreparedModifierResult<M, Target extends string = string>
  extends Omit<ModifierResult<Target>, 'contributions'> {
  readonly contributions: M[];
}
