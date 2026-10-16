import {it,expect} from 'vitest';
import {fixture,damage,direct,projectile,sequence,timed,dot} from '../fixtures/skill-core.js';
import {advanceSkillExecution,cancelSkillExecution,executeSkill,type SkillActivatedEvent} from '../../src/skills/skill-execution.js';
import {advanceSkillEffects,dispatchSkillEffects,clearSkillEffects,createSkillEffectRuntime} from '../../src/skills/skill-effect-integration.js';
import {deriveSkillRootDamage} from '../../src/skills/root-offense.js';
import {calculateDamage,snapshotActorOffense,type ActorOffenseInput} from '../../src/damage/damage-core.js';
import {DEFAULT_MELEE_HITBOX,DEFAULT_INSTANT_AOE} from '../../src/contracts/mechanic-contracts.js';
import type {SkillGameplayEffect} from '../../src/skills/skill-effects.js';

const activate=(f:ReturnType<typeof fixture>,at=50)=>{
 advanceSkillEffects(f.runtime,at,f.env);advanceSkillExecution(f.slot,f.context.combat,at,f.actions);
 const event=f.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!;
 dispatchSkillEffects(f.runtime,event,f.env);return event;
};
it.each([0,50,100])('S1: captures once at successful start, before %s%% activation; rejection/replay inert',percent=>{
 const f=fixture([direct()],0,true);f.definition.activationPercent=percent;
 expect(f.start().success).toBe(true);expect(f.captures()).toBe(1);
 expect(f.slot.skillExecution!.snapshot.rootOffense).toMatchObject({capturedAt:0,configVersion:'v1',actionInstanceId:'actor0#1'});
 const cost=f.entities[0]!.currentMp;expect(f.start().success).toBe(false);expect(f.captures()).toBe(1);expect(f.entities[0]!.currentMp).toBe(cost);
 const event=activate(f,percent);expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);expect(f.captures()).toBe(1);
 const g=fixture([direct()],0,true);g.entities[0]!.currentMp=0;expect(g.start().success).toBe(false);expect(g.captures()).toBe(0);expect(g.slot.skillExecution).toBeUndefined();
 const h=fixture([direct()],0,true);expect(executeSkill(h.definition,h.context,h.slot,h.cooldowns,h.executionEnv,{now:0,expectedSerial:2,configVersion:'v1'})).toMatchObject({success:false,reason:'stale_action'});expect(h.captures()).toBe(0);
});
it('S1/S8: accepted ROOT duplicate after source removal is inert; new invalid activation still rejects',()=>{
 const state=(f:ReturnType<typeof fixture>)=>structuredClone({runtime:f.runtime,entities:f.entities,cooldowns:f.cooldowns,slot:f.slot,
  actions:f.actions,events:f.events,rolls:f.rolls(),captures:f.captures()});
 const f=fixture([direct()],0,true),event=f.activate();
 f.entities.splice(0,1);const before=state(f);
 expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);
 expect(state(f)).toEqual(before);
 // The duplicate frontier must not bypass exact provenance/identity guards.
 for(const invalid of [{...event,snapshot:{...event.snapshot}},{...event,target:{...event.target}},
  {...event,casterId:'other'},{...event,actionInstanceId:'actor0#2'},{...event,atMs:51}]){
  expect(()=>dispatchSkillEffects(f.runtime,invalid,f.env)).toThrow();expect(state(f)).toEqual(before);
 }
 const g=fixture([direct()],0,true);g.start();advanceSkillEffects(g.runtime,50,g.env);advanceSkillExecution(g.slot,g.context.combat,50,g.actions);
 const fresh=g.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!;
 g.entities.splice(0,1);const untouched=state(g);
 expect(()=>dispatchSkillEffects(g.runtime,fresh,g.env)).toThrow('invalid_root_offense');
 expect(state(g)).toEqual(untouched);expect(g.runtime.lastActivation.size).toBe(0);
 expect(g.hits()).toHaveLength(0);expect(g.rolls()).toEqual({critCalls:0,dodgeCalls:0,positionCalls:0});
});
it('S2/S3/S4: SNAPSHOT_INHERITANCE_VERIFIED_ONLY; independent B/C definitions/ranks, same immutable root',()=>{
 const f=fixture([direct()],0,true),input=f.offenseInput(f.entities[0]!);
 f.executionEnv.rootOffense!.capture=()=>input;f.start();const s=f.slot.skillExecution!.snapshot;
 input.sources.physicalAttack=400;input.attacker.level=5;input.defenseConfig!.settings.types.armorReduction.coefficients.baseK=10000;
 const b={...damage(),id:'B',rank:2,definition:{...damage().definition,perRank:1}},c={...damage(),id:'C',damageType:'Magic' as const,tags:['Magic','Projectile'],definition:{...damage().definition,base:50}};
 const b0=deriveSkillRootDamage(f.runtime,s,b),c0=deriveSkillRootDamage(f.runtime,s,c);
 const calc=(v:typeof b0,type:'Physical'|'Magic'='Physical')=>calculateDamage({...v,context:{type,tags:[],target:'Normal',statuses:[]},roll:1});
 expect(calc(b0).b0.raw).toBe(40);expect(calc(c0,'Magic').b0.raw).toBe(60);expect(b0.rank).toBe(2);expect(c0.rank).toBe(1);
 expect(b0.attacker.level).toBe(1);expect(b0.defenseConfig!.settings.types.armorReduction.coefficients.baseK).toBe(100);
 b0.sources.physicalAttack=999;b.definition.base=999;
 expect(deriveSkillRootDamage(f.runtime,s,damage()).sources.physicalAttack).toBe(10);
 expect(()=>{(s.rootOffense!.offense.sources as {physicalAttack:number}).physicalAttack=999;}).toThrow();
 expect(Object.isFrozen(s.rootOffense!.offense.attacker.targetTags)).toBe(true);
});

const aoe:SkillGameplayEffect={type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:60,damageComponent:'component'}};
const melee:SkillGameplayEffect={type:'melee_hitbox',damage:damage(),config:{...DEFAULT_MELEE_HITBOX,shape:'circle',radius:110,length:110,width:40}};
it.each([[direct()],[melee],[aoe],[projectile()],[sequence()],[timed()],[{...projectile(),onHit:[dot()]}]])('S2/S5/S6: root offense through existing delivery %#',effect=>{
 const f=fixture([effect],0,true);let liveReads=0;const legacy=f.env.snapshotDamage;f.env.snapshotDamage=(...args)=>{liveReads++;return legacy(...args);};
 f.start();f.entities[0]!.baseStats.physicalAttack=500;activate(f);advanceSkillEffects(f.runtime,1800,f.env);
 expect(f.hits().length).toBeGreaterThan(0);expect(f.hits().every(h=>h.breakdown.b0.raw===20)).toBe(true);
 expect(liveReads).toBe(0);expect(f.captures()).toBe(1);
 if(effect.onHit)expect(f.events.some(e=>e.type==='damage-applied'&&e.atMs>530)).toBe(true);
});
it('S3: B-like AoE and C-like radial emission use independent coefficients/ranks through real Core',()=>{
 const b=structuredClone(aoe),c=timed();if(b.type!=='instant_aoe'||c.type!=='timed_object')throw Error('fixture');
 b.damage.rank=2;b.damage.definition.perRank=1;c.projectile.damage.definition.base=30;c.config.bulletCount=4;
 const f=fixture([b,c],0,true);f.start();f.entities[0]!.baseStats.physicalAttack=300;activate(f);
 expect(f.hits()[0]!.breakdown.b0.raw).toBe(40);advanceSkillEffects(f.runtime,150,f.env);expect(f.runtime.bullets).toHaveLength(4);
 expect(f.runtime.bullets.every(p=>p.snapshot.sources.physicalAttack===10&&p.snapshot.definition.base===30)).toBe(true);
 advanceSkillEffects(f.runtime,1000,f.env);expect(f.hits().some(h=>h.mechanic==='projectile'&&h.breakdown.b0.raw===40)).toBe(true);
});
it('S5/S7: defeat preserves already emitted offense, live armor/faction/HP and missing source still apply',()=>{
 const f=fixture([timed()],0,true);f.activate();f.entities[0]!.currentHp=0;f.entities[0]!.baseStats.physicalAttack=900;f.entities[1]!.baseStats.armor=100;
 advanceSkillEffects(f.runtime,630,f.env);expect(f.hits()[0]!.breakdown.b0.raw).toBe(20);expect(f.entities[1]!.currentHp).toBe(990);
 for(const mode of ['missing','faction','dead-target','generation'] as const){
  const g=fixture([projectile()],0,true);g.activate();
  if(mode==='missing')g.entities.splice(0,1);
  if(mode==='faction')g.entities[1]!.factionId='player';
  if(mode==='dead-target')g.entities[1]!.currentHp=0;
  if(mode==='generation')g.entities[1]!.entityId='next-generation';
  advanceSkillEffects(g.runtime,1000,g.env);expect(g.hits()).toHaveLength(0);
 }
 const g=fixture([timed()],0,true);const e=g.activate();clearSkillEffects(g.runtime,g.env);const n=g.events.length;
 expect(()=>deriveSkillRootDamage(g.runtime,e.snapshot,damage())).toThrow('invalid_root_offense');advanceSkillEffects(g.runtime,1000,g.env);expect(g.events).toHaveLength(n);
});
it('S8/S9: forged, missing, rebound, version and cross-session snapshots reject before frontier/RNG/delivery',()=>{
 const f=fixture([direct()],0,true);f.start();advanceSkillEffects(f.runtime,50,f.env);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);
 const e=f.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!;
 const g=fixture([direct()],0,true);g.start();advanceSkillEffects(g.runtime,50,g.env);
 const {rootOffense:_,...missing}=e.snapshot;
 const variants=[{...e,snapshot:{...e.snapshot}},{...e,snapshot:missing},{...e,snapshot:{...e.snapshot,configVersion:'other'}},{...e,target:{...e.target}},{...e,actionInstanceId:'actor0#2'}];
 for(const bad of variants)expect(()=>dispatchSkillEffects(f.runtime,bad,f.env)).toThrow();
 expect(()=>dispatchSkillEffects(g.runtime,e,g.env)).toThrow('invalid_root_offense');
 expect(()=>deriveSkillRootDamage(g.runtime,e.snapshot,damage())).toThrow('invalid_root_offense');
 expect(()=>deriveSkillRootDamage(createSkillEffectRuntime(),e.snapshot,damage())).toThrow('invalid_root_offense');
 expect(f.runtime.lastActivation.size).toBe(0);expect(f.events).toHaveLength(0);expect(f.rolls().critCalls).toBe(0);
 expect(dispatchSkillEffects(f.runtime,e,f.env)).toBe(true);
});
it('S8: invalid trusted inputs fail before action/resource/cooldown/delivery mutation',()=>{
 const invalid:((i:ActorOffenseInput)=>void)[]=[i=>{i.sources.str=NaN;},i=>{i.criticalChance=Infinity;},i=>{i.options=[{id:'x',value:Infinity}];},i=>{i.settings.modifiers=Array(101).fill({});},i=>{i.modifiers=Array(257).fill({});},i=>{i.defenseConfig!.revision=NaN;},i=>{i.attacker={...i.attacker,entityId:'wrong'};}];
 for(const corrupt of invalid){const f=fixture([direct()],0,true),i=f.offenseInput(f.entities[0]!);corrupt(i);f.executionEnv.rootOffense!.capture=()=>i;
  expect(f.start()).toMatchObject({success:false,reason:'invalid_context',errors:['invalid_root_offense']});
  expect(f.entities[0]!.currentMp).toBe(100);expect(f.cooldowns.readyAt.size).toBe(0);expect(f.slot.skillExecution).toBeUndefined();expect(f.actions).toHaveLength(0);expect(f.events).toHaveLength(0);expect(f.rolls().critCalls).toBe(0);
 }
 const f=fixture([],0,true);expect(()=>snapshotActorOffense({...f.offenseInput(f.entities[0]!),modifiers:[{} as never]})).toThrow();
});
it('S8: accepted metadata cannot forge activation after cancellation, or downgrade into legacy runtime',()=>{
 const f=fixture([direct()],0,true);f.start();const snapshot=f.slot.skillExecution!.snapshot;
 cancelSkillExecution(f.slot,20,'interrupted',f.actions);advanceSkillEffects(f.runtime,50,f.env);
 const forged:SkillActivatedEvent={type:'skill-activated',status:'activated',atMs:50,actionInstanceId:snapshot.actionInstanceId,skillId:snapshot.skillId,casterId:snapshot.casterId,target:snapshot.target,snapshot};
 expect(()=>dispatchSkillEffects(f.runtime,forged,f.env)).toThrow('invalid_root_offense');
 const legacy=createSkillEffectRuntime(50);expect(()=>dispatchSkillEffects(legacy,forged,f.env)).toThrow('invalid_root_offense');
 expect(f.events).toHaveLength(0);expect(f.runtime.lastActivation.size).toBe(0);
 const g=fixture([timed()],0,true);g.activate();g.entities.splice(0,1);advanceSkillEffects(g.runtime,150,g.env);
 expect(g.runtime.bullets).toHaveLength(0);expect(g.events.some(e=>e.type==='effect-rejected'&&e.reason==='entity_not_found')).toBe(true);
});
it('S9: two roots/versions and sessions do not share offense or mutable component aliases',()=>{
 const f=fixture([],0,true);f.start();const first=f.slot.skillExecution!.snapshot;advanceSkillExecution(f.slot,f.context.combat,100,f.actions);advanceSkillEffects(f.runtime,100,f.env);f.entities[0]!.baseStats.physicalAttack=30;
 expect(executeSkill(f.definition,f.context,f.slot,f.cooldowns,f.executionEnv,{now:100,expectedSerial:2,configVersion:'v2'}).success).toBe(true);const second=f.slot.skillExecution!.snapshot;
 expect(deriveSkillRootDamage(f.runtime,first,damage()).sources.physicalAttack).toBe(10);expect(deriveSkillRootDamage(f.runtime,second,damage()).sources.physicalAttack).toBe(30);expect(second.rootOffense!.configVersion).toBe('v2');
 const g=fixture([],0,true);g.entities[0]!.baseStats.physicalAttack=70;g.start();expect(deriveSkillRootDamage(g.runtime,g.slot.skillExecution!.snapshot,damage()).sources.physicalAttack).toBe(70);
});
it('S2/S5: captured buff and crit persist; target status/bonus eligibility and Dodge stay live',()=>{
 const f=fixture([direct()],0,true);
 f.modifiers.actor0=[{id:'buff',source:'buff',sourceInstanceId:'buff1',target:'damage.flat',operation:'add_flat',value:5,enabled:true,conditions:[]}];
 const input=f.offenseInput(f.entities[0]!);
 input.settings.modifiers=[{id:'status',source:'setting',option:'',value:.5,enabled:true,types:['Physical'],tags:['Direct'],targets:['Boss'],statuses:['Poison']}];
 input.criticalChance=.5;input.criticalBonus=1;
 f.executionEnv.rootOffense!.capture=()=>input;f.start();f.modifiers.actor0=[];
 f.entities[0]!.baseStats.criticalChance=0;f.entities[1]!.targetTags=['boss'];f.env.statuses=()=>['Poison'];f.env.criticalRoll=()=>.1;
 activate(f);expect(f.hits()[0]!.breakdown.b0.raw).toBe(25);expect(f.hits()[0]!.breakdown.finalDamage).toBe(62.5);expect(f.hits()[0]!.breakdown.critical.isCritical).toBe(true);
 const g=fixture([{...projectile(),onHit:[dot()]}],0,true);g.activate();g.entities[1]!.baseStats.dodgeChance=.85;
 advanceSkillEffects(g.runtime,1000,g.env);expect(g.hits()[0]!.breakdown.defense.hit.dodged).toBe(true);expect(g.rolls().critCalls).toBe(0);expect(g.runtime.dots.groups).toHaveLength(0);
});
it('S11: seeded ROOT delivery events, RNG counts and HP are stable with coarse/fine advancement',()=>{
 const run=(times:number[])=>{const s=sequence();if(s.type==='timed_aoe_sequence')Object.assign(s.config,{pattern:'random_in_area',areaRadius:20,aoeRadius:20});const f=fixture([s,timed(),{...projectile(),onHit:[dot()]}],0,true);f.activate();f.entities[0]!.baseStats.physicalAttack=500;for(const t of times)advanceSkillEffects(f.runtime,t,f.env);return {events:f.events,rolls:f.rolls(),hp:f.entities.map(e=>e.currentHp),captures:f.captures()};};
 expect(run([1500])).toEqual(run(Array.from({length:145},(_,i)=>60+i*10)));
});
