# Working in RPG Core

Generic, headless TypeScript RPG library (`@rpg/core`), independent of any specific
game, including JX1. This repository owns mechanics, not a Game Runtime or editor.

## First read

Read [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), the relevant
`src/<domain>/index.ts` public API and its tests. A small task does not require a
full repository read. [The coverage matrix](docs/test-coverage.md) locates evidence.

## Mandatory plan and human review

Every task changing source, mechanics, contracts or architecture requires a plan
approved by the user **before implementation**. Agents may audit, research and
propose a plan, but must never approve their own plan. Do not expand task scope
when difficulties arise; report the obstacle and wait for the user's decision.
Never automatically merge a PR.

## Core capability gaps and no workarounds

When a required mechanic is unsupported (for example, Lifesteal or Mana On-Hit):

1. Inspect the existing public APIs.
2. Report `CORE_CAPABILITY_GAP`, naming the missing mechanic, affected domains and
   why the current APIs cannot satisfy it.
3. Mark the dependent work `BLOCKED` and wait for the user to approve a Core upgrade
   plan. Never implement the missing mechanic without that approval.

In any repository, do not create substitute Damage Engines, Skill Engines, Effect
Engines, Resource Logic or gameplay implementations. Do not change formulas,
remove validation or write separate logic just to make tests pass. A workaround
must never turn `BLOCKED` into `READY`.

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

Report task completion using only these statuses:

- `READY`: Implemented according to the user-approved plan and verified.
- `PARTIAL`: Completed the authorized portion; identify the remaining work.
- `BLOCKED`: Requires a user decision or a new Core capability; identify the dependency.

Report changed files and reasons, public API and compatibility impact, commands
executed/results and remaining issues. Do not publish packages, create releases,
or change licensing unless explicitly requested. Never automatically merge a PR.
