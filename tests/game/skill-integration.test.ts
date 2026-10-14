import {it,expect} from 'vitest';
import {fixture,direct,projectile,sequence,timed,dot,damage} from './fixtures/skill-core.js';
import {cancelSkillExecution} from '../../src/skills/skill-execution.js';
import {clearSkillEffects} from '../../src/skills/skill-effect-integration.js';
import {timeline} from './fixtures/skill-timeline.js';
import {inheritSkillCooldowns,remainingSkillCooldown} from '../../src/skills/skill-engine.js';
import {updateCurrentResources} from '../../src/stats/stat-calculation.js';
import {DEFAULT_MELEE_HITBOX} from '../../src/contracts/mechanic-contracts.js';

it.each([0,1])('Basic E2E actor%i: free admission → hit → completion, duplicate updates are inert',caster=>{
 const f=fixture([direct()],caster);Object.assign(f.definition,{mpCost:0,cooldownMs:0});const t=timeline(f);
 expect(t.start().success).toBe(true);expect(t.start()).toEqual({success:false,reason:'entity_busy'});
 t.advance(100);t.advance(100);expect(f.entities[caster]!.currentMp).toBe(100);
 expect(t.events.map(e=>e.type)).toEqual(['action-started','skill-activated','damage-applied','effect-hit','action-completed']);
 expect(f.hits()).toHaveLength(1);expect(f.slot.activeAction).toBeUndefined();expect(remainingSkillCooldown(f.cooldowns,f.context.casterId,'test',100)).toBe(0);
});
it('Fireball E2E pins timing/CDR, snapshots Magic offense at launch and reads live defense',()=>{
 const p=projectile();if(p.type!=='projectile')throw Error('fixture');p.damage.damageType='Magic';p.damage.tags=['Magic','Direct'];
 const f=fixture([p]);Object.assign(f.definition,{cooldownMs:1000});f.entities[0]!.baseStats.cooldownReduction=.2;
 const t=timeline(f);expect(t.start().success).toBe(true);expect(f.entities[0]!.currentMp).toBe(95);
 expect(remainingSkillCooldown(f.cooldowns,'actor0','test',0)).toBe(800);
 f.entities[0]!.baseStats.cooldownReduction=.5;t.advance(50);f.entities[0]!.baseStats.physicalAttack=500;f.entities[1]!.baseStats.magicResistance=100;
 t.advance(530);expect(f.hits()[0]!.atMs).toBeCloseTo(530);expect(f.entities[1]!.currentHp).toBe(990);
 expect(t.start()).toMatchObject({success:false,reason:'skill_on_cooldown',remainingCooldownMs:270});expect(f.entities[0]!.currentMp).toBe(95);
});
it('Poison Slash E2E shares melee/damage/DoT; Dodge suppresses stack, not cost',()=>{
 const effect={type:'melee_hitbox' as const,config:{...DEFAULT_MELEE_HITBOX,radius:110},damage:damage(),onHit:[dot()]};
 const f=fixture([effect]);f.entities[2]!.baseStats.dodgeChance=.85;const t=timeline(f);t.start();t.advance(150);
 expect(f.entities[1]!.currentHp).toBe(960);expect(f.entities[2]!.currentHp).toBe(1000);expect(f.runtime.dots.groups).toHaveLength(0);
 expect(f.entities[0]!.currentMp).toBe(95);expect(f.hits().filter(e=>e.mechanic==='dot')).toHaveLength(1);
});
it('Meteor E2E locks ground position, validates range and snapshots each strike after equipment changes',()=>{
 const f=fixture([sequence()]);Object.assign(f.definition,{targetMode:'ground'});f.context.target={mode:'ground',casterId:'actor0',position:{x:80,y:50}};
 const t=timeline(f);t.start();t.advance(150);f.entities[0]!.baseStats.physicalAttack=30;t.advance(250);f.entities[0]!.baseStats.physicalAttack=50;t.advance(350);
 expect(f.hits().map(h=>[h.atMs,h.breakdown.b0.raw])).toEqual([[150,20],[250,40],[350,60]]);
 f.context.target={mode:'ground',casterId:'actor0',position:{x:700,y:50}};const mp=f.entities[0]!.currentMp;expect(t.start()).toMatchObject({success:false,reason:'out_of_range'});expect(f.entities[0]!.currentMp).toBe(mp);
});
it.each(['stop_on_hit','pierce'] as const)('Multi Shot E2E one activation produces three independent %s bullets',behavior=>{
 const p=projectile(behavior);if(p.type!=='projectile')throw Error('fixture');p.config.bulletCount=3;p.config.spreadAngles=[0,0,0];
 const f=fixture([p]),t=timeline(f);t.start();t.advance(1200);t.advance(1200);
 expect(t.events.filter(e=>e.type==='skill-activated')).toHaveLength(1);expect(t.events.filter(e=>e.type==='effect-created')).toHaveLength(3);
 expect(f.entities[1]!.currentHp).toBe(940);expect(f.entities[2]!.currentHp).toBe(behavior==='pierce'?940:1000);
 expect(f.hits()).toHaveLength(behavior==='pierce'?6:3);
});
it('skill/equipment replacement during windup preserves old context, timing, inheritance and absolute resources',()=>{
 const f=fixture([projectile()]);Object.assign(f.definition,{cooldownMs:1000});const t=timeline(f);t.start();t.advance(25);
 const before=f.slot.skillExecution!.snapshot;f.modifiers.actor0=[
  {id:'speed',target:'attackSpeed',operation:'add_flat',value:2,source:'equipment',sourceInstanceId:'item-1',enabled:true,conditions:[]},
  {id:'attack',target:'physicalAttack',operation:'add_flat',value:20,source:'equipment',sourceInstanceId:'item-1',enabled:true,conditions:[]}
 ];
 f.entities[0]!.currentHp=400;f.entities[0]!.currentMp=40;f.entities[0]!.baseStats.maxHp=1200;f.entities[0]!.baseStats.maxMana=200;
 const res=updateCurrentResources(400,40,f.stats(f.entities[0]!),0);expect(res).toMatchObject({currentHp:400,currentMp:40});
 f.entities[0]!.baseStats.maxHp=200;f.entities[0]!.baseStats.maxMana=20;const clamped=updateCurrentResources(400,40,f.stats(f.entities[0]!),0);expect(clamped).toMatchObject({currentHp:200,currentMp:20});
 Object.assign(f.entities[0]!,clamped);
 Object.assign(f.definition,{skillId:'replacement',effects:[direct()]});f.context.skillId='replacement';
 expect(inheritSkillCooldowns(f.cooldowns,'actor0',1,25,[{outgoingSkillId:'test',incomingSkillId:'replacement'}])).toBe(true);
 expect(inheritSkillCooldowns(f.cooldowns,'actor0',1,25,[{outgoingSkillId:'test',incomingSkillId:'replacement'}])).toBe(false);
 expect(f.slot.skillExecution!.snapshot).toEqual(before);t.advance(100);expect(f.runtime.bullets).toHaveLength(1);
 expect(t.events.find(e=>e.type==='skill-activated')).toMatchObject({skillId:'test',atMs:50});
 expect(t.start()).toMatchObject({success:false,reason:'skill_on_cooldown'});t.advance(1000);expect(t.start().success).toBe(true);t.advance(1050);
 expect(t.events.filter(e=>e.type==='skill-activated').map(e=>e.skillId)).toEqual(['test','replacement']);
});
it.each([0,50,100])('activation %i%% stays at snapshotted speed and is dispatched once before terminal',percent=>{
 const f=fixture([direct()]);Object.assign(f.definition,{activationPercent:percent});f.entities[0]!.baseStats.attackSpeed=2;const t=timeline(f);t.start();
 f.entities[0]!.baseStats.attackSpeed=1;t.advance(50);t.advance(50);
 expect(t.events.filter(e=>e.type==='skill-activated')).toHaveLength(1);expect(t.events.find(e=>e.type==='skill-activated')!.atMs).toBe(percent/2);
 expect(t.events.at(-1)!.type).toBe('action-completed');expect(f.hits()).toHaveLength(1);
});
it.each([25,75])('cancel at%i preserves cost/deadline and only already emitted deliveries',at=>{
 const f=fixture([projectile()]);Object.assign(f.definition,{cooldownMs:1000});const t=timeline(f);t.start();t.advance(at);cancelSkillExecution(f.slot,at,'interrupted',f.actions);t.advance(1200);
 expect(f.entities[0]!.currentMp).toBe(95);expect(f.cooldowns.readyAt.get('actor0')!.get('test')).toBe(1000);
 expect(t.events.filter(e=>e.type==='action-cancelled')).toHaveLength(1);expect(t.events.some(e=>e.type==='action-completed')).toBe(false);
 expect(f.hits()).toHaveLength(at<50?0:1);
});
it('lethal hit cancels a pending victim action and emits one defeat, no later activation',()=>{
 const f=fixture([{...direct(),allowedTargetRelations:['self']}]);Object.assign(f.definition,{targetMode:'self',allowedTargetRelations:['self']});f.context.target={mode:'self',casterId:'actor0'};f.entities[0]!.currentHp=10;
 const t=timeline(f);t.start();t.advance(100);t.advance(100);
 expect(t.events.filter(e=>e.type==='entity-defeated')).toHaveLength(1);expect(t.events.filter(e=>e.type==='action-cancelled')).toHaveLength(1);expect(t.events.some(e=>e.type==='action-completed')).toBe(false);
 expect(t.start()).toMatchObject({success:false,reason:'entity_defeated'});
});
it('mixed-mechanic E2E is deterministic across independent seeded runs and coarse/fine frames',()=>{
 const run=(frames:number[])=>{
  const s=sequence();if(s.type!=='timed_aoe_sequence')throw Error('fixture');Object.assign(s.config,{pattern:'random_in_area',areaRadius:60,aoeRadius:30});
  const f=fixture([{...direct(),onHit:[dot()]},projectile('pierce'),timed(),s]),t=timeline(f);
  f.entities[0]!.baseStats.criticalChance=.5;let seed=42;
  const roll=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  f.env.criticalRoll=roll;f.env.dodgeRoll=roll;f.env.positionRoll=roll;f.entities[1]!.baseStats.dodgeChance=.2;
  t.start();for(const at of frames)t.advance(at);clearSkillEffects(f.runtime);t.advance(3000);
  return {events:t.events,hp:f.entities.map(e=>e.currentHp),mp:f.entities.map(e=>e.currentMp),cooldowns:f.cooldowns,slot:f.slot,runtime:f.runtime,seed};
 };
 const coarse=run([2000]);expect(run([2000])).toEqual(coarse);expect(run([25,50,75,100,150,250,350,530,1000,2000])).toEqual(coarse);
 expect(coarse.events.filter(e=>e.type==='skill-activated')).toHaveLength(1);expect(coarse.runtime.bullets).toHaveLength(0);
});
