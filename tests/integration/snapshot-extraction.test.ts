import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {kernelSnapshotExamples} from '../fixtures/kernel-snapshots-consumer.js';
import {rootSnapshotExample} from '../../examples/root-snapshot.js';
import {skillInstanceExample} from '../../examples/skill-instance.js';
import {skillTriggerExample} from '../../examples/skill-trigger.js';
import {nestedCompositionExample} from '../../examples/nested-composition.js';
import {stackConsumptionExample} from '../../examples/stack-consumption.js';
import {conditionalTriggersExample} from '../../examples/conditional-triggers.js';
import {recoveryAcceptanceExample} from '../../examples/recovery-acceptance.js';
import {fixture,direct} from '../fixtures/skill-core.js';
import {nestedFixture} from '../fixtures/nested-skill.js';
import {advanceSkillEffects} from '../../src/skills/skill-effect-integration.js';
import {snapshotActorOffense,snapshotActorDamage} from '../../src/damage/damage-core.js';
import {damageDefinition} from '../../src/contracts/damage-contracts.js';
const golden=JSON.parse(readFileSync(new URL('../fixtures/snapshot-parity-golden.json',import.meta.url),'utf8'));
for(const [name,run] of Object.entries({'root-snapshot':rootSnapshotExample,'skill-instance':skillInstanceExample,'skill-trigger':skillTriggerExample,'nested-composition':nestedCompositionExample,'stack-consumption':stackConsumptionExample,'conditional-triggers':conditionalTriggersExample,'recovery-acceptance':recoveryAcceptanceExample}))it(`accepted integration oracle: ${name}`,()=>expect(run()).toStrictEqual(golden.integration[name]));
it('independent numerical consumers run all three vocabularies',()=>expect(kernelSnapshotExamples()).toStrictEqual({text:20,voLam:[24,34],arpg:50,draws:['critical'],shared:true,frozen:true}));
it('retains actual trusted Root reference through Child execution and emissions',()=>{
 const f=nestedFixture();f.activate();const root=f.slot.skillExecution!.snapshot.rootOffense!;
 advanceSkillEffects(f.runtime,1000,f.env);expect(f.observations.length).toBeGreaterThan(0);
 for(const c of f.observations)expect(c.rootOffense).toBe(root);
 expect(f.captures()).toBe(1);expect(Object.isFrozen(root.offense.sources)).toBe(true);
});
it('Legacy clone boundaries and error remapping remain separate from closed capture',()=>{
 const f=fixture([direct()],0,true),i=f.offenseInput(f.entities[0]!);
 const clone=vi.spyOn(globalThis,'structuredClone');
 try{
  const s=snapshotActorOffense(i);expect(clone).toHaveBeenCalledTimes(3);expect(clone.mock.calls[2]![0]).toHaveProperty('attacker');expect(s.sources).not.toBe(i.sources);
  clone.mockClear();const d=snapshotActorDamage(damageDefinition(1),i.sources,i.modifiers,i.settings,i.criticalChance,i.criticalBonus);
  expect(clone).toHaveBeenCalledTimes(2);expect(d.sources).toBe(i.sources);expect(Object.isFrozen(d.sources)).toBe(false);
  const sentinel={};clone.mockImplementation(()=>{throw sentinel;});
  try{snapshotActorOffense(i);expect.fail();}catch(e){expect(e).not.toBe(sentinel);expect(e).toBeInstanceOf(Error);expect((e as Error).message).toBe('invalid_root_offense');}
  try{snapshotActorDamage(damageDefinition(1),i.sources,i.modifiers,i.settings,0,0);expect.fail();}catch(e){expect(e).toBe(sentinel);}
 }finally{clone.mockRestore();}
});
