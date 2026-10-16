# RPG Core v1.1.6 — Conditional Triggers

Base: `a59d7f60174823201dca69fae7280214fe1e3b6e`, branch
`feat/v1.1.2-skill-instance-lifecycle`, [PR #4](https://github.com/TjnhPro/rpg_core/pull/4).
Preflight: local and remote PR HEAD matched the accepted v1.1.5 SHA; working tree
was clean, no unrelated changes. Node 24.18.0; `npm ci --ignore-scripts` succeeded.
The Developer explicitly accepted v1.1.5 and approved the v1.1.6 delta plan,
C1–C7 option A with the minimal constraints recorded below, on 2026-10-16.
Prior checkpoint approval/evidence remains in Foundation and the v1.1.1–5 documents.
This checkpoint awaits Developer review; verification does not authorize merge.

## Public contract

The existing pinned `SkillTriggerLink` adds these opt-in fields:

```ts
{
  trigger: 'OnStackThreshold', // also OnHit, OnKill; OnImpact/OnExpire retained
  stackThreshold: {effectId: 'mark', threshold: 3},
  requiresStacks: {effectId: 'mark', minStacks: 3, sourceScope: 'currentSource'},
  consumeExactly: 3, // optional; requires predicate and delayMs = 0
  // existing linkId/sourceSkillId/childSkillId/delayMs/maxOccurrences
}
```

`SkillStackPredicate` and `SkillStackThreshold` are public types. `SkillTrigger`
adds three cases; receipts optionally include `beforeStacks`/`afterStacks` for
threshold occurrences. Results add `condition_not_met` and `stack_consume_failed`.
Consumers with exhaustive trigger/rejection switches must handle the new cases.
No EffectLifecycle public API, Damage contract, formula, resource, cost, cooldown,
S0 capture, legacy default delivery or DoT timing changes. Existing unconditioned
OnImpact/OnExpire keep their event and anchor semantics. No release/version bump.

Pinning rejects unknown/non-stack effect references (a canonical modifier-effect
stack definition must exist in the pinned bundle), nonpositive/noninteger counts,
extra fields, other source scopes, delayed consumption, consumption without a
predicate, multiple consuming links for a possible occurrence, and OnKill with
requiresStacks. OnStackThreshold requires exactly its typed threshold descriptor;
other trigger kinds cannot carry one. Nested predicate/threshold objects are copied
and frozen. Existing DAG, finite-time, identity, depth and size validation remains.
Different thresholds for the same effect cannot both consume in one occurrence.

## Canonical provenance and ordering

Skills owns condition admission/provenance and uses the existing session intake,
bounded batch queue, receipts and Child dispatcher. Effects remains the stack owner.
No new engine, scheduler, event bus, persistent occurrence log or stack counter.

* **OnHit:** canonical live-target eligibility, then `calculateDamage` landed
  outcome. Dodge produces no occurrence; landed zero damage does. Capture happens
  after the authoritative HP write and before damage/defeat/UI notifications.
  Lethal landed hits still produce OnHit. Every delivery has trusted instance/S0
  binding, including direct, melee, AoE, sequence strike and projectile deliveries.
* **OnKill:** only that delivery's actual `before > 0 && after === 0` HP transition.
  Dead-target validation remains mandatory. Ground/self Children use the frozen
  resolved target-position anchor; entity Children still require a living eligible
  target and therefore reject the defeated victim. No loot/XP/death-policy changes.
* **OnStackThreshold:** read authoritative `groups()` immediately before and after
  successful canonical Skill modifier Apply, before forwarding its notifications.
  Only `before < N && after >= N` for the same source/target/effect pool qualifies.
  Refresh-at-cap is inert; real removal/expiry/consume below the threshold rearms
  the next Apply naturally. No implicit consumption. Apply serial supplies unique
  occurrence identity even for same-instance, same-timestamp rearm. External Apply
  never creates a Skill occurrence. `EffectLifecycle.apply()` is unchanged.
* **OnExpire:** retains the existing pinned expiry anchor. A predicate uses the
  previously authenticated target object, not current caster position or a new
  lookup-selected target. Missing/replaced target rejects; expiry is swept before
  the predicate read. No target is synthesized for a targetless ground root.

New conditional occurrences also verify source/target object identity against the
live registry at admission. Occurrences reuse delivery/target IDs and canonical
contact deduplication; activation replay and receipt validation never requeue work.
Threshold diagnostics carry before/after counts in the existing accepted receipt.
Expiry phase, root order and instance occurrence sequence retain existing ordering;
new landed/kill occurrences follow their causal delivery in that same queue.
New synchronous root occurrences expose a zero-time pending boundary so a coarse
advance drains them before advancing into future time.

## Predicate and atomic consumption

The authoritative pool is always `(currentSource, selectedTarget, effectId)` and
must be a stack-policy group. Predicates are read-only and are evaluated at the
existing queue admission boundary, after same-time effect expiry. Failed filters
reject only their links. Other matched links retain bounded batch admission.
Existing maxOccurrences still counts matching canonical event attempts, including
attempts later rejected by conditions; it is not a successful-child counter.

For a consuming link, preflight predicate, eligibility, exact stack availability,
queue/root/depth/occurrence/live-child and boundary-work budgets. Reuse the v1.1.5
`prepareConsumeStacks` capability. Child registration validates the entire batch,
then invokes an internal synchronous commit of `consumeStacks`, then registers the
Children without calling application code in between. Nothing can fail validation
between successful consume and registration. Exact N is removed, never a partial
amount. A failed preflight/commit registers no Child and spends no stacks/RNG.

Charge one work unit for stack consumption and reserve the immediate Child batch's
execution work before consumption. That work is not charged twice at execution.
Future projectile emissions still use the existing actual-emission budgets; Child
admission is not a guarantee that every later effect can emit. Removal notifications
and trigger observations occur after Child registration. Existing observer guards
prevent recursive mutation; session disposal after commit retains existing cleanup
semantics. Predicate-only and intent-only links never consume. A consuming link in
intent-only mode rejects rather than silently turning consumption into observation.

## Deferred capability

`CORE_CAPABILITY_GAP: DOT_ONKILL_ATTRIBUTION` — Effects DoT groups can aggregate
stacks from multiple Skill Instances, while Skills `dotPolicies` identifies only
one delivery for a group. Existing `dotDamage()` returns aggregated amount and
breakdowns, without sufficient authenticated per-instance causal ownership for
the lethal contribution. A group policy cannot prove the killer. DoT OnKill is
therefore deferred/blocked as expressly allowed by the Developer; other conditional
triggers are independent. No DoT contract extension, damage splitting, parallel DoT
engine or provenance ledger was added. DoT fatal damage still follows legacy HP
and defeat behavior and emits no speculative OnKill.

## Evidence and compatibility

`tests/integration/conditional-triggers.test.ts` uses actual Skills, Damage,
Combat and EffectLifecycle with deterministic caller adapters:

| Assertions | Evidence |
| --- | --- |
| CT01/02/03 | Landed/Dodge/zero/lethal; direct/projectile/AoE fatal transitions; pierce/AoE per-target OnHit; one kill; real ground Child HP damage; entity-victim Child rejection |
| CT04 | Fatal real DoT produces HP zero without guessing an OnKill owner |
| CT05/06 | 2→3 crossing, cap refresh, same-instance consume/rearm, distinct Apply occurrence receipts and Child HP |
| CT07/08 | Source-scoped predicate, external Apply isolation, pinned expiry identity/anchor, missing/replaced target, exact expiry before read |
| CT09 | Read-only predicate, exact 2/3 consumption, insufficient-4 rejection, Child relation failure, live-child overflow, no spend/RNG on failure |
| CT10/11 | Shared S0, one root charge/capture, activation/receipt replay, forged/cross-session/disposed receipts, callback reentrancy, replaced source |
| CT11/12 | Exact 512 work admission vs +1 rejection before consume; coarse/fine HP/events/stacks/receipts/RNG equality |
| CT13 | Existing suites, pinned headless hash, architecture/preservation and installed consumer |

The installed `examples/conditional-triggers.ts` proves canonical Apply 3 →
threshold → exact-N consume → real Child AoE, HP 1000→980, stacks 3→0, one S0/MP
charge, strict public types and package-only imports. `scripts/consumer-smoke.mjs`
asserts the result and emits `CONDITIONAL_TRIGGERS_VERIFIED`. Existing stack,
nested-composition, legacy namespace/export/deep-import and headless evidence stays.
The prior invalid-trigger schema test now uses `Unknown`, because OnHit is supported.

Preservation baseline update is narrow, based on accepted `a59d7f6`: only
`executeSkill` in skill-execution and `snapshot`, `applyDamage`, `hit`,
`dispatchGameplayEffects`, `childDispatcher`, `advanceSkillEffects` in integration.
Their old/new declaration hashes are appended to prior approval history. All other
historical declarations, original snapshot metadata and forwarders remain pinned.

## Handoff timeline and files

In the installed example at t=0, Root `R = ["stack-consumer","source#1"]`
captures S0 once and MP becomes 95. Canonical Apply serials 1/2/3 take the pool
0->1->2->3. The third Apply creates `OnStackThreshold`, occurrence `["source",3]`.
The existing receipt/Child ID is `JSON.stringify([R, "OnStackThreshold",
JSON.stringify(["source",3]), "threshold", 0])`. Admission consumes exactly three,
registers that Child with R's same S0 and its own `spend` definition, then its AoE
writes target HP 1000->980. Remaining stacks=0; one critical-roll call, zero
Dodge/position-roll calls, no second MP/cooldown/action commit.

Integration fixture timeline: Root starts t=0/activates t=50; direct landed contact
creates OnHit immediately (including lethal/zero). A fatal contact also creates
OnKill once, after HP becomes zero. Projectile contact at t=530 retains the existing
OnImpact and adds OnHit/OnKill only according to its canonical result. A Root with
100ms lifetime naturally expires at t=150; its predicate reads the pinned target
and its Child uses the original expiry anchor even after caster movement.

| Changed files | Reason |
| --- | --- |
| `src/skills/skill-trigger.ts`, `index.ts` | Add typed links/receipts, provenance capture, filters and atomic admission in existing queue |
| `src/skills/skill-effect-integration.ts` | Bind canonical deliveries; capture real hit/HP/Apply transitions and commit consumption through Child dispatcher |
| `src/skills/skill-execution.ts`, `skill-instance.ts` | Pin target/source identities; preflight target references before callback-free consume/registration |
| `tests/integration/conditional-triggers.test.ts`, `tests/skills/skill-trigger.test.ts` | 12 focused integration tests and update former unsupported-OnHit assertion |
| `examples/conditional-triggers.ts`, `scripts/consumer-smoke.mjs` | Installed public API with real HP/stack/Child gameplay |
| `docs/behavior-baseline.json` | Seven reviewed declaration changes with original hashes retained |
| `README.md`, `docs/test-coverage.md`, this document | Contract, evidence and explicit DoT limitation |

Validation on Node 24.18.0: targeted Skills/Effects/consume tests passed (93 at that
iteration); final conditional suite 12/12; full `npm run verify` PASS with 247 tests
in 26 files, build/declarations/types, architecture (44 modules; no runtime cycles),
preservation (27 modules), unchanged pinned deterministic example, and strict
installed consumer (nine domains, 27 legacy paths, blocked deep imports).
`git diff --check` passed. Fresh-checkout Node 22.13.0/24 CI is recorded in PR #4
for the final pushed commit. Status: READY for Developer review within the approved
scope; DoT OnKill is the explicitly deferred independent capability. No merge,
publish, Editor pin change or v1.1.7 implementation.
