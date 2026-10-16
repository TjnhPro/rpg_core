# RPG Core v1.1.4 — Nested Skill Composition

Base: `0e85797ee5907ab574018deac749744519125bc6`, branch
`feat/v1.1.2-skill-instance-lifecycle`, [PR #4](https://github.com/TjnhPro/rpg_core/pull/4).
Developer approved the v1.1.4 delta plan after the v1.1.0–v1.1.3 checkpoints,
with actual-emission budgets, the existing cancellation policy and minimal session
retention. Base CI passed Node 22.13.0 and 24. This checkpoint does not merge PR #4.

## Opt-in and execution

Use existing root-offense capture and instance session APIs, trusted pins and a
validated trigger bundle. Add `executeChildren: true` to the root's trigger binding:

```ts
triggers: {bundle, executeChildren: true, observe: result => results.push(result)}
```

Omitting the flag preserves v1.1.3 intent-only behavior. All internal admission,
component assembly, child dispatch and emission-accounting helpers stay outside
the public barrels. No new package entrypoint or gameplay effect schema is added.
See [the installed-package recipe](../examples/nested-composition.ts).

At the existing boundary drain, Core validates the entire occurrence, including
session-owned receipt payloads, pinned definitions, live source, selected target,
ancestry, deadline and capacity. Only then does it register the whole child batch
and consume its receipts. Registration failure creates no child or gameplay effect.
The child ID is its Core-issued receipt ID; root/parent IDs remain explicit.
Identical receipt validation stays read-only; consumed handles cannot register again.
Cloned, conflicting, cross-session and disposed capabilities cannot execute children.

Accepted children start pending. The trigger session retains due executions and
`nextSkillEffectBoundary` partitions the existing effect loop at `executeAtMs`.
There is no recursive spawning, second clock or scheduler. The queue orders by
execution timestamp, then the existing occurrence ordering and link order. Expiry
capture still precedes impact collection; drain follows the gameplay boundary.
Zero-delay projectile chains iterate through that same loop and retain one boundary's
work budget. Caller mutations must use the same external boundaries in coarse/fine runs.

Trusted child activation calls the lifecycle API and the same gameplay dispatch
implementation as roots, without constructing a root `SkillActivatedEvent`. It
does not call `executeSkill`, spend MP, write cooldowns, increment action serials
or occupy the actor slot. Component assembly replaces only definition/rank on the
same immutable root S0; tags and mechanics come from each child's own component.
Damage calculation, live defense/eligibility, HP, AoE, projectiles, DoT and timed
deliveries continue through their canonical Core implementations.

The child origin and expiry anchor are exactly `receipt.origin`. Ground children
use that point; entity children select only the receipt's contact target, with live
target aiming at activation. Self children select the source. An expiry receipt
without an entity target cannot create an entity-targeted child; Core rejects the
whole occurrence rather than retargeting. Delayed entity targets/source references
are checked against the registered objects, preventing ID reuse from retargeting.

## Lifecycle, cancellation and retention

Parent finish/expiry does not block authenticated receipts. Projectiles launched
before parent cancellation retain OnImpact authority and may create children later.
Cancelled parents gain no new occurrence authority; cancellation does not emit
OnExpire. Public manual registration still requires a pending/active parent.
Children already registered and issued deliveries remain detached.

Pending and active children retain their definition/S0. Trusted older observations
support outstanding child deliveries after terminal payload compaction. Missing
source rejects admission/activation; dead but registered source follows the existing
delivery policy. Target loss does not cancel active instances, and contacts remain
live-validated. Session disposal clears pending execution, receipt payloads, instances,
deliveries and root trust. Compact terminal records remain session-owned; no family
GC, reference-count framework, global registry or event-history ledger is added.

## Budgets and failures

| Bound | Enforcement |
| --- | --- |
| Depth 8 | Validated DAG plus runtime ancestry/depth checks |
| 128 intents/root | Existing whole-occurrence reservation and committed intent total |
| 32 live children/root | Real pending/active records; preflight entire occurrence; terminal children free capacity |
| 256 queued | Existing boundary intake plus a bound on retained delayed execution entries across roots |
| 512 work/boundary | Existing link-processing work, child activation units, and each actually created projectile once |
| 32 projectiles/emission | Existing projectile/timed-object definition validators |
| 256 projectiles/root family | Actual Root/Child/Grandchild emissions, one counter on the existing root context |

Emission preflight counts only traversable projectile spawn positions. Count/work
commit occurs as each bullet is created. Timed objects reserve no future capacity;
their entire burst is checked when emitted. Insufficient capacity rejects the whole
burst and reports `maxProjectilesPerRoot` or `maxWorkPerBoundary`; directions are
never truncated. Earlier damage remains committed and the family keeps running.
Live-child and queued-entry exhaustion reject whole registration batches. Activation
work exhaustion cancels the due batch without a synthetic natural expiry.

## Actual Core timeline and evidence

Integration fixture root ID: `["nested","actor0#1"]`; B/C IDs are their distinct
authenticated receipt IDs, inspected directly in the test.

| Time (ms) | Observed behavior |
| --- | --- |
| 0 | A admitted; S0 captured once; MP 100 → 95 |
| 50 | A activates and emits its canonical projectile |
| 100 | Root action completes; changing source attack/position cannot change S0 |
| 530 | Projectile entity contact at (78,50); A damage 20; B rank 2 AoE damage 45; target HP 1000 → 935 |
| 630 | B naturally expires; C rank 3 is created with the same S0 and B as parent |
| 730 | C's timed object emits four radial directions at B's pinned impact anchor |
| 930 / 1010 | C projectiles hit two moved targets for 80 each, using live contact/defense |

`tests/skills/nested-composition.test.ts` and the shared real-Core fixture cover:

| Acceptance | Evidence |
| --- | --- |
| N1–N4 | A/B/C identities, shared S0, distinct pins/ranks, actual HP/damage, radial geometry, detached action, MP/cooldown/serial invariance |
| N5–N7 | Dodge remains impact; live armor/faction/removal; finished/cancelled parent authority; dead/missing source; B cancellation suppresses C |
| N8 | Consumed/forged/cross-session handles, repeated advancement, stale target identity and disposal |
| N9 | Exact/overflow depth, live children, 128 actual children, 256 pending executions, 256 actual projectiles, 512 work; whole-batch failure; zero-delay chain |
| N10–N11 | Coarse/fine equality including RNG/events/states, concurrent roots, distinct-session S0, repeated cleanup and callback disposal |
| N12 | Existing v1.0/v1.1.x regression suites and unchanged pinned headless digest |
| N13 | External archive installation, strict TS/ESM without Node ambient types, actual A→B→C damage through public imports |

The installed consumer observes three instances, shared S0, one B hit, four C hits,
four radial directions, target HP615, one capture, MP95, serial1, unchanged cooldown
and completed root action. This is `NESTED_SKILL_EXECUTION_VERIFIED`, not only intent
or instance creation. Targeted tests precede full `npm run verify`; CI checks Node
22.13.0 and 24 on the checkpoint commit.

Local verification (Node 24.18.0): targeted Skills/root-offense/delivery integration
suite **120/120 PASS** across seven files; full `npm run verify` **PASS**, including
**225/225 tests in 23 files**, build/types, architecture (no runtime cycles),
preservation (27 legacy modules), pinned example and installed consumer. The consumer
also verifies all nine public domains, archived legacy paths and blocked deep imports.
`git diff --check`: **PASS**. Remote CI evidence is reported with the pushed SHA.

Preservation changes only the skill-effect-integration baseline entry: changed
`Delivery`, `snapshot`, `launch`, `dispatchSkillEffects`, `nextSkillEffectBoundary`,
`advanceSkillEffects`; added private `GameplayActivation`, `dispatchGameplayEffects`,
`childTarget`, `childDispatcher`. The other 17 historical declarations in that module,
all other baseline modules, historical approval records, shims, formulas and example
digest remain enforced. Before/after fingerprints are recorded in the existing
approval history. Public diagnostics add the live-child/projectile dimensions and
`invalid_child_target`; manual child capacity is enforced only in composition opt-in.

Impact scope remains projectile-to-eligible-entity contact. Ground landing, wall,
no-target and AoE impacts are not implemented; this does not claim ground-impact
Meteor support. No additional Core mechanic is required for this vertical slice.
v1.1.5 Stack Consumption: **NOT IMPLEMENTED**.
