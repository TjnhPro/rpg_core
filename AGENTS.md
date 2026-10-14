# Working in RPG Core

Generic, headless TypeScript RPG library (`@rpg/core`), independent of any specific
game, including JX1. This repository owns mechanics, not a Game Runtime or editor.

## First read

Read [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), the relevant
`src/<domain>/index.ts` public API and its tests. A small task does not require a
full repository read. [The coverage matrix](docs/test-coverage.md) locates evidence.

## Source rules

- Keep one canonical implementation per mechanic under its owning domain. Prefer
  existing APIs; do not duplicate engines or introduce game-specific policies.
- Respect the dependencies documented in ARCHITECTURE and enforced by the checker.
  Core takes caller clocks, RNG, entities and content; it does not own UI, assets,
  inventory, persistence, networking or the application loop.
- Consumer code imports `@rpg/core` or a listed public domain entrypoint, never
  internal modules. Internal Core/tests may import canonical domain source.
- `src/shared/**` contains deprecated forwarders only. Preserve those paths and
  generated `dist/src/shared/**`; do not edit them as implementations.
- Do not silently change schemas, formulas, effects, costs, cooldowns or timing.
  Public/legacy contract changes require an explicitly reviewed compatibility plan.
- Keep historical provenance intact. For approved future behavior changes, follow
  the preservation-baseline policy in ARCHITECTURE; do not bypass the check.

## Verification

Use Node >=22.13.0; install with `npm ci --ignore-scripts`.

| Command | Purpose |
| --- | --- |
| `npm run build` | Core JS, declarations and legacy compiled forwarders |
| `npm run typecheck` | Core and test types |
| `npm test` | All Core and tooling tests; filter with `npm test -- tests/damage` |
| `npm run example` | Compile/run the deterministic headless example |
| `npm run check:architecture` | Domain edges, duplicate declarations, legacy shims, runtime cycles |
| `npm run check:preservation` | Reviewed declaration fingerprints and legacy runtime identity; build first |
| `npm run test:consumer` | Pack/install externally; verify types, ESM and compatibility |
| `npm run verify` | All of the above, including example compilation |

Domain changes require relevant Core tests. Public API changes require consumer
verification; architecture changes require architecture checks. Intentional behavior
changes need targeted evidence for the changed contract. Run full `verify` before
delivery. Use actual Core implementations in integration tests, with deterministic
caller adapters; no assets or Game Runtime dependencies.

## Delivery

Report changed files and reasons, public API and compatibility impact, commands
executed/results and remaining issues. Do not publish packages, create releases,
change licensing or merge a PR unless explicitly requested.
