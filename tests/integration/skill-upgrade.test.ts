import {expect,it} from 'vitest';
import {fixture,projectile,timed,direct,damage} from '../fixtures/skill-core.js';
import {nestedFixture} from '../fixtures/nested-skill.js';
import {DEFAULT_INSTANT_AOE} from '../../src/contracts/mechanic-contracts.js';
import {defineSkill,resolveSkillUpgrades,pinSkillInstanceDefinition,pinSkillTriggerBundle,executeSkill,advanceSkillExecution,dispatchSkillEffects,advanceSkillEffects,inspectSkillInstance,validateSkillTriggerReceipt,type SkillUpgrade,type SkillTriggerBundle,type SkillGameplayEffect,type SkillTriggerResult} from '../../src/skills/index.js';

const pattern:SkillUpgrade={upgradeId:'pattern',skillId:'test',type:'projectile_pattern',effectIndex:0,expectedType:'projectile',expectedComponentId:'component',bulletCount:3,spreadAngles:[0,0,0]};
const mark:Extract<SkillGameplayEffect,{type:'modifier_effect'}>={type:'modifier_effect',target:'selected',definition:{effectId:'mark',durationMs:2000,stackingPolicy:'stack',maxStacks:3}};
function base(effects:SkillGameplayEffect[]=[projectile()]){
 const f=fixture(effects,0,true,'upgrades');
 const bundle=pinSkillTriggerBundle({version:'v1',rootSkillId:'test',definitions:[pinSkillInstanceDefinition(f.definition,'v1')],links:[]});
 return {...f,bundle};
}
function resolve(bundle:SkillTriggerBundle,upgrades:readonly SkillUpgrade[]=[]){const r=resolveSkillUpgrades(bundle,upgrades,bundle.version,'v2');if(!r.success)throw Error(r.errors.join());return r;}
function cast(f:ReturnType<typeof base>,bundle:SkillTriggerBundle,now=0,results:SkillTriggerResult[]=[]){
 const pin=bundle.definitions.find(p=>p.definition.skillId===bundle.rootSkillId)!;
 Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:(r:SkillTriggerResult)=>results.push(r)}});
 const definition=defineSkill(pin.definition);if(!definition.success)throw Error('definition');
 const r=executeSkill(definition.definition,f.context,f.slot,f.cooldowns,f.executionEnv,{now,expectedSerial:(f.slot.actionSerial??0)+1,configVersion:pin.configVersion},f.actions);
 expect(r.success).toBe(true);advanceSkillEffects(f.runtime,now+50,f.env);advanceSkillExecution(f.slot,f.context.combat,now+50,f.actions);
 const e=f.actions.filter(e=>e.type==='skill-activated').at(-1)!;if(e.type!=='skill-activated')throw Error('activation');dispatchSkillEffects(f.runtime,e,f.env);return e;
}

it('UG01/07: empty resolution, ordered appends and deep immutability preserve inputs and unchanged Child pins',()=>{
 const f=nestedFixture();const before=JSON.stringify(f.bundle),r=resolve(f.bundle);
 expect(JSON.stringify(f.bundle)).toBe(before);expect(r.resolved.definitions[0]!.configVersion).toBe('v2');expect(r.resolved.definitions[1]).toBe(f.b);expect(r.appliedUpgradeIds).toEqual([]);
 const input:SkillUpgrade[]=[{upgradeId:'first',skillId:'test',type:'append_modifier',effect:structuredClone(mark)},{upgradeId:'second',skillId:'test',type:'append_modifier',effect:{...mark,definition:{...mark.definition,effectId:'second'}}}];
 const appended=resolve(f.bundle,input);input.reverse();
 expect(appended.appliedUpgradeIds).toEqual(['first','second']);expect(appended.resolved.definitions[0]!.definition.effects!.slice(-2).map(e=>e.type==='modifier_effect'&&e.definition.effectId)).toEqual(['mark','second']);
 expect(Object.isFrozen(appended.resolved.definitions[0]!.definition.effects)).toBe(true);expect(JSON.stringify(f.bundle)).toBe(before);
});
it('UG02/03/04: projectile pattern, radial directions and AoE radius change actual delivery/HP',()=>{
 for(const upgraded of [false,true]){
  const p=base(),bundle=resolve(p.bundle,upgraded?[pattern]:[]).resolved;cast(p,bundle);
  expect(p.runtime.bullets).toHaveLength(upgraded?3:1);advanceSkillEffects(p.runtime,600,p.env);expect(p.entities[1]!.currentHp).toBe(upgraded?940:980);
  const angled=base();cast(angled,resolve(angled.bundle,[{...pattern,spreadAngles:[-30,0,30]}]).resolved);expect(new Set(angled.runtime.bullets.map(b=>JSON.stringify(b.direction))).size).toBe(3);
  const radial=base([timed()]);cast(radial,upgraded?resolve(radial.bundle,[{upgradeId:'radial',skillId:'test',type:'timed_radial_count',effectIndex:0,expectedType:'timed_object',expectedComponentId:'component',bulletCount:4}]).resolved:radial.bundle);
  advanceSkillEffects(radial.runtime,150,radial.env);expect(radial.runtime.bullets).toHaveLength(upgraded?4:1);expect(new Set(radial.runtime.bullets.map(b=>JSON.stringify(b.direction))).size).toBe(upgraded?4:1);advanceSkillEffects(radial.runtime,700,radial.env);expect(radial.entities[1]!.currentHp).toBe(980);
  const aoe=base([{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,origin:'target',radius:10}}]);
  cast(aoe,upgraded?resolve(aoe.bundle,[{upgradeId:'radius',skillId:'test',type:'instant_aoe_radius',effectIndex:0,expectedType:'instant_aoe',expectedComponentId:'component',radius:60}]).resolved:aoe.bundle);
  expect(aoe.entities.slice(1,3).map(e=>e.currentHp)).toEqual(upgraded?[980,980]:[980,1000]);
 }
});
it('UG05/06: append canonical modifier and Child, then upgrade Child alone with shared root S0',()=>{
 const f=base([direct()]);const child=pinSkillInstanceDefinition({...f.definition,skillId:'child',targetMode:'ground',effects:[{type:'instant_aoe',damage:{...damage(),rank:2},config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:10}}]},'child-v1',100);
 const appended=resolve(f.bundle,[{upgradeId:'mark',skillId:'test',type:'append_modifier',effect:{...mark,definition:{...mark.definition,modifiers:[{id:'slow',target:'movementSpeedMultiplier',operation:'add_percent',value:-.5,enabled:true,conditions:[]}]}}},{upgradeId:'child',skillId:'test',type:'append_child',definition:child,link:{linkId:'child',sourceSkillId:'test',childSkillId:'child',trigger:'OnHit',delayMs:0,maxOccurrences:1}}]);
 const r=resolveSkillUpgrades(appended.resolved,[{upgradeId:'child-radius',skillId:'child',type:'instant_aoe_radius',effectIndex:0,expectedType:'instant_aoe',expectedComponentId:'component',radius:60}],'v2','v3');if(!r.success)throw Error(r.errors.join());
 expect(r.resolved.definitions[0]!.definition).toEqual(appended.resolved.definitions[0]!.definition);expect(r.resolved.definitions[1]).not.toBe(child);
 const results:SkillTriggerResult[]=[],activation=cast(f,r.resolved,0,results);advanceSkillEffects(f.runtime,50,f.env);
 expect(f.runtime.effects.groups('actor1')[0]!.currentStacks).toBe(1);expect(f.entities[2]!.currentHp).toBeLessThan(1000);expect(results).toHaveLength(1);
 expect(f.stats(f.entities[1]!).movementSpeedMultiplier).toBe(.5);
 expect(inspectSkillInstance(f.runtime,results[0]!.receipt!.receiptId)!.rootOffense).toBe(activation.snapshot.rootOffense);expect(f.captures()).toBe(1);expect(f.entities[0]!.currentMp).toBe(95);advanceSkillEffects(f.runtime,2050,f.env);expect(f.stats(f.entities[1]!).movementSpeedMultiplier).toBe(1);
});
it('UG08: rejects duplicates, stale/missing/type/component identities, conflicts and invalid graphs atomically',()=>{
 const f=base(),before=JSON.stringify(f.bundle);
 const invalid:SkillUpgrade[][]=[[pattern,pattern],[pattern,{...pattern,upgradeId:'conflict'}],[{...pattern,skillId:'missing'}],[{...pattern,effectIndex:1}],[{...pattern,expectedComponentId:'wrong'}],[{...pattern,expectedType:'instant_aoe'} as unknown as SkillUpgrade],[{...pattern,bulletCount:2}],[{...pattern,bulletCount:33,spreadAngles:Array(33).fill(0)}],[{...pattern,spreadAngles:[NaN,0,0]}],[{upgradeId:'bad',skillId:'test',type:'append_modifier',effect:{...mark,definition:{...mark.definition,durationMs:-1}}}],[{upgradeId:'cycle',skillId:'test',type:'append_child',definition:f.bundle.definitions[0]!,link:{linkId:'cycle',sourceSkillId:'test',childSkillId:'test',trigger:'OnHit',delayMs:0,maxOccurrences:1}}]];
 for(const set of invalid){const r=resolveSkillUpgrades(f.bundle,set,'v1','v2');expect(r.success).toBe(false);expect('resolved' in r).toBe(false);expect(JSON.stringify(f.bundle)).toBe(before);}
 expect(resolveSkillUpgrades(f.bundle,[],'stale','v2').success).toBe(false);expect(resolveSkillUpgrades(f.bundle,[],'v1','v1').success).toBe(false);expect(resolveSkillUpgrades({...f.bundle},[],'v1','v2').success).toBe(false);expect(f.entities[0]!.currentMp).toBe(100);expect(f.captures()).toBe(0);
});
it('UG11: canonical limits accept 32, reject 33 and never weaken revision admission',()=>{
 const f=base(),angles=Array<number>(32).fill(0),r=resolve(f.bundle,[{...pattern,bulletCount:32,spreadAngles:angles}]);angles[0]=90;
 const pin=r.resolved.definitions[0]!,definition=defineSkill(pin.definition);if(!definition.success)throw Error('definition');
 Object.assign(f.executionEnv,{triggers:{bundle:r.resolved,executeChildren:true,observe:()=>{}}});
 expect(executeSkill(definition.definition,f.context,f.slot,f.cooldowns,f.executionEnv,{now:0,expectedSerial:1,configVersion:'v1'}).success).toBe(false);expect(f.captures()).toBe(0);expect(f.entities[0]!.currentMp).toBe(100);
 cast(f,r.resolved);expect(f.runtime.bullets).toHaveLength(32);expect(f.runtime.bullets.every(b=>b.direction.y===0)).toBe(true);advanceSkillEffects(f.runtime,600,f.env);expect(f.entities[1]!.currentHp).toBe(360);
 const effects=base(Array.from({length:32},()=>direct()));expect(resolveSkillUpgrades(effects.bundle,[{upgradeId:'overflow',skillId:'test',type:'append_modifier',effect:mark}],'v1','v2').success).toBe(false);
});
it('UG09: old mid-flight delivery/S0 remains pinned, next cast explicitly selects revised bundle',()=>{
 const f=base(),old=cast(f,f.bundle);expect(f.runtime.bullets).toHaveLength(1);
 const r=resolve(f.bundle,[pattern]);f.entities[0]!.baseStats.physicalAttack=100;advanceSkillEffects(f.runtime,600,f.env);advanceSkillExecution(f.slot,f.context.combat,600,f.actions);
 expect(f.entities[1]!.currentHp).toBe(980);expect(old.snapshot.configVersion).toBe('v1');expect(f.captures()).toBe(1);
 const next=cast(f,r.resolved,600);expect(f.runtime.bullets).toHaveLength(3);expect(next.snapshot.configVersion).toBe('v2');expect(next.snapshot.rootOffense).not.toBe(old.snapshot.rootOffense);
 advanceSkillEffects(f.runtime,1200,f.env);expect(f.entities[1]!.currentHp).toBe(650);expect(f.captures()).toBe(2);expect(f.entities[0]!.currentMp).toBe(90);
});
it('UG10/11/12: resolved conditional exact-N, replay, live-child budget failure and coarse/fine determinism',()=>{
 const run=(fine:boolean,count=1)=>{
  const f=base([mark,mark,mark]);
  const child=pinSkillInstanceDefinition({...f.definition,skillId:'child',targetMode:'ground',effects:[{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:10}}]},'child',100);
  const bundle=pinSkillTriggerBundle({...f.bundle,definitions:[...f.bundle.definitions,child],links:Array.from({length:count},(_,i)=>({linkId:'threshold'+i,sourceSkillId:'test',childSkillId:'child',trigger:'OnStackThreshold' as const,stackThreshold:{effectId:'mark',threshold:3},requiresStacks:{effectId:'mark',minStacks:3,sourceScope:'currentSource' as const},...(i===0?{consumeExactly:3}:{}),delayMs:0,maxOccurrences:1}))});
  const revised=resolve(bundle,[{upgradeId:'radius',skillId:'child',type:'instant_aoe_radius',effectIndex:0,expectedType:'instant_aoe',expectedComponentId:'component',radius:60}]).resolved;
  const results:SkillTriggerResult[]=[],activation=cast(f,revised,0,results);dispatchSkillEffects(f.runtime,activation,f.env);
  for(const t of fine?[50,75,100,125,150,200,300]:[300])advanceSkillEffects(f.runtime,t,f.env);
  const accepted=results.filter(r=>r.status==='accepted');for(const r of accepted)expect(validateSkillTriggerReceipt(f.runtime,r.receipt!)).toEqual({success:true,changed:false});
  const beforeReplay=JSON.stringify({events:f.events,results,rolls:f.rolls()});
  const state={hp:f.entities.map(e=>e.currentHp),stacks:f.runtime.effects.groups('actor1')[0]?.currentStacks??0,results,rolls:f.rolls(),events:f.events};advanceSkillEffects(f.runtime,300,f.env);expect(JSON.stringify({events:f.events,results,rolls:f.rolls()})).toBe(beforeReplay);
  expect(accepted).toHaveLength(count>32?0:count);expect(state.stacks).toBe(count>32?3:0);expect(state.hp[2]).toBe(count>32?1000:1000-count*20);if(count>32)expect(results).toContainEqual(expect.objectContaining({dimension:'maxLiveChildren'}));return state;
 };
 expect(run(false)).toEqual(run(true));run(false,32);run(false,33);
});
