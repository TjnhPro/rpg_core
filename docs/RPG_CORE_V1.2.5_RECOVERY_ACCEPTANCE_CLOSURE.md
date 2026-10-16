# RPG Core v1.2 - Recovery acceptance and closure review

Developer explicitly accepted v1.2.4 at
`1f8d5b8cd662b94f6776335f2bb5ba29d4b8644a` and approved the v1.2.5 acceptance
plan. Work continues on `feat/v1.2.0-healing-foundation`,
[PR #5](https://github.com/TjnhPro/rpg_core/pull/5). Phase closure itself still
requires Developer acceptance; this checkpoint does not declare the phase closed.

## Scope and ownership

Acceptance-only: no production source, public exports, formulas, schemas, events,
dependencies, version, legacy forwarders or preservation fingerprints change.
Life on Hit, Life on Kill and Mana on Kill are gameplay compositions of existing
Core mechanics, not new engines or global equipment stats. Mana on Hit remains
the existing damage-effect property.

Pinned graph: enemy-targeted Root damage/Mana on Hit; OnHit -> self Child heal;
OnKill -> self Child heal then restore_mana. A defeated victim does not invalidate
a self Child. An ordinary entity-targeted Child still rejects that victim.
Costs, cooldown, serial, S0, receipts and budgets retain their canonical owners.
Children neither activate another player action nor pay another cost/cooldown.

## Actual gameplay and ordering

Integration and installed public-package example both execute:

| Boundary | Source HP | Source MP | Victim HP |
| --- | ---: | ---: | ---: |
| Initial | 50 | 50 | 10 |
| Root cost5 | 50 | 45 | 10 |
| Fatal damage20, actual10; Mana on Hit3 | 50 | 48 | 0 |
| Deferred OnHit Child heal5 | 55 | 48 | 0 |
| Deferred OnKill Child heal20 | 75 | 48 | 0 |
| Same OnKill Child restore_mana10 | 75 | 58 | 0 |

Notification order: damage-applied, entity-defeated, mana-gained, effect-hit,
healing-applied, healing-applied, mana-gained. Damage and synchronous Mana on Hit
commit before damage observers: the first observer already sees HP50/MP48/victim0.
Canonical hit intake precedes deferred receipt admission and Child execution.
OnHit precedes OnKill. One defeat, one occurrence of each kind, one Root
capture/action/cost, cooldown1000, one Crit roll and no Dodge/position rolls.
Both Child admission views share Root S0; finished compact views need not retain
that payload. Activation/receipt replay adds no recovery/events.

## RC01-RC09 evidence

`tests/integration/recovery-acceptance.test.ts`: 35 actual-Core cases using the
existing fixture, Stats/modifiers, deliveries and dispatcher. No new test harness.

| Gate | Evidence |
| --- | --- |
| RC01 | Positive/zero landed contacts heal5; Dodge/invalid relation do not. Full HP emits no recovery. AoE/pierce recover per distinct eligible victim. Defeated source cannot start. |
| RC02 | Fatal direct/projectile/AoE, overkill, nonfatal/Dodge, already-dead admission, duplicate direct delivery and replay. Entity Child cannot hit defeated victim. |
| RC03 | Kill MP10; capped actual7 after cost5; already-full live max95 emits no gain. Nonfatal/Dodge and dead/replaced/missing source yield no kill MP. |
| RC04 | Exact HP75/MP58, full event payload/order and observer states, original caster/shared S0, finished Children, single action/cost/cooldown. |
| RC05 | Missing/replaced/dead source at projectile contact, before admission and during delay; victim replacement before admission; disposal/cross-session receipts. No recovery redirects to replacement source. |
| RC06 | maxOccurrences1; live-child33 rejects; depth8 accepts/depth9 pin rejects; 128 recovery intents execute and ninth kill overflows; queue256 accepts/overflow rejects; shared512 work exhaustion cancels admitted recovery without resource gains. Forged/duplicate/disposed receipts and repeated dispatch remain inert. |
| RC07 | Delayed live Max HP/MP100->200 modifiers: flat HP100->120/MP45->55; percent HP100->140/MP45->65. Full HP inert. Prior percent suite covers ally maxima, expiry ordering, fractions and zero actual recovery. |
| RC08 | Coarse1400 and partitioned contact/delay advancement match full entities/events/results/receipts/finished instances/bullets/RNG; two lethal pierce contacts end HP100/MP71. |
| RC09 | Full regression includes every prior suite and installed scenario; historical expectations/preservation remain unchanged. |

Detached projectiles retain existing damage authorization after source death or
replacement but cannot recover to that source/replacement. A missing source still
fails existing contact validation. An admitted self Child can execute after the
defeated victim is removed/replaced because that victim is not its recipient;
replacement before conditional admission rejects the occurrence instead.

`examples/recovery-acceptance.ts` runs through the existing strict TS/ESM installed
consumer using public `@rpg/core`: actual cost/damage/Child HP/MP, exact typed events,
order, shared S0, totals and inert replay. Prior installed examples remain intact.

## Final acceptance matrix

Accepted hashes are immutable checkpoint references. v1.2.5 awaits acceptance.
Evidence paths below are under tests/ (plus matching installed examples).

| Version / capability | Accepted SHA | Canonical evidence | Public impact | Closure result |
| --- | --- | --- | --- | --- |
| v1.2.0 HP Healing | `9117dd87b0a917669e71a16332f8fd74be7a97b0`, docs `0d2b0b83134ba6f270bd5ee43eea60e3e8b4ac08` | combat/healing; integration/healing | heal, applyEntityHealing, healing-applied; exhaustive cases | PASS (full verify) |
| v1.2.1 Applied-Damage Lifesteal | `2a8e1eff7d7e2164d1b8a6e7c7ab21cecbe0d801` | integration/lifesteal | Optional damage-effect rate | PASS (full verify) |
| v1.2.2 Mana on Hit | `7e1b214ad40bc5ca4c4a9a27c82fdbcba32b20a9` | combat/mana-gain; integration/mana-on-hit | manaOnHit, applyEntityManaGain, mana-gained; event cases | PASS (full verify) |
| v1.2.3 Explicit HP/MP Restore | `880a60683006a14dc2228b95a2e8095659b7bcf7` | integration/explicit-restore, prior HP suites | restore_mana discriminant; recipient resourceStats | PASS (full verify) |
| v1.2.4 Percent Recovery | `1f8d5b8cd662b94f6776335f2bb5ba29d4b8644a` | integration/percent-recovery | Approved amount union; numeric-read narrowing | PASS (full verify) |
| v1.2.5 Hit/Kill recovery composition | Pending acceptance; closure SHA in PR handoff | integration/recovery-acceptance | No production API/schema change | 35 focused cases PASS |
| v1.2.5 Full regression/consumer | Same closure SHA, pending acceptance | npm run verify and exact-head CI | No compatibility change | Local verify/consumer PASS; exact-head CI in PR handoff |

## Compatibility, preservation and deferrals

Root/domain/package exports retain their surface. No new discriminants here.
Prior heal/restore_mana and healing-applied/mana-gained still require exhaustive
downstream switch cases. Installed strict consumer tests both amount shapes and
requires narrowing for numeric-only reads. This verifies tested consumers, not
every private downstream repository.

Preservation stays byte-for-byte unchanged from accepted v1.2.4, including prior
narrow amendments/historical provenance. Standard checks verify declaration hashes,
all27 compiled legacy namespace identities, nine public domains, blocked deep
imports and the unchanged deterministic example (targetHP70/seed73).

Approved phase deferrals remain aggregated DoT OnKill attribution,
OnKill+requiresStacks, DoT recovery, Mana Steal/enemy-MP gain, HoT/MoT, global
equipment Life on Hit/Mana on Kill, anti-heal, shields/overheal and resurrection.
No in-scope capability gap was found. No new resource or trigger engine.

## Verification and handoff

Focused 35 cases and installed strict TS/ESM consumer PASS. Full npm run verify: 458 tests / 35 files PASS, architecture45 with no runtime cycles, preservation27, unchanged deterministic example and all installed scenarios. npm ci --ignore-scripts: PASS, zero vulnerabilities; git diff --check: PASS. Final-head verification checklist:
npm ci --ignore-scripts, npm run verify, git diff --check, then push and exact-head
Node22.13.0/24 CI. Verify covers build, strict source/test/example types,
architecture/runtime cycles, preservation, full regression, deterministic example
and external installed archive. Actual full counts/results, final SHA and CI links
are recorded in the closure handoff on [PR #5](https://github.com/TjnhPro/rpg_core/pull/5).
This report belongs to that commit; its own SHA is recorded externally.

Changed files: this report, README, architecture and coverage notes; one integration
suite, one public example and existing consumer-smoke extension. No source, fixture
or preservation change. Recommend READY FOR PHASE CLOSURE only when all final gates
pass. Developer phase acceptance remains pending. No merge/publication/tag or next phase.
