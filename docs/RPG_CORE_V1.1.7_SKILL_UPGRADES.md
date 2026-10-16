# RPG Core v1.1.7 — Skill Modifier & Upgrade

Base: `3792306f77891c191be5f8de7d6f3cdbc568844d`, accepted by the Developer.
Developer approved U1–U7 = A and the five-operation delta plan on 2026-10-16.
Continues `feat/v1.1.2-skill-instance-lifecycle`, [PR #4](https://github.com/TjnhPro/rpg_core/pull/4).
Preflight: clean checkout, local/remote PR HEAD matched; Node 24.18.0.
Earlier acceptance evidence remains in Foundation and v1.1.1–6 documents.
Implementation awaits Developer acceptance; verification does not authorize merge.

## Contract

`resolveSkillUpgrades(pinnedBundle, orderedUpgrades, expectedRevision, newRevision)`
is a pure, opt-in Skills API. Success returns `{success:true, resolved,
appliedUpgradeIds, errors:[]}`; failure returns `{success:false, errors}` without
a partial bundle. Revisions are caller-owned nonempty identifiers; expected must
equal `bundle.version`, new must differ. No persisted upgrade registry/history.

Each upgrade has a unique `upgradeId` and base `skillId`. The closed union supports:

| Type | Payload |
| --- | --- |
| `projectile_pattern` | `bulletCount` + `spreadAngles` together |
| `timed_radial_count` | `bulletCount` |
| `instant_aoe_radius` | `radius` |
| `append_modifier` | canonical `modifier_effect` |
| `append_child` | trusted Child definition pin + link whose source matches `skillId` |

Numeric operations address a **base** `effectIndex`, `expectedType`, and
`expectedComponentId`; appended entries are never index targets in the same set.
One numeric write per base effect is permitted. Appends preserve input order and
only add to the end. Duplicate definition/link identities and unsupported graph
combinations reject through the existing DAG validator. Newly appended definitions
are already complete pins; subsequent revisions can target them as base Children.
Unknown fields, duplicate upgrade IDs, identity mismatches, stale revisions,
conflicting writes or invalid resulting data reject the entire set.

Definition pinning reuses `defineSkill` and canonical mechanic/effect validators;
bundle pinning validates the whole graph, reachability, depth and conditional
contracts. Root is always re-pinned with `newRevision` for existing admission.
Changed Children are re-pinned with their own config versions; unchanged Child
pins are reused. All outputs are detached/frozen. Input definitions and active
instances remain unchanged. To execute, validate the selected root's deeply
readonly definition through `defineSkill(rootPin.definition)` and pass its result,
root configVersion/lifetime and resolved trigger bundle to existing `executeSkill`.

No resolver call occurs in dispatch, hit, Child execution or expiry. Each cast
retains its selected bundle, deliveries and root S0. Costs, cooldowns, target modes,
timing, damage/rank, formulas and legacy behavior remain unchanged. Runtime budgets
are still enforced by the existing queue/projectile/Child implementations.

## Evidence

`tests/integration/skill-upgrade.test.ts` covers UG01–UG12 in seven focused groups:
empty resolution and immutable ordered appends; actual projectile/radial/AoE HP;
slow modifier application/expiry and appended Child damage/shared S0; atomic
identity/conflict/value/graph rejection; exact 32-projectile/effect limits and
version mismatch rejection; old mid-flight S0 vs explicitly selected new cast;
conditional exact-N consumption, replay, 32/33 live-Child budget boundaries and
coarse/fine event/HP/RNG equality. Existing conditional/composition suites retain
all other queue/work/depth/projectile-budget and legacy regression evidence.

Actual results: single vs triple projectiles produce HP 980 vs 940; wider AoE adds
a second enemy; slow multiplier is 0.5 then returns to 1 at expiry. Resolving a new
revision leaves an old projectile's damage at 20; the next cast captures updated
offense once and emits three shots. Child uses its own definition/rank with root S0.
`examples/skill-upgrades.ts` supplies UG13 through the externally installed archive:
`UPGRADES_VERIFIED`, v1 HP 980/one projectile, v2 HP 940/three projectiles, selecting
v1 again reproduces v1. Each cast spends 5 MP and captures S0 once.

Validation: targeted upgrade/conditional/composition tests PASS (35/35); full
`npm run verify` PASS on Node 24.18.0: build, strict types, architecture (45 modules,
no runtime cycles), unchanged preservation baseline (27 modules), 254 tests in
27 files, unchanged deterministic example and external installed consumer.
CI repeats on Node 22.13.0/24; exact-head run results are recorded in PR #4.
No package publication, merge, editor pin or v1.1.8 work is included.
