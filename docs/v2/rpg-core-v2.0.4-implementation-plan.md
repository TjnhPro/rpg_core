# RPG Core v2.0.4 implementation plan — Modifier Resolver Extraction

Status: **IMPLEMENTATION AND PRESERVATION APPROVED — FINAL REVIEW PENDING**. Developer approved
this implementation cut at HEAD `390c6e8c96f467903401d18b32a4e44184b5f94e`.
The implementation and targeted evidence are recorded in
[the extraction report](2.0.4-modifier-resolver-extraction.md). Preservation
approval was granted separately on 2026-10-18; the exact reviewed module-13
amendment is applied with Developer authority. The planned gates below retain
their original sequence; the extraction report records their execution.

## Verified starting point

- Branch: `audit/v2.0.0-architecture-boundaries`.
- HEAD: `390c6e8c96f467903401d18b32a4e44184b5f94e`, matching PR #6's head.
- Working tree was clean before this plan was added. PR #6 remains open.
- The new task explicitly accepts v2.0.3, including its callback parity patch;
  historical reports retain their original review-time statuses.
- Local Node: `24.18.0`.
- Current `npm test -- tests/modifiers tests/stats tests/damage`: **98 tests /
  seven files PASS**, 1.39 seconds. This is focused preflight, not a new full verify.
- Current architecture and preservation checks: **PASS**. Kernel currently has
  44 exports (41 types, three runtime functions), nine reachable declaration files.
- Read the task's mandatory source/docs, README, public barrels, relevant tests,
  preservation policy/checker and all production call sites of the five named APIs.

## Current canonical ownership and call graph

`src/modifiers/modifier-core.ts` owns:

| Function | Current responsibility | Proposed owner/cut |
| --- | --- | --- |
| `uniqueModifierInstances` (private) | Enabled filtering, identity tuple, full-JSON conflict comparison, last identical duplicate retained, lexical sorting | Move orchestration once to Kernel; Legacy supplies full-payload equivalence |
| `prepareModifierResolver` | Dedup, Legacy validation, target grouping, three ordered operation passes, final finite-result rejection | Legacy validates; Kernel selects/groups/aggregates |
| `resolveModifiers` | Prepare and resolve one target | Keep Legacy wrapper, same signature/body if possible |
| `collectActiveModifiers` | Source membership policy followed by enabled/dedup/sort | Legacy maps active source sets; Kernel performs generic source selection and canonicalization |
| `damageBonusReason` | Damage type/scope policy, lazy event-tag lowercase matching, target fallback, reason precedence, attacker-only behavior | Keep Legacy policy and reason strings; delegate match-any primitive only |

`src/contracts/combat-modifiers.ts::validateCombatModifiers` remains completely
unchanged. It owns exact fields, 256-entry budget, vocabulary, numerical bounds,
target-operation restrictions, empty-condition requirement and ordered errors.
`strictDerived=false` in prepared resolution remains unchanged. Collection itself
does not validate, and the prepared budget applies after enabled filtering/dedup,
as at this HEAD. No new pre-dedup budget check will be added.

Production call graph:

- `collectActiveModifiers` is a public application adapter; production Core does
  not call it internally. Effects supplies already-owned active modifier instances.
- Legacy Stats references the prepared resolver type. Kernel Stats invokes the
  injected resolver once per target and preserves the full result by reference.
- Damage `calculateDamage` prepares flat/bonus collections, resolves eligible flat
  damage, and calls `damageBonusReason` for bonus diagnostics. `actorOffense`
  resolves `damage.flat`; snapshot validation also prepares the collection.
- DoT `applyDotSnapshot` calls `damageBonusReason(..., true)` after its existing
  snapshot copy. Its flat filtering and lifecycle remain unchanged.
- Effect-definition validation calls `validateCombatModifiers` with buff mapping;
  Skill stack-damage validation calls the same validator. Neither moves.
- Examples/headless, shared Skill fixtures, Stats goldens, Effects/Skills tests and
  installed consumers exercise these public paths. No runtime engine is replaced.

`damageBonusReason` is exported from its internal module for Damage/DoT but is
absent from root/domain barrels. It will stay absent; this task does not add a
Legacy public export. Root retains 243 symbols and all ten old entrypoints.

## Observed behavior that constrains the extraction

Read-only probes of current source, transpiled in memory, confirmed:

1. Identical duplicate objects retain the **last original object**, not the first.
2. A present target's contribution array is reused across resolve calls; absent
   targets receive a fresh empty array on each call. Results themselves are fresh.
3. Original contribution objects remain live. After prepare, changing target,
   enabled or identity does not regroup, reselect or resort. Changing operation
   and value changes later arithmetic. A probe changing flat 2 to percent 4,
   then resolving base 2 on the original target, returns exactly 10.
4. Returned contribution arrays are mutable in Legacy. Caller mutations must remain
   observable on that target's later resolutions; no copying/revalidation layer.
5. Conflicting duplicates reject before condition/other validation, with exact
   `Conflicting Modifier instance`. Disabled entries are skipped before conflicts.
6. Only the final value gets `Number.isFinite`; exact error is
   `Nonfinite Modifier result`. No new base, cap, rounding or intermediate checks.

One task-description discrepancy is resolved in favor of actual accepted behavior:
`damage_bonus` with negative percentage points is currently accepted by the
validator. The negative-value restriction applies to targets beginning `damage.`
(`damage.flat`, `damage.tag.*`). Preflight directly confirmed this distinction.
The plan preserves it and adds a regression; it does not tighten validation.

v2.0.3 constraints: no edits to either Stat calculator, prepared seam, public
signatures, resource/cooldown arithmetic, transform sequencing or mutable config
accessors. Keep both existing 38-scenario golden files intact. All 89 Stats tests
must pass unchanged, including exact callback errors and reference identities.

## Proposed implementation cut

Create `src/kernel/modifiers/modifier-resolution.ts` as the only canonical
selection/dedup/sort/grouping/operation implementation. Create a supporting
Kernel-only contract module. Legacy delegates through direct numerical accessors,
not projected modifier clones or identity-to-object reconstruction maps.

The pipeline is:

1. Optional source selection: filter the whole input using caller-supplied opaque
   membership data before canonical dedup. Omitted selection means no source filter.
2. Skip disabled; build `JSON.stringify([source, sourceInstanceId, id])`; compare
   duplicate full payloads via the equivalence hook; retain last identical input.
3. Sort keys with `<`/`>` and return original objects.
4. Prepared path invokes the optional Legacy validation callback exactly once on
   selected, canonical entries, before reading targets for grouping. Empty Legacy
   input retains its current validation skip inside the callback.
5. Group by target once, storing mutable arrays of original objects.
6. Resolve using the existing three `filter(...).reduce(..., 0)` passes in order:
   flat, percent, percentage points. Do not fuse passes or snapshot operations/
   values. Compute `totalFlat = base + flat`, then
   `value = totalFlat * (1 + percent) + percentagePoints`, with final finite check.

No global cache. No new condition evaluator. No runtime lifecycle inference.
Default numerical callers use the same implementation with a nested-identity
adapter; custom payload callers explicitly supply accessors/equivalence.

## Exact proposed additive public interfaces

Existing 41 Kernel type exports, defaults and declarations remain unchanged.
Add these **three types** in `src/kernel/contracts/modifier-resolution.ts`:

```ts
import type {ModifierIdentity, ModifierOperation, ModifierResult}
  from './modifiers.js';

export interface ModifierAdapter<M, Target extends string = string> {
  readonly identity: (modifier: M) => ModifierIdentity;
  readonly enabled: (modifier: M) => boolean;
  readonly target: (modifier: M) => Target;
  readonly operation: (modifier: M) => ModifierOperation;
  readonly value: (modifier: M) => number;
  readonly equivalent: (previous: M, next: M) => boolean;
}

export interface ModifierSourceSelection {
  readonly alwaysActive: ReadonlySet<string>;
  readonly activeInstances: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface PreparedModifierResult<M, Target extends string = string>
  extends Omit<ModifierResult<Target>, 'contributions'> {
  readonly contributions: M[];
}
```

Add **three runtime exports** only through `@rpg/core/kernel`:

```ts
export function selectCanonicalModifiers<
  Target extends string = string, Source extends string = string
>(modifiers: readonly NumericalModifier<Target, Source>[],
  sources?: ModifierSourceSelection): NumericalModifier<Target, Source>[];
export function selectCanonicalModifiers<M, Target extends string = string>(
  modifiers: readonly M[], adapter: ModifierAdapter<M, Target>,
  sources?: ModifierSourceSelection
): M[];

export function prepareNumericalModifiers<
  Target extends string = string, Source extends string = string
>(modifiers: readonly NumericalModifier<Target, Source>[]
): (base: number, target: Target) => ModifierResult<Target, Source>;
export function prepareNumericalModifiers<M, Target extends string = string>(
  modifiers: readonly M[], adapter: ModifierAdapter<M, Target>,
  validate?: (selected: readonly M[]) => void
): (base: number, target: Target) => PreparedModifierResult<M, Target>;

export function matchesAnyTag(
  required: readonly string[], available: readonly string[],
  normalizeAvailable?: (tag: string) => string
): boolean;
```

Default overloads use existing `NumericalModifier`/`ModifierResult` exactly; custom
overloads add payload reference preservation without widening existing types.
Expected total: 50 Kernel symbols, 44 types and six runtime functions. No root
re-export, new package subpath or package metadata/version change.

Default equivalence is full `JSON.stringify` of each numerical input object;
custom equivalence is caller policy, invoked only when an enabled identity already
exists. Legacy passes `JSON.stringify(previous) === JSON.stringify(next)` on the
complete `CombatModifier`, including property insertion order, conditions, tags,
damage type/scope and any malformed fields. Do not normalize payloads.

`ModifierAdapter<CombatModifier>` is declared only in Legacy. Its identity
accessor returns the original object structurally (it already has source,
sourceInstanceId and id), and numerical accessors read the original fields at
their existing phase. Kernel has no reference to the Legacy type or schema.
Callbacks are synchronous. For deterministic generic usage, caller accessors and
equivalence must be stable/pure; this adds no purity restriction to Legacy callers.
There is no snapshot or clone/freeze guarantee. The custom result's mutable array
is deliberate to preserve Legacy aliasing; readonly property syntax does not
freeze that array. Default `ModifierResult` retains its existing readonly type.

## Delegation, source and tag policies

| Legacy function | Delegation and retained responsibility |
| --- | --- |
| `collectActiveModifiers` | Map `setting` to always-active; map equipment/buff/passive to caller sets under their existing keys; omit absent sets. Call canonical selector with original objects. No local filter/dedup/sort loop remains. |
| `prepareModifierResolver` | Call prepared Kernel API with Legacy adapter and unchanged validator policy. Each returned invocation projects the seven historical fields explicitly; omits Kernel `target`, preserves contribution array/object references and field order. No arithmetic in this projection. |
| `resolveModifiers` | Continue prepare-then-resolve delegation. No second numerical implementation. |
| `damageBonusReason` | Retain ordered type, scope, event and target checks. Use `matchesAnyTag` only for existing event/target membership, with Legacy-supplied event lowercase callback. Preserve default parameter and exact inferred reason union. |

Kernel source matching uses only opaque equality/membership: always-active source,
or a source key whose provided instance set contains the instance ID. It never
interprets equipment/buff/passive lifecycle or loads another source.

`matchesAnyTag` is required-order `some` over available-order `some`, short-circuiting
and lazily invoking the optional normalization callback on available candidates.
Without a callback it uses exact case-sensitive equality. Empty required tags
return false; Legacy keeps the existing nonempty-filter guards. No match-all API
is added because existing modifier tag policy uses match-any. Available event
tags use `eventTags ?? tags`; target fallback remains
`entities?.defender.targetTags ?? [target.toLowerCase()]`, including empty arrays.
`attackerOnly` bypasses the target check; reason precedence and eager fallback
evaluation at the existing point remain unchanged.

Minimal Damage dependency cut: **no edits** to `src/damage/damage-core.ts` or
`src/effects/dot-core.ts`. Their current type/scope routing, DamageSettings policy,
options, status match-all, `damage.tag.*` mapping, snapshots and B0/B1 remain
Legacy until their approved later extraction. These are different policies, not
parallel modifier aggregation engines. They automatically consume the delegated
resolver/helper. The new matcher is exercised through `damageBonusReason` and
independent Kernel consumers without refactoring either engine.

## Oracle, mutation and compatibility evidence plan

Before production changes, capture full expected outcomes from exact accepted
`390c6e8c96f467903401d18b32a4e44184b5f94e`. A guarded manual capture script reads
pinned original source and records SHA-256. Runtime tests use stored JSON, never
the old implementation. Reuse lossless NaN/Infinity/-0 encoding and compare exact
nested results/errors. Reference assertions are separate from serialized goldens.

Cover every task matrix row, including:

- Empty and each/mixed operation; negative/zero valid inputs; cancellation-sensitive
  accumulation; tuple lexical order across permutations and punctuation/Unicode;
  identical duplicate winner; full-payload and property-order conflicts; distinct
  instances; disabled-before-conflict and conflict-before-validation precedence.
- Empty/nonempty conditions; exact validator messages/order for invalid fields,
  operations/tags/IDs/values/budgets. Preserve negative `damage_bonus` acceptance.
- Prepare once/resolve many; present/absent target array identity; original objects;
  mutations to identity/enabled/target versus operation/value, contribution payload
  and returned group arrays between resolves. Disabled-at-prepare later enabling
  stays excluded. Re-preparing is a distinct boundary and observes new inputs.
- Source active/inactive sets for all four Legacy sources, duplicates/conflicts,
  inactive conflicting payloads, reordered input/source sets and empty sets.
- Every exact reason and multi-mismatch precedence, case-sensitive target versus
  lowercased event matching, empty tags, fallbacks and `attackerOnly`; Direct/DoT.
- Full Damage/snapshot outputs, flat/tag/bonus routing, Skill/Effects integration
  and unchanged Stats stable/mutation goldens, with callback/RNG traces where used.
- Independent Kernel-only Text RPG luck/menu modifiers, Vo Lam custom source plus
  derived-stat seam, and ARPG custom tags/order. All use the same resolver.

Add default-type compatibility assertions and custom generic/no-cast assertions.
Compare all 99 emitted Legacy declarations byte-for-byte and ten entrypoint symbol
sets/value flags against the accepted HEAD. Keep 243 root symbols, 27 historical
namespace/forwarder identities and blocked package deep imports. Strict installed
NodeNext compiles/runs the new consumers and verifies source/emitted/installed
Kernel closure. Expected public inventory changes are Kernel-only.

Architecture checks retain their current boundaries and real positive/negative
fixtures. Add accessor/result/source-policy closure coverage and actual nested
Kernel leaks to valid existing Legacy targets. Each negative must fail for its
intended boundary, not for missing files or bad syntax. No permission loosening.
The current edge matrix already permits Modifiers -> Kernel.

## Expected preservation delta and second stop

Only historical module index **13**, `src/shared/game/modifier-core.ts`, is
expected to change. Keep original file/provenance; keep Legacy module first in
`currentFiles`, append the canonical Kernel implementation (and new supporting
contract file if its declarations are to be pinned). Its declaration list pins
both adapter and canonical implementation, with no duplicate file registration.
Other 26 modules, especially index 12 and all v2.0.3 approvals, remain unchanged.

Current affected declaration fingerprints:

| Declaration | Accepted SHA-256 | Expected action |
| --- | --- | --- |
| `damageBonusReason` | `f282203bb150f7d017b06b4e9f76a76a566b57cae24d915b4ed0265a157361c7` | Adapt membership only |
| `ActiveModifierSources` | `e59900ce92e858c7d6c9c66321fcadf7def04bb3d6832f16cd00c5c29b32f041` | Unchanged |
| `collectActiveModifiers` | `9f27e68a3d5956fcf527d422fabcc98610f35e57016f6c8050773d31808ffd36` | Delegate source selection |
| `uniqueModifierInstances` | `ebec3c9ec72d87ded049b9a0965bdd8cda7743a167d7392a17af60fc1f207daa` | Remove Legacy algorithm; canonical Kernel body replaces it |
| `prepareModifierResolver` | `bfd0e445ea72d7a9010807be5d76c2b2a2dc612dcddc25a35e1fa72cc135a5f3` | Delegate, validate and project |
| `resolveModifiers` | `267a8c6d7c22680f0c6654bc7e10a6fba18d0b307df3bc165b5d1aed1ecb7c1b` | Retain if unchanged |

After approved implementation, run targeted tests, build/typecheck, architecture,
declaration comparison and installed consumer. Generate exact before/after
fingerprints, source diff and a minimal RFC 6902 proposal that tests the prior
entry before changing it, retaining all removed original hashes and approval
history. **Do not amend `docs/behavior-baseline.json`.** An expected preservation
failure at this point is reported, not bypassed. Stop at
**BLOCKED — PRESERVATION REVIEW** for separate Developer approval.

## Planned files and final delivery

Production: new Kernel modifier implementation/supporting contracts;
`src/kernel/index.ts`; Legacy `src/modifiers/modifier-core.ts` only. Existing
Modifier contracts, validator, Stats, Damage, DoT, Skills and resources stay intact.

Evidence: new modifier capture/review scripts, scenario/oracle fixtures, parity
and independent Kernel tests, installed consumer fixture, and focused tooling
declaration coverage. Update consumer export inventory for the approved additions.

Documentation: create `docs/v2/2.0.4-modifier-resolver-extraction.md`; update README,
AGENTS and current ARCHITECTURE ownership where needed. This plan is the review
artifact. Do not rewrite historical acceptance records or migration findings.

Only after separate preservation approval: apply the exact reviewed amendment,
run full `npm run verify` (build, typecheck, architecture, preservation, all tests,
example, external consumer), then commit
`feat(kernel): extract canonical modifier resolver v2.0.4`, push this branch,
update PR #6 and verify push/PR CI on Node 22.13.0/24. Report actual counts, files,
SHA, compatibility and remaining limits; stop READY FOR REVIEW. No new branch/PR,
force-push, merge, publication or v2.0.5.

Risks/limits: finite fixtures cannot prove arbitrary Proxy/getter side effects or
every external consumer; accessor phase/order and Legacy mutable-array aliasing
need explicit review. Readonly is not a snapshot/freeze guarantee. If the approved
cut cannot preserve observed semantics or exact Legacy declarations, stop BLOCKED
with a reproduction and minimal delta rather than changing contracts or scope.
