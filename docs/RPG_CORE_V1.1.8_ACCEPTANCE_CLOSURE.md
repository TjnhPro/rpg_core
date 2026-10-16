# RPG Core v1.1.8 — End-to-End Acceptance & Closure

Scope: acceptance tests and documentation only, on
`feat/v1.1.2-skill-instance-lifecycle`, [PR #4](https://github.com/TjnhPro/rpg_core/pull/4),
base `main`. Preflight: clean tree and matching local/remote HEAD
`05888d1b009fc37b83e1ab18a005952f3f14c934`; Node 24.18.0. Developer explicitly
accepted v1.1.7 at that SHA and instructed implementation of this closure task.
Foundation D1–D11 and approved checkpoint contracts remain authoritative.
Historical checkpoint documents describe their own delivery-time review state;
this record does not rewrite that history or grant final Developer acceptance.

## Accepted checkpoint provenance

| Checkpoint | Accepted SHA | Recorded authority |
| --- | --- | --- |
| v1.1.1 | `0fd9f6ad269f59769ba89366763858d4a7ec9267` | [v1.1.2 prerequisite](RPG_CORE_V1.1.2_SKILL_INSTANCE_LIFECYCLE.md#authority-and-baseline) |
| v1.1.2 | `263c9c08dce96e80716c435ed35de42be409e0c7` | [v1.1.3 prerequisite](RPG_CORE_V1.1.3_TRIGGER_SAFETY.md); implementation `2874c6edaa0e8a3b1d40861e2c1ab09a276bf1de`, followed by clean-checkout evidence |
| v1.1.3 | `0e85797ee5907ab574018deac749744519125bc6` | [v1.1.4 prerequisite](RPG_CORE_V1.1.4_NESTED_COMPOSITION.md); includes delivery-authority correction |
| v1.1.4 | `f8d75751917f441907925e756e24c7c617211015` | [v1.1.5 explicit acceptance](RPG_CORE_V1.1.5_STACK_CONSUMPTION.md) |
| v1.1.5 | `a59d7f60174823201dca69fae7280214fe1e3b6e` | [v1.1.6 explicit acceptance](RPG_CORE_V1.1.6_CONDITIONAL_TRIGGERS.md) |
| v1.1.6 | `3792306f77891c191be5f8de7d6f3cdbc568844d` | [v1.1.7 explicit acceptance](RPG_CORE_V1.1.7_SKILL_UPGRADES.md) |
| v1.1.7 | `05888d1b009fc37b83e1ab18a005952f3f14c934` | Developer's v1.1.8 prerequisite confirmation in this task: “đã nghiệm thu xong - triên khai Task v1.1.8” |

## Acceptance matrix

PASS means executable evidence passed, within the approved contract, not acceptance
of deferred mechanics or a general game/balance/performance certification.

| Checkpoint | Result | Actual-Core evidence and installed recipe |
| --- | --- | --- |
| v1.1.1 Root Snapshot | PASS | [root-offense tests](../tests/integration/root-offense.test.ts): once-only capture, immutable independent components, live defense, rejected admission/session isolation and seeded coarse/fine delivery; [recipe](../examples/root-snapshot.ts) |
| v1.1.2 Skill Instance | PASS | [lifecycle tests](../tests/skills/skill-instance.test.ts): own ancestry/pins, exact shared S0, detached cancellation, expiry-first boundaries, terminal compaction/disposal; [recipe](../examples/skill-instance.ts) |
| v1.1.3 Trigger Safety | PASS | [trigger tests](../tests/skills/skill-trigger.test.ts): canonical projectile contact/natural expiry, trusted receipts, numeric ordering, forgery/replay/session and bounded atomic intake; [recipe](../examples/skill-trigger.ts) |
| v1.1.4 Nested Composition | PASS | [composition tests](../tests/skills/nested-composition.test.ts) N1–N11: actual A projectile → B AoE → B expiry → C radial, independent ranks/lifecycles and one S0/action/MP/CD commit; [recipe](../examples/nested-composition.ts) |
| v1.1.5 Stack Consumption | PASS | [Effects tests](../tests/effects/stack-consumption.test.ts), [gameplay tests](../tests/integration/stack-consumption.test.ts): exact-N identities, isolated pools, stale/forged plans, atomic failures, real B0 bonus and no-refund outcomes; [recipe](../examples/stack-consumption.ts) |
| v1.1.6 Conditional Triggers | PASS | [conditional tests](../tests/integration/conditional-triggers.test.ts): landed/Dodge/zero/lethal, actual single fatal transition, cap/rising-edge/rearm, source/target predicates, consume-and-spawn and 512-work atomicity; [recipe](../examples/conditional-triggers.ts) |
| v1.1.7 Upgrade | PASS | [upgrade tests](../tests/integration/skill-upgrade.test.ts): whitelist, conflicts/identity/revision rejection, frozen inputs, actual mechanics/modifier/Child HP, old in-flight S0/new selected cast, limits and determinism; [recipe](../examples/skill-upgrades.ts) |

E2E-01 reuses N1–N4: A/B damage 20/45, four radial directions and C hits 80;
distinct root/Child/grandchild IDs and pinned definitions share the exact S0,
capture=1, MP95, action serial=1, cooldown unchanged. The installed chain also
asserts three instances, four C hits, target HP615 and shared S0.

E2E-02 reuses CT01–CT12 and stack tests for refresh-at-cap, rearm, insufficient
stacks, actual OnKill once, eligibility and replay/session isolation. One material
cross-checkpoint gap warranted **one new test**, appended to the existing upgrade
suite: `E2E-02/03: upgraded Apply crosses threshold; committed Child Dodge/empty
AoE never refunds stacks`. Across landed/Dodge/empty outcomes, old revision applies
two stacks without firing; selecting the upgraded revision appends the third
canonical Apply, crosses 2→3, consumes exactly three, admits a shared-S0 Child and
leaves zero stacks. Child HP is 980 on landed, 1000 on Dodge/empty, with no refund.
Activation/receipt replay creates no extra work; disposal invalidates receipts and
prevents future gameplay. Existing fixtures/dispatcher/calculator/lifecycle are used.

E2E-03 reuses UG01–UG12: single/triple projectile HP980/940, wider AoE target set,
slow application/expiry, Child-only upgrades, and atomic invalid-set rejection.
Old in-flight delivery remains damage20 after resolver execution and caster-stat
mutation; only the next explicitly selected cast captures the new offense.
Installed v1 → v2 → v1 selection reproduces the original revision's result.

E2E-04 reuses N9 budget scenarios: depth8/9, intents128/next occurrence,
live Children32/33, delayed queue256/overflow, work512/overflow, family
projectiles256/next whole burst, and emission32/33. No partial Child batch or
radial burst commits. CT09/11 checks work exhaustion before stack spend; UG11
retains version mismatch rejection. N10 compares HP, instances, events and seeded
RNG; CT12/UG12 additionally compare authoritative effect state. These results use
the documented caller boundaries: activation, external mutations and expiry before
same-time reads. Coarse advancement does not authorize historical reads of changed
caller-owned state. Existing replay/disposal suites cover detached and delayed work.

## Package, regression and architecture

The unchanged [external installed-consumer workflow](../scripts/consumer-smoke.mjs)
packs the archive and installs outside the repository. Strict NodeNext/ESM types
use `skipLibCheck:false`, `types:[]`; all root/nine domain exports match, including
the resolver. Internal helpers stay absent and unsupported deep imports reject.
All 27 historical JS/declaration forwarders and canonical runtime identities pass.
No extra consumer harness or public API coverage was necessary.

Installed nested/stack/conditional/upgrade demonstrations pass. Original headless
HP70/seed73 retains SHA-256
`29e8dbe79332a34a6760628aebfa157e5788a5750038183de558310fa9102656`.
Full regression includes Stats, Modifiers, Combat, Damage, Effects, Skills,
Mechanics, Spatial, action costs/cooldowns/timing, target validation and DoT FIFO.
Architecture: 45 modules, zero runtime cycles, existing type-only cycles reported;
domain edges, duplicate declarations and forwarder-only `src/shared/**` enforced.
Preservation: 27 historical modules, original reviewed SHA/provenance and approved
follow-up hashes unchanged. No source, formula, package/export, dependency, version,
licensing, baseline or runtime change is part of v1.1.8.

## Verification and final handoff

- `npm ci --ignore-scripts`: PASS, Node 24.18.0; no lockfile change.
- `npm test -- tests/integration/skill-upgrade.test.ts`: PASS, 8 tests.
- Final `npm run verify`: build/declarations, strict types, architecture,
  preservation, **255 tests / 27 files**, deterministic example and external
  installed consumer PASS; zero failing tests.
- `git diff --check`: PASS.
- Accepted base CI at `05888d1b009fc37b83e1ab18a005952f3f14c934`:
  [PR run](https://github.com/TjnhPro/rpg_core/actions/runs/38849148762),
  [push run](https://github.com/TjnhPro/rpg_core/actions/runs/38849145292), both
  Node22.13.0/24 PASS. These are baseline runs, not closure CI.
- The [PR #4 final handoff](https://github.com/TjnhPro/rpg_core/pull/4) records the
  exact final closure commit SHA and immutable push/PR CI links after publication.
  Closure is READY only once both Node22.13.0/24 jobs pass at that exact SHA.

Changed files: this closure record, one coverage reference and the one integration
test above. Public API/breaking changes: none. Existing opt-in contracts and legacy
default behavior remain preserved. Recommendation: **READY FOR DEVELOPER FINAL
REVIEW**, conditional on the exact-head CI gate in the linked final handoff.

Blockers: none found in the authorized acceptance scope. Approved deferrals:
`DOT_ONKILL_ATTRIBUTION` (aggregated DoT lacks authenticated fatal-instance owner),
ground/wall/no-target impacts, `OnKill + requiresStacks` on defeated targets,
delayed/multiple consuming links and upgrades outside the approved whitelist.
Heal/Lifesteal/Mana-On-Hit remain separate Core capabilities. These are scope
boundaries, not regressions. Future optimization: no new requirement; measurement,
balance, game integration and consumer-specific policies remain outside acceptance.
Developer final review is required before merge. No merge, publication, tag,
release, Editor dependency change or further roadmap phase is authorized here.
