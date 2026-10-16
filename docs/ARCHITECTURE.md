# RPG Core architecture

This is the current architecture reference. [README](../README.md) covers package
installation and commands; [architecture-audit.md](architecture-audit.md) records
the historical Phase 1 refactor. [The coverage matrix](test-coverage.md) and
[Phase 2 audit](cleanup-audit.md) record verification and cleanup evidence.

## Responsibility and ownership

Core owns stat/modifier resolution, damage/defense, entity/target/action validation,
skill admission/execution, effect lifecycle, delivery geometry and deterministic
simulation primitives. The implementation lives once under `src/<domain>`.
`src/shared/**` and generated `dist/src/shared/**` only forward to it.

Applications own content, inventory/items, classes, maps/zones, AI/auto combat,
assets/rendering/animation, persistence, networking, sessions and client/server
orchestration. They supply entities, source identities, grid/positions, clock,
RNG, config versions, event callbacks and advancement order. Core contains no
application scheduler, wall clock or second resource ledger.

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
| `modifiers` | Live source filtering, identity deduplication, stable prepared resolution: `collectActiveModifiers`, `prepareModifierResolver`, `resolveModifiers` | contracts | `tests/modifiers`, `tests/effects/effect-modifiers.test.ts` |
| `combat` | Entity state, relations, target/action admission, hit revalidation, restriction cancellation, HP transition: `combatState`, `validateCombatAction`, `validateCombatHit`, `startCombatAction`, `cancelCombatAction`, `applyEntityDamage`, `applyEntityHealing` | contracts, spatial | `tests/combat`, skill and restriction tests |
| `damage` | B0/B1 offense, Crit, Dodge, armor/MR: `calculateDamage`, `snapshotActorDamage`, `mitigateDefense`, `resolveDefenseHit` | contracts, combat, modifiers | `tests/damage`, delivery integration tests |
| `skills` | Immutable definition, availability, MP/cooldown commit, activation and effect dispatch: `defineSkill`, `executeSkill`, `advanceSkillExecution`, `cancelSkillExecution`, `dispatchSkillEffects`, `advanceSkillEffects`, `clearSkillEffects` | contracts, combat, stats, effects, damage, mechanics, spatial | `tests/skills`, `tests/integration` |
| `effects` | Immutable effect definitions, apply/refresh/stack/expire/restrictions and on-hit DoT: `defineEffect`, `EffectLifecycle`, `applyDotSnapshot`, `tickDotRuntime` | contracts, combat, modifiers, damage | `tests/effects`, effect and status integrations |
| `mechanics` | Melee hitboxes, projectile movement, AoE geometry; internal sequence/emitter kernels: `detectMeleeHitbox`, `moveProjectile`, `detectInstantAOE`, `lockAOEPosition`, `validateSkillMechanics` | contracts, spatial | `tests/integration/skill-effect-integration.test.ts` and skill/RPG integrations |
| `spatial` | Supplied-grid walkability, exact cell traversal and range: `isWalkable`, `canTraverse`, `distance`, `inRange` | contracts | `tests/spatial`, skill range tests |

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
