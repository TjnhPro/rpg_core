# v1.2.4 - Percent Recovery

Developer accepted v1.2.0-v1.2.3 and approved P1-P8 on baseline
`880a60683006a14dc2228b95a2e8095659b7bcf7`, current v1.2 branch/PR #5.
Approval explicitly includes public amount widening and Child-only percent HP
admission identity, plus live recipient maxima at execution time.
Prior accepted checkpoints: Healing `9117dd87b0a917669e71a16332f8fd74be7a97b0`
(docs follow-up `0d2b0b83134ba6f270bd5ee43eea60e3e8b4ac08`), Lifesteal
`2a8e1eff7d7e2164d1b8a6e7c7ab21cecbe0d801`, Mana on Hit
`7e1b214ad40bc5ca4c4a9a27c82fdbcba32b20a9`.

## Contract and compatibility

Existing heal and restore_mana now accept
`amount: number | {readonly percentOfMax:number}`. No new effect discriminant,
resource stat, event or Combat API. Numeric payload rules and gameplay remain;
all old flat tests and installed examples retain their previous expected results.
Consumers constructing numeric effects continue to compile. Readers that assume
amount is numeric need `typeof effect.amount === 'number'` narrowing. This is an
explicitly approved public TypeScript contract change, not full source compatibility
for external numeric-only readers. Repository consumption is in heal/restoreMana;
existing examples construct numeric payloads, without numeric-only reads. The strict
installed consumer tests both shapes and requires narrowing via @ts-expect-error.
No alternative payload representation was needed.

Percent object has exactly one field, percentOfMax: finite in (0,1]. Values20,
zero, negative, NaN/Infinity, unknown fields and ambiguous flat/percent forms reject
before MP/action/CD/S0 commitments. Existing relation/target rules and max32 effects
remain. Accepted objects are detached/deep-frozen through existing pinning.

At each operation Skills reads the actual recipient maximum exactly once:
defenseStats(target).maxHp or resourceStats(target).maxMana. The requested value
is maximum * rate, not a fraction of missing resources. The same live maximum and
requested value go to unchanged applyEntityHealing/applyEntityManaGain. Existing
Combat owns cap, bounds, overflow-safe addition and actual recovered difference;
Skills adds no rounding, resource store or cap implementation. Valid rates <=1
cannot overflow a finite nonnegative maximum. Invalid maxima/current resources or
missing/throwing resolvers reject without mutation. HP maximum resolution is now
inside the guarded primitive call so unavailable stats safely reject as required.
Zero Max Mana with zero MP is inert.

Root/Child reuses recipient validation, identities, selected range/LOS and the
existing authenticated Child anchor. Child-only percent HP opts into existing
admission identity records, even with empty Root effects. Percent HP and explicit
MP share the original living Root source check; replaced/missing/dead source or
recipient cannot receive recovery. Numeric HP keeps its accepted validation policy.
No resurrection or recovery to enemies. An enemy-selected Root can explicitly heal
self. Delayed recovery reads live recipient stats, including legal modifier changes
and expiry ordering, rather than offensive S0 or caster maxima for an ally.

Authored flat/percent effects retain deterministic ordered commitments and positive
healing-applied/mana-gained events. Payloads report actual recovery, including caps;
full resources emit no event. No Damage/Crit/Dodge or synthetic OnHit/OnKill. Root
cost/action/CD/S0 capture remains once; Children add no cost. Existing replay,
session disposal, receipt identity, queues and budgets apply unchanged.

No changes to Combat, Stats, Effects, Damage formulas, regen, Lifesteal, Mana on Hit,
DoT aggregation, upgrade whitelist, dependencies or legacy forwarders. No engine,
registry, scheduler or additional event system. HoT/MoT, critical/anti healing,
shields, resurrection and equipment recovery policies remain deferred.

## PR01-PR08 actual gameplay evidence

- PR01: closed percent objects, finite rate fractions including1, invalid/ambiguous
  payload rejection before commitments, max32 and detached frozen Child config.
- PR02: HP400/1000 +20% ->600; HP950->1000 emits actual50; full emits none.
  Fractional recovery has unchanged JS precision; rate1 and finite maximum inputs
  are bounded by canonical Combat. Defeated recipients cannot be revived.
- PR03: MP100/500 +30% ->250; MP450->500 emits actual50; full/zero/zeroMax;
  invalid current/max/missing or throwing resolvers reject without writes.
- PR04: previous flat suites/examples unchanged; mixed numeric/percent ordering
  works. Strict installed consumer accepts both and checks required narrowing.
- PR05: Root HP400/MP100 spends10 ->MP90; HP20% ->600; MP30% ->240.
  One action/CD1000/capture, zero RNG and inert duplicate dispatch.
- PR06: Root with empty effects creates percent-HP-only expiry Child; live +200
  Max HP changes requested20% from200 to240, HP400->640 at200. Mutating authored
  rate cannot change pinned .2. Shared S0/distinct Child identity, receipt replay,
  source replacement, selected ally live HP/MP modifiers and invalid recipients
  are exercised. Caster movement does not replace the authenticated Child anchor.
- PR07: modifier Apply50/expiry100 and Child recovery100 preserve canonical
  ordering: expired maxima1000/500 yield allyHP580/MP250. Coarse/fine resources,
  complete events, instances, effects and RNG agree. Prior recovery and all
  conditional/nested/stack/upgrade behavior are included in full regression.
- PR08: examples/percent-recovery.ts in the existing installed strict TS/ESM
  consumer demonstrates normal HP600/MP240 and capped HP1000/MP500. Capped events
  report HP50 and MP60 after cost10, one capture/action/CD and replay false.

## Verification

Focused percent integration: 31 tests PASS. Targeted Combat/Integration: 275
tests PASS. `npm ci --ignore-scripts`: PASS, zero vulnerabilities and unchanged
lockfile. Full `npm run verify`: PASS, 423 tests across 34 files, build, strict
types, architecture (45 modules, no runtime cycles), preservation (27 modules),
deterministic example and installed strict TypeScript/ESM consumer. The installed
consumer produced the normal and capped gameplay outcomes above and verified
required amount narrowing. `git diff --check`: PASS.
Exact-head Node 22.13.0/24 CI links are recorded in the PR handoff. Stop for
Developer review; no merge, publication, release/tag or v1.2.5 work.

## Narrow preservation amendment

Historical provenance/prior amendments remain; only the named changed/new Skills
declarations below are amended. Combat primitives/events and unrelated declarations
and legacy identity checks remain pinned.

| Declaration | Before | After |
| --- | --- | --- |
| src/skills/skill-effects.ts: SkillGameplayEffect | eb386f25e459c074ec9fc76008045223827886e28cf7122ac2e7ac8ddfecaed7 | 56190d7972277632f89a2838993eae35c4a47ba02657b582c3f0c3aa44fd9a9b |
| src/skills/skill-effects.ts: validateSkillEffects | dd9a1470782d2cd40e0bd1e3fd381f3dfa9723b8a4a850d6942b7f85fbaa6c63 | f159948abd80f7ccbe6411233589c4539d4d3ccf4f4fb983a95db0b93eb374b2 |
| src/skills/skill-execution.ts: executeSkill | 4b2380347eb858395cc2d274bbce95697e00af997455583155eee2510b7a991b | 52a91aaacfbd91f9154d5337b5a2375112b99594aca7f07fe19465a3d7745d6b |
| src/skills/skill-effect-integration.ts: resourceSource | new | baca8731edd2771713a549b398a4b5ac09e2884f9360536612b5409ad58af998 |
| src/skills/skill-effect-integration.ts: heal | 05ec00295aaf7f30deaeb47a9ec380f3b13c1ec468776c653e56775afd6dc266 | 51528b2bd6198a5f7907b22759d5ba7516bf67e48c57684c391a4517832c36c5 |
| src/skills/skill-effect-integration.ts: restoreMana | 2b3805f5121884356b031daa1cf40e2dfa00999730c98e74ddd7c39b287e4e1f | 11a22ed4886f1b41b47734afc4b798f082ebafd34e08a1531797b804843f7c0c |
