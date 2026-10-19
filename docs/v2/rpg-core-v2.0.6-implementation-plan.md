# v2.0.6 Critical & Defense extraction — implementation proposal

Gate A proposal, subsequently **IMPLEMENTATION APPROVED** by the Developer at
baseline `65334063e7ceac788ff2f73122694a158a10c5a8`. The decision approves the
three APIs, unchanged nine contracts, live adaptation and fixed fractional Text
RPG reduction. The original proposal below records the pre-implementation audit.
Current evidence is in [the extraction report](2.0.6-critical-defense-extraction.md).
The Developer separately approved the exact preservation delta on 2026-10-18.
The original gate requirements below remain as the reviewed workflow history.

## Verified starting point

- Branch: `audit/v2.0.0-architecture-boundaries`.
- Local HEAD and open PR #6 head: `65334063e7ceac788ff2f73122694a158a10c5a8`.
- Working tree was clean before adding this proposal; no concurrent edits were
  observed. Recheck before implementation; changes require reconciling the base.
- Task explicitly accepts v2.0.5. Its historical report remains unchanged.
- Exact-base push workflow [39106068557](https://github.com/TjnhPro/rpg_core/actions/runs/39106068557)
  and PR workflow [39106072372](https://github.com/TjnhPro/rpg_core/actions/runs/39106072372)
  are completed SUCCESS. The accepted verification has 927 tests / 43 files;
  those are baseline counts, not results for this proposed milestone.
- Local Node: 24.18.0. `npm run check:architecture` rerun: PASS, 58 modules,
  zero runtime cycles; source/emitted Kernel closure: 55 symbols / 13 files.
- Module 10 and 11 source fingerprints match their current approved baseline.
  Module 10 checkpoint is v2.0.5; module 11 has no later amendment.
- Fresh `npm run build` and `npm run check:preservation`: PASS, all 27 modules,
  unchanged reviewed declarations and compiled historical namespace identities.
- Read the task, AGENTS, README, ARCHITECTURE, migration matrix, .2/.4/.5 reports,
  baseline, public Damage/Kernel APIs, contracts and relevant tests/tooling.

## Current call graph and ownership

```text
Skill dispatch/contact -> strike -> calculateDamage
DoT tick -> dotDamage -> calculateDamage per stack
Public callers / installed examples -> calculateDamage
  prepare canonical flat/bonus modifiers (v2.0.4 Kernel through Legacy)
  construct event and DefenseContext
  resolveDefenseHit -> validateDefenseContext -> Legacy Dodge arithmetic/RNG
    dodged: mitigateDefense(0) -> unchanged zero-result mapping; return
    landed:
      Kernel calculateDamageB0 (unchanged)
      Legacy bonus eligibility/diagnostics; Kernel item bonus aggregation
      Legacy Critical roll -> clamp -> comparison -> selected bonus
      Kernel calculateDamageB1 (unchanged)
      mitigateDefense -> validateDefenseContext -> validate damage
        select Physical/Armor or Magic/Resistance rule
        private ratingReduction -> Legacy final/prevented damage
        Legacy config/mechanics/mitigation diagnostics
Public resolveDefenseHit / mitigateDefense callers also enter these facades.
```

Production calculation call sites are in `src/damage/damage-core.ts`,
`src/skills/skill-effect-integration.ts:152` and `src/effects/dot-core.ts:39`.
`ratingReduction` has one caller, `mitigateDefense`. DefenseContext validation is
called by both Defense facades. DEFAULT_DEFENSE_SETTINGS selection occurs there;
`validateDefenseSettings` also guards `snapshotActorOffense`. Other occurrences
are contracts/barrels, tests, fixture setup and public examples. No caller changes
in Effects, Skills, snapshots or settings validators are proposed.

After extraction Kernel owns chance clamps, lazy roll resolution/comparisons,
Dodge consumed-roll validation, selected nonnegative Critical bonus, generic
rating/level/K/reduction arithmetic and final/prevented damage. Legacy retains
gameplay eligibility, DamageType routing, selected/default rules, validation,
config provenance, original context and public diagnostic vocabulary/shape.

## Proposed public APIs and existing-contract mapping

Add `src/kernel/defense/defense-calculation.ts`, exported only by Kernel:

```ts
export function calculateHit(input: HitCalculationInput): HitCalculationResult;
export function calculateCritical(input: CriticalCalculationInput): CriticalCalculationResult;
export function calculateMitigation<RuleKey extends string = string>(
  input: MitigationCalculationInput<RuleKey>,
): MitigationCalculationResult<RuleKey>;
```

No new public type, contract replacement, overload, configuration source or
package subpath is proposed. All nine existing exports remain unchanged:

| Existing contract | Use |
| --- | --- |
| RandomRoll | Explicit numeric roll or synchronous lazy callback |
| ProbabilityRule | Caller-selected enabled flag and independent optional bounds |
| HitCalculationInput | Resolved eligibility, live chance, selected rule, lazy roll |
| HitCalculationResult | Numerical hit outcome; Legacy adds delivery/status labels |
| CriticalCalculationInput | Eligibility, selected rule, lazy roll/chance/bonus |
| CriticalCalculationResult | Chance, roll, selected additive bonus, diagnostic multiplier |
| RatingMitigationRule | Selected coefficients, enabled flag, bounds, scaling flag |
| MitigationCalculationInput | Opaque key, damage, captured rating, live levels/rule |
| MitigationCalculationResult | Complete numerical diagnostics, final/prevented damage |

Starting inventory is measured: 55 symbols, 46 types, nine runtime functions.
The proposed delta is three runtime functions. Recompute actual source, emitted
and installed exports after implementation; expected 58 symbols / 12 functions
is a projection, not acceptance evidence. Runtime signatures reference only the
already reachable contracts; actual reachable-file count must also be measured.

Existing NumericBounds omission means unbounded: absent min/max use -Infinity /
Infinity. Do not use nullish defaults to normalize a *present* invalid undefined
bound: Legacy forwarding getters are always present and must preserve its NaN
behavior for malformed unchecked configuration. Access bounds in min, max order.
No generic schema validation or probability normalization is added. Preserve
primitive-specific Number semantics, including NaN/Infinity and signed zero.

## Hit primitive and Legacy adapter

Keep `validateDefenseContext`, default parameters and rule selection unchanged.
Capture `rule` then `dodgeEligible` at their existing points. Pass a plain wrapper
with live `dodgeChance`, `enabled`, `min`, `max` getters forwarding to the captured
rule/context. Do not spread the live rule or capture its fields eagerly.

Kernel evaluation follows the original expression:

1. enabled -> eligible -> chance presence; preserve short-circuiting.
2. If enabled/eligible/present, read min -> max -> chance, then max/min clamp.
3. Only chance > 0 consumes the supplied roll. Copy roll to a local before calling
   a function, preserving the original unbound Dodge callback receiver.
4. Consumed non-null value rejects nonfinite/out-of-range values with exactly
   `Error('Dodge roll must be0..1')`. Skipped invalid numeric rolls are untouched.
5. Compare strictly `<`, then read the live enabled diagnostic after RNG.

Legacy projects hit/dodged/onHitSuccess, renames eligible to dodgeEligible, and
adds `status: 'implemented' as const` in the existing key order. A roll callback
may mutate the captured rule or context; golden traces must prove the old late
enabled read and already-captured eligibility/chance survive.

## Critical primitive, receiver and RNG boundaries

Call only at the existing Critical location after bonus diagnostics and before
B1. Legacy maps captured `scope !== 'dot'` to eligibility, supplies a local
constant enabled rule with [0, .85] bounds, and uses live chance/bonus getters.
This is the old policy expressed numerically, not a new Critical setting.

Legacy supplies a lazy roll thunk equivalent to the original expression:

```ts
() => typeof input.roll === 'function' ? input.roll() : input.roll
```

This retains both property reads and the original `input` receiver for method
callbacks. Merely forwarding `input.roll`, binding it early or capturing the
function once would change accepted getter/receiver behavior. The thunk is
created without reading the original roll property.

Kernel skips disabled/ineligible Critical (chance 0, roll null, false, bonus 0,
multiplier 1); eligible enabled Critical consumes exactly one roll even at zero
chance, before reading/clamping chance. It performs no Dodge-style validation.
Only successful Critical reads bonus and applies `Math.max(0, bonus)`.
Multiplier is diagnostic `1 + bonus`; B1 consumes the bonus directly.

Legacy maps only DoT's skipped roll to its sentinel 1. Do not use `roll ?? 1`,
which could normalize unchecked direct-call values. Keep the old public Critical
object shape; do not expose multiplier. A dodged branch never reaches this stage.
Test mutation of chance/bonus/config/modifiers, roll getters returning different
functions on successive reads, callback receiver, thrown object and no later calls.

## Rating mitigation and exact observation strategy

Select settings and magic routing in Legacy as before, then select the rule and
read the chosen rating once. At the old function-entry boundary capture exactly
one `rule.coefficients` reference. The numerical wrapper uses that captured
object; replacing rule.coefficients later must not retarget this calculation.
Forward sourceLevel/targetLevel via getters over context.source/target.level;
do not capture either actor or its level. Forward enabled/min/max from the
captured rule, and baseK/levelPenalty from the captured coefficient object.

Existing optional properties support these getters. Where exact optional types
require a non-null assertion for a forwarding getter, the assertion erases only
at compile time: undefined must still reach Kernel and its missing checks. Do
not default, prevalidate or change contracts just to satisfy adapter typing.

Kernel performs these operations in the original sequence:

1. Read scaling flag once; Legacy maps `c.levelScalingEnabled !== 0` here, so
   undefined and every nonzero value retain the original true meaning.
2. Test finite positive baseK, then finite nonnegative levelPenalty, retaining
   short-circuit/repeated getter reads.
3. If scaling, check source then target level presence with the old short circuit.
4. Independently compute levelGap, including repeated presence/subtraction reads.
5. If missing is empty, compute exactly
   `baseK * (1 + (levelScalingEnabled ? levelGap : 0) * levelPenalty)`.
6. Compute `rating / (rating + effectiveK)` only at the original gate.
7. Check enabled, missing, positive rating; clamp min then max with no reassociation.
8. Read enabled again for disabled > missing_config > applied precedence.
9. Compute `damage * (1 - reduction)` and `damage - finalDamage` once in Kernel.

Generic missing labels are `baseK`, `levelPenalty`, `source/target level`, in that
order. Legacy maps only the level label to `attacker/defender level`, retaining
order and producing the existing mutable string[] diagnostic. This mapping owns
vocabulary only; it performs no numerical checks or mitigation arithmetic.

Legacy projects status as string (the old inferred declaration), maps missing
to mutable string[], and explicitly projects details in original order:
status, missing, levelGap, levelScalingEnabled, effectiveK, rawReduction.
Then retain all existing outer return construction/read order: armor, context,
config version/revision, DEFENSE_TYPES traversal, rule bounds, type/levels/ratings,
reduction mapping, inputDamage, preventedDamage, finalDamage. Numerical result
fields are used directly. No readonly leakage or narrowing of old declarations.

This preserves distinctions among missing config, disabled rules, zero rating,
missing levels with scaling off/on, and configured zero penalty. Disabled rules
still compute missing checks, levelGap and applicable rawReduction diagnostics.
The private Legacy numerical `ratingReduction` is removed; no second calculator
is retained. Any adapter helper may contain only reference capture/projection.

## Compatibility and dependency proof obligations

- Compare all 99 emitted non-Kernel .d.ts files byte-for-byte to accepted HEAD,
  using the existing in-memory compiler-host review approach; preserve private
  declaration effects and calculateDamage's inferred nested return type.
- Match all ten Legacy entrypoint inventories/value flags, 243 root symbols,
  122 root runtime values, 27 forwarders and canonical namespace identities.
- Keep source validators/defaults/settings, snapshots, B0/B1, Modifier Resolver,
  Effects, Skills, resources, package metadata/version/lockfile unchanged.
- New dependency edges: Legacy Damage -> Kernel Defense; Kernel Defense ->
  Kernel Defense contracts only. No reverse edge or new cycle is expected.
- Run actual source/emitted/installed closure gates. Add positive generic
  probability/rating fixtures and deep valid-target negative aliases involving
  DefenseSettings, DamageContext, Entity and Skill types. Assert boundary reasons,
  not missing targets/syntax failures. Never relax checker permissions.
- Source/AST ownership assertions can reject retained known formulas and enforce
  delegation, but cannot prove absence of every mathematically equivalent copy;
  source review remains necessary.

## Accepted-source golden and integration plan

Before production edits, capture new observations from accepted Git sources at
`65334063e7ceac788ff2f73122694a158a10c5a8`. Pin SHA-256 of all source blobs needed
by the capture graph, especially Damage/Defense/settings and numerical dependencies.
Load accepted implementations transiently from Git in memory, including Defense
imports used by Damage. Assert dependency cleanliness/rebuild before capture;
never accidentally capture current extracted Defense through an old Damage file.
Normal tests read stored observations, not another production calculator.

Use separate new fixtures; keep all existing .3/.4/.5 golden files unchanged.
Lossless encoding stores undefined/NaN/infinities/-0, complete nested values,
getter/RNG traces, ordered keys, and exact errors. Separately assert thrown object
identity, original context/contribution references, mutable aliases and RNG count.

Required case groups:

- Hit: disabled/ineligible/absent/zero/positive chance; min/max/exact threshold;
  numeric/callback rolls including skipped-invalid and consumed-invalid values;
  default argument; post-roll mutation; getters/throws and validation precedence.
- Critical: zero chance still draws, lower/upper clamp, exact threshold, negative
  bonus, selected-only bonus read, invalid rolls preserved, DoT skip/sentinel,
  receiver/getter changes and mutation of downstream live config/modifiers.
- Rating: Armor/MR selection, every missing coefficient/level combination,
  scaling flag missing/0/1, positive/zero/negative gap, disabled+missing precedence,
  custom min/cap, zero rating/damage, exact floating point, coefficient replacement
  versus mutation, repeated level reads, config/diagnostic traversal mutations.
- Errors: validators before RNG/arithmetic, context before damage, native getter
  errors and precedence, unchanged error identities and suppressed later callbacks.
- Pipeline: landed/dodged direct and DoT, B0/bonus/Critical/B1/Defense boundaries,
  existing flat/percent modifiers, live defense, retained zero-result shape.
- Existing actual-Core integration: Root/Child, projectile/melee/AoE/timed delivery,
  DoT, on-hit recovery, defeat/event order, exactly-once, root snapshots and
  deterministic example. Extend tests only where existing evidence leaves a gap.

Installed strict NodeNext/native ESM fixtures import only @rpg/core/kernel:
Text RPG custom hit/crit and fixed reduction; Vo Lam custom rating key/level gap
with B0/B1; ARPG multiple caller policies with deterministic RNG. Assert exact
numerical diagnostics and no Legacy types, not just import success.

**Consumer interpretation requiring review:** Text RPG "flat defense reduction"
is proposed as a constant fractional reduction selected through min=max bounds
with positive rating and complete coefficients, with level scaling off. This uses
the existing rating primitive. Absolute flat subtraction (`damage - defense`) is
not supported by these contracts and would be a CORE_CAPABILITY_GAP in Kernel
Defense/Damage if that is the intended requirement. No subtraction API, alternate
formula or fixture workaround will be implemented; clarify that requirement at
this plan gate if absolute subtraction is required.

## Expected preservation impact and gates

Confirmed indices and current declaration fingerprints:

| Module | Declaration | Before fingerprint | Planned change |
| --- | --- | --- | --- |
| 10 | calculateDamage | 140700dceaae949d095b65e4b02897eac199e0fab6eaa295d3b06ec026b443f1 | Critical delegation only |
| 11 | validateDefenseContext | 9db2878270eeb985cddceae380fae16feead980e93f21663f131881d370409ad | Unchanged |
| 11 | resolveDefenseHit | b1464129ca785644d2a48114d4f3067d0b0ecd4d80101a96413cc01d8a76cab2 | Hit delegation |
| 11 | ratingReduction | 8353a6fed8bbdf415e86aaee2e34d359b07e5ef54eeb4fe9a41b575fa6d2aecf | Remove Legacy numerical body |
| 11 | mitigateDefense | b2908df59094942d7875f88f15788fd8945155acca477062ff69c69425a2c37d | Mitigation delegation/projection |

Register the new canonical Defense file as required implementation coverage for
the genuinely dependent modules 10/11. Keep module 10's existing B0/B1/contracts
coverage. If one file contains all three new functions, both modules may cover
that same file; explicitly enumerate its declarations and dependency rationale.
Do not modify the existing contract file to manufacture another preservation delta.

After approved implementation, generate exact named before/after declarations,
removed/new names, source SHA-256, compatibility results, source diff and minimal
RFC 6902 patches with whole-entry test operations. Keep original historical hashes
and the entire v1.1.1 -> v2.0.5 approval chain, plus all .3/.4 amendments. Dry-run
patches in memory; all 25 unrelated modules remain byte-equivalent JSON entries.
Any unexpected affected module requires a new delta decision before proceeding.

Do not edit docs/behavior-baseline.json before separate preservation approval.
Stop after targeted evidence at **BLOCKED — PRESERVATION REVIEW**.

## Minimal implementation sequence and file scope

1. Approved plan gate, recheck base, capture accepted-source goldens/provenance.
2. Add one Kernel Defense implementation file and three Kernel exports.
3. Adapt only the three Legacy calculation functions; remove private rating body.
   Keep all validation and outer orchestration at their current boundaries.
4. Add tests/fixtures, installed consumer coverage and boundary/ownership checks.
5. Add capture/review tooling and docs/v2/2.0.6-critical-defense-extraction.md;
   update README/AGENTS/ARCHITECTURE for the reviewed ownership change only.
6. Targeted verification and compatibility/fingerprint proposal; stop at Gate B.
7. Only after separate approval: apply exact baseline amendment, recheck reviewed
   fingerprints, full verify, commit/push and exact-head CI; stop at Gate C.

Expected source changes: src/kernel/defense/defense-calculation.ts,
src/kernel/index.ts, src/damage/defense-engine.ts and src/damage/damage-core.ts.
Expected new test artifacts: defense-parity observation/golden/test files,
kernel-defense unit/consumer fixtures, and capture/review scripts. Extend existing
consumer-smoke and declaration/architecture tests. Full final inventory is produced
from the actual diff; no edits to historical records or unrelated source.

Before preservation approval run build, typecheck, check:architecture,
`npm test -- tests/damage tests/integration`, installed consumer, existing Stats /
Modifier goldens and changed tooling fixtures. Capture actual counts; overlapping
runs are not additive. Preservation failure must be exactly explained by modules
10/11, with the authoritative baseline unchanged. If unexpected failures cannot
be resolved inside the approved cut, stop and present evidence/delta.

After preservation approval run full npm run verify; then the separate commit
`feat(kernel): extract critical and defense calculations v2.0.6`, push current
branch, update PR #6 and wait for completed SUCCESS on exact HEAD for Node
22.13.0/24. Report READY FOR REVIEW with counts, CI and inventory. No new branch/PR,
merge, release, package publication or v2.0.7/v2.0.8 implementation.

## Review decisions requested

Approve the three signatures, reuse of all nine contracts without a type delta,
live getter/captured-reference adaptation, unbound Dodge versus receiver-preserving
Critical thunk, generic missing-label projection, exact declaration preservation,
the scoped Text RPG fixed-reduction interpretation, and the two-module separately
gated preservation process. Implementation waits for the Developer's decision.
