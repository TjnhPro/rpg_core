# Core test coverage matrix

Phase 2 baseline: `8176acb` (144 tests). Current suite: 162 tests in 18 files.
This is a contract/evidence matrix, not a line-coverage or balance certification.
All existing cases survive the domain organization; 18 focused cases were added.

| Domain | Verified contract | Evidence | Phase 2 change / limits |
| --- | --- | --- | --- |
| Stats | Attributes → derived scaling, caps, source dedup, absolute resources | `tests/stats/stat-calculation.test.ts`; actual stat adapter in `tests/skills/skill-execution.test.ts` | Split original mixed test; add initialization, changed maxima, dead actor/no regen, living fraction, invalid resources. Not an exhaustive configuration cross-product. |
| Modifiers | Flat → summed Percent → points, stable ordering, explicit active sources, source-instance dedup | `tests/modifiers/modifier-core.test.ts`, `tests/effects/effect-modifiers.test.ts` | Add reversed ordering, conflict rejection, distinct identities, inactive passives, disabled sources, invalid contributions/nonfinite results. |
| Damage | Physical/Magic B0/B1, Crit, live mitigation, snapshot offense | `tests/damage/damage-core.test.ts`; skill-effect and RPG integrations | Original numeric Physical/Magic tests retained; integration covers live defense/gear changes and Magic DoT. |
| Defense | Armor/MR selection, coefficients/levels/caps, Dodge threshold and no-RNG branches, invalid input | `tests/damage/defense-engine.test.ts`; delivery integration tests | Add direct boundary/failure tests; missing config stays an observable no-mitigation result. |
| Combat | Entity/HP transition, target/faction admission, actions, restriction/defeat cancellation | `tests/combat/combat-entity.test.ts`, `tests/skills`, `tests/integration/status-restrictions.test.ts` | Original exactly-once defeat test retained; full state/target/cancel evidence remains in actual-Core skill/restriction scenarios. |
| Skills | Invalid admission causes no mutation; cost/cooldown commit, serial replay, zero/100% activation, cancellation | `tests/skills/skill-engine.test.ts`, `skill-execution.test.ts`; `tests/integration/skill-integration.test.ts` | Preserve existing evidence: no new duplicates of snapshot/cancellation/exactly-once tests. |
| Effects | Definition validation, apply, refresh, independent stacks, exact expiry, restrictions, terminal cleanup | `tests/effects` (four files); `tests/integration/effect-integration.test.ts`, `status-restrictions.test.ts` | Preserve independent contract tests and integration tests; lifecycle tests are not redundant with dispatch tests. |
| Mechanics | Melee circle/cone/rectangle, stop/pierce projectile, instant/sequence AoE, timed emitter, stacked DoT | `tests/integration/skill-effect-integration.test.ts`, `skill-integration.test.ts`, `rpg-core-integration.test.ts` | Actual dispatch/geometry/damage/DoT implementations, not a replacement engine. Mechanics are verified within delivery scenarios; no standalone duplicate matrix. |
| Spatial | LOS, exact grid boundaries, corner adjacency, range | `tests/spatial/grid-geometry.test.ts`; skill range scenarios | Add corner cutting, negative-direction endpoint, zero-length/invalid traversal and exact range boundary. |
| Integration | Skill → lifecycle/modifiers → offense/defense → HP/events, source defeat, session disposal | `tests/integration` (five files) | Multiple layers remain because each asserts different contracts; shared fixture supplies actual Core and caller wiring. |
| Determinism | Independent seeded runs, coarse/fine boundary partition, event order, exactly-once and session isolation | lifecycle/stacking tests; mixed scenarios in `tests/integration`; `examples/run.mjs` | Pinned example SHA-256 remains `29e8dbe79332a34a6760628aebfa157e5788a5750038183de558310fa9102656`. Caller must partition at real boundaries. |
| Package | Strict external TS without ambient Node, native ESM, root + nine domains, blocked deep imports | `scripts/consumer-smoke.mjs` (`npm run test:consumer`) | Add all 27 archived legacy JS/declaration paths and canonical namespace identity. Not a census of private downstream repositories. |
| Architecture | Domain edges, runtime cycles vs type cycles, forwarder-only legacy, copied canonical declarations | `scripts/check-architecture.mjs`, `tests/tooling/architecture.test.ts`; existing module-specific source guards | Add adversarial isolated source trees for dynamic/type/import-equals/require loading, empty-import cycles, external/nonliteral dependencies, duplicates and rogue legacy code. Semantic equivalence of differently written code still needs review. |

Run `npm test -- tests/<domain>` for focused cases and `npm run verify` before delivery.
`typecheck` compiles Core/tests; `example` compiles examples separately, and the
consumer compiles installed declarations with `skipLibCheck: false`. CI uses Node
22.13.0 and 24. Runtime UI, assets, animation, inventory UI, farming, login and
content balance are outside this suite's ownership.

Fixtures: `skill-core.ts` supplies entities/config/grid/RNG and calls actual stats,
damage, skills and effects; `skill-timeline.ts` composes boundary advancement and
event-driven cancellation. The small skill-execution fixture isolates action
admission without a delivery runtime. `source.ts` reads canonical paths from the
reviewed module map for narrow architecture assertions. No fake damage/lifecycle
implementation was found or added.
