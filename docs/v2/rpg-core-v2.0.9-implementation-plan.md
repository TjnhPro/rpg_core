# v2.0.9 Gameplay Contract Decoupling — implementation plan

Status: **IMPLEMENTATION AND GATE B APPROVED**. Developer approved
this plan on 2026-10-18 at the baseline below. Only tests, tooling and
documentation are authorized. See `2.0.9-gameplay-contract-decoupling.md` for
implementation evidence. Developer approved Gate B with zero preservation delta
on 2026-10-18 and authorized final verification, commit/push and exact-head CI.

Baseline: `58b53ca1727002c3a31273f23cc0b484c40ef1f0`.
Branch: `audit/v2.0.0-architecture-boundaries`; PR #6 is OPEN and its head matches.
Starting working tree: clean. Audit date: 2026-10-18; Node 24.18.0.
The supplied task declares v2.0.8 ACCEPTED; earlier .3-.7 accepted milestones
and approval provenance remain recorded in the existing reports/baseline.
No production synchronization outside this repository is required or authorized.

## 1. Finding and proposed implementation cut

**No current production Gameplay contract leak was found.** Source dependency
inventory covers all files in Kernel, Contracts, Combat, Damage, Skills, Mechanics,
Spatial and Effects. The existing TypeScript symbol closure gate independently
passes source, emitted and installed public Kernel declarations. Numerical
implementations use resolved inputs, not gameplay delivery/entity/session policy.

Keep every `src/**` file, public contract, calculator, validator and package export
unchanged. v2.0.9 should close the regression/evidence gaps through existing
checker tests, installed consumer fixtures and documentation. No source movement,
new numerical API, new checker, name blacklist, framework or preservation amendment
is proposed. Any reproducible checker defect found during the approved work must
be presented as a minimal delta before changing checker behavior.

## 2. Current dependency graph

```text
Legacy contracts/index -> gameplay contract modules (no Kernel imports)
damage-contracts -> mechanic-contracts -> dot-contracts -> damage-contracts
damage-contracts -> combat-entity -> stat-contracts
damage-contracts -> defense-settings
stat-contracts -> damage-contracts / defense-settings / combat-modifiers / targeting
targeting-contracts -> combat-state -> combat-entity / spatial
effects contracts -> combat-entity / combat-state / combat-modifiers

Skills -> Legacy Contracts / Combat / Stats / Damage / Effects / Mechanics / Spatial
Mechanics -> Legacy Contracts / Spatial
Spatial -> Legacy spatial contracts
Damage -> Legacy context/validation + Kernel numerical Damage/Defense/Snapshot helpers
Combat -> Legacy entity/state validation + Kernel resource arithmetic
Stats / Modifiers -> Legacy schema/policy + Kernel calculators

@rpg/core/kernel
  -> contracts/common, modifiers, modifier-resolution, stats, damage, damage-stages,
     defense, resources, snapshots
  -> stats/stat-calculation -> common + stats contracts
  -> modifiers/modifier-resolution -> modifiers + modifier-resolution contracts
  -> damage/damage-calculation -> damage-stages contracts
  -> defense/defense-calculation -> defense -> common
  -> resources/resource-calculation -> resources -> common
  -> snapshots/calculation-snapshot -> snapshots contracts + internal snapshot-data
  -> snapshots contracts -> common / modifiers / stats / damage
```

All Kernel outgoing module edges stay inside Kernel. Existing Legacy type cycles
are not runtime cycles and do not reach Kernel in the forbidden direction.
The source graph has 62 canonical modules, zero runtime cycles. Source public
Kernel closure reaches 17 files; emitted/installed closure reaches 16 declaration
files. The internal snapshot primitive is reachable through source implementation
but absent from public emitted signatures. Public surface: 63 symbols / 17 runtime
functions. Root/domain barrels do not re-export Kernel.

## 3. Gameplay inventory and canonical owners

| Contract / concern | Canonical declaration or behavior owner | Numerical boundary |
| --- | --- | --- |
| SkillMechanics, MeleeHitbox, ProjectileConfig, TimedObjectConfig, InstantAOE, TimedAOESequence, MeleeCast, AOECast | `contracts/mechanic-contracts.ts`; runtime delivery in Mechanics | No delivery schema or scheduling input in Kernel |
| DotConfig and DoT discriminants | `contracts/dot-contracts.ts`; lifecycle in `effects/dot-core.ts` and Skills integration | Legacy resolves eligibility and already captured numerical damage |
| DamageDefinition including optional mechanics | `contracts/damage-contracts.ts` | Damage adapter resolves base/rank/source/coefficient/flat inputs |
| DamageContext and entity/defender branches | `contracts/damage-contracts.ts` | Legacy validates identities, selects context/eligibility/diagnostics |
| DamageDelivery, DefenseActor, DefenseContext, DefenseSettings, DefenseConfigSnapshot | `contracts/defense-settings.ts`; policy in `damage/defense-engine.ts` | Legacy selects rule/rating, passes eligible/selected numerical rule to Hit/Critical/Mitigation |
| MapPoint, Walkability | `contracts/spatial.ts`; geometry in Spatial, delivery use in Mechanics | No coordinates/grid/LOS in Kernel |
| CombatEntity, CombatEntityIdentity | `contracts/combat-entity.ts`; validation/writes in Combat | Only scalar resource/rating/level/stat inputs cross boundary |
| TargetContext, CombatValidationContext, CombatActionContext, ActiveCombatAction, CombatActionSlot, EntityCombatEvent | `contracts/combat-state.ts`; validation/admission/event behavior in Combat/Skills | No actor lookup, liveness, action authority or event emission in Kernel |
| FactionRelation, CombatRejection, TargetingRule/Settings | Combat state and targeting contracts; Combat relation/target checks | Caller resolves eligibility; Kernel has no faction policy |
| EffectDefinition/Instance/ApplyRequest/ApplyContext and effect rejection/lifecycle unions | `contracts/effects.ts`; Effects owns lifecycle | Kernel resolves selected numerical modifiers, not gameplay source activation |
| SkillGameplayEffect, SkillRejection, SkillEngineDefinition | `skills/skill-effects.ts`, `skills/skill-engine.ts` | Skills owns validation, costs, gameplay amount resolution and admission |
| Root S0, Child/trigger receipts and trusted handles | `skills/root-offense.ts`, skill-execution/instance/trigger | No trust/session/receipt type in Kernel |

Legacy DEFAULT configurations, exact-key validators and public unions remain in
their existing locations. Numerical fields such as radius/speed/timing are
gameplay policy and do not justify Kernel extraction. `CalculationContext.ownerId`
is a descriptive string, not authenticated identity. Generic caller labels such
as `CalculationContext<'magic','projectile'>` remain valid.

## 4. Gameplay-to-numerical adaptation observations

Damage Core validates gameplay context and determines DoT/Critical eligibility;
B0 runs before Critical, B1 after its result. Defense Engine validates delivery,
resolves Dodge eligibility (`mechanic !== 'dot'`), selects armor versus magic
resistance and forwards the captured coefficient reference with live fields.
Kernel sees booleans, scalar values, rule keys and RNG inputs, not DamageDelivery.
Legacy retains config provenance and public diagnostics.

Combat owns entity validation, HP/MP assignments and applied-result projection;
Kernel resource calculations do not write entities. Skills owns MP cost, percent
recovery amounts, Lifesteal, Mana on Hit and event ordering. Source membership
and modifier eligibility are resolved by Legacy before numerical aggregation.
Snapshot capture stores only closed numerical data; Legacy Root capture uses the
internal primitives at its accepted boundaries. No Kernel action admission,
faction selection, liveness, Root trust, delivery scheduling or resource commit
implementation was found. All accepted .3-.8 timing/RNG behavior stays untouched.

## 5. Existing checker coverage and actual remaining gaps

`scripts/check-architecture.mjs` already owns both source-edge enforcement and
`checkDeclarationClosure`. Source scanning checks runtime/type imports, all
re-export forms, import type expressions, dynamic import, require/import-equals,
cross-repository targets and runtime cycles for every file, including unexported
deep Kernel modules. Kernel outgoing edges permit only Kernel.

Declaration closure uses TypeScript bound symbols and recursively visits aliases,
declarations, heritage, nested property/callback types, generic bounds/defaults,
mapped types, namespace/module exports, import-type queries and returns. It skips
only TypeScript standard-library declarations and rejects unresolved reachable
types. The same implementation is used by source, in-memory emitted declaration
and installed-package checks. This is not a type-name grep.

Existing tests already exercise 22 forbidden source syntaxes at root/deep locations,
generic/heritage/mapped/namespace cases in source and emitted programs, real CLI
declaration rejection and Legacy-to-Kernel positive edges. Current targets mostly
use synthetic Context/Legacy interfaces. Additional coverage is needed for the
actual four gameplay families and their real transitive dependencies, plus explicit
consumer-owned gameplay labels/objects that stay outside numerical calls.

No production/checker defect has been demonstrated. These are **coverage gaps**,
not evidence of current leakage. No new ban on similarly named types or numerical
shapes is proposed. Caller-controlled generic payloads remain permitted without
Kernel importing or interpreting their gameplay authority.

## 6. Proposed tooling/tests implementation after Gate A

1. Extend existing architecture/declaration test suites using isolated temporary
   source trees. Copy the real Legacy contract closure where required, so every
   referenced target exists and typechecks. Establish an accepted control tree
   first. Inject leaks only into temporary Kernel modules, never repository source.
2. Test SkillMechanics, DamageDelivery, MapPoint and CombatEntity direct imports;
   nested Kernel forwarding; DamageDefinition -> SkillMechanics; DamageContext ->
   CombatEntityIdentity / DamageDelivery; TargetContext -> MapPoint; interface
   inheritance; generic constraints/defaults; nested aliases; conditional/mapped
   types; function arguments/returns; type queries and runtime Skills/Mechanics/
   Spatial imports. Keep real-checker source and declaration assertions separate.
3. Test source and emitted declarations independently with the existing symbol
   gate, so an early source-edge failure does not count as emitted-closure coverage.
   Require forbidden-declaration/edge diagnostics naming the existing target;
   missing files, syntax/type errors, timeouts and nonzero exits alone do not PASS.
4. Add positive fixtures for scalar records, Unicode/custom source/tag keys,
   gameplay-looking caller labels, Kernel-only nested aliases and generic bounds,
   and existing Legacy -> Kernel adapters. No blacklist of gameplay words/shapes.
5. Add an independent boundary consumer fixture, installed by the existing smoke
   harness. Text RPG uses Stats, Damage, Critical, Mitigation and Resources with
   no map/entity/SkillEngine input. Vo Lam and ARPG declare minimal caller-owned
   delivery/position policies, resolve numerical inputs and use existing snapshots
   and calculators with custom sources/tags/modifier sources/rating rules. These
   are small numerical assertion recipes, not three gameplay engines/simulators.
6. Add compile assertions for unchanged Legacy gameplay unions/discriminants,
   DamageDefinition.mechanics, DamageContext.defender.mechanic, optional/readonly
   semantics and import paths through public entrypoints. Negative type assertions
   cover missing gameplay exports from Kernel and inappropriate numerical inputs;
   they must not claim TypeScript structural typing enforces exact keys universally.
7. Add a review-evidence script comparing against the accepted .8 Git revision:
   byte-identical 99 Legacy declaration emits; unchanged public symbols and all
   existing Kernel declarations/API; unchanged `src/**`, package metadata, prior
   golden files and all 27 preservation records/fingerprints/history; source,
   emitted and installed closure evidence from the existing checker. The script
   records evidence only and never writes the authoritative baseline or proposals.

Candidate changed files: `tests/tooling/architecture.test.ts`,
`tests/tooling/kernel-declarations.test.ts`, `tests/fixtures/kernel-contracts.ts`
if useful for the compile assertions, one new boundary consumer fixture and its
test, `scripts/consumer-smoke.mjs`, one review-evidence script, the required
`docs/v2/2.0.9-gameplay-contract-decoupling.md`, and appropriate ownership/coverage
updates in AGENTS, README, ARCHITECTURE and test-coverage documentation. This plan
also remains as review provenance. No historical milestone reports are rewritten.

## 7. Compatibility and preservation strategy

Expected production source changes: **zero**. Expected public API/declaration,
formula/validator/default/union changes: **zero**. Kernel remains 63 symbols and
17 runtime APIs. Historical forwarders and all old namespace identities remain.

Preflight verified all 27 recorded module fingerprints. Authoritative baseline
working-file SHA-256 is
`7a8cf3cc60f66b951ba664e455ec2e653c9025165bd6ec8ccf5e4926a911711a`.
Keep baseline bytes and full approval history unchanged. No RFC 6902 patch will
be generated for a zero-delta milestone. Existing goldens are retained unchanged;
there is no reason to recapture numerical or gameplay oracles without source edits.

If implementation finds a real leak requiring source movement, contract change,
new package dependency/export, checker behavior change or gameplay correction,
STOP and present the smallest evidence-backed delta plan. Approval of this plan
must not be interpreted as authorization for those changes.

## 8. Preflight verification performed in this review

| Command / observation | Current result |
| --- | --- |
| Git status, branch and HEAD | Clean before plan; requested branch and accepted .8 SHA |
| `gh pr view 6` | OPEN; matching branch and head SHA |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm run check:architecture` | PASS; 62 modules; zero runtime cycles; source63/17 files, emitted63/16 files |
| `npm run check:preservation` | PASS; 27 modules and existing runtime identities |
| Direct fingerprint recomputation | 27/27 match |
| `npm run test:consumer` | PASS; installed63 exports/16 declaration files, all old entrypoints/27 paths and existing independent numerical fixtures |

The accepted .8 count **1,569 tests / 51 files** is historical comparison data,
not a v2.0.9 regression result. No new fixtures or tooling have been implemented
or tested at this gate. Current successful architecture execution does not claim
the proposed adversarial cases have already been run.

## 9. Execution and stop gates

**Gate A — now:** Developer reviews this plan. Stop before test/tooling/source edits.

After Gate A approval: implement only the proposed tooling/tests/documentation;
run build/typecheck, targeted tooling and affected consumer tests, architecture,
preservation, installed consumer, declaration comparison and zero-delta inventory.
Retain all previous fixtures. Record actual case counts and diagnostics in the
required extraction/boundary report, with complete final changed-file inventory.

**Gate B — mandatory even for zero delta:** present 27/27 unchanged preservation
modules/history, exact public declaration compatibility, source/emitted/installed
closure, positive/negative boundary results and consumer assertions. STOP at
`BLOCKED — PRESERVATION / ARCHITECTURE BOUNDARY REVIEW` for Developer closure
approval. No baseline amendment, commit/push or final full verification yet.

After Gate B approval only: run full `npm run verify` and `git diff --check`,
recheck declarations/closures, commit with an accurate tooling/test scope message
(for example `test(kernel): enforce gameplay contract isolation v2.0.9`), push on
the current branch, update PR #6, confirm exact-head Node22.13.0/24 CI SUCCESS and
report READY FOR REVIEW. Do not merge, release, publish or begin v2.0.10.
