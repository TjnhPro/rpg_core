# v1.2.3 - Explicit HP/MP Restore

Developer approved delta plan R1-R8 plus restore-only Root/Child admission identity
and live recipient Max Mana resolution. Accepted baseline v1.2.2:
`7e1b214ad40bc5ca4c4a9a27c82fdbcba32b20a9`. Continue the existing v1.2 branch/PR #5.
Prior accepted Healing implementation: `9117dd87b0a917669e71a16332f8fd74be7a97b0`
(documentation follow-up `0d2b0b83134ba6f270bd5ee43eea60e3e8b4ac08`);
Lifesteal: `2a8e1eff7d7e2164d1b8a6e7c7ab21cecbe0d801`.

## Contract and ownership

HP restoration continues to use `heal` and unchanged `applyEntityHealing`.
One additive Skill effect: `{type:'restore_mana',target:'self'|'selected',amount:20}`.
Amount must be finite, positive and <=1000000; optional allowedTargetRelations can
only narrow self/ally. Closed validation rejects onHit/lifesteal/manaOnHit/unknown
fields, invalid recipients/amounts/relations and more than 32 effects before any
MP cost, action, cooldown or S0 capture. Existing define/pin paths detach/freeze it.
Downstream exhaustive Skill effect switches must handle `restore_mana`.
No new event discriminant, Combat API, stat, upgrade operation or HP effect.

Combat's existing pure `applyEntityManaGain` remains unchanged: cap the increment
before addition, never overcap or decrease MP, return actual before/after/applied.
Skills commits the result and emits the existing positive `mana-gained` event.
Full MP is inert; missing/throwing/invalid resourceStats or invalid live MP bounds
reject without mutation. The trusted resolver receives the actual recipient entity,
including a selected ally, and must return live effective Max Mana with modifiers.
The optional resolver's structure is unchanged; its parameter documentation now
explicitly identifies the recipient. No artificial elapsed regeneration.

The existing Healing recipient checks are shared without changing HP behavior:
authenticated source reference, pinned recipient, self/ally contact validation,
living target, selected range/LOS. Root uses live caster position; Child uses the
existing authenticated impact/expiry anchor. New MP restoration also requires
finite positive source/recipient HP and the original Root admission source reference.
Restore-only Root and Child definitions opt into the existing identity pinning,
including a Child-only bundle with an empty Root effect list. A current same-ID
replacement is never accepted as the original MP recipient/source. Selected Child
identity is retained through existing receipt admission; missing/dead/replaced
recipients reject without retargeting.

The existing ordered dispatcher executes heal and restore_mana in authored order.
Each operation commits and emits its actual transition before the next effect;
there is no combined transaction or new resource engine. Observer replacement is
checked on subsequent effects, and disposal prevents later resource writes.
Existing activation/receipt/session replay protections and budgets apply. Admission
still requires enough MP to pay the original cost before restoration can run.
Children use their own pin and Root S0 with no additional cost, cooldown or action.
Restoration invokes no Damage/Crit/Dodge and creates no OnHit/OnKill occurrence.

Damage/Healing/regen formulas, Lifesteal and Mana on Hit semantics, DoT aggregation,
OnKill attribution, EffectLifecycle, upgrade whitelist, legacy forwarders and all
previous non-opted-in behavior remain unchanged. No new scheduler, event system,
resource store, ledger or module. Percentage/scaled recovery remains out of scope.

## ER01-ER07 gameplay evidence

- ER01 reuses existing Combat Healing math and integration tests for normal,
  capped/full/defeated/invalid targets. HP logic and primitive are retained.
- ER02 new integration tests cover normal/capped/full/zero/fractional MP,
  invalid amounts including overflow, closed schema and invalid runtime resources.
- ER03 self/selected ally, enemy rejection, source/target replacement/death,
  missing recipient, relation narrowing, range/LOS and invalid positions.
  Selected ally Max Mana80 with a live -20 modifier caps MP50->60 (gain10);
  resolver receives actor3, and caster remains35 after its single cost5.
- ER04 ordered Root: HP80->100 with actual healing20, MP40->35 cost->55 restore20.
  Observer states are [100,35] then [100,55]; one action/CD1000/capture and zero RNG.
  Reversed authorship reverses resource event order; callback disposal stops MP.
- ER05 Child-only restore7 after Root direct damage20: sourceMP40->35->42;
  one Root S0/action/cost/cooldown, pinned Child amount, receipt/session replay.
  Selected Child caps ally98->100 using its own stats after caster moves; source
  replacement and invalid recipients cannot redirect recovery. An empty-effect
  Root produces restore-only expiry Child without damage/healing/Mana on Hit.
- ER06 combined damage20, Lifesteal5, explicit heal10, Mana on Hit10 and explicit
  restore20 execute once: sourceHP80->95, MP40->35->65; one Crit and no Dodge RNG.
  Coarse/fine sequence + Child matches resources/events/instances/effects/RNG;
  final sourceHP100/MP54, one accepted Child, occurrence and live-child budgets.
- ER07 examples/explicit-restore.ts uses only public package APIs in the existing
  strict TS/ESM consumer: HP80->100, MP40->35->55, exactly one event per resource,
  actual caps, zero RNG, one S0/action/CD and inert replay. Previous examples stay.

## Verification

Targeted Combat/Integration PASS: 244 tests, including 38 Explicit Restore cases.
Final `npm run verify` PASS on Node24.18.0:392 tests /33 files, build/strict
types, architecture45 with no runtime cycles, preservation27, unchanged headless
example HP70/seed73 and installed strict TS/ESM consumer including prior examples.
`npm ci --ignore-scripts` PASS, zero vulnerabilities and unchanged lockfile.
`git diff --check` PASS. Exact-commit Node22.13.0/24 CI is recorded in the PR handoff.
Stop at READY FOR DEVELOPER REVIEW; no merge/publication/release or v1.2.4 work.

## Narrow preservation amendment

Historical provenance and prior approved amendments remain. Only changed/new
Skills declarations below are amended; Combat primitives/events and all unrelated
fingerprints/legacy identity checks stay pinned.

| Declaration | Before | After |
| --- | --- | --- |
| src/skills/skill-effects.ts: SkillGameplayEffect | 870256bb359174b088512a10174ec762f4a16e62ed1a06b34553381747c4366d | eb386f25e459c074ec9fc76008045223827886e28cf7122ac2e7ac8ddfecaed7 |
| src/skills/skill-effects.ts: validateSkillEffects | 22a430a0c560717837a6c0b0c424995c4f339756e535c84c22811ca549a7c50b | dd9a1470782d2cd40e0bd1e3fd381f3dfa9723b8a4a850d6942b7f85fbaa6c63 |
| src/skills/skill-execution.ts: executeSkill | 0e604dda6f2c163621958c071488b4cd2b40911a4140a0e692be21caac1e0af0 | 4b2380347eb858395cc2d274bbce95697e00af997455583155eee2510b7a991b |
| src/skills/skill-effect-integration.ts: SkillEffectEnvironment | 125abba20252d311d7e042e7f0ff8675bf9ba89c0e5abdcc70d9d28f947b18cb | 6217f75d58ce4afa114fd3b8d392b2a1cb233b3f6650ad9e125b27becc6edf3c |
| src/skills/skill-effect-integration.ts: Delivery | 7ab4b27591492b83cc20c31413569ccbd99facfe60e9e994cac3cf35fb67eedc | 1c0a40af2089c4fe7e2e7c274f84db1847286f0199f04295eb45ff7b8b8401da |
| src/skills/skill-effect-integration.ts: resourceRecipient | new | 2848cdabb3cb390c823372d00ab033d34ccbb1956dde4f96c03ff007ac1d0ff7 |
| src/skills/skill-effect-integration.ts: heal | 872719983bb624859cf8ca887fa97f9c24e5c389f201bce8dff6982544102920 | 05ec00295aaf7f30deaeb47a9ec380f3b13c1ec468776c653e56775afd6dc266 |
| src/skills/skill-effect-integration.ts: restoreMana | new | 2b3805f5121884356b031daa1cf40e2dfa00999730c98e74ddd7c39b287e4e1f |
| src/skills/skill-effect-integration.ts: dispatchGameplayEffects | 849ff0eef18fbe8b7d7b0c5f2b7c6e77ba7a76f00cd02e6fce9066a9865cb115 | 31fe2fb936203a3018652f93f1c29e86ec6df0da6906f1d9e00c9165ce905e5d |
| src/skills/skill-effect-integration.ts: childDispatcher | d7506978662d6ab44555f935331a6d149c51a36651dd18de56b386d6fc8307d1 | b19ccdd3bc14cd9480870c59d61dfb19327002558d2c4108b2e1519c71716c70 |
