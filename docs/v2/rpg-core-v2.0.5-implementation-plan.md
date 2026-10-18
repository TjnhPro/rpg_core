# v2.0.5 implementation plan — Damage Calculation Extraction

Status: **PRESERVATION APPROVED — FINAL IMPLEMENTATION REVIEW PENDING**.

Developer approved this implementation cut at baseline HEAD
`7443ff8e897ce61a4216d5386ec7e72310d352c3`, including the three runtime APIs and
two additive contracts below. The Developer separately approved the exact
module-10 preservation delta on
2026-10-18; final verification and delivery are now authorized. v2.0.4 is accepted;
its historical report is unchanged.

## Verified preflight

- Branch `audit/v2.0.0-architecture-boundaries`; local and open PR #6 head
  `7443ff8e897ce61a4216d5386ec7e72310d352c3`. Working tree was clean.
- Read AGENTS, README, ARCHITECTURE, migration matrix, .2/.3/.4 reports, damage
  contracts/implementation, Defense, Modifiers, Kernel contracts/resolver/barrel,
  DoT, Root Offense and damage delivery consumers/tests.
- Fresh focused preflight: `npm test -- tests/damage tests/modifiers tests/stats
  tests/integration/root-offense.test.ts tests/integration/skill-effect-integration.test.ts
  tests/integration/effect-integration.test.ts`: **245 tests / 12 files PASS**,
  3.08 seconds, exit 0. Architecture and preservation checks: PASS, exit 0.
  These are new focused results, not a new full verify or remote CI run.
- Kernel baseline: 50 symbols, six runtime functions, 11 declaration files.
  Existing Legacy compatibility target: 99 declarations, ten entrypoints,
  root 243 symbols / 122 values and 27 historical forwarders.

Accepted Git-blob SHA-256 (use Git bytes, not Windows CRLF working-copy bytes):

| Source | SHA-256 |
| --- | --- |
| `src/damage/damage-core.ts` | `7f3d38d74e05db297c8b15df64b322fb1e9f647b0c043e21393089f4c4d67eae` |
| `src/damage/defense-engine.ts` | `5c825fe0ca62f258c90afb832faede2dab985c9cad46448b5dd320e81032d165` |
| `src/modifiers/modifier-core.ts` | `52ac9034905e002d3cfae811c6b603f236f3decbcc6084023ed386c23efba286` |

## Current call graph and ownership

`snapshotActorDamage` -> private `actorOffense` -> v2.0.4 `resolveModifiers` for
`damage.flat`; maps `damage.tag.*` to settings bonuses and detaches flat/bonus
registries. `snapshotActorOffense` validates, calls that same adapter, then
structured-clones/freezes. These functions remain byte/fingerprint unchanged.

`prepareRootOffense` captures `snapshotActorOffense` at activation. Authenticated
root/child delivery uses `rootDamageSnapshot` / `assembleRootDamage`; public
`deriveSkillRootDamage` returns a detached copy. None calculates B0/B1.

`skills/skill-effect-integration.ts::hit` -> `calculateDamage` -> existing resource
writes, recovery, events and triggers. Direct, melee, projectile, instant/timed
AoE all use that path. DoT admission detaches/filter snapshots via
`applyDotSnapshot`; `dotDamage` invokes `calculateDamage` per stack, then sums
finalDamage. DoT lifecycle and its outer per-stack sum are not this B0/B1 cut.

`calculateDamage` currently owns both numerical stages and orchestration:

1. Resolve trusted entities/live defense; preserve input/context spread timing.
2. Validate flat collection, prepare-and-resolve flat registry for canonical refs;
   validate bonus collection and budgets, prepare-and-resolve bonus registry.
   These preliminary resolver calls perform arithmetic even before Dodge.
3. Build event and defense context; resolve Dodge through `resolveDefenseHit`.
4. On Dodge, call `mitigateDefense(0,...)` and return the literal historical zero
   result. No landed B0/B1 or Critical callback; criticalChance is still read for
   its zero-result diagnostic at the existing point.
5. Capture `definition` and `context`; compute rank factor, base and ordered scaling.
6. Determine scope; filter canonical flat modifiers by type then scope; call the
   existing canonical resolver again for eligible `flat_damage`.
7. Compute definition flat + input flat + resolved flat, then raw B0.
8. Map settings modifiers in their original order, including ineligible entries;
   select item sources, numerically reduce products even when ineligible, then
   zero the effective diagnostic value when appropriate. Append canonical bonuses.
9. Resolve Critical roll, chance, comparison and selected nonnegative bonus.
10. Sum diagnostic effective values, append Critical bonus, apply both nonnegative
    clamps, call unchanged `mitigateDefense`, assemble rich result.

After extraction, steps 5/7 numerical arithmetic and step 10 B1 arithmetic belong
to Kernel. Step 8 item multiplication/reduction also belongs to Kernel. Legacy
retains eligibility, source selection, all reason strings/metadata, type/scope,
Critical/Dodge/Defense, trust/snapshots, validation and events. No Kernel function
imports Legacy, Defense or RNG. An atomic .5/.6 extraction is not needed for this
staged dependency cut; if evidence disproves parity, stop for a new decision.

## Exact proposed additive public API

Add `src/kernel/contracts/damage-stages.ts` with these two interfaces only:

```ts
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
export interface DamageB0Result<Source extends string = string> {
  base: number;
  scaling: {source: Source; value: number}[];
  flat: number;
  raw: number;
}
```

Add three runtime exports through `@rpg/core/kernel` only:

```ts
export function calculateDamageB0<Source extends string = string>(
  input: DamageB0Input<Source>
): DamageB0Result<Source>;

export function calculateDamageBonusValue<Source>(
  sources: readonly Source[],
  value: (source: Source) => number,
  coefficient: () => number
): number;

export function calculateDamageB1<Bonus extends {readonly value: number}>(
  raw: number,
  bonuses: readonly Bonus[],
  criticalBonus: number
): {criticalBonus: number; totalBonus: number; beforeDefense: number};
```

`DamageB0Result` is intentionally mutable, preserving the existing inferred Legacy
scaling-array type without cloning/recasting it or changing the old declarations.
It is structurally assignable to `DamageCalculationResult<Source>['b0']`.
The extra flat callback is a synchronous dependency inversion boundary, not a
formula callback: Kernel specifies all B0 arithmetic and invokes it exactly once
after scaling, before reading its three numeric fields. It takes no gameplay data.
Its returned object can expose numerical getters to retain Legacy read timing.
Accessors/closures are not placed in snapshot contracts; deterministic generic
usage expects synchronous stable/pure numeric inputs. Legacy mutable observation
semantics remain supported, without new purity or freeze requirements.

The bonus primitive owns exactly `sources.reduce((n,s)=>n+value(s)*coefficient(),0)`.
The value callback runs before coefficient per source, with no hoisting, map,
pre-read, filtering or early-return optimization. This narrow numerical primitive
is required because item multiplication is interleaved with Legacy eligibility
and diagnostics, before the Critical boundary. It is not another modifier resolver.
Empty selected sources yield +0 without reading coefficient.

B1 sums `bonuses.reduce((sum,b)=>sum+b.value,0)+criticalBonus`, then calculates
`Math.max(0,Math.max(0,raw)*(1+totalBonus))`. It does not check eligibility again,
filter zero terms, validate finite values or apply Critical clamping/probability.
Legacy already supplies effective values and selects the Critical bonus.

Do not change the five v2.0.2 Damage interfaces or existing 50 Kernel symbols.
Proposed inventory is **55 symbols / nine runtime functions**, with 13 reachable
declaration files (new stages contract and implementation). No root re-export,
package subpath, package metadata/version or public Legacy signature changes.

## Mapping existing Damage contracts

| Existing contract | Staged mapping / compatibility |
| --- | --- |
| `NumericContribution` | Existing resolved numerical provenance remains valid; do not substitute raw flat modifiers for the already resolved flat value |
| `DamageScaling` | Coefficient is raw; source value is unscaled. B0 owns `sourceValue * coefficient * rankFactor` in that order; Legacy supplies the exact six-key order through accessors rather than eager mapping |
| `ResolvedDamageBonus` | Existing full contract can be passed to B1 structurally; Legacy diagnostics also satisfy its minimal value constraint, retaining exact arrays/objects without cloning or imposing new fields |
| `DamageCalculationInput` | Remains a data-only contract; rank is caller-resolved, flat and ordered contributions are resolved terms. It cannot express the Legacy mid-B0 resolver boundary or interleaved item reads, so it is not forced onto this facade |
| `DamageCalculationResult` | B0 stage is structurally compatible; B1 numeric fields project directly, caller-owned bonus diagnostics remain separate. Legacy uses `modifiers`, not `bonuses`; no reconstruction pass or arithmetic |

No combined convenience calculator is introduced: one implementation per stage,
used by Legacy and independent consumers. Existing .2 interfaces remain useful
for caller-owned numerical data and composition; callbacks are an additive seam.

## Legacy delegation and exact evaluation order

Keep `calculateDamage` signature and the whole pre-Dodge/zero-result paths.
After its existing `{definition:d,context:c}` capture, call B0 with numeric getters:
`perRank -> d.perRank`, `rank -> input.rank ?? 1`, `base -> d.base`,
source accessors reading `input.sources[id]` then `d.scaling[id]` per iteration.
Kernel first reads perRank, then rank, calculates the original rank factor,
reads base, maps sourceOrder and multiplies left-to-right.

The `resolveFlat` closure executes the existing scope selection, two flat-eligibility
filters and canonical `resolveModifiers` call, storing scope and resolvedFlat in
Legacy locals needed later. It returns numerical getters for `d.flat`,
`input.flat ?? 0`, `resolvedFlat.value`. Kernel reads those in that order and
computes flat, then `base + scaling.reduce(...,0) + flat`. This avoids moving
definition/input flat reads before eligible modifier resolution. The closure
performs no B0 arithmetic. Contribution diagnostics retain the resolver's array
and original objects by reference. No resolver is removed, repeated or cached.

Legacy settings `.map` retains target-label construction, exact reason ternary,
source filter and diagnostics object literal order. Replace only item `.reduce`
with `calculateDamageBonusValue(sources,o=>o.value,()=>m.value)` at that same
expression position, keeping the two existing m.source decisions and direct
setting `m.value` read. It still calculates item values for disabled/ineligible
diagnostics before effective zeroing, preserving getter errors and mutations.
Keep canonical bonus `.map` and append untouched (including repeated m.value reads).

Leave Critical expressions exactly where they are. Direct hits read input.roll
for typeof and invoke/read it as currently; direct zero chance still draws. DoT
uses literal roll 1/chance 0 without either RNG draw. Chance reads happen after
the Critical callback; criticalBonus is read only after a successful comparison.
Invoke B1 after that selected bonus is captured, using the already computed raw
and original diagnostics array. DefenseConfig is read again at mitigation, at the
existing point. Assemble the same ordered public keys/nested fields; no spread
of Kernel-only fields into Legacy result.

Read-only probe at current HEAD observed:
`perRank -> rank -> base -> (source,coefficient) in DAMAGE_SOURCES order ->
definition.flat -> input.flat -> option.value -> modifier.value -> Critical RNG
-> criticalBonus`. With base 10, rank 2, perRank .5, six scaling terms .1,
definition flat 1/input flat 2, item 2*.1 and Crit bonus .25: exact raw **18.9**,
totalBonus **.45**, beforeDefense **27.404999999999998**. Critical mutation of
option to 100 changes returned option payload by reference while its effective
bonus remains **.2**. Separate Dodge probe suppresses a throwing B0 getter and
Critical callback, yielding zero with critical.roll null. Turn these into goldens.

## Golden, mutation and integration plan

Before source edits, capture oracle at the exact accepted HEAD using a guarded
manual script. Read original Git blobs, pin revision/SHA-256 and require untouched
source/baseline at initial capture. Transpile accepted source in memory with its
unchanged dependencies; tests consume stored JSON, never an old runtime engine.
Store full nested result/error/trace, losslessly encoding undefined, NaN,
Infinity and negative zero. Assert references and thrown object identity separately.

Coverage includes the complete task matrix:

- Base/each of six scaling sources, exact source/FP accumulation order, rank
  omitted/1/greater/zero/negative, perRank zero/negative, flat categories separately,
  negative intermediates, zero, NaN/Infinity and current rejection boundaries.
- All settings/item/canonical bonuses, option matches/missing/multiple, ignored
  and disabled diagnostics, full reason precedence, tags/status/targets/source
  order, negative damage_bonus and exact summation/cancellation-sensitive values.
- Getter reads and mutation between source/coefficient, flat resolution/flat reads,
  option value/coefficient, eligibility/value, canonical diagnostic repeated reads;
  errors before Crit must not consume Crit. Item sources retain original refs/order.
- Dodge success/failure/zero/disabled/ineligible/invalid roll; direct zero-chance
  Crit still draws; success/failure, unusual Crit roll without new validation,
  throwing RNG identity, DoT consumes neither, live callback mutations of chance,
  bonus, definitions/options/settings/defenseConfig versus captured B0/bonuses.
- Physical/Magic armor/MR, missing/disabled coefficients, invalid defense context,
  snapshot budgets/validation/conflict/error precedence, entities-context spread
  capture versus no-entities live getters, full zero-result shape.
- Unchanged Modifier 88 scenarios, both Stats 38-scenario goldens and all existing
  Damage/Defense/DoT/Root-Offense/Skills/delivery/recovery/exactly-once tests.

Independent installed Kernel consumers: Text RPG strength/base/flat/scaling/bonus;
Vo Lam ngoaiCong/rank with canonical v2.0.4 flat resolution through resolveFlat;
ARPG custom source/tag diagnostics, item-like product inputs and multiple additive
bonuses/Crit. Assert exact staged breakdowns, no Legacy imports, strict NodeNext
and native ESM. Reuse original consumer checks and add compile assertions that
existing five Damage types remain assignable with custom identifiers.

Architecture fixtures exercise actual source/emitted/installed declaration closure:
positive generic callbacks/results, negatives for direct/transitive Damage,
Defense, Entity and Skill leaks from deep files with existing valid targets.
Require boundary diagnostics rather than missing-module/type errors. No checker
permission relaxation. Explicit source review confirms no duplicate B0/B1 in Legacy.

## Preservation impact and stops

Fresh baseline inspection confirms Damage is **module index 10**,
`src/shared/game/damage-core.ts`; Defense is index 11, Modifiers 13.
Expected only changed Legacy declaration: `calculateDamage`, fingerprint
`dcdffe845c2b01dd4a036a2ebda535df40e9dfc6a42f73cc75e7681e0fa86a4e` before.
Keep MAX constant, actorOffense, both snapshots, types and all eight other
declarations unchanged. No Defense/Modifier/Stats baseline changes are authorized.

After approved extraction, compare all 99 Legacy declarations byte-for-byte using
accepted-source emit, ten symbol sets/value flags, Kernel additive inventory,
historical identities and package metadata. Generate exact named before/after
fingerprints, complete source diff and minimal RFC 6902 patch that tests prior
module 10 before replacing currentFiles/declarations and adding checkpoint history.
Legacy file stays first; append canonical Kernel implementation/supporting stages
contract. Preserve module 10's existing v1.1.1 approvedChange verbatim under explicit
prior history, original hashes and the other 26 modules, including .3/.4 approvals.
Do not overwrite prior provenance or amend the actual baseline before approval.

Run targeted tests/build/typecheck/architecture/consumer and show the expected
module-10 preservation rejection. **STOP — PRESERVATION REVIEW.** If more than
calculateDamage or any other module requires a changed fingerprint, explain and
obtain a dependency delta decision before editing that extra scope.

Only after separate preservation approval apply its exact amendment, run full
`npm run verify` (all required component steps), commit separately as
`feat(kernel): extract canonical damage B0/B1 v2.0.5`, push this branch/PR #6,
update description and await completed exact-head CI Node 22.13.0/24. Report actual
counts/SHA/evidence and stop READY FOR REVIEW. No new branch/PR, reset, rebase,
force push, merge, release, package change or v2.0.6 implementation.

## Planned files and review limits

Production: `src/kernel/contracts/damage-stages.ts`,
`src/kernel/damage/damage-calculation.ts`, `src/kernel/index.ts`,
`src/damage/damage-core.ts` (calculateDamage only).
Evidence: new damage scenario/golden, capture/review scripts, Kernel/parity tests,
installed consumer fixture, declaration fixtures and consumer inventory updates.
Docs: this plan, `docs/v2/2.0.5-damage-calculation-extraction.md`, generated
preservation proposal/fingerprints/diff; current README/AGENTS/ARCHITECTURE only
when ownership changes. Existing historical reports/goldens stay unchanged.
Baseline is a separately approved later edit, not part of implementation permission.

Finite fixtures cannot prove arbitrary Proxy or overridden array-method behavior;
review accessor invocation boundaries and original reference aliasing explicitly.
No added runtime finite checks, purity enforcement, cloning/freezing, Formula DSL,
source registry or gameplay mechanics. If the approved cut fails exact declaration
or behavioral parity, stop with a reproduction and minimal delta plan.
