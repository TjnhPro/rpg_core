# RPG Core

The v2.0.9 [gameplay boundary review](docs/v2/2.0.9-gameplay-contract-decoupling.md)
adds contract isolation evidence without production API changes. Numerical
consumers can use `@rpg/core/kernel` independently; gameplay delivery, entity and
spatial contracts retain their Legacy owners. Developer accepted v2.0.9 at `f5c22e2431075dc9b610359fdede99460aee850e` on 2026-10-18.

The v2.0.10 [delegation/isolation evidence](docs/v2/2.0.10-legacy-delegation-isolation.md)
adds symbol-level audit and accepted-source runtime traces. Production APIs remain
unchanged; Developer approved the runtime boundary review (Gate B) with zero preservation
delta; final implementation review remains pending.

v1.2.5 verifies Life on Hit/Kill and Mana on Kill as canonical trigger -> self Child
recovery compositions, with no new runtime API. See the
[phase acceptance report](docs/RPG_CORE_V1.2.5_RECOVERY_ACCEPTANCE_CLOSURE.md) and
[installed example](examples/recovery-acceptance.ts). Phase closure awaits Developer acceptance.

v1.2.4 extends `heal`/`restore_mana` amounts with `{percentOfMax: 0.2}` based on
live recipient maxima. Numeric amounts keep their behavior; numeric readers need
TypeScript narrowing. See [contract](docs/RPG_CORE_V1.2.4_PERCENT_RECOVERY.md) and
[installed-package example](examples/percent-recovery.ts).

v1.2.3 adds explicit flat MP restoration with `restore_mana`, alongside existing
HP `heal`. See [contract and compatibility](docs/RPG_CORE_V1.2.3_EXPLICIT_RESTORE.md)
and [installed-package example](examples/explicit-restore.ts).

v1.2.2 adds opt-in fixed Mana on Hit, including zero-damage landed enemy hits,
through canonical Combat MP gain. See the [contract](docs/RPG_CORE_V1.2.2_MANA_ON_HIT.md)
and [installed-package example](examples/mana-on-hit.ts).

v1.2.1 adds opt-in Lifesteal from actual applied enemy damage through canonical
Healing; see [contract and evidence](docs/RPG_CORE_V1.2.1_LIFESTEAL.md) and the
[installed-package example](examples/lifesteal.ts).

v1.2.0 adds explicit flat HP Healing through canonical Combat and Root/Child Skills.
See [Healing Foundation contract and evidence](docs/RPG_CORE_V1.2.0_HEALING_FOUNDATION.md)
and the [installed-package example](examples/healing.ts).

Reusable, headless TypeScript RPG stats, combat, skill and effect execution.
One canonical implementation, with ESM JavaScript and declarations for package
consumers. Application content, clocks, RNG, entities and event wiring are inputs.
There are no production npm dependencies, Node built-in imports, rendering,
Game Client/Server, JX1 or asset dependencies in the Core implementation.

Start with [AGENTS.md](AGENTS.md) and the current
[architecture reference](docs/ARCHITECTURE.md). The
[test coverage matrix](docs/test-coverage.md) locates contract evidence; the
[Phase 2 cleanup audit](docs/cleanup-audit.md) records retention/removal decisions.

Package name: `@rpg/core`. Package version: `1.0.0`, retained from the initial
snapshot; it does **not** declare a stable or officially released package.
`private: true` prevents accidental registry publication. No npm publication or
license decision is part of this refactor.

## Requirements and verification

Build/test require Node >=22.13.0 and npm. TypeScript `6.0.3`, Vitest `5.0.3`
and `@types/node` `22.20.5` are pinned in the lockfile. Runtime uses ES2022 and
`structuredClone`; browser hosts need those facilities and an ESM-aware bundler
or package resolver. The library has no DOM usage; DOM typings supply the standard
`structuredClone` declaration at build time. Node consumers use native ESM.
CommonJS output is not provided.

```sh
npm ci --ignore-scripts
npm run verify
```

`verify` builds, typechecks Core/tests/examples, checks domain dependencies and
declaration preservation, runs Core and tooling tests, runs the deterministic
headless example, then packs and installs the archive in a temporary project
**outside this repository**. That consumer installs its own TypeScript compiler,
typechecks with no ambient Node types and `skipLibCheck: false`, imports all public
entrypoints, runs a real skill/combat example and verifies blocked deep imports.
It also compiles and loads all 27 archived legacy compiled forwarders against
their canonical namespaces.
The temporary project is removed after verification. CI repeats these checks on
Node 22.13.0 and 24 for push and PR; no release/deployment workflow is included.

Individual commands: `build`, `typecheck`, `typecheck:tests`, `test`, `example`,
`check:architecture`, `check:preservation`, `test:consumer`. Build emits only Core
into `dist/`; the example compiles separately into `.example-dist/`.

## Install and public API

```sh
# In this repository; prepack builds the archive.
npm pack
# In the application repository, use the resulting archive's actual path.
npm install /path/to/rpg-core-1.0.0.tgz
```

```ts
import {
  damageDefinition,
  calculateDamage,
  executeSkill,
  createSkillEffectRuntime,
} from '@rpg/core';
import type {CombatEntity, SkillEngineDefinition} from '@rpg/core';

const result = calculateDamage({
  definition: {...damageDefinition(1), base: 10},
  sources: {str: 10, dex: 10, int: 10, vit: 10, physicalAttack: 10, magicAttack: 0},
  settings: {skills: {}, modifiers: []},
  context: {type: 'Physical', tags: ['Direct', 'Physical'], target: 'Normal', statuses: []},
  criticalChance: 0,
  criticalBonus: 0,
  roll: 1,
});
console.log(result.finalDamage); // 20
```

See [examples/headless.ts](examples/headless.ts) for a complete typed integration:
create entities, supply stat/config resolution, factions, grid, positions, clock,
version and seeded RNG; call `executeSkill`; advance at activation/contact/expiry
boundaries; call `dispatchSkillEffects`; read HP/events; cancel action slots and
call `clearSkillEffects` at session end. All Core imports use `@rpg/core`.
Do not derive damage from VFX callbacks.

The root and domain entrypoints use explicit named exports. Package `exports`
allow only these imports; application code does not need internal source paths.

| Import | Responsibility |
| --- | --- |
| `@rpg/core` | Combined public API |
| `@rpg/core/contracts` | Data types, configuration seeds, validation contracts |
| `@rpg/core/stats` | Core/derived stats, caps, resources, cooldown duration |
| `@rpg/core/modifiers` | Active source collection and deterministic resolution |
| `@rpg/core/combat` | Entity validation, targeting, action lifecycle, restrictions |
| `@rpg/core/damage` | B0/B1, critical, dodge, armor/MR and offense snapshots |
| `@rpg/core/skills` | Definitions, availability, costs, cooldowns, execution and delivery integration |
| `@rpg/core/effects` | Definitions, lifecycle, stack/refresh/expire and DoT |
| `@rpg/core/mechanics` | Melee/projectile/AoE geometry and configuration |
| `@rpg/core/spatial` | Coordinate/grid contracts, range and wall traversal |
| `@rpg/core/kernel` | Universal numerical contracts and canonical stat/modifier/B0/B1 calculations |

v2.0.1 establishes an independently importable Kernel and enforces
`Legacy / Gameplay → Kernel` dependencies. Kernel imports only Kernel files;
existing contracts, runtime ownership and the ten old entrypoints are preserved.
No calculation has moved and the root does not re-export Kernel. See the
[Kernel Foundation contract and verification](docs/v2/2.0.1-kernel-foundation.md).

v2.0.2 adds 39 type-only numerical contracts for custom keys, stats, modifiers,
damage, critical/defense, resources and snapshots, independently of Legacy schemas.
Import them with `import type {DamageCalculationInput} from '@rpg/core/kernel'`.
The native ESM namespace remains empty. Stat results retain numerical breakdowns
for later Legacy projection without recalculation. Caller transforms must be
synchronous and pure; types cannot enforce determinism. Snapshot readonly types
do not copy or freeze backing objects; capture/clone/freeze implementation belongs
to v2.0.8. No calculator or runtime validator is implemented in this milestone.
See the [approved contracts, mapping and evidence](docs/v2/2.0.2-universal-calculation-contracts.md).

v2.0.3 moves canonical attribute/stat/scaling/transform/bounds/precision and
cooldown arithmetic into Kernel. `calculateStats`, `calculateEffectiveValue` and
`calculateCooldownDurationMs` are available from `@rpg/core/kernel`; root remains
Legacy. A prepared numerical callback supplies modifier resolution, preserving
one Legacy Modifier Resolver until v2.0.4. Legacy stat signatures and resource
calculation remain unchanged. The reviewed preservation amendment tracks both
implementations; see the [review evidence](docs/v2/2.0.3-attribute-stat-extraction.md).

The approved v2.0.4 implementation adds `selectCanonicalModifiers`,
`prepareNumericalModifiers` and `matchesAnyTag` through `@rpg/core/kernel`.
Legacy delegates canonical modifier selection/aggregation while retaining
validation, source activation and damage/tag policy. Original contribution
objects and mutable group arrays remain live; readonly types do not freeze them.
The separate preservation checkpoint is approved: see the
[extraction and preservation review](docs/v2/2.0.4-modifier-resolver-extraction.md).

v2.0.5 adds `calculateDamageB0`, `calculateDamageB1` and
`calculateDamageBonusValue`, with `DamageB0Input`/`DamageB0Result`. Legacy delegates
numerical B0/B1 while retaining eligibility, diagnostics, Dodge, Critical, Defense
and snapshots. B0 runs before Critical RNG; B1 consumes its selected additive bonus
after Critical. Synchronous live accessors preserve Legacy read timing; generic
callers should supply stable/pure accessors. No copy/freeze guarantee is added.
The Developer approved the exact module-10 preservation amendment on 2026-10-18.
See [the extraction review](docs/v2/2.0.5-damage-calculation-extraction.md).

v2.0.6 implements `calculateHit`, `calculateCritical` and `calculateMitigation`
from the existing nine Defense contracts. Kernel owns probability, rating,
clamping and final/prevented damage arithmetic; Legacy supplies eligibility,
rules, validation and RNG, and maps its original diagnostics. Dodge remains lazy;
Critical draws before chance reads and retains the DoT public roll sentinel `1`.
The Developer approved the exact preservation amendment for modules 10/11 on
2026-10-18; see [the review evidence](docs/v2/2.0.6-critical-defense-extraction.md).

Delivery scheduling kernels, freeze helpers and debug wrappers remain internal.
v2.0.8 adds `captureNumericalOffenseSnapshot` and `captureCalculationSnapshot`
through `@rpg/core/kernel`. They validate closed numerical data, clone the whole
graph once and deeply freeze the detached result, preserving shared aliases
within it. Context labels convey no gameplay authority; RNG stays at calculator
invocation. Legacy default mutable aliases and trusted Root S0 identity/timing
remain unchanged. See the [snapshot extraction review](docs/v2/2.0.8-calculation-snapshot-context-extraction.md).
The exact module-10 preservation amendment was approved by Developer on 2026-10-18.

v2.0.7 implements `calculateResourceTransition`, `normalizeResource` and
`calculateResourceRegeneration` through `@rpg/core/kernel`, using the existing
six resource contracts. Legacy Combat/Stats delegate arithmetic and retain their
validation/results; Skills still owns resource writes, costs and recovery amount
resolution. Allowed above-max increases can normalize downward with negative
`applied`; damage applied is not universally net resource change. Regen retains
precision 12 and living fractions. The Developer approved the exact preservation
amendment for modules 8/12 on 2026-10-18; see [the resource review](docs/v2/2.0.7-resource-calculation-extraction.md).

The inherited `SkillEffectRuntime` container shape is preserved; applications
should operate it through lifecycle APIs, rather than mutate its stores.

## Ownership and supported mechanics

Core owns combat stats, modifiers, damage/defense, combat/action state, skill
admission/cost/cooldown/execution, gameplay effects and deterministic simulation
contracts. Supported delivery is direct hit, melee, projectile, instant AoE,
timed AoE sequence, timed projectile emitter and on-hit DoT. Effect lifecycle
supports stack/refresh/expire, modifiers, stun and silence. Slow uses the existing
movement speed modifier; it is not a new restriction or movement engine.

Applications own inventory/item ownership, persistence, class/skill content,
map/zone content, sessions, AI/auto-combat, rewards/loot, progression, networking,
UI/rendering and assets. Grid DDA/range are geometry helpers: callers supply
collision cells and adapt coordinates. No new game loop or scheduler is included.

Use `collectActiveModifiers` with application-owned source instance IDs, merge
`EffectLifecycle.modifiers(target)`, then call `prepareModifierResolver` and
`resolveCharacterStats`. Effective Stats are derived, never a second base store.
`snapshotActorDamage` snapshots offense at mechanic-owned time; defense remains
live. Emitted DoT/projectiles survive caster defeat; session end disposes them.
Applications supply deterministic ordering, clock, RNG and event wiring.

v1.1.1 adds explicit root-offense opt-in: create the existing effect runtime with
`{offenseMode:'root'}` as its third argument, and supply `rootOffense: {runtime,
capture}` on the execution environment. Core binds one immutable offensive input
snapshot at successful cast start; existing deliveries derive their own component
damage from it. Default legacy capture timing is unchanged. See the
[contract and evidence](docs/RPG_CORE_V1.1.1_ROOT_SNAPSHOT.md) and
[public-package recipe](examples/root-snapshot.ts). This is snapshot inheritance,
not child Skill lifecycle or nested execution.

Existing formulas, caps, B0/B1, critical/dodge, armor/MR, snapshot timing and
execution behavior are preserved. Fallback configuration seeds provide numeric
compatibility, not a mandatory balance model. Defense rating coefficients must
be supplied to activate rating formulas. Elemental stats remain disabled under
the existing version >=2 contract; reserved IDs do not imply mechanics support.

## Explicit Healing

`applyEntityHealing(currentHp, healAmount, effectiveMaxHp)` from `@rpg/core/combat`
(or the root entrypoint) returns `{before, after, appliedHealing}` without mutation.
Inputs must be finite/nonnegative and HP must not exceed Max HP. Zero HP stays zero.
Skill effects opt in with `{type:'heal', target:'self'|'selected', amount:100}`;
amount must be finite and in `(0, 1000000]`. Only self/ally targets are eligible.
Optional effect-level relations can restrict that set. Self heals the caster even
when the Root selects an enemy; selected requires an entity/self target and existing
range/LOS validation. Live Max HP comes from the caller's existing stat resolver.
The dispatcher commits HP before emitting `healing-applied`, only for actual recovery.
Healing uses no Damage/Crit/Dodge/RNG, causes no OnHit/OnKill, and adds no cast cost.

The additive `heal` effect and `healing-applied` event discriminants require new
cases in consumers that exhaustively switch over those public unions. Lifesteal,
Mana-on-Hit, HoT, resurrection, percent/scaled/area healing remain outside v1.2.0.

## Compatibility and provenance

`PlayerStatsConfig`/`PlayerStat` names, the `player | monster` entity type,
`setting | item` legacy damage sources, Normal/Elite/Boss categories, targeting
configuration and grid representation remain unchanged. Extending these contracts
requires a separate reviewed proposal; this task does not silently generalize
their semantics. See [the current architecture](docs/ARCHITECTURE.md) and the
[historical refactor audit](docs/architecture-audit.md).

Original `src/shared/data/*` and `src/shared/game/*` modules are deprecated,
re-export-only source compatibility paths. They contain no duplicate engine.
Tests read the canonical domain modules. Consumers of the old repository-relative
source paths can migrate incrementally using [module-map.json](docs/module-map.json).
Build also generates re-export-only forwarders for the original documented
`dist/src/shared/...` paths, preserving existing repository-relative compiled
imports. The supported package API is `@rpg/core` and its listed entrypoints;
no legacy deep package path is exported.

`VERSION` (`v1.0-snapshot-20261013-b`) and `EXPORT-MANIFEST.json` are retained
unchanged as **historical snapshot provenance**. The manifest's original paths,
hashes and `CANDIDATE_PENDING_INDEPENDENT_VALIDATION` status describe that snapshot,
not the refactored tree, package version or an official release. The preservation
baseline pins reviewed commit `c5878d92e198acd19289f568a2ddeda5096d83e7` separately.

There is no source LICENSE in this repository. This refactor adds no license or
commercial redistribution grant and makes no ownership determination. No source
files/images from the read-only JX1M checkout were copied. Grid traversal was
locally implemented with behavior informed by earlier research; this is not a
claim that all pre-existing code has clean-room legal provenance. Build dependency
licenses remain their own: TypeScript Apache-2.0, Vitest MIT, @types/node MIT;
transitive packages are restored by npm, not vendored.

Trigger intents are opt-in through `SkillExecutionEnvironment.triggers`, using a
`pinSkillTriggerBundle` of existing immutable instance definition pins. v1.1.3
supports projectile entity-contact OnImpact and natural Skill lifetime OnExpire;
accepted intents do not execute children. See the [contract and evidence](docs/RPG_CORE_V1.1.3_TRIGGER_SAFETY.md)
and [installed-package example](examples/skill-trigger.ts).


v1.1.6 extends the existing opt-in trigger bundle with canonical landed `OnHit`,
fatal-transition `OnKill` and Skill-Apply rising-edge `OnStackThreshold`, plus a
source-scoped stack predicate and explicit immediate exact-N consume into Child
admission. See [contract, limits and DoT attribution gap](docs/RPG_CORE_V1.1.6_CONDITIONAL_TRIGGERS.md)
and [installed-package example](examples/conditional-triggers.ts). Legacy defaults
and EffectLifecycle Apply remain unchanged.
