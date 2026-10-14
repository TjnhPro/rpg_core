# Architecture and compatibility audit

Reviewed baseline: `c5878d92e198acd19289f568a2ddeda5096d83e7`.
Scope: the 27 Core source modules, all 12 existing test files and their fixtures,
headless example/runner, package/lockfile, TypeScript/Vitest configs and export
manifest. Ownership is based on imports, contracts and execution behavior.

## Module ownership and dependency direction

| Domain | Canonical modules | Dependencies |
| --- | --- | --- |
| Contracts | stat, modifier, damage, defense, DoT, mechanic, targeting contracts; extracted entity, combat, effect, spatial types | Other contracts only; no execution imports |
| Stats | stat-calculation | Contracts; modifier resolver type |
| Modifiers | modifier-core | Contracts |
| Combat | combat-entity, combat-state | Contracts; coordinate type |
| Damage | damage-core, defense-engine | Contracts, modifier resolver, entity identity type |
| Effects | effect-system, effect-lifecycle, dot-core | Contracts, Combat validation; DoT uses Damage and Modifiers |
| Mechanics | melee-hitbox, projectile, instant-aoe, emitter-core, aoe-sequence-core | Contracts and Spatial |
| Spatial | grid-geometry, range | Coordinate/grid contracts |
| Skills | skill-effects, skill-engine, skill-execution, skill-effect-integration | Contracts and lower domains; integration composes existing mechanics/effects/damage |

The root/domain barrels expose named integration APIs, types and configuration
validators. No canonical implementation imports a public barrel or compatibility
shim. `scripts/check-architecture.mjs` parses imports/re-exports with TypeScript,
separates type-only edges from runtime edges, rejects external imports and invalid
domain directions, and rejects runtime cycles. Its output lists retained type
cycles. Package exports are an allowlist; consumer checks verify all entrypoints
and that implementation paths cannot be resolved through the package name.

Originally `shared/data/damage-contracts` and `targeting-contracts` imported
execution-layer types. `shared/data/skill-effects` also imported runtime validators
from Combat/Effects. Entity, combat, effect and spatial types now live in Contracts;
skill effect validation now lives in Skills, above the validators it composes.
`effect-system` keeps only definition/reference validation, and `effect-lifecycle`
keeps the existing active owner. Combat/Stats/Modifiers do not depend on Skills.
DoT's dependency on Damage is intentional; EffectLifecycle does not import Damage,
DoT, stat resolution, skill dispatch or a scheduler.

No runtime import cycles were found. Type cycles remain within configuration
contracts: entity/stats/damage identity, damage/mechanic/DoT definitions, and
entity/stats/targeting/combat context. They express existing recursive shapes and
are erased at compilation. External strict TypeScript compilation verifies their
declarations. Splitting or redesigning the configuration object just to remove
these type cycles would enlarge the task without solving a runtime problem.

## Responsibility overlap and implementation preservation

Legacy DamageModifier and CombatModifier are distinct versioned contracts:
the former resolves option-based legacy B1 settings; the latter resolves active
instance contributions and newer flat/percentage-point rules. They are not a
second Damage engine and cannot be merged without semantics changes. Stats,
damage, skill cost/cooldown, delivery and effect lifecycle each keep their existing
owner. DoT remains separate from modifier effect duration/stack policy.
Existing freeze/shape-check helpers remain local; consolidating them is not needed
for package reuse. No new manager, scheduler, ECS or second combat engine is added.

Every original path forwards to a single canonical module. Module moves and type
extraction preserve all top-level declarations, including private functions,
formulas, signatures, validation fields and constants. `behavior-baseline.json`
records declaration token fingerprints captured from the reviewed commit; the
preservation script compares canonical modules plus extracted types, ignoring
only comments, whitespace and import/re-export paths. The headless runner checks
both repeatability and a full-result SHA-256 captured before the refactor:
`29e8dbe79332a34a6760628aebfa157e5788a5750038183de558310fa9102656`.
This complements the existing behavior tests; it is not a new implementation.

## Legacy assumptions and decisions

| Contract | Finding | Decision |
| --- | --- | --- |
| PlayerStatsConfig / PlayerStat | Legacy names, but actor-independent formulas; optional targeting configuration contains player/monster labels | Keep names, fields and seeds; callers supply configuration; no rename required to reuse |
| CombatEntity.entityType | Validator truly restricts values to player/monster; damage/defense do not branch on the kind | Keep the restriction for compatibility; a broader actor kind needs separate contract approval |
| DamageModifier.source = item | Actual option-based B1 behavior, with already-resolved values supplied by the caller | Keep semantics; Core owns calculation, Game owns inventory/equipment lookup |
| DamageContext categories / statuses / tags | Closed existing gameplay categories and validation; defender tags derive Boss/Elite outcomes | Keep categories and labels; extension is a behavior/contract proposal, not a folder refactor |
| TargetingSettings | Legacy faction/content-shaped optional config; execution uses caller-provided CombatValidationContext | Retain for compatibility; do not move game persistence or content into Core |
| Walkability / MapPoint | Cell strings use 1 for walkable, columns/rows, uniform cellSize, row indexed y; wall/corner rules affect combat contacts | Preserve units, origin and DDA/corner semantics; host maps coordinates/collision data |
| Modifier sources | Setting/equipment/buff/passive identify calculation contributions, not ownership stores | Keep identities and deterministic collection; lifecycle/persistence remain caller-owned |

Proposed future changes, **not implemented**: a wider entity kind contract,
application-defined damage categories, or generic faction-content configuration.
Each needs migration/validator impact review and dedicated behavior tests. Existing
mandatory fields are not made optional and no accepted/rejected data shape changes.

## Public and internal boundary

Root `src/index.ts` combines explicit domain barrels. Public definitions and
validators serve content authoring; execution functions serve the game runtime.
Public effect group views/stat details support inspection without importing engine
files. Low-level delivery kernels, RNG helper, clone/freeze helpers, action-slot
sanitizer and debug wrappers are not public exports. Existing runtime container
types are preserved, including their inherited fields; this task does not introduce
opaque handles or a breaking state ownership redesign.

Source compatibility shims are retained for existing repository-relative imports.
The baseline was a private source snapshot with no public entrypoint/exports;
there was no published deep-import package contract to preserve. New entrypoints
emit under `dist`, while generated re-export-only `dist/src/shared` forwarders
preserve the original documented repository-relative compiled imports. Preservation
checks also import these forwarders and compare them to their canonical modules.
Applications should migrate to package imports.
No license or npm publication is introduced. The historical manifest remains
byte-for-byte unchanged and is not treated as a current-tree inventory.

## Verification and changed files

Baseline: clean install, build, test typecheck, **144/144 tests in 12 files** and
headless PASS (target HP 70, 2 effect events, seed 73, deterministic, cleanup).
After refactoring the same tests remain intact except import/source-boundary paths;
the exact dependency assertions now read canonical implementations.

Required verification is automated by `npm run verify` and the GitHub workflow:
clean `npm ci`, Core build/typecheck, tests/examples typecheck, architecture and
preservation checks, existing tests, deterministic headless runner, npm pack,
external consumer installation, strict declaration compilation and ESM execution.
Consumer compilation has no original repository imports, no ambient Node types
and no skipLibCheck. Package contents are checked for compiled entrypoints and
exclusion of source/tests/examples/dependencies. Consumer artifacts are temporary.

Changes: canonical modules/domain entrypoints under `src/{contracts,stats,modifiers,
combat,damage,skills,effects,mechanics,spatial}`, `src/index.ts`, original-path shims,
existing test/fixture imports, source-reading helper, public-import headless example,
runner hash check, package/lockfile, TypeScript configs, `.gitignore`, minimal
`.github/workflows/ci.yml`, verification scripts and README/audit/baseline/module map.
`module-map.json` records each original-to-canonical path. No formula/content,
Game Client/Server/Manager-Editor files, assets, new mechanics or license are changed.

Local verification evidence and remote Actions results belong to the PR and
completion report. Passing checks make this a verified refactor candidate for
review; they do not designate an official stable release or product acceptance.
