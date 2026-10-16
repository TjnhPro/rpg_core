# RPG Core v1.2.0 — Healing Foundation

Developer approved the delta plan and H1–H8 on 2026-10-16.
Base main: 263b4069e84cd9ca9456ef944b41778d08823f7f, merged v1.1 PR #4. Branch: feat/v1.2.0-healing-foundation.

## Contract

Combat owns the pure applyEntityHealing(currentHp, healAmount, effectiveMaxHp)
transition and exposes it from the root and Combat entrypoints. Inputs must be
finite/nonnegative with currentHp <= effectiveMaxHp, otherwise throw before mutation.
Zero healing is inert; zero HP stays zero. The increment is capped before addition
to avoid overflow; actual recovery is after-before. Resource normalization and
regeneration remain in Stats. applyEntityDamage and Damage formulas are unchanged.

Skills adds {type:'heal', target:'self'|'selected', amount}, with finite
0 < amount <= 1000000 and exact fields. Optional allowedTargetRelations must be
a nonempty unique subset of self/ally and can only restrict Healing. Default
Healing relations are self/ally, independently of Root selection relations;
self heals the caster even if Root selected an enemy. Selected resolves only an
actual selected entity/self, never a ground position or implicit area. Cast-level
admission is unchanged; execution revalidates liveness, relation, identity and
selected range/LOS against the existing inRange geometry. Root uses live caster
position; Child uses its authenticated contact/expiry origin. Nonfinite/missing
geometry rejects selected-entity healing.

The ordered canonical dispatcher reads live Max HP from defenseStats, calls the
Combat primitive and updates authoritative currentHp before healing-applied.
That event contains entityId/atMs/before/after/appliedHealing and is emitted only
for positive recovery. Full HP is event-free; invalid runtime operations emit the
existing effect-rejected and do not refund accepted casts. Healing performs no
Damage calculation, RNG, OnHit/OnKill occurrence or additional S0/action/MP/CD.
Existing guarded callbacks, replay, queue, Child and disposal policies remain.

Root Healing pins source/selected entity references in a snapshot-keyed private
WeakMap at admission; replacement with the same ID rejects. Child uses the
existing authenticated queue identity checks and pins dispatch participants
before ordered effects, including across callbacks. The helper is not exported
from package barrels; no registry, resource ledger or public snapshot field is added.

H1�H8 remain exactly the approved policies: Combat HP ownership; finite flat
amounts (primitive nonnegative/Skill positive); live Max HP cap; no defeated-target
healing; self/ally only; positive-recovery events; synchronous opt-in Root/Child;
no Crit/Dodge/scaling/random formula.

## Compatibility and boundaries

Public additions: applyEntityHealing, EntityCombatEvent healing-applied member,
SkillGameplayEffect heal member (also reflected in SkillEffectEvent). Existing
consumer exhaustive switches over event/effect unions may need a new case; this
is an intentional source-level compatibility consideration, not a silent claim
of universally unchanged TypeScript consumers. Existing operations/defaults,
legacy paths and old example digest remain unchanged. No runtime API weakening,
formula change, package version bump, new dependency or engine is introduced.
Upgrade resolver/whitelist and trigger contracts are unchanged. In particular,
plain OnExpire does not acquire a selected entity target; the demonstration uses
OnExpire -> self Child, and selected Child tests use canonical landed OnHit.

Lifesteal, Mana-on-Hit, HoT, scaling/multipliers/crit heal, percent healing,
resurrection, shields and area heals remain outside scope. No newly discovered
Core capability is required for the approved Healing capability.

## Verification evidence

- T1: tests/combat/healing.test.ts covers normal/cap/full/dead/zero/fractions,
  finite overflow boundary, invalid numbers and inconsistent HP bounds.
- T2/T3/T5: tests/integration/healing.test.ts exercises actual Root HP/events,
  live cap, single MP/CD/action, enemy/missing/dead/replaced targets and source,
  range/LOS/geometry/HP rejection, invalid definition before cost/capture,
  ordered callbacks, duplicate dispatch and disposal.
- T4: trusted expiry -> self Child retains exact S0/identity without extra cost
  or RNG; delayed landed OnHit -> selected Child heals actual ally HP and rejects
  replaced/dead/out-of-range targets using existing queue and geometry.
- T6: examples/healing.ts runs from the existing externally installed strict
  TS/ESM consumer: primitive 90+30 -> 100/applied10; Root ally90 -> 100/applied10,
  Child caster50 -> 100/applied50, captures1/rolls0/MP95/action1/CD1000; replay inert.
- npm ci --ignore-scripts: PASS, Node24.18.0, no lockfile change.
- Targeted npm test -- tests/combat: PASS (10 tests); npm test -- tests/integration:
  PASS during development (128 tests before the final relation-restriction case).
- Final npm run verify: PASS, 287 tests / 29 files, zero failures; build/types,
  architecture45 modules/zero runtime cycles, preservation27 modules,
  deterministic headless example and external installed consumer all PASS.
- git diff --check: PASS. No lockfile/package version/dependency changes.
- Exact final test totals and Node22.13.0/24 CI commit/run links are recorded in
  the PR handoff after verification and push. Developer review required before merge.

## Narrow preservation amendment

Only the following declaration hashes are added/replaced. Historical reviewedCommit,
prior amendments and unrelated declaration fingerprints remain intact.

| Canonical file / declaration | Before | After |
| --- | --- | --- |
| src/skills/skill-effects.ts: SkillGameplayEffect | 0b5a8e1ed742bc9e95c489ae2c309f45c4a5d29ed7f9e2bec8657fbc754bbb47 | 58049a4183d94ec929531eaff795fac3cf7dcc9dd089a941f27092209c914d50 |
| src/skills/skill-effects.ts: validateSkillEffects | 830bfbc0ccadaa9df7042ede07b1c55e83a809c9be391b12247fdbde82cfb190 | c7ae617dd31d76934d5b798c2503e80cfc1f9cb1cdd488b613b6096034fc76ce |
| src/combat/combat-entity.ts: applyEntityHealing | new | da42591b1f2165fe87221f91e2171c7fa4ffd418f92f52bffb934b9c442abc60 |
| src/contracts/combat-state.ts: EntityCombatEvent | 9003fe0daf93d3d309816cad9c96f92c8defa7610580d3cffdf56eb3e74d7def | d7b8300d0225d9cb83ed427e65b9c6cc1c107105d9aafc77f7f49201a51c3c8e |
| src/skills/skill-execution.ts: healingEntities | new | 94c8d99f04684d780ca93f9c120cd4078e60e3378144f7374c68da07a4729eb2 |
| src/skills/skill-execution.ts: skillHealingEntities | new | 72bccbcdf6d964d59ab8460b5efbe3ef0ae07b68a7a5ad0fce32d7d6582fce0f |
| src/skills/skill-execution.ts: executeSkill | 8740ec796abfecd303afef2dc1ee0872fc5ceb1a17c04017c1a86fbfd9c7e4db | 7c976bdac9c6975fc18ead4a754298250f8f406a28ac4349110d076ac9e9b692 |
| src/skills/skill-effect-integration.ts: GameplayActivation | 75401b32628dc80d7b734618e9f7b92ee0997a111f6fb73fc52429a4f19f0609 | 0360b1d17ba059e0b6c4c833f37c2fee70d6afbd56634773dd4f1c5aa2a508bf |
| src/skills/skill-effect-integration.ts: Delivery | b8c5beb50aa94023a4dfad989100de5d667ff824311784391213ca73a67ca2fb | 7ab4b27591492b83cc20c31413569ccbd99facfe60e9e994cac3cf35fb67eedc |
| src/skills/skill-effect-integration.ts: heal | new | 872719983bb624859cf8ca887fa97f9c24e5c389f201bce8dff6982544102920 |
| src/skills/skill-effect-integration.ts: dispatchGameplayEffects | a60661ade14b13dc21cf7d8e36ed154d2b2f5b6b2c5137f5e33b07271aa35912 | 849ff0eef18fbe8b7d7b0c5f2b7c6e77ba7a76f00cd02e6fce9066a9865cb115 |
| src/skills/skill-effect-integration.ts: childDispatcher | 8a9b9cb1a3bc302bd487330831eb2da28e4ebf6cf079a88c95867f70c57c8b92 | d7506978662d6ab44555f935331a6d149c51a36651dd18de56b386d6fc8307d1 |
