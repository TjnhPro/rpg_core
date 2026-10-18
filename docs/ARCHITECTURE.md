# RPG Core architecture

v1.2.5 adds acceptance evidence for canonical OnHit/OnKill -> self Child recovery,
including lethal target handling, authenticated sources and existing budgets.
It changes no production source, contracts or preservation baseline. See the
[phase closure review](RPG_CORE_V1.2.5_RECOVERY_ACCEPTANCE_CLOSURE.md);
Developer acceptance of phase closure remains pending.

This is the current architecture reference. [README](../README.md) covers package
installation and commands; [architecture-audit.md](architecture-audit.md) records
the historical Phase 1 refactor. [The coverage matrix](test-coverage.md) and
[Phase 2 audit](cleanup-audit.md) record verification and cleanup evidence.

## Responsibility and ownership

Gameplay contract isolation is verified at source, emitted declaration and
installed-package boundaries. `SkillMechanics` and delivery configurations stay
in Contracts with Mechanics/Skills behavior; `DamageDelivery` and defense context
stay in Contracts/Damage; `MapPoint` stays in Contracts/Spatial; `CombatEntity`
and entity-dependent targeting/effect contracts stay in Contracts/Combat and
their existing gameplay domains. No relocation is needed for correctly owned
contracts. Kernel receives resolved scalars, selected rules and numerical data,
with no Skill Engine requirement for consumers. Generic strings (including
gameplay-looking labels) carry no built-in gameplay meaning. See the
[v2.0.9 Gate B evidence](v2/2.0.9-gameplay-contract-decoupling.md).

v2 migration boundary: [Kernel Foundation](v2/2.0.1-kernel-foundation.md) established
`src/kernel/` and `@rpg/core/kernel`. Kernel imports only Kernel modules. v2.0.3
moved canonical stat calculations inward; the approved v2.0.4 cut also delegates
modifier selection/aggregation, with its separate preservation checkpoint approved.
Other calculations and gameplay runtimes remain canonical Legacy code until
their approved extraction. Kernel cannot reference Legacy, including Contracts or root
barrel, through runtime imports, type imports, re-exports or dynamic loading.
In-repository isolation does not require separate packages or repositories.

Core owns stat/modifier resolution, damage/defense, entity/target/action validation,
skill admission/execution, effect lifecycle, delivery geometry and deterministic
simulation primitives. The implementation lives once under `src/<domain>`.
`src/shared/**` and generated `dist/src/shared/**` only forward to it.

Applications own content, inventory/items, classes, maps/zones, AI/auto combat,
assets/rendering/animation, persistence, networking, sessions and client/server
orchestration. They supply entities, source identities, grid/positions, clock,
RNG, config versions, event callbacks and advancement order. Core contains no
application scheduler, wall clock or second resource ledger.

v2.0.7's approved extraction moves scalar resource transitions, normalization and
regeneration into `kernel/resources/resource-calculation.ts`. Combat and Stats
retain validation, resource policy mapping and result projection. Stats forwards
live maximum/rate accessors so validation, normalization and HP-before-MP regen
retain their accepted reads. Kernel has no entities, resource store or writes.
Skills keeps percent/lifesteal requested amounts, cost commitment and event/lifecycle
ordering. Allowed above-max increase uses signed `after - before`; damage decrease
retains authoritative magnitude rather than net change. Regen uses caller precision,
the existing toFixed expression and fraction-preserving guard. Stable inputs are
caller-validated; readonly is not a clone/freeze guarantee. The separate modules 8/12
preservation amendment was approved on 2026-10-18; [review evidence](v2/2.0.7-resource-calculation-extraction.md).

## Change governance and capability gaps

Every task changing source, mechanics, contracts or architecture must have a plan
approved by the user before implementation. Agents may audit, research and propose
plans; they cannot approve their own plans or expand scope when difficulties arise.
Report the obstacle and wait for the user's decision. Never automatically merge PRs.

If a required mechanic such as Lifesteal or Mana On-Hit is unsupported, inspect the
existing public APIs first. Report `CORE_CAPABILITY_GAP` with the missing mechanic,
affected domains and why those APIs are insufficient. Mark dependent work `BLOCKED`
and wait for a user-approved Core upgrade plan; do not implement the missing mechanic
on the agent's own initiative.

Agents must not create substitute Damage Engines, Skill Engines, Effect Engines,
Resource Logic or gameplay implementations in any repository.
Changing formulas, removing validation or writing separate logic to make tests pass
is prohibited. Application-owned adapters and orchestration use existing Core APIs;
they do not authorize implementing an unsupported mechanic outside Core.

Completion status is limited to `READY` (implemented according to the approved plan
and verified), `PARTIAL` (authorized portion completed, missing work identified), or
`BLOCKED` (needs a user decision or new Core capability). Workarounds cannot convert
`BLOCKED` into `READY`. See [AGENTS.md](../AGENTS.md) for the repository working rules.

## Domains and dependency rules

Every domain may import itself. The table lists **other allowed domains**, matching
`scripts/check-architecture.mjs`; permission is not a requirement to use all edges.
All dependency syntaxes are checked, including type imports and dynamic imports.
Runtime cycles are forbidden; three existing contract-only type cycles are reported
and retained. v1.1.1 adds two type-only Skills provenance/runtime links (five total).
No canonical Core import may load external packages, Node built-ins,
legacy paths or application modules. The root barrel only assembles public exports.

| Domain | Responsibility / principal public APIs | Other allowed domains | Evidence |
| --- | --- | --- | --- |
| `contracts` | Shared shapes, default configs and validators: `CombatEntity`, `CombatModifier`, `DamageContext`, `EffectDefinition`, `Walkability`, `validateCombatModifiers`, `validateDefenseSettings` | None | Domain validation tests and integration fixtures |
| `stats` | Resolved attributes → derived bases → modifiers/transform/caps, absolute resources, cooldown duration: `resolveCharacterStats`, `calculateEffectiveStat`, `updateCurrentResources`, `cooldownDurationMs` | contracts, modifiers | `tests/stats`, `tests/skills`, `tests/integration` |
| `modifiers` | Legacy validation/source activation/tag policy and Kernel delegation: `collectActiveModifiers`, `prepareModifierResolver`, `resolveModifiers` | contracts, kernel | `tests/modifiers`, `tests/effects/effect-modifiers.test.ts` |
| `combat` | Entity state, relations, target/action admission, hit revalidation, restriction cancellation, HP transition: `combatState`, `validateCombatAction`, `validateCombatHit`, `startCombatAction`, `cancelCombatAction`, `applyEntityDamage`, `applyEntityHealing` | contracts, spatial | `tests/combat`, skill and restriction tests |
| `damage` | Legacy B0/B1 facade delegating Kernel arithmetic; Crit, Dodge, armor/MR: `calculateDamage`, `snapshotActorDamage`, `mitigateDefense`, `resolveDefenseHit` | contracts, combat, modifiers, kernel | `tests/damage`, delivery integration tests |
| `skills` | Immutable definition, availability, MP/cooldown commit, activation and effect dispatch: `defineSkill`, `executeSkill`, `advanceSkillExecution`, `cancelSkillExecution`, `dispatchSkillEffects`, `advanceSkillEffects`, `clearSkillEffects` | contracts, combat, stats, effects, damage, mechanics, spatial | `tests/skills`, `tests/integration` |
| `effects` | Immutable effect definitions, apply/refresh/stack/expire/restrictions and on-hit DoT: `defineEffect`, `EffectLifecycle`, `applyDotSnapshot`, `tickDotRuntime` | contracts, combat, modifiers, damage | `tests/effects`, effect and status integrations |
| `mechanics` | Melee hitboxes, projectile movement, AoE geometry; internal sequence/emitter kernels: `detectMeleeHitbox`, `moveProjectile`, `detectInstantAOE`, `lockAOEPosition`, `validateSkillMechanics` | contracts, spatial | `tests/integration/skill-effect-integration.test.ts` and skill/RPG integrations |
| `spatial` | Supplied-grid walkability, exact cell traversal and range: `isWalkable`, `canTraverse`, `distance`, `inRange` | contracts | `tests/spatial`, skill range tests |
| `kernel` | Numerical contracts, stat/scalar/cooldown/B0/B1 arithmetic and modifier selection/aggregation | None (Kernel-internal imports only) | Architecture/declaration fixtures, strict installed consumer, independent numerical fixtures |

The eight non-Contracts Legacy domains above additionally may import `kernel`;
all other Legacy allowances are unchanged. Contracts keeps its existing policy.
The source-level gate applies to every file under `src/kernel/**`, including
nested files and aliases through Kernel barrels. External dependencies remain
forbidden. Full transitive emitted-declaration and generic-contract isolation is
implemented in v2.0.2 using the TypeScript compiler API over source and emitted
public dependency closures, plus actual installed declarations. v2.0.1 evidence
remains scoped to its original source checks. Historical cycle counts in the
v1 prose above do not replace current checker output; the v2.0.0 baseline records
ten combined/type-containing cycle paths and zero runtime cycles.

v2.0.2 [Universal Calculation Contracts](v2/2.0.2-universal-calculation-contracts.md)
exports types only through Kernel, without root re-exports or new package subpaths.
Generic numerical keys, selected rules and resolved eligibility replace gameplay
schemas at this boundary. Stat results include attribute diagnostics and derived
scaling totals; later Legacy facades can project all five historical result fields
without another resolver pass. Transform callbacks remain caller-owned synchronous
pure functions, once per derived stat after modifiers and before bounds/precision,
including disabled stats; no attribute callback or snapshot callback is introduced.
Types cannot enforce purity or deterministic closed-over state. Snapshot readonly
means compile-time access restriction, detached copy means independent backing
objects, and runtime freeze prevents writes; v2.0.2 implements neither copying nor
freezing. Those guarantees belong to the separately reviewed v2.0.8 extraction.

v2.0.3 moves attribute/derived-stat sequencing, scaling, transform, clamp,
precision and cooldown arithmetic into Kernel. Legacy Stats adapts config/IDs
and projects the five historical result fields. Prepared resolver injection keeps
modifier arithmetic in its single Legacy implementation, with no reverse edge.
The additive prepared input has explicit key order and no raw modifiers list;
resolved diagnostics pass through by reference via a default-compatible generic.
NaN/Infinity transforms and native callback/precision errors retain existing
semantics; no new Legacy validator, clone/freeze or resource extraction is added.
The [extraction evidence](v2/2.0.3-attribute-stat-extraction.md) records the separately
reviewed preservation amendment. Roadmap order is now Stats .3, Modifiers .4.

v2.0.4 uses that existing prepared resolver seam without changing Stats. Kernel
owns identity tuples, last-identical deduplication, lexical order, grouping and
the three ordered numerical passes. Legacy provides synchronous accessors and
full-payload equivalence, validates canonical entries before grouping, and projects
the historical result shape. Prepared target selection is fixed, but contribution
objects, arrays, operations and values remain live. Generic callers should supply
stable/pure accessors for deterministic results; no copy/freeze guarantee is added.
Opaque source membership and lazy exact tag matching do not transfer gameplay
activation or damage vocabulary into Kernel. Negative `damage_bonus` remains
valid; nonempty conditions remain rejected by the unchanged Legacy validator.
See the [parity evidence and approved module-13 preservation amendment](v2/2.0.4-modifier-resolver-extraction.md).

v2.0.5 moves B0 rank/base/scaling/flat arithmetic, ordered item-source products and
B1 additive accumulation/clamps into Kernel. Legacy retains context/eligibility,
canonical modifier selection policy, diagnostics, Dodge, Critical, Defense and
snapshots. The existing v2.0.4 resolver remains canonical; no second modifier
calculator is introduced. B0 runs only after a landed hit and before Critical RNG.
Its `resolveFlat()` boundary runs once after scaling, followed by definition,
additional and resolved flat reads. B1 runs after Critical without another RNG or
eligibility pass. Accessors are synchronous, caller-owned, stable/pure for generic
determinism; Legacy deliberately adapts live mutable configuration. Readonly types
do not detach/freeze values and callbacks are not snapshot data. The five v2.0.2
Damage contracts and all Legacy declarations remain unchanged. Module 10's
preservation amendment was separately approved on 2026-10-18; see
[the extraction review](v2/2.0.5-damage-calculation-extraction.md).

The approved v2.0.6 implementation moves Hit/Critical probability and generic
rating mitigation, including final/prevented damage, into Kernel. Legacy delegates
without changing its declarations, validation, rule selection, gameplay eligibility,
RNG provision or diagnostics. The private Legacy rating calculator is removed.
Dodge invokes its callback unbound only for positive chance; Critical's Legacy
adapter preserves the original input receiver and roll getter reads before chance
and successful bonus reads. DoT still exposes roll `1` without drawing RNG.
Mitigation captures the selected coefficient container while forwarding live
numerical fields and late actor levels. Disabled/missing precedence is preserved.
All nine v2.0.2 Defense contracts are unchanged. Generic callers provide numerical
policies and stable synchronous accessors; no global RNG, clone/freeze or gameplay
default is introduced. Text RPG fixed reduction uses fractional min=max bounds.
Modules 10/11 received separate exact preservation approval on 2026-10-18; see
[the review evidence](v2/2.0.6-critical-defense-extraction.md).

Supported delivery is direct hit, melee, projectile, instant AoE, timed AoE sequence,
timed projectile emitter and on-hit DoT. Effect payloads support modifiers, stun and
silence; slow uses the existing movement multiplier. Config IDs reserved for disabled
elemental stats do not imply implemented elemental mechanics. Defense coefficients
must be supplied for armor/MR mitigation; missing config is explicitly reported.

Public consumers use `@rpg/core` or the nine `@rpg/core/<domain>` imports listed in
README. The exact API is each explicit `src/<domain>/index.ts` plus `src/index.ts`
and `package.json.exports`. Delivery kernels and debug/freeze helpers are internal.
Type contracts named `PlayerStatsConfig`, entity kinds `player | monster` and other
inherited names retain their existing semantics; generic ownership does not authorize
silently generalizing them.

## v2.0.8 numerical snapshots

Kernel's two capture APIs copy closed numerical offense/calculation data using
one native `structuredClone`, then freeze supported nested records and arrays.
Captured backing data is detached; shared aliases inside the graph are retained.
TypeScript readonly alone still supplies neither copy nor runtime freeze.
Public capture validation rejects cycles, accessors, callbacks, extra fields and
non-data containers; NaN/Infinity/-0 and optional undefined are preserved.
Context damageType/tags/ownerId/revision are labels without gameplay trust.

The internal copy/freeze primitives are not package exports. Legacy Damage uses
them at its original two modifier-list clone sites and full Root envelope
clone/freeze site, keeping its validators/catch mapping and deferred eligibility.
Default `snapshotActorDamage` retains mutable source/setting aliases. Root/Child
share the original trusted S0; public derive remains a detached mutable copy.
No Skill/DoT capture timing, identity registry or RNG provision changes. Existing
Hit/Critical APIs consume injected lazy rolls; no RNG is captured in snapshots.
See the [implementation and preservation review](v2/2.0.8-calculation-snapshot-context-extraction.md).
The exact module-10 preservation amendment was separately approved on 2026-10-18.

## Execution and state

1. **Admission:** `skillExecutionAvailability` validates definition/context, target,
   restrictions, range/LOS, MP and cooldown without mutation. `executeSkill` also
   validates supplied rates/positions and pins a detached definition/target/timing.
2. **Action start and commit:** `startSkillAction` checks the next trusted serial,
   calls `startCombatAction`, then subtracts MP on the live entity and writes the
   cooldown deadline. Rejection leaves costs/deadlines untouched. Cancellation after
   a successful start preserves both; retrying the serial cannot spend twice.
3. **Activation:** `advanceSkillExecution` emits `skill-activated` once at the pinned
   activation timestamp. Zero-percent activation follows commit; 100-percent
   activation precedes completion. Defeat/restrictions can cancel pending activation.
4. **Gameplay effects:** the application dispatches each trusted activation through
   `dispatchSkillEffects` at that actual simulation boundary. Ordered effect entries
   apply lifecycle payloads or create damage deliveries; duplicate dispatch is inert.
   Completion/caster defeat does not delete already emitted projectiles/DoT.
5. **Damage:** delivery validates eligibility/contact against live entities and
   uses `calculateDamage`/defense resolution. Direct/melee/instant AoE sample offense
   on execution, projectiles at launch, emitters at each emission, sequences at each
   strike and DoT at successful application. These are not cast-time offense snapshots.
   Defender ratings/resources remain live at contact/tick. Dodge suppresses on-hit
   DoT and Crit; DoT consumes neither Dodge nor Crit RNG.
6. **Events:** damage updates live HP via the shared entity transition and emits
   ordered damage/defeat events. Application wiring propagates defeat cancellation
   to action slots; the shared integration fixture demonstrates this explicitly.
7. **Advancement/cleanup:** callers partition time at activation, delivery, tick and
   expiry boundaries (`nextSkillEffectBoundary` helps), advance effects before
   same-timestamp reads and reconcile actions. Expiry wins at the exact deadline.
   At session end cancel action slots and call `clearSkillEffects`; lifecycle disposal
   is terminal and isolated. A coarse jump is not permission to resolve historical
   contact using present-state data.

| State | Owner and meaning |
| --- | --- |
| Skill definition | Detached immutable gameplay specification from `defineSkill`; no asset or UI fields |
| Skill execution | Session action slot with serial, target, version and timing snapshot; activation is not a hit |
| Effect definition | Immutable validated duration, stack policy, payload/restrictions |
| Effect instance | `EffectLifecycle` identity/source/target, frozen application payload and expiry; separate from definition and skill action |
| Damage snapshot | Offense/config captured at mechanic-owned boundary; not a live stat/resource store |
| Combat state | Derived liveness/restrictions and explicit active action; HP/MP reference the caller's entity |
| Application state | Entity registry, content, equipment ownership, positions, clock/RNG, session orchestration and persistence; stays outside Core |

See [examples/headless.ts](../examples/headless.ts) for the package-based recipe and
`tests/fixtures/skill-core.ts` / `skill-timeline.ts` for the actual Core integrations.
Adapters provide inputs and event/clock wiring; they do not replace damage/effect engines.

## Extending a mechanic

The [v1.1.4 nested composition contract](RPG_CORE_V1.1.4_NESTED_COMPOSITION.md)
documents opt-in trusted child dispatch through these same mechanics, root S0,
session-owned trigger delays, actual-emission budgets and detached lifecycle.
Default and v1.1.3 intent-only execution remain unchanged.

Before adding delivery, inspect `SkillGameplayEffect` in `src/skills/skill-effects.ts`,
the existing dispatch in `src/skills/skill-effect-integration.ts`, and `src/mechanics`.
For example, the existing timed projectile emitter already composes validated
projectile configuration, per-emission offense snapshots and shared projectile
contact; another skill with those capabilities should supply content to this API.

If a new Core capability is actually needed, follow the capability-gap procedure
above. Audit and propose the owning domain, minimal contract, implementation scope,
targeted tests and compatibility impact for human review. The following implementation
steps apply **only after the user approves that Core upgrade plan**:

1. Select its owner: geometry in mechanics/spatial, lifecycle in effects, dispatch
   in skills, numeric resolution in damage/stats/modifiers. Use the table's edges.
2. Design the smallest contract in the existing contract/skill-effect module. A new
   discriminant or changed schema is an intentional compatibility decision, not cleanup.
3. Implement once in the canonical domain. Reuse contact validation, damage and HP
   APIs; do not create a parallel projectile, effect or stat engine.
4. Add targeted geometry/invalid/boundary tests and an actual-Core dispatch integration.
   Anchor timing/RNG/exactly-once expectations to the existing projectile/sequence
   scenarios in `tests/integration/skill-effect-integration.test.ts`.
5. Review public/legacy compatibility, update explicit barrels only when an API is
   intended for consumers, and run typecheck, architecture, consumer and full verify.

## Verification limits and preservation policy

`verify` includes source/test/example compilation, runtime-cycle/domain checks,
tests, the pinned deterministic headless result and an external installed-archive
consumer. The checker rejects copied whole-module declaration fingerprints and
requires all legacy files to be exact registered forwarders. It cannot prove the
absence of differently written equivalent engines; semantic ownership needs review.

`check:preservation` compares all historical declarations, including private helpers,
to reviewed commit `c5878d92e198acd19289f568a2ddeda5096d83e7` and checks compiled legacy
namespace identity. It intentionally locks maintenance changes, not all future feature
work. An approved behavior change must document the precise affected declarations,
add targeted evidence, and review a narrowly updated baseline together with consumers.
Keep unchanged declarations and shim/namespace checks enforced; never regenerate the
entire baseline merely to make a failure disappear. The consumer's pinned example
hash must likewise change only with explicit expected-result evidence.

Unknown external repository-relative consumers prevent declaring legacy deletion safe.
The archive check verifies all 27 generated legacy JS/declaration paths as well as
root/domain ESM exports and blocked package deep imports. Phase 2 changed no
runtime behavior, public schemas, dependency versions, license or release state.

The v1.1.1 root-offense addition is recorded in the
[checkpoint contract/evidence](RPG_CORE_V1.1.1_ROOT_SNAPSHOT.md): successful-start
capture is explicit opt-in; all default mechanic-owned capture times above remain
unchanged. Weak execution/session trust records belong to Skills; component-independent
offense extraction and the existing calculator belong to Damage. The preservation
file records only the three approved affected historical entries, with original
removed hashes retained; all forwarder/namespace checks still apply.


## v1.2.0 Healing ownership

Combat owns the pure flat HP recovery transition; Skills owns ordered Root/Child
execution and emits the additive `healing-applied` event after authoritative HP
commit, only for positive recovery. It reads live Max HP through the existing
Skill environment, validates identity/liveness/self-or-ally/range, and never calls
Damage or synthesizes hit/kill occurrences. Stats retains resource normalization,
regeneration and Max HP formulas. No new domain, dependency edge, scheduler or
resource store is added. Public exhaustive effect/event switches need the new
cases; see [contract and narrow preservation amendment](RPG_CORE_V1.2.0_HEALING_FOUNDATION.md).

## v1.2.1 Lifesteal ownership

Skills optionally couples its existing canonical damage application with Combat
Healing using actual applied damage and the effect's pinned rate. Both HP writes
precede notifications. Root admission identity is reused through Root S0 for Child
source authentication; no new resource state or engine is introduced. Positive
recovery emits the existing event after damage/defeat and before effect-hit.
DoT and stack-consumption outcomes remain excluded. See the
[contract and preservation amendment](RPG_CORE_V1.2.1_LIFESTEAL.md).

## v1.2.2 Mana on Hit ownership

Combat owns pure explicit MP gain; Stats retains normalization, elapsed regeneration
and Max Mana formulas. Skills couples opted-in canonical landed enemy contacts to
that transition, reading live effective Max Mana through optional trusted
`resourceStats`. Existing admission identities authenticate Root/Child sources.
Damage HP, Lifesteal HP and MP commit before notifications and trigger intake;
positive `mana-gained` follows existing damage/defeat/healing notifications and
precedes effect-hit. No new store, ledger, scheduler or domain edge is introduced.
Public exhaustive Combat event switches need the new event case. See
[contract and preservation amendment](RPG_CORE_V1.2.2_MANA_ON_HIT.md).

## v1.2.3 Explicit Restore ownership

Skills adds one ordered restore_mana operation and reuses the existing Combat
MP-gain primitive/event. Healing recipient validation is shared with HP behavior
preserved. Restore-only Root/Child uses existing admission identity pins; the live
resource resolver receives the actual recipient, including a selected ally.
No Combat, Stats, Effects, Damage formula or scheduling change. Consumers with
exhaustive Skill effect switches need the new discriminant. See
[contract and preservation amendment](RPG_CORE_V1.2.3_EXPLICIT_RESTORE.md).

## v1.2.4 Percent Recovery ownership

Skills resolves percent requests from live recipient effective maxima and delegates
to the unchanged canonical Combat transitions/events. Shared original-source
validation covers percent-HP-only Child bundles without a new identity store.
Existing ordered effects, lifecycle boundaries, budgets and resource caps remain.
The approved public amount union widening requires numeric-read narrowing;
see [contract and preservation amendment](RPG_CORE_V1.2.4_PERCENT_RECOVERY.md).
