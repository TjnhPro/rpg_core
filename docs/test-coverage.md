# Core test coverage matrix

v2.0.7 resource extraction: `tests/stats/resource-parity.test.ts` checks 223
accepted-source observations (97 error cases, 13 original-thrown-object cases),
ordered getter traces, exact values/key order and captured elapsed arguments.
`kernel-resource-calculation.test.ts` covers generic policies, signed above-max
increase, lazy ineligible inputs, nonzero minima, precision/overflow and three
independent installed consumer styles. Existing recovery integration scenarios and
installed gameplay examples retain event/observer ordering, source identity and
replay semantics. The [resource review](v2/2.0.7-resource-calculation-extraction.md)
records verification counts and the approved modules 8/12 preservation amendment.

v2.0.6 targeted extraction evidence: `tests/damage/defense-parity.test.ts`
compares 150 accepted-source observations (25 error cases), complete nested
results/key order and RNG/getter traces, plus receiver/error/reference identity
checks. `kernel-defense.test.ts` and the installed Kernel-only consumer cover
independent Text RPG fixed fractional reduction, custom rating/level scaling and
ARPG policies. Tooling checks declaration closure and Legacy numerical ownership.
The [review report](v2/2.0.6-critical-defense-extraction.md) records actual counts
and the separately approved preservation gate, including final verification.

v1.2.5 recovery acceptance: `tests/integration/recovery-acceptance.test.ts` adds
35 actual-Core RC01-RC08 cases for Life on Hit/Kill and Mana on Kill composition,
exact fatal HP75/MP58/event order, live caps/modifiers, identity, replay/disposal,
depth/intents/live-child/queue/work budgets and coarse/fine equality.
`examples/recovery-acceptance.ts` runs in the existing installed strict TS/ESM
consumer. RC09 retains full regression and preservation. See the
[closure matrix](RPG_CORE_V1.2.5_RECOVERY_ACCEPTANCE_CLOSURE.md).

Phase 2 baseline: `8176acb` (144 tests); completed Phase 2: 162 tests in 18 files.
This is a contract/evidence matrix, not a line-coverage or balance certification.
All existing cases survive the domain organization; 18 focused cases were added.

v1.1.1 adds root snapshot integration evidence in
[`tests/integration/root-offense.test.ts`](../tests/integration/root-offense.test.ts)
and an installed-package recipe in [`examples/root-snapshot.ts`](../examples/root-snapshot.ts).
The [S1–S12 mapping](RPG_CORE_V1.1.1_ROOT_SNAPSHOT.md#evidence-and-compatibility)
covers all existing delivery modes under opt-in, live target validation, immutable
offense, rejection/replay/session isolation and deterministic advancement. Legacy
tests and the consumer's example hash remain unchanged. No child runtime is claimed.

| Domain | Verified contract | Evidence | Phase 2 change / limits |
| --- | --- | --- | --- |
| Stats | Attributes → derived scaling, caps, source dedup, absolute resources | `tests/stats/stat-calculation.test.ts`; actual stat adapter in `tests/skills/skill-execution.test.ts` | Split original mixed test; add initialization, changed maxima, dead actor/no regen, living fraction, invalid resources. Not an exhaustive configuration cross-product. |
| Modifiers | Flat → summed Percent → points, stable ordering, explicit active sources, source-instance dedup | `tests/modifiers/modifier-core.test.ts`, `tests/effects/effect-modifiers.test.ts` | Add reversed ordering, conflict rejection, distinct identities, inactive passives, disabled sources, invalid contributions/nonfinite results. |
| Damage | Physical/Magic B0/B1, Crit, live mitigation, snapshot offense | `tests/damage/damage-core.test.ts`; skill-effect and RPG integrations | Original numeric Physical/Magic tests retained; integration covers live defense/gear changes and Magic DoT. |
| Defense | Armor/MR selection, coefficients/levels/caps, Dodge threshold and no-RNG branches, invalid input | `tests/damage/defense-engine.test.ts`; delivery integration tests | Add direct boundary/failure tests; missing config stays an observable no-mitigation result. |
| Combat | Entity/HP transition, target/faction admission, actions, restriction/defeat cancellation | `tests/combat/combat-entity.test.ts`, `tests/skills`, `tests/integration/status-restrictions.test.ts` | Original exactly-once defeat test retained; full state/target/cancel evidence remains in actual-Core skill/restriction scenarios. |
| Skills | Invalid admission causes no mutation; cost/cooldown commit, serial replay, zero/100% activation, cancellation | `tests/skills/skill-engine.test.ts`, `skill-execution.test.ts`; `tests/integration/skill-integration.test.ts` | Preserve existing evidence: no new duplicates of snapshot/cancellation/exactly-once tests. |
| Effects | Definition validation, apply, refresh, independent stacks, exact expiry, restrictions, terminal cleanup | `tests/effects` (four files); `tests/integration/effect-integration.test.ts`, `status-restrictions.test.ts` | Preserve independent contract tests and integration tests; lifecycle tests are not redundant with dispatch tests. |
| Mechanics | Melee circle/cone/rectangle, stop/pierce projectile, instant/sequence AoE, timed emitter, stacked DoT | `tests/integration/skill-effect-integration.test.ts`, `skill-integration.test.ts`, `rpg-core-integration.test.ts` | Actual dispatch/geometry/damage/DoT implementations, not a replacement engine. Mechanics are verified within delivery scenarios; no standalone duplicate matrix. |
| Spatial | LOS, exact grid boundaries, corner adjacency, range | `tests/spatial/grid-geometry.test.ts`; skill range scenarios | Add corner cutting, negative-direction endpoint, zero-length/invalid traversal and exact range boundary. |
| Integration | Skill → lifecycle/modifiers → offense/defense → HP/events, source defeat, session disposal | `tests/integration` (five files) | Multiple layers remain because each asserts different contracts; shared fixture supplies actual Core and caller wiring. |
| Determinism | Independent seeded runs, coarse/fine boundary partition, event order, exactly-once and session isolation | lifecycle/stacking tests; mixed scenarios in `tests/integration`; `examples/run.mjs` | Pinned example SHA-256 remains `29e8dbe79332a34a6760628aebfa157e5788a5750038183de558310fa9102656`. Caller must partition at real boundaries. |
| Package | Strict external TS without ambient Node, native ESM, root + nine domains, blocked deep imports | `scripts/consumer-smoke.mjs` (`npm run test:consumer`) | Add all 27 archived legacy JS/declaration paths and canonical namespace identity. Not a census of private downstream repositories. |
| Architecture | Domain edges, runtime cycles vs type cycles, forwarder-only legacy, copied canonical declarations | `scripts/check-architecture.mjs`, `tests/tooling/architecture.test.ts`; existing module-specific source guards | Add adversarial isolated source trees for dynamic/type/import-equals/require loading, empty-import cycles, external/nonliteral dependencies, duplicates and rogue legacy code. Semantic equivalence of differently written code still needs review. |

Run `npm test -- tests/<domain>` for focused cases and `npm run verify` before delivery.
`typecheck` compiles Core/tests; `example` compiles examples separately, and the
consumer compiles installed declarations with `skipLibCheck: false`. CI uses Node
22.13.0 and 24. Runtime UI, assets, animation, inventory UI, farming, login and
content balance are outside this suite's ownership.

Fixtures: `skill-core.ts` supplies entities/config/grid/RNG and calls actual stats,
damage, skills and effects; `skill-timeline.ts` composes boundary advancement and
event-driven cancellation. The small skill-execution fixture isolates action
admission without a delivery runtime. `source.ts` reads canonical paths from the
reviewed module map for narrow architecture assertions. No fake damage/lifecycle
implementation was found or added.


v1.1.2 lifecycle evidence: `tests/skills/skill-instance.test.ts` covers the approved
L1�L14 matrix together with `examples/skill-instance.ts` in the installed strict
consumer. See [contract and results](RPG_CORE_V1.1.2_SKILL_INSTANCE_LIFECYCLE.md).
Identity, shared S0, detached lifecycle and expiry are covered; automatic triggers
and child gameplay dispatch remain outside this checkpoint.

v1.1.3 trigger safety: `tests/skills/skill-trigger.test.ts` covers T1�T10 through
real projectile/lifecycle paths, pinned DAG/replay/session validation, ordered
bounded batch reservation and callback cleanup. Existing integration tests cover
T11 opt-out mechanics; `examples/skill-trigger.ts` is compiled and executed in the
strict installed consumer for T12. See [checkpoint evidence](RPG_CORE_V1.1.3_TRIGGER_SAFETY.md).
Nested Child Skill execution was outside that checkpoint.


v1.1.4 composition: `tests/skills/nested-composition.test.ts` adds actual-Core
N1-N11 evidence with `tests/fixtures/nested-skill.ts`: A projectile contact -> B AoE
-> B natural expiry -> C timed radial projectiles, shared S0/own ranks, live defense,
detached lifecycle, replay, exact/overflow budgets, concurrent roots and cleanup.
Existing suites retain N12 legacy coverage and the unchanged headless digest.
`examples/nested-composition.ts` runs from an installed archive for N13, including
strict public types, real child damage/HP and single cost/cooldown/action serial.
See [v1.1.4 contract and evidence](RPG_CORE_V1.1.4_NESTED_COMPOSITION.md).


v1.1.5 stack consumption: `tests/effects/stack-consumption.test.ts` and
`tests/integration/stack-consumption.test.ts` cover authoritative exact-N removal,
owner capability/replay, expiry/isolation, atomic failure, actual Root/Child AoE
damage, B0 flat contributions and coarse/fine determinism.
`examples/stack-consumption.ts` runs through the strict installed consumer.
See [contract and evidence](RPG_CORE_V1.1.5_STACK_CONSUMPTION.md).
v1.1.6 conditional triggers: `tests/integration/conditional-triggers.test.ts` adds
actual landed/kill/threshold -> bounded Child/HP evidence, source-scoped predicates,
exact-N consumption/admission, expiry identity, replay/failure atomicity, exact work
limits and coarse/fine determinism. `examples/conditional-triggers.ts` runs in the
installed consumer. DoT OnKill attribution is explicitly deferred as a separate
capability gap; see [contract and evidence](RPG_CORE_V1.1.6_CONDITIONAL_TRIGGERS.md).


v1.1.7 Skill upgrades: `tests/integration/skill-upgrade.test.ts` covers immutable
resolution, actual projectile/radial/AoE/slow/Child gameplay, atomic rejection,
revision isolation, exact limits, conditional consume/replay and determinism.
`examples/skill-upgrades.ts` runs old/new revisions in the installed consumer.
See [contract and evidence](RPG_CORE_V1.1.7_SKILL_UPGRADES.md).


v1.1.8 final acceptance: [closure matrix and evidence](RPG_CORE_V1.1.8_ACCEPTANCE_CLOSURE.md)
reuses checkpoint suites and the installed consumer. One added upgrade-suite case
connects upgraded Apply, threshold, exact-N consume and Child landed/Dodge/empty
outcomes, including no refund, replay and disposal; no production source changes.


v1.2.0 Healing: `tests/combat/healing.test.ts` covers canonical math/validation;
`tests/integration/healing.test.ts` covers actual Root/Child HP/events, live caps,
identity/relation/range rejection, replay, ordered callbacks and zero heal RNG.
`examples/healing.ts` runs in the existing strict external installed consumer.
See [Healing contract and preservation amendment](RPG_CORE_V1.2.0_HEALING_FOUNDATION.md).


v1.2.1 Lifesteal: `tests/integration/lifesteal.test.ts` covers LS01-LS06 actual
HP damage/recovery, six deliveries, original-source identity, fatal OnKill,
Root/Child S0/costs, replay/budgets/disposal and coarse/fine determinism.
`examples/lifesteal.ts` runs LS07 in the existing installed strict TS/ESM consumer.
See [contract and preservation evidence](RPG_CORE_V1.2.1_LIFESTEAL.md).

### v1.2.2 Mana on Hit

`tests/combat/mana-gain.test.ts` covers MH01 normal/capped/full/zero/fractional,
large finite inputs and rejected invalid bounds. `tests/integration/mana-on-hit.test.ts`
covers MH02-MH07 real landed/zero/dodge/fatal/missed/DoT contacts, live modified
Max Mana, paid cost, six damage deliveries, deduplication, immutable closed schema,
Lifesteal event/HP/MP ordering and unchanged RNG, Root/Child S0 and amounts,
identity/liveness, activation/receipt replay, session disposal, budgets and
coarse/fine timelines. `examples/mana-on-hit.ts` runs MH08 in the existing strict
TS/ESM installed consumer, including real damage + HP + MP and public exports.
See [checkpoint evidence](RPG_CORE_V1.2.2_MANA_ON_HIT.md).

### v1.2.3 Explicit HP/MP Restore

`tests/integration/explicit-restore.test.ts` covers ER02-ER06 actual HP/MP/cost/
events, recipient effective caps, restore-only Root/Child identity pins, target
validation, rejection before commitment, ordered effects, replay, disposal,
budgets, combined Lifesteal/Mana on Hit and coarse/fine timelines. ER01 reuses
`tests/combat/healing.test.ts` and `tests/integration/healing.test.ts`.
`examples/explicit-restore.ts` covers ER07 through the existing installed consumer.
See [contract and evidence](RPG_CORE_V1.2.3_EXPLICIT_RESTORE.md).

### v1.2.4 Percent Recovery

`tests/integration/percent-recovery.test.ts` covers PR01-PR07 closed percent schema,
real HP/MP/caps/events, invalid stats, zero gain, mixed flat/percent ordering,
Child-only percent HP identity, live recipient modifiers, source/target rejection,
receipt replay/disposal and coarse/fine shared modifier-expiry boundaries.
Previous flat tests remain unchanged. `examples/percent-recovery.ts` and the existing
installed consumer cover PR08 normal/capped recovery and public TypeScript narrowing.
See [contract/evidence](RPG_CORE_V1.2.4_PERCENT_RECOVERY.md).


### v2.0.8 Numerical Snapshot / Context extraction

`tests/damage/snapshot-parity.test.ts` compares the accepted-source snapshot oracle;
`tests/damage/kernel-snapshot.test.ts` covers closed shapes, detached aliases,
shared topology, special numbers, nested freeze and native errors.
`tests/integration/snapshot-extraction.test.ts` checks accepted Root/Child/trigger/
recovery recipes and real reference identity. Existing delivery/RNG/lifecycle
suites remain unchanged. `tests/fixtures/kernel-snapshots-consumer.ts` runs three
independent numerical vocabularies in the installed strict NodeNext/ESM consumer.
Developer approved the exact module 10 preservation amendment on 2026-10-18.


### v2.0.9 Gameplay contract isolation

`tests/tooling/gameplay-boundary.test.ts` checks real direct/transitive gameplay
contracts in source and emitted declarations, plus deep Kernel CLI edge guards.
Each negative has a valid control and requires a forbidden dependency/declaration
diagnostic. The installed consumer repeats the closure cases against archived
declarations with strict NodeNext compilation. `gameplay-contract-compatibility.ts`
keeps public Legacy unions/imports and missing Kernel gameplay exports explicit.
`tests/kernel/gameplay-boundary-consumer.test.ts` and the installed smoke test
run Text RPG, Vo Lam and ARPG numerical recipes without gameplay engines.
`node scripts/review-gameplay-boundary.mjs` emits read-only zero-delta evidence.
See [Gate B report](v2/2.0.9-gameplay-contract-decoupling.md). Developer accepted
v2.0.9 at `f5c22e2431075dc9b610359fdede99460aee850e` on 2026-10-18.


### v2.0.10 Legacy delegation and runtime isolation

`tests/tooling/legacy-delegation.test.ts` resolves actual TypeScript declarations
at 24 Kernel call sites, wrapper edges and the returned numerical resolver;
it checks nine type-valid in-memory adversaries with valid controls, plus a
valid-control/forbidden-declaration case through the unchanged architecture checker.
Import aliases are a positive control. Finite owner mappings do not infer dynamic
callback execution or detect every equivalent arithmetic expression.

`tests/integration/legacy-isolation-parity.test.ts` compares 61 complete traces
captured from isolated accepted Git source, adds live identity/error assertions,
and verifies budget frontiers. Two appended random-in-area scenarios prove six
Position draws each, exact strike positions and full fine/coarse trace parity;
the original 59 expected observations remain hash-locked. Notifications include resources, action/serial,
cooldowns, delivery/stack state; events contain complete numerical breakdowns.
The installed consumer repeats all 61 via public package entrypoints. Existing
seven goldens and runtime suites remain unchanged.

`node scripts/review-legacy-isolation.mjs` emits source/declaration hashes,
27 unchanged preservation records/history, exact exports, static diagnostics and
the trace matrix. It writes stdout only. See [Gate B evidence and measured
commands](v2/2.0.10-legacy-delegation-isolation.md). Gate B is approved; final
`npm run verify`, commit/push and CI are reserved for Gate C.
