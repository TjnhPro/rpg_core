# RPG Core

v1.1.7 adds opt-in immutable Skill Configuration upgrades before cast admission.
See [Skill Modifier & Upgrade contract and evidence](docs/RPG_CORE_V1.1.7_SKILL_UPGRADES.md).

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

Delivery scheduling kernels, freeze helpers and debug wrappers remain internal.
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
