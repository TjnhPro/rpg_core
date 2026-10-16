# RPG Core v1.1.0 — Foundation & Architecture

**DRAFT / NON-NORMATIVE — AUDIT + ARCHITECTURE PROPOSAL ONLY.**
Prepared 2026-10-16. Developer approval is required before implementation.
`READY` for this checkpoint means a reviewable proposal, never working nested skills.
The current [architecture](ARCHITECTURE.md) remains authoritative.

## 1. Baseline, scope and approval boundary

| Item | Observed evidence |
| --- | --- |
| Repository | `https://github.com/TjnhPro/rpg_core` (`origin`, fetch/push) |
| Initial checkout | `maintenance/phase2-agent-readiness@6a349de24d4a17db461512df0870cc05f959c2b7`; clean working tree |
| Refreshed main / audit baseline | `origin/main@bc701cd42183072aa1fe6664ffa8ba5756a62167`, merge of PR #2; tree identical to initial checkout (`git diff 6a349de origin/main --stat` empty) |
| Proposal branch | `docs/v1.1.0-composable-skill-foundation`, created directly from refreshed `origin/main` |
| Related work | `gh pr list --state open`: `[]`; fetched branch inventory contains main and the existing maintenance/refactor branches, no existing v1.1 branch |
| Versions | [package.json](../package.json): `1.0.0`, private; [VERSION](../VERSION): `v1.0-snapshot-20261013-b`; v1.1.x below are roadmap checkpoint labels |
| Provenance | [EXPORT-MANIFEST.json](../EXPORT-MANIFEST.json) retains source revision `3fa1a79f56ff6b8b896497ada42eee28c50fb35d` and `CANDIDATE_PENDING_INDEPENDENT_VALIDATION`; preservation separately pins `c5878d92e198acd19289f568a2ddeda5096d83e7` |
| Consumer | Task reports `TjnhPro/jx1-manager-editor` pinned to `bc701cd...`; consumer checkout/pin was not independently audited here and is not changed |
| Environment | Node `v24.18.0` (satisfies >=22.13.0); existing local dependencies used; no install or dependency change |

Read [AGENTS.md](../AGENTS.md), [README](../README.md), current architecture,
[coverage](test-coverage.md), relevant [cleanup audit](cleanup-audit.md), public
barrels, package exports, historical manifest/version and preservation checker.
Only this proposal is added. No source, tests, exports, baseline, package version,
editor pin, license, release or mechanics change is authorized in v1.1.0.

Labels used throughout:

- **USER_APPROVED:** descendants inherit one immutable root offensive snapshot S0;
  automatic children do not incur another MP/cooldown charge by default.
- **ALREADY_IMPLEMENTED:** source and existing tests support the named scope.
- **PROPOSED:** a recommendation, with no authority to implement it.
- **OPEN_DECISION:** Developer must choose before dependent implementation.
- **CORE_CAPABILITY_GAP:** inspected APIs cannot implement the specified mechanic;
  dependent implementation remains **BLOCKED**. The audit itself can be complete.

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

## 3. Proposed contracts and ownership

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
  readonly gameplayLifetimeMs: number;
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
Skill definition/revision, components and explicit gameplay lifetime. A child
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

### Root offense alternatives (OPEN_DECISION D1–D3)

| Decision | Option A | Option B | Recommendation and compatibility |
| --- | --- | --- | --- |
| D1 capture S0 | Successful action start: prepare/validate payload before commit, publish only with successful admission; start-time buffs apply | Activation: expired/intervening buffs alter S0; cancelled casts never need S0; capture must complete before zero-percent activation dispatch | Recommend start for explicit cast commitment, but **Developer must choose**. Attack speed/CDR already pin at start in both options, so activation capture separates offense timing from action timing. 0% is after commit; 100% activation is before completion; expiry-before-read remains required. No implementation choice implied. |
| D2 payload | Minimal reusable offense from existing DamageSnapshot excluding definition/rank; attach each B/C component at calculation time | New root source-context with raw resolved attributes + canonical modifier/config data, then a shared component assembler | Recommend A initially: reuse B0/B1 without numeric duplication. B gives cleaner ownership but risks resampling/normalizing differently and wider API design. Neither payload may include defender, RNG output, final damage or live entities. |
| D3 revision pin | Pin the entire reachable bounded definition bundle/config at root acceptance | Resolve/pin each child at spawn against an explicit revision registry | Recommend bundle pin for deterministic replay and no hot-reload mutation; costs upfront validation/memory. Spawn pin reduces retained data but requires historical registry availability and receipts recording exact revision. Changing definitions never mutates admitted instances. |

S0 must contain resolved attributes/physical/magic attack, canonical flat and
bonus modifiers, damage settings/options, Crit chance/bonus, attacker offensive
identity/level and config data. Deep clone/freeze all nested trees; `readonly`
alone is insufficient. The D2 sketch includes `defenseConfig` because the current
calculation snapshot carries it: propose pinning immutable defense **rules/config**
while reading defender **ratings/state** live; D7 must approve this separation.
Do not freeze target-tag/status eligibility results: retain modifier predicates,
evaluate them against B/C tags/type and current target at contact/tick.

Each child component supplies its own definition/base/scaling/perRank, rank,
damage type/tags and trigger parameters. Assemble a component snapshot from S0
without resolving caster Stats again. Multiple B0/B1 components share S0 but do
not share a computed final amount or A's coefficients. DoT still applies its
existing scope filtering and no-Crit/no-Dodge rules. Memoization, if any, keys by
S0 identity + pinned component revision/rank/type/tags; never cache target damage
or RNG outcomes. Retain S0 until all descendant instances, deliveries and pending
receipts end; release on root family quiescence or session disposal.

| Input | Proposed root mode boundary |
| --- | --- |
| Offense/modifiers/Crit/config | One S0 capture at D1; inherited through every launch/emission/strike/DoT apply |
| Component definitions/rank | Per child, immutable under D3; never copied from A's damage result |
| Target HP, armor, MR, dodge, level, tags/statuses, faction, target generation | Live contact/tick validation and shared defense/HP APIs; no target state in S0 |
| RNG | Caller seeded functions at existing eligibility/dodge/crit/position boundaries; no capture-time Crit roll; Dodge suppresses Crit/on-hit; DoT consumes neither |
| Root action speed/CDR/cost | Existing start-time admission/commit; S0 does not overwrite action timing |
| Child timing/positions | Pinned explicit child gameplay duration/delay and event origin; no implicit second AS scaling or movement tracking; D7 approves rules |
| Restrictions/LOS/ownership | Root uses full action admission; emitted child uses authenticated receipt, live relation/target validation and mechanic-specific geometry/LOS; D7 decides child restriction policy |

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

### Lifecycle alternatives (OPEN_DECISION D4–D7)

| Topic | Option A | Option B | PROPOSED recommendation |
| --- | --- | --- | --- |
| D4 parent cancellation | Cancel untriggered links; spawned children/deliveries detached | Cascade cancellation to active descendants and pending deliveries | A matches emitted projectile/status survival; requires bounded reference retention. B offers explicit channel-like behavior but needs new selective teardown semantics. Never silently apply B to legacy deliveries. |
| D5 lifetime ownership | Explicit definition gameplay lifetime, independent of action completion/delivery lifetime | Derive expiry from last owned delivery ending | A makes B→C deterministic even for no targets and different projectile lifetimes; adds definition validation. B is convenient but empty/piercing/DoT cases change expiry. Developer must decide whether deliveries may outlive instance expiry; recommend yes, retaining provenance/S0 until they end. |
| D6 composition shape | Typed, bounded links with validated finite acyclic reachable bundle | Generic recursive graph/conditions and dynamic Skill references | A is the minimal A→B→C proof and simpler cost model. Reject A→B→A statically plus runtime depth/count guards. B is deferred until concrete use cases justify cycles/conditions. |
| D7 emitted admission/source | Separate emitted-child admission using shared eligibility/geometry, allowing dead-but-registered source | Require voluntary-like liveness/restrictions for every child | A honors surviving offense without a second cast/slot/cost, but must specify stun/silence, origin/LOS and target policy. B suppresses chains after death and is a gameplay decision. Recommend A with fail-closed missing source/target and explicit event-origin geometry; no invented entity proxy. |

Source defeat is not source removal: E7 `validateCombatHit` permits a dead source
but requires its registered entity for faction policy. Root offense survival
therefore does not promise damage after registry removal. Recommend server keeps
defeated source generations until deliveries finish; if missing, reject affected
contact/child explicitly. Supporting removed sources would require a separately
reviewed Combat identity/relationship contract, not synthetic CombatEntities.
The voluntary-like liveness alternative in D7 would suppress descendants after
source death and conflicts with the USER_APPROVED surviving-root use case; it
cannot be selected without the Developer explicitly revising that requirement.
D7 should settle the remaining emitted-safety checks, not silently reopen S0
inheritance or substitute a new live offensive snapshot.

Under recommended D4/D5/D7 (still OPEN): before activation, root cancellation
produces no trigger; after emission it does not delete detached children. Expired
parent may create children only from its already accepted terminal event receipt,
never arbitrary late external requests. Missing entity target rejects without
retargeting; pinned ground origin can still produce spatial deliveries with live
candidate validation. Session disposal cancels all pending instances/links, clears
deliveries/receipts/S0 and suppresses subsequent spawn even during callbacks.
Cancellation and disposal must not be interpreted as natural OnExpire.

### Reuse and public API delta

PROPOSED: extend Skills' existing delivery path with one internal, typed
activation context shared by voluntary activation and admitted child activation.
`dispatchSkillEffects` keeps its legacy trusted-event validation; do not bypass
its serial frontier. Adapt existing `snapshot`/launch/strike/apply boundaries to
select legacy mechanic capture or S0-backed component assembly. Use the same
`hit`, `calculateDamage`, Combat validation, geometry and EffectLifecycle.

Alternative: a separate composition session facade delegates all delivery to the
same canonical internals. This isolates public shapes but creates two lifecycle
owners if poorly designed. Recommend a thin facade associated with exactly one
existing `SkillEffectRuntime`, not another runtime loop/store of bullets.
D8 must settle association/private state versus a versioned runtime shape.

Potential public additions, **names not final**: `defineSkillComposition`,
`startSkillComposition` (root admission through existing `executeSkill` semantics),
read-only `SkillInstanceView`, `SkillCompositionEvent`, typed policies/budgets,
instance cancellation/query. Trigger receipts are minted/consumed inside Core;
network callers cannot submit an arbitrary `SkillActivatedEvent` to spawn a child.
Creation binds the composition to the existing runtime; `advanceSkillEffects`,
`nextSkillEffectBoundary`, `clearSkillEffects` must include its due work/cleanup.
No second scheduler or polling clock. APIs are exported only through root/skills
(and owning domain contracts as reviewed); internal kernels remain private.

Skills owns child identity, triggers, provenance, root linkage and execution.
Damage owns reusable offense capture/assembly and numeric calculation. Effects
owns generic stack consumption if approved; Combat owns shared eligibility and
HP transitions; Mechanics owns delivery geometry only. Existing architecture
edges suffice if Effects emits neutral results and Skills consumes them; Effects
must not import Skills. Contract-only records can live in Contracts after review.

`jx1-manager-editor` owns definitions/link authoring, VFX composition/animation,
overlays, Class/Tree authoring; it does not implement these gameplay gaps.
Server owns authoritative entities, target lists, map, clock, seeded RNG, session
orchestration and forwarding. Core emits gameplay timing/identity events usable
by renderers; no assets, game-specific factions/names or editor runtime in Core.

## 5. Determinism, budgets and atomicity (OPEN_DECISION D9)

Current order inside `advanceSkillEffects`: status advance/expiry → DoT →
projectiles → emitters → AoE sequences; target IDs are sorted. Fixture caller
advances delivery before actions and forwards defeat cancellation. This is
evidence of a particular integration order, not a nested-event total order.

Compare inline recursive trigger dispatch (simple but reentrant, unbounded stack,
mutation-sensitive order) with an internal bounded queue drained at the same
caller boundary (explicit order/cost, additional records). Recommend queue.
Proposed stable key: timestamp, boundary phase, root admission sequence,
parent event sequence, definition link order, occurrence, target ID. IDs alone
must not make serial 10 sort before serial 2. Each trigger is drained after its
own causal event completes, with generation ordering preventing child processing
before parent. Preserve legacy phase order in legacy mode; D9 must approve exact
placement of natural Skill expiry and zero-delay child activations in root mode.

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
dimension; server forwards diagnostics/telemetry. D9 approves reject versus
abort semantics and count accounting, including duplicate/rejected attempts.

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

Status describes current Core, not the proposal. All GAP implementations remain
BLOCKED on the named decisions; reuse rows require no new parallel mechanic.

| Capability | Existing API & file/test evidence | Status (SUPPORTED / PARTIAL / GAP / UNVERIFIED) | Required semantic delta | Owning domain | Compatibility risk | Proposed checkpoint | Blocking decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 root snapshot capture/inheritance | E1 snapshot has no offense; E4/E5 mechanic captures | GAP | S0 capture + component assembly + inheritance | Damage / Skills | High: timing/numeric outcomes | 1.1.1–2 | D1–3, D7–8 |
| P0 independent child identity/lifecycle | E1 one actor slot; E2 delivery stores only | GAP | Child instance and explicit lifetime, no actor slot | Skills | High: terminal semantics | 1.1.3 | D4–6, D8 |
| P0 provenance | E2 action/effect IDs; E7 defeat lacks killer | PARTIAL | Root/parent/child/receipt/event attribution | Skills / Combat contracts | Event union consumers | 1.1.3–4 | D6, D8–9 |
| P0 trigger dispatch | E2 closed effects, activation frontier; E3 timer delivery only | GAP | Authenticated OnImpact/OnExpire→child | Skills | High: safety and order | 1.1.4 | D4–9 |
| P0 deterministic ordering | E7 seeded/coarse-fine tests, E9 timeline | PARTIAL | Total nested boundary order and causal queue | Skills | High: RNG/event changes | 1.1.5 | D9 |
| P0 spawn/replay/budget safety | E1 serial, E2 activation dedupe, E6 status frontier | PARTIAL | Child receipts, depth/fanout/work limits | Skills | Memory/atomicity | 1.1.5 | D6, D9 |
| P0 parent cancel/source death/session cleanup | E1 cancel, E2/E7 survive defeat/clear, E6 disposal | PARTIAL | Detached/cascade child policy, instance/S0 cleanup | Skills / Combat | High: death/removal distinction | 1.1.3–5 | D4–5, D7 |
| P0 timed_object→radial projectiles reuse | E3 TimedObjectConfig/emitter; single-bullet emission test | SUPPORTED | None for existing delivery; multi-direction integration coverage future | Skills / Mechanics | Preserve emission snapshots | reuse in 1.1.4/7 | No delivery gap; D1 for root mode |
| P0 projectile reuse | E2/E4/E7 launch/contact tests | SUPPORTED | Carry child provenance/S0 in opt-in mode | Skills / Mechanics / Damage | Preserve flight, Dodge, lifetime | 1.1.2/4/7 | D8 |
| P0 instant AoE reuse | E2 ground lock and eligible cap assertions | SUPPORTED | Child origin contract only | Skills / Mechanics | Preserve target filtering | 1.1.4/7 | D7 |
| P0 AoE sequence reuse | E4 exact per-strike values; E7 seeded comparison | SUPPORTED | Root-mode S0 source only | Skills / Mechanics | Legacy remains per-strike | 1.1.2/7 | D1, D8 |
| P0 on-hit DoT reuse | E5 independent snapshots/FIFO/Magic defense | SUPPORTED | Root-mode assembly uses S0 | Effects / Skills / Damage | Preserve FIFO, no Crit/Dodge | 1.1.2/7 | D8 |
| P0 modifiers/status lifecycle reuse | E6/E8 immutability/stack/expiry/source tests | SUPPORTED | None; distinguish status expiry from Skill expiry | Effects / Modifiers | Preserve stacking/expiry | reuse throughout | None |
| P1 atomic group stack consume | E6 groups/remove; E5 consume_on_tick only | GAP | Consume N + child admission transaction | Effects / Skills | Group identity/refresh semantics | 1.1.6 candidate | D10 |
| P1 conditional OnHit/Kill/threshold | E2/E5 hit gate; E7 defeat; E8 conditions rejected | PARTIAL | Typed conditions, kill attribution, receipt frequency | Skills / Effects / Combat | Event/RNG/cost fanout | 1.1.6 candidate | D6, D9–10 |
| P1 upgrades/modifiers | E1 immutable new definitions/cooldown inheritance; E6/E8 modifier pipeline | PARTIAL | Generic upgrade policy not defined; authoring can produce valid replacement definitions today | Skills / Modifiers; content consumer | Rank/revision/live-action migration | deferred after 1.1.8 unless specified | D3, D10 scope |
| P2 explicit Heal | E8 regen/clamp; E2/E6 closed payloads | GAP | Explicit validated heal transition/effect semantics | Combat / Effects / Skills | Resource/dead-target policy | deferred | D11 separate upgrade |
| P2 lifesteal | E4 damage result/E7 HP transition; E2 no sustain payload | GAP | Authoritative damage-linked heal policy | Damage / Combat / Skills | Applied vs requested damage, defeat | deferred | D11 separate upgrade |
| P2 Mana on Hit | E1 MP spend/E8 regen; E2 only on-hit DoT | GAP | Hit-gated MP gain transition | Stats / Combat / Skills | Dodge/overcap/dead source | deferred | D11 separate upgrade |
| P2 visualization/debug | E2/E6 events have limited provenance | PARTIAL | Gameplay provenance usable by external overlays | Skills events; UI consumer | Additive event review | 1.1.8 handoff, UI deferred | D8–9 |
| P2 Class/Tree authoring | E9 package ownership excludes content/editor | UNVERIFIED | External consumer feature inventory not audited; no Core engine proposed | Consumer/editor | Out of repository | deferred | Consumer scope |

### CORE_CAPABILITY_GAP register

Each entry identifies blocked work, inspected APIs, owner, smallest proposal and
approval dependency. No gap authorizes implementation in this checkpoint.

- **G1 — Root offensive inheritance (P0, BLOCKED).** A→B→C cannot keep one S0
  through current E1/E4/E5: execution snapshot has no offense, E2 calls
  `snapshotDamage` at each mechanic boundary, and DamageSnapshot binds component
  definition/rank. Damage/Skills must introduce component-independent detached
  offense and opt-in assembly. Approve D1–3/D7–8 before 1.1.1–2.
- **G2 — Independent triggered Skill lifecycle/dispatch (P0, BLOCKED).** E1
  execution owns an actor action slot; E2 closed `SkillGameplayEffect`/runtime
  has no child Skill, parent identity or natural Skill expiry; E3 only emits
  projectiles. Skills must add bounded instance/receipt/link semantics around
  existing delivery internals, with D4–9 approval. Existing events/frontiers
  cannot supply arbitrary replay or nested work budgets.
- **G3 — Atomic N-stack consumption (P1, BLOCKED).** E6 exposes `groups` and
  per-instance `remove`, not all-or-nothing consume/admit; E5 FIFO shifts one
  stack after scheduled DoT tick. Effects owns a minimal transactional consume
  result integrated by Skills; D10 must define group/source partition, selection
  order, insufficient-stack behavior and rollback-before-spawn semantics.
- **G4 — Explicit Heal (P2, BLOCKED/deferred).** E2 gameplay discriminants and
  E6 EffectDefinition accept damage/status/modifiers only; E7 damage requires
  nonnegative damage; E8 `updateCurrentResources` provides elapsed regen/clamp,
  not a heal event, target policy or revive semantics. Combat/Effects/Skills
  need a separately reviewed explicit resource-effect contract (D11). Do not
  emulate healing with negative damage, fake regen intervals or direct HP writes.
- **G5 — Lifesteal (P2, BLOCKED/deferred).** E4 returns damage and E7 applies it,
  but E2 dispatch has no post-applied-damage sustain policy and E6 modifiers
  cannot express hit-resource transfers. Minimal Core proposal links eligible
  applied damage to a validated heal transition; Damage/Combat/Skills ownership,
  D11 choices include overkill, DoT, dead source and caps. A consumer event
  listener writing HP is a substitute mechanic, not support.
- **G6 — Mana on Hit (P2, BLOCKED/deferred).** E1 only commits MP cost; E8 regen
  has no successful-hit gate; E2 `onHit` accepts DoT declarations only. A typed
  Core on-hit resource gain would reuse live MP/maxMana validation in Stats/
  Combat/Skills, after D11 defines amount, caps, source liveness and eligibility.
  Do not simulate it by refunding cost or adapting manaRegen.

P1 generic conditions/upgrade behavior is PARTIAL, not claimed fully supported:
existing filters and replacements work only within E1/E6/E8 contracts. A future
specific unsupported condition must receive its own gap analysis before code.

## 7. Compatibility and migration proposal (OPEN_DECISION D8)

Compare adding optional composition fields to the closed legacy definitions
(small surface but changes accepted schema/unions and risks silent mode changes)
with a separate versioned opt-in CompositionDefinition wrapping unchanged
SkillEngineDefinition records. Recommend the wrapper. No composition means exact
v1.0 mechanic-owned snapshots and costs. Reject unknown mode/version; never
infer root mode from tags, child IDs or a consumer callback.

| Protected surface | Future plan requiring review |
| --- | --- |
| SkillEngineDefinition / SkillGameplayEffect | Preserve closed legacy schemas/discriminants; wrapper carries links/lifetimes and references validated definitions; no `spawn_skill` in legacy union without separate approval |
| SkillExecutionSnapshot / activation event | Preserve existing action metadata and zero/100% behavior; root association is opt-in, not proof old casts captured offense |
| SkillEffectRuntime / environment | Public container shape is inherited, including visible stores with internal types; additive fields can break literal construction. Prefer private association plus new typed facade; audit consumer object literals/callbacks and cancellation before choosing D8 |
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

## 8. Developer decision requests and proposed checkpoints

All recommendations above remain **OPEN_DECISION**. Approval should record the
selected option and expected behavior, not a blanket permission to bypass checks.

| Decision | Required answer / blocks |
| --- | --- |
| D1 | Successful-start or activation S0 capture, exact expiry/zero/100% ordering; blocks offense implementation |
| D2 | Reusable DamageSnapshot-derived payload or new source-context; deep immutable data/config boundary |
| D3 | Pin reachable bundle at root acceptance or child revision at spawn; rank/hot-reload policy |
| D4 | Detached spawned children or cascading parent cancellation; policy before/after trigger |
| D5 | Explicit Skill lifetime or last-delivery expiry; whether emitted deliveries outlive expired instance |
| D6 | Bounded acyclic OnImpact/OnExpire links first, or broader graph; occurrence/target multiplicity and wall/no-target impact |
| D7 | Child emitted admission: dead source, missing source, stun/silence, event origin/LOS, timing/AS and defense config pin policy |
| D8 | Opt-in wrapper and thin facade association, future API/event exports and consumer migration compatibility |
| D9 | Same-time phase total order, queue/reentrancy, receipt compaction, budget accounting/exhaustion and atomic spawn outcomes |
| D10 | Approve/defer P1 stack consume/conditions/upgrades; no implicit P0 expansion |
| D11 | Explicitly defer Heal/lifesteal/Mana on Hit or commission separate audited upgrade plans |

Suggested sequence is a proposal, not authorization or an existing official
roadmap. Recheck source drift at every checkpoint; do not begin 1.1.1 here.

| Checkpoint | Smallest reviewable result | Dependencies / principal risk |
| --- | --- | --- |
| v1.1.1 | Approved contract/compatibility design → opt-in definitions, validators, payload contracts | D1–3/D6–8; closed schema, preservation and installed type checks |
| v1.1.2 | S0 capture/component assembly through existing delivery boundaries | D1–3/D7; no caster resampling, no legacy timing drift |
| v1.1.3 | Independent instances, identity/provenance, lifetime/cancel/cleanup | D4–5/D7–8; action slot separation, retained S0 ownership |
| v1.1.4 | Bounded OnImpact→B, OnExpire→C vertical slice using existing AoE/radial delivery | 1.1.2–3, D6/D9; event origin and no-target/Dodge distinction |
| v1.1.5 | Receipt replay, bounded same-time queue, cycle/work/fanout protection | D9; must accompany executable triggers before runtime acceptance, not postpone safety until later shipping |
| v1.1.6 | Optional P1 slice only if separately approved; otherwise harden P0 edge cases | D10; atomic stack consume and kill/condition attribution can expand scope |
| v1.1.7 | Legacy regression, boundary/RNG determinism and installed consumer acceptance | All runtime decisions; exact old behavior and declaration/legacy preservation |
| v1.1.8 | Package/API docs and cross-repo upgrade handoff with reviewed server/editor plan | No automatic pin update/release; measure budgets and document remaining gaps |

## 9. Future implementation acceptance matrix — NOT EXECUTED

These are expected observations to test with actual Core, deterministic caller
adapters and no assets/alternate engines. Pending-policy cases become exact
assertions only after the relevant Developer decision is recorded.

| Case | Expected observation | Checkpoint / decision |
| --- | --- | --- |
| A→B→C | Three distinct pinned definitions/instances and root/parent/receipt IDs; OnImpact activates B at impact origin; natural B expiry activates C radial delivery; A action completion is independent; one root MP/cooldown charge, no child actor slots | 1.1.3–5, D4–6/D9 |
| S0 capture | Change gear/buff before activation and between generations: start vs activation selects D1's expected S0 exactly; count captures once; B/C never call live offense resolver even after source death | 1.1.2/4, D1–2/D7 |
| Components and live defense | B and C use different coefficients/ranks/tags against same S0; independently calculate expected B0/B1 with actual Core; mutate armor/MR/dodge/HP/faction/generation before contact and observe live defense/eligibility; no inherited finalDamage | 1.1.2/7 |
| Cancel before/after trigger | Before accepted trigger: no child. After spawn: recommended detached child survives; cascade alternative must assert its approved terminal behavior; cancellation never emits natural expiry trigger | 1.1.3–5, D4–5 |
| Source/target/session | Dead-but-registered source retains S0 under D7; missing source/target explicitly rejects without fake entity/retarget; disposal suppresses pending and callback-time spawn, clears references, repeated dispose inert | 1.1.3–5, D7 |
| Duplicate/conflicting receipts | Same accepted receipt yields no second child/cost/damage/RNG; conflicting payload rejects; rejected/stale receipts cannot revive ended instances; new session generation isolates IDs | 1.1.5, D9 |
| Cycle and exhaustion | Reject A→B→A bundle; runtime guard catches malformed/dynamic ancestry; each budget fails with approved deterministic reason, bounded work/no partial child batch; prior damage not rolled back | 1.1.5, D6/D9 |
| Same timestamp / ticks | Expiry, impact, defeat/stun, activation 0/100 and zero-delay descendants produce identical event order, RNG call counts/values and HP for coarse/fine caller partitioning with same seed/external mutations | 1.1.5/7, D9 |
| Legacy compatibility | Existing projectile B0 20 despite gear/death, emitter B0 50 at emission, sequence 20/40/60, DoT FIFO/no Crit-Dodge, status expiry, slot/cost/cooldown and pinned headless result remain unchanged in legacy mode | 1.1.7, E1–E8 |
| Radial coverage | More than one direction, angleOffset, wall/lifetime/contact behavior and session disposal use canonical emitter/projectile paths with deterministic expected headings/contacts | 1.1.4/7; adds evidence beyond E3's one-bullet fixture |
| P1 consume (if approved) | Insufficient stacks leaves group/receipt/children unchanged; exact N consume + spawn atomic; per-source partition, FIFO/selection and expiry follow D10; unchanged DoT FIFO | 1.1.6, D10 |
| Installed consumer | Public root/domain imports only, strict declarations without Node ambient types, native ESM, all archived forwarders and blocked deep imports; no app dependencies; exhaustive event-switch migration evidence | 1.1.7–8, D8 |

Future delivery runs relevant domain/integration tests, build/typecheck,
architecture/preservation, external consumer and full `npm run verify`. Changed
behavior must have targeted assertions before a narrowly reviewed preservation
update; never fake PASS from schema validation or zero selected suites.

## 10. Validation, limitations and handoff

Actual commands/results for this checkpoint:

| Command / check | Result |
| --- | --- |
| `git status --short`, branch/remotes/HEAD inspection; `git fetch origin`; `git branch -a`; `gh pr list --state open --json number,title,headRefName,baseRefName,url`; main log | Clean initial worktree; remote main SHA and no open PRs as section 1; no work overwritten/stashed/reset |
| `git switch -c docs/v1.1.0-composable-skill-foundation origin/main` | Branch created at exact baseline |
| `node --version` | `v24.18.0` |
| `npm test -- tests/skills tests/effects tests/damage tests/integration/skill-effect-integration.test.ts tests/stats tests/modifiers` | **119 tests passed, 11 files**; existing behavior only |
| `npm run check:architecture` | PASS, 41 modules, no runtime cycles; three existing contract-only type cycles reported |
| `git diff --check` and local Markdown file-link / evidence-reference check | PASS; scope restricted to this new proposal |

Full verify/build/preservation/consumer were not rerun: task explicitly requests
lightweight validation for docs-only proposal. Historical coverage reports are
not fresh execution results. No new nested-skill tests or mechanics exist here.
Multi-bullet radial integration, external consumer state, production budget sizing,
crash recovery and all open policy decisions remain outside verified evidence.

Changed file: `docs/RPG_CORE_V1.1_FOUNDATION.md`, to supply the source-backed
capability matrix, type sketches, compatibility options, decisions and future
acceptance handoff. Public API/behavior/legacy compatibility impact: **none**.
Proposal checkpoint: **READY for Developer review**; G1–G6 dependent upgrades:
**BLOCKED** pending approved plans. P0 reuse is supported; child composition and
root inheritance are not implemented. **STOP: no merge, v1.1.1, package publication,
release or editor dependency update.**
