# v2.0.10 Legacy Delegation & Isolation — implementation plan

Status: **Gate B approved — Gate C local verification PASS**. Date: 2026-10-18.

Baseline/HEAD: `f5c22e2431075dc9b610359fdede99460aee850e`.
Branch: `audit/v2.0.0-architecture-boundaries`.
Existing [PR #6](https://github.com/TjnhPro/rpg_core/pull/6) is OPEN at that HEAD.
The working tree was clean before this plan was added.

Developer explicitly accepted v2.0.9 at this HEAD and approved this Gate A plan.
Developer approved Gate B with ZERO PRESERVATION DELTA on 2026-10-18 and
authorized Gate C full verification, commit/push and exact-head CI. No production
or preservation amendment is authorized or proposed.

## 1. Preflight and evidence boundaries

Read the repository instructions, README, architecture, migration matrix,
v2.0.0 baseline, .3–.9 extraction/boundary reports, preservation baseline,
relevant public barrels, canonical implementations and existing tests.
Historical statements in older reports describe their original cuts; this audit
uses the current source and current verification results.

Executed on Node 24.18.0:

| Check | Current result |
| --- | --- |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm run check:architecture` | PASS; 62 canonical modules, zero runtime cycles; ten reported paths containing type edges retained |
| `npm run check:preservation` | PASS; 27 historical modules, declaration fingerprints unchanged, prior approvals retained |
| `npm run test:consumer` | PASS; external packed installation, strict types/ESM, ten Legacy entrypoints, 27 historical paths, blocked deep imports and independent Kernel fixtures |
| `node scripts/review-gameplay-boundary.mjs` | PASS against its pinned .8 baseline; zero production/package/preservation/golden delta through .9; all 99 Legacy declaration files and Kernel declarations byte-identical |
| `npm test -- tests/skills tests/integration tests/effects tests/tooling/defense-ownership.test.ts` | **429 tests / 27 files PASS**; existing tests, not new .10 implementation evidence |
| Git comparison against .9 HEAD | No change to `src/**`, package metadata, baseline or existing fixtures |

The existing review script pins `58b53ca1727002c3a31273f23cc0b484c40ef1f0`;
it is corroborating evidence, not a claim that it already pins the .10 baseline.
The proposed .10 review script will compare explicitly against `f5c22e...`.

Current public inventories: Kernel **63 symbols / 17 runtime functions**;
Legacy root **243 symbols / 122 runtime values**; ten old entrypoints;
**99 Legacy declaration files**, **27 historical forwarders** and
**27 preservation modules**. Seven accepted golden JSON files are unchanged.
Preservation file SHA-256:
`7a8cf3cc60f66b951ba664e455ec2e653c9025165bd6ec8ccf5e4926a911711a`.

Verified GitHub CI for this exact HEAD:

- [Push, Node 22.13.0 and 24 SUCCESS](https://github.com/TjnhPro/rpg_core/actions/runs/39132228830).
- [PR, Node 22.13.0 and 24 SUCCESS](https://github.com/TjnhPro/rpg_core/actions/runs/39132231425).

No final full `npm run verify`, commit, push or PR edit was performed for .10.

## 2. Actual call graph

Source inspection was complemented by a TypeScript Program/TypeChecker walk:
resolve each CallExpression's symbol, follow import aliases to declarations,
record containing function/file and actual Kernel target. This found **24
direct Kernel call sites in five Legacy implementation files**. An import by
itself was not counted as a call. Callback execution and branch behavior require
the runtime tests below; this static walk is not dynamic execution proof.

```text
Public Stats.calculateEffectiveStat -> Kernel.calculateEffectiveValue
Public Stats.resolveCharacterStats -> Kernel.calculateStats
  -> prepared resolver callback -> Legacy prepareModifierResolver closure
    -> Kernel prepareNumericalModifiers closure (aggregation)
Public Modifiers.collectActiveModifiers -> Kernel.selectCanonicalModifiers
Public Modifiers.resolveModifiers -> prepareModifierResolver
  -> Kernel.prepareNumericalModifiers -> returned numerical resolver
Legacy damageBonusReason -> Kernel.matchesAnyTag (lazy policy branches)

executeSkill -> startSkillAction -> cooldownDurationMs
  -> Kernel.calculateCooldownDurationMs -> Legacy deadline/MP/action commit

dispatchSkillEffects / advanceSkillEffects
  -> canonical direct/melee/AoE/projectile/sequence/emitter delivery -> hit
    -> calculateDamage -> resolveDefenseHit -> Kernel.calculateHit
      -> Dodge early return OR:
         Kernel.calculateDamageB0
           -> resolveFlat callback -> resolveModifiers -> Kernel resolver
         Legacy eligibility/bonus records -> Kernel.calculateDamageBonusValue
         Kernel.calculateCritical -> Kernel.calculateDamageB1
      -> mitigateDefense -> Kernel.calculateMitigation
    -> applyDamage -> applyEntityDamage -> Kernel.calculateResourceTransition
    -> Legacy HP commit / recovery / events / conditional trigger observation

advanceSkillEffects -> tickDotRuntime -> dotDamage
  -> calculateDamage for each captured stack -> same Kernel path (no Crit/Dodge RNG)
  -> ordered finalDamage sum -> applyDamage -> same transition/commit owner

Skills heal / lifesteal -> applyEntityHealing -> Kernel resource transition
Skills restore_mana / manaOnHit -> applyEntityManaGain -> Kernel resource transition
Public updateCurrentResources -> Kernel.normalizeResource (HP then MP)
  -> alive && normalized HP > 0 -> Kernel.calculateResourceRegeneration (HP then MP)

snapshotActorDamage -> actorOffense -> Kernel.cloneSnapshotData (two modifier lists)
prepareRootOffense -> snapshotActorOffense -> actorOffense
  -> Kernel.cloneSnapshotData (one complete Root offense graph)
  -> Kernel.freezeSnapshotData
Root/Child trust + component assembly remain in Skills
deriveSkillRootDamage -> structuredClone(authenticated component projection)
```

Public Kernel captures remain independent APIs. Legacy deliberately uses the
internal clone/freeze primitives at accepted boundaries, not the closed-schema
public numerical capture validators. Delivery/DoT copies and public detached
Root projections are gameplay snapshot boundaries, not extra numerical engines.

## 3. Delegation inventory

Source abbreviations: S=`src/stats/stat-calculation.ts`,
M=`src/modifiers/modifier-core.ts`, D=`src/damage/damage-core.ts`,
F=`src/damage/defense-engine.ts`, C=`src/combat/combat-entity.ts`,
I=`src/skills/skill-effect-integration.ts`, T=`src/effects/dot-core.ts`.
All numerical facades below are pure with respect to entity resource stores;
Skills/Combat runtime commits are described separately.

| Entrypoint / source | Actual incoming path | Canonical target | Legacy adaptation, validation and projection | RNG / current evidence |
| --- | --- | --- | --- | --- |
| `calculateEffectiveStat` S:14 | Public caller; character calculation uses Kernel batch instead | Direct `calculateEffectiveValue` | Live bounds/enabled, optional precision, transform; returns value/uncapped/original resolved reference | None; `stat-extraction-parity`, `stat-mutation-parity` |
| `resolveCharacterStats` S:21 | Public/caller-provided stat resolution; Effects/Skills obtain resolved stats through adapters | Direct `calculateStats`, then callback to prepared numerical resolver | Fixed IDs/order, defaults, dodge/elemental policy, live numerical views; projects attributes/core/values/details/scaling without recalculation | None; same parity suites, `effect-modifiers`, `skill-execution` |
| `cooldownDurationMs` S:9 | `startSkillAction` in skill-engine:93; public callers | Direct `calculateCooldownDurationMs` | Transparent scalar delegation; Kernel validates resolved cooldown | None; `stat-calculation`, `skill-engine`, `skill-execution` |
| `collectActiveModifiers` M:34 | Public/caller equipment/buff/passive adapters | Direct `selectCanonicalModifiers` | Caller-owned live source membership; full-payload equivalence via adapter | None; `modifier-core`, `modifier-extraction-parity` |
| `prepareModifierResolver` M:44 | Damage canonicalization, `resolveModifiers`, supplied Stats resolver | Direct `prepareNumericalModifiers`; invokes returned closure | Existing validator/condition policy; projects seven fields; preserves original mutable contribution arrays/objects | None; `modifier-extraction-parity`, `effect-modifiers` |
| `resolveModifiers` M:56 | D:24/28/45/69 and external adapters | Transitive through prepared resolver | Same base/target/modifiers; no second aggregation | None; same modifier goldens plus Damage goldens |
| `damageBonusReason` M:16 (internal) | D canonical bonus and T application filtering | Direct `matchesAnyTag` in event/target branches | Type/scope/target vocabulary and exact reason/short-circuit ordering remain Legacy | None; `modifier-extraction-parity`, `damage-parity` |
| `calculateDamage` D:16 — B0 | I `hit`, T `dotDamage`, public callers | Direct `calculateDamageB0` | Snapshot validation/budgets, source order, live getters and one resolveFlat callback; projects nested B0 | After Hit, before Critical; `damage-parity`, `snapshot-parity` |
| `calculateDamage` — item bonus | Same callers | Direct `calculateDamageBonusValue` | Selects original item sources/eligibility, supplies live coefficient, preserves source references | Before Critical; `damage-parity` |
| `calculateDamage` — Critical | Same callers | Direct `calculateCritical` | Eligibility, .85 Legacy bound, input-receiver-preserving thunk, DoT public sentinel 1, original diagnostics | Lazy, after B0/bonus preparation; `defense-parity`, `damage-parity` |
| `calculateDamage` — B1 | Same callers | Direct `calculateDamageB1` | Supplies already-selected records and Critical bonus, projects results | After Critical; no repeat RNG/eligibility; `damage-parity` |
| `resolveDefenseHit` F:8 | D and public callers | Direct `calculateHit` | Context validation, selected dodge rule, DoT eligibility, original hit diagnostics | Unbound Dodge callback; no draw for zero/ineligible; `defense-parity`, `defense-engine` |
| `mitigateDefense` F:16 | D (landed and dodge-zero branches), public callers | Direct `calculateMitigation` | Validation/type/rating/rule selection, captured coefficient reference/live fields/levels, provenance and diagnostic projection | None; `defense-parity`, `defense-ownership` |
| `applyEntityDamage` C:7 | I `applyDamage`, public callers | Direct `calculateResourceTransition` | Finite/sign validation, above-max allow/decrease policy; projects before/after/appliedDamage/defeated | None; `resource-parity`, `combat-entity` |
| `applyEntityHealing` C:13 | I `heal`, `lifesteal`, public callers | Direct same transition | Bounds validation, reject above-max, no revive; projects appliedHealing | None; `resource-parity`, `healing`, `lifesteal` |
| `applyEntityManaGain` C:19 | I `restoreMana`, `manaOnHit`, public callers | Direct same transition | Bounds validation, reject above-max, allow zero recovery; projects appliedMana | None; `resource-parity`, `mana-gain`, `mana-on-hit`, `explicit-restore` |
| `updateCurrentResources` S:43 | Public/caller recalculation or regeneration boundary | Direct normalization twice, conditional regeneration twice | Validation precedence, elapsed ms/seconds conversion, alive policy, precision 12, lazy getters; projects currentHp/currentMp | None; `resource-parity`, `stat-calculation` |
| `snapshotActorDamage` D:74 / internal `actorOffense` | Public/caller `snapshotDamage` adapter | Kernel modifier resolver and two internal clone calls | Gameplay flat/tag vocabulary and mutable default aliases retained | Capture timing owned by delivery; `snapshot-parity`, `snapshot-extraction` |
| `snapshotActorOffense` D:90 | `prepareRootOffense`, public callers | Internal whole-graph clone then freeze, plus preceding actor adaptation | Raw Legacy validation and invalid_root_offense catch mapping; no closed numerical validator | No RNG; `snapshot-parity`, `root-offense`, `snapshot-extraction` |
| `dotDamage` T:38 | I tick callback, public callers | Transitive `calculateDamage` -> same Kernel calculators | Per-stack captured offense, dot eligibility, ordered sum of finalDamage results | No Crit/Dodge RNG; `skill-effect-integration`, `conditional-triggers`, `snapshot-extraction` |

These are audit PASS findings for current delegation. They do not mean every
possible dynamic caller or getter mutation has already been exhaustively tested.

## 4. Duplicate arithmetic classification

| Candidate | Classification / disposition |
| --- | --- |
| Attribute scaling, percent/point stacking, transforms, bounds, precision | A: Kernel Stats/Modifier implementations; no second Legacy stat pass found |
| Modifier identity/dedup/order/grouping and aggregation | A: Kernel modifier-resolution; B: Legacy full-payload equivalence and validator/source policy |
| Rank/scaling/flat products, item bonus accumulation, B1 additive/clamp | A: Kernel Damage; B: Legacy eligibility and nested diagnostic mapping |
| Critical, Dodge and rating/final/prevented arithmetic | A: Kernel Defense; B: selected Legacy rule, armor input nonnegative adaptation and diagnostic mapping |
| HP/MP transitions, normalization, regeneration/toFixed | A: Kernel Resources; B: finite/bounds/alive policy and elapsedMs / 1000 conversion |
| Cooldown duration multiplication | A: Kernel; C: deadline addition/remaining time/replacement deadline maximum in Skill Engine |
| Numerical offense clone/freeze | A: Kernel primitives; B: raw Legacy offense validation and vocabulary mapping |
| MP cost subtraction, action duration/speed, activation offset/progress | C: gameplay action timing/commit, not the resolved-cooldown algorithm |
| Lifesteal `appliedDamage * rate`, percent-of-max requested recovery | C: Skills request policy; transition/caps still delegate Kernel |
| Stack-consumption `flatPerStack * consumedCount` | C: gameplay outcome request/modifier construction; actual damage still canonical |
| DoT ordered sum of per-stack finalDamage and tick/lifetime counters | C: application grouping/timing; every per-stack calculation delegates Kernel |
| Projectile distance/collision/ties, melee/AoE geometry, sequence placement RNG, emitter radial angles | C: Mechanics/Spatial, not generic Damage/Defense |
| Effect/Skill definition deep copies/freezes, immutable instance views, public Root detached copies | C: distinct config/trust/public-copy boundaries; not numerical capture API substitutes |

**D: no concrete duplicate numerical calculator found in this audit.** No
production replacement is proposed. This is a reviewed finite inventory, not
a static proof that every semantically equivalent future expression is absent.
Any later D finding requires reproduction, accepted-source oracle, exact minimal
adapter proposal and separate approval before source changes.

## 5. Runtime owner graph and mutable state inventory

```text
Application clock/entities/content/RNG/notifications
  -> Skills executeSkill -> Skill Engine admission -> Combat action slot
  -> Skills activation/dispatch/advance (one existing SkillEffectRuntime)
       -> Mechanics delivery/geometry/scheduling
       -> Effects canonical lifecycle store and DoT groups
       -> Damage/Combat adapters -> numerical Kernel -> Legacy commit/events
       -> Trigger capture/drain -> Instance child admission -> same dispatch
Root Offense authenticates S0; Instance tracks lifecycle/parentage;
Trigger authenticates receipts/queue/budgets. Kernel owns none of these stores.
```

| Responsibility / state | Authoritative owner and exact constructs | Allowed collaboration / preservation evidence |
| --- | --- | --- |
| Action admission/serial/active action | `combat/combat-state.ts`; caller's CombatActionSlot | skill-engine calls startCombatAction; no mirrored action store; `skill-engine`, `skill-execution` |
| Cost and cooldown deadlines | `skills/skill-engine.ts`; readyAt/replacementRevisions; entity.currentMp subtraction in startSkillAction | Existing validation then action start then cost/deadline; `skill-engine`, `skill-upgrade` |
| Execution/activation/cancellation | `skills/skill-execution.ts`; slot.skillExecution; healingEntities WeakMap pins original recipients | Metadata on original action slot, not second Acting/Idle authority; `skill-execution`, `status-restrictions` |
| Dispatch frontier and active deliveries | I; lastActivation, bullets, objects, sequences, dots, dotPolicies, now/active | Existing boundary advance invokes Mechanics; no alternative scheduler/queue; `skill-effect-integration`, `rpg-core-integration` |
| Root S0 trust | `skills/root-offense.ts`; sessions WeakMap, activated WeakSet | Binding only to accepted execution; child assembly shares S0, public derive copies; `root-offense`, `snapshot-extraction` |
| Instance parentage/lifetime/handles | `skills/skill-instance.ts`; instanceSessions, executionInstances, session.records/handles | Trigger calls authenticated child admission; distinct from receipt authority; `skill-instance`, `nested-composition` |
| Receipt/session/queue/budget authority | `skills/skill-trigger.ts`; definitionTokens, bundles, sessions, receipts, deliveries; receiptData, contexts, batches, executions, work/queued/notifying/advancing | No second receipt registry; integration supplies childDispatcher callbacks using same instance owner; `skill-trigger`, `nested-composition`, `conditional-triggers` |
| Effect store and exact-N consumption | `effects/effect-lifecycle.ts`; private effects/frontiers/clock/ended and #consumePlans | Same EffectLifecycle passed to runtime; prepare/consume preserves FIFO, exact expiry, stale rejection; `stack-consumption`, `effect-lifecycle` |
| DoT grouping/stack/tick state | `effects/dot-core.ts`; runtime.dots.groups, remainingMs/nextTickMs/stacks; I dotPolicies | Gameplay attribution/capture/expiry stay Legacy; `skill-effect-integration`, `conditional-triggers` |
| Delivery state/geometry/timing | `mechanics/projectile.ts`, melee-hitbox, instant-aoe, aoe-sequence-core, emitter-core; supplied body/sequence/emitter records | Mutate existing runtime collections, not second Skills owner; delivery integration suites |
| HP/MP resource commits and events | I applyDamage/heal/restoreMana/lifesteal/manaOnHit; skill-engine cost; Combat action transitions | Pure Combat facades return results; I writes live entities, emits existing ordered events; recovery integration suites |
| Upgrade definition pin resolution | `skills/skill-upgrade.ts` | Detached configuration operation, not execution/resource/session owner; `skill-upgrade` |

Trigger limits remain exactly depth 8, intents/root 128, live children 32,
queued/boundary 256, work/boundary 512, plus existing occurrence and projectile
limits (256 projectiles/root). Instance live-child admission and Trigger budget
checks coordinate the same records; they are not competing stores.

`registerTriggeredSkillChildren` validates the full receipt set and pending
payloads before the existing beforeCommit/registration boundary. Stack consumption
uses the same EffectLifecycle plan. Tests must preserve all-or-nothing invalid
receipt behavior, original failure precedence, replay rejection and no unintended
HP/MP/stack commits. Disposal clears the existing owners and invalidates old trust.

## 6. Actual gaps and proposed implementation cut

No production delegation/isolation defect was reproduced. Existing architecture
checks already block Kernel reverse dependencies, domain violations, runtime
cycles, copied whole-module fingerprints and unregistered historical forwarders.
Their documented limits matter: they do not prove arbitrary semantic equivalence
or single ownership merely from function names.

The gaps are **verification/maintenance gaps**, not demonstrated behavior defects:

1. No complete checked symbol-level Legacy-to-Kernel delegation inventory; the
   existing defense-ownership test protects only a narrow portion of the pipeline.
2. Domain allowances do not capture the reviewed symbol-level callers of private
   trust/admission APIs or state-write owners; broad domain permission alone is
   insufficient evidence of runtime ownership.
3. Existing .3–.8 goldens lock numerical boundaries and selected integration
   summaries. They do not provide one .9-pinned full event/observer state/RNG/trust
   trace matrix for the .10 scope.
4. Existing installed examples verify real public gameplay APIs, but need an
   explicit .10 comparison connecting their delegation and full trace observations
   to source-side evidence.

**Proposed production source files to change: NONE.** No API, calculator,
validator, package export or preservation baseline change is requested.

## 7. Proposed files (only after Gate A approval)

| File | Minimal purpose |
| --- | --- |
| `scripts/audit-legacy-delegation.mjs` (new) | Read-only TypeScript symbol/call/owner inventory plus existing architecture results; resolve aliases and transitive wrappers, identify returned resolver callback seams explicitly |
| `tests/fixtures/legacy-delegation-audit.mjs` (new) | Reviewed finite delegation/owner mapping, classified arithmetic and allowed trust callers; no executable calculator |
| `tests/tooling/legacy-delegation.test.ts` (new) | Valid controls plus type-valid adversarial missing/bypassed delegates, alias/transitive paths, unauthorized trust callers and wrong state-write owners |
| `scripts/capture-legacy-isolation-golden.mjs` (new) | Manual accepted-Git-blob oracle capture pinned to f5c22e; isolated temp compilation, source/scenario hashes, no normal-test alternate engine |
| `tests/fixtures/legacy-isolation-scenarios.ts` (new) | Observation scenarios calling actual Core APIs with caller clock/grid/RNG; reuse existing fixture concepts, no substitute executor |
| `tests/fixtures/legacy-isolation-golden.json` (new) | New accepted-source complete observations; seven prior goldens remain untouched |
| `tests/integration/legacy-isolation-parity.test.ts` (new) | Exact golden comparison plus live reference/error/trust/atomicity observations |
| `tests/fixtures/legacy-isolation-consumer.ts` (new) | Public package imports only; same canonical execution paths and trace checks after installation |
| `scripts/consumer-smoke.mjs` | Extend existing installed package gate with the new fixture; retain every existing scenario/deep-import/forwarder check |
| `scripts/review-legacy-isolation.mjs` (new) | Read-only f5c22e comparison: source hashes, all declarations/exports, 27 baseline records/history, metadata and accepted goldens; never rewrites baseline |
| `docs/v2/2.0.10-legacy-delegation-isolation.md` (new) | Final ownership/delegation/duplicate/parity/compatibility/limitations review evidence |
| `docs/v2/2.0.10-legacy-isolation-evidence.json` (new) | Actual measured inventory/hashes/counts/diagnostics generated explicitly for review |
| `docs/ARCHITECTURE.md`, `docs/test-coverage.md`, `README.md` | Current ownership/verification links and accurate coverage, without rewriting historical evidence |
| This implementation plan | Record Developer gate decisions and implementation result references |

The existing architecture/preservation checkers remain authoritative and unchanged.
The narrow audit script complements them; its tooling tests run under existing
`npm test`, so no package-script change is needed. If existing checkers prove
defective, stop for a minimal delta plan rather than silently widening the cut.

## 8. Verification design

### Static evidence and adversarial controls

Use TypeChecker-resolved declaration identities, call sites, reviewed wrapper
edges and state-write locations rather than textual function-name occurrence.
Returned callbacks and dynamic caller adapters receive explicit mapping plus
runtime evidence; unresolved indirect edges must be reported, not invented.

Type-valid controls include aliases and valid transitive delegation. Negative
fixtures include an unused Kernel import beside a bypassed facade, a removed
canonical invocation, a delegate to an unrelated function, unauthorized access
through an internal trust helper, a mirrored queue/state writer and a forbidden
Kernel dependency. Each rejection must identify its specific violated mapping or
actual architecture diagnostic; TypeScript failure alone does not count.
Apply owner checks to reviewed responsibilities and symbols, not a universal ban
on Maps, arithmetic, labels or callback usage. Preserve approved type-only cycles.
Semantic duplicates outside these finite mappings remain a review limitation.

### Accepted-source oracle and observable parity

After Gate A, before any authorized implementation could touch production:
compile source Git blobs from `f5c22e...` in isolation and capture new observations.
Record full revision, Git source SHA-256, observation harness hash and emitted
declaration inventory. Re-capture only from that pinned accepted source; never
from candidate implementation. No previous golden is regenerated. Normal tests
load stored observations and current canonical Core only.

Encode undefined, NaN, infinities, -0, key order, nested damage/stat/modifier
breakdowns and exact error name/message. Assert thrown-object identity and
reference topology live rather than pretending JSON stores object identity.
At every gameplay notification record HP/MP, serial/action state, cooldowns,
delivery/instance/stack counts and Root/Child S0 relationships. Record Dodge,
Critical, position RNG and getter/callback order/receiver observations.

| Required scenario family | Existing evidence to preserve / new full-trace focus |
| --- | --- |
| Direct hit / rejection / activation 0/50/100 | skill-engine/execution/integration; cost/deadline/serial commit, rejected no mutation, cancellation, dead/replaced source |
| Projectile | skill-effect-integration/root-offense; launch snapshot, live defender, wall/stop/pierce/ties, dedup and exactly one commit |
| Melee / instant AoE | existing delivery tests; geometry/order/truncation/LOS, deterministic multi-target draws and commits |
| Timed AoE sequence | fixed/random placement, position RNG, strike snapshots, coarse/fine boundaries and expiry/cancel |
| Timed emitter | placement/delay/radial direction/count, emission budgets, single emission and cleanup |
| Root/Child and config pins | root-offense/skill-instance/nested-composition; one S0, inheritance, trusted handles, old/new revisions, public detached copy |
| Impact / Expire / Hit / Kill | skill-trigger/conditional-triggers; natural expiry/contact order, landed/zero/lethal eligibility, once-only receipt and child dispatch |
| Stack threshold / consume | effects and integration stack-consumption; rising edge, exact-N FIFO/source, stale/invalid atomic admission, same-boundary expiry |
| Trust/budgets/disposal | forged/replayed/cross-session/stale receipts, reentrancy, depth/intents/live-child/queue/work/projectile limits; no partial registration or second execution |
| DoT | per-application snapshot/grouping, expiry-before-tick, live mitigation, no Dodge/Critical draws and retained attribution limits |
| Heal / restore mana / percent recovery | actual recipient/live cap, HP zero no revive/MP zero recovery, event state and ordering |
| Lifesteal / mana on hit / recovery children | applied-damage request ownership, admitted source identity, damage/defeat/recovery/effect-hit/trigger observer sequence |
| Resource/stat/modifier numerical paths | all existing .3–.8 goldens including mutation/getter/error/reference/overflow/precision boundaries, unchanged |

Use existing `skill-core`, `skill-timeline`, nested fixtures or observation-only
adapters to drive actual admission/dispatch/advance APIs. Do not add a second
scheduler, action executor, event bus or resource model to simplify scenarios.
Installed verification reuses the existing pack/install workflow and public
entrypoints; this is Legacy isolation evidence, not v2.0.11 multi-RPG expansion.

### Compatibility and preservation

Emit accepted declarations from pinned .9 Git source in an isolated compiler host;
compare all 99 Legacy files and Kernel declarations byte-for-byte, not only symbol
counts. Compare exact names/value flags at ten Legacy entrypoints and Kernel;
load runtime namespaces; retain 27 forwarder identity/deep-import checks and
source/emitted/installed Kernel declaration closure. Expect 63/17 and 243/122.

Compare every tracked production file, package metadata/exports/lockfile, seven
old goldens and the entire preservation JSON/history against f5c22e. Recompute
all module fingerprints and source hashes. Expected changed historical modules:
**zero**. No RFC 6902 proposal is needed or allowed for a zero-delta cut.

If a real source/public-contract/behavior/preservation delta emerges, stop with
exact reproduction, affected declarations/module indices, before/after hashes
and minimal proposal. Do not replace this tests-only plan with an unapproved
refactor, rebaseline or formula adjustment.

## 9. Execution order and review gates

1. **Gate A approved:** Developer accepted .9 and approved this exact
   tests/tooling/documentation-only cut on 2026-10-18.
2. On approval, capture the accepted-source oracle; implement the narrow audit,
   controls/adversarial fixtures, complete observations and installed fixture.
3. Run fast tooling first; numerical goldens next; actual runtime integration
   next; build/typecheck/architecture/preservation/installed consumer and read-only
   .10 review comparison. Report actual counts, diagnostics and any uncovered gap.
4. **Gate B:** deliver full changed-file/source diff, before/after delegation and
   owner graphs, trace/reference/trust/parity evidence, exact declarations/exports,
   source hashes/fingerprints and all 27 unchanged records/history. Stop at
   `BLOCKED — PRESERVATION / RUNTIME BOUNDARY REVIEW`. No final full verify,
   commit or push before approval.
5. **Gate C after approval:** full `npm run verify`, `git diff --check`, repeat
   exact zero-delta/declaration/ownership comparison, then dedicated commit
   `test(core): enforce legacy delegation and isolation v2.0.10`, push this branch,
   update PR #6 and wait for exact-commit PR and push CI Node 22.13.0/24 SUCCESS.
   Report READY FOR REVIEW with actual counts, inventory and CI links.

No branch/PR creation, merge, release, publish, v2.0.11 or v2.0.12 work.

## 10. Risks and remaining limits

- v2.0.9 acceptance and Gate A were granted explicitly. Gate B was explicitly approved;
  local targeted checks do not substitute for Gate C full verification and CI.
- Finite AST mappings detect known bypass/owner changes, not every possible
  semantically equivalent hidden calculator; code review and runtime parity
  complement the existing dependency checker.
- Public mutable runtime containers are inherited contracts. This cut verifies
  canonical API behavior; it does not introduce proxies/private stores or promise
  safety for arbitrary caller mutation of exposed collections.
- Callback adapters and live mutable configuration prevent unrestricted static
  call-graph/determinism proofs. Keep exact lazy reads, receivers, native errors
  and reference semantics; report unresolved dynamic edges explicitly.
- Existing tests passing is baseline evidence. New complete trace and adversarial
  .10 evidence will only be claimed after implementation approval and execution.
- No Core capability gap or production repair is currently established. If one
  appears, stop for review rather than add substitute runtime/calculation logic.
