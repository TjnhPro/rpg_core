# Phase 2 cleanup audit

Reviewed baseline: `main@8176acb` (merged PR #1), scope only this repository.
The inventory below classifies **every baseline tracked file**; new files and
ignored artifacts follow. Evidence comes from source imports/call sites, explicit
public barrels/package exports, fixture consumers, package scripts/CI and running
baseline/full verification. Public API deletion cannot be justified by absence of
in-repository callers: private downstream consumers are not discoverable here.

## Decisions implemented

- **REMOVE:** remove the mixed `tests/game/core-portable.test.ts` path after retaining
  its four actual cases in Stats, Damage (two parameterized cases) and Combat tests.
  No production code was proven unused, so no production implementation/API was deleted.
- **CONSOLIDATE:** remove the fixture's second hard-coded canonical module registry;
  the existing reviewed `docs/module-map.json` is now its source. Keep the tiny reader
  because module-specific architecture assertions still consume it.
- Group tests by owning contract (Effects/Skills) and cross-domain Integration;
  share fixtures at `tests/fixtures`. This follows the mixed-test split and makes
  targeted commands/selectable ownership meaningful. Assertions and test inputs
  stay unchanged except import paths; the suite goes from 144 to 162 cases.
- Make `ARCHITECTURE.md` the current reference and retain the old audit as historical
  evidence. README and AGENTS link it rather than duplicate another current guide.
- Preserve all canonical code, explicit APIs, 27 source shims, generated legacy paths,
  package metadata, historical fingerprints/map/manifest/version and pinned example hash.

**REVIEW REQUIRED:** deleting or changing any exported API, inherited schema/name,
legacy source/compiled path or provenance file requires downstream/compatibility
review. No such change was implemented. Three contract-only type cycles remain;
there are no runtime cycles. Existing defaults/disabled elemental contracts remain
unchanged. Whole-module fingerprint copy detection and exact forwarder checks are
useful guards, not proof against all semantically equivalent duplicate code.

## Baseline file inventory

Each row is a disposition; moved tests are retained evidence, not discarded tests.
Every canonical module is reachable through public exports or actual implementation
imports. Internal kernels remain necessary call dependencies, not unsupported new APIs.

| Baseline object | Classification | Evidence / disposition |
| --- | --- | --- |
| `.github/workflows/ci.yml` | KEEP | Runs the same verification on push/PR, Node 22.13.0 and 24; no delivery workflow. |
| `.gitignore` | KEEP | Excludes regenerated build/dependency/archive artifacts. |
| `EXPORT-MANIFEST.json` | PRESERVE FOR COMPATIBILITY | Historical snapshot provenance, not current-tree hashes or release status; unchanged. |
| `README.md` | KEEP | Package/install commands and ownership; links current architecture and historical report. |
| `VERSION` | PRESERVE FOR COMPATIBILITY | Historical snapshot identifier, separate from package version; unchanged. |
| `docs/architecture-audit.md` | CONSOLIDATE | Retain historical Phase 1 evidence; current authority explicitly moved to ARCHITECTURE.md. |
| `docs/behavior-baseline.json` | PRESERVE FOR COMPATIBILITY | Read by check-preservation; original declaration fingerprints lock maintenance behavior. |
| `docs/module-map.json` | PRESERVE FOR COMPATIBILITY | Read by legacy build, architecture checker, external consumer and source fixture; migration map. |
| `examples/headless.ts` | KEEP | Actual package-import combat recipe; compiled separately and copied to external consumer. |
| `examples/run.mjs` | KEEP | Asserts repeatable result, exact hash and terminal cleanup. |
| `package-lock.json` | KEEP | Pinned reproducible toolchain; no dependency change. |
| `package.json` | PRESERVE FOR COMPATIBILITY | Root/nine domain exports, private package files/engines/scripts; unchanged. |
| `scripts/behavior-fingerprint.mjs` | KEEP | Token-based declaration hashing reused by preservation and copy detection. |
| `scripts/check-architecture.mjs` | KEEP | Enforces domain imports/runtime cycles; close demonstrated loading/shim/copy gaps with regression tests. |
| `scripts/check-preservation.mjs` | PRESERVE FOR COMPATIBILITY | Historical declarations and compiled legacy namespace identity; unchanged. |
| `scripts/clean.mjs` | KEEP | Build removes only its generated output before compilation. |
| `scripts/consumer-smoke.mjs` | KEEP | External archive install, strict TS, native ESM and deep-import gates; add archived legacy verification. |
| `scripts/legacy-build-paths.mjs` | PRESERVE FOR COMPATIBILITY | Build still requires original dist/src/shared JS and declaration forwarders. |
| `src/combat/combat-entity.ts` | KEEP | Canonical combat ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/combat/combat-state.ts` | KEEP | Canonical combat ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/combat/index.ts` | PRESERVE FOR COMPATIBILITY | Explicit public domain barrel; package export and external ESM/type checks, unchanged. |
| `src/contracts/combat-entity.ts` | KEEP | Canonical contracts ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/contracts/combat-modifiers.ts` | KEEP | Canonical contracts ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/contracts/combat-state.ts` | KEEP | Canonical contracts ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/contracts/damage-contracts.ts` | KEEP | Canonical contracts ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/contracts/defense-settings.ts` | KEEP | Canonical contracts ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/contracts/dot-contracts.ts` | KEEP | Canonical contracts ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/contracts/effects.ts` | KEEP | Canonical contracts ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/contracts/index.ts` | PRESERVE FOR COMPATIBILITY | Explicit public domain barrel; package export and external ESM/type checks, unchanged. |
| `src/contracts/mechanic-contracts.ts` | KEEP | Canonical contracts ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/contracts/spatial.ts` | KEEP | Canonical contracts ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/contracts/stat-contracts.ts` | KEEP | Canonical contracts ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/contracts/targeting-contracts.ts` | KEEP | Canonical contracts ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/damage/damage-core.ts` | KEEP | Canonical damage ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/damage/defense-engine.ts` | KEEP | Canonical damage ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/damage/index.ts` | PRESERVE FOR COMPATIBILITY | Explicit public domain barrel; package export and external ESM/type checks, unchanged. |
| `src/effects/dot-core.ts` | KEEP | Canonical effects ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/effects/effect-lifecycle.ts` | KEEP | Canonical effects ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/effects/effect-system.ts` | KEEP | Canonical effects ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/effects/index.ts` | PRESERVE FOR COMPATIBILITY | Explicit public domain barrel; package export and external ESM/type checks, unchanged. |
| `src/index.ts` | PRESERVE FOR COMPATIBILITY | Explicit supported root API; unchanged and externally exercised. |
| `src/mechanics/aoe-sequence-core.ts` | KEEP | Canonical mechanics ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/mechanics/emitter-core.ts` | KEEP | Canonical mechanics ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/mechanics/index.ts` | PRESERVE FOR COMPATIBILITY | Explicit public domain barrel; package export and external ESM/type checks, unchanged. |
| `src/mechanics/instant-aoe.ts` | KEEP | Canonical mechanics ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/mechanics/melee-hitbox.ts` | KEEP | Canonical mechanics ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/mechanics/projectile.ts` | KEEP | Canonical mechanics ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/modifiers/index.ts` | PRESERVE FOR COMPATIBILITY | Explicit public domain barrel; package export and external ESM/type checks, unchanged. |
| `src/modifiers/modifier-core.ts` | KEEP | Canonical modifiers ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/shared/data/combat-modifiers.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/data/damage-contracts.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/data/defense-settings.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/data/dot-contracts.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/data/mechanic-contracts.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/data/skill-effects.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/data/stat-contracts.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/data/targeting-contracts.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/aoe-sequence-core.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/combat-entity.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/combat-state.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/damage-core.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/defense-engine.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/dot-core.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/effect-lifecycle.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/effect-system.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/emitter-core.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/grid-geometry.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/instant-aoe.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/melee-hitbox.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/modifier-core.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/projectile.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/range.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/skill-effect-integration.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/skill-engine.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/skill-execution.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/shared/game/stat-calculation.ts` | PRESERVE FOR COMPATIBILITY | Registered in module-map; exact source forwarder and compiled identity enforced; no duplicate implementation. |
| `src/skills/index.ts` | PRESERVE FOR COMPATIBILITY | Explicit public domain barrel; package export and external ESM/type checks, unchanged. |
| `src/skills/skill-effect-integration.ts` | KEEP | Canonical skills ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/skills/skill-effects.ts` | KEEP | Canonical skills ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/skills/skill-engine.ts` | KEEP | Canonical skills ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/skills/skill-execution.ts` | KEEP | Canonical skills ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/spatial/grid-geometry.ts` | KEEP | Canonical spatial ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/spatial/index.ts` | PRESERVE FOR COMPATIBILITY | Explicit public domain barrel; package export and external ESM/type checks, unchanged. |
| `src/spatial/range.ts` | KEEP | Canonical spatial ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `src/stats/index.ts` | PRESERVE FOR COMPATIBILITY | Explicit public domain barrel; package export and external ESM/type checks, unchanged. |
| `src/stats/stat-calculation.ts` | KEEP | Canonical stats ownership per ARCHITECTURE; referenced by domain imports/barrels and Core tests; declarations unchanged. |
| `tests/game/core-portable.test.ts` | REMOVE | Superseded mixed file: all four cases retained in tests/stats, tests/damage and tests/combat; no consumer references. |
| `tests/game/effect-integration.test.ts` | KEEP | Retain all cases in tests/integration/effect-integration.test.ts; contract evidence located in coverage matrix. |
| `tests/game/effect-lifecycle.test.ts` | KEEP | Retain all cases in tests/effects/effect-lifecycle.test.ts; contract evidence located in coverage matrix. |
| `tests/game/effect-modifiers.test.ts` | KEEP | Retain all cases in tests/effects/effect-modifiers.test.ts; contract evidence located in coverage matrix. |
| `tests/game/effect-stacking.test.ts` | KEEP | Retain all cases in tests/effects/effect-stacking.test.ts; contract evidence located in coverage matrix. |
| `tests/game/effect-system.test.ts` | KEEP | Retain all cases in tests/effects/effect-system.test.ts; contract evidence located in coverage matrix. |
| `tests/game/fixtures/skill-core.ts` | KEEP | Move to tests/fixtures; caller inputs use actual stats/damage/skills/effects, shared by integrations. |
| `tests/game/fixtures/skill-timeline.ts` | KEEP | Move to tests/fixtures; boundary/event wiring for integrations, not a replacement simulation engine. |
| `tests/game/fixtures/source.ts` | CONSOLIDATE | Move to tests/fixtures/source.ts; remove duplicate hard-coded path registry and read module-map.json. |
| `tests/game/rpg-core-integration.test.ts` | KEEP | Retain all cases in tests/integration/rpg-core-integration.test.ts; contract evidence located in coverage matrix. |
| `tests/game/skill-effect-integration.test.ts` | KEEP | Retain all cases in tests/integration/skill-effect-integration.test.ts; contract evidence located in coverage matrix. |
| `tests/game/skill-engine.test.ts` | KEEP | Retain all cases in tests/skills/skill-engine.test.ts; contract evidence located in coverage matrix. |
| `tests/game/skill-execution.test.ts` | KEEP | Retain all cases in tests/skills/skill-execution.test.ts; contract evidence located in coverage matrix. |
| `tests/game/skill-integration.test.ts` | KEEP | Retain all cases in tests/integration/skill-integration.test.ts; contract evidence located in coverage matrix. |
| `tests/game/status-restrictions.test.ts` | KEEP | Retain all cases in tests/integration/status-restrictions.test.ts; contract evidence located in coverage matrix. |
| `tsconfig.examples.json` | KEEP | Separately compiles package-based examples used by example verification. |
| `tsconfig.json` | KEEP | Strict ES2022 NodeNext declarations/Core build; no ambient Node types. |
| `tsconfig.tests.json` | KEEP | Checks canonical source/tests/examples with test-only Node types. |
| `vitest.config.ts` | KEEP | Expand discovery to domain folders; retain single-worker deterministic isolation. |

## Added evidence and ignored artifacts

| Object | Classification | Responsibility |
| --- | --- | --- |
| `AGENTS.md` | KEEP | Concise repository instructions and real commands. |
| `docs/ARCHITECTURE.md` | KEEP | Current architecture/ownership/API/execution/extension reference. |
| `docs/test-coverage.md` | KEEP | Domain contracts with concrete test locations and limits. |
| `docs/cleanup-audit.md` | KEEP | This bounded audit of baseline/new/generated objects. |
| `tests/stats/stat-calculation.test.ts` | KEEP | Original stats case plus two resource boundary/invalid cases. |
| `tests/combat/combat-entity.test.ts` | KEEP | Original generic entity/exactly-once HP case. |
| `tests/damage/damage-core.test.ts` | KEEP | Original two Physical/Magic numeric cases. |
| `tests/damage/defense-engine.test.ts` | KEEP | Four direct mitigation/Dodge/failure cases. |
| `tests/modifiers/modifier-core.test.ts` | KEEP | Three source identity/order/invalid calculation cases. |
| `tests/spatial/grid-geometry.test.ts` | KEEP | Four traversal/range boundary cases. |
| `tests/tooling/architecture.test.ts` | KEEP | Five adversarial checker cases against temporary source trees. |
| `dist/**` | KEEP (generated, ignored) | Canonical JS/declarations and maps, compiled source shims, plus `dist/src/shared/**` legacy forwarders. Rebuild, do not hand-edit or commit. |
| `.example-dist/**` | KEEP (generated, ignored) | Separate example output used by runner. Rebuilt by build:examples. |
| `node_modules/**` | KEEP (installed, ignored) | Lockfile-restored dev toolchain; never canonical/vendor source. |
| `coverage/**`, `*.tgz` | KEEP (if generated, ignored) | Optional reports/pack archives, not source; consumer archive lives in a temporary directory and is removed. Neither was a tracked baseline object. |
| `.git/**` | KEEP | Repository metadata; outside source cleanup. |

No assets, UI/runtime code, duplicate canonical engines, unused tracked build artifacts
or vendored dependencies were found. Exact archived compatibility paths are now
verified outside the repository, rather than relying only on local `dist` existence.
No contracts, formulas, effects, costs, cooldowns, timing, exports, dependency versions,
manifest/version or behavior-baseline values changed. Remote CI results belong to the
PR checks; local acceptance is full `npm run verify`, not schema validation alone.
