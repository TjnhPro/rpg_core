# v2.0.8 Calculation Snapshot & Context Decoupling — implementation plan

Status: **PRESERVATION APPROVED — FINAL IMPLEMENTATION REVIEW PENDING**. Developer approved
this cut at the baseline below. Implementation evidence and the separate Gate B
proposal are in `2.0.8-calculation-snapshot-context-extraction.md`.

Baseline verified locally: `1b1183641858c4654f4dac22c338fb47e265b8de`.
Branch: `audit/v2.0.0-architecture-boundaries`; continue PR #6.
The starting working tree was clean. The sections below record the approved
preflight plan; Gate B was separately approved by Developer on 2026-10-18.

## 1. Current ownership and call graph

```text
Default delivery -> integration.snapshot -> env.snapshotDamage
  -> caller's snapshotActorDamage -> actorOffense
  -> integration structuredClone(component/rank/attacker envelope)
Root executeSkill
  -> availability, stats, spatial, definition, instance/trigger preparation
  -> prepareRootOffense -> binding.capture -> snapshotActorOffense
     -> Legacy validation -> actorOffense
     -> structuredClone(full offense/identity/config/options) -> recursive freeze
  -> startSkillAction -> MP/cooldown commit -> bindRootOffense/instances/triggers
  -> activation (including immediate 0%) -> dispatch
Root delivery -> rootDamageSnapshot -> validateRootOffense -> assembleRootDamage
Child delivery -> childInstanceDamage -> trusted handle -> assembleRootDamage
Public deriveSkillRootDamage -> structuredClone(rootDamageSnapshot(...))
On-hit DoT -> applyDotSnapshot -> structuredClone(snapshot callback result)
  -> filter flat/bonus modifiers for DoT -> retain per-stack snapshot
Delivery hit / dotDamage -> calculateDamage
  -> Legacy validation/canonical selection/context
  -> resolveDefenseHit -> Kernel calculateHit
  -> Kernel B0 -> Legacy bonus eligibility -> Kernel calculateCritical -> B1
  -> mitigateDefense -> Kernel mitigation -> Legacy diagnostics
```

`snapshotActorDamage` returns `definition` followed by `actorOffense` fields.
`actorOffense` resolves `damage.flat` through the existing modifier resolver,
maps `damage.tag.*` into Legacy setting records, separately clones flat/bonus
modifier lists, retains the original `sources`, and creates a new settings wrapper
and modifier array while retaining setting modifier objects. It does not freeze.
This is deliberately different from trusted Root offense.

`snapshotActorOffense` validates exact six source keys/finite values, critical
fields, canonical modifier budgets/payloads, attacker identity, settings/options
and optional defense config. It then invokes `actorOffense`, checks aggregate
budget/flat, clones the complete envelope once, recursively visits `Object.values`
and freezes children before parents. Its catch maps failures to a new
`Error('invalid_root_offense')`. No capture invokes Hit/Critical RNG.

Root preparation occurs before action/resource commit; rejected admission does
not capture. A capture callback can still run before a later start failure, so
do not strengthen the contract to “capture only after action commit.” Successful
roots capture once before activation at 0/50/100%; replay never recaptures.

`root-offense.ts` owns activated execution WeakSet and session WeakMap. Instance
and trigger modules own trusted handles, receipts, definitions, budgets and
session lifetime. Both manual and receipt-driven children retain the same
`rootOffense` reference. `assembleRootDamage` creates a shallow component envelope;
the public derive API clones it. Metadata-only copies cannot establish trust.

## 2. Capture timing and lifetime matrix

| Path | Default boundary | Root-enabled boundary/data | Reused until / RNG |
| --- | --- | --- | --- |
| Direct hit | Dispatch execution before hit | Successful-start S0, component assembled at delivery | One hit; live defender; Dodge then Critical |
| Melee | Dispatch before target enumeration | Same S0 | One delivery shares offense across contacts; RNG per eligible contact |
| Instant AoE | `aoe` before target iteration | Same S0 | One AoE shares offense; RNG per eligible contact |
| Projectile | `launch` before bullet construction | Same S0 | Launch snapshot shared across emitted bullets; live defender at impact |
| Timed AoE sequence | Each strike through `aoe` | Same S0, strike/component assembly retained | One strike shares offense; position RNG remains in sequence mechanics |
| Timed object/emitter | Each emission's `launch` | Same S0 | Each launch retained through impact; no move to object creation |
| On-hit DoT | Successful stack admission invokes snapshot callback, then clones/filters | Assembled S0 plus DoT component, then existing stack clone/filter | Stack lifetime/FIFO consumption; live defense at tick; no Dodge/Crit draws |
| Child | Existing child execution/delivery boundary | Inherit original root S0 by identity | No child recapture; independent pinned component/rank/config |
| Public derive | On explicit authenticated request | Clone assembled root component | Independent mutable detached result on each call |

Expiry-before-tick, emitted delivery survival, missing/replaced/dead sources,
trigger OnImpact/OnExpire/OnHit/OnKill/OnStackThreshold, stack consumption,
exactly-once admission and resource/event commit order stay in Legacy.
The DoT local variable named `frozen` is a detached clone, not a recursively
Object-frozen object: its modifier lists are subsequently reassigned. Preserve it.

## 3. Proposed public APIs — two additions, no public type delta

Add only these functions to `@rpg/core/kernel`:

```ts
export function captureNumericalOffenseSnapshot<
  Source extends string = string,
  Bonus extends string = string,
>(
  input: NumericalOffenseSnapshot<Source, Bonus>,
): NumericalOffenseSnapshot<Source, Bonus>;

export function captureCalculationSnapshot<
  A extends string = string,
  S extends string = string,
  Source extends string = string,
  DamageType extends string = string,
  Tag extends string = string,
>(
  input: CalculationSnapshot<A, S, Source, DamageType, Tag>,
): CalculationSnapshot<A, S, Source, DamageType, Tag>;
```

Reuse `CalculationContext`, `NumericalOffenseSnapshot`, `CalculationSnapshot`
without interface changes. No extra context API, invocation contract, policy
parameter, timestamp, state, brand, public clone helper or root re-export.
Expected inventory: 63 Kernel symbols / 17 runtime APIs; final emitted closure
and inference will be measured rather than assumed.

`NumericalOffenseSnapshot` copies sources, ordered resolved flat contributions,
ordered already-resolved bonus records and their contributions, and critical
chance/bonus. It does not select modifiers, calculate eligibility or draw rolls.
`CalculationSnapshot` copies attributes, stats, all selected stat rules including
bounds/precision/scaling, numerical modifier identities and context/tags.
`CalculationContext`'s damageType/tags/ownerId/revision are descriptive labels;
none authorize gameplay, identify a trusted root, or cause state lookups.

## 4. Data domain, copying, freezing and errors

Proposed new API boundary: closed declared data shapes, own enumerable data
properties on ordinary/null-prototype records and ordinary dense arrays.
Optional fields may be absent or explicitly undefined. Dynamic record keys are
preserved exactly, including Unicode and prototype-looking string keys; no
normalization, vocabulary registry or arbitrary length limit. Identifier meaning,
bounds validity and balance validation remain caller responsibilities.

Perform a snapshot-specific structural walk for the two schemas before cloning:
reject unexpected fields, missing required fields, wrong scalar/container types,
accessor properties, symbols, custom prototypes, functions, class instances,
Date/Map/Set/typed-array data and cyclic/otherwise non-schema input. Shared
references between valid branches are allowed. Reject unsupported shape with
`TypeError('Invalid numerical offense snapshot')` or
`TypeError('Invalid calculation snapshot')`, respectively. No new public validator
or diagnostics framework. This is a proposed new-API restriction requiring review;
it must never be applied to existing Legacy inputs.

Numbers remain numbers: preserve NaN, +/-Infinity and -0 without coercion or
finite/sign/clamp/rounding validation. Calculators retain their primitive-specific
semantics. Strings/booleans follow the existing field types. No Formula DSL,
callbacks, RNG results/state or live entity/session handles can enter these shapes.

Clone the validated whole input once using native `structuredClone`, preserving
key order, undefined and shared-reference topology across branches. Do not clone
each branch separately, use JSON, sort keys, recompute modifiers or freeze the
original. Null prototypes are not promised to survive native cloning. Then apply
children-first recursive `Object.values` / `Object.freeze` to the detached graph.
Return a fresh top-level identity on every call, with no object aliases to input;
preserve aliases within the captured graph. All supported nested objects/arrays
are frozen. Strict ESM writes throw; non-strict writes may fail silently.

Public captures are synchronous. Native clone/freeze errors propagate without
translation. No partial result is returned and inputs are never frozen/mutated.
Proxies can execute traps or throw during inspection; no side-effect-free or
atomic snapshot guarantee for hostile proxies/concurrent mutation is claimed.
Stable data inputs are the supported deterministic boundary.

## 5. Legacy delegation seam — decision explicitly submitted for approval

Put the two public captures in `src/kernel/snapshots/calculation-snapshot.ts`.
Use one small internal module `src/kernel/snapshots/snapshot-data.ts` containing:

```ts
// Internal imports only; not exported from the Kernel package barrel.
export function cloneSnapshotData<T>(value: T): T;
export function freezeSnapshotData(value: unknown): void;
```

The first is exactly one native `structuredClone` call. The second moves the
existing children-first recursive freeze verbatim in observation order, without
cycle normalization, caching, descriptors, plugin handlers or new policies.
These are shared implementation primitives, not a public arbitrary-payload
snapshot framework. No Kernel reference to Legacy types or fields is introduced.
New numerical APIs restrict their data domain before using these primitives;
Legacy adapters retain their accepted broader native-clone behavior.

In `actorOffense`, replace only the two existing modifier-list clone calls with
the internal clone primitive at the exact same expressions. Keep flat resolution,
tag mapping, source aliases, setting references, read order and object literal
field order intact. In `snapshotActorOffense`, replace its existing complete
envelope clone and inline recursive freeze with the same primitives, inside the
same try/catch, after all current validations and aggregate checks. Do not route
Legacy through the new structural validator or public frozen capture APIs.

This seam is important: forcing the raw Legacy graph through the public resolved
offense shape loses deferred predicates/options and breaks mutable default aliases.
Splitting full Root clone into numerical and gameplay clones can break accepted
cross-branch aliases and getter order. A single unchanged whole-envelope native
clone preserves those semantics while delegating copy/freeze mechanics to Kernel.
The generic internal wrapper is specifically submitted for Gate A review; if this
is considered too broad under the task's no-framework constraint, stop for a
revised cut rather than shipping a hidden alternate design.

Do not modify `root-offense.ts`, Skill Execution/Integration/Instance/Trigger,
Skills contracts or DoT production source. Their existing clone calls retain
different mutable/public-copy guarantees and do not need extraction in this cut.
Root S0 obtains the delegated numerical copy/freeze through `snapshotActorOffense`;
its trusted envelope, WeakMaps, children and public derive semantics are unchanged.
No new numerical cache, parallel snapshot or identity side table is introduced.

## 6. Raw Legacy → generic numerical mapping

| Legacy datum | Numerical mapping / retained owner |
| --- | --- |
| Six source values | `sources` when a caller projects an independent generic capture; Legacy source aliases retain their current default behavior |
| `damage.flat` scalar | Already resolved term, represented by `flatContributions` with caller provenance; never sum raw operations as independent flat values |
| Raw `flat_damage` modifiers | Remain raw Legacy snapshot data; damage type/scope selected later by canonical resolver |
| Setting/item/tag/bonus modifiers | Keep predicates/options in Legacy; resolve target/status/event eligibility at hit before constructing numerical `bonuses` |
| Critical chance/bonus | Direct numerical fields captured at existing offense boundary |
| Actor identity, defense snapshot, item options | Legacy envelope only, no Kernel gameplay contract |
| Definition/rank/target/defender ratings | Supplied later at component/contact boundary; not part of component-independent offense |

There is intentionally no claim that `ActorOffenseSnapshot` is structurally a
`NumericalOffenseSnapshot`, nor a new eager projection/calculation pass in Legacy.
Independent consumers use the generic snapshots directly with existing Kernel
B0/B1/Stat/Modifier/Hit/Critical/Mitigation APIs. A CalculationSnapshot is data,
not the entire `PreparedStatCalculationInput`: caller still supplies attribute
rules/baselines, order and prepared resolver as required by the existing contract.

## 7. RNG and context boundary

Keep `RandomRoll = number | (() => number)` and all existing calculator signatures.
No SkillEffectEnvironment API changes. Preserve integration forwarding
`roll: env.criticalRoll, dodgeRoll: env.dodgeRoll`; do not bind these to env or
replace the existing Critical adapter's original calculation-input receiver.
Dodge invokes its supplied callback unbound. Preserve property getter timing,
exact callback errors and validation of consumed rolls only.

Hit resolves before B0/Critical. Dodge success suppresses Critical; zero Dodge
does not draw; landed direct Critical draws even at zero chance. DoT draws
neither and preserves public sentinel roll 1. Position RNG remains in mechanics.
Snapshot capture never accepts, reads or invokes an RNG dependency.

## 8. Accepted-source oracle and targeted evidence

After Gate A approval, before production edits, capture static goldens from an
isolated accepted-source emit at the exact baseline above. Pin source SHA-256 and
all 99 non-Kernel declaration files. Store results plus explicit special-number,
key-order, trace, thrown-object, alias graph and freeze observations; JSON fixture
encoding must tag undefined, -0, NaN and infinities rather than lose them.
Do not ship a duplicate implementation or use changed source as the oracle.

Add dedicated offense snapshot parity and Kernel snapshot tests plus actual
Core integration scenarios for the timing matrix. Cover player/monster sources,
budgets, settings/options, nested config, missing/extra/inherited fields,
getter mutations/exceptions, native clone errors, shared/cyclic input and freeze
behavior. Legacy cycles/errors retain accepted handling; new APIs reject cyclic
schema input. Observe default aliases separately from Root deep freeze.

Exercise accepted Root fixture at 0/50/100%, rejection/replay, multiple roots/
versions/sessions, forged/cloned handles, public-copy mutation, shared child S0,
projectile launch/impact, emitter emissions, sequence strikes, AoE multi-target,
DoT admission/ticks/expiry, receipt replay/budgets/disposal and stack consumption.
Check RNG order/count/receivers/getter and error traces, live defender changes,
HP/MP commits, Lifesteal/Mana-on-Hit/percent recovery and event observer order.
Extend scenarios in new fixtures/tests; retain all .3–.7 goldens unchanged.

Independent installed Text RPG, Vo Lam-style and ARPG fixtures import only
`@rpg/core/kernel` under strict NodeNext/native ESM. Check identifier inference,
mutation of original data after capture, nested frozen flags/write attempts,
shared captured aliases, damage from captured sources, delayed component-specific
calculations, caller target eligibility and independent lazy RNG. These are
numerical examples using existing calculators, not three gameplay engines.

Example usage to compile/run after approval:

```ts
const input = {
  sources: {strength: 10, magic: 4}, flatContributions: [], bonuses: [],
  criticalChance: 0, criticalBonus: 0.5,
};
const captured = captureNumericalOffenseSnapshot(input);
input.sources.strength = 999;
const b0 = calculateDamageB0({
  base: 0, rank: 1, perRank: 0,
  sourceOrder: ['strength', 'magic'] as const,
  sourceValue: key => captured.sources[key],
  coefficient: key => key === 'strength' ? 2 : 0,
  resolveFlat: () => ({definition: 0, additional: 0, resolved: 0}),
}); // raw remains 20, without Skill Runtime or CombatEntity
```

The second capture API has an independent context/rules example:

```ts
const tags = ['spell'];
const values = {health: 100};
const state = captureCalculationSnapshot({
  attributes: {strength: 10}, stats: values,
  statRules: {health: {
    default: 100, enabled: true, bounds: {min: 0}, training: 0,
    scaling: [{attribute: 'strength', coefficient: 2, enabled: true}],
  }},
  modifiers: [],
  context: {damageType: 'arcane', tags, ownerId: 'example', revision: 'r1'},
});
tags.push('changed'); values.health = 1;
// state.stats.health === 100; state.context.tags contains only 'spell'.
// Rules, bounds, scaling entries and context tags are detached and frozen.
```

## 9. Architecture, declarations and preservation

Expected production diff: new two Kernel snapshot modules, Kernel barrel, and
Damage facade only. Snapshot-contract comments may be updated to distinguish
representation-only values from captured values; no interface changes. Tooling,
new fixtures/tests and current ownership docs will be updated as needed.

Historical impact expected only at module 10 (`damage-core.ts`): changed private
`actorOffense` and public `snapshotActorOffense` implementation fingerprints;
`snapshotActorDamage` should remain unchanged. Register the actual dependent
Kernel helper source(s) based on final fingerprints, not an assumed inventory.
Root offense has no standalone historical entry; modules 7/15/16/19 must remain
unchanged, as must all 26 other preservation entries and prior .3–.7 approvals.

Compare all 99 non-Kernel declarations byte-for-byte with isolated accepted emit,
including inferred DamageSnapshot/ActorOffense/default snapshot and Root/Child
declarations. Preserve ten Legacy entrypoints, root 243 symbols/122 values,
27 forwarders/namespace identities, exports/version and blocked deep imports.
Run real architecture checks/fixtures and emitted/installed declaration closure;
no checker edge relaxation or Kernel → Legacy dependency.

After targeted verification, emit exact before/after declaration fingerprints,
source SHA-256, added/removed/changed declarations, source diff and minimal RFC6902
proposal with old-value tests. Dry-run only; preserve complete module-10 approval
history (v1.1.1 through .5/.6) and unchanged .7 resource approvals. Stop at Gate B
without editing `docs/behavior-baseline.json`. Any impact outside this cut or
public contract/behavior drift requires a delta plan before further edits.

## 10. Execution and stopping gates

Gate A now: Developer reviews this plan, including new-API data restrictions and
the internal native-copy/recursive-freeze delegation seam. No source edits yet.

After implementation approval, capture oracle first, implement the approved cut,
then run build, typecheck, architecture, dedicated snapshot suites, the task's
damage/stats/integration/skills/effects/tooling suites and installed consumer.
Report actual counts. Preservation may reject only the exact pending fingerprint
delta; never rebaseline to make it green. Stop for separate preservation approval.

Only after Gate B approval: apply the exact reviewed preservation patch, recheck
source/fingerprints, run full `npm run verify` and `git diff --check`, commit
`feat(kernel): extract numerical snapshots and context v2.0.8`, push existing
branch/update PR #6, and confirm Node 22.13.0/24 SUCCESS on exact HEAD. Stop at
READY FOR REVIEW; no merge/release/.9 work.

Preflight verification is source inspection only. The accepted 1,369 tests /
48 files belong to .7, not a new .8 test result. No .8 implementation, test run,
commit or push is claimed by this plan.

The implementation report will be
`docs/v2/2.0.8-calculation-snapshot-context-extraction.md`, accompanied by
`2.0.8-snapshot-preservation-fingerprints.json` and
`2.0.8-snapshot-preservation-proposal.json`. Those will contain observed evidence,
not assumed PASS results from this plan.
