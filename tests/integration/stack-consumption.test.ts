import {expect,it} from 'vitest';
import {fixture,damage,direct,projectile} from '../fixtures/skill-core.js';
import {nestedFixture} from '../fixtures/nested-skill.js';
import {DEFAULT_INSTANT_AOE} from '../../src/contracts/mechanic-contracts.js';
import {advanceSkillEffects,dispatchSkillEffects,clearSkillEffects,advanceSkillExecution,executeSkill,createSkillCooldownState,pinSkillInstanceDefinition,pinSkillTriggerBundle,validateSkillEffects,type SkillStackConsumption,type SkillGameplayEffect,type SkillExecutionSlot,type SkillExecutionEvent,type SkillActivatedEvent} from '../../src/skills/index.js';

const mark:Extract<SkillGameplayEffect,{type:'modifier_effect'}>={type:'modifier_effect',target:'selected',definition:{effectId:'mark',durationMs:2000,stackingPolicy:'stack',maxStacks:5}};
const consume=(n=3):SkillStackConsumption=>({type:'consume_stacks',effectId:'mark',requiredStacks:n,flatPerStack:7,outcome:{type:'instant_aoe',config:{...DEFAULT_INSTANT_AOE,radius:10},damage:damage()}});
const seed=(f:ReturnType<typeof fixture>,count=3)=>{for(let i=0;i<count;i++)expect(f.runtime.effects.apply({effectId:'mark',sourceEntityId:'actor0',targetEntityId:'actor1',allowedTargetRelations:['enemy']},mark.definition,{now:f.runtime.now,combat:f.context.combat},f.runtime.effects.nextApplicationSerial('actor0')).success).toBe(true);};

it('S09/S10: canonical Apply 3 -> consume N -> B0 bonus/AoE damage, no bonus leak or duplicate MP/cooldown/RNG',()=>{
 for(const n of [2,3]){
  const f=fixture([mark,mark,mark,consume(n),direct()],0,true,'stack-root');
  const activation=f.activate(),offense=activation.snapshot.rootOffense!;
  expect(f.runtime.effects.groups()[0]?.currentStacks??0).toBe(3-n);
  expect(f.hits().map(h=>h.breakdown.finalDamage)).toEqual([20+n*7,20]);
  expect(f.hits()[0]!.breakdown.b0.flat).toBe(n*7);expect(f.hits()[0]!.breakdown.b0.flatModifiers).toHaveLength(1);
  expect(offense.offense.flatModifiers).toEqual([]);expect(f.captures()).toBe(1);expect(f.entities[1]!.currentHp).toBe(960-n*7);
  expect(f.entities[0]!.currentMp).toBe(95);expect(f.slot.actionSerial).toBe(1);const state=JSON.stringify({events:f.events,hp:f.entities[1]!.currentHp,rolls:f.rolls(),groups:f.runtime.effects.groups()});
  expect(dispatchSkillEffects(f.runtime,activation,f.env)).toBe(false);expect(JSON.stringify({events:f.events,hp:f.entities[1]!.currentHp,rolls:f.rolls(),groups:f.runtime.effects.groups()})).toBe(state);
  const consumed=f.events.filter(e=>e.type==='effect-removed'&&e.reason==='consumed');expect(consumed).toHaveLength(n);
  expect(f.events.findIndex(e=>e.type==='effect-removed')).toBeLessThan(f.events.findIndex(e=>e.type==='effect-hit'));
 }
});
it('S08: insufficient, legacy mode, modifier capacity and invalid schema reject before spending; independent entries still run',()=>{
 const f=fixture([mark,mark,consume(),direct()],0,true,'insufficient');f.activate();expect(f.runtime.effects.groups()[0]!.currentStacks).toBe(2);expect(f.hits().map(h=>h.breakdown.finalDamage)).toEqual([20]);expect(f.events).toContainEqual(expect.objectContaining({type:'effect-rejected',reason:'insufficient_stacks'}));
 const legacy=fixture([consume()]);seed(legacy);legacy.activate();expect(legacy.runtime.effects.instances()).toHaveLength(3);expect(legacy.hits()).toEqual([]);
 const cap=fixture([consume()],0,true,'capacity');seed(cap);cap.modifiers.actor0=Array.from({length:256},(_,i)=>({id:String(i),source:'setting',sourceInstanceId:'cap',target:'flat_damage',operation:'add_flat',value:0,enabled:true,conditions:[]}));cap.activate();
 expect(cap.runtime.effects.instances()).toHaveLength(3);expect(cap.hits()).toEqual([]);expect(cap.rolls()).toEqual({critCalls:0,dodgeCalls:0,positionCalls:0});expect(cap.events).toContainEqual(expect.objectContaining({reason:'modifier_capacity'}));
 for(const patch of [{requiredStacks:0},{flatPerStack:Infinity},{flatPerStack:-1},{flatPerStack:1000001},{outcome:{...consume().outcome,type:'consume_stacks'}},{onHit:[]},{extra:true}])expect(validateSkillEffects([{...consume(),...patch}]).length).toBeGreaterThan(0);
});
it('S08: removal notification cannot interrupt consume -> AoE, even when the observer disposes the session',()=>{
 const f=fixture([mark,mark,mark,consume()],0,true,'notification');const emit=f.env.emit;
 f.env.emit=e=>{if(e.type==='effect-removed'&&e.reason==='consumed'){expect(f.entities[1]!.currentHp).toBe(959);clearSkillEffects(f.runtime);}emit(e);};
 f.activate();expect(f.hits().map(h=>h.breakdown.finalDamage)).toEqual([41]);expect(f.runtime.active).toBe(false);expect(f.runtime.effects.instances()).toEqual([]);
});
it('S04/S08/S09: expiry wins, invalid selected target does not spend, Dodge/empty AoE do not refund',()=>{
 const expired=fixture([consume()],0,true,'expiry');seed(expired);expired.definition.baseActionDurationMs=4000;expired.start();advanceSkillEffects(expired.runtime,2000,expired.env);advanceSkillExecution(expired.slot,expired.context.combat,2000,expired.actions);
 dispatchSkillEffects(expired.runtime,expired.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!,expired.env);expect(expired.hits()).toEqual([]);expect(expired.events.filter(e=>e.type==='effect-expired')).toHaveLength(3);expect(expired.events.some(e=>e.type==='effect-removed')).toBe(false);
 const invalid=fixture([consume()],0,true,'invalid');seed(invalid);invalid.start();advanceSkillEffects(invalid.runtime,50,invalid.env);advanceSkillExecution(invalid.slot,invalid.context.combat,50,invalid.actions);invalid.entities[1]!.factionId='player';dispatchSkillEffects(invalid.runtime,invalid.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!,invalid.env);expect(invalid.runtime.effects.instances()).toHaveLength(3);expect(invalid.hits()).toEqual([]);
 const dodge=fixture([consume()],0,true,'dodge');seed(dodge);dodge.entities[1]!.baseStats.dodgeChance=.5;dodge.activate();expect(dodge.hits()[0]!.breakdown.finalDamage).toBe(0);expect(dodge.runtime.effects.groups()).toEqual([]);expect(dodge.entities[1]!.currentHp).toBe(1000);
 const empty=fixture([consume()],0,true,'empty');seed(empty);empty.env.entityIds=()=>[];empty.activate();expect(empty.hits()).toEqual([]);expect(empty.runtime.effects.groups()).toEqual([]);
});
it('S09/S10/S11: trusted child consumes at impact with own rank, shared S0, live armor; coarse/fine state and RNG agree',()=>{
 function run(step:number){
  const f=nestedFixture({rootEffects:[mark,mark,mark,projectile()]});
  const b=pinSkillInstanceDefinition({...f.definition,skillId:'spend',effects:[{...consume(),outcome:{...consume().outcome,damage:{...damage(),rank:2,definition:{...damage().definition,base:20,perRank:.5}}}}]},'spend');
  const bundle=pinSkillTriggerBundle({version:'consume',rootSkillId:'test',definitions:[f.root,b],links:[{...f.bundle.links[0]!,childSkillId:'spend'}]});
  Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:f.observe}});const activation=f.activate();f.entities[0]!.baseStats.physicalAttack=999;f.entities[1]!.baseStats.armor=100;
  for(let t=50+step;t<600;t+=step)advanceSkillEffects(f.runtime,t,f.env);advanceSkillEffects(f.runtime,600,f.env);
  expect(f.observations).toHaveLength(1);expect(f.observations[0]!.rootOffense).toBe(activation.snapshot.rootOffense);expect(f.observations[0]!.definition).toBe(b.definition);
  expect(f.hits().map(h=>h.breakdown.finalDamage)).toEqual([10,33]);expect(f.hits()[1]!.breakdown.b0.flat).toBe(21);expect(f.hits()[1]!.breakdown.b0.raw).toBe(66);expect(f.entities[1]!.currentHp).toBe(957);
  expect(f.runtime.effects.groups()).toEqual([]);expect(f.entities[0]!.currentMp).toBe(95);expect(f.captures()).toBe(1);expect(f.slot.actionSerial).toBe(1);
  const result={events:f.events,rolls:f.rolls(),hp:f.entities[1]!.currentHp};clearSkillEffects(f.runtime);advanceSkillEffects(f.runtime,3000,f.env);expect(f.runtime.effects.groups()).toEqual([]);return result;
 }
 expect(run(1)).toEqual(run(1000));
});
it('S08: actual projectile work fills 512/boundary; root consume rejects without losing stacks or RNG',()=>{
 const p=projectile() as Extract<SkillGameplayEffect,{type:'projectile'}>;
 const spread={...p,config:{...p.config,bulletCount:32,spreadAngles:Array(32).fill(0) as number[]}};
 const f=nestedFixture({rootEffects:Array.from({length:8},()=>spread)});seed(f);expect(f.start().success).toBe(true);
 const slot:SkillExecutionSlot={},events:SkillExecutionEvent[]=[];
 expect(executeSkill(f.definition,{...f.context,casterId:'actor3',target:{mode:'entity',casterId:'actor3',targetId:'actor1'}},slot,createSkillCooldownState(),f.executionEnv,{now:0,expectedSerial:1,configVersion:'v1'},events).success).toBe(true);
 const spender=pinSkillInstanceDefinition({...f.definition,skillId:'budget-spend',effects:[consume()]},'v1');
 const spendEnv={...f.executionEnv,triggers:{bundle:pinSkillTriggerBundle({version:'spend',rootSkillId:'budget-spend',definitions:[spender],links:[]}),executeChildren:true,observe:f.observe}};
 const spendSlot:SkillExecutionSlot={};
 advanceSkillEffects(f.runtime,50,f.env);
 for(const [s,out] of [[f.slot,f.actions],[slot,events]] as const){advanceSkillExecution(s,f.context.combat,50,out);dispatchSkillEffects(f.runtime,out.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!,f.env);}
 expect(f.runtime.bullets).toHaveLength(512);
 const thirdContext={...f.context,casterId:'actor2',skillId:'budget-spend',target:{mode:'entity' as const,casterId:'actor2',targetId:'actor0'}};
 for(let i=0;i<3;i++)expect(f.runtime.effects.apply({effectId:'mark',sourceEntityId:'actor2',targetEntityId:'actor0',allowedTargetRelations:['enemy']},mark.definition,{now:50,combat:f.context.combat},i+1).success).toBe(true);
 const instant={...spender.definition,activationPercent:0} as typeof f.definition;
 const instantPin=pinSkillInstanceDefinition(instant,'v1');spendEnv.triggers.bundle=pinSkillTriggerBundle({version:'instant',rootSkillId:instant.skillId,definitions:[instantPin],links:[]});
 const accepted=executeSkill(instant,thirdContext,spendSlot,createSkillCooldownState(),spendEnv,{now:50,expectedSerial:1,configVersion:'v1'});expect(accepted.success).toBe(true);if(!accepted.success)throw Error(accepted.reason);
 dispatchSkillEffects(f.runtime,accepted.events.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!,f.env);
 expect(f.runtime.effects.groups('actor0')[0]!.currentStacks).toBe(3);expect(f.events).toContainEqual(expect.objectContaining({reason:'maxWorkPerBoundary'}));expect(f.rolls().critCalls).toBe(0);
});
