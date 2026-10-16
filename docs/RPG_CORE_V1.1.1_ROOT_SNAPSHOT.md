# v1.1.1 — Root Snapshot Inheritance

Status: **READY** for Developer review, `SNAPSHOT_INHERITANCE_VERIFIED_ONLY`.
No Child Skill Instance, nested graph, trigger queue or child dispatch is added.

## Baseline and authorization

- Branch: `docs/v1.1.0-composable-skill-foundation` (Developer requested current branch).
- Base: `2c32ebce3a5b8b86e3c22d1095645249a4202cfd`; initial worktree clean; existing PR #3.
- Architecture direction: [Foundation D1–D11](RPG_CORE_V1.1_FOUNDATION.md#8-developer-approved-decisions-and-checkpoint-boundaries), supplied by the Developer.
- The Developer approved the proposed Damage extraction, runtime-bound opt-in,
  delivery integration, narrow preservation changes and S1–S12 verification plan,
  then instructed Codex to concretize and implement that plan without asking again.
  This is implementation authorization, not a claim of independent PR approval.

## Plan and final public contract

1. Damage: extract `actorOffense` internally from `snapshotActorDamage`. Both
   legacy capture and new `snapshotActorOffense` use that implementation. B0/B1,
   defense, modifier resolution, resource logic and formulas remain canonical.
2. Skills: attach one immutable S0 to successful root execution. Associate exact
   Core-created execution references with their existing runtime using weak trust
   records. No parallel session facade, action slot, scheduler or persistent store.
3. Route existing delivery snapshots through S0 only when explicitly opted in;
   preserve all default legacy calls. Test real delivery and installed consumers.

| Public surface | Contract |
| --- | --- |
| `snapshotActorOffense(input: ActorOffenseInput): ActorOffenseSnapshot` | Damage/root export; trusted component-independent sources, modifiers, settings, crit, identity, defense rules and options. Detached, deeply readonly and frozen result. Calling this helper alone does not mint a trusted execution. |
| `createSkillEffectRuntime(now?, effects?, {offenseMode:'root'})` | Skills/root export; immutable private mode choice for the existing runtime. Default remains legacy. Runtime's inherited public shape has no new required fields. |
| `SkillExecutionEnvironment.rootOffense?: SkillRootOffenseCapture` | Explicit opt-in `{runtime, capture(caster, configVersion): ActorOffenseInput}`. Runtime must be Core-created in ROOT mode, active and at the same caller timestamp. |
| `SkillExecutionSnapshot.rootOffense?: RootOffensiveSnapshot` | Immutable root action/caster identity, capturedAt, configVersion and offense view. The exact execution object is the trusted context; cloned/serialized views cannot be rebound. |
| `deriveSkillRootDamage(runtime, execution, component): DamageSnapshot` | Skills/root export; detached copy with the independent validated component's definition/rank. Use that component's type/tags in the existing damage context. No child execution, target admission, HP write or RNG occurs here. |

Recipe: [public package example](../examples/root-snapshot.ts). Existing
`SkillEngineDefinition`, `SkillGameplayEffect`, legacy `DamageSnapshot`, package
entrypoints and default environment adapter contract retain their semantics.
The capture adapter supplies current trusted actor inputs, not a client JSON
snapshot. Adapters must be synchronous, read-only and non-reentrant, as with the
existing stat/entity adapters. Core does not acquire equipment or inventory.

## Capture, ownership and failures

Admission validates the existing action/target/range/resources, request, timing,
definition and geometry first. Stale serials reject before the capture adapter.
ROOT input is prepared/validated before resource commit; only successful
`startSkillAction` binds S0 to the accepted execution. Activation 0 observes that
binding after the existing MP/cooldown commit; activation 100 precedes completion.
Replay never calls capture again. Rejected input creates no committed root,
action, events, cost, cooldown, delivery or RNG work.

S0 retains no target, component, finalDamage or rolled outcomes. Capture detaches
and freezes nested offense once. Internal delivery assembles a shallow snapshot
over immutable S0 and already pinned definition references, avoiding another deep
clone per emitter/sequence boundary. The public derive API deliberately returns
a detached mutable `DamageSnapshot` compatible with existing consumers. DoT
continues to own its existing stack copy/filtering, FIFO, no-Crit/no-Dodge rules.
Definitions are pinned with the existing `defineSkill`; versioned reachable child
bundles/DAG traversal are not constructed before the child checkpoints exist.

Root trust is scoped to the exact runtime and execution, using weak keys instead
of an accumulating root cache. Caller-held views and surviving deliveries retain
their S0 normally. `clearSkillEffects` invalidates all bindings and disposes the
existing lifecycle/delivery owner. A copied snapshot, altered version/identity,
missing root payload, cross-session use or downgrade into a legacy runtime rejects.
Dispatch also requires Core to have reached activation, preventing a cancelled
pre-activation execution from forging a delivery using its metadata.

Invalid admission returns `invalid_context` with `errors: ['invalid_root_offense']`;
invalid explicit capture/derive or ROOT dispatch throws `Error('invalid_root_offense')`
before mutation. Existing duplicate dispatch returns false. ROOT and legacy runtime
mode must match the admission integration: dispatch rejection does not undo the
cost of an independently accepted legacy cast sent to the wrong runtime.

The target's HP, armor/MR, dodge, status/tag predicates, faction and registered
identity remain live through existing Core validation/calculation. Registered
dead sources keep emitted offense under existing delivery policy. Missing sources
reject contact; ROOT emission without a source emits the existing `effect-rejected`
shape with `entity_not_found`, without creating a projectile. Numerical public
derivation alone does not admit a target or consult an entity registry.

## Evidence and compatibility

Tests in [root-offense.test.ts](../tests/integration/root-offense.test.ts) use the
existing real-Core [fixture](../tests/fixtures/skill-core.ts), extended with opt-in
capture inputs. No mock damage resolver, child engine or clock is introduced.

| Acceptance | Evidence |
| --- | --- |
| S1 | 0/50/100 activation, once-only capture, rejected MP and stale serial, repeat dispatch and unchanged cost |
| S2/S3 | Captured gear/buff/crit retained; independent B/C-like definitions/ranks/types; actual small AoE plus four-direction timed radial projectiles; shared root values, distinct damage |
| S4 | Original sources/identity/defense rules and returned derived copies cannot mutate retained offense; nested offense views frozen |
| S5 | Live armor, Dodge, HP, status/tag bonuses, faction, target removal/generation; no stale on-hit after Dodge |
| S6 | Direct, melee, instant AoE, projectile, timed sequence, timed emitter and on-hit DoT all use ROOT offense, zero legacy adapter reads |
| S7 | Emitted delivery survives source defeat; missing source rejects; session disposal prevents later derivation/delivery |
| S8 | Forged/cloned/missing/rebound/version/cross-session context, cancelled activation, nonfinite/invalid/over-budget input fail without frontier/cost/HP/RNG/delivery mutation |
| S9 | Multiple sessions and two roots/config versions isolate offense; no mutable component alias into S0 |
| S10 | Unchanged existing legacy tests, including emission-time emitter and per-strike sequence captures; original headless example hash retained |
| S11 | Same seeded root deliveries yield equal ordered events, RNG counts and HP for coarse/fine advancement |
| S12 | External npm-pack consumer, no Node ambient types, public root/domain capture-bind-derive recipe B=20/C=60/captures=1/MP=95; ESM, all 27 legacy paths and blocked deep imports |

Targeted command: `npm test -- tests/integration/root-offense.test.ts tests/damage tests/skills tests/integration/skill-effect-integration.test.ts`
— PASS, 83 tests / 6 files. Core and test typecheck PASS.
Final `npm run verify` on Node `v24.18.0`: **PASS** — build, Core/test types,
architecture, preservation, **181 tests / 19 files**, example and installed external
consumer. The example retains target HP 70 and its pinned hash; the new consumer
recipe returns B=20, C=60, one capture, MP=95. `git diff --check` and 78 local
Markdown link/fence checks PASS. Dependencies already installed; no package change.

Changed files and reasons:

| Files | Reason |
| --- | --- |
| `src/damage/damage-core.ts`, `src/damage/index.ts` | Canonical component-independent capture and public Damage exports |
| `src/skills/root-offense.ts`, `skill-execution.ts`, `skill-effect-integration.ts`, `index.ts` | Session provenance, capture/bind/derive, root-mode delivery and public Skills exports |
| `tests/fixtures/skill-core.ts`, `tests/integration/root-offense.test.ts` | Actual-Core root adapters and 19 targeted acceptance cases |
| `examples/root-snapshot.ts`, `scripts/consumer-smoke.mjs` | Public installed-package capture/bind/derive and unchanged legacy consumer gates |
| `docs/behavior-baseline.json`, `scripts/check-preservation.mjs` | Narrow reviewed fingerprints, retained previous hashes and explicit checkpoint reporting |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/test-coverage.md`, `docs/RPG_CORE_V1.1_FOUNDATION.md`, this document | Usage, ownership/type-cycle evidence, coverage and historical/current checkpoint boundaries |

### Narrow preservation review

Only three historical entries in [behavior-baseline.json](behavior-baseline.json)
change; the other 24 retain exactly their reviewed fingerprints. Each affected
entry keeps the removed hashes and an explicit approved-change record pointing
to this checkpoint/base/authorization; the original reviewed commit is retained.
The checker still compares every declaration and compiled forwarder namespace;
its result identifies checkpoint-specific approved changes.

- `damage-core`: legacy `snapshotActorDamage` delegates to extracted `actorOffense`;
  add `ActorOffenseInput`, `DeepReadonly`, `ActorOffenseSnapshot`, `snapshotActorOffense`.
  `calculateDamage`, modifier budget and `DamageSnapshot` declaration unchanged.
- `skill-execution`: optional environment/view additions, `executeSkill` precommit
  capture/bind, `advanceSkillExecution` activation authenticity marker. Other ten
  historical declarations unchanged.
- `skill-effect-integration`: `createSkillEffectRuntime`, `clearSkillEffects`,
  private `snapshot`, `hit`, `launch`, `aoe`, `dispatchSkillEffects`,
  `advanceSkillEffects` thread root state through existing paths. Fourteen other
  declarations unchanged, including runtime/store and event shapes.

New `src/skills/root-offense.ts` owns only provenance and assembly checks.
No changes to source legacy forwarders, VERSION, EXPORT-MANIFEST, dependency or
package versions, licenses, formula/defense/geometry/effect engines or editor pins.
Architecture has 42 modules, no runtime cycles; two additional type-only cycles
connect the new Skills provenance contracts to execution/runtime (five total).

Child instances/lifecycle, replay/trigger queue/DAG and actual A→B→C dispatch
remain v1.1.2–v1.1.4. Stack Consumption, Conditional Triggers and Skill Upgrade
remain separate v1.1.5–v1.1.7 checkpoints; sustain remains D11-deferred. No claim
of `NESTED_SKILL_EXECUTION_VERIFIED`, release, publication or automatic merge.

## PR #3 review remediation — 2026-10-16

Developer review found the main implementation aligned with v1.1.1 but did not
accept it for merge. This scoped correction follows that review request;
v1.1.2 remains outside implementation scope.

The failed [GitHub Actions run](https://github.com/TjnhPro/rpg_core/actions/runs/38832565517)
compared LF checkout source against three fingerprints computed on Windows CRLF.
`behaviorFingerprint` scans TypeScript token text; template literal segments can
contain physical newlines, including newlines following `${...}` expressions.
Their raw CRLF token text differed despite identical ECMAScript runtime strings.
Thus previous working-tree verification did not establish clean-checkout success.

The fingerprint helper now normalizes physical CRLF to LF before scanning, as
ECMAScript does for template literals. It retains escaped characters, literal
content, operators, validation and declaration/signature tokens. No declaration
or legacy identity check is skipped. The other 26 baseline module entries are
unchanged, and this entry retains the replaced hashes in `reviewCorrection`.

Exactly three declarations in canonical `src/skills/skill-effect-integration.ts`
(historical key `src/shared/game/skill-effect-integration.ts`) required review:

| Declaration | Previous CRLF fingerprint | Committed LF fingerprint at reviewed HEAD `d2d7534` | Corrected fingerprint |
| --- | --- | --- | --- |
| `launch` | `8baf81c9f60854a48093f1ea4e9c3f0417969db5e3e0488de0f7995da774276d` | `cb647849b9ba962adb4df574b14391dac01afbd81a3173c6834add6f0a9a19e3` | Same as LF |
| `dispatchSkillEffects` | `71ce46e16a6c53f9145f18427ff6d8e21008c1b6e88daa6ef763f630618183e9` | `f2e997d6accfbd32a3c801ac2807d43eccb3ebaf304d8f2fd1374b010e985f51` | `6af0557427f37f9e07b5e941d88ad092751375ba7b781da69563e583fd9798d9` |
| `advanceSkillEffects` | `f249b1f9ab5ca3af083638ba34b79f6f59b3dcdbdcfcf622aa09d7659b763e15` | `658a9b29c476e51e541ca44b9ffd1304a6faa3c8df2d1299fb60153420bbf9bb` | Same as LF |

Contract comparison: `launch` and `advanceSkillEffects` retain their exact
implementation, root/legacy offense routing, geometry, timing and RNG order;
only their platform-dependent hashes change. `dispatchSkillEffects` retains exact
root/session activation authenticity, timestamp, target and identity validation
before checking its existing duplicate frontier. Source registration validation
now follows that frontier and still precedes any new activation mutation.

An authenticated already accepted duplicate at the same timestamp therefore
returns false after source removal, without damage, RNG, events, frontier changes
or other runtime/resource mutation. Forged/mismatched duplicates still reject;
a fresh activation with missing source still rejects before frontier mutation.
No new receipt store, lifecycle, public API or compatibility mode is introduced.

Targeted evidence: `npm test -- tests/integration/root-offense.test.ts
tests/tooling/behavior-fingerprint.test.ts tests/integration/skill-effect-integration.test.ts`
passes **48 tests / 3 files**. The new actual-Core replay case compares full
runtime/entity/resource/action/event/RNG observations before and after replay and
rejection. The tooling case checks LF/CRLF identity while proving changes to
literal text, escaped CRLF/LF, formulas and guards remain detectable.

Changed files: this report (also correcting one pre-existing non-UTF-8 dash);
the three-hash baseline correction with retained provenance;
`scripts/behavior-fingerprint.mjs` and its focused tooling test;
the dispatch source-check ordering and its root integration regression test.
Final delivery must additionally report full `npm run verify` on an independent
clean checkout of the correction commit and GitHub Actions Node 22.13.0 / 24
results for that exact commit. No merge acceptance is inferred from green checks.
