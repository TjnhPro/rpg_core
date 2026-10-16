# RPG Core v1.1.5 — Stack Consumption

Base: `f8d75751917f441907925e756e24c7c617211015` on
`feat/v1.1.2-skill-instance-lifecycle`, [PR #4](https://github.com/TjnhPro/rpg_core/pull/4).
The Developer explicitly accepted v1.1.4 at this SHA and approved the v1.1.5 delta
plan with S1–S6 A/A/A/A/A/A. This checkpoint remains subject to Developer acceptance;
neither CI nor this document grants acceptance or permission to merge.

## Contract and ownership

`EffectLifecycle.prepareConsumeStacks(request, context)` validates the authoritative
existing store and returns an immutable owner-issued `EffectStackConsumePlan`.
Request extends `EffectApplyRequest` with positive safe-integer `requiredStacks`.
`consumeStacks(plan, context)` revalidates and removes exactly N instances, returning
immutable `consumedInstanceIds`, `consumedCount`, `remainingStacks`, `duplicate` and
removal events. Preparation changes no active effect, modifier, serial or clock.

Pool: `(sourceEntityId, targetEntityId, effectId)`, only `stackingPolicy: 'stack'`.
Order: `expiresAt ASC`, then `effectInstanceId ASC` using the existing lifecycle sort.
Apply still refreshes whole-group duration and preserves old stack payloads at cap;
consume does not change surviving instance identities, contributions or deadlines.
Events reuse `effect-removed`, with the single new removal reason `consumed`.
Restrictions and modifiers derive from the same active store, without a count cache.

Both calls require the owner's already-advanced simulation time. Advance expiry and
defeat at the boundary before admission. Unadvanced/due-expiry pools, invalid counts,
wrong policy, insufficient stacks, invalid entities and disposed owners fail without
removing anything. Commit rechecks the complete pool's immutable instance references,
registered entity identities and timestamp before any removal. A changed/refreshed
pool invalidates its prepared selection. No repeated public `remove()` orchestration.

The plan object is an owner-scoped capability in a weak map: copied/forged/cross-owner
objects reject. Same-boundary accepted replay returns `duplicate: true`, original
count/IDs/remaining and empty events; later-boundary tokens reject. No serial is
allocated from the Apply protocol. Unreferenced capabilities are collectable; disposal
releases the weak table. This adds no permanent operation history or receipt service.

## Skills opt-in and numeric path

```ts
{
  type: 'consume_stacks',
  effectId: 'mark',
  requiredStacks: 3,
  flatPerStack: 7,
  outcome: {type: 'instant_aoe', config: existingAOE, damage: ownComponent}
}
```

These are the exact validated fields. The outcome is exactly one existing instant
AoE, without nested consume, on-hit declarations, expressions or relation overrides.
Use selected entity mode and root-offense/instance-session opt-in. Source is always
the authenticated Root/Child caster. Existing Skill definition relations apply.
Origin/aim and AoE placement follow canonical dispatch; Child origin remains its
authenticated receipt anchor. Nothing synthesizes a cast or changes child costs,
cooldowns, action slots, provenance, independent lifecycle or pinned definitions.

At activation, preflight validates schema, selected target/source, placement inputs,
stack capability, authenticated component/S0, modifier capacity and the existing
512-work boundary budget. It adds one operation-local `flat_damage/add_flat`
contribution with value `flatPerStack * consumedCount`, validated by the existing
modifier contract. Product must be finite/nonnegative and at most 1,000,000; existing
256 flat-plus-bonus capacity still applies. All B0/B1/rank/critical/defense arithmetic
continues in Damage/Modifier Core. Immutable S0 and later effects are unchanged.

After successful preflight, exact-N removal and canonical AoE dispatch run
synchronously at the same boundary. A successful operation costs one work unit in
the existing trigger-session counter, including Root operations without trigger links.
No new queue, reservation manager, clock or scheduler is introduced. Failure emits
`effect-rejected` before spending. Other ordered Skill entries continue, and committed
root MP/cooldown are not refunded. No refund for empty AoE, zero damage or Dodge.

Removal and outcome event notifications are withheld until outcome dispatch finishes;
observers receive removal notifications before ordered outcome notifications. This
prevents a removal observer from interrupting consume-to-dispatch. Trusted entity,
stat, geometry and RNG adapters retain their existing responsibilities. This is an
admission/removal transaction, not combat rollback or an exception recovery framework.

## Actual Core evidence

`tests/effects/stack-consumption.test.ts` covers 5→consume3→2 and 3→consume2→1,
selection/cap refresh, preserved modifiers/restrictions, malformed/insufficient input,
source/target isolation, forged/cross-owner/replayed/stale capabilities, expiry,
entity replacement/defeat and terminal cleanup. Apply serial remains unchanged.

`tests/integration/stack-consumption.test.ts` covers canonical Root/Child dispatch,
schema/capacity/eligibility/work failures before spend, expiry-before-consume,
Dodge/empty-AoE no-refund, notification-time disposal, own rank/shared S0/live armor,
and equality of coarse/fine events, HP and RNG. The budget test first creates 512
actual projectiles through v1.1.4, then verifies consume rejects with its pool intact.

The [installed consumer](../examples/stack-consumption.ts) uses public imports only:

| Scenario | Stack timeline | Bonus B0 | AoE damage | Target HP | RNG calls |
| --- | --- | --- | --- | --- | --- |
| Root N=2 | 0→1→2→3→1 | 14 | 34 | 966 | 1 critical, 0 dodge |
| Root N=3 | 0→1→2→3→0 | 21 | 41 | 959 | 1 critical, 0 dodge |
| OnImpact Child N=3 | 0→1→2→3→0 | 21 | 41 (+20 root projectile) | 939 | 2 critical, 0 dodge |

Selected IDs are `["source",1]`, `["source",2]` and, for N=3, `["source",3]`.
Each scenario captures S0 once and spends only root MP (100→95). Child shares the
same S0. The ranked Child integration separately observes raw B0=66, mitigated damage
33 at live armor100, after a root hit10; HP=957 despite changing source attack to999.
`STACK_CONSUMPTION_VERIFIED` requires these actual damage/state results, not merely
returning a count. Prior A→B→C installed proof and the legacy example digest stay pinned.

## Compatibility and preservation

Public additions: the `EffectLifecycle` preparation/commit methods, four Effects
consume types, `SkillStackConsumption`, and the `consume_stacks` union member.
Existing removal-reason consumers must handle the new opt-in `consumed` reason.
No package entrypoint, dependency, version, forwarder or Damage formula changes.
`dot-core.ts` and `consume_on_tick` remain untouched.

Only three historical baseline entries are amended, retaining before/after hashes
and existing approval history. Seven existing declarations change:
`SkillGameplayEffect`, `validateSkillEffects`, `Delivery`, `aoe`,
`dispatchGameplayEffects`, `EffectRemovalReason`, `EffectLifecycle`.
Six are added: `SkillStackConsumption`, private `consumeStackEffect` and the four
Effects consume contracts. Every other declaration fingerprint remains enforced.

Final local verification on Node24.18.0: targeted suites **102/102 tests in eight
files PASS**; replay/consume regression **30/30 in three files PASS**; full
`npm run verify` **PASS**, including **235/235 tests in 25 files**, build/types,
architecture (44 modules, no runtime cycles), preservation (27 legacy modules),
unchanged example digest and strict installed consumer. Owner capabilities use a
JavaScript private field, preserving the existing runtime `structuredClone` replay
test. `git diff --check` passes. Pushed commit SHA and Node22.13.0/24 CI links are
reported in PR #4 and the checkpoint handoff.

No remaining Core capability gap is required by this slice.
**v1.1.6 Conditional Triggers: NOT IMPLEMENTED.**
**v1.1.7 Skill Modifier & Upgrade: NOT IMPLEMENTED.**
