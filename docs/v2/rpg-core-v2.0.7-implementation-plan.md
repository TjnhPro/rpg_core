# v2.0.7 Resource Calculation Extraction — implementation plan

Status: **BLOCKED — IMPLEMENTATION PLAN REVIEW**. This document proposes Gate A;
it does not authorize implementation or preservation amendments.

## Baseline and preflight

- Accepted starting HEAD: `7b43bc5046ada04ce600ad714bfa34172dc5e160`.
- Branch: `audit/v2.0.0-architecture-boundaries`.
- [PR #6](https://github.com/TjnhPro/rpg_core/pull/6): OPEN, targeting `main`,
  remote PR head equals the starting HEAD. Working tree was clean before this plan.
- Local Node: `v24.18.0`.
- Compiler-API inventory of current source: Kernel **58 symbols / 12 runtime
  values**; root **243 symbols / 122 runtime values**.
- Reviewed repository guidance, architecture/migration and .2/.3/.5/.6 milestone
  evidence; resource contracts, Combat/Stats facades, Skills admission/execution/
  effects/integration, DoT path and v1.2.0/.1/.2/.4/.5 recovery evidence.
- This preflight makes no production edits, baseline edits, golden capture,
  commit, push or PR modification. No new verification results are claimed.

## 1. Current call graph and ownership

```text
Skills damage contact / DoT tick
  -> applyDamage -> applyEntityDamage -> HP commit -> existing events/lifecycle
Eligible landed contact
  -> lifesteal -> applyEntityHealing -> source HP commit
  -> manaOnHit -> applyEntityManaGain -> source MP commit
heal / restoreMana
  -> resourceRecipient [+ resourceSource where currently required]
  -> live recipient maximum + flat/percent requested amount
  -> applyEntityHealing / applyEntityManaGain -> commit -> positive recovery event
Public Stats consumer -> updateCurrentResources -> normalized/regen HP/MP result
startSkillAction -> existing admission/action -> direct MP cost commit
```

The three Combat primitives currently own scalar transitions. Stats owns
normalization and regen. Production calls to the primitives are in
`src/skills/skill-effect-integration.ts`; the public healing/mana examples also use
them. `updateCurrentResources` is exported for callers and covered by Stats tests;
there is no internal production call site. Combat and Stats public barrels and
historical forwarders retain the same functions.

DoT uses the accepted Damage path and the existing HP commit path; this extraction
does not add DoT recovery or change stack attribution. Combat state/admission
continues to infer liveness from the committed entity HP.

## 2. Exact public API proposal

Add only these runtime exports through `@rpg/core/kernel`, implemented together in
`src/kernel/resources/resource-calculation.ts`:

```ts
export function calculateResourceTransition<Resource extends string = string>(
  input: ResourceTransitionInput<Resource>
): ResourceTransitionResult<Resource>;

export function normalizeResource<Resource extends string = string>(
  input: ResourceNormalizationInput<Resource>
): ResourceNormalizationResult<Resource>;

export function calculateResourceRegeneration<Resource extends string = string>(
  input: ResourceRegenerationInput<Resource>
): ResourceTransitionResult<Resource>;
```

All six existing resource contracts remain unchanged. `ResourceTransitionRule`
selects bounds/increase policy; `ResourceTransitionInput` supplies one operation;
`ResourceTransitionResult` carries authoritative applied amount and minimum
transition. Normalization uses its existing input/result pair. Regeneration uses
`ResourceRegenerationInput` and the existing transition result, without a new type.
No root re-export, package subpath, callback contract or API alias is added.
Expected Kernel inventory: **61 symbols / 15 runtime functions**; recompute after
implementation rather than treating this estimate as verification evidence.

These are numerical primitives for caller-validated inputs, not entity/schema
validators. Document finite ordered bounds, finite nonnegative amount/rate/time,
transition current at or above minimum, and normalized regen current within bounds
as caller preconditions. Normalization deliberately permits negative finite current.
Do not add eager generic finite/range validation to Legacy's post-validation path:
live getters can change values after validation, and their arithmetic/native errors
must retain the accepted behavior. Native getter/toFixed exceptions propagate.

The transition's explicit `currentAboveMaximum: 'reject'` policy will throw
`Error('Current resource exceeds maximum')` before transition arithmetic. Legacy
retains its existing earlier bounds checks/messages, so that generic policy error
is not observable through its valid scalar-argument adapters. Other malformed
inputs outside the documented preconditions gain no new validation guarantee.
Generic stable/pure inputs are required for deterministic independent consumption;
readonly types do not promise detached copies or runtime freeze.

## 3. Numerical formulas and policy mapping

Let `c` be current, `m` minimum, `M` maximum, `a` amount. Enforce the selected
above-maximum rejection first, without normalizing an allowed above-max current.

| Operation | After | Applied |
| --- | --- | --- |
| Decrease | `Math.max(m, Math.min(M, c - a))` | `Math.min(c - m, a)` |
| Increase, blocked at minimum | `m` when `c === m` and increase-from-minimum is false | `after - c` |
| Other increase | `Math.min(M, c + Math.min(a, M - c))` | `after - c` |

All results carry `{resource, before: c, after, applied, reachedMinimum}` with
`reachedMinimum = c > m && after === m`. For an explicitly allowed above-max
increase, preserve this same formula (it can normalize downward); do not invent
an additional policy or redefine applied as an absolute value. Independent tests
will document this case and nonzero minima.

| Legacy facade | Minimum | Above maximum | Increase from minimum | Projection in original key order |
| --- | --- | --- | --- | --- |
| `applyEntityDamage` | 0 | allow | irrelevant to decrease | before, after, appliedDamage, defeated |
| `applyEntityHealing` | 0 | reject | false | before, after, appliedHealing |
| `applyEntityManaGain` | 0 | reject | true | before, after, appliedMana |

Damage above max retains the intentional discrepancy between applied and net
change: `120, 10, 100` yields after100/applied10, not applied20. Keep zero/-0,
fractional arithmetic, exact depletion and overkill behavior. Healing stays inert
at zero HP; MP can recover from zero. Clamp recovery increment before addition,
including near `Number.MAX_VALUE`; no rounding or new amount cap.

Normalization retains `Math.max(m, Math.min(M, current ?? M))`, with result
`{resource, before, after, initialized: before === undefined}`. Undefined initializes
full; zero does not. Negative finite and above-max current clamp. Legacy projects
only `{currentHp, currentMp}`.

Eligible regeneration retains exactly:

```text
after = Math.min(maximum, Math.max(current,
  Number((current + ratePerSecond * elapsedSeconds).toFixed(decimalPlaces))))
applied   = after - current
```

No extra lower clamp or recovery-transition substitution is added; callers first
normalize current. Use the common reachedMinimum expression. Ineligible generic
regen returns unchanged current, applied0, reachedMinimum false, without reading
maximum/rate/time/precision. Stable normalized inputs make applied nonnegative;
Legacy live-max mutation retains the formula's actual result, even a decline.
Precision is caller-provided; Legacy supplies12. Native toFixed behavior is retained,
including overflow intermediates to Infinity followed by the finite maximum cap.
The inner Math.max guard preserves living fractions below 1e-12. Keep this as an
ordered expression: do not hoist the candidate ahead of the maximum getter.

## 4. Legacy validation and evaluation order

Keep the existing validation expressions and these exact ordinary Error messages:

- `Validated nonnegative HP/damage required`
- `Validated nonnegative HP/healing and HP bounds required`
- `Validated nonnegative MP/gain and MP bounds required`
- `Invalid resource input`

Combat parameters are already scalar values. Validate first, delegate once, then
project the original result; no new references or generic resource labels leak
into Legacy results or declarations.

`updateCurrentResources` keeps its validation expression in place. Its initial
array evaluates `maxHp`, `maxMana`, `hpRegen`, `manaRegen`, elapsedMs before `.every`;
all four property reads occur even if the first value is invalid. The hp/mp
nonfinite check follows only if that check passes. Getter throws escape unchanged.

Then delegate HP normalization before MP normalization. Use Legacy-owned forwarding
accessors for maxima, not a snapshot. Kernel normalization must read maximum as
the first `Math.min` operand, and read it again only for the nullish-current fallback.
Input construction and result metadata must not add reads of the original Stats
object. Current/minimum/resource labels are plain scalar properties.

After both normalizations, keep `if (alive && currentHp > 0)` in Legacy. Inside
that branch compute `seconds = elapsedMs / 1000` once; delegate HP regen, then MP
regen. Forward maximum and rate through accessors. Kernel reads maximum before
rate, matching evaluation of the original outer Math.min argument before the
candidate expression. Do not read either merely to construct an input or emit
metadata. No post-normalization max/rate reads occur when the branch is skipped.
Validation reads still occur on the skipped branch, exactly as before.

There is no elapsedMs property getter *inside* the accepted scalar-parameter API.
Golden cases will cover a getter-backed elapsed argument evaluated at the call
site, mutation of the elapsed argument holder by Stats getters (the captured scalar
must stay captured), and getters on the standalone generic elapsedSeconds input.
Do not claim late-read elapsedMs behavior that the accepted API does not have.
No callback or mutable elapsed holder is added to public contracts.

If forwarding accessors cannot retain exact accepted reads/errors without a
contract delta, stop and present that delta instead of eagerly capturing values.

## 5. Skills boundary decision proposed for approval

Keep **all Skills, Effects and Combat-state production files unchanged**.

- Percent `maximum * percentOfMax` remains amount resolution in Skills, using the
  same live recipient maximum once at the existing point. The six scalar resource
  contracts accept the resolved amount; no amount-resolution helper is necessary.
- Lifesteal retains `actualAppliedDamage * rate` in Skills. It never substitutes
  net HP change, pre-defense damage or overkill. Actual resource application has
  exactly one owner through the Combat facade and Kernel transition.
- Mana on Hit retains eligible landed contacts, including zero-damage contacts;
  Dodge/DoT behavior and original-source identity remain unchanged.
- `resourceRecipient`, `resourceSource`, admission pins, root/child identity,
  receipt/replay checks, queues/budgets, expiry and disposal keep their current
  owners. No source/recipient lookup enters Kernel.
- `startSkillAction` retains admission and the existing direct MP cost subtraction,
  its ordering, exactly-once commitment, cooldown and cancellation behavior. Do not
  route spending through the new decrease primitive in this milestone.
- Existing commits, observer-visible states, positive-event gating, rejection
  payloads and defeat lifecycle remain in the current integration path.

Retain the recovery acceptance event sequence exactly: damage-applied,
entity-defeated, mana-gained, effect-hit, healing-applied, healing-applied,
mana-gained. Damage and synchronous recovery commits must still precede observers.
This boundary needs no Skill preservation amendment or new recovery engine.

## 6. Golden and independent-consumer evidence

After implementation approval and **before production edits**, capture static
oracle fixtures from the accepted Git revision above using an isolated accepted
source build, following the existing capture-tool pattern. Pin source SHA-256 for
the invoked sources and accepted revision. Tests share scenario definitions, not
an alternative calculator. The capture command must refuse changed accepted input
sources and must not regenerate goldens from the extracted implementation.

Record nested results/key order and ordered getter/observer traces. Losslessly
encode undefined, NaN, +/-Infinity and -0; compare exact floating-point values.
Assert error class/message, the original thrown-object identity within each run,
and source/recipient reference identity. JSON cannot itself carry object identity;
runtime assertions record and verify that evidence explicitly.

| Evidence group | Required cases |
| --- | --- |
| Damage | zero/current0/max0, exact depletion, overkill, above max/net-change asymmetry, fractions/-0, invalid negative/nonfinite inputs |
| Healing/MP | normal/capped/full, zero amount, HP no revival versus MP zero recovery, max0, above-max rejection, fractions, MAX_VALUE-safe addition, exact applied values and validation precedence |
| Normalization | undefined, zero, negative, above maximum, reduced maxima, HP-before-MP order, invalid/nonfinite values |
| Regen | zero time/rate, alive false, HP0/MPpositive, HPpositive/MP0, sub12-digit fractions, rounding boundaries, large finite/overflow intermediates, exact12 precision |
| Mutable configuration | repeated/mutating maxima/rate reads; changes validation->normalization, HP->MP normalization, HP->MP regen; getter throws/errors by identity; captured elapsed argument and call-site evaluation; skipped branch reads |
| Integration | flat/percent recovery and caps; live maxima/modifier expiry; actual-damage lifesteal; zero-damage Mana on Hit; fatal recovery/event/observer ordering; root/child identity, dead/replaced/missing sources/recipients, relation rejection, replay/exactly once, disposal and existing resource-cost invariants |

Run the existing recovery suites unchanged; add focused cases only where existing
coverage does not establish the extraction's boundary. Preserve all .3-.6 golden
fixtures/scenarios and accepted numerical implementations byte-for-byte.

Add strict compile/native ESM installed fixtures importing only
`@rpg/core/kernel`: Text RPG `health` (decrease/heal/no revival/cap), Vo Lam
`sinhLuc`/`noiLuc` (normalization/regen12/different zero policies), ARPG `energy`
(high-magnitude safe recovery/rate regen/custom nonzero minimum). Assert exact
numbers and generic identifier inference, with no Legacy entities or gameplay
types. Include explicit rejection-policy and ineligible-getter tests.

## 7. Expected file inventory and compatibility checks

Production changes, only after Gate A approval:

- Add `src/kernel/resources/resource-calculation.ts`; export the three functions
  from `src/kernel/index.ts`.
- Adapt only the three functions in `src/combat/combat-entity.ts` and only
  `updateCurrentResources` in `src/stats/stat-calculation.ts`. Existing validators,
  Stats/cooldown algorithms, Modifier/Damage/Defense implementations stay unchanged.

Evidence/tooling additions proposed:

- `scripts/capture-resource-golden.mjs`, `scripts/review-resource-preservation.mjs`.
- `tests/fixtures/resource-parity-scenarios.mjs`, `resource-parity-golden.json`,
  `kernel-resources-consumer.ts`; resource parity/independent numerical test suites
  under existing Combat/Stats test directories.
- Extend `scripts/consumer-smoke.mjs` for installed resource fixtures/inventory;
  extend existing architecture/declaration fixtures only if needed to establish
  the new file's real boundary/closure. Do not weaken any existing gate.
- `docs/v2/2.0.7-resource-calculation-extraction.md`, fingerprint/proposal JSON;
  update README, AGENTS, ARCHITECTURE and test-coverage ownership/evidence as needed.
  Historical milestone reports remain unchanged.
- Baseline changes are reserved for separately approved Gate C.

Verify all **99 non-Kernel emitted declaration files byte-identical** against an
isolated accepted-source emit, including the four inferred Legacy return types.
Keep10 old entrypoints, root243/122,27 forwarders, namespace identities, metadata/
version, blocked deep imports and export boundaries unchanged. Confirm Kernel
source and emitted declaration closure, custom names and no runtime cycles.
No Kernel->Legacy imports, including types/barrels. No Kernel root re-export,
resource state, snapshot copying/freezing or new mechanics.

## 8. Preservation proposal and stop conditions

Only historical modules **8 and 12** are expected to change:

- Module 8, `src/shared/game/combat-entity.ts`: replace fingerprints for the three
  transition facades; retain entity validators/contracts and the complete v1.2.0
  approval plus v1.2.2 follow-up history.
- Module 12, `src/shared/game/stat-calculation.ts`: replace `updateCurrentResources` only;
  retain all accepted Stats declarations, the existing Kernel Stats registration,
  v2.0.3 approval and callback-parity provenance.

Register the single new Kernel resource implementation in both currentFiles
lists. New numerical declarations appear in both dependent-module fingerprint
inventories; this registration is not a second implementation.

At Gate B provide exact before/after declaration fingerprints and source hashes,
changed/removed/added declaration names,99-file compatibility comparison, parity/
architecture evidence, and a minimal RFC6902 patch with old-value test operations.
Dry-run in memory and assert all **25 other modules** and prior approval history
are unchanged. Keep original hashes in approval provenance, with new authority
PENDING until separately reviewed. Do not edit `docs/behavior-baseline.json`.

Stop at **BLOCKED — PRESERVATION REVIEW**. Any impact outside8/12 (particularly
Skills14/15/16), contract delta, numerical drift or unexpected source change needs
a separate minimal delta plan; passing integration tests cannot waive that gate.

## 9. Verification and final delivery sequence

After Gate A approval: install with `npm ci --ignore-scripts`; capture accepted
oracle; implement approved cut; run build, typecheck, targeted Combat/Stats/resource
parity and recovery integration suites, architecture/declaration checks and installed
consumer; generate the read-only preservation proposal. The authoritative
preservation checker may reject the pending amendment; do not bypass it or describe
that pending state as full verify PASS. Stop at Gate B with actual counts/results.

Only after exact preservation approval: recheck all fingerprints, apply only the
approved amendment, run full `npm run verify` and `git diff --check`, record actual
tests/files and consumer/declaration results, commit
`feat(kernel): extract canonical resource calculations v2.0.7`, and push the
existing branch to PR6. Update its description; wait for Node22.13.0 and24 GitHub
Actions SUCCESS on the exact final HEAD. Report READY FOR REVIEW with SHA, final
changed-file inventory, counts, CI links and limitations. No merge/release/.8.

Requested Developer decisions: approve the three signatures and preconditions/
explicit above-max rejection policy; approve the six-contract mapping/formulas;
approve lazy accessors retaining accepted reads; approve leaving percentage amount
resolution, lifesteal products and MP cost in Skills; approve the proposed evidence
and modules8/12 preservation cut. Preservation itself remains a separate gate.
