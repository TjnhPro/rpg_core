# RPG Core v1.1.0 — Foundation & Architecture

**DOCUMENTATION CHECKPOINT — AUDIT + DEVELOPER-APPROVED ARCHITECTURE DIRECTION.**
Prepared and decisions recorded 2026-10-16. This PR contains documentation only;
implementation requires the separate checkpoint plan/review workflow.
`READY` for this checkpoint means a reviewable proposal, never working nested skills.
The current [architecture](ARCHITECTURE.md) governs implemented Core behavior.
D1–D11 below record the Developer-approved v1.1 direction; sketches and detailed
contracts remain proposals until reviewed for their implementation checkpoint.

## 1. Baseline, scope and approval boundary

| Item | Observed evidence |
| --- | --- |
| Repository | `https://github.com/TjnhPro/rpg_core` (`origin`, fetch/push) |
| Initial checkout | `maintenance/phase2-agent-readiness@6a349de24d4a17db461512df0870cc05f959c2b7`; clean working tree |
| Refreshed main / audit baseline | `origin/main@bc701cd42183072aa1fe6664ffa8ba5756a62167`, merge of PR #2; tree identical to initial checkout (`git diff 6a349de origin/main --stat` empty) |
| Documentation branch | `docs/v1.1.0-composable-skill-foundation`, created directly from refreshed `origin/main` |
| Related work | Initial preflight found no open PRs; this document is now in [PR #3](https://github.com/TjnhPro/rpg_core/pull/3), OPEN on this branch. Decision-update baseline: `3f2a9eed4dc1db2b323a163e53bdcf28dd14ecc3`, clean worktree |
| Versions | [package.json](../package.json): `1.0.0`, private; [VERSION](../VERSION): `v1.0-snapshot-20261013-b`; v1.1.x below are roadmap checkpoint labels |
| Provenance | [EXPORT-MANIFEST.json](../EXPORT-MANIFEST.json) retains source revision `3fa1a79f56ff6b8b896497ada42eee28c50fb35d` and `CANDIDATE_PENDING_INDEPENDENT_VALIDATION`; preservation separately pins `c5878d92e198acd19289f568a2ddeda5096d83e7` |
| Consumer | Task reports `TjnhPro/jx1-manager-editor` pinned to `bc701cd...`; consumer checkout/pin was not independently audited here and is not changed |
| Environment | Node `v24.18.0` (satisfies >=22.13.0); existing local dependencies used; no install or dependency change |

Read [AGENTS.md](../AGENTS.md), [README](../README.md), current architecture,
[coverage](test-coverage.md), relevant [cleanup audit](cleanup-audit.md), public
barrels, package exports, historical manifest/version and preservation checker.
Only this foundation document is changed. No source, tests, exports, baseline, package version,
editor pin, license, release or mechanics change is authorized in v1.1.0.

Labels used throughout:

- **USER_APPROVED:** D1–D11 in section 8, supplied directly by the Developer in
  “RPG Core v1.1 — Developer Architecture Decisions (Solo Dev)”. This is decision
  evidence, not a claim of GitHub review/merge or implementation acceptance.
- **ALREADY_IMPLEMENTED:** source and existing tests support the named scope.
- **PROPOSED:** a recommendation, with no authority to implement it.
- **OPEN_DETAIL:** a remaining contract/policy detail to settle at its owning
  checkpoint; does not reopen approved D1–D11 or authorize extra scope.
- **CORE_CAPABILITY_GAP:** inspected APIs cannot implement the specified mechanic;
  dependent implementation requires its separate approved checkpoint plan.
  Approved architecture does not make a missing capability implemented.

## 2. Evidence ledger: public API → implementation → assertions

References E1–E9 below identify concrete files and assertions used by the matrix.
Absence claims follow closed schema/dispatch inspection, not just text searches.
Tests were run as recorded in section 10; future acceptance cases are not PASS claims.

| ID | API / implementation | Test observations and limits |
| --- | --- | --- |
| E1 | [skills barrel](../src/skills/index.ts), [skill-engine](../src/skills/skill-engine.ts): `defineSkill`, `validateSkillDefinition`, `skillAvailability`, `startSkillAction`, `inheritSkillCooldowns`; [execution](../src/skills/skill-execution.ts): `executeSkill`, `SkillExecutionSnapshot`, activation/cancel | [skill-engine tests](../tests/skills/skill-engine.test.ts) reject unknown fields and freeze definitions; [execution tests](../tests/skills/skill-execution.test.ts), `one shared Player/Monster pipeline...`, rejection cases, activation 0/50/60/100, `snapshot locks skill/version/target/timing without attacker stats...`, defeat and stale serial cases: MP 50→30, deadline 4000, duration 400, activation 240; no `stats` field in snapshot. Definition pin is not offense pin. |
| E2 | [effects union/validators](../src/skills/skill-effects.ts): `SkillGameplayEffect`, `SkillDamageComponent`; [dispatch/runtime](../src/skills/skill-effect-integration.ts): `dispatchSkillEffects`, `snapshot`, `launch`, `hit`, `aoe`, `advanceSkillEffects`, `nextSkillEffectBoundary`, `clearSkillEffects` | [delivery integration](../tests/integration/skill-effect-integration.test.ts): `deep-pins nested damage/effects/config...` yields ordered effect0/effect1, HP 960, duplicate dispatch false and two Crit calls; cancellation before activation creates no bullet, completion retains one; ground AoE HP `[980,980,1000]`; melee circle/cone/rectangle each use shared contact. |
| E3 | [TimedObjectConfig](../src/contracts/mechanic-contracts.ts), internal [emitter](../src/mechanics/emitter-core.ts): `tickEmitterRuntime`, `emitterProjectileConfig`; E2 `launch` | Same integration file, `timed object persists after caster defeat/completion and snapshots at emission not cast`: one bullet at 150, attack 40 at emit produces B0 50 at contact despite later attack 200. Radial formula is `i*360/bulletCount + angleOffset` modulo 360; fixture uses **one bullet**, so multi-direction radial geometry is source-confirmed, not exhaustively asserted by this test. This is existing timed delivery, not a child Skill lifecycle. |
| E4 | E2 snapshots; [DamageSnapshot / snapshotActorDamage / calculateDamage](../src/damage/damage-core.ts), [damage contracts](../src/contracts/damage-contracts.ts), [damage barrel](../src/damage/index.ts) | Delivery test `projectile attacker snapshot survives gear change/death; defender armor is live at contact`: frozen B0 20, target HP 990 at 530 with armor 100; `sequence uses exact strike boundaries...`: `(150,20),(250,40),(350,60)`, HP 880, three Crit calls. [damage tests](../tests/damage/damage-core.test.ts) assert both Physical/Magic dodge 0, crit damage 75, DoT damage 50; [defense tests](../tests/damage/defense-engine.test.ts) check live ratings/levels, strict dodge threshold and no-RNG branches. |
| E5 | [DotConfig](../src/contracts/dot-contracts.ts), [dot-core](../src/effects/dot-core.ts): `applyDotSnapshot`, `tickDotRuntime`, `dotDamage`; E2 on-hit gate | Delivery tests `successful hits create independent stack snapshots...`, `multiple on-hit stacks...`, `invalid/dodged direct hit...`, `Physical contact can apply independently snapshotted Magic DoT...`: snapshots 20/40, sum then FIFO shift, expiry wins at tick, Dodge prevents DoT and Crit, Magic tick 10 using live MR. This is not atomic consumption of N generic status stacks. |
| E6 | [effect contracts](../src/contracts/effects.ts), [effect-system](../src/effects/effect-system.ts), [EffectLifecycle](../src/effects/effect-lifecycle.ts), [effects barrel](../src/effects/index.ts): apply, remove, groups, modifiers, advance, dispose | [system tests](../tests/effects/effect-system.test.ts) reject unsupported fields; [lifecycle tests](../tests/effects/effect-lifecycle.test.ts) assert immutable identities, latest receipt conflict, old receipt inert, exact expiry, source removal retains already applied payload, terminal isolated disposal; [stacking tests](../tests/effects/effect-stacking.test.ts) assert `[2,5]` retained at max, group refresh, policy conflict/no serial mutation; [modifier tests](../tests/effects/effect-modifiers.test.ts) assert source defeat retention and removal of active contributions. Effect expiry refers only to status instances. |
| E7 | [combat-state](../src/combat/combat-state.ts): action admission vs `validateCombatHit`; [combat-entity](../src/combat/combat-entity.ts): `applyEntityDamage`; [projectile](../src/mechanics/projectile.ts), [instant AoE](../src/mechanics/instant-aoe.ts), [sequence](../src/mechanics/aoe-sequence-core.ts) | Delivery tests revalidate faction/generation with zero stale hits/DoT, suppress double HP/defeat, prevent delayed/mid-hit/mid-spread resurrection after cleanup. Random sequence coarse/fine comparison includes events, HP and RNG counts (six position calls). Execution tests pin fractional timestamps and defeat-before-activation. These do not establish general nested trigger ordering. |
| E8 | [stats](../src/stats/stat-calculation.ts), [stats barrel](../src/stats/index.ts), [modifier resolver](../src/modifiers/modifier-core.ts), [modifier schema](../src/contracts/combat-modifiers.ts), [modifier barrel](../src/modifiers/index.ts) | [stats tests](../tests/stats/stat-calculation.test.ts) cover absolute resources, capped initialization, elapsed regen, dead/no regen and invalid inputs; [modifier tests](../tests/modifiers/modifier-core.test.ts) cover active-source dedup, stable resolution/conflicts. `updateCurrentResources` is regen/clamp, not heal or hit-resource semantics; modifier `conditions` must be empty. E1 cooldown inheritance and E6 effect modifiers are supported, not a generic skill-upgrade engine. |
| E9 | [root barrel](../src/index.ts), [package exports](../package.json), [preservation checker](../scripts/check-preservation.mjs), [consumer smoke](../scripts/consumer-smoke.mjs); [headless example](../examples/headless.ts) | [skill-core fixture](../tests/fixtures/skill-core.ts) supplies actual stat/damage/effect adapters; [timeline fixture](../tests/fixtures/skill-timeline.ts) partitions at activation/completion/delivery and forwards defeat cancellation. Coverage/cleanup document external type/ESM/27 compiled legacy gates; those gates were **not rerun** for this docs-only checkpoint. No engine replacement appears in these fixtures. |

### Snapshot and event conclusions

ALREADY_IMPLEMENTED offense boundaries: direct/melee/instant AoE at dispatch;
projectile at launch; timed object at emission; sequence at each strike; DoT at
successful apply. `snapshotActorDamage` itself retains some input references
(`sources`, definition, nested settings); the integration's `snapshot` and DoT
apply clone. It is not a structurally immutable, component-independent S0 API.
It takes a DamageDefinition; `DamageSnapshot` additionally contains rank,
attacker, options and defense config. Reusing the entire A snapshot for B would
incorrectly pin A's damage definition/rank.

`effect-hit` is emitted after HP/damage/defeat events and also on Dodge (breakdown
shows a miss). It is not automatically OnHit or physical OnImpact. There is no
public projectile impact-position/termination event, timed-object-expired event,
or Skill-instance-expired event. `entity-defeated` lacks killer provenance.
`effect-expired` only describes an `EffectLifecycle` status. Existing root
activation dedupe is a per-caster serial frontier, not arbitrary child receipts.

## 3. Contract sketches under the approved direction

All names in sketches are **PROPOSED**, not available imports. Supporting types
are conceptual; this is not a compilable declaration file or exported schema.

```ts
interface CompositionDefinition {
  readonly mode: 'root-offense-v1';
  readonly root: SkillEngineDefinition;
  readonly revision: string;
  readonly children: readonly PinnedChildDefinition[];
  readonly links: readonly BoundedTriggerLink[];
}
interface PinnedChildDefinition {
  readonly definition: SkillEngineDefinition;
  readonly revision: string;
  readonly activationDelayMs: number;
  readonly gameplayLifetimeMs?: number; // required for OnExpire, not instant skills
}
interface RootOffense {
  readonly snapshotId: string;
  readonly rootExecutionId: string;
  readonly capturedAt: number;
  readonly configVersion: string;
  // DeepReadonly means a detached, recursively frozen data tree.
  readonly payload: DeepReadonly<Omit<DamageSnapshot, 'definition' | 'rank'>>;
}
interface SkillInstanceView {
  readonly sessionGeneration: string;
  readonly rootExecutionId: string;
  readonly instanceId: string;
  readonly parentInstanceId: string | null;
  readonly generation: number; // nesting depth, distinct from entity generation
  readonly triggerReceiptId: string | null;
  readonly skillId: string;
  readonly definitionRevision: string;
  readonly rootOffenseId: string;
  readonly target: Readonly<TargetContext>;
  readonly origin: Readonly<MapPoint>;
  readonly activatedAt?: number; // absent while pending/cancelled before activation
  readonly expiresAt?: number; // fixed once the approved lifetime starts
  readonly status: 'pending' | 'active' | 'expired' | 'cancelled';
}
interface TriggerReceipt {
  readonly sessionGeneration: string;
  readonly rootExecutionId: string;
  readonly parentInstanceId: string;
  readonly eventSequence: number;
  readonly linkId: string;
  readonly occurrence: number;
  readonly targetId?: string;
  readonly atMs: number;
}
interface BoundedTriggerLink {
  readonly linkId: string;
  readonly fromSkillId: string;
  readonly toSkillId: string;
  readonly trigger: 'OnImpact' | 'OnExpire'; // first vertical slice only
  readonly maxOccurrences: number;
  readonly contextPolicy: 'event-origin';
}
interface CompositionBudgets {
  readonly maxDepth: number;
  readonly maxChildrenPerRoot: number;
  readonly maxLiveChildren: number;
  readonly maxProjectilesPerBoundary: number;
  readonly maxEventsPerBoundary: number;
  readonly maxReplayStepsPerRoot: number;
  readonly maxBoundaryWork: number;
  readonly maxStackFanout: number;
}
interface SkillCompositionEvent {
  readonly type: 'skill-instance-activated' | 'skill-instance-expired'
    | 'skill-instance-cancelled' | 'skill-trigger-rejected';
  readonly instance: SkillInstanceView;
  readonly eventSequence: number;
  readonly atMs: number;
  readonly receipt?: TriggerReceipt;
  readonly reason?: string;
}
```

Root cast admission remains the existing voluntary action with one cost,
cooldown and action serial. A root composition instance associates with that
cast; action completion is not Skill gameplay expiry. B and C each pin their own
Skill definition/revision and components. An explicit gameplay lifetime is needed
when OnExpire is used; instant skills need no artificial duration. A child
may emit several projectiles/statuses: those deliveries keep their own identities
and refer to the child, rather than impersonating the child itself.

PROPOSED identity: root key includes session generation and existing root action
identity; child ID derives from parent + trusted event sequence + link ID +
occurrence. Entity IDs retain caller-owned generation semantics. Receipts include
target only for per-target events; an AoE impact-once trigger cannot become one
child per victim accidentally. Replay with the same key/content is inert;
conflicting content rejects. Do not fabricate `caster#serial` activations or
zero-cost voluntary casts: E1/E2 would occupy a slot or collide with the frontier.

Session-owned Core bookkeeping holds instances, receipts, root S0 references
and budget counters within the existing delivery ownership boundary. Instance
state holds lifecycle and provenance only. HP/MP, entity truth, clock and RNG
remain supplied by the server. No new ledger, scheduler or application loop.

### Approved root offense choices (D1–D3)

| Decision | USER_APPROVED selection | Tradeoff / alternative considered |
| --- | --- | --- |
| D1 capture S0 | Successful cast start. Prepare/validate offense before commit; bind once to the accepted root execution. Rejected admission leaves no committed snapshot, MP/cooldown or delivery mutation. Zero-percent activation observes the committed S0. | Activation-time capture would include intervening buff changes; it is not selected. Start-time attack speed/CDR and offense have one commitment boundary. |
| D2 payload | Minimal reuse: separate component-independent offense from the existing snapshot/damage pipeline; derive each component through the existing calculator and validators. | A new offensive/damage resolver would duplicate authority and maintenance; it is excluded. Deep immutability is required, a new resolver framework is not. |
| D3 revision pin | Immutable versioned bundle of reachable Skill definitions; share an already validated bundle where possible. | Spawn-time lookup risks hot-reload/replay drift. Detach/validate/freeze authored data once when building a bundle, then retain immutable references; do not deep-clone that bundle per cast, child or strike without need. |

S0 must contain resolved attributes/physical/magic attack, canonical flat and
bonus modifiers, damage settings/options, Crit chance/bonus, attacker offensive
identity/level and config data. Detach mutable input and freeze retained nested data at capture/bundle creation;
`readonly` alone is insufficient. Reuse validated immutable bundle references. The D2 sketch includes `defenseConfig` because the current
calculation snapshot carries it: propose pinning immutable defense **rules/config**
while reading defender **ratings/state** live, preserving the existing separation.
Exact payload fields/public names need checkpoint contract review; D2 does not
authorize broad config freezing or a new configuration ownership system.
Do not freeze target-tag/status eligibility results: retain modifier predicates,
evaluate them against B/C tags/type and current target at contact/tick.

Each child component supplies its own definition/base/scaling/perRank, rank,
damage type/tags and trigger parameters. Assemble a component snapshot from S0
without resolving caster Stats again. Multiple B0/B1 components share S0 but do
not share a computed final amount or A's coefficients. DoT still applies its
existing scope filtering and no-Crit/no-Dodge rules. Do not add a cache for future
use: shared immutable S0/bundle references are sufficient unless measurement
justifies more work. Never cache target damage or RNG outcomes. Retain S0 until all descendant instances, deliveries and pending
receipts end; release on root family quiescence or session disposal.

| Input | Proposed root mode boundary |
| --- | --- |
| Offense/modifiers/Crit/config | One S0 capture at D1; inherited through every launch/emission/strike/DoT apply |
| Component definitions/rank | Per child, immutable under D3; never copied from A's damage result |
| Target HP, armor, MR, dodge, level, tags/statuses, faction, target generation | Live contact/tick validation and shared defense/HP APIs; no target state in S0 |
| RNG | Caller seeded functions at existing eligibility/dodge/crit/position boundaries; no capture-time Crit roll; Dodge suppresses Crit/on-hit; DoT consumes neither |
| Root action speed/CDR/cost | Existing start-time admission/commit; S0 does not overwrite action timing |
| Child timing/positions | Explicit lifetime only where OnExpire needs it; event-origin/delay details belong to child lifecycle/composition checkpoints. Do not add AS scaling or movement tracking in v1.1.1 |
| Restrictions/LOS/ownership | Root uses full action admission; emitted child uses authenticated receipt, live relation/target validation and mechanic-specific geometry/LOS; remaining restriction/origin details need child-checkpoint review under D7 |

## 4. Composition, lifecycle and caller advancement

### Trigger vocabulary and event mapping

| Trigger | Existing basis | Required delta / proposed semantics |
| --- | --- | --- |
| OnImpact (P0) | Shared projectile/contact and AoE dispatch internals; E2/E7 | New provenance-rich contact event with origin, delivery ID and event sequence. Define whether wall/no-target impact counts. Recommend one child per specified impact occurrence, independent of hit/Dodge. Meteor is only a test scenario; no Meteor type. |
| OnExpire (P0) | E6 status `effect-expired`; emitter/sequence removal internally | New Skill gameplay expiry event, separate from action completion, status expiry, projectile termination and cancellation. B must have its own duration; an instantaneous AoE alone does not create a lasting B. |
| OnHit (P1) | `effect-hit` breakdown and existing successful on-hit DoT gate | Require confirmed hit after defense, with explicit per-target/occurrence policy. A Dodge must not trigger it even though `effect-hit` is emitted. |
| OnTimer (P1) | Existing timed object `on_timer` emission | Reuse timer boundary calculation; add child-instance timer provenance only if approved. Existing emitter is not a general timer-to-Skill API. |
| OnKill (P1) | `entity-defeated` after positive→zero HP | New attribution linking one defeating delivery to its Skill/root; do not infer killer from an unqualified entity event. |
| Stack threshold / conditions (P1) | `EffectLifecycle.groups()` views and modifier filters | Atomic consume/admit and approved condition vocabulary needed; queries plus repeated remove are not an atomic trigger. Nonempty modifier conditions are rejected today. |

### Approved lifecycle direction and tradeoffs (D4–D7)

| Decision | USER_APPROVED selection | Tradeoff / alternative considered |
| --- | --- | --- |
| D4 parent cancellation | Detached children: a spawned child has its own lifecycle and is not automatically cancelled when its parent ends. | Cascade cancellation needs extra ownership/teardown semantics and is not the default. Pre-spawn cancellation/receipt details are reviewed at lifecycle/trigger checkpoints. |
| D5 lifetime ownership | Explicit gameplay lifetime when OnExpire is needed; no mandatory duration for instant skills. Deliveries may outlive a Skill instance. | Deriving Skill expiry from the last projectile/DoT would couple trigger timing to delivery fanout. Retain provenance/S0 while surviving deliveries need it. |
| D6 composition shape | Simple bounded DAG; cycles prohibited; prioritize OnImpact and OnExpire. | A generic recursive graph/condition framework is excluded. Add only the link validation and guards needed by approved scenarios. |
| D7 emitted admission/source | Triggered Child Execution, not another voluntary cast; no second MP/cooldown. Inherit S0, reuse live Core target/contact validation. Dead-but-registered source follows existing delivery policy; missing source rejects. | Repeating voluntary admission would introduce an action slot/cost or suppress already emitted delivery after death. No entity proxy, live offense fallback or duplicated validation. |

Source defeat is not source removal: E7 `validateCombatHit` permits a dead source
but requires its registered entity for faction policy. Root offense survival
therefore does not promise damage after registry removal. Recommend server keeps
defeated source generations until deliveries finish; if missing, reject affected
contact/child explicitly. Supporting removed sources would require a separately
reviewed Combat identity/relationship contract, not synthetic CombatEntities.
D7 is approved and must not be reopened by implementation convenience.

PROPOSED lifecycle details for later checkpoint review: before activation,
root cancellation produces no trigger; a terminal expiry receipt can create its
linked child exactly once, but arbitrary late requests cannot. Session disposal
suppresses further spawn and clears retained references. Cancellation/disposal
must not masquerade as natural OnExpire. These details are not v1.1.1 work.

### Reuse and public API delta

PROPOSED: extend Skills' existing delivery path with one internal, typed
activation context shared by voluntary activation and admitted child activation.
`dispatchSkillEffects` keeps its legacy trusted-event validation; do not bypass
its serial frontier. Adapt existing `snapshot`/launch/strike/apply boundaries to
select legacy mechanic capture or S0-backed component assembly. Use the same
`hit`, `calculateDamage`, Combat validation, geometry and EffectLifecycle.

D8 selects a minimal opt-in composition contract integrated into existing Core
execution. A separate session facade/framework is not required or approved.
Choose the smallest typed boundary needed for the current checkpoint, keeping
legacy calls and `SkillEffectRuntime` consumers compatible. If this requires a
large refactor or a new owner/framework, stop and present the tradeoff to the
Developer before implementation.

The sketches above are semantic examples, not approved exported symbol names.
v1.1.1 exposes only reviewed capture/bind/derive types and functions needed for
snapshot inheritance. Child definitions/instances/events, links, queues and
cancellation/query APIs belong to later checkpoints, not a future-proof public
surface in v1.1.1. Use root/domain exports only; keep internal kernels private.
At composition implementation, extend the existing `advanceSkillEffects`,
`nextSkillEffectBoundary` and `clearSkillEffects` ownership path as needed;
trigger receipts stay Core-owned and cannot be arbitrary client activations.

Skills owns child identity, triggers, provenance, root linkage and execution.
Damage owns reusable offense capture/assembly and numeric calculation. Effects
owns generic stack consumption at its dedicated D10 checkpoint; Combat owns shared eligibility and
HP transitions; Mechanics owns delivery geometry only. Existing architecture
edges suffice if Effects emits neutral results and Skills consumes them; Effects
must not import Skills. Contract-only records can live in Contracts after review.

`jx1-manager-editor` owns definitions/link authoring, VFX composition/animation,
overlays, Class/Tree authoring; it does not implement these gameplay gaps.
Server owns authoritative entities, target lists, map, clock, seeded RNG, session
orchestration and forwarding. Core emits gameplay timing/identity events usable
by renderers; no assets, game-specific factions/names or editor runtime in Core.

## 5. Approved execution model (D9) and proposed safety details

Current order inside `advanceSkillEffects`: status advance/expiry → DoT →
projectiles → emitters → AoE sequences; target IDs are sorted. Fixture caller
advances delivery before actions and forwards defeat cancellation. This is
evidence of a particular integration order, not a nested-event total order.

Compare inline recursive trigger dispatch (simple but reentrant, unbounded stack,
mutation-sensitive order) with an internal bounded queue drained at the same
caller boundary (explicit order/cost, additional records). **D9 approves the
bounded deterministic queue inside existing Core execution**; no scheduler,
event engine or game loop is added. Remaining ordering/budget details below are
proposals for v1.1.3, not a reason to build that queue during v1.1.1.
Proposed stable key: timestamp, boundary phase, root admission sequence,
parent event sequence, definition link order, occurrence, target ID. IDs alone
must not make serial 10 sort before serial 2. Each trigger is drained after its
own causal event completes, with generation ordering preventing child processing
before parent. Preserve legacy phase order in legacy mode. **OPEN_DETAIL:** exact
placement of natural Skill expiry and zero-delay child activations is reviewed
with the safety/composition implementation under approved D9.

Proposed sequence at one boundary: due status expiry before reads; ordered
delivery HP write/defeat/restriction handling; contact outcome; bounded trigger
drain; reconcile pending voluntary activation/completion. Natural instance expiry
enqueues one terminal receipt in a defined phase (D9); cancelled instances never
enqueue natural expiry. At 100% root activation precedes action completion.
Same-time stun/defeat must be handled before any affected pending activation.
No external callbacks may reenter mutation while a trigger transaction commits;
buffer notifications and honor disposal before each further spawn/delivery.

| Budget dimension | Cost / validation criteria | Proposed exhaustion behavior (limits require measured Developer approval) |
| --- | --- | --- |
| Nesting depth / cycles | Longest reachable link path, runtime ancestry | Reject cyclic bundle before admission; reject over-depth child with stable receipt outcome |
| Total children per root / live children | Fanout × occurrences, retained instance/S0 memory | Reserve before spawn; reject trigger batch if capacity insufficient |
| Projectiles / events per boundary | Spread × victims × links, including zero-delay fanout | Bound creation and event work; never truncate radial directions silently |
| Replay/event steps and receipt memory | Accepted and rejected trigger attempts over root lifetime | Session-scoped dedupe; root IDs never reused; compact ended roots using trusted monotonic frontier, reject stale requests after compaction |
| Boundary advance work | Due timers/expiry/contacts plus zero-time queue work | Stop root family with explicit budget-aborted outcome rather than infinite zero-time processing; do not silently defer to a later gameplay timestamp |
| DoT/stack fanout | Targets × stack count × damage components × downstream links | Preflight accepted fanout; preserve FIFO/tick behavior, never weaken current validators |

No production magic limits are selected here. Existing max32 effects, modifier
limits and DoT stack/group limits remain, but do not bound a Skill graph.
Expose structured reason, root/instance/link/receipt IDs, boundary and budget
dimension; server forwards diagnostics/telemetry. **OPEN_DETAIL:** reject versus
abort semantics, limit values and count accounting (including duplicates/rejected
attempts) require the dedicated checkpoint plan; D9 fixes the execution model.

PROPOSED atomicity: validate pinned definitions, context and capacity before
reserving receipt and child IDs; commit the complete child batch plus receipt
once, then deliver effects. Failure creates a deterministic rejected receipt,
no child/action/cost mutation. Replays neither charge nor reroll. Successful
child creation does not promise all later AoE contacts succeed; each contact
revalidates independently. Do not roll back already applied damage on a later
delivery failure. If future stack consumption is an admission prerequisite,
consume and child batch creation must commit together within Core (D10).

Exactly-once here is session-local ordered receipt processing, not durable
distributed transactions. Duplicate server/network commands must reach trusted
session sequencing first. Crash replay requires the same definitions, entity
inputs, external mutations, seed and accepted receipt history; no storage layer
is proposed. Coarse/fine equivalence requires callers partition at external
stat/entity changes as well as all exposed Core boundaries; a time jump cannot
reconstruct historical live target state.

## 6. Capability matrix

Status describes current Core, not approved future behavior. D1–D11 are approved;
GAP implementations still require their own checkpoint plan and acceptance. The
last column records approved direction plus remaining contract review, not missing
approval of those decisions. Reuse rows require no new parallel mechanic.

| Capability | Existing API & file/test evidence | Status (SUPPORTED / PARTIAL / GAP / UNVERIFIED) | Required semantic delta | Owning domain | Compatibility risk | Proposed checkpoint | Blocking decision / implementation review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 root snapshot capture/inheritance | E1 no offense in execution snapshot; E4/E5 mechanic captures | GAP | S0 capture/bind/component derive + opt-in delivery integration | Damage / Skills | High: timing/numeric outcomes | 1.1.1 | D1–3/D7–8 approved; concrete contract/plan review |
| P0 independent child identity/lifecycle | E1 actor slot; E2 delivery stores only | GAP | Child instance, optional explicit lifetime, no actor slot | Skills | Terminal semantics | 1.1.2 | D4–5 approved; lifecycle plan |
| P0 provenance | E2 action/effect IDs; E7 unqualified defeat | PARTIAL | Root snapshot provenance first; child/trigger attribution later | Skills / Combat contracts | Event union consumers | 1.1.1 root; 1.1.2–4 child | D3/D7 approved; no child machinery in 1.1.1 |
| P0 trigger dispatch | E2 closed effects/frontier; E3 timed delivery | GAP | OnImpact/OnExpire→child | Skills | Safety/order | 1.1.4 | D6–9 approved; 1.1.2–3 required |
| P0 deterministic ordering | E7 seeded/coarse-fine tests; E9 timeline | PARTIAL | Bounded nested queue/order in existing execution | Skills | RNG/event changes | 1.1.3 | D9 approved; exact phase order OPEN_DETAIL |
| P0 spawn/replay/budget safety | E1 serial; E2 activation dedupe; E6 status frontier | PARTIAL | Child receipts, DAG/depth/fanout/work limits | Skills | Memory/atomicity | 1.1.3 | D6/D9 approved; limits/outcomes OPEN_DETAIL |
| P0 parent cancel/source death/session cleanup | E1 cancel; E2/E7 survive defeat/clear; E6 dispose | PARTIAL | Child/S0 ownership and terminal cleanup | Skills / Combat | Death vs removal | 1.1.1 snapshot; 1.1.2–3 child | D4–5/D7 approved; no child policy implementation in 1.1.1 |
| P0 timed_object→radial projectiles reuse | E3 emitter formula and one-bullet emission test | SUPPORTED | No new mechanic; root mode changes offense source only | Skills / Mechanics | Preserve legacy emission snapshot | 1.1.1 root mode; 1.1.4 composition | D1/D2/D8 approved; radial integration evidence needed |
| P0 projectile reuse | E2/E4/E7 launch/contact tests | SUPPORTED | Root offense now, child provenance later | Skills / Mechanics / Damage | Preserve flight/Dodge/lifetime | 1.1.1; 1.1.4 | D2/D8 approved |
| P0 instant AoE reuse | E2 ground lock and eligible cap | SUPPORTED | Root offense; later child origin contract | Skills / Mechanics | Preserve target filtering | 1.1.1; 1.1.4 | D7 approved |
| P0 AoE sequence reuse | E4 20/40/60 strikes; E7 seeded comparison | SUPPORTED | Root-mode S0, legacy per-strike capture unchanged | Skills / Mechanics | Snapshot timing | 1.1.1 | D1/D2/D8 approved |
| P0 on-hit DoT reuse | E5 snapshots/FIFO/live Magic defense | SUPPORTED | S0-derived component at apply in root mode | Effects / Skills / Damage | FIFO, no Crit/Dodge | 1.1.1 | D2/D8 approved |
| P0 modifiers/status lifecycle reuse | E6/E8 immutable stack/expiry tests | SUPPORTED | None; status expiry is not Skill expiry | Effects / Modifiers | Preserve stacking/expiry | reuse throughout | No new mechanic |
| P1 atomic group stack consume | E6 groups/remove; E5 tick-only FIFO | GAP | Atomic N-stack consumption/admission | Effects / Skills | Group/refresh identity | 1.1.5 | D10 approved; consume semantics OPEN_DETAIL |
| P1 conditional OnHit/Kill/threshold | E2/E5 hit gate; E7 defeat; E8 rejects conditions | PARTIAL | Typed conditions/attribution/occurrence rules | Skills / Effects / Combat | RNG/fanout | 1.1.6 | D10 approved; condition contract review |
| P1 Skill Upgrade/modifiers | E1 definition replacement/cooldown inheritance; E6/E8 modifiers | PARTIAL | Approved upgrade policy using existing pipelines | Skills / Modifiers; content consumer | Rank/revision migration | 1.1.7 | D3/D10 approved; upgrade semantics OPEN_DETAIL |
| P2 explicit Heal | E8 regen/clamp; E2/E6 closed payloads | GAP | Validated explicit heal semantics | Combat / Effects / Skills | Resource/dead-target policy | separate Core phase | D11 approved deferral |
| P2 lifesteal | E4 damage result; E7 HP transition; E2 no sustain | GAP | Applied-damage-linked heal policy | Damage / Combat / Skills | Overkill/defeat/caps | separate Core phase | D11 approved deferral |
| P2 Mana on Hit | E1 MP spend; E8 regen; E2 on-hit DoT only | GAP | Hit-gated MP gain transition | Stats / Combat / Skills | Dodge/overcap/dead source | separate Core phase | D11 approved deferral |
| P2 visualization/debug | E2/E6 limited event provenance | PARTIAL | Gameplay provenance for external overlays | Skills events; UI consumer | Additive event review | 1.1.8 handoff; UI external | No renderer/debug framework in Core |
| P2 Class/Tree authoring | E9 content/editor outside package | UNVERIFIED | External feature inventory not audited | Consumer/editor | Outside repository | deferred | No Core runtime implementation |

### CORE_CAPABILITY_GAP register

Each entry identifies blocked work, inspected APIs, owner, smallest proposal and
approval dependency. No gap authorizes implementation in this checkpoint.

- **G1 — Root offensive inheritance (P0, BLOCKED).** A→B→C cannot keep one S0
  through current E1/E4/E5: execution snapshot has no offense, E2 calls
  `snapshotDamage` at each mechanic boundary, and DamageSnapshot binds component
  definition/rank. Damage/Skills must introduce component-independent detached
  offense and opt-in assembly. D1–3/D7–8 are approved; v1.1.1 must still
  receive its concrete implementation plan/contract review outside this docs PR.
- **G2 — Independent triggered Skill lifecycle/dispatch (P0, BLOCKED).** E1
  execution owns an actor action slot; E2 closed `SkillGameplayEffect`/runtime
  has no child Skill, parent identity or natural Skill expiry; E3 only emits
  projectiles. Skills must add bounded instance/receipt/link semantics around
  existing delivery internals under approved D4–9 at v1.1.2–4. Existing events/frontiers
  cannot supply arbitrary replay or nested work budgets.
- **G3 — Atomic N-stack consumption (P1, BLOCKED).** E6 exposes `groups` and
  per-instance `remove`, not all-or-nothing consume/admit; E5 FIFO shifts one
  stack after scheduled DoT tick. Effects owns a minimal transactional consume
  result integrated by Skills in v1.1.5 under approved D10. Its plan must define group/source partition, selection
  order, insufficient-stack behavior and rollback-before-spawn semantics.
- **G4 — Explicit Heal (P2, BLOCKED/deferred).** E2 gameplay discriminants and
  E6 EffectDefinition accept damage/status/modifiers only; E7 damage requires
  nonnegative damage; E8 `updateCurrentResources` provides elapsed regen/clamp,
  not a heal event, target policy or revive semantics. Combat/Effects/Skills
  need a separately reviewed explicit resource-effect contract in a later Core
  phase; D11 approves deferral, not implementation. Do not
  emulate healing with negative damage, fake regen intervals or direct HP writes.
- **G5 — Lifesteal (P2, BLOCKED/deferred).** E4 returns damage and E7 applies it,
  but E2 dispatch has no post-applied-damage sustain policy and E6 modifiers
  cannot express hit-resource transfers. Minimal Core proposal links eligible
  applied damage to a validated heal transition; Damage/Combat/Skills ownership,
  later-phase choices include overkill, DoT, dead source and caps (D11 deferral). A consumer event
  listener writing HP is a substitute mechanic, not support.
- **G6 — Mana on Hit (P2, BLOCKED/deferred).** E1 only commits MP cost; E8 regen
  has no successful-hit gate; E2 `onHit` accepts DoT declarations only. A typed
  Core on-hit resource gain would reuse live MP/maxMana validation in Stats/
  Combat/Skills in the separate D11-deferred phase, after its own plan defines
  amount, caps, source liveness and eligibility.
  Do not simulate it by refunding cost or adapting manaRegen.

P1 generic conditions/upgrade behavior is PARTIAL, not claimed fully supported:
existing filters and replacements work only within E1/E6/E8 contracts. A future
specific unsupported condition must receive its own gap analysis before code.

## 7. Compatibility under approved minimal opt-in (D8)

Compare adding optional composition fields to the closed legacy definitions
(small surface but changes accepted schema/unions and risks silent mode changes)
with a separate versioned opt-in CompositionDefinition wrapping unchanged
SkillEngineDefinition records. These are implementation shapes to review, not a
mandated wrapper/facade framework: D8 requires the smallest explicit opt-in that
preserves current callers and schemas. No composition means exact
v1.0 mechanic-owned snapshots and costs. Reject unknown mode/version; never
infer root mode from tags, child IDs or a consumer callback.

| Protected surface | Future plan requiring review |
| --- | --- |
| SkillEngineDefinition / SkillGameplayEffect | Preserve closed legacy schemas/discriminants; reviewed opt-in carries links/optional lifetimes and references validated definitions; no `spawn_skill` in legacy union without separate approval |
| SkillExecutionSnapshot / activation event | Preserve existing action metadata and zero/100% behavior; root association is opt-in, not proof old casts captured offense |
| SkillEffectRuntime / environment | Public container shape is inherited, including visible stores with internal types; additive fields can break literal construction. Use the smallest compatible association/opt-in; no extra facade is required. Review object literals/callbacks and cancellation before changing the runtime shape |
| DamageSnapshot | Preserve legacy definition/rank/attacker/config/options; add separate reusable payload, not reinterpret existing fields or change `snapshotActorDamage` return semantics |
| EffectDefinition / lifecycle | Preserve stack/refresh/expiry/restrictions; no child masquerading as a status and no generic consume via repeated remove |
| Public exports / declarations | Add only reviewed root/domain APIs, strict installed TS without Node ambient types, ESM and blocked deep-import tests; widening event unions requires exhaustive-switch consumer review |
| Legacy behavior | Preserve costs/cooldowns/serials/action slots, activation/cancellation, per-mechanic snapshot times, source-defeat survival vs removal, live defense/target filters, RNG order, DoT FIFO and modifier stacking |
| Historical preservation | Keep `src/shared/**` and generated `dist/src/shared/**` exact forwarders, namespace identity, manifest/VERSION and unchanged declarations; narrowly review affected fingerprints only after targeted changed-contract evidence |

Legacy examples/hash and existing declarations are not regenerated to approve a
feature. After approval, list changed declarations (likely snapshot assembly,
dispatch/advance/boundary/cleanup and new composition contracts), expected root
mode observations and tests in the implementation PR. Preserve untouched
fingerprints and shim gates. If legacy results change, treat that as an explicit
breaking proposal requiring a new decision, not a baseline refresh.

Migration: keep existing skill definitions unchanged; author an opt-in pinned
bundle using existing effects; validate reachable links/durations/budgets;
compare legacy and root mode on identical caller inputs. Do not convert every
timed emitter into a child: it already solves timed radial delivery. Upgrade
editor/server together only in a later reviewed cross-repo change: installed
package compile, replay fixtures, event consumption, explicit pin update and
rollback to old pin/content. This phase does not inspect or modify that consumer.

## 8. Developer-approved decisions and checkpoint boundaries

Decision authority: the Developer's explicit “RPG Core v1.1 — Developer
Architecture Decisions (Solo Dev)” instruction, 2026-10-16, recorded here in
PR #3. All D1–D11 are **USER_APPROVED**. This does not claim that the PR has been
approved/merged, that exact sketch symbols were accepted, or that implementation
has started. Priority: **Minimal Implementation → Reuse Existing Core →
Deterministic → Backward Compatible**. No abstraction solely for future-proofing.

| Decision | Approved direction |
| --- | --- |
| D1 | Capture Root Offensive Snapshot once at successful cast start. |
| D2 | Minimal component-independent offense extraction from the current pipeline; no new offensive/damage resolver. |
| D3 | Pin reachable definitions in an immutable versioned bundle; share validated bundles and avoid repeated unnecessary deep clones. |
| D4 | Detached children with independent lifecycle; parent ending does not automatically cancel spawned children. |
| D5 | Explicit gameplay lifetime when OnExpire needs it; instant skills need no artificial duration; deliveries may outlive instances. |
| D6 | Simple bounded DAG, no cycles; OnImpact and OnExpire first. |
| D7 | Triggered child execution, no new voluntary cast or second MP/cooldown; same S0, existing live target/contact validation; dead registered source follows delivery policy, missing source rejects. |
| D8 | Minimal opt-in composition contract preserving v1.0; no unnecessary framework/facade. |
| D9 | Bounded deterministic queue inside existing Core execution; no second scheduler/event engine/game loop. |
| D10 | Stack Consumption, Conditional Triggers and Skill Upgrade stay in v1.1, each at its own checkpoint. |
| D11 | Heal, Lifesteal and Mana on Hit are deferred to a separate Core phase. |

### Roadmap alignment

The earlier agent-proposed split (snapshot assembly in 1.1.2, lifecycle in 1.1.3,
combined P1/deferred upgrades) is superseded by the Developer's checkpoint scope
in the supplied v1.1.1 task and this decision record. The table below reflects
that scope; it does not authorize further renumbering, scope expansion or an
automatic next checkpoint. If work needs a large refactor or another checkpoint's
mechanic, report the tradeoff and wait for Developer approval.

| Checkpoint | Scope / acceptance boundary | Dependencies / principal risk |
| --- | --- | --- |
| v1.1.0 | Foundation audit, architecture decisions and checkpoint acceptance documentation; this PR only | No runtime or exports changed; no auto-merge |
| v1.1.1 | **Root Snapshot Inheritance:** successful-start capture/bind/derive, minimal opt-in integration through current delivery paths; section 9 acceptance | D1–3/D7–8; immutable provenance, live defense, legacy compatibility; no child runtime |
| v1.1.2 | Child Skill Instance/lifecycle, identity, lifetime and detached ownership | D3–5/D7; no extra actor action slots; retain S0 for surviving deliveries |
| v1.1.3 | Trigger safety: bounded deterministic queue, receipts/replay, DAG/cycle/fanout/work guards | D6/D9; exact order/limits/outcomes reviewed here; required before runnable composition acceptance |
| v1.1.4 | Child dispatch/composition: OnImpact→B, OnExpire→C using existing AoE/radial delivery | 1.1.1–3; A→B→C runtime proof, no duplicate mechanics |
| v1.1.5 | Stack Consumption, dedicated checkpoint | D10; atomic N-stack semantics and spawn admission; preserve DoT FIFO |
| v1.1.6 | Conditional Triggers, dedicated checkpoint | D10; typed conditions/attribution and deterministic occurrence rules |
| v1.1.7 | Skill Upgrade, dedicated checkpoint | D3/D10; pinned revisions, rank/modifier/cooldown migration without duplicate engines |
| v1.1.8 | Integration/compatibility evidence and documentation/consumer handoff across approved v1.1 capabilities | Regression/consumer checks also run at each earlier code checkpoint; no automatic release/editor pin update |

Exact later-checkpoint acceptance is reviewed in its own task. This table does
not move mandatory verification out of v1.1.1 or introduce new mechanics in it.

## 9. v1.1.1 — Root Snapshot Inheritance: scope and acceptance

**Future code checkpoint; NOT IMPLEMENTED / NOT EXECUTED in PR #3.**
D1–D11 direction is approved. Exact public symbols/type signatures and the minimal
changed-file/preservation plan are reviewed before implementation; the sketches
in section 3 do not preapprove a framework or an entire child API. The latest
Developer instruction authorizes this documentation update only.

### Included scope

1. Extract component-independent offensive inputs using the existing Damage,
   Modifier and Stat pipeline; no formula, balance or resolver replacement.
2. Capture S0 once at successful cast start, bind it to trusted root execution
   identity, capture timestamp and configVersion, and keep it detached/deep
   immutable. Rejected casts commit no root snapshot; replay cannot recapture.
3. Reuse that S0 to derive valid DamageSnapshots for at least two independent
   components with their own definitions, coefficients, rank, type and tags.
   Share validated immutable bundle references where needed; do not build DAG
   traversal/child machinery merely to demonstrate two components.
4. Add the minimal opt-in path through existing direct, melee, projectile,
   instant AoE, timed AoE sequence, timed object and on-hit DoT delivery. Root
   mode changes the offense source, not geometry, hit validation, defense or RNG.
5. Validate provenance, identity/version/session isolation, finite payload and
   existing modifier budgets; reject missing/forged/rebound/mismatched S0 with
   stable diagnostics and no live-offense fallback or partial mutation.
6. Keep target HP/defense/status/faction/eligibility live and use existing source
   defeat/removal and session cleanup behavior for already emitted deliveries.
7. Add only necessary public root/domain exports, installed consumer evidence,
   focused tests and checkpoint notes, including the future
   `docs/RPG_CORE_V1.1.1_ROOT_SNAPSHOT.md`. Keep legacy declarations/forwarders and
   provenance intact; review narrowly changed fingerprints with targeted evidence.

Excluded: ChildSkillInstance/lifecycle (1.1.2), trigger queue/safety (1.1.3),
Skill→Skill dispatch/graph execution (1.1.4), stack consumption (1.1.5),
conditional triggers (1.1.6), Skill Upgrade (1.1.7), and D11-deferred sustain.
No new child action slots/cost policies, scheduler, event engine, UI/editor, assets,
persistence, package bump/release or editor dependency update.

### Acceptance S1–S12 — expected observations, not test results

Use actual Core APIs and existing fixtures with deterministic caller adapters.
Child-like B/C mean independent Damage Components, not fake child execution.

| ID | Scenario | Required observation |
| --- | --- | --- |
| S1 | Successful-start capture / rejection / replay | Exactly one committed S0 per accepted root at start, including activation 0/100; failed admission has no committed root state or resource/delivery mutation; retry/dispatch does not recapture or double-charge. |
| S2 | Gear, buff and offensive Stats change after S0 | Derived components and later root-mode emissions/strikes/applications retain S0; offensive adapter is not called again at those boundaries. |
| S3 | B-like AoE and C-like radial components | Same root offensive provenance/values, different pinned definitions/scaling/ranks/type/tags and corresponding real-Core B0/B1 results; never pass A's finalDamage or lock B/C to A's coefficients. Label evidence `SNAPSHOT_INHERITANCE_VERIFIED_ONLY`. |
| S4 | Input/alias mutation | Mutating original input, reused adapter objects, clones or public snapshot views cannot change retained S0 or derived results; no mutable alias into shared validated definitions. |
| S5 | Target changes after capture | Live HP, armor/MR, Dodge, status/tag filters, faction and generation/eligibility affect the real contact/tick; no target outcome is frozen in S0. |
| S6 | All existing delivery modes under opt-in | Direct/melee/projectile/instant AoE/sequence/timed emitter/on-hit DoT all derive from S0; canonical collision/lifetime/FIFO/expiry remain intact; radial uses existing emitter/projectile implementation. |
| S7 | Source defeated after valid emission | Already emitted/scheduled delivery retains S0 under current policy; registered dead source and missing source are distinguished; missing source rejects and session disposal prevents later work. No new-child lifecycle claim. |
| S8 | Invalid identity/provenance/payload | Forged/rebound handle, wrong root/config/session, missing or invalid/nonfinite/over-budget payload fails closed with stable diagnostics; no live fallback, extra RNG, HP/MP/cooldown or partial delivery. |
| S9 | Sessions / roots | Two concurrent sessions and roots with different stats/versions remain isolated; same-root component derivation deterministic; no global snapshot cache. |
| S10 | Legacy opt-out | Existing per-mechanic timing/events/cost/cooldown/activation/cancel remain unchanged, especially emitter emission-time and sequence per-strike snapshots; existing headless hash preserved. |
| S11 | Coarse/fine advancement | Same seed and same externally partitioned inputs give identical root-mode event order, RNG calls and HP/damage through current Core advancement. No separate clock/loop. |
| S12 | Installed package | Public capture→bind/derive path compiles/runs using root/domain exports without Node ambient types; ESM, blocked deep imports and archived legacy forwarders preserved. |

Definition of Done: all S1–S12 have concrete test evidence (combine overlapping
invariants rather than duplicate suites); targeted changed-area tests and one
final full `npm run verify` PASS; `git diff --check` clean; API/compatibility and
narrow preservation changes reviewed. Report exact changed files, public API,
base/commit/PR, D1–D3/D7–D8 decision references and remaining limits. Stop at
v1.1.1; do not claim `NESTED_SKILL_EXECUTION_VERIFIED`, start 1.1.2, merge or release.
If acceptance requires a large refactor or out-of-scope mechanic, report the
tradeoff and wait; never weaken tests/validation or substitute an engine.

### Later-checkpoint evidence, kept separate

| Scenario | Owning checkpoint / expected observation |
| --- | --- |
| Real A→B→C | 1.1.2–4: independent instances/definitions and provenance; OnImpact activates B, explicit B expiry activates C; same S0 and no second cost/action slot. |
| Detached ownership and lifetime | 1.1.2/4: parent end does not cancel spawned children; instant skills need no artificial duration; deliveries can outlive instances; cleanup still terminal. |
| Receipt replay / DAG / budgets | 1.1.3–4: duplicate inert, conflict rejects, cycles rejected, bounded deterministic queue/work/fanout, no partial child spawn; explicit approved failure outcomes. |
| Same-time trigger ordering | 1.1.3–4: expiry/impact/defeat/stun/zero-delay child cases have deterministic events/RNG/HP; preserve legacy order. |
| Stack consume / conditions / upgrades | 1.1.5 / 1.1.6 / 1.1.7 respectively: each has its own approved contract and real-Core acceptance, without duplicating engines or changing DoT FIFO implicitly. |
| Cross-capability / consumer handoff | 1.1.8: verify combined v1.1 behavior and compatibility; earlier checkpoints still run their own mandatory full verification. |

## 10. Validation, limitations and handoff

Original v1.1.0 audit commands/results (retained evidence, not rerun for the
Developer-decision documentation update):

| Command / check | Result |
| --- | --- |
| `git status --short`, branch/remotes/HEAD inspection; `git fetch origin`; `git branch -a`; `gh pr list --state open --json number,title,headRefName,baseRefName,url`; main log | Clean initial worktree; remote main SHA and no open PRs as section 1; no work overwritten/stashed/reset |
| `git switch -c docs/v1.1.0-composable-skill-foundation origin/main` | Branch created at exact baseline |
| `node --version` | `v24.18.0` |
| `npm test -- tests/skills tests/effects tests/damage tests/integration/skill-effect-integration.test.ts tests/stats tests/modifiers` | **119 tests passed, 11 files**; existing behavior only |
| `npm run check:architecture` | PASS, 41 modules, no runtime cycles; three existing contract-only type cycles reported |
| `git diff --check` and local Markdown file-link / evidence-reference check | PASS; scope restricted to this new proposal |

Current Developer-decision documentation update validation (2026-10-16):

| Command / check | Result |
| --- | --- |
| `npm run verify` | PASS: build, Core/test types, architecture (41 modules, no runtime cycles; three existing type-only cycles), preservation (27 modules, declarations unchanged), 162 tests / 18 files, deterministic example and installed external consumer |
| Example / consumer | PASS: target HP 70; consumer types, native ESM/public domains, 27 legacy paths and blocked deep imports |
| `git diff --check`; Markdown / decision / scope check | PASS: 52 local file links resolve, balanced fences, D1–D11 / S1–S12 / v1.1.0–v1.1.8 present; only this document changed |

The full verification checks existing Core behavior, not implementation of the
future acceptance matrix. Historical coverage reports are not fresh execution
results. No new nested-skill tests or mechanics exist here.
Multi-bullet radial integration, external consumer state, production budget sizing,
crash recovery and remaining OPEN_DETAIL policies remain outside verified runtime
evidence. D1–D11 architecture direction is now approved; no runtime is added.

Changed file: `docs/RPG_CORE_V1.1_FOUNDATION.md`, to supply the source-backed
capability matrix, type sketches, compatibility options, decisions and future
acceptance handoff. Public API/behavior/legacy compatibility impact: **none**.
Documentation checkpoint: **READY for Developer review**. D1–D11 are recorded
as approved; G1–G6 still describe unimplemented capabilities. Implementation
requires the separate checkpoint plan/contract review, and G4–G6 remain deferred
by D11. P0 reuse is supported; child composition and
root inheritance are not implemented. **STOP: no runtime implementation in this
PR, automatic start of v1.1.1, merge, package publication, release or editor
dependency update.**
