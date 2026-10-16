# v1.2.2 - Mana on Hit Foundation

Developer approved implementation on the existing v1.2 series PR after accepting
v1.2.1 at `2a8e1eff7d7e2164d1b8a6e7c7ab21cecbe0d801`.
Policies M1-M8: landed contact including zero damage, fixed amount, enemy only,
living original source, live effective Max Mana, six Root/Child deliveries,
positive events and existing replay/budget boundaries.

## Public contract and integration

`applyEntityManaGain(currentMp, gainAmount, effectiveMaxMana)` is a pure Combat
transition exported by Combat and root entrypoints. Inputs must be finite and
nonnegative, with current MP within the cap. It returns `before`, `after` and
`appliedMana`; zero is inert, zero MP can gain, and the increment is bounded by
remaining capacity before addition to avoid overflow. It never normalizes MP,
mutates an entity, changes regeneration or uses artificial elapsed time.

`SkillManaOnHit` is exported by Skills/root. Optional `manaOnHit: {amount: 10}`
is supported on outer direct_hit, melee_hitbox, projectile, instant_aoe,
timed_aoe_sequence and timed_object declarations. Amount is finite in (0,1000000].
Closed validation rejects unknown fields and unsupported heal/modifier/DoT/
consume_stacks/nested projectile declarations before cost/action/S0 commitment.
Existing pinning detaches and deep-freezes the configuration. No upgrade whitelist
or effect discriminant changes.

Optional trusted `SkillEffectEnvironment.resourceStats(source): {maxMana: number}`
provides live effective stats, including canonical modifiers. Missing/throwing/
invalid resolution or invalid current MP skips gain without changing MP or the
legitimate damage. Callers must supply this resolver to use the opt-in mechanic.

Only the existing canonical hit result grants MP. Zero damage and fatal landed
hits qualify; Dodge, missed contact, DoT and self/ally hits do not. MP goes to the
original admission source reference, checked for presence, identity and finite
positive HP. Child uses its own pinned amount and shared Root S0, including when
only Child declares Mana on Hit. Replaced/missing/dead sources gain nothing.
Existing detached damage eligibility is unchanged.

Damage HP, Lifesteal HP and MP commit before application notifications or trigger
intake. Existing damage/defeat/lifecycle notification order is retained, followed
by positive healing-applied, positive mana-gained, then effect-hit. A committed
resource event still reports its transition if a preceding observer disposes the
session; disposal blocks subsequent deliveries. Event fields: entityId, atMs,
before, after, appliedMana. Full MP and rejected/inert gain emit no resource event.
This additive Combat event discriminant requires a case in exhaustive downstream
TypeScript switches. Existing consumers in this repository compile unchanged.

No extra Crit/Dodge RNG, MP refund, action, cooldown, ledger or scheduler. Contact
and activation/receipt deduplication, Child/depth/intents/work/projectile budgets
and session lifecycle are reused. Legacy definitions never read resourceStats.
Damage/Healing formulas, Stats regeneration, DoT aggregation and EffectLifecycle
are unchanged. No future capability or package release is included.

## Gameplay evidence

- MH01: 9 pure Combat cases cover bounds, caps, full/zero, fractional and overflow.
- MH02/03: source60 spends5 then gains10 ->65, exactly one event55->65 at50;
  Dodge stays55, zero damage still gains10; fatal damage defeats exactly once.
  Misses/DoT emit no gain. Live canonical Max Mana modifier caps55->60 (gain5).
- MH04: all six deliveries, piercing/AoE distinct enemies, repeated timed strikes,
  duplicate entity candidates, activation replay and immutable emitted amount.
- MH05: lethal target10->0, sourceHP50->52.5 and MP55->65; ordered damage,
  defeat, healing, mana, hit. Crit calls1, Dodge calls0, position calls0.
  All committed resources are visible from the first observer.
- MH06: Root10 + Child7 -> MP72 after one cost5, enemy1000->960, one S0 capture,
  action and cooldown. Shared Root S0, receipt/session isolation, replaced/dead/
  absent sources, budget rejection and pending-delivery disposal are exercised.
- MH07: coarse/fine Root/Child timelines compare HP/MP, full events, instances,
  effects, delivery counts, trigger results, RNG and captures.
- MH08: existing installed consumer runs examples/mana-on-hit.ts through public
  package imports. Enemy100->80, sourceHP50->55, MP60->55->65, exactly one event10,
  one capture/action and inert replay; pure cap95->100 also checked.

## Verification

`npm ci --ignore-scripts` PASS with unchanged lockfile and zero vulnerabilities.
Targeted Combat/Integration: 206 tests PASS (39 new Mana on Hit tests).
Final `npm run verify` PASS on Node24.18.0: 354 tests / 32 files,
build/strict types, architecture45 with no runtime cycles, preservation27,
unchanged deterministic example HP70/seed73, and external installed TS/ESM
consumer including all previous examples. `git diff --check` PASS.
Exact-head Node22.13.0/24 CI results are recorded in the PR handoff.
No unresolved capability gap within the approved scope. Stop for Developer review;
no merge, publication, release or next checkpoint.

## Narrow preservation amendment

Historical reviewed provenance and prior amendments remain intact. Only the
following approved declarations change; all other fingerprints, shared forwarders
and legacy runtime identities stay pinned.

| Declaration | Before | After |
| --- | --- | --- |
| src/combat/combat-entity.ts: applyEntityManaGain | new | 9e9c639ea27feada194d941e88ae124d3af35aa9ccb0996817a182a528c78cb2 |
| src/contracts/combat-state.ts: EntityCombatEvent | d7b8300d0225d9cb83ed427e65b9c6cc1c107105d9aafc77f7f49201a51c3c8e | c3d1c98d9e730b31110b159745d3fb92fccc998a15194fbf86e99d4ec1946dfd |
| src/skills/skill-effects.ts: SkillManaOnHit | new | e2612a4fc27c329a792c115d90e9b400d3fc45cec0132979565604968ab2ecc2 |
| src/skills/skill-effects.ts: SkillGameplayEffect | bbdd7e5b8d56e776ccfa4ab1eb817de9b5ee3ceb86fbb7e0567a63855ccb4f86 | 870256bb359174b088512a10174ec762f4a16e62ed1a06b34553381747c4366d |
| src/skills/skill-effects.ts: validateSkillEffects | 3da765a5e2727dca86ed1dca224248a68e160410eb7a3cad13c536fb19c627a3 | 22a430a0c560717837a6c0b0c424995c4f339756e535c84c22811ca549a7c50b |
| src/skills/skill-execution.ts: executeSkill | 4e18d33915dc9ac31eb94d304fc4e761d98d5b8b96cb157ff0928fd36eec2e70 | 0e604dda6f2c163621958c071488b4cd2b40911a4140a0e692be21caac1e0af0 |
| src/skills/skill-effect-integration.ts: SkillEffectEnvironment | bc3c8aba7ab328e17ac68e9b7056431a153bc5236806daeb797da4648c601d79 | 125abba20252d311d7e042e7f0ff8675bf9ba89c0e5abdcc70d9d28f947b18cb |
| src/skills/skill-effect-integration.ts: applyDamage | 5da942bec4128915da5871cf48708e436e5b3bc96e649630d801cfccfb305e23 | 5fce1c2777bc558d43697fb78972c22e2ff708828bb01c50733f96e0f6578d0c |
| src/skills/skill-effect-integration.ts: manaOnHit | new | 2c5c7e4a8442f59b34816af6a42c3bcb365609dba7bbf5c6301ca2a937b10d36 |
| src/skills/skill-effect-integration.ts: hit | c453aa707ef3d8144fa9dafc5ab20d1241eb33e2398f44cafab3ac30bae10679 | 27cd9a7915a859b356e3ab75a601086204a8a7763188548e8b8c15790e5deef7 |
