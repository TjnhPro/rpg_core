# RPG Core source snapshot

Pure TypeScript RPG Core v1.0 shared/headless baseline. One canonical source
implementation; this archive is a point-in-time backup, not a second live engine.
EXPORT-MANIFEST.json pins Git revision, files/hashes, dependencies and snapshot ID.
The adjacent archive verification report determines independent readiness; the
manifest deliberately says candidate until that validation has completed.

Requires Node >=22.13, npm, TypeScript and Vitest (exact versions/lock included).
No production/runtime npm dependency, DOM, Three.js, Workers, D1 or game assets.

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck:tests
npm test
npm run example
```

These tests are ONLY the audited Core baseline, not the original game suite.
The example executes real Skill/action/effect/damage APIs twice with seed73,
compares results and disposes resources. No hidden source link to the original repo.

## Integration

Import functions directly from src/shared/game (or emitted dist/src/shared/game).
examples/headless.ts demonstrates create entities → supply config/stat resolver,
trusted factions/world-grid/positions, clock/version/RNG → executeSkill → advance
at activation/contact/expiry boundaries → dispatchSkillEffects → read HP/events →
cancel all slots then clearSkillEffects. Do not derive damage from VFX callbacks.

Supported: Core/derived stats, Flat/Percent/percentage-point modifier resolver,
HP/MP and regen, B0/B1 damage, Dodge/Armor/MR, entity/action/target validation,
Skill admission/cost/cooldown/execution, direct/melee/projectile/instant and timed
AOE/DoT delivery, Effect lifecycle/stack/refresh/modifiers/stun/silence.
Stats fallback seeds retain numeric compatibility, not a mandatory game balance.
Supply complete external configuration for your product. Defense coefficients
must be supplied to activate rating formulas. Elemental stats remain disabled
under the preserved version>=2 contract. Reserved IDs do not imply new mechanics.

Use collectActiveModifiers with application-owned active sourceInstanceIds;
merge EffectLifecycle.modifiers(target) and call prepareModifierResolver then
resolveCharacterStats. Never store Effective Stats as a second authoritative base.
snapshotActorDamage snapshots offense at mechanic-owned time; defense is live.
DoT/projectiles already emitted survive caster defeat; session end cleans them.
Applications own deterministic ordering/clock/RNG and event wiring. The test-only
timeline driver is an example, not a new production scheduler/Auto policy.

Not included: Auto-Combat, AI, pathfinding/movement policy, map content/projection,
inventory/equipment ownership, JX1 content/assets, progression/rewards, networking,
auth/database/replay orchestration or client rendering. The small grid DDA/range
helpers are shared geometry only; callers supply collision data.

## Provenance and license limits

Sources are from the current repository's Shared Core, minimally separated without
formula changes. No source files/images from the read-only JX1M checkout are copied.
Grid traversal was locally implemented with behavior informed by JX1M research;
this is not a claim that all existing source has a clean-room legal provenance.
There is no root source LICENSE in the repository: this backup does not grant
commercial distribution rights or establish ownership of pre-existing code.
Review rights before external redistribution. No secrets or game art included.

Build/test dependencies: TypeScript Apache-2.0; Vitest MIT; @types/node MIT.
The lockfile records transitive dependencies; their own package LICENSE files
remain controlling. They are restored via npm, not vendored into this archive.
