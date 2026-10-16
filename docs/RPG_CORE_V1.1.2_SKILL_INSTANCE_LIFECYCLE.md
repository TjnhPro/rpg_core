# v1.1.2 — Skill Instance & Lifecycle

Status: implementation complete; verification recorded below. No child gameplay dispatch.

## Authority and baseline

Developer accepted v1.1.1 and authorized v1.1.2 implementation on 2026-10-16:
“đã ngiệm thu - có thể triển khai v1.1.2 theo plan và các quyết định đã chốt”.
This lifts the earlier prerequisite hold. P1–P6 below and the approved
[Foundation D1–D11](RPG_CORE_V1.1_FOUNDATION.md#8-developer-approved-decisions-and-checkpoint-boundaries)
are authoritative. The attachment's draft alternatives are superseded.

Branch: `feat/v1.1.2-skill-instance-lifecycle`, based on accepted commit
`0fd9f6ad269f59769ba89366763858d4a7ec9267`.
[PR #3](https://github.com/TjnhPro/rpg_core/pull/3) remains under Developer merge
control; v1.1.2 uses a separate branch/PR. The accepted base has independent
clean-checkout verification and green [Node 22.13.0/24 CI](https://github.com/TjnhPro/rpg_core/actions/runs/38834599604).
See [v1.1.1 remediation evidence](RPG_CORE_V1.1.1_ROOT_SNAPSHOT.md#pr-3-review-remediation--2026-10-16).

## Approved implementation plan and decisions

1. Add private instance metadata to existing `SkillEffectRuntime` ownership in
   canonical Skills. Expose immutable observations, definition pins and minimal
   registration/transition/query functions through root and Skills exports.
2. Bind roots only after real accepted actions; preflight identity/time/lifetime
   before offense capture or resource commit. Use existing activation/cancel hooks.
3. Admit manually registered children using trusted parent/pin handles and receipt;
   inherit exact S0, own immutable definition/config/lifetime. No child action/effect.
4. Process expiry in existing delivery advancement boundaries; preserve terminal
   metadata/replay tokens, drop heavy payloads, invalidate session at shutdown.
5. Verify L1–L14 with real Core and installed strict Node-less consumer; narrowly
   review preservation deltas and run full verification. Stop at this checkpoint.

| Decision | Implemented contract |
| --- | --- |
| P1 A | Server supplies unique session namespace; root identity is namespace + Core action identity; child identity appends trusted receipt to parent ancestry. Exact replay inert, conflicting pin rejects. No counter/ID service. |
| P2 A | pending/active/finished/expired/cancelled. Root follows action activation. No lifetime means immediate finish on activation; lifetime means expiry from activation. Action completion does not expire instance or remove delivery. |
| P3 A | Retain compact terminal metadata and tiny identity token until shutdown. Remove terminal definition/S0 references. Live descendants and existing delivery snapshots retain S0 they need. No history/parallel action ledger/family release API. |
| P4 Minimal Hybrid | Manual child admission only from pending/active parent; existing children detached. Terminal provenance and delivery activation/S0 remain available for future authenticated late receipts; no terminal-parent bypass or trigger dispatch now. |
| P5 A | Existing root admission/reconciliation remains authoritative. Dead registered source permits child registration/activation; missing source rejects new work. Accepted replay remains inert. Target disappearance does not cancel instance. |
| P6 B | Expiry at deadline wins over explicit finish/cancel at the same clock. Root activation before action completion. Terminal transition once, sorted deadline then lexical instance ID. No queue/total-order engine. |

## Public contract and trust

Enable with `createSkillEffectRuntime(0, effects, {offenseMode:'root',
instanceSession:'server-unique-session'})`. `instanceSession` requires root offense
mode. Without it, v1.0 and v1.1.1 behavior stays unchanged. Server uniqueness is a
caller guarantee, not a process-global namespace registry.

Optional `SkillExecutionEnvironment.skillInstanceLifetimeMs` is positive finite
milliseconds from actual activation; using it without an instance session rejects
admission. It does not alter action duration, cost, cooldown or content schema.

- `rootSkillInstance(runtime, executionSnapshot)` returns only exact Core-bound
  root observations; cloned/cross-session snapshots return undefined.
- `pinSkillInstanceDefinition(definition, configVersion, lifetimeMs?)` reuses
  existing closed definition validation and immutable pinning. Validate once,
  reuse the exact returned handle across sibling/descendant registrations.
- `registerChildSkillInstance(runtime, parent, pin, receipt, now, combat)` creates
  pending children only. Receipt is a nonempty trimmed trusted adapter string.
  Payload identity is the exact pin handle under the exact parent. Reusing a
  separately created pin, even with equal values, is a conflicting replay.
  `now` is the current operation clock, not a replacement creation timestamp.
- `activateSkillInstance`, `finishSkillInstance`, `cancelSkillInstance` return
  `{success:true, instance, changed}` or `{success:false, reason}`. Root pending
  activation/cancel is action-owned; use existing `advanceSkillExecution` and
  `cancelSkillExecution`. Active root gameplay finish/cancel does not cancel action.
- `inspectSkillInstance(runtime, id)` returns frozen current observation. IDs do
  not grant transition rights: an exact session-owned handle is required. Older
  Core-produced observations remain trusted handles; clones and forged IDs do not.
- `nextSkillEffectBoundary` includes instance deadlines; `advanceSkillEffects`
  processes them using the existing clock. Advance runtime to `now` before action
  hooks or manual operations. Nonfinite/rollback/future mismatch fails closed.
- `clearSkillEffects` cancels remaining live instances at `runtime.now`, releases
  records, invalidates handles, and returns frozen compact cancellation observations
  for the opted-in session. Already terminal records are not re-terminalized.
  Legacy calls and repeated disposal still return `undefined`.

IDs encode JSON arrays: `[namespace, actionInstanceId, ...receipts]`. JSON escaping
preserves separators without collisions; Core action serial validation remains in
use. No arbitrary depth/child/event budget was introduced ahead of v1.1.3.
Missing source blocks new admission/activation; a previously accepted operation
replay does not inspect source or mutate state. Trust is session identity, not
public object shape. Pins/observations never expose mutable internal maps.

## Transition matrix

| From | Operation | To / reason |
| --- | --- | --- |
| absent | accepted root action / trusted child registration | pending |
| pending root | existing action activation | active at exact activationTime |
| pending child | explicit activation with registered source | active at current clock |
| active without lifetime | activation completes | finished / instant, same timestamp |
| active with lifetime | existing clock reaches deadline | expired / lifetime at exact deadline |
| active | explicit finish | finished / manual |
| pending child or active | explicit cancel | cancelled / manual |
| live root with action metadata | existing cancel/reconciliation | cancelled / existing reason (or action_lost) |
| live | session shutdown | cancelled / session_end, then records released |
| terminal | repeated accepted registration/activation or same terminal operation | inert, changed:false |
| terminal | other transition / new manual child admission | reject; no resurrection |

Root cancellation uses existing action restrictions, defeat and missing-source
policy. Natural action completion only removes actor action metadata; gameplay
instance may remain active. Children never cascade. Expiry is settled before
status callbacks at a delivery boundary and before explicit root cancellation.
Coarse action advancement can observe activation later; recorded activation and
expiry still use the original exact deadlines. Gameplay dispatch still requires
partitioning at actual activation boundaries as in v1.1.1.

## Retention and future integration

Terminal records hold ancestry, skill/version, creation/activation/end timestamps,
status/reason and a compact pin token. They hold no definition/S0. Older frozen
observations held by callers naturally retain their payload; Core cannot release
caller references. No event history or second MP/cooldown/action state is stored.

Existing projectiles/objects/sequences keep their original trusted activation
snapshot after parent terminal, including S0 and definition. This permits future
Core-authenticated OnImpact/OnExpire admission based on preserved provenance and
surviving delivery context, without accepting arbitrary terminal-parent handles.
v1.1.3–v1.1.4 must authenticate those receipts themselves; this checkpoint neither
implements trigger receipts nor claims delayed nested child gameplay works.

## Changed declarations and compatibility

`docs/behavior-baseline.json` updates exactly nine declarations in two existing
entries. Their before/after hashes are retained under `followUpChanges`; all
v1.1.1/historical approval provenance and all other hashes remain unchanged.

| Owner | Declaration | Reason |
| --- | --- | --- |
| skill-execution | SkillExecutionEnvironment | Optional explicit instance lifetime |
| skill-execution | executeSkill | Atomic preflight and accepted-root bind |
| skill-execution | cancelSkillExecution | Root lifecycle cancel without cascading delivery |
| skill-execution | reconcileSkillRestrictions | Follow existing restriction/action loss |
| skill-execution | advanceSkillExecution | Activate root from real action boundary |
| skill-effect-integration | createSkillEffectRuntime | Explicit session opt-in |
| skill-effect-integration | clearSkillEffects | Session cleanup and compact observations |
| skill-effect-integration | nextSkillEffectBoundary | Include gameplay instance deadlines |
| skill-effect-integration | advanceSkillEffects | Process lifecycle expiry in existing loop |

New implementation is `src/skills/skill-instance.ts`; explicit public exports in
`src/skills/index.ts`. No shared forwarder, formula, damage/defense/contact policy,
S0 shape/capture timing, package version, dependency, release or licensing change.
The default headless digest and legacy runtime identity remain acceptance gates.

## Evidence and checkpoint limits

`tests/skills/skill-instance.test.ts` covers L1–L12/L14: root admission and rejection,
siblings/grandchildren, shared S0/own frozen rank pins, detached transitions,
authenticated replay/conflict, forged/cross-session/stale handles, dead/missing
source and target loss, terminal payload release/shutdown, two roots/sessions,
coarse/fine deadlines and equal-time precedence, no gameplay/cost/RNG, invalid
session/lifetime/time and floating-point deadline overflow. Existing integration
suites continue to verify actual mechanics/contact/defense.

L13: `examples/skill-instance.ts` runs Root A → Child B → Grandchild C with a
shared pin/S0 via installed public exports. `scripts/consumer-smoke.mjs` compiles
it under strict Node-less ESM, checks readonly types, then asserts Root finished,
B active, C pending, one capture and MP=95. Also checks root/domain export identity,
legacy archive paths, blocked deep imports and private lifecycle helpers.

Verification results: pending final full verification.

Only `SKILL_INSTANCE_LIFECYCLE_VERIFIED` and
`ROOT_SNAPSHOT_PROPAGATION_VERIFIED` are applicable after verification passes.
No automatic triggers, child effect dispatch, nested damage, trigger budgets,
stack consumption, conditional triggers or skill upgrades are implemented here.
No new capability beyond the approved checkpoint was required.
