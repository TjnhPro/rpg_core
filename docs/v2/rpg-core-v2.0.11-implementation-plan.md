# v2.0.11 Multi-RPG Consumer Verification — Gate A plan

Status: **GATE B APPROVED — FINAL IMPLEMENTATION REVIEW PENDING**. Developer
accepted v2.0.10, approved Gate A and accepted Gate B with ZERO PRESERVATION
DELTA. Gate C verification and delivery are authorized. Evidence and the final
19-file inventory are in `2.0.11-multi-rpg-consumer-verification.md`.

## Baseline and prerequisite decisions

- Starting HEAD: `436cc35a17389a54e05843ec8efbcfc5c1604295`.
- Branch: `audit/v2.0.0-architecture-boundaries`; PR #6 is OPEN at that exact SHA.
- Preflight on 2026-10-18, Node 24.18.0: initially clean working tree.
- v2.0.10 delivered full verification: **1,696 tests / 55 files**. This is the
  recorded prior result, not a new full-suite run during this planning task.
- Exact-head [PR CI](https://github.com/TjnhPro/rpg_core/actions/runs/39138282062)
  and [push CI](https://github.com/TjnhPro/rpg_core/actions/runs/39138278614)
  are completed SUCCESS; both have successful Node 22.13.0 and 24 jobs.
- At initial preflight formal acceptance was pending. Developer subsequently
  ACCEPTED v2.0.10 and explicitly approved this Gate A plan on 2026-10-18.
  Developer subsequently approved Gate B and authorized Gate C verification and delivery.

Read the task attachment, AGENTS, README, architecture/preservation policy,
migration matrix, .2/.8/.9/.10 reports, baseline inventory, all Kernel contracts,
public barrel, numerical implementations, existing three-recipe fixture/test
and installed consumer infrastructure.

Fresh preflight commands: `npm run build`, `npm run typecheck`,
`npm run check:architecture`, `npm run check:preservation`,
`npm run test:consumer`, and `node scripts/review-legacy-isolation.mjs` PASS.
An initial parallel prepack rebuild removed dist while typecheck/preservation
were reading it; those two checks were rerun after packing completed and PASS.
Future packing/build operations run before dependent readers, never concurrently.
The read-only review reconfirms 99 byte-identical Legacy declarations, unchanged
Kernel declarations, 27 preservation records/history and seven historical goldens.
Its comparison revision is accepted v2.0.9 `f5c22e...`; v2.0.10 production is
identical. New .11 evidence will pin the full starting SHA above.

## Existing capabilities and coverage gap

Kernel has **63 public symbols / 17 runtime APIs**, with 17 source files and 16
emitted/installed declaration files in its public closure. Root Legacy retains
**243 symbols / 122 runtime values**. There is no required public contract delta.

| Capability | Existing canonical APIs | Limits relevant to these consumers |
| --- | --- | --- |
| Ordered attributes, stats, scaling, extras, bounds, precision | `calculateStats`, `calculateEffectiveValue` | Caller supplies complete rules/orders and prepared resolver; training is an explicit flat input, not implicitly added |
| Cooldown arithmetic | `calculateCooldownDurationMs` | Caller supplies resolved reduction and owns admission/deadlines |
| Source selection, dedup, ordering, aggregation, tags | `selectCanonicalModifiers`, `prepareNumericalModifiers`, `matchesAnyTag` | Active sources/tag eligibility are caller policy; original contribution references remain live |
| Ordered rank/scaling/flat and additive damage | `calculateDamageB0`, `calculateDamageB1`, `calculateDamageBonusValue` | No conversion or extra multiplicative damage stage; caller selects bonus eligibility before B1 |
| Lazy hit and critical; rating mitigation | `calculateHit`, `calculateCritical`, `calculateMitigation` | Caller owns eligibility/rule selection/RNG; fixed fractional reduction uses configured bounds, not absolute subtraction |
| Resources | `calculateResourceTransition`, `normalizeResource`, `calculateResourceRegeneration` | Caller validates finite ordered inputs and owns writes; no resource store or inferred death authority |
| Detached numerical captures | `captureNumericalOffenseSnapshot`, `captureCalculationSnapshot` | Closed data schemas, native graph clone then deep freeze; no callbacks, gameplay authority or sessions |

The current three recipes in `kernel-gameplay-boundary-consumer.ts` assert
Text raw/final/HP = 50/37.5/62.5, Vo Lam = 100/80/20 and ARPG = 30/30/70.
They share one `project` helper and contain one stat example, snapshots, tags,
one modifier and zero-chance critical. Installed smoke copies and runs them.
They do not demonstrate separate multi-action policies, full numerical traces,
rank/cost admission, multiple targets, changing equipment/buffs, lazy hit/critical
sequences, source conflicts or cross-consumer execution-order isolation.
Keep these existing recipes/assertions unchanged; add distinct fixtures below.

## Three independent designs and exact identifiers

Each directory owns its literal data, typed unions, initial state factory,
deterministic action list, eligibility decisions, API calls and returned trace.
No common attack executor, modifier arithmetic, resource calculator or simulator.
Only observation encoding/comparison may be shared. All Core imports, including
type imports, are literal `@rpg/core/kernel`; consumer source is copied unchanged
to the external workspace. Relative imports may reference its own fixture data.

| Consumer | Attributes | Derived stats | Damage sources / modifier sources / resources |
| --- | --- | --- | --- |
| Text RPG | `strength`, `wisdom`, `vitality` | `attackPower`, `magicPower`, `maxHp`, `maxMp` | `blade`, `spell`; `training`, `gear`; `hp`, `mp` |
| Vo Lam 2.5D | `sức_mạnh`, `sinh_khí`, `nội_lực` | `ngoại_công`, `nội_công`, `sinh_lực`, `mana`, `phòng_ngự` | `vật_lý`, `nội_công`; `trang_bị`, `luyện_công`; `sinh_lực`, `mana` |
| ARPG subset | `might`, `agility`, `focus` | `weaponPower`, `elementalPower`, `maxLife`, `maxMana`, `armorRating` | `weapon`, `elemental`; `weapon`, `armor`, `accessory`, `buff`; `life`, `mana` |

Text tags: `physical`, `arcane`; mitigation labels `guard`, `ward`.
Vo Lam tags: `kim`, `mộc`, `thủy`, `hỏa`, `thổ`; mitigation labels `ngoại`, `nội`.
ARPG tags: `physical`, `fire`, `spell`; mitigation labels `armor`, `elementWard`.
Dedicated Text edge fixture adds the computed own key `['__proto__']` as an
attribute and stat (separate passes); it is an ordinary key, not a whitelist.

Text owns turn/action/recovery/victory decisions without spatial data. Vo Lam
owns skill rank, tag eligibility, already-resolved delivery observations and
target order; no geometry is computed. ARPG owns equipped instances, active buff
membership, damage-type routing and action order. Numerical rules cross the
boundary only after these decisions. Cost magnitude is fixed caller content;
admission compares available MP and then commits the Kernel transition result.

## Exact scenario inventory (32 independently named cases)

These are scenario cases, not promised Vitest test counts. Complete result
records and traces are asserted; headline numbers below are only review anchors.
Each scenario starts from its own state except explicitly sequenced actions
inside T5, V6 and A8. Failure/edge cases do not share state with success cases.

### Text RPG — 9 cases

| ID | Inputs/policy and required observations |
| --- | --- |
| T1 | Attributes 10/8/12, baselines zero. AP base 10, strength coefficient 2, training extra 3; gear flat 5, percent .25, points 1. Resolver input 33, totalFlat 38, uncapped 48.5; cap 48.25 and one decimal precision re-clamp to 48.25. Magic base 4 + wisdom coefficient 3 = 28; HP 40 + vitality coefficient 5 = 100; MP 4 + wisdom coefficient 2 = 20. Assert every attribute/detail/contribution field |
| T2 | Physical: dodge chance .25/roll .75; B0 base 8, blade 48.25 coefficient 2, flat 3 => 107.5; crit chance .5/roll .25/bonus .5, selected bonus .25 => B1 188.125. Rating 25, K100 => reduction .2, final 150.5; enemy HP 200 => 49.5, applied 150.5. Assert hit -> B0 -> crit -> B1 -> mitigation -> commit, flat callback once |
| T3 | Magic source 28, coefficient 2, base 4 => B0 60; zero-chance eligible critical still draws once; no bonus. Rating100/K100 => final30. MP20 cost6 =>14; targetHP100=>70. No Dodge draw at zero chance |
| T4 | HP90/max100 increase25 =>100/applied10; MP19/max20 increase8=>20/applied1; already-full applied0; zero HP with no-revive policy stays0, zero MP with increase allowed becomes5 |
| T5 | Four decisions: T2 attack; defend selects fixed .5 fractional mitigation of incoming20, ownHP80=>70; recovery15=>85; spell rejected with MP2/cost6. Rejected step changes no state and consumes no RNG. Record complete ordered decision/resource traces |
| T6 | T2 dodge roll .1 < .25: only Dodge draw; no B0, flat callback, Critical, mitigation or damage commit |
| T7 | Empty modifiers and computed `__proto__` key: attribute7, derived base1 + coefficient2 =>15, own enumerable result keys and empty contributions. No inherited prototype value is used |
| T8 | Normalize absent HP=>100/initialized true; negative current=>0. Regen HP99.5 at rate .125 for2s =>99.75, applied .25 with precision12. Ineligible MP branch has throwing skipped-field getters and reads none |
| T9 | Cooldown1000/reduction .25=>750. Allowed above-max HP120/max100 increase5=>100/applied -20; decrease5=>100/applied5. Reject policy throws exact `Current resource exceeds maximum`; original RNG thrown sentinel is propagated by identity when consumed |

### Vo Lam 2.5D — 10 cases

| ID | Inputs/policy and required observations |
| --- | --- |
| V1 | Attributes12/20/16. Ngoai base10 + strength*2 + training6 + gearflat10 =>50. Noi base8 + inner*3 + training4, gearpercent .25 =>75. HP100 + vitality*10=>300; mana inner*5=>80; defense10+vitality=>30. Store training explicitly in flatContributions, not implicitly from rule.training |
| V2 | Ngoai: base10 + source50*2 + flat10 =>B0 120; successful critical bonus .5=>180; rating100/K100=>90; HP300=>210. Record draws and every numerical stage |
| V3 | Noi: base20/rank2/perRank .5 =>base30, source75*1.2*1.5=>135, flat5=>B0 170. Critical ineligible/no draw; selected elemental bonus .25=>212.5. Rating50/K150=>159.375; HP300=>140.625. Distinct coefficients/rank/eligibility/rule, not renamed V2 |
| V4 | Caller matches hỏa tag; two selected .125 terms via calculateDamageBonusValue =>.25. Repeat with tag mismatch: selected bonus list empty and value0. Assert tag/order/eligibility observations; no elemental interaction table |
| V5 | Pre-resolved launched -> eligible -> contact -> calculation-requested observations; only after confirmed contact invoke numerical calls. Missed-contact control requests no calculation. Position literals stay in caller trace and never enter Kernel inputs |
| V6 | Rank1/2/3 with base20, source75 coefficient1, perRank .5, flat0 =>B0 95/142.5/190. Fixed rank costs8/12/16 from MP40 =>32/20/4. Cooldown base1000/1500/2000 at reduction .25=>750/1125/1500; next cost16 rejected with MP4, unchanged RNG/deadline |
| V7 | Stable targets a then b, same captured source50 and B0 120, no bonus. Each dodge .1/roll .9 then eligible crit0/roll .8. Ratings100/300 with K100 => final60/30; separate HP300=>240/270. Exact callback order a-dodge,a-crit,b-dodge,b-crit |
| V8 | captureNumericalOffenseSnapshot from V1 sources: detached/frozen capture remains50/75 after caller mutations to500/750; subsequent B0 uses captured source50. Assert nested freeze, caller mutability and no stored RNG/delivery fields |
| V9 | Same V3 input with disabled mitigation and then enabled/missing baseK: zero reduction, final212.5; exact status/missing/effectiveK diagnostics. No substitute resistance formula |
| V10 | Unicode source/instance selection: active equipment included, inactive training and disabled equipment excluded; assert canonical tuple order, original contribution references, and unchanged prior result on a fresh reset after caller toggles selection |

### ARPG supported subset — 13 cases

| ID | Inputs/policy and required observations |
| --- | --- |
| A1 | Attributes12/8/10. Weapon base20 + might*2=>44, weaponflat6, armorpercent .25, accessorypoints2 =>64.5. Elemental10+focus*3=>40; life80+might*10=>200; mana10+focus*5=>60; armor10+agility*5=>50. Assert complete numerical diagnostics |
| A2 | Reverse input order for three equipped sources, append identical weapon duplicate object: select three canonical contributions with last duplicate identity. Conflicting same tuple/value7 instead of6 throws exact `Conflicting Modifier instance`; no partial state commit |
| A3 | Buff flat10 selected on/off through activeInstances: weaponPower77/64.5; inactive and enabled:false sources excluded. Lifecycle remains fixture policy; each new action prepares a new resolver |
| A4 | Physical B0 base7+64.5*2=>136, critical .5 + selected .25 =>238, rating100/K100=>119, life200=>81. Separate elemental B0 base10+40*2=>90, critical0 + bonus .25=>112.5, rating50/K150=>84.375, life200=>115.625 |
| A5 | Three resolved contacts: dodge .1 < .2 skips critical; landed .9 then critical .1 < .25 selects .5; landed .9 then critical .8 fails. Assert exact five draws, additive B1 and original callback error identity in a consumed-roll control |
| A6 | Damage200/rating200/baseK100/source12/target10/penalty .5: gap2/effectiveK200/rawReduction .5/final100/prevented100. Second selected rule bounds .25/.25: reduction .25/final150/prevented50. Complete diagnostics and disabled/missing controls stay distinct |
| A7 | Full captureCalculationSnapshot plus offense capture: shared rule/scaling aliases inside one valid graph preserved; detached from caller and deep-frozen. Mutating caller attributes/modifiers/tags does not change captured results. Closed-shape accessor/callback control rejects without getter invocation; no gameplay trust inferred |
| A8 | Four ordered caller events: buff-on physical attack B0 161/B1 201.25/final100.625 against life400=>299.375; buff-off elemental final84.375=>215; swap weapon flat6 to14, physical power74.5/B0 156/B1 195/final97.5=>117.5; rejected cost event at mana0 makes no change. Critical0 still draws on each landed eligible attack. Record equipment revisions, selected bonuses and all stages/commits |
| A9 | Normalize absent mana=>60; regen life199.5 + rate .125*2 =>199.75/applied .25; full life stays200; ineligible branch does not read skipped regen inputs |
| A10 | Resource min10/current12/decrease9=>10/applied2/reachedMinimum true; already-full increase=>applied0; max Number.MAX_VALUE with current/amount MAX_VALUE caps safely without Infinity |
| A11 | Reorder independent affix input and repeat same inputs: identical canonical contribution ordering and exact full trace; selected identity conflict still rejects. Empty bonus sources never call value/coefficient callbacks |
| A12 | Bounds/precision: direct calculateEffectiveValue base1.234 with empty prepared resolver, max1.225/precision2=>1.225 after re-clamp. Disabled stat still resolves and invokes a pure identity transform once but returns0; diagnostics retain uncapped1.234 |
| A13 | Snapshot numeric edges: NaN, Infinity, -0 and explicit undefined optional context field survive capture; key order preserved. Valid shared aliases accepted, cyclic/unknown runtime field rejected with public TypeError. Mutations of frozen nested arrays fail under native ESM |

## Public API usage matrix

| API area | Text | Vo Lam | ARPG |
| --- | --- | --- | --- |
| calculateStats / prepared modifiers | T1,T7 | V1,V10 | A1-A3,A8,A11 |
| calculateEffectiveValue direct | via stats | via stats | A12 |
| selectCanonicalModifiers | T1 | V10 | A2,A3,A8,A11 |
| calculateDamageB0/B1 | T2,T3 | V2-V7 | A4,A5,A8 |
| calculateDamageBonusValue / matchesAnyTag | T3 spell policy | V4 | A4 damage-type selection,A11 |
| calculateHit/Critical | T2,T3,T6,T9 | V2,V3,V7 | A4,A5,A8 |
| calculateMitigation | T2,T3,T5 | V2,V3,V7,V9 | A4,A6,A8 |
| calculateResourceTransition / normalizeResource | T2-T5,T8,T9 | V2,V3,V6,V7 | A4,A8-A10 |
| calculateResourceRegeneration | T8 | not required | A9 |
| calculateCooldownDurationMs | T9 | V6 | not required |
| captureNumericalOffenseSnapshot | optional/not required | V7,V8 | A7,A13 |
| captureCalculationSnapshot | not required | optional/not required | A7,A13 |

Each of the 17 runtime APIs is exercised somewhere; do not force identical
pipelines on every consumer. Hit skips all subsequent attack stages on Dodge;
B0 precedes Critical on landed hits. Zero-chance eligible Critical still draws.
Kernel contracts do not perform universal Legacy validation: use their documented
preconditions and assert only primitive-specific errors, not invented validators.

## Expected-output provenance

The arithmetic anchors above are proposed fixed hand-calculated vectors for
Developer review at Gate A. Persist full literals, including intermediate fields,
in each consumer's expected.json with per-scenario input/provenance records.
For nontrivial complete traces and exact floating-point representations, supplement
with isolated capture exclusively from Git blobs at the full baseline SHA after
formal .10 acceptance. Record source hashes, fixture hash, revision and capture
command. Never use candidate output to generate or repair expected values.
Any disagreement with a hand vector is reviewed explicitly before accepting it.

No executable second formula oracle. Normal tests compare fixed records and
contract invariants, never regenerate fixtures. Use an observation encoder that
distinguishes undefined, NaN, Infinity, -0, errors and ordered keys; compare native
object/reference/freeze observations before serialization. Expected JSON records
encode these distinctions explicitly. All seven historical goldens and the
accepted .10 61-scenario oracle remain byte-identical.

## Installed artifact, independence and test execution

Extend `scripts/consumer-smoke.mjs`, retaining its one pack/install workflow and
all existing checks. Hash the exact tarball with SHA-256, verify installed package
name/version (currently 1.0.0) and archive integrity, and hash reachable Kernel
JS/declarations. Copy only the new caller fixture files unchanged; never copy Core
source or rewrite their package imports. Compile all three with strict NodeNext,
skipLibCheck:false, types:[], native ESM and no paths mappings. Reject imports
other than the public Kernel entrypoint or allowed intra-fixture imports.
Use the existing authoritative declaration closure checker on installed types.

All consumers resolve one installed package location and the same 17 runtime
implementations. Run each alone in a fresh process, all forward, all reverse,
repeat identical inputs twice, and caller-mutation/policy-toggle/reset runs.
Compare each per-consumer result with its own fixed oracle and fresh-process
result. Same-process order tests detect cross-consumer contamination; resets are
owned separately. No shared mutable actor, source selection, RNG cursor or cache.

Repository Vitest imports these same public-package fixtures using the existing
package self-reference to built dist; no Vite alias or source substitution.
Build first. It compares all 32 cases plus isolation/import/provenance controls.
Installed execution reruns all 32 using the same literals. Scenario count is not
multiplied by repeated execution; report scenario, assertion/test and run counts
separately. A consumer can be selected by ID for development through the test
wrapper; this must never alter Kernel configuration or its build.

## Proposed changed-file inventory (18 paths)

| Paths | Purpose |
| --- | --- |
| `tests/consumers/text-rpg/config.ts`, `scenarios.ts`, `expected.json` | Text-only definitions, nine cases and fixed oracle |
| `tests/consumers/vo-lam-25d/config.ts`, `scenarios.ts`, `expected.json` | Vo Lam-only definitions, ten cases and fixed oracle |
| `tests/consumers/arpg/config.ts`, `scenarios.ts`, `expected.json` | ARPG-only definitions, thirteen cases and fixed oracle |
| `tests/consumers/observations.ts` | Pure result encoder/comparison data only; no numerical or gameplay execution |
| `tests/consumers/multi-rpg-verification.test.ts` | 32 scenario assertions, isolation and public import/provenance checks |
| `scripts/consumer-smoke.mjs` | Extend current installer with same-artifact three-consumer compile/run/evidence |
| `scripts/capture-multi-rpg-oracle.mjs` | Explicit isolated accepted-Git capture supplement; never called by tests/verify |
| `scripts/review-multi-rpg-consumers.mjs` | Read-only source/declaration/preservation/oracle/import comparison; stdout only |
| `docs/v2/rpg-core-v2.0.11-implementation-plan.md` | This plan and subsequent approved gate provenance |
| `docs/v2/2.0.11-multi-rpg-consumer-verification.md` | Main scenario/API/policy/limitation/results report |
| `docs/v2/2.0.11-multi-rpg-consumer-evidence.json` | Revision/artifact/result hashes, observations, timings and compatibility evidence |
| `docs/test-coverage.md` | Actual verified coverage and commands |

No README/architecture rewrite is needed to establish new ownership. No package
scripts/dependencies/exports/compiler changes; no checker changes. Evidence script
compares Git inventory including untracked protected files, LF-normalized accepted
source hashes and raw byte hashes separately, exact emitted declarations,
Kernel/root exports, all 27 module fingerprints and full approval history. It
also verifies old goldens, metadata and authoritative checkers are unchanged.
Installed evidence is emitted by the current installer and retained in the report;
the read-only reviewer validates its provenance and hashes, never fabricates or
silently refreshes a missing installed run. No RFC 6902 proposal for zero delta.

## Capability findings and limitations

No required numerical capability gap found in preflight for these selected cases.
This is a feasibility finding, not implemented consumer evidence. All arithmetic
stays in existing Kernel APIs. Game-specific classifications, resolved delivery
observations, activation and resource commitment are caller policy, not missing
Kernel calculations. Fixtures exercise small finite action lists, not full games.

Damage conversion, additional multiplicative stages, penetration formulas,
commercial PoE/D4 fidelity and production Vo Lam mechanics are deliberately not
required. No claim they are supported. If a required approved case proves
inexpressible, report CORE_CAPABILITY_GAP with exact API/input reproduction,
numerical-vs-gameplay classification, minimal separate proposal and compatibility
impact; STOP before any workaround, source edit or weakened expectation.

Static import restrictions cannot prove absence of arbitrarily disguised copied
formulas; semantic review remains necessary. Determinism applies to the recorded
pure callbacks and traces, not arbitrary caller closures. Local preflight used
Node24; future exact-head Node22.13.0/24 CI is required after Gate C push.

## Verification sequence, overhead and gates

1. **Now Gate A:** submit this plan, 32 scenario designs and hand anchors. STOP.
   Require explicit .10 acceptance and .11 plan approval; no implementation yet.
2. After approval: create fixed data, optionally capture complex accepted-source
   traces once in isolation; implement each independent consumer and assertions.
   Run `npm run build`, `npm run typecheck`,
   `npm test -- tests/consumers`, targeted `npm test -- tests/kernel tests/stats tests/modifiers tests/damage tests/combat`,
   `npm run check:architecture`, `npm run check:preservation`, then
   `npm run test:consumer` and `node scripts/review-multi-rpg-consumers.mjs`.
   Serialize build/pack before declaration readers. Retain actual exit codes/counts.
3. **Gate B:** report complete actual input/output matrix, artifact SHA, same-package
   identities, isolation/repeatability/RNG/state results, declaration and source
   hashes, all 27 fingerprints/history, final inventory and limitations. STOP —
   CONSUMER / PRESERVATION REVIEW. No full verify, commit or push yet.
4. Only after Gate B approval: full `npm run verify`, `git diff --check`, read-only
   review and exact zero-delta recheck. Commit
   `test(kernel): verify independent multi-rpg consumers v2.0.11`, push existing
   branch, update PR6, confirm all four exact-head PR/push Node22.13.0/24 jobs.
   Return READY FOR REVIEW; no merge/release/publication or .12 work.

Overhead: one existing package pack/install, no second installer, one strict
consumer infrastructure with three separate strict NodeNext compilation programs, and small finite scenario
runs. Record compile time, per-consumer execution time, whole installed-run time,
scenario counts and targeted test duration separately using monotonic clocks.
No timing thresholds or server benchmark. Exact test count/runtime increment is
unknown until implementation; retain every existing test and do not repeatedly
run the full 1,696-test baseline while developing individual fixtures.

The approved implementation changes only consumer tests/fixtures, tooling and
documentation. Production/public API, preservation baseline, existing goldens,
PR and Git HEAD remain unchanged. See the Gate B report for the final inventory.
