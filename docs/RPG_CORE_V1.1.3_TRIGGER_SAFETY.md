# RPG Core v1.1.3 — Trigger & Execution Safety

Base: `263c9c08dce96e80716c435ed35de42be409e0c7` on
`feat/v1.1.2-skill-instance-lifecycle`, existing [PR #4](https://github.com/TjnhPro/rpg_core/pull/4).
Prerequisites: accepted v1.1.1 `0fd9f6ad269f59769ba89366763858d4a7ec9267`,
v1.1.2 implementation `2874c6edaa0e8a3b1d40861e2c1ab09a276bf1de` and acceptance/evidence
at the base commit. Developer explicitly accepted v1.1.2 and approved this delta
plan with A/A/A, the adjusted cancelled-parent policy and fixed caps.

The approved [foundation](RPG_CORE_V1.1_FOUNDATION.md) D1–D11 remain authoritative:
one S0 at accepted root cast start; reuse component-independent offense and existing
mechanics; shared immutable pins; detached children/deliveries; explicit lifetime
only for expiry; bounded DAG and existing execution loop; no repeated voluntary
cast costs; minimal opt-in; later stack/conditional/upgrade checkpoints unchanged;
Heal, Lifesteal and Mana on Hit remain deferred.

## Public contract and ownership

`@rpg/core` and `@rpg/core/skills` expose `pinSkillTriggerBundle`,
`validateSkillTriggerReceipt`, `SKILL_TRIGGER_LIMITS` and their readonly types.
`SkillExecutionEnvironment.triggers = {bundle, observe}` is optional and requires
existing ROOT mode plus `instanceSession`. No changes to SkillEngineDefinition,
SkillGameplayEffect, SkillEffectEvent or the public runtime shape.

A bundle has `{version, rootSkillId, definitions, links}`. Definitions are exact
trusted `pinSkillInstanceDefinition` handles, already validated and frozen; bundle
pinning reuses their objects. Each link has `{linkId, sourceSkillId, childSkillId,
trigger, delayMs, maxOccurrences}`. Closed shape, known IDs/triggers, unique IDs,
finite nonnegative delays, finite positive instance lifetimes, bounded occurrences,
reachable definitions and acyclic depth <=8 are validated before admission.
OnExpire requires an explicit lifetime on its source pin. At admission the pinned
root definition/version/lifetime must match the actual execution. Failure precedes
S0 capture, action/resource commitment and observer calls.

Skills owns the bounded transient queue and receipt trust. Mechanics still owns
collision geometry; combat validates live eligibility; damage owns S0 and damage;
effects owns status expiry. Existing manual child registration keeps all v1.1.2
admission rules. Matching pinned manual descendants inherit trigger provenance for
their existing lifecycle only; no child is created by a trigger here.

## Authoritative trigger sources

| Trigger | Source and occurrence | Origin |
| --- | --- | --- |
| OnImpact | Existing projectile kernel reports an eligible entity contact, once for stop_on_hit or once per projectile/target for pierce | Exact existing collision point, passed as an additive internal callback argument |
| OnExpire | Existing active Skill Instance naturally reaches its gameplay deadline; capture immediately before terminal payload compaction | Root target/ground/self aim anchor pinned at successful cast start (caster position fallback) |

Dodge is a contact and creates OnImpact, independently of successful OnHit/DoT.
No parsing of effect-hit, visual callbacks or synthetic activation events is used.
Wall, ground landing, no-target and AoE/direct/melee impacts are unsupported here.
**Ground-impact Meteor is not supported.** Projectiles from the existing timed
emitter use the same contact path and retain the original instance provenance.

Action completion, status expiry, projectile termination, explicit cancellation
and session disposal never become natural Skill expiry. Finished/expired parents
remain valid origins for already-issued delivery contacts. Cancelled parents also
permit contacts from deliveries authenticated when launched before cancellation;
there is no external occurrence admission API. Manual terminal-parent registration
still rejects. Existing accepted intents/deliveries remain detached. Dead but
registered sources follow existing delivery policy; missing sources reject new
contact work, or produce entity_not_found at expiry intent admission.

## Boundary order and deterministic queue

Existing gameplay boundary order is unchanged: instance expiry capture/terminal
compaction, status expiry/reconciliation, DoT, projectile contact/damage, emitter,
AoE sequence, cleanup, then trigger drain. Existing root activation-before-action
completion remains in the caller's action hook. The caller still partitions at
activation and external mutation boundaries. No new clock, scheduler or loop.

Batches are ordered by timestamp, phase (OnExpire before OnImpact), numeric root
admission order, per-parent occurrence sequence, stable instance-ID tie-break,
and occurrence discriminator. Links within an atomic batch retain pinned array
order. Lexicographic actor serial ordering is never used for root priority.
Reservations are recalculated in this same order when earlier-priority occurrences
are discovered later. Budget decisions therefore do not inherit lifecycle record
iteration order. Work-overflow diagnostics aggregate further rejected batches.

The observer receives frozen accepted/rejected intent results after gameplay work.
Accepted results contain an immutable Core-issued receipt with session/root/parent/
current instance, source, trigger occurrence/link/child, depth, origin, atMs,
executeAtMs and optional delivery/target. `executeAtMs=atMs+delayMs` is intent data;
it does not schedule or execute a child in this checkpoint. Receipt IDs encode
instance, trigger, occurrence, link and timestamp; handles additionally authenticate
the owning session generation. Revalidating the identical handle is read-only and
returns success with changed:false. Copies, conflicting payloads, other sessions,
roots/parents and disposed sessions fail closed with invalid_receipt/invalid_session.
No requeue, RNG, cost, cooldown, observer notification or child reservation occurs.

Opt-in observers, including legacy emit callbacks inside these boundaries, cannot
reenter action/lifecycle mutation or advancement. APIs reject or throw
trigger_reentrancy before mutation. Cleanup remains permitted, drops pending
notifications and prevents resurrection. Trusted stat/position/RNG adapters remain
caller-owned data providers as before; they must not mutate Core while computing.

## Fixed budgets and rejection

| Dimension | Limit | Enforcement |
| --- | --- | --- |
| maxDepth | 8 edges | Static DAG and runtime ancestry/depth defense |
| maxIntentsPerRoot | 128 | Accepted intents plus pending batch reservations |
| maxLiveChildren | 32 | Declared policy only; actual child registration enforcement belongs to v1.1.4 |
| maxQueuedPerBoundary | 256 intents | Whole-batch reservation before receipt commit |
| maxWorkPerBoundary | 512 link units | Bounded staged work and bounded rejection diagnostics; one aggregate overflow diagnostic |

At most 129 definitions and 128 links are pinned per bundle; maxOccurrences is
an integer in [1,128] per instance/link. Invalid graphs fail before root admission.
Runtime exhaustion rejects the whole relevant trigger batch with reason,
dimension, timestamp, root/instance and link IDs. No partial batch is accepted;
no damage rollback and no family abort. Budget diagnostics do not spawn children.
There is no fake child/projectile counter. Zero-delay intents terminate at the
observer; recursive child execution is deferred, not claimed as tested gameplay.

Only bounded transient batches retain S0 during a boundary. Exact receipt handles
weakly retain S0/child pin in a session-owned weak payload map, replaced on shutdown.
Contexts retain shared bundle/provenance until shutdown for detached deliveries.
Terminal lifecycle records still omit S0/definition. No copied event history,
second action/resource ledger, global registry or family-release API. Caller-held
historical execution/delivery observations can naturally retain their own data.

## Compatibility and preservation

Opt-out formulas, schemas, RNG calls, MP/cooldown, mechanic snapshots, public event
unions and legacy forwarders are unchanged. The internal projectile callback gains
a fourth collision-point argument; existing shorter callbacks remain valid.

Only three historical baseline modules change. Exact declaration deltas are
recorded with before/after fingerprints and approval provenance in
`behavior-baseline.json`, preserving every earlier approved history:

- skill-execution: SkillExecutionEnvironment (optional triggers) and executeSkill
  (preflight and provenance binding).
- skill-effect-integration: createSkillEffectRuntime (session initialization),
  clearSkillEffects (trigger disposal), launch (delivery authentication),
  dispatchSkillEffects (observer guard), advanceSkillEffects (intake/drain/guard),
  plus new private guardedEnvironment. Damage, hit and snapshot functions unchanged.
- projectile: tickProjectileBodies (pass existing contact point only).

The v1.1.2 module has minimal hooks for pin trust reuse, pre-compaction expiry,
manual descendant provenance and observer mutation guards. No implementation under
src/shared is edited; historical VERSION/EXPORT-MANIFEST/example hash remain intact.

## Acceptance evidence

`tests/skills/skill-trigger.test.ts` consolidates T1–T10 and opt-out checks:
actual projectile contact/Dodge/stop/pierce; natural expiry and false-origin
negatives; immutable bounded DAG validation; exact-handle replay/forgery/session
isolation; same-time expiry/contact ordering; numeric roots 2/10 and reversed
expiry discovery; depth 8/9, root128, queue256/257, work512/513, atomic rejection;
observer/reentrant cleanup; terminal/dead/missing source policies; coarse/fine
ordered intent/event/RNG equality; runtime depth defense through real lifecycle.
The existing Core suite provides T11 legacy mechanics and snapshot regression.
`examples/skill-trigger.ts`, copied into the installed consumer, provides T12 strict
ESM/type/export and real natural expiry/replay/disposal checks alongside existing
root/domain/27 legacy-path identity and pinned headless digest checks.

Local verification on Node 24.18.0:

- Focused trigger suite: 14 tests PASS. Existing skills/integration focused run:
  81 tests PASS before the final three additional trigger scenarios.
- `npm run verify`: PASS, all 209 tests across 22 files; build and strict Core,
  tests and examples types PASS; architecture 44 modules, no runtime cycles;
  preservation all 27 historical modules PASS.
- Headless example: unchanged target HP70, seed73, cleanup and determinism PASS.
- Installed consumer: strict Node-less TS and ESM PASS, nine domain exports and
  27 legacy namespaces identical, internal imports blocked. Trigger example:
  one OnExpire intent at100, executeAt110, exact replay true, forged/disposed false,
  one S0 capture and MP95; zero Child Skill execution.
- `git diff --check`: PASS. CI Node22.13.0/24 is required on the pushed checkpoint;
  exact run links/status will be provided in the delivery report.

Evidence label: `TRIGGER_SAFETY_VERIFIED` within the approved entity-contact scope.
This is implementation verification; Developer acceptance is still required.

v1.1.4 Nested Skill Composition: **NOT IMPLEMENTED**. No automated child instance,
child gameplay, extra cost/cooldown, nested damage or trigger-driven scheduler.
Live-child cap enforcement and authenticated receipt consumption/registration are
next-checkpoint work. Ground/wall/no-target impact is outside approved scope;
there is no new capability gap blocking the approved v1.1.3 contract.
