# v1.2.1 - Lifesteal Foundation

Developer approved this task and continued implementation on the existing v1.2
PR/branch. Base: Healing v1.2.0 at `0d2b0b83134ba6f270bd5ee43eea60e3e8b4ac08`.
Policies L1-L8 use actual applied damage, explicit rate, canonical Healing,
living original attacker, enemy-only landed damage, Root/Child direct deliveries,
and the existing healing event.

## Contract and minimal delta

Damage effects opt in with `lifesteal: {rate: 0.25}`. Supported outer effect types:
`direct_hit`, `melee_hitbox`, `projectile`, `instant_aoe`, `timed_aoe_sequence`,
and `timed_object` (its emitted projectile). Rate must be finite and in `(0,1]`;
unknown fields, non-damage declarations and nested consume/projectile declarations
are rejected before costs/action/S0 capture. Definitions detach and deep-freeze
Lifesteal alongside the existing effect data. No new union discriminant or event
is introduced; exhaustive effect switches need no additional case for v1.2.1.
`SkillLifesteal` is exported from the Skills and root public entrypoints.

The existing `hit` -> `calculateDamage` -> `applyEntityDamage` path passes its
actual `appliedDamage` to Skills' opt-in integration. Requested recovery is
`appliedDamage * rate`; unchanged Combat `applyEntityHealing` applies the live cap.
No rounding, actor stat, resource ledger, Damage formula or Healing formula changes.
Each independently admitted enemy damage application can recover HP. Dodge and
zero applied damage recover nothing; full HP produces no healing event.

Private v1.2.0 admission identities now also key the same record by Root S0 for
Child access. Only definitions/bundles with Healing/Lifesteal need those records.
The original source reference is pinned at successful admission, including when
only a Child declares Lifesteal. Source presence, reference identity, finite
positive HP and canonical enemy relation are checked at recovery time. Replaced,
missing, defeated or invalid sources receive no recovery; authorized detached
damage otherwise retains existing admission rules. Fatal enemy damage can heal
a surviving source. Self/ally damage cannot. Generation-scoped entity IDs remain
the caller's identity contract.

Damage and recovery HP commit before any event observer. Notifications preserve
existing damage/defeat/lifecycle ordering, then emit positive `healing-applied`,
then `effect-hit`; OnHit/OnKill are captured from the canonical transition before
notifications and drained by the unchanged session queue. A healing event records
the committed transition even if a preceding observer disposes the session.
Existing definitions without Lifesteal retain their event and RNG sequences.

Children use their own pinned rate and Root S0 with no extra cost/action/capture.
Emitted deliveries retain pinned data. Existing activation/contact/receipt replay,
projectile deduplication, trigger/depth/work/live-child budgets and disposal apply.
DoT applications/ticks never inherit Lifesteal. `consume_stacks` outcomes remain
excluded. Mana-on-Hit, HoT, reflection, scaling, equipment stacking, resurrection
and upgrade-whitelist extensions are deferred.

## Evidence

`tests/integration/lifesteal.test.ts` uses real Core implementations:

- LS01: 100 final damage against 10 HP produces 10 applied damage and 2.5 recovery.
- LS02: Dodge, zero, full/capped HP, dead/missing/replaced/invalid sources, self/ally.
- LS03: six delivery forms, AoE/pierce distinct targets, duplicate candidate IDs,
  pinned emitted rate, invalid declarations before costs and no DoT recovery.
- LS04: fatal transition, exactly one defeat/OnKill, ordered events and committed
  HP visible from the first notification; admission and in-flight source identity.
- LS05: Root 25% + Child 50% deals 40 HP and recovers 15 HP total, shared S0,
  one capture/MP/CD/action, inert receipt replay, budget rejection and disposal.
- LS06: coarse/fine Root/Child timelines compare full events, HP, RNG, trigger
  results and delivery counts.
- LS07: `examples/lifesteal.ts` in the existing external strict TS/ESM installed
  consumer applies 20 enemy damage and source50 -> 55 with exactly one event5.

Local Node24.18.0 verification: `npm ci --ignore-scripts` PASS (lockfile unchanged);
`npm test -- tests/integration` PASS (157 tests, including 28 Lifesteal cases);
final `npm run verify` PASS (315 tests / 30 files, build/strict types, architecture
45 modules with no runtime cycles, preservation27, unchanged deterministic example
and external installed strict TS/ESM consumer). `git diff --check` PASS.
Exact-commit Node22.13.0/24 CI is recorded in the PR handoff. No package publication, release, merge or v1.2.2 implementation.

## Narrow preservation amendment

Historical provenance and prior amendments are retained. Only the declarations
listed below change; all other fingerprints and legacy identity checks stay pinned.

| Declaration | Before | After |
| --- | --- | --- |
| src/skills/skill-effects.ts: SkillLifesteal | new | 6e5a0c70a347576bf952decaa1fe0b37bcecc55444afb0a194f7b73dddaaebab |
| src/skills/skill-effects.ts: SkillGameplayEffect | 58049a4183d94ec929531eaff795fac3cf7dcc9dd089a941f27092209c914d50 | bbdd7e5b8d56e776ccfa4ab1eb817de9b5ee3ceb86fbb7e0567a63855ccb4f86 |
| src/skills/skill-effects.ts: validateSkillEffects | c7ae617dd31d76934d5b798c2503e80cfc1f9cb1cdd488b613b6096034fc76ce | 3da765a5e2727dca86ed1dca224248a68e160410eb7a3cad13c536fb19c627a3 |
| src/skills/skill-execution.ts: healingEntities | 94c8d99f04684d780ca93f9c120cd4078e60e3378144f7374c68da07a4729eb2 | 324a6ce6804e9cd9dcfc7b527e9d8988f0f7880e27554a6dc02aa8b54333e16e |
| src/skills/skill-execution.ts: skillHealingEntities | 72bccbcdf6d964d59ab8460b5efbe3ef0ae07b68a7a5ad0fce32d7d6582fce0f | afc0b1b2c13061fd379f73e43deef5e4b86de806bcafbf0f9bf2760ac684f665 |
| src/skills/skill-execution.ts: executeSkill | 7c976bdac9c6975fc18ead4a754298250f8f406a28ac4349110d076ac9e9b692 | 4e18d33915dc9ac31eb94d304fc4e761d98d5b8b96cb157ff0928fd36eec2e70 |
| src/skills/skill-effect-integration.ts: applyDamage | 0cc12c85178a38cbcfe3f7ae4dee46e3ed4fe1ed8e9aa61989cf8eae3946eb07 | 5da942bec4128915da5871cf48708e436e5b3bc96e649630d801cfccfb305e23 |
| src/skills/skill-effect-integration.ts: lifesteal | new | fad5ec3400cc18a44d3fe3f8bebe498efba17e00b611b8b465a9017645162380 |
| src/skills/skill-effect-integration.ts: hit | 3f1e3bfc371ce4d2fc643cb27b09a92ecad95343899ebee967895d8c0c418d06 | c453aa707ef3d8144fa9dafc5ab20d1241eb33e2398f44cafab3ac30bae10679 |
