import {expect,it} from 'vitest';
import {fixture,direct,projectile,sequence,timed,dot} from './fixtures/skill-core.js';
import {timeline} from './fixtures/skill-timeline.js';
import type {EffectDefinition,EffectModifier} from '../../src/effects/effect-system.js';
import type {SkillGameplayEffect} from '../../src/skills/skill-effects.js';
import {executeSkill,advanceSkillExecution,type SkillExecutionSlot,type SkillExecutionEvent} from '../../src/skills/skill-execution.js';
import {createSkillCooldownState} from '../../src/skills/skill-engine.js';
import {clearSkillEffects,dispatchSkillEffects} from '../../src/skills/skill-effect-integration.js';

const modifier=(target:string,value:number,operation:EffectModifier['operation']='add_flat'):EffectModifier=>({id:target,target,value,operation,enabled:true,conditions:[]});
const effect=(definition:EffectDefinition,target:'self'|'selected'='self'):SkillGameplayEffect=>({type:'modifier_effect',definition,target,allowedTargetRelations:target==='self'?['self']:['enemy']});
const cast=(f:ReturnType<typeof fixture>,t:ReturnType<typeof timeline>,effects:SkillGameplayEffect[])=>{
 f.definition.effects=effects;expect(t.start().success).toBe(true);t.advance(f.runtime.now+100);
};

it('Battle Cry / Iron Skin: actual casts refresh payloads, pin current action and restore equipment at expiry',()=>{
 const f=fixture([]),t=timeline(f),hero=f.entities[0]!,base=structuredClone(hero.baseStats);
 f.modifiers.actor0=[{...modifier('armor',100),source:'equipment',sourceInstanceId:'armor'}];
 hero.currentHp=400;hero.currentMp=70;
 const cry=effect({effectId:'battle-cry',durationMs:10000,modifiers:[modifier('attackSpeed',.2,'add_percent')]});
 const skin=effect({effectId:'iron-skin',durationMs:8000,modifiers:[modifier('armor',200)]});
 cast(f,t,[cry,skin]);expect(f.stats(hero)).toMatchObject({attackSpeed:1.2,armor:300});
 expect(f.actions[0]).toMatchObject({type:'action-started',durationMs:100});
 expect([hero.currentHp,hero.currentMp]).toEqual([400,65]);
 const ids=f.runtime.effects.instances().map(i=>i.effectInstanceId);
 cast(f,t,[cry,skin]);expect(f.slot.activeAction).toBeUndefined();
 expect(f.runtime.effects.instances().map(i=>i.effectInstanceId).sort()).toEqual(ids.sort());
 expect(f.stats(hero).attackSpeed).toBe(1.2);
 const starts=f.actions.filter(e=>e.type==='action-started');const second=starts[1]!;
 if(second.type!=='action-started')throw Error('Expected started action');expect(second.durationMs).toBeCloseTo(100/1.2);
 // Real incoming hit uses live Armor; removing only the buff retains equipment.
 const attack=direct(),enemySlot:SkillExecutionSlot={},enemyEvents:SkillExecutionEvent[]=[];
 const enemyContext={...f.context,casterId:'actor1',target:{mode:'entity' as const,casterId:'actor1',targetId:'actor0'}};
 const admission=executeSkill({...f.definition,effects:[attack]},enemyContext,enemySlot,createSkillCooldownState(),{grid:f.env.grid,position:f.env.position,resolveStats:f.stats},{now:200,expectedSerial:1,configVersion:'v1'},enemyEvents);
 expect(admission.success).toBe(true);
 t.advance(250);advanceSkillExecution(enemySlot,f.context.combat,250,enemyEvents);
 for(const event of enemyEvents)if(event.type==='skill-activated')dispatchSkillEffects(f.runtime,event,f.env);
 expect(hero.currentHp).toBe(395); // 20 * (1 - 300 / (300 + 100)).
 t.advance(8200);expect(f.stats(hero).armor).toBe(100);expect(f.stats(hero).attackSpeed).toBe(1.2);
 t.advance(10200);expect(f.stats(hero).attackSpeed).toBe(1);expect(hero.baseStats).toEqual(base);
});

it('Weakness / Rage / Slow: B1, independent stack snapshots, max renewal, duplicate admission and exact-expiry ordering',()=>{
 const f=fixture([]),t=timeline(f),hero=f.entities[0]!;
 const weakness=effect({effectId:'weakness',durationMs:6000,modifiers:[{...modifier('damage_bonus',-.15,'add_percentage_points'),scope:'direct',damageType:'physical',eventTags:['basic']}]});
 const rage=effect({effectId:'rage',durationMs:5000,stackingPolicy:'stack',maxStacks:5,modifiers:[{...modifier('damage_bonus',.05,'add_percentage_points'),scope:'direct'}]});
 const slow=effect({effectId:'slow',durationMs:4000,modifiers:[modifier('movementSpeedMultiplier',-.3,'add_percent')]});
 cast(f,t,[weakness,slow,direct()]);expect(f.hits()[0]!.breakdown.finalDamage).toBe(17);
 expect(f.stats(hero).movementSpeedMultiplier).toBeCloseTo(.7);
 for(let i=0;i<5;i++)cast(f,t,[rage]);
 const before=f.runtime.effects.groups('actor0').find(g=>g.effectId==='rage')!;
 expect(before.currentStacks).toBe(5);expect(new Set(before.instanceIds).size).toBe(5);
 f.definition.effects=[rage,direct()];expect(t.start().success).toBe(true);t.advance(650);expect(f.hits().at(-1)!.breakdown.finalDamage).toBe(22);
 const renewed=f.runtime.effects.groups('actor0').find(g=>g.effectId==='rage')!;
 expect(renewed.instanceIds).toEqual(before.instanceIds);expect(renewed.contributions).toEqual(before.contributions);
 const activation=[...t.events].reverse().find(e=>e.type==='skill-activated')!;
 if(activation.type!=='skill-activated')throw Error('Expected activation');
 expect(dispatchSkillEffects(f.runtime,activation,f.env)).toBe(false);expect(f.runtime.effects.groups('actor0').find(g=>g.effectId==='rage')).toEqual(renewed);
 t.advance(4050);expect(f.stats(hero).movementSpeedMultiplier).toBe(1);
 t.advance(5650);expect(f.runtime.effects.groups().some(g=>g.effectId==='rage')).toBe(false);
 // Expiry at 6050 precedes activation at 6050: a refresh becomes a new instance.
 const old=f.runtime.effects.instances()[0]!.effectInstanceId;t.advance(6000);f.definition.effects=[weakness,direct()];expect(t.start().success).toBe(true);t.advance(6050);
 expect(f.runtime.effects.instances()[0]!.effectInstanceId).not.toBe(old);
 expect(t.events.filter(e=>e.type==='effect-expired').at(-1)!.atMs).toBe(6050);
 expect(f.hits().at(-1)!.breakdown.finalDamage).toBe(17);
});

it('selected Stun Strike cancels real target action once; Silence rejects without spending and never deletes emitted effects',()=>{
 const f=fixture([]),t=timeline(f),target=f.entities[1]!,slot:SkillExecutionSlot={},actions:SkillExecutionEvent[]=[],cooldowns=createSkillCooldownState();
 f.env.actionSlot=id=>id==='actor1'?slot:id==='actor0'?f.slot:undefined;
 const context={...f.context,casterId:'actor1',target:{mode:'entity' as const,casterId:'actor1',targetId:'actor0'}};
 const definition={...f.definition,effects:[projectile()],cooldownMs:1000};
 expect(executeSkill(definition,context,slot,cooldowns,{grid:f.env.grid,position:f.env.position,resolveStats:f.stats},{now:0,expectedSerial:1,configVersion:'v1'},actions).success).toBe(true);
 const stun=effect({effectId:'stun-strike',durationMs:2000,restrictions:['stun']},'selected');
 cast(f,t,[stun]);expect(slot.activeAction).toBeUndefined();expect(target.currentMp).toBe(95);
 advanceSkillExecution(slot,context.combat,100,actions);expect(actions.some(e=>e.type==='skill-activated')).toBe(false);
 expect(t.events.filter(e=>e.type==='action-cancelled')).toMatchObject([{entityId:'actor1',reason:'interrupted',atMs:50}]);
 expect(cooldowns.readyAt.get('actor1')!.get('test')).toBe(1000);
 t.advance(2050);expect(f.runtime.effects.hasRestriction('actor1','stun')).toBe(false);
 const attack=direct();attack.onHit=[dot()];cast(f,t,[projectile(),timed(),sequence(),attack]);
 cast(f,t,[effect({effectId:'silence',durationMs:5000,restrictions:['silence']})]);
 const mp=f.entities[0]!.currentMp,serial=f.slot.actionSerial;expect(t.start()).toMatchObject({success:false,reason:'silenced'});
 expect(f.entities[0]!.currentMp).toBe(mp);expect(f.slot.actionSerial).toBe(serial);
 f.definition.classification='basic';f.definition.effects=[];expect(t.start().success).toBe(true);t.advance(2800);
 expect(f.hits().some(h=>h.mechanic==='projectile')).toBe(true);expect(f.hits().some(h=>h.mechanic==='dot')).toBe(true);
 t.advance(7200);f.definition.classification='active';expect(t.start().success).toBe(true);
});

it('two independent seeded mixed timelines reproduce lifecycle, groups, effective stats, resources, actions, damage and RNG; cleanup is isolated',()=>{
 const run=()=>{
  const hit=direct();hit.onHit=[dot()];const f=fixture([]),t=timeline(f);let seed=42,rolls=0;
  const roll=()=>{rolls++;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  f.env.criticalRoll=roll;f.env.dodgeRoll=roll;f.env.positionRoll=roll;
  f.entities[0]!.baseStats.criticalChance=.5;f.entities[1]!.baseStats.dodgeChance=.3;
  const rage=effect({effectId:'rage',durationMs:500,stackingPolicy:'stack',maxStacks:2,modifiers:[modifier('flat_damage',10)]});
  cast(f,t,[rage,hit,projectile(),timed(),sequence()]);cast(f,t,[rage,effect({effectId:'silence',durationMs:300,restrictions:['silence']},'selected'),effect({effectId:'slow',durationMs:200,modifiers:[modifier('movementSpeedMultiplier',-.3,'add_percent')]},'selected')]);
  expect(f.runtime.effects.groups('actor0')[0]!.currentStacks).toBe(2);expect(f.stats(f.entities[1]!).movementSpeedMultiplier).toBeCloseTo(.7);
  const states=[structuredClone({entities:f.entities,stats:f.entities.map(f.resolved),groups:f.runtime.effects.groups(),instances:f.runtime.effects.instances(),slot:f.slot,cooldowns:f.cooldowns})];
  f.entities[0]!.currentHp=0;t.advance(350);states.push(structuredClone({entities:f.entities,stats:f.entities.map(f.resolved),groups:f.runtime.effects.groups(),instances:f.runtime.effects.instances(),slot:f.slot,cooldowns:f.cooldowns}));
  expect(f.runtime.effects.instances('actor0')).toEqual([]);expect(f.runtime.effects.hasRestriction('actor1','silence')).toBe(true);expect(rolls).toBeGreaterThan(0);
  t.advance(800);clearSkillEffects(f.runtime,f.env);const count=t.events.length;clearSkillEffects(f.runtime,f.env);t.advance(5000);
  expect(t.events.length).toBe(count);expect(f.runtime.effects.instances()).toEqual([]);expect(f.runtime.bullets).toEqual([]);expect(f.runtime.sequences).toEqual([]);expect(f.runtime.objects).toEqual([]);expect(f.runtime.dots.groups).toEqual([]);
  const other=fixture([]);expect(other.runtime.active).toBe(true);expect(other.runtime.effects.active).toBe(true);
  return structuredClone({states,events:t.events,entities:f.entities,stats:f.entities.map(f.resolved),groups:f.runtime.effects.groups(),slot:f.slot,cooldowns:f.cooldowns,seed,rolls});
 };
 expect(run()).toEqual(run());
});
