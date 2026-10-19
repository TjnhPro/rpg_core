# v2.0.12 — Architecture Closure & Freeze: Gate A plan

Status: **GATE A APPROVED — IMPLEMENTATION AUTHORIZED — GATE B PENDING**.
Developer approved this exact 12-file cut on 2026-10-18, with zero production
delta expected. Freeze activation remains subject to final Developer acceptance.

Implementation note: the historical v2.0.11 reviewer has a fixed milestone
allowlist and local targeted-log requirements. Its consumer/provenance/integrity
checks are carried forward in the approved v2.0.12 reviewer against fresh installed
records; that old script and its approval history remain unchanged. Do not count
running a milestone-specific reviewer on an incompatible later file inventory as
a production/checker defect or as successful current verification.

Starting accepted revision: `994a2fc8d7d01d8200e6377bb65436b7228b3a4e`.
Branch: `audit/v2.0.0-architecture-boundaries`.
[Existing PR #6](https://github.com/TjnhPro/rpg_core/pull/6) is OPEN and unmerged;
its head equals the starting revision. The task explicitly accepts v2.0.11.
Preflight date: 2026-10-18; Node 24.18.0, TypeScript 6.0.3, Vitest 5.0.3,
@types/node 22.20.5. Package remains private `@rpg/core@1.0.0`.
Working tree was clean before this plan. No production or checker edits are
proposed. Gate A writes only this plan; ignored build/audit output stays in `.git`.

## 1. Current evidence and boundaries of the claim

Fresh preflight: build, typecheck (including tests), architecture and preservation
PASS. The actual TypeScript program contains 89 source files: 62 canonical/root
files and 27 historical forwarders. The graph appendix lists all 285 dependency
occurrences with syntax and runtime/type classification, including repeated edges.
The compiler resolves targets; graph reporting does not introduce dependency policy.
The existing checker remains the authority for allowed edges and closure rejection.

Fresh symbol/owner audit: **24 direct Legacy → Kernel sites PASS**, no type or
ownership diagnostics. Kernel source closure: 63 symbols / 17 files; emitted
public closure: 63 symbols / 16 declaration files. The internal snapshot helper
is a source dependency but is absent from the public declaration closure.
Runtime cycles: zero; the combined graph has two nontrivial SCCs, in Contracts
and Skills respectively (exact members and internal type edges in Appendix A).
The existing checker reports ten combined graph cycle
paths; each needs at least one erased type edge. These are not ten independent
strongly connected components and are not runtime cycles. Preserve the exact
accepted edges and classify SCCs in the final evidence rather than changing
source to remove historical type relationships.

The accepted v2.0.11 full verification was **1,745 tests / 56 files**, with
exact-head PR/push Node 22.13.0/24 SUCCESS. This is historical accepted evidence,
not a new v2.0.12 full test run. Gate A does not run final `npm run verify`.
Existing read-only reviews are rerun below; existing installed-run evidence is
identified separately from a new installed execution. No current package archive
hash is inferred from unchanged source: README is packed, so documentation and
platform archive metadata can change archive bytes. Within each consumer run,
all consumers must share one exact artifact and its recorded integrity.

## 2. Dependency closure

Keep the checker policy unchanged. Self-imports are permitted within each domain.
Other allowed domains are:

| Domain | Other allowed domains |
| --- | --- |
| kernel | none |
| contracts | none |
| spatial | contracts, kernel |
| modifiers | contracts, kernel |
| stats | contracts, modifiers, kernel |
| combat | contracts, spatial, kernel |
| damage | contracts, combat, modifiers, kernel |
| effects | contracts, combat, modifiers, damage, kernel |
| mechanics | contracts, spatial, kernel |
| skills | contracts, combat, stats, effects, damage, mechanics, spatial, kernel |

Root is public export assembly; shared paths are exact registered forwarders.
Kernel cannot reach root, shared, Contracts or any gameplay domain, Node built-ins,
external packages or application code through imports, type queries, re-exports,
aliases or dynamic loading. Retain rejection of invalid/nonliteral dependencies.
Reuse `checkKernelDeclarations` and `checkDeclarationClosure` for compiler-bound
source/emitted/installed traversal; never replace them with string-name blacklists.
Report the exact adjacency graph, runtime graph, domain graph, SCC members and
the erased edge(s) that break each historical combined cycle. Do not treat a
DFS path count as a complete cycle classification.

New read-only reporting will use TypeScript resolution and run the existing
checker independently. It will fail if report edges disagree with the accepted
graph or if source/installed closure fails. It will not maintain another mutable
allowed-domain table. Actual policy is referenced by checker path and content hash.

## 3. Public API and declarations

| Entrypoint | Symbols | Runtime values |
| --- | ---: | ---: |
| @rpg/core | 243 | 122 |
| @rpg/core/contracts | 102 | 41 |
| @rpg/core/stats | 17 | 10 |
| @rpg/core/modifiers | 8 | 6 |
| @rpg/core/combat | 33 | 17 |
| @rpg/core/damage | 27 | 12 |
| @rpg/core/skills | 76 | 34 |
| @rpg/core/effects | 34 | 10 |
| @rpg/core/mechanics | 20 | 11 |
| @rpg/core/spatial | 6 | 4 |
| @rpg/core/kernel | 63 | 17 |

Appendix B enumerates every exported name and its type/value classification.
Do not sum these counts as distinct symbols: domain and root exports overlap.
There are 99 Legacy declaration files, including 27 compiled historical paths;
compare each byte with isolated declaration emission from accepted Git source.
Compare all emitted Kernel declarations too, and record the smaller 16-file public
closure separately. Evidence includes per-file SHA-256 and exact symbol origin
identities, signatures, overloads, generic defaults, inferred return types and
runtime names for all eleven entrypoints. Counts alone are insufficient: replacing
one exported symbol with another must fail.

Retain native ESM namespace identity for each Legacy domain versus root and
each historical forwarder versus its canonical owner, including same function
references. Kernel remains independently importable and is not added to root.
Installed verification keeps strict NodeNext and `skipLibCheck: false`, verifies
all eleven symbol sets against source/emitted sets, checks all declaration bytes
and public runtime namespaces, and preserves deep-import rejection.

## 4. Single numerical implementation and delegation

| Canonical Kernel owner | Public APIs | Legacy facade / retained ownership |
| --- | --- | --- |
| stats/stat-calculation.ts | calculateEffectiveValue, calculateStats, calculateCooldownDurationMs | Stats adapters, mutable numerical accessors, validation and Legacy projection |
| modifiers/modifier-resolution.ts | selectCanonicalModifiers, prepareNumericalModifiers, matchesAnyTag | Modifier source activation, conditions rejection, vocabulary and eligibility |
| damage/damage-calculation.ts | calculateDamageB0, calculateDamageB1, calculateDamageBonusValue | Damage pipeline eligibility, diagnostics, Critical placement and callback provision |
| defense/defense-calculation.ts | calculateHit, calculateCritical, calculateMitigation | Defense rule selection, validation, live config adaptation, RNG and diagnostics |
| resources/resource-calculation.ts | calculateResourceTransition, normalizeResource, calculateResourceRegeneration | Combat/Stats validation, policy mapping and result projection |
| snapshots/calculation-snapshot.ts | captureNumericalOffenseSnapshot, captureCalculationSnapshot | Legacy raw offense/trust keeps its existing clone/freeze boundaries |

The snapshot public APIs use the internal `snapshots/snapshot-data.ts` primitives;
Legacy calls those primitives without acquiring closed numerical validation.
They remain internal exports, not additional public APIs. Temporary Maps/Sets for
deduplication, schema cycle checks and snapshot traversal are not runtime stores.

Appendix C lists every checked direct call, source line and resolved owner.
The existing reviewed mapping includes duplicate call occurrences, not 24 distinct
public functions. Reuse its wrapper paths and returned numerical resolver seam.
Extend evidence to show the call graph and upstream gameplay paths, not merely
the presence of import statements. Returned callbacks require runtime parity;
static symbol analysis cannot prove arbitrary dynamic callback execution.

No parallel calculator is needed. Whole-module fingerprint duplication, reviewed
delegation mappings, preserved source hashes and accepted numerical/runtime tests
provide complementary evidence. They do not prove absence of arbitrary semantic
duplicates in hypothetical future code. Do not reject all Legacy arithmetic:
Lifesteal and percent-recovery requested amounts, MP cost/deadline commitment,
skill rank policy, projectile movement, AOE geometry and queue budgets retain
their gameplay owners. Preserve lazy getters, mutation timing, nonfinite values,
floating accumulation order, errors and reference identities.

## 5. Authoritative gameplay ownership

| Responsibility | Existing owner and authority | Evidence to retain |
| --- | --- | --- |
| Action admission, serial and active action | combat/combat-state.ts; Skills requests actions | action/cooldown/MP/event trace parity |
| Definition/admission/execution/dispatch | skills/skill-engine.ts, skill-execution.ts, skill-effect-integration.ts | canonical public integration and 61 accepted-source observations |
| Root S0 capture and trust | skills/root-offense.ts; executeSkill is reviewed preparation caller | one capture, Root identity, Child inherited identity, detached public copies |
| Instance ownership and atomic children | skills/skill-instance.ts; reviewed integration admission caller | child registration atomicity, replay and disposal |
| Trigger receipts, budgets and delivery | skills/skill-trigger.ts; existing token/bundle/session/receipt/delivery stores | authentic receipts, exactly once, queue limits, recursion, replay |
| HP/MP commitment and public events | Skills integration commits canonical Combat transition results; skill-engine owns MP cost | HP/MP values, ordering, no second ledger |
| Effect lifecycle and DoT | effects/effect-lifecycle.ts and dot-core.ts | stacks/restrictions/expiry, accepted DoT bypass and live defense |
| Delivery and geometry | mechanics melee/projectile/AOE and spatial helpers | collisions, timelines, strike coordinates, coarse/fine parity |
| Numerical outputs and captured numerical data | Kernel only; no entity/session/event authority | accepted calculator goldens and independent consumers |
| Content, clock/RNG inputs, loop and services | Application | public adapters only; no Core persistence/UI/network/session scheduler |

Use existing finite trust/store/write mappings without claiming every indirect
write or arbitrary closure is statically understood. Preserve the existing
WeakMap/WeakSet authorities; do not create a consolidated store, runtime registry,
shared game executor or numerical engine for the audit.

## 6. Existing enforcement and precise remaining gaps

Existing architecture tests cover nested Kernel imports, type imports, inline
types, barrels, re-exports, import queries, dynamics, external/nonliteral loading,
runtime cycles, exact forwarders and identical canonical copies. Declaration
tests and v2.0.9 fixtures exercise four gameplay contract families through aliases,
heritage, generic constraints/defaults, mapped/conditional types and argument/return
positions at source/emitted/installed boundaries: 64 valid controls and 64 intended
rejections. v2.0.10 covers ten adversarial control/rejection pairs plus real runtime
traces, including the returned modifier resolver and positive Position RNG.

These tools already enforce their reviewed boundaries. No checker false acceptance
or production defect has been reproduced in this preflight. Do not change checker
or preservation policies. A newly discovered bypass requires a separate controlled
reproduction and minimal correction approval before any checker edit.

Remaining closure gaps are evidence/consistency gaps:

1. CLI output does not enumerate complete dependency edges or SCC classification.
2. Installed harness checks all export counts and selected values but does not
   persist complete eleven-entrypoint name/origin and Legacy declaration hashes.
3. Existing milestone reviews have different accepted revisions and output shapes;
   there is no unified v2.0.12 candidate consistency report.
4. No proposed freeze record/schema or adversarial validator exists yet.
5. Current architecture prose mixes historical cycle counts/extraction stages;
   current ownership needs one accurate closure summary without rewriting history.

Add only controls for these gaps. Reuse existing negative fixtures unchanged.
New validator negatives must be labelled manifest/inventory rejections, not claimed
as new forbidden-dependency detections by the existing architecture checker.

## 7. Preservation and accepted provenance

Fresh preservation check PASS: **27 modules**, exact forwarders and canonical
runtime namespace identity. Authoritative file remains `docs/behavior-baseline.json`.
Its local raw SHA-256 is
`7a8cf3cc60f66b951ba664e455ec2e653c9025165bd6ec8ccf5e4926a911711a`.
The `reviewedCommit` remains historical `c5878d92e198acd19289f568a2ddeda5096d83e7`;
it is not replaced with the v2.0.12 starting revision.

Preserve every declaration fingerprint, original hash, approvedChange and nested
previousApprovedChange chain. Current approved amendments cover v1.1.1/v1.1.3/
v1.1.5, v1.2.x and v2.0.3/callback parity through v2.0.8 as recorded per module;
later zero-delta milestones do not replace historical approvals. Appendix D pins
all 27 complete record digests, including nested history. Final evidence must
also retain the full declaration arrays and currentFiles membership from the
authoritative baseline and recompute implementation fingerprints.

Compare all protected production/metadata/compiler/checker/forwarder bytes to the
starting accepted revision. Record Git blob/LF-normalized source SHA-256 separately
from raw working-tree SHA-256; do not normalize emitted declarations or raw oracle
provenance. Keep seven historical golden JSON files, the separate 61-scenario
Legacy oracle, and all three consumer expected files byte-identical. Do not capture
or regenerate any golden for this cut. Expected result: **ZERO NEW PRESERVATION
DELTA**; no RFC 6902 proposal or baseline amendment.

## 8. Consumer coverage

Retain T1–T9 (9), V1–V10 (10), A1–A13 (13): 32 unique scenarios, 17 runtime APIs,
three independent strict NodeNext/native ESM consumers, 288 scenario executions
per installed multi-RPG verification, fresh and shared processes, forward/reverse,
repeat/reset and caller-mutation isolation. Independent hand anchors and isolated
accepted-source observations retain distinct provenance. These are finite consumer
recipes, not complete games or evidence of commercial ARPG formula fidelity.

Retain all 61 Legacy isolation scenarios. The two random-in-area scenarios each
consume six Position RNG draws and have equal fine/coarse full traces. Preserve
all 59 older observations, positions, RNG receiver/getter ordering, event/resource/
action state, Root/Child identity, Trigger receipts and exactly-once behavior.
Reuse the current `consumer-smoke.mjs` one-pack/one-install infrastructure; extend
only inventory output/assertions within that installation. No second installer.

## 9. Proposed freeze schema and validation

Use one deterministic JSON object, schemaVersion 1, with these required sections:

| Section | Required data |
| --- | --- |
| identity | architecture v2.0, milestone v2.0.12, acceptedStartingRevision, package name/version, status PROPOSED, activation by explicit Developer acceptance only |
| publicBoundary | eleven entrypoints; sorted symbol/type/value/origin inventories; 99 Legacy declaration hashes; Kernel source/emitted/installed closure; runtime namespace expectations |
| dependencyBoundary | checker reference/hash, complete candidate graph evidence reference/digest, allowed-policy reference, Kernel-only rule, zero runtime cycles, accepted historical SCC/type-edge classification |
| implementationOwnership | 17 public APIs and canonical owner identities, internal snapshot primitives, 24 direct sites/wrappers/callback seam, gameplay state/event/receipt owners, application ownership |
| preservation | authoritative baseline path/hash, 27 record digests/history references, current implementation/declaration fingerprints, historical golden references/hashes |
| verification | exact commands, required controls/rejections and consumer counts, actual candidate evidence references, full verification and four exact-head PR/push CI jobs required |
| governance | compatible extension / capability gap / breaking architecture change procedures and stop conditions |

Sorted JSON keys/sets and repository-relative paths; preserve ordered trace arrays
and runtime-sensitive field order. Hash deterministic UTF-8/LF JSON projections
with an explicitly stated encoding. Prefer references/digests to complete existing
inventories in evidence, with required reference existence/content validation.
Never reference `.git` paths as the only durable final evidence.

Avoid circular hashes: the manifest pins named architecture/API/preservation
projections in the evidence; those projections contain no manifest hash or
volatile timestamps. Evidence may separately report the full manifest hash.
Neither file stores its own hash or final containing commit SHA. Full test/CI
requirements remain requirements until actually run; pending is never SUCCESS.
PR/Developer records bind final commit SHA, four exact-head successful CI jobs
and final acceptance. Do not make a second commit just to embed that SHA.

The manifest is not imported by production and cannot replace the preservation
baseline or checker policy. Validator recomputes current inventories, follows
hash references, compares the accepted candidate and rejects stale/tampered records;
it never writes or repairs the record. Explicit initial record construction after
Gate A is reviewable and separate from read-only validation. Tests cannot regenerate
it to pass. No command silently advances acceptance or status to FROZEN.

CI enforcement uses a new Vitest tooling suite, already reached by `npm test`
in the existing Node 22.13.0/24 workflows. No package-script or workflow edit is
needed. That suite validates the live source/emitted boundary, manifest schema,
protected inventories and durable evidence without requiring local `.git` run
logs. On a clean CI checkout, installed verification runs later in the existing
consumer step and performs the new exact installed assertions there. The final
read-only reviewer binds fresh installed output after that step; the test suite
must not demand a prior local install log or silently pass a missing required
installed check. Source hashes certify this candidate; they are not a prohibition on all
future approved compatible implementation improvements. Such changes require
new reviewed evidence, with architecture invariants retained under the rules below.

## 10. Future governance

Compatible tests/docs/fixtures/implementation performance changes retain approved
architecture, run relevant regression and compatibility checks, and follow the
repository plan gate when applicable. New capabilities first report
`CORE_CAPABILITY_GAP`, inspect public APIs, propose one owner/contract/semantics and
compatibility/preservation impact, obtain Developer approval, then implement once.
Breaking ownership/contracts/entrypoints/forwarders/cycles/preservation changes
require `ARCHITECTURE_CHANGE_REQUEST` with motivation, current/proposed boundary,
alternatives, consumer impact, migration, verification and rollback, then STOP.
Updating a manifest to accept new code is never approval. Only the final explicit
`RPG_CORE_V2_ARCHITECTURE_ACCEPTED` Developer record activates this freeze.

## 11. Exact proposed changed-file inventory

Twelve files total (including this Gate A plan); any additional source, checker,
package, configuration or preservation modification requires a delta review.

| File | Change and why existing tools/docs are insufficient |
| --- | --- |
| docs/v2/rpg-core-v2.0.12-implementation-plan.md | This Gate A audit, exact inventory and staged authorization; no current v2.0.12 plan exists |
| docs/v2/2.0.12-architecture-closure.md | One current closure report, actual command counts, limitations and final acceptance requirements; historical reports must not be rewritten |
| docs/v2/2.0.12-architecture-closure-evidence.json | Unified graph, API, owner, source/declaration hash, preservation and consumer evidence; prior evidence spans different revisions |
| docs/v2/2.0.12-architecture-freeze.json | Proposed reviewed architecture record with validated references; no existing freeze manifest |
| scripts/audit-architecture-closure.mjs | Read-only TypeScript graph/SCC/API/origin inventory plus manifest consistency functions; reuse existing checker/delegation/preservation functions and reports, no new policy engine |
| scripts/review-architecture-closure.mjs | Read-only candidate orchestration, protected diff and installed-evidence binding; stdout only, no capture/rebaseline mode |
| tests/tooling/architecture-closure.test.ts | Real candidate consistency plus smallest paired tamper tests for manifest/inventory gaps; existing suites do not validate a freeze record |
| scripts/consumer-smoke.mjs | Persist/assert full installed eleven-entrypoint names/classifications and declaration/runtime identity hashes in its existing one-artifact run; counts alone do not detect symbol substitution |
| AGENTS.md | Link accepted boundary/governance and final acceptance gate for future agents; preserve current canonical/no-workaround rules |
| docs/ARCHITECTURE.md | Current complete Kernel ownership, allowed-domain table, exact historical cycle classification and governance; retain historical provenance sections |
| docs/test-coverage.md | Locate closure/manifest adversarial tests and actual staged results |
| README.md | Concise current architecture and proposed freeze link/status; avoid replacing historical milestone evidence |

No edits to src, package metadata/exports/dependencies, compiler config, CI workflow,
check-architecture, check-preservation, behavior-baseline, module-map,
EXPORT-MANIFEST, existing tests/fixtures/goldens or prior milestone reports.
New tests reuse private helpers or in-memory inputs without changing them.

## 12. Exact verification and evidence plan

After Gate A approval, first construct the new read-only reports and proposed
manifest, then add paired controls. Every forbidden variant must fail for the
specific invariant, with valid targets and no generic compiler-error success.

| New paired control / mutation | Expected diagnostic family |
| --- | --- |
| Exact starting revision / wrong accepted revision | BASELINE_IDENTITY |
| Eleven matching entrypoints / removed or redirected export | PUBLIC_ENTRYPOINT |
| Exact symbol names / same-count substituted name | PUBLIC_SYMBOL |
| Exact runtime name/classification / type-value substitution | RUNTIME_EXPORT |
| Byte-identical declarations / changed Legacy declaration byte | DECLARATION_HASH |
| Kernel-only closure / external declaration reference | DECLARATION_BOUNDARY (existing checker result) |
| Exact resolved graph / omitted edge or unresolved referenced node | DEPENDENCY_GRAPH |
| Existing combined SCC classification / added cycle or reclassified runtime edge | CYCLE_CLASSIFICATION |
| Canonical owner identities / owner redirection | CANONICAL_OWNER |
| Reviewed 24 direct sites / changed mapping or missing delegate | DELEGATION_INVENTORY (existing audit result) |
| Reviewed gameplay authority / unauthorized owner/store | RUNTIME_OWNERSHIP (existing audit result) |
| Exact 27 records/history / changed nested provenance or currentFiles | PRESERVATION_HISTORY |
| Existing accepted oracle hashes / altered golden byte | ACCEPTED_ORACLE |
| One installed artifact / mixed artifact or stale protected content | INSTALLED_ARTIFACT |
| Exact 32 + 61 scenario IDs / missing or duplicated observation | CONSUMER_COVERAGE |
| Valid schema/status/reference / malformed, missing, tampered reference or self-approved FROZEN | FREEZE_MANIFEST |

Use table-driven variants within the single new suite; do not promise a test
count before execution. Audit diagnostics must distinguish observed data mismatch
from actual dependency-checker failure. Retain all old negative fixtures and
their existing diagnostic assertions. Virtual mutations never write production.
The real-tree consistency test ensures existing CI invokes current validation.

Gate B commands, serialized around build/pack and readers of dist:

```text
npm run build
npm run typecheck
npm run check:architecture
npm run check:preservation
npm test -- tests/tooling
npm test -- tests/stats tests/modifiers tests/damage tests/combat tests/effects tests/skills tests/spatial tests/integration tests/consumers
node scripts/audit-legacy-delegation.mjs
npm run test:consumer
node scripts/review-gameplay-boundary.mjs
node scripts/review-legacy-isolation.mjs
node scripts/review-multi-rpg-consumers.mjs
node scripts/audit-architecture-closure.mjs
node scripts/review-architecture-closure.mjs
git diff --check
```

Capture installed stdout in `.git/v2.0.11-installed.log`, the current multi-RPG
reviewer's required input; also bind its content digest/current protected bytes
and new installed inventory to the candidate closure report. This filename does
not turn prior evidence into a fresh execution. Reports record actual execution
commands, counts, durations, environment and whether each input was rerun/reused.
Run the final closure review only after relevant build/installed evidence exists.
Do not run build or pack concurrently with any dist reader. The targeted paths
above cover actual repository suites; unique totals must exclude overlap.

Present all 18 task Gate B evidence items and **ZERO NEW PRESERVATION DELTA**.
Then STOP: **BLOCKED — FINAL ARCHITECTURE / PRESERVATION REVIEW**.
No full `npm run verify`, commit, push or PR update before Gate B approval.

Gate C only after explicit approval: reconfirm branch/base, run full
`npm run verify`, `git diff --check`, read-only closure/manifest review, all
installed compatibility and protected-inventory comparisons. If all pass, commit
`test(architecture): close and freeze rpg core v2 boundaries`, push this branch,
update PR #6, and wait for PR AND push Node 22.13.0 AND 24 SUCCESS on that exact
SHA. Report actual test count, changed files, graph/owners, public/declaration/
preservation/manifest hashes, consumers, CI URLs and limitations. Remain
**READY FOR REVIEW — FINAL ARCHITECTURE ACCEPTANCE PENDING**. No merge, release,
publication, version change, automatic freeze activation or follow-on milestone.

## 13. Stop conditions and unresolved limits

No genuine production/checker defect requiring correction is identified so far.
If protected-source/API/declaration/preservation drift, checker false acceptance,
runtime regression or capability gap is discovered, preserve the failing evidence
and STOP for a minimal separately approved delta. Do not self-rebaseline, regenerate
accepted goldens, relax controls or add a parallel implementation.

Known limits: finite static owner mappings do not exhaust arbitrary JS semantics;
dynamic callbacks require trace evidence; source hashes certify reviewed bytes,
not every hypothetical input. Historical type relationships are classified rather
than removed. Local Node 24 preflight is not new Node 22 evidence; Gate C needs
four successful exact-head remote jobs. A proposed manifest is not final Developer
acceptance. The following appendices are current preflight inventories, not
authorization to change any listed source or public surface.


## Appendix A. Exact current source dependency inventory

`R` means syntactic runtime dependency; `T` means explicit erased type dependency.
Targets use repository-relative source paths. Each item also records AST syntax.
No direct dependency is represented by `none`. Shared forwarders are included.

| Importer | Resolved dependencies |
| --- | --- |
| src/combat/combat-entity.ts | T src/contracts/combat-entity.ts (import); R src/kernel/resources/resource-calculation.ts (import); T src/contracts/combat-entity.ts (export); R src/contracts/stat-contracts.ts (import) |
| src/combat/combat-state.ts | T src/contracts/combat-state.ts (import); T src/contracts/combat-state.ts (export); T src/combat/combat-entity.ts (import); T src/spatial/grid-geometry.ts (import) |
| src/combat/index.ts | R src/combat/combat-entity.ts (export); R src/combat/combat-state.ts (export); T src/contracts/combat-entity.ts (export); T src/contracts/combat-state.ts (export) |
| src/contracts/combat-entity.ts | T src/contracts/stat-contracts.ts (import) |
| src/contracts/combat-modifiers.ts | none |
| src/contracts/combat-state.ts | T src/contracts/combat-entity.ts (import); T src/contracts/spatial.ts (import) |
| src/contracts/damage-contracts.ts | T src/contracts/combat-entity.ts (import); T src/contracts/defense-settings.ts (import); T src/contracts/mechanic-contracts.ts (import) |
| src/contracts/defense-settings.ts | none |
| src/contracts/dot-contracts.ts | R src/contracts/damage-contracts.ts (import) |
| src/contracts/effects.ts | T src/contracts/combat-entity.ts (import); T src/contracts/combat-state.ts (import); T src/contracts/combat-modifiers.ts (import) |
| src/contracts/index.ts | T src/contracts/combat-entity.ts (export); R src/contracts/combat-modifiers.ts (export); T src/contracts/combat-modifiers.ts (export); T src/contracts/combat-state.ts (export); R src/contracts/damage-contracts.ts (export); T src/contracts/damage-contracts.ts (export); R src/contracts/defense-settings.ts (export); T src/contracts/defense-settings.ts (export); R src/contracts/dot-contracts.ts (export); T src/contracts/dot-contracts.ts (export); T src/contracts/effects.ts (export); R src/contracts/mechanic-contracts.ts (export); T src/contracts/mechanic-contracts.ts (export); T src/contracts/spatial.ts (export); R src/contracts/stat-contracts.ts (export); T src/contracts/stat-contracts.ts (export); R src/contracts/targeting-contracts.ts (export); T src/contracts/targeting-contracts.ts (export) |
| src/contracts/mechanic-contracts.ts | R src/contracts/dot-contracts.ts (import) |
| src/contracts/spatial.ts | none |
| src/contracts/stat-contracts.ts | T src/contracts/damage-contracts.ts (import); T src/contracts/defense-settings.ts (import); T src/contracts/combat-modifiers.ts (import); T src/contracts/targeting-contracts.ts (import) |
| src/contracts/targeting-contracts.ts | T src/contracts/combat-state.ts (import) |
| src/damage/damage-core.ts | R src/contracts/defense-settings.ts (import); T src/contracts/combat-modifiers.ts (import); R src/contracts/damage-contracts.ts (import); T src/combat/combat-entity.ts (import); R src/damage/defense-engine.ts (import); R src/modifiers/modifier-core.ts (import); R src/kernel/damage/damage-calculation.ts (import); R src/kernel/defense/defense-calculation.ts (import); R src/kernel/snapshots/snapshot-data.ts (import) |
| src/damage/defense-engine.ts | R src/contracts/defense-settings.ts (import); R src/kernel/defense/defense-calculation.ts (import); T src/contracts/defense-settings.ts (export) |
| src/damage/index.ts | R src/damage/damage-core.ts (export); T src/damage/damage-core.ts (export); R src/damage/defense-engine.ts (export); R src/contracts/damage-contracts.ts (export); T src/contracts/damage-contracts.ts (export); R src/contracts/defense-settings.ts (export); T src/contracts/defense-settings.ts (export); R src/damage/damage-core.ts (export); T src/damage/damage-core.ts (export) |
| src/effects/dot-core.ts | T src/contracts/damage-contracts.ts (import); T src/contracts/dot-contracts.ts (import); R src/damage/damage-core.ts (import); R src/modifiers/modifier-core.ts (import) |
| src/effects/effect-lifecycle.ts | R src/effects/effect-system.ts (import); R src/combat/combat-state.ts (import); T src/contracts/combat-modifiers.ts (import) |
| src/effects/effect-system.ts | T src/contracts/effects.ts (import); T src/contracts/effects.ts (export); T src/combat/combat-entity.ts (import); R src/combat/combat-entity.ts (import); R src/combat/combat-state.ts (import); R src/contracts/combat-modifiers.ts (import); R src/contracts/stat-contracts.ts (import) |
| src/effects/index.ts | R src/effects/dot-core.ts (export); T src/effects/dot-core.ts (export); R src/effects/effect-lifecycle.ts (export); T src/effects/effect-lifecycle.ts (export); T src/effects/effect-lifecycle.ts (export); R src/effects/effect-system.ts (export); T src/contracts/effects.ts (export); R src/contracts/dot-contracts.ts (export); T src/contracts/dot-contracts.ts (export) |
| src/index.ts | R src/contracts/index.ts (export); R src/stats/index.ts (export); R src/modifiers/index.ts (export); R src/combat/index.ts (export); R src/damage/index.ts (export); R src/skills/index.ts (export); R src/effects/index.ts (export); R src/mechanics/index.ts (export); R src/spatial/index.ts (export) |
| src/kernel/contracts/common.ts | none |
| src/kernel/contracts/damage-stages.ts | none |
| src/kernel/contracts/damage.ts | none |
| src/kernel/contracts/defense.ts | T src/kernel/contracts/common.ts (import) |
| src/kernel/contracts/modifier-resolution.ts | T src/kernel/contracts/modifiers.ts (import) |
| src/kernel/contracts/modifiers.ts | none |
| src/kernel/contracts/resources.ts | T src/kernel/contracts/common.ts (import) |
| src/kernel/contracts/snapshots.ts | T src/kernel/contracts/common.ts (import); T src/kernel/contracts/modifiers.ts (import); T src/kernel/contracts/stats.ts (import); T src/kernel/contracts/damage.ts (import) |
| src/kernel/contracts/stats.ts | T src/kernel/contracts/common.ts (import); T src/kernel/contracts/modifiers.ts (import) |
| src/kernel/damage/damage-calculation.ts | T src/kernel/contracts/damage-stages.ts (import) |
| src/kernel/defense/defense-calculation.ts | T src/kernel/contracts/defense.ts (import) |
| src/kernel/index.ts | R src/kernel/snapshots/calculation-snapshot.ts (export); R src/kernel/resources/resource-calculation.ts (export); R src/kernel/defense/defense-calculation.ts (export); T src/kernel/contracts/damage-stages.ts (export); R src/kernel/damage/damage-calculation.ts (export); T src/kernel/contracts/modifier-resolution.ts (export); R src/kernel/modifiers/modifier-resolution.ts (export); T src/kernel/contracts/common.ts (export); T src/kernel/contracts/modifiers.ts (export); T src/kernel/contracts/stats.ts (export); R src/kernel/stats/stat-calculation.ts (export); T src/kernel/contracts/damage.ts (export); T src/kernel/contracts/defense.ts (export); T src/kernel/contracts/resources.ts (export); T src/kernel/contracts/snapshots.ts (export) |
| src/kernel/modifiers/modifier-resolution.ts | T src/kernel/contracts/modifiers.ts (import); T src/kernel/contracts/modifier-resolution.ts (import) |
| src/kernel/resources/resource-calculation.ts | T src/kernel/contracts/resources.ts (import) |
| src/kernel/snapshots/calculation-snapshot.ts | T src/kernel/contracts/snapshots.ts (import); R src/kernel/snapshots/snapshot-data.ts (import) |
| src/kernel/snapshots/snapshot-data.ts | none |
| src/kernel/stats/stat-calculation.ts | T src/kernel/contracts/common.ts (import); T src/kernel/contracts/stats.ts (import) |
| src/mechanics/aoe-sequence-core.ts | R src/contracts/mechanic-contracts.ts (import); T src/spatial/grid-geometry.ts (import) |
| src/mechanics/emitter-core.ts | T src/contracts/mechanic-contracts.ts (import) |
| src/mechanics/index.ts | R src/mechanics/instant-aoe.ts (export); R src/mechanics/melee-hitbox.ts (export); T src/mechanics/melee-hitbox.ts (export); R src/mechanics/projectile.ts (export); T src/mechanics/projectile.ts (export); R src/contracts/mechanic-contracts.ts (export); T src/contracts/mechanic-contracts.ts (export) |
| src/mechanics/instant-aoe.ts | R src/contracts/mechanic-contracts.ts (import); T src/spatial/grid-geometry.ts (import); R src/mechanics/melee-hitbox.ts (import) |
| src/mechanics/melee-hitbox.ts | T src/contracts/mechanic-contracts.ts (import); T src/spatial/grid-geometry.ts (import); R src/spatial/grid-geometry.ts (import) |
| src/mechanics/projectile.ts | T src/contracts/mechanic-contracts.ts (import); T src/spatial/grid-geometry.ts (import); R src/spatial/grid-geometry.ts (import) |
| src/modifiers/index.ts | R src/modifiers/modifier-core.ts (export); T src/modifiers/modifier-core.ts (export); R src/contracts/combat-modifiers.ts (export); T src/contracts/combat-modifiers.ts (export) |
| src/modifiers/modifier-core.ts | R src/contracts/combat-modifiers.ts (import); R src/contracts/stat-contracts.ts (import); T src/contracts/damage-contracts.ts (import); R src/kernel/modifiers/modifier-resolution.ts (import); T src/kernel/contracts/modifier-resolution.ts (import) |
| src/shared/data/combat-modifiers.ts | R src/contracts/combat-modifiers.ts (export) |
| src/shared/data/damage-contracts.ts | R src/contracts/damage-contracts.ts (export) |
| src/shared/data/defense-settings.ts | R src/contracts/defense-settings.ts (export) |
| src/shared/data/dot-contracts.ts | R src/contracts/dot-contracts.ts (export) |
| src/shared/data/mechanic-contracts.ts | R src/contracts/mechanic-contracts.ts (export) |
| src/shared/data/skill-effects.ts | R src/skills/skill-effects.ts (export) |
| src/shared/data/stat-contracts.ts | R src/contracts/stat-contracts.ts (export) |
| src/shared/data/targeting-contracts.ts | R src/contracts/targeting-contracts.ts (export) |
| src/shared/game/aoe-sequence-core.ts | R src/mechanics/aoe-sequence-core.ts (export) |
| src/shared/game/combat-entity.ts | R src/combat/combat-entity.ts (export) |
| src/shared/game/combat-state.ts | R src/combat/combat-state.ts (export) |
| src/shared/game/damage-core.ts | R src/damage/damage-core.ts (export) |
| src/shared/game/defense-engine.ts | R src/damage/defense-engine.ts (export) |
| src/shared/game/dot-core.ts | R src/effects/dot-core.ts (export) |
| src/shared/game/effect-lifecycle.ts | R src/effects/effect-lifecycle.ts (export) |
| src/shared/game/effect-system.ts | R src/effects/effect-system.ts (export) |
| src/shared/game/emitter-core.ts | R src/mechanics/emitter-core.ts (export) |
| src/shared/game/grid-geometry.ts | R src/spatial/grid-geometry.ts (export) |
| src/shared/game/instant-aoe.ts | R src/mechanics/instant-aoe.ts (export) |
| src/shared/game/melee-hitbox.ts | R src/mechanics/melee-hitbox.ts (export) |
| src/shared/game/modifier-core.ts | R src/modifiers/modifier-core.ts (export) |
| src/shared/game/projectile.ts | R src/mechanics/projectile.ts (export) |
| src/shared/game/range.ts | R src/spatial/range.ts (export) |
| src/shared/game/skill-effect-integration.ts | R src/skills/skill-effect-integration.ts (export) |
| src/shared/game/skill-engine.ts | R src/skills/skill-engine.ts (export) |
| src/shared/game/skill-execution.ts | R src/skills/skill-execution.ts (export) |
| src/shared/game/stat-calculation.ts | R src/stats/stat-calculation.ts (export) |
| src/skills/index.ts | R src/skills/skill-effect-integration.ts (export); T src/skills/skill-effect-integration.ts (export); R src/skills/skill-effects.ts (export); T src/skills/skill-effects.ts (export); R src/skills/skill-engine.ts (export); T src/skills/skill-engine.ts (export); R src/skills/skill-execution.ts (export); T src/skills/skill-execution.ts (export); R src/skills/root-offense.ts (export); T src/skills/root-offense.ts (export); R src/skills/skill-instance.ts (export); T src/skills/skill-instance.ts (export); R src/skills/skill-trigger.ts (export); T src/skills/skill-trigger.ts (export); R src/skills/skill-upgrade.ts (export); T src/skills/skill-upgrade.ts (export) |
| src/skills/root-offense.ts | R src/damage/damage-core.ts (import); T src/damage/damage-core.ts (import); T src/combat/combat-entity.ts (import); R src/skills/skill-effects.ts (import); T src/skills/skill-effect-integration.ts (import); T src/skills/skill-execution.ts (import) |
| src/skills/skill-effect-integration.ts | R src/skills/skill-trigger.ts (import); R src/skills/skill-instance.ts (import); R src/skills/root-offense.ts (import); T src/contracts/damage-contracts.ts (import); T src/contracts/mechanic-contracts.ts (import); R src/skills/skill-effects.ts (import); R src/mechanics/aoe-sequence-core.ts (import); R src/spatial/grid-geometry.ts (import); R src/combat/combat-entity.ts (import); R src/combat/combat-state.ts (import); R src/damage/damage-core.ts (import); R src/effects/dot-core.ts (import); R src/effects/effect-lifecycle.ts (import); R src/mechanics/emitter-core.ts (import); R src/mechanics/instant-aoe.ts (import); R src/mechanics/melee-hitbox.ts (import); R src/mechanics/projectile.ts (import); R src/spatial/range.ts (import); R src/skills/skill-execution.ts (import); T src/skills/skill-engine.ts (import); T src/combat/combat-state.ts (import); R src/contracts/combat-modifiers.ts (import) |
| src/skills/skill-effects.ts | R src/contracts/damage-contracts.ts (import); R src/contracts/mechanic-contracts.ts (import); R src/contracts/dot-contracts.ts (import); R src/combat/combat-state.ts (import); R src/effects/effect-system.ts (import) |
| src/skills/skill-engine.ts | R src/combat/combat-state.ts (import); R src/stats/stat-calculation.ts (import); T src/combat/combat-entity.ts (import); T src/combat/combat-state.ts (import); R src/skills/skill-effects.ts (import) |
| src/skills/skill-execution.ts | R src/skills/skill-trigger.ts (import); R src/skills/skill-instance.ts (import); R src/skills/root-offense.ts (import); R src/skills/skill-engine.ts (import); R src/combat/combat-state.ts (import); R src/spatial/range.ts (import); T src/spatial/grid-geometry.ts (import); T src/combat/combat-entity.ts (import) |
| src/skills/skill-instance.ts | R src/skills/skill-trigger.ts (import); R src/skills/root-offense.ts (import); T src/skills/skill-effects.ts (import); R src/skills/skill-engine.ts (import); T src/skills/skill-effect-integration.ts (import); T src/skills/skill-execution.ts (import); T src/skills/root-offense.ts (import); T src/combat/combat-state.ts (import) |
| src/skills/skill-trigger.ts | T src/skills/skill-instance.ts (import); T src/skills/skill-engine.ts (import); T src/skills/skill-effect-integration.ts (import); T src/skills/root-offense.ts (import); T src/spatial/grid-geometry.ts (import); T src/combat/combat-state.ts (import); R src/combat/combat-state.ts (import); T src/effects/effect-lifecycle.ts (import); T src/combat/combat-entity.ts (import) |
| src/skills/skill-upgrade.ts | R src/skills/skill-instance.ts (import); R src/skills/skill-trigger.ts (import); T src/skills/skill-effects.ts (import); T src/skills/skill-engine.ts (import) |
| src/spatial/grid-geometry.ts | T src/contracts/spatial.ts (import); T src/contracts/spatial.ts (export) |
| src/spatial/index.ts | R src/spatial/grid-geometry.ts (export); R src/spatial/range.ts (export); T src/contracts/spatial.ts (export) |
| src/spatial/range.ts | R src/spatial/grid-geometry.ts (import) |
| src/stats/index.ts | R src/stats/stat-calculation.ts (export); R src/contracts/stat-contracts.ts (export); T src/contracts/stat-contracts.ts (export) |
| src/stats/stat-calculation.ts | R src/contracts/stat-contracts.ts (import); R src/kernel/stats/stat-calculation.ts (import); R src/kernel/resources/resource-calculation.ts (import); T src/kernel/contracts/common.ts (import); T src/kernel/contracts/stats.ts (import); T src/modifiers/modifier-core.ts (import) |

### Combined strongly connected components

- Members: src/contracts/combat-entity.ts, src/contracts/combat-state.ts, src/contracts/damage-contracts.ts, src/contracts/dot-contracts.ts, src/contracts/mechanic-contracts.ts, src/contracts/stat-contracts.ts, src/contracts/targeting-contracts.ts.
  Internal explicit type edges: src/contracts/combat-entity.ts → src/contracts/stat-contracts.ts; src/contracts/combat-state.ts → src/contracts/combat-entity.ts; src/contracts/damage-contracts.ts → src/contracts/combat-entity.ts; src/contracts/damage-contracts.ts → src/contracts/mechanic-contracts.ts; src/contracts/stat-contracts.ts → src/contracts/damage-contracts.ts; src/contracts/stat-contracts.ts → src/contracts/targeting-contracts.ts; src/contracts/targeting-contracts.ts → src/contracts/combat-state.ts.
- Members: src/skills/root-offense.ts, src/skills/skill-effect-integration.ts, src/skills/skill-execution.ts, src/skills/skill-instance.ts, src/skills/skill-trigger.ts.
  Internal explicit type edges: src/skills/root-offense.ts → src/skills/skill-effect-integration.ts; src/skills/root-offense.ts → src/skills/skill-execution.ts; src/skills/skill-instance.ts → src/skills/skill-effect-integration.ts; src/skills/skill-instance.ts → src/skills/skill-execution.ts; src/skills/skill-instance.ts → src/skills/root-offense.ts; src/skills/skill-trigger.ts → src/skills/skill-instance.ts; src/skills/skill-trigger.ts → src/skills/skill-effect-integration.ts; src/skills/skill-trigger.ts → src/skills/root-offense.ts.

Runtime nontrivial SCCs: 0. Existing checker DFS cycle paths:

- src/contracts/combat-entity.ts → src/contracts/stat-contracts.ts → src/contracts/damage-contracts.ts → src/contracts/combat-entity.ts
- src/contracts/damage-contracts.ts → src/contracts/mechanic-contracts.ts → src/contracts/dot-contracts.ts → src/contracts/damage-contracts.ts
- src/contracts/combat-entity.ts → src/contracts/stat-contracts.ts → src/contracts/targeting-contracts.ts → src/contracts/combat-state.ts → src/contracts/combat-entity.ts
- src/skills/skill-trigger.ts → src/skills/skill-instance.ts → src/skills/skill-trigger.ts
- src/skills/skill-effect-integration.ts → src/skills/skill-trigger.ts → src/skills/skill-instance.ts → src/skills/root-offense.ts → src/skills/skill-effect-integration.ts
- src/skills/skill-trigger.ts → src/skills/skill-instance.ts → src/skills/root-offense.ts → src/skills/skill-execution.ts → src/skills/skill-trigger.ts
- src/skills/skill-instance.ts → src/skills/root-offense.ts → src/skills/skill-execution.ts → src/skills/skill-instance.ts
- src/skills/root-offense.ts → src/skills/skill-execution.ts → src/skills/root-offense.ts
- src/skills/skill-effect-integration.ts → src/skills/skill-trigger.ts → src/skills/skill-instance.ts → src/skills/skill-effect-integration.ts
- src/skills/skill-effect-integration.ts → src/skills/skill-trigger.ts → src/skills/skill-effect-integration.ts

## Appendix B. Complete current public symbol names

`V` = runtime value (possibly also a type); `T` = type-only public symbol.
The source declaration origin of each Kernel runtime API is in section 4; the
final evidence will persist resolved declaration origins for all entries.

### @rpg/core

```text
T AcceptedSkillReplacement
T ActionClassification
T ActionState
V activateSkillInstance
T ActiveCombatAction
T ActiveModifierSources
T ActorOffenseInput
T ActorOffenseSnapshot
V advanceSkillEffects
V advanceSkillExecution
T AOECast
V applyDotSnapshot
V applyEntityDamage
V applyEntityHealing
V applyEntityManaGain
V ATTRIBUTE_IDS
V calculateDamage
V calculateEffectiveStat
V cancelCombatAction
V cancelSkillExecution
V cancelSkillInstance
V canTraverse
T CharacterBaseStats
V clearSkillEffects
V collectActiveModifiers
T CombatActionContext
V combatActionPhase
T CombatActionSlot
T CombatEntity
T CombatEntityIdentity
T CombatModifier
T CombatRejection
T CombatRestriction
V combatState
T CombatValidationContext
T CombatValidationResult
V completeCombatAction
V cooldownDurationMs
V CORE_SCALING_MAPPING
T CoreAttribute
T CoreAttributeRule
V createSkillCooldownState
V createSkillEffectRuntime
V DAMAGE_BONUS_EVENT_TAGS
V DAMAGE_SOURCES
V DAMAGE_STATUSES
V DAMAGE_TAGS
V DAMAGE_TARGETS
T DamageContext
V damageDefinition
T DamageDefinition
T DamageDelivery
T DamageModifier
T DamageSettings
T DamageSnapshot
T DamageSource
V DEFAULT_CORE_STATS
V DEFAULT_DEFENSE_SETTINGS
V DEFAULT_DOT
V DEFAULT_INSTANT_AOE
V DEFAULT_MELEE_HITBOX
V DEFAULT_PROJECTILE
V DEFAULT_TIMED_AOE_SEQUENCE
V DEFAULT_TIMED_OBJECT
V DEFENSE_RATING_STATS
V DEFENSE_TYPES
T DefenseActor
T DefenseConfigSnapshot
T DefenseContext
T DefenseRule
T DefenseSettings
T DefenseType
V defineEffect
V defineSkill
V DERIVED_MODIFIER_OPERATIONS
V deriveSkillRootDamage
V detectInstantAOE
V detectMeleeHitbox
V dispatchSkillEffects
V distance
V DOT_EFFECTS
T DotConfig
V dotDamage
T DotGroup
T DotRuntime
T DotStack
T EffectApplyContext
T EffectApplyRequest
T EffectDefinition
T EffectGroupView
T EffectId
T EffectInstance
T EffectInstanceId
V EffectLifecycle
T EffectLifecycleEvent
T EffectLifecycleResult
T EffectModifier
T EffectModifierSource
T EffectOperationResult
T EffectRejection
T EffectRemovalReason
T EffectStackConsumePlan
T EffectStackConsumeRejection
T EffectStackConsumeRequest
T EffectStackConsumeResult
T EffectTerminalOutcome
T EffectValidationResult
V ELEMENTAL_STATS
T EntityCombatEvent
V executeSkill
V factionRelation
T FactionRelation
V finishSkillInstance
T HitboxTarget
V inheritSkillCooldowns
V inRange
V inspectSkillInstance
T InstantAOE
V isWalkable
V LEGACY_PLAYER_STATS
T LifeState
V lockAOEPosition
T MapPoint
V MAX_DAMAGE_SNAPSHOT_MODIFIERS
T MeleeCast
T MeleeHitbox
V mitigateDefense
V MODIFIER_DAMAGE_TAGS
V MODIFIER_OPERATIONS
V MODIFIER_SOURCES
V moveProjectile
V nextSkillEffectBoundary
V OPTIONAL_MAX_STATS
V pinSkillInstanceDefinition
V pinSkillTriggerBundle
T PlayerStat
T PlayerStatsConfig
V prepareModifierResolver
T ProjectileBody
V projectileCastConfig
T ProjectileConfig
T ProjectileTarget
V RATE_TARGETS
V reconcileCombatRestrictions
V reconcileSkillRestrictions
V registerChildSkillInstance
V remainingSkillCooldown
V resolveCharacterStats
V resolveDefenseHit
V resolveModifiers
V resolveSkillUpgrades
V RESOURCE_STATS
T RootOffensiveSnapshot
V rootSkillInstance
V SKILL_TRIGGER_LIMITS
V skillActionAdmission
T SkillActivatedEvent
V skillAvailability
T SkillAvailability
T SkillCooldownState
T SkillDamageComponent
T SkillEffectEnvironment
T SkillEffectEvent
T SkillEffectRuntime
T SkillEngineDefinition
V skillExecutionAvailability
T SkillExecutionContext
T SkillExecutionEnvironment
T SkillExecutionEvent
T SkillExecutionResult
T SkillExecutionSlot
T SkillExecutionSnapshot
T SkillGameplayEffect
T SkillIdentity
T SkillInstanceDefinition
T SkillInstanceRejection
T SkillInstanceResult
T SkillInstanceStatus
T SkillInstanceView
T SkillLifesteal
T SkillManaOnHit
T SkillMechanics
T SkillOnHitDot
V skillRangeAvailability
T SkillRejection
T SkillResult
T SkillRootOffenseCapture
T SkillStackConsumption
T SkillStackPredicate
T SkillStackThreshold
T SkillTrigger
T SkillTriggerBinding
T SkillTriggerBundle
T SkillTriggerDimension
T SkillTriggerLink
T SkillTriggerReceipt
T SkillTriggerReceiptResult
T SkillTriggerResult
T SkillUpgrade
T SkillUpgradeResult
V snapshotActorDamage
V snapshotActorOffense
V startCombatAction
V startSkillAction
V STAT_IDS
T StatRule
T StatsSnapshot
T TargetContext
T TargetingRule
T TargetingSettings
V tickDotRuntime
T TimedAOESequence
T TimedObjectConfig
V updateCurrentResources
V upgradePlayerStatsConfig
V V2_PLAYER_STATS
V validAllowedRelations
V validAOECast
V validateCombatAction
V validateCombatEntities
V validateCombatEntity
V validateCombatHit
V validateCombatModifiers
V validateDefenseContext
V validateDefenseSettings
V validateDots
V validateEffectApplyRequest
V validateEffectDefinition
V validateEffectInstance
V validateMovementIntent
V validateProjectile
V validateSkillContext
V validateSkillDamageComponent
V validateSkillDefinition
V validateSkillEffects
V validateSkillMechanics
V validateSkillTriggerReceipt
V validateTargetContext
T ValidationStage
V validMeleeCast
V validProjectileCast
V validTargetingRule
T Walkability
```

### @rpg/core/contracts

```text
T ActionClassification
T ActionState
T ActiveCombatAction
T AOECast
V ATTRIBUTE_IDS
T CharacterBaseStats
T CombatActionContext
T CombatActionSlot
T CombatEntity
T CombatEntityIdentity
T CombatModifier
T CombatRejection
T CombatRestriction
T CombatValidationContext
T CombatValidationResult
V CORE_SCALING_MAPPING
T CoreAttribute
T CoreAttributeRule
V DAMAGE_BONUS_EVENT_TAGS
V DAMAGE_SOURCES
V DAMAGE_STATUSES
V DAMAGE_TAGS
V DAMAGE_TARGETS
T DamageContext
V damageDefinition
T DamageDefinition
T DamageDelivery
T DamageModifier
T DamageSettings
T DamageSource
V DEFAULT_CORE_STATS
V DEFAULT_DEFENSE_SETTINGS
V DEFAULT_DOT
V DEFAULT_INSTANT_AOE
V DEFAULT_MELEE_HITBOX
V DEFAULT_PROJECTILE
V DEFAULT_TIMED_AOE_SEQUENCE
V DEFAULT_TIMED_OBJECT
V DEFENSE_RATING_STATS
V DEFENSE_TYPES
T DefenseActor
T DefenseConfigSnapshot
T DefenseContext
T DefenseRule
T DefenseSettings
T DefenseType
V DERIVED_MODIFIER_OPERATIONS
V DOT_EFFECTS
T DotConfig
T EffectApplyContext
T EffectApplyRequest
T EffectDefinition
T EffectId
T EffectInstance
T EffectInstanceId
T EffectLifecycleResult
T EffectModifier
T EffectModifierSource
T EffectRejection
T EffectTerminalOutcome
T EffectValidationResult
V ELEMENTAL_STATS
T EntityCombatEvent
T FactionRelation
T InstantAOE
V LEGACY_PLAYER_STATS
T LifeState
T MapPoint
T MeleeCast
T MeleeHitbox
V MODIFIER_DAMAGE_TAGS
V MODIFIER_OPERATIONS
V MODIFIER_SOURCES
V OPTIONAL_MAX_STATS
T PlayerStat
T PlayerStatsConfig
V projectileCastConfig
T ProjectileConfig
V RATE_TARGETS
V RESOURCE_STATS
T SkillMechanics
V STAT_IDS
T StatRule
T StatsSnapshot
T TargetContext
T TargetingRule
T TargetingSettings
T TimedAOESequence
T TimedObjectConfig
V upgradePlayerStatsConfig
V V2_PLAYER_STATS
V validAOECast
V validateCombatModifiers
V validateDefenseSettings
V validateDots
V validateProjectile
V validateSkillMechanics
T ValidationStage
V validMeleeCast
V validProjectileCast
V validTargetingRule
T Walkability
```

### @rpg/core/stats

```text
V ATTRIBUTE_IDS
V calculateEffectiveStat
T CharacterBaseStats
V cooldownDurationMs
T CoreAttribute
T CoreAttributeRule
V DEFAULT_CORE_STATS
V LEGACY_PLAYER_STATS
T PlayerStat
T PlayerStatsConfig
V resolveCharacterStats
V STAT_IDS
T StatRule
T StatsSnapshot
V updateCurrentResources
V upgradePlayerStatsConfig
V V2_PLAYER_STATS
```

### @rpg/core/modifiers

```text
T ActiveModifierSources
V collectActiveModifiers
T CombatModifier
V MODIFIER_OPERATIONS
V MODIFIER_SOURCES
V prepareModifierResolver
V resolveModifiers
V validateCombatModifiers
```

### @rpg/core/combat

```text
T ActionClassification
T ActionState
T ActiveCombatAction
V applyEntityDamage
V applyEntityHealing
V applyEntityManaGain
V cancelCombatAction
T CombatActionContext
V combatActionPhase
T CombatActionSlot
T CombatEntity
T CombatEntityIdentity
T CombatRejection
T CombatRestriction
V combatState
T CombatValidationContext
T CombatValidationResult
V completeCombatAction
T EntityCombatEvent
V factionRelation
T FactionRelation
T LifeState
V reconcileCombatRestrictions
V startCombatAction
T TargetContext
V validAllowedRelations
V validateCombatAction
V validateCombatEntities
V validateCombatEntity
V validateCombatHit
V validateMovementIntent
V validateTargetContext
T ValidationStage
```

### @rpg/core/damage

```text
T ActorOffenseInput
T ActorOffenseSnapshot
V calculateDamage
V DAMAGE_SOURCES
V DAMAGE_TAGS
T DamageContext
V damageDefinition
T DamageDefinition
T DamageDelivery
T DamageModifier
T DamageSettings
T DamageSnapshot
T DamageSource
V DEFAULT_DEFENSE_SETTINGS
T DefenseActor
T DefenseConfigSnapshot
T DefenseContext
T DefenseRule
T DefenseSettings
T DefenseType
V MAX_DAMAGE_SNAPSHOT_MODIFIERS
V mitigateDefense
V resolveDefenseHit
V snapshotActorDamage
V snapshotActorOffense
V validateDefenseContext
V validateDefenseSettings
```

### @rpg/core/skills

```text
T AcceptedSkillReplacement
V activateSkillInstance
V advanceSkillEffects
V advanceSkillExecution
V cancelSkillExecution
V cancelSkillInstance
V clearSkillEffects
V createSkillCooldownState
V createSkillEffectRuntime
V defineSkill
V deriveSkillRootDamage
V dispatchSkillEffects
V executeSkill
V finishSkillInstance
V inheritSkillCooldowns
V inspectSkillInstance
V nextSkillEffectBoundary
V pinSkillInstanceDefinition
V pinSkillTriggerBundle
V reconcileSkillRestrictions
V registerChildSkillInstance
V remainingSkillCooldown
V resolveSkillUpgrades
T RootOffensiveSnapshot
V rootSkillInstance
V SKILL_TRIGGER_LIMITS
V skillActionAdmission
T SkillActivatedEvent
V skillAvailability
T SkillAvailability
T SkillCooldownState
T SkillDamageComponent
T SkillEffectEnvironment
T SkillEffectEvent
T SkillEffectRuntime
T SkillEngineDefinition
V skillExecutionAvailability
T SkillExecutionContext
T SkillExecutionEnvironment
T SkillExecutionEvent
T SkillExecutionResult
T SkillExecutionSlot
T SkillExecutionSnapshot
T SkillGameplayEffect
T SkillIdentity
T SkillInstanceDefinition
T SkillInstanceRejection
T SkillInstanceResult
T SkillInstanceStatus
T SkillInstanceView
T SkillLifesteal
T SkillManaOnHit
T SkillOnHitDot
V skillRangeAvailability
T SkillRejection
T SkillResult
T SkillRootOffenseCapture
T SkillStackConsumption
T SkillStackPredicate
T SkillStackThreshold
T SkillTrigger
T SkillTriggerBinding
T SkillTriggerBundle
T SkillTriggerDimension
T SkillTriggerLink
T SkillTriggerReceipt
T SkillTriggerReceiptResult
T SkillTriggerResult
T SkillUpgrade
T SkillUpgradeResult
V startSkillAction
V validateSkillContext
V validateSkillDamageComponent
V validateSkillDefinition
V validateSkillEffects
V validateSkillTriggerReceipt
```

### @rpg/core/effects

```text
V applyDotSnapshot
V DEFAULT_DOT
V defineEffect
T DotConfig
V dotDamage
T DotGroup
T DotRuntime
T DotStack
T EffectApplyContext
T EffectApplyRequest
T EffectDefinition
T EffectGroupView
T EffectId
T EffectInstance
T EffectInstanceId
V EffectLifecycle
T EffectLifecycleEvent
T EffectLifecycleResult
T EffectModifier
T EffectModifierSource
T EffectOperationResult
T EffectRejection
T EffectRemovalReason
T EffectStackConsumePlan
T EffectStackConsumeRejection
T EffectStackConsumeRequest
T EffectStackConsumeResult
T EffectTerminalOutcome
T EffectValidationResult
V tickDotRuntime
V validateDots
V validateEffectApplyRequest
V validateEffectDefinition
V validateEffectInstance
```

### @rpg/core/mechanics

```text
V DEFAULT_INSTANT_AOE
V DEFAULT_MELEE_HITBOX
V DEFAULT_PROJECTILE
V DEFAULT_TIMED_AOE_SEQUENCE
V DEFAULT_TIMED_OBJECT
V detectInstantAOE
V detectMeleeHitbox
T HitboxTarget
T InstantAOE
V lockAOEPosition
T MeleeHitbox
V moveProjectile
T ProjectileBody
T ProjectileConfig
T ProjectileTarget
T SkillMechanics
T TimedAOESequence
T TimedObjectConfig
V validateProjectile
V validateSkillMechanics
```

### @rpg/core/spatial

```text
V canTraverse
V distance
V inRange
V isWalkable
T MapPoint
T Walkability
```

### @rpg/core/kernel

```text
T AttributeScaling
V calculateCooldownDurationMs
V calculateCritical
V calculateDamageB0
V calculateDamageB1
V calculateDamageBonusValue
V calculateEffectiveValue
V calculateHit
V calculateMitigation
V calculateResourceRegeneration
V calculateResourceTransition
V calculateStats
T CalculationContext
T CalculationIssue
T CalculationSnapshot
V captureCalculationSnapshot
V captureNumericalOffenseSnapshot
T CriticalCalculationInput
T CriticalCalculationResult
T DamageB0Input
T DamageB0Result
T DamageCalculationInput
T DamageCalculationResult
T DamageScaling
T DecimalPrecision
T DerivedStatRule
T HitCalculationInput
T HitCalculationResult
T Identifier
V matchesAnyTag
T MitigationCalculationInput
T MitigationCalculationResult
T ModifierAdapter
T ModifierIdentity
T ModifierOperation
T ModifierResult
T ModifierSourceSelection
V normalizeResource
T NumericalModifier
T NumericalOffenseSnapshot
T NumericBounds
T NumericContribution
T NumericRule
T NumericValues
T PreparedModifierResult
T PreparedStatCalculationInput
V prepareNumericalModifiers
T ProbabilityRule
T RandomRoll
T RatingMitigationRule
T ResolvedDamageBonus
T ResourceNormalizationInput
T ResourceNormalizationResult
T ResourceRegenerationInput
T ResourceTransitionInput
T ResourceTransitionResult
T ResourceTransitionRule
T Scalar
V selectCanonicalModifiers
T StatBreakdown
T StatCalculationInput
T StatCalculationResult
T StatModifierResolver
```

## Appendix C. Exact Legacy direct delegation sites

| Caller | Line at accepted HEAD | Resolved canonical callee |
| --- | ---: | --- |
| src/modifiers/modifier-core.ts#damageBonusReason | 18 | src/kernel/modifiers/modifier-resolution.ts#matchesAnyTag |
| src/modifiers/modifier-core.ts#damageBonusReason | 20 | src/kernel/modifiers/modifier-resolution.ts#matchesAnyTag |
| src/modifiers/modifier-core.ts#collectActiveModifiers | 39 | src/kernel/modifiers/modifier-resolution.ts#selectCanonicalModifiers |
| src/modifiers/modifier-core.ts#prepareModifierResolver | 45 | src/kernel/modifiers/modifier-resolution.ts#prepareNumericalModifiers |
| src/stats/stat-calculation.ts#cooldownDurationMs | 10 | src/kernel/stats/stat-calculation.ts#calculateCooldownDurationMs |
| src/stats/stat-calculation.ts#calculateEffectiveStat | 16 | src/kernel/stats/stat-calculation.ts#calculateEffectiveValue |
| src/stats/stat-calculation.ts#resolveCharacterStats | 33 | src/kernel/stats/stat-calculation.ts#calculateStats |
| src/stats/stat-calculation.ts#updateCurrentResources | 45 | src/kernel/resources/resource-calculation.ts#normalizeResource |
| src/stats/stat-calculation.ts#updateCurrentResources | 46 | src/kernel/resources/resource-calculation.ts#normalizeResource |
| src/stats/stat-calculation.ts#updateCurrentResources | 48 | src/kernel/resources/resource-calculation.ts#calculateResourceRegeneration |
| src/stats/stat-calculation.ts#updateCurrentResources | 49 | src/kernel/resources/resource-calculation.ts#calculateResourceRegeneration |
| src/combat/combat-entity.ts#applyEntityDamage | 9 | src/kernel/resources/resource-calculation.ts#calculateResourceTransition |
| src/combat/combat-entity.ts#applyEntityHealing | 15 | src/kernel/resources/resource-calculation.ts#calculateResourceTransition |
| src/combat/combat-entity.ts#applyEntityManaGain | 21 | src/kernel/resources/resource-calculation.ts#calculateResourceTransition |
| src/damage/defense-engine.ts#resolveDefenseHit | 12 | src/kernel/defense/defense-calculation.ts#calculateHit |
| src/damage/defense-engine.ts#mitigateDefense | 23 | src/kernel/defense/defense-calculation.ts#calculateMitigation |
| src/damage/damage-core.ts#calculateDamage | 39 | src/kernel/damage/damage-calculation.ts#calculateDamageB0 |
| src/damage/damage-core.ts#calculateDamage | 53 | src/kernel/damage/damage-calculation.ts#calculateDamageBonusValue |
| src/damage/damage-core.ts#calculateDamage | 57 | src/kernel/defense/defense-calculation.ts#calculateCritical |
| src/damage/damage-core.ts#calculateDamage | 61 | src/kernel/damage/damage-calculation.ts#calculateDamageB1 |
| src/damage/damage-core.ts#actorOffense | 71 | src/kernel/snapshots/snapshot-data.ts#cloneSnapshotData |
| src/damage/damage-core.ts#actorOffense | 71 | src/kernel/snapshots/snapshot-data.ts#cloneSnapshotData |
| src/damage/damage-core.ts#snapshotActorOffense | 118 | src/kernel/snapshots/snapshot-data.ts#cloneSnapshotData |
| src/damage/damage-core.ts#snapshotActorOffense | 119 | src/kernel/snapshots/snapshot-data.ts#freezeSnapshotData |

### Transitive wrapper paths

- src/modifiers/modifier-core.ts#resolveModifiers → src/modifiers/modifier-core.ts#prepareModifierResolver
- src/effects/dot-core.ts#dotDamage → src/damage/damage-core.ts#calculateDamage
- src/skills/skill-engine.ts#startSkillAction → src/stats/stat-calculation.ts#cooldownDurationMs, src/combat/combat-state.ts#startCombatAction
- src/skills/skill-effect-integration.ts#hit → src/damage/damage-core.ts#calculateDamage
- src/skills/skill-effect-integration.ts#applyDamage → src/combat/combat-entity.ts#applyEntityDamage
- src/skills/skill-effect-integration.ts#heal → src/combat/combat-entity.ts#applyEntityHealing
- src/skills/skill-effect-integration.ts#restoreMana → src/combat/combat-entity.ts#applyEntityManaGain
- src/skills/skill-effect-integration.ts#lifesteal → src/combat/combat-entity.ts#applyEntityHealing
- src/skills/skill-effect-integration.ts#manaOnHit → src/combat/combat-entity.ts#applyEntityManaGain
- src/skills/root-offense.ts#prepareRootOffense → src/damage/damage-core.ts#snapshotActorOffense

### Captured numerical callback seam

```json
[
  {
    "owner": "src/modifiers/modifier-core.ts#prepareModifierResolver",
    "producer": "src/kernel/modifiers/modifier-resolution.ts#prepareNumericalModifiers",
    "invocations": 1
  }
]
```

## Appendix D. All preservation record fingerprints

These SHA-256 values hash `JSON.stringify(record)` parsed from the current
authoritative baseline in its existing key order. They include complete approval
history; they do not replace declaration fingerprints or original source hashes.

| Index | Historical module | Current files | Declaration fingerprints | Complete record SHA-256 |
| ---: | --- | --- | ---: | --- |
| 0 | src/shared/data/combat-modifiers.ts | src/contracts/combat-modifiers.ts | 8 | 2bf06dcb5864d113bdf1676605ff3dad1b80975ec49c4c4226dfb9b6a3dbca31 |
| 1 | src/shared/data/damage-contracts.ts | src/contracts/damage-contracts.ts | 10 | 53ec87dbd20edb2e661bebebcbff142782a0766b35f892326f2cdbac4d42b399 |
| 2 | src/shared/data/defense-settings.ts | src/contracts/defense-settings.ts | 11 | 872f3fce51f2ca6e0600e5882f9fa87bf48efb0ceb8b1fc3820da383bc0dc1bd |
| 3 | src/shared/data/dot-contracts.ts | src/contracts/dot-contracts.ts | 4 | c784fcb523ed188226b2bcb3c1cbee12321f2582695f8df1ad9bf4e89d36ccab |
| 4 | src/shared/data/mechanic-contracts.ts | src/contracts/mechanic-contracts.ts | 19 | da2ea7242762c86835b23ceda4407f37625daccb5c9eb0a929de47e71f340e0a |
| 5 | src/shared/data/stat-contracts.ts | src/contracts/stat-contracts.ts | 24 | 4202e9d28ebc4630e73124898674f532872409002b1ab28f330500f1194e7f30 |
| 6 | src/shared/data/targeting-contracts.ts | src/contracts/targeting-contracts.ts | 3 | 089814a3b9af43b7aedf65b6b9e7aea60321c48e3d50319d6cc9307b295d43e3 |
| 7 | src/shared/data/skill-effects.ts | src/skills/skill-effects.ts | 12 | 06718cdb9ed8427ddf4be9131a2bdef7a37fe7af7182be7cb01d6517978635df |
| 8 | src/shared/game/combat-entity.ts | src/combat/combat-entity.ts, src/contracts/combat-entity.ts, src/kernel/resources/resource-calculation.ts | 12 | 16c2db3c3fc8270b552348ddaf4efed452284a138204784a343ad8be4a8780d3 |
| 9 | src/shared/game/combat-state.ts | src/combat/combat-state.ts, src/contracts/combat-state.ts | 29 | 42a692c747ef4f3a15f4d155d0e67236a3073957bf851a100878f596b12671ed |
| 10 | src/shared/game/damage-core.ts | src/damage/damage-core.ts, src/kernel/damage/damage-calculation.ts, src/kernel/contracts/damage-stages.ts, src/kernel/defense/defense-calculation.ts, src/kernel/snapshots/snapshot-data.ts | 19 | 9aa1bc5fdbd0843fa54ee34f297c179591a0482d4260c833110477d029cdb3fc |
| 11 | src/shared/game/defense-engine.ts | src/damage/defense-engine.ts, src/kernel/defense/defense-calculation.ts | 6 | 735e04f0726e5b442c72001ee361d0a726198df271f6b311e47d301638511cb4 |
| 12 | src/shared/game/stat-calculation.ts | src/stats/stat-calculation.ts, src/kernel/stats/stat-calculation.ts, src/kernel/resources/resource-calculation.ts | 11 | 37d7b25f2b680c05a14e09afc075691ada1cb3a44c0f450798cbffcc798f6d56 |
| 13 | src/shared/game/modifier-core.ts | src/modifiers/modifier-core.ts, src/kernel/modifiers/modifier-resolution.ts, src/kernel/contracts/modifier-resolution.ts | 19 | b4902a25f92fbf9f5d021228da67f1cdd3545f83ea27ebbfee2523313056e1df |
| 14 | src/shared/game/skill-engine.ts | src/skills/skill-engine.ts | 20 | efdbdf27b2a1c871b6e776efb38c8dfeba1d81d9b0c55aa8ef2f57b73f04eaca |
| 15 | src/shared/game/skill-execution.ts | src/skills/skill-execution.ts | 16 | bfe51f74043eb89a93fbd3e567906ab9ddb23c6fd6e120034ca2ee34e00400d9 |
| 16 | src/shared/game/skill-effect-integration.ts | src/skills/skill-effect-integration.ts | 34 | a31bc73d453376941f08ee074c6dc66a57ee75c000a046c113b6c048fc5ed427 |
| 17 | src/shared/game/effect-system.ts | src/effects/effect-system.ts, src/contracts/effects.ts | 23 | d484508718fd505857ce9f2b7f143e025cf2792ae856408517412e73b664d83d |
| 18 | src/shared/game/effect-lifecycle.ts | src/effects/effect-lifecycle.ts | 16 | c6bb60a952a6d08557cb26b7b069afc37f95734ba5d4087b3cadc07bd4e7d04b |
| 19 | src/shared/game/dot-core.ts | src/effects/dot-core.ts | 6 | cb63ada635789c6a27cc6ad85bac6061bd780d89a123539603a07ffd18b7e69c |
| 20 | src/shared/game/aoe-sequence-core.ts | src/mechanics/aoe-sequence-core.ts | 4 | 0c6a2d1b92f01094d97266fc7cc94d16ac0f230f6523a392e1c18d630b59fba9 |
| 21 | src/shared/game/emitter-core.ts | src/mechanics/emitter-core.ts | 2 | ed7885e1ae82909be6e6605ee9b561dc543f567ae1b16563f903fdf7ce15f31c |
| 22 | src/shared/game/instant-aoe.ts | src/mechanics/instant-aoe.ts | 3 | 15dbfe3ac54daeb41be82184e9d1d24e9ca498481ed76136047280a05794da31 |
| 23 | src/shared/game/melee-hitbox.ts | src/mechanics/melee-hitbox.ts | 6 | 628549ba239f19762b3ea70dfa9378e53660ed5f196af7bf0fedd60648b80586 |
| 24 | src/shared/game/projectile.ts | src/mechanics/projectile.ts | 8 | 88cd4c8fe5e559791cb688bdd132f6f30c03b9a6d9d2ec259d2fdb9ba0f9a893 |
| 25 | src/shared/game/grid-geometry.ts | src/spatial/grid-geometry.ts, src/contracts/spatial.ts | 4 | 36f4cd62dba7bdcb25e46dcaee5aa9f788f775d62684269a361cbba0de76af5e |
| 26 | src/shared/game/range.ts | src/spatial/range.ts | 2 | cf86e508549d172bb7a01c6e6ee4261af3c16a90922a90c259356b6773119c24 |

## Appendix E. Current emitted declaration SHA-256 inventory

Fresh read-only comparison against isolated accepted-source emission PASS: 99
Legacy files byte-identical; Kernel declarations byte-identical too. Each hash
below covers actual UTF-8 declaration bytes; no newline normalization is applied.

| File | SHA-256 |
| --- | --- |
| dist/combat/combat-entity.d.ts | c8f4b48623e963edc9a771c6ece1e1b282b3bd3c0e9be6dbe34b03060153204c |
| dist/combat/combat-state.d.ts | c633668baa042f8349ee81ac08b5f279e1b7390beb4fffd73964534653952abc |
| dist/combat/index.d.ts | 8d48ad860cffffe301019a4703c7cf459d06d6033a0978a7157b1e0b0277a9ad |
| dist/contracts/combat-entity.d.ts | b2217505ae7aba40e0774e45b60189245315900947ba7fa3c01a667a45d751e9 |
| dist/contracts/combat-modifiers.d.ts | d0a7d17f84fcdd8a87ee76e5b2eb5686a9d8a92b25fa6c12758e6651d2590fcf |
| dist/contracts/combat-state.d.ts | 8707cd596f7f47b9e62d8afa43695a431a7654978a832e8e911b04b7dffe7833 |
| dist/contracts/damage-contracts.d.ts | 010a4f7cf7f965ba84da7b3b8c3f8b402ce0f9df93430b422f3460d7f20da0b9 |
| dist/contracts/defense-settings.d.ts | 51776e7c2e51993a0af40004f6d651a0140a4ac852e28ab17e153027ce07bc1b |
| dist/contracts/dot-contracts.d.ts | 2736c0e4284ca1088a899e5cfb0e41b951e384024f10ea5f87e025059609784d |
| dist/contracts/effects.d.ts | 61fc99f33cbccdc6ba79d171d096032e5770b9b80431bc1433ad501a99bbbe6c |
| dist/contracts/index.d.ts | 12a1369c23633b4d079f8198ad759d08846a50f35326c34e82c397cc57a4c202 |
| dist/contracts/mechanic-contracts.d.ts | f54c91d82a811043d402d6aa5c13efd802ca13095313c6dc8c7ade3c38fe00ae |
| dist/contracts/spatial.d.ts | f71fb986e82970d5610cae1d3692f24dd0f707324d875ae9f4650704d932be27 |
| dist/contracts/stat-contracts.d.ts | f5c227aba52a0266219915f6674d978af1b00be787533fc1f66eac8c3ff54067 |
| dist/contracts/targeting-contracts.d.ts | 63df7bd338487f58822b3b964b4541bc67bbad234ff34b271585482c53e7ba45 |
| dist/damage/damage-core.d.ts | 9f2f3667e9ecca26ec0be2ebd70d6719c8156cffdf1f4ba4d0fb722795c4614a |
| dist/damage/defense-engine.d.ts | 8f2ccfca1e7cf68da9c888a1d0514de63b65fa1ed1fb96d76a15012632cc2cb4 |
| dist/damage/index.d.ts | 8248f0c04cb02876042819dbc17fca78c8e8f8528eef0a0579f2f4b38d4565e1 |
| dist/effects/dot-core.d.ts | acace09082862be1f70f7e345450ac2013a311b14ed2a4cef0049ee2fa12a57a |
| dist/effects/effect-lifecycle.d.ts | beb421c801e7cdd8b876e893536320cb08cdea0f996ec9121bee17cbec811fc1 |
| dist/effects/effect-system.d.ts | ee00f2091970881123c60fe43348c2c046d7991168826ca9da45c16a6d9f43bd |
| dist/effects/index.d.ts | d2184381e394f562cfad7f1d8777c3a04638bc58034a0b42760a5211ec3e390a |
| dist/index.d.ts | f4b7a1257cbcd98e91f6d6dfcc39826bfb339dd582c1af56f8eec7beb81dca1d |
| dist/kernel/contracts/common.d.ts | a4ca394ebff2fd301bdc7d7fae173a9b9f450f73c8da2cefaf7d04699e10dc2a |
| dist/kernel/contracts/damage-stages.d.ts | 3993049ac9069080ed7a6f25d67f7f14066cd29c018cc714ab31ef7761fc0c2f |
| dist/kernel/contracts/damage.d.ts | f5df9540734e1bf0e18cef89e6b6a019686e216ebc8e80dd4de409e13f36a80c |
| dist/kernel/contracts/defense.d.ts | 1c2a7232f949a1a58ffe44ce6a4392cf561394010ce283e19b320829b29a9eb1 |
| dist/kernel/contracts/modifier-resolution.d.ts | 89afe06034f2f84c5633fd932ca4a5bf6c44bc64fa2c1c9767e7d6ca8c93500f |
| dist/kernel/contracts/modifiers.d.ts | f328179dccbd9fd2fc46267a79977da8381581ac9e4876387c58f29eefa89b8a |
| dist/kernel/contracts/resources.d.ts | d609c5f611507296d578324082a8f79f9b8234b9923d882d08cd569cb53a7a90 |
| dist/kernel/contracts/snapshots.d.ts | 095549612213677c786db5d5dcf62aa1a79019513d8eec81f6ff5ea94df870ec |
| dist/kernel/contracts/stats.d.ts | 03a82ad950533b1ebd09509216449de0e99827ccc329d51a9ce7af0fa6e691ce |
| dist/kernel/damage/damage-calculation.d.ts | 51a5a2de644e188e1f73e33868308d0735445906e0749272300c429aef62d67e |
| dist/kernel/defense/defense-calculation.d.ts | 037b8f7e9c6445b64d3c9b033c3d5861f7b1555b75c012a58a311800d03dc230 |
| dist/kernel/index.d.ts | 9451bbfceaeef341db0fdd4b12ba7cdbb0fb44320d82484087ea7f1f6d082fc3 |
| dist/kernel/modifiers/modifier-resolution.d.ts | 0f6837c1398d415d0903a5c5a7357a732461f0c8f2be3ec7f234e14ec6848a28 |
| dist/kernel/resources/resource-calculation.d.ts | 5736a4aa201ea14fef78839bce84f3bcbe0de4d4aac83b29e951526f66ffe949 |
| dist/kernel/snapshots/calculation-snapshot.d.ts | f2b3f2759cc4c1ffec94e4676df5352b6a87627b26ad35b439f7014f8a8b8a50 |
| dist/kernel/snapshots/snapshot-data.d.ts | dd2f559a2991a62dc44cd150190c9eacc223fce67fa72d4e650e523e231c2ca9 |
| dist/kernel/stats/stat-calculation.d.ts | d118a090b8cb24987c6c5ad5fce7b9574b466268917f579cc4d48174715a2264 |
| dist/mechanics/aoe-sequence-core.d.ts | a3e8edc713f1822b6bf5f7b1913c69048a4c74a08ae484d7c437a64f16ff8fc4 |
| dist/mechanics/emitter-core.d.ts | f854eaf64730ddcbd272b67580143cf24282acb86fb5ea30ce59490444ea1abe |
| dist/mechanics/index.d.ts | 13041261e3fc7fceb3400e13e6a57c9a4023d7fb139b1cb5c91889bd16f5b736 |
| dist/mechanics/instant-aoe.d.ts | b03d940c3171e09d0e5519c25e9a712db745568e6c8dd32d2ccbe67b4d9f4979 |
| dist/mechanics/melee-hitbox.d.ts | 67dc24ea041360d753cb744dabc2d3fe859f85e6154b550c8e3077c24a91779d |
| dist/mechanics/projectile.d.ts | e00821a479150e38b342990cdbf2cdb2b763d7706274828319fc791c61fcddfe |
| dist/modifiers/index.d.ts | 67e66e308e89ff2d565a526fbcca429f3d4b16b9935b930e0bd897b8d6680f4e |
| dist/modifiers/modifier-core.d.ts | 2f966e3eb82ca362b01b6f6dd6f3920041369b2901fbad2fb29254e44f2cfe27 |
| dist/shared/data/combat-modifiers.d.ts | 4d3a0fd922f0491bda66c483ae3ca282d053d720152639704f3b6edd1476df74 |
| dist/shared/data/damage-contracts.d.ts | ad9f25da0c2364f1e25c5bc191a6d88cc416a66115696090924c25f9217bd0b0 |
| dist/shared/data/defense-settings.d.ts | 7cad4578c01082dcd619d6e392b9db37e55be6a2d24f1e013e96d4f619b6faff |
| dist/shared/data/dot-contracts.d.ts | a01ab2e04e59450e680d514a2c4b3342f9098b483e21782d5612cd5c5098350d |
| dist/shared/data/mechanic-contracts.d.ts | 056a6fec314be8ae834b086274e2402d355cf6fe7c27012bffa46003bfe2895f |
| dist/shared/data/skill-effects.d.ts | 216fdc469d95fe25f72731c126864270422b9f4fa9a959caee86c2b3d4c68eb0 |
| dist/shared/data/stat-contracts.d.ts | ae7904105bd1bcb8838ce8c40abcfe8c96d65b0b071cafe5cf5782229a864d88 |
| dist/shared/data/targeting-contracts.d.ts | cab1f246c81d1ec20ae81eb94ca8ebb920d83ad001fc8f74a2b5747e2ead5d31 |
| dist/shared/game/aoe-sequence-core.d.ts | b641ad3af3cf70cf692be14395d08d8d1d92db1ccaee4725ddf70e7d9d0b3eef |
| dist/shared/game/combat-entity.d.ts | aa13316cf1e5b086696612467028fb477af92d1d7dde6d51799155a01d43a8ec |
| dist/shared/game/combat-state.d.ts | 324a73118e74a17e4078a7a7d3d30214b94f77d15940263f0f53b88a2f9b5afc |
| dist/shared/game/damage-core.d.ts | 57bcbf17be8e6387314633e9ca02807e52128a78df51be639f0c1e67b6f23301 |
| dist/shared/game/defense-engine.d.ts | 32be41dbe7303edd19979345d59e183dfafd6576d9809544e59ae52133ffa8e3 |
| dist/shared/game/dot-core.d.ts | c5d7f39e7e1968a8f93b32c8eba2066450007dd515dd6240668e28310fbe68e9 |
| dist/shared/game/effect-lifecycle.d.ts | d6c7a4eef0deb9a462e9566f18ad4cd90a553fa935f288b3dbae49271703dfa4 |
| dist/shared/game/effect-system.d.ts | ed91426ae5a62ca1fe55a73dbea11038345a27e0b6503312cada7e38e4d5f471 |
| dist/shared/game/emitter-core.d.ts | e3628d27afac9f6cc51409b509261dbef85141e16d69c97b9c625b89860ac5e7 |
| dist/shared/game/grid-geometry.d.ts | b82ce32cdea181db7eec7c17daaf9034d9dba5cfe971c60ea204baecb922058e |
| dist/shared/game/instant-aoe.d.ts | b0ec2d72d0d8e2cc6dee933dfdfbc72cc33328d5f615c27b0078aae4efe2aebf |
| dist/shared/game/melee-hitbox.d.ts | ff3c70ce05ba3e4368e00ca3c624219c40de6ddb3ad445425032e7a799eb0fa9 |
| dist/shared/game/modifier-core.d.ts | f49bf3490fd3b92756de4f7754c5a64d951ff11dd40802c9052c6286b701d634 |
| dist/shared/game/projectile.d.ts | e67be6123f4d49a7fc6b651054a01f9620712a68e93c9406348b915ef112155a |
| dist/shared/game/range.d.ts | cc8702024f1e0096c388162044e01ebceecfba5abbde30e9d76b3085b19244dd |
| dist/shared/game/skill-effect-integration.d.ts | e27c7e5dbbdd5c3879d6dca86d2386f2451d682744d315c0f23ed5231e61ce2a |
| dist/shared/game/skill-engine.d.ts | dd8e4e6b1c25a332900b9b8dd350724ce6862343433fcab4e2b3c138694f4026 |
| dist/shared/game/skill-execution.d.ts | 3d5dd130987347a5f5d5aac03739807253c85f9574b22bfb4f0c6126313f6ae8 |
| dist/shared/game/stat-calculation.d.ts | 1e2590aa6aa02b6c93e1d9514397219f208492f76b7ba369ec073422ca79b998 |
| dist/skills/index.d.ts | 48764e67c64acf7237c9e59ab0a03cabacaf994c3306387f2d49cc7bf8b3e187 |
| dist/skills/root-offense.d.ts | 21307f61867c105df6e2ee91dfb7f1fbbd023f4dae46a60dcd58bdfde7ecacbb |
| dist/skills/skill-effect-integration.d.ts | 5dd223645417494d6ee568b3ee4e42a76ac2d5b9db76f7f319eeae8b9a2bd52f |
| dist/skills/skill-effects.d.ts | 63904db182dba3cf7b5eec6d7f4cf55ef487c3d99f438bd861ed3156c99b76cc |
| dist/skills/skill-engine.d.ts | e3abeebb8bcbd76748360fee63a33997256c47b3ab26f17e1426f3d42ad9e403 |
| dist/skills/skill-execution.d.ts | 55318f31c1ae352301791e81978e0f942eafcc6f1a501a1bed2da0e141480a65 |
| dist/skills/skill-instance.d.ts | ba1a129196adf3d90be6c4c50b51cc181d0226fafd348f8255f4c0be2bbf885b |
| dist/skills/skill-trigger.d.ts | 22e208bc4cdd60ffb00f8d7b723d9fac9958f33d6e4bae5a9fb7c63abe1d323a |
| dist/skills/skill-upgrade.d.ts | 6b5844a4e6c41b9d06a42f75f15a980bc7b5b396d62147eb1231c0c09a9e735f |
| dist/spatial/grid-geometry.d.ts | cef9954dc762f319e54fc43374306a2a1d16e66b3e70be482f9b075032c006e8 |
| dist/spatial/index.d.ts | d2bf030a7e4b504022032e8fc0cf0acaf480e978a96d78af08b40ea6b4012d42 |
| dist/spatial/range.d.ts | 5a070b0c937c70c645019dd03df25ef2cb5fa481b751a7f81a9104a476e7a1dc |
| dist/src/shared/data/combat-modifiers.d.ts | 810adea81cccd8301c8dc066ecc24d64f2259a095fd23fbc0dfa21d59da1b8c4 |
| dist/src/shared/data/damage-contracts.d.ts | 6e2e6593d0fdac02a19fc4680827ce069367d44adcaf0bd64580bf591afd53af |
| dist/src/shared/data/defense-settings.d.ts | 5d31d3c49e5a00a40fad90712646c6269aee6fc733c5e85797070b7e336e386d |
| dist/src/shared/data/dot-contracts.d.ts | a77b9999d95e2e0d548cc363129c2c8bdd9fc92500fe4b4bd5bd5d21ca846c4f |
| dist/src/shared/data/mechanic-contracts.d.ts | e6febf8a00e07c20002f96748fed10fe2fbd4167253b9d926020319e1e6ea224 |
| dist/src/shared/data/skill-effects.d.ts | 20c2e0db962b11e8961e2ca03b61b91eab8ef4654f1624a41cdde60e64dcca35 |
| dist/src/shared/data/stat-contracts.d.ts | 2c83bb0a7a7c610030d715cbdf7872fba04c5bb4fd1ed2ac9437dee590a44f7c |
| dist/src/shared/data/targeting-contracts.d.ts | 91cfa6ea5daa0f522e9404cc78a65998ccd87a879569e07b71d07f804a65adb9 |
| dist/src/shared/game/aoe-sequence-core.d.ts | cfa63858c6126235a9198d6ff12eec3b7e351f98d9e226e604f6f20d255680b4 |
| dist/src/shared/game/combat-entity.d.ts | 8e301b0d3ff9811e7fd154ff216ad258bc84da03928e0ad45ea9be549e98e445 |
| dist/src/shared/game/combat-state.d.ts | d3b62506b05b7c90cb53763aa888ba37d144d459bc2c1d600217c77c72015f0a |
| dist/src/shared/game/damage-core.d.ts | 3128bee1041ff036ca8d9f5a10c906825ad3197eefd047f815de39420949f20d |
| dist/src/shared/game/defense-engine.d.ts | e5e2d9f2bb601a4ab3e8a79289dc008fa5466768f96fe0f33797b36c8a84a005 |
| dist/src/shared/game/dot-core.d.ts | be5ce96ba43a7a7c9276cadf9822058d45686f49940e6410dd7609edef8f3da5 |
| dist/src/shared/game/effect-lifecycle.d.ts | 1d48921e3bd415544967bffc0adab680799bec5f8ddeee49890b8717763fb100 |
| dist/src/shared/game/effect-system.d.ts | 310de7a4e01b474e058af13016589cbed9532e8294723569adc1157fa09f14d0 |
| dist/src/shared/game/emitter-core.d.ts | 475370068be2d833034ec2aed26f37c442557e58b9ad41a8c5fa19ab8bb605c2 |
| dist/src/shared/game/grid-geometry.d.ts | 4c56b0d695e215ee7671740a418fffe26f3d4df1f31292a5b8391976d6ba5723 |
| dist/src/shared/game/instant-aoe.d.ts | 351d7da831506bb3f7de820282f806b5ef7ecf74377c7b8006515b3503a8e867 |
| dist/src/shared/game/melee-hitbox.d.ts | b1e49fad1d6b6992630485131e12dbacf1baf707ff553fd62d67834585f14e48 |
| dist/src/shared/game/modifier-core.d.ts | 2d88fe5622c741eb86dc9b40acb661044bdd3606ae170063bce755a67f646418 |
| dist/src/shared/game/projectile.d.ts | b536ee13dcb0ff022cf71cf6dc303a63d420e22ef7bd9f03c0678418a211f460 |
| dist/src/shared/game/range.d.ts | ccb8f667b86baa2da8e5cb5dfc201471d60fd8e20c6cef9d6ba93c9d6fb97e44 |
| dist/src/shared/game/skill-effect-integration.d.ts | e064f2a20805fc8968150fb8ab7efa1c0ee5f8a29aad9535d65130497d497963 |
| dist/src/shared/game/skill-engine.d.ts | 859346bea5649a5a46a4314c86e9008aeb662c738bb626fc4b3c138688990904 |
| dist/src/shared/game/skill-execution.d.ts | ed63478e3dec3f3dce661624dd94a16ab34af1599a4738dfb983f29e51c87494 |
| dist/src/shared/game/stat-calculation.d.ts | 9e90dc135bec77f25cc7375de06e2c21a86b2a28f5e7bbd1e23a3d165f977f4b |
| dist/stats/index.d.ts | f920c12a6e23fdd8f576e350cfbd16949acbb6466d2b5490f57af0e0392278e4 |
| dist/stats/stat-calculation.d.ts | 1a2ec4ad0714e7f6450b032a2a03eaf7e7724ed95b715a3bb041f3663e06a9a9 |

## Appendix F. Fresh read-only review outcomes

- `node scripts/review-gameplay-boundary.mjs`: PASS.
- `node scripts/review-legacy-isolation.mjs`: PASS; 61 scenarios, 99 unchanged Legacy declaration files, 27 unchanged records.
- `node scripts/review-multi-rpg-consumers.mjs`: PASS; three consumer trees and accepted expectations/provenance rechecked. Installed execution evidence is reused from the accepted v2.0.11 installed log, not executed anew in Gate A.
- No new Vitest execution or final full verification was run for this Gate A plan.
- Final preflight protected diff is empty; the only repository change is this plan.
