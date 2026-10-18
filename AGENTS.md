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

## Kernel migration boundary

- `src/kernel/**` owns reusable RPG calculations only. v2.0.3 moves canonical
  attribute/stat/cooldown calculations here with a prepared numerical resolver
  callback. The approved v2.0.4 cut moves modifier identity/dedup/order/grouping
  and numerical aggregation into Kernel; its preservation checkpoint is approved.
  Legacy retains validation, condition support, source activation and damage/tag
  vocabulary. The approved v2.0.5 cut delegates numerical B0/B1 to Kernel, with
  synchronous live numerical accessors; its preservation checkpoint is approved.
  The approved v2.0.6 implementation delegates numerical Hit, Critical and rating
  mitigation to Kernel; its exact preservation checkpoint was approved on
  2026-10-18 for modules 10/11. Legacy
  retains eligibility, validation, rule selection, RNG provision, diagnostics and
  snapshots. Live accessors preserve captured coefficients and late actor reads;
  Dodge callbacks are unbound, while Legacy Critical preserves its input receiver.
  The approved v2.0.7 cut delegates resource transitions, normalization and regen
  to Kernel; the exact modules 8/12 preservation amendment was approved on 2026-10-18.
  Legacy keeps validation, policy mapping and lazy accessors. Skills keeps percentage/lifesteal
  amounts, MP costs, resource writes and events; do not move those in this cut.
  Further extraction requires approved plans.
  Transform callbacks are caller-owned synchronous pure numeric functions;
  snapshots contain no callbacks. TypeScript readonly is neither detached copy
  nor runtime freeze; v2.0.8 owns implementation of those guarantees.
- Kernel may depend only on other Kernel files, never Legacy contracts, root/domain
  barrels, Skills, Mechanics, Spatial, gameplay runtimes, external packages or Node APIs.
  This applies to runtime and type dependencies, re-exports and dynamic loading.
- Gameplay-only features are not automatically Kernel capability gaps. Propose a
  Kernel upgrade only for a genuinely missing calculation primitive or numerical rule;
  new gameplay/skill systems remain independent of the Legacy Skill Engine.
- Legacy retains its public API, canonical implementations and runtime behavior until
  an approved Extract & Delegate step moves a calculation once into Kernel. Do not
  introduce alternative calculation implementations outside Kernel or duplicate engines.
- Existing v1 policies continue to govern Legacy. See the
  [Kernel Foundation contract](docs/v2/2.0.1-kernel-foundation.md).

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
