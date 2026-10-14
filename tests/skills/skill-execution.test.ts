import {readCoreSource} from '../fixtures/source.js';
import {it,expect} from 'vitest';
import {executeSkill,skillExecutionAvailability,advanceSkillExecution,cancelSkillExecution,type SkillExecutionSlot,type SkillExecutionEvent} from '../../src/skills/skill-execution.js';
import {createSkillCooldownState,inheritSkillCooldowns,type SkillEngineDefinition,type SkillExecutionContext,validateSkillDefinition} from '../../src/skills/skill-engine.js';
import {cancelCombatAction} from '../../src/combat/combat-state.js';
import type {CombatEntity} from '../../src/combat/combat-entity.js';
import {readFileSync} from 'node:fs';
import {resolveCharacterStats} from '../../src/stats/stat-calculation.js';
import {prepareModifierResolver} from '../../src/modifiers/modifier-core.js';
import {DEFAULT_CORE_STATS} from '../../src/contracts/stat-contracts.js';
type Mutable<T>={-readonly [K in keyof T]:T[K]};

function fixture(){
 const entities:CombatEntity[]=['player','monster'].map((entityType,i)=>({entityId:`actor${i}`,entityType:entityType as CombatEntity['entityType'],level:1,factionId:entityType,targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:100,currentMp:50}));
 const definition:Mutable<SkillEngineDefinition>={skillId:'A',targetMode:'entity',allowedTargetRelations:['enemy'],baseActionDurationMs:800,activationPercent:60,castRange:100,mpCost:20,cooldownMs:5000};
 const context:Mutable<SkillExecutionContext>={skillId:'A',casterId:'actor0',target:{mode:'entity',casterId:'actor0',targetId:'actor1'},combat:{findEntity:id=>entities.find(e=>e.entityId===id),relation:()=> 'enemy'}};
 const positions:Record<string,{x:number;y:number}>={actor0:{x:10,y:30},actor1:{x:70,y:30}};
 const rates={attackSpeed:2,cooldownReduction:.2},env={grid:{cellSize:20,columns:10,rows:5,cells:Array(5).fill('1111111111')},position:(id:string)=>positions[id],resolveStats:()=>rates};
 const slot:SkillExecutionSlot={},cooldowns=createSkillCooldownState(),events:SkillExecutionEvent[]=[];
 const start=(now=0,expectedSerial=1)=>executeSkill(definition,context,slot,cooldowns,env,{now,expectedSerial,configVersion:'config-1'},events);
 const tick=(now:number)=>advanceSkillExecution(slot,context.combat,now,events);
 return {entities,definition,context,positions,rates,env,slot,cooldowns,events,start,tick};
}
it('one shared Player/Monster pipeline starts once with resource/deadline/action identity',()=>{
 for(const caster of [0,1]){const f=fixture();f.context.casterId=`actor${caster}`;f.context.target={mode:'entity',casterId:f.context.casterId,targetId:`actor${1-caster}`};
 expect(f.start().success).toBe(true);expect(f.entities[caster]!.currentMp).toBe(30);expect(f.cooldowns.readyAt.get(f.context.casterId)!.get('A')).toBe(4000);
 expect(f.slot.activeAction!.actionInstanceId).toBe(`${f.context.casterId}#1`);expect(f.slot.activeAction!.durationMs).toBe(400);expect(f.slot.activeAction!.activationDelayMs).toBe(240);
 expect(f.start()).toEqual({success:false,reason:'entity_busy'});expect(f.events).toHaveLength(1);}
});
it('trusted stat adapter resolves Player and Monster through the existing capped shared stat engine',()=>{
 for(const caster of [0,1]){
  const f=fixture();f.context.casterId=`actor${caster}`;f.context.target={mode:'entity',casterId:f.context.casterId,targetId:`actor${1-caster}`};
  f.entities[caster]!.baseStats.attackSpeed=2;f.entities[caster]!.baseStats.cooldownReduction=.9;
  f.env.resolveStats=()=>{const entity=f.context.combat.findEntity(f.context.casterId)!;return resolveCharacterStats(entity.baseStats,DEFAULT_CORE_STATS,prepareModifierResolver([]),{str:0,dex:0,int:0,vit:0}).values;};
  expect(f.start().success).toBe(true);expect(f.slot.activeAction!.durationMs).toBe(400);expect(f.cooldowns.readyAt.get(f.context.casterId)!.get('A')).toBe(2500);
 }
});
it.each(['id','defeated','target','ally','range','mp','cooldown','timing'] as const)('rejects %s with no partial mutation',kind=>{
 const f=fixture();let reason='';
 if(kind==='id'){f.context.skillId='missing';reason='skill_mismatch';}
 if(kind==='defeated'){f.entities[0]!.currentHp=0;reason='entity_defeated';}
 if(kind==='target'){f.context.target={mode:'entity',casterId:'actor0',targetId:'missing'};reason='target_not_found';}
 if(kind==='ally'){f.context.combat.relation=()=> 'ally';reason='invalid_target_relation';}
 if(kind==='range'){f.positions.actor1!.x=111;reason='out_of_range';}
 if(kind==='mp'){f.entities[0]!.currentMp=19;reason='insufficient_mp';}
 if(kind==='cooldown'){f.cooldowns.readyAt.set('actor0',new Map([['A',1000]]));reason='skill_on_cooldown';}
 if(kind==='timing'){f.rates.attackSpeed=0;reason='invalid_context';}
 const before=structuredClone({entities:f.entities,slot:f.slot,cooldowns:f.cooldowns});const result=f.start();expect(result.success).toBe(false);if(!result.success)expect(result.reason).toBe(reason);
 expect({entities:f.entities,slot:f.slot,cooldowns:f.cooldowns}).toEqual(before);expect(f.events).toEqual([]);
});
it.each([0,50,60,100])('activation %i occurs once with activation before completion at 100',percent=>{
 const f=fixture();f.definition.activationPercent=percent;const result=f.start();const due=400*percent/100;
 expect(result.success).toBe(true);if(percent===0){expect(f.events.map(e=>e.type)).toEqual(['action-started','skill-activated']);if(result.success)expect(result.events).toHaveLength(2);}
 else {f.tick(due-.01);expect(f.events.filter(e=>e.type==='skill-activated')).toHaveLength(0);}
 f.tick(due);f.tick(due);f.tick(400);f.tick(800);
 expect(f.events.map(e=>e.type)).toEqual(['action-started','skill-activated','action-completed']);expect(f.events[1]!.atMs).toBe(due);
 expect(f.slot.activeAction).toBeUndefined();expect(f.slot.skillExecution).toBeUndefined();expect(f.entities[1]!.currentHp).toBe(100);
});
it('snapshot locks skill/version/target/timing without attacker stats; swap inherits but cannot cancel',()=>{
 const f=fixture();f.start();const snapshot=f.slot.skillExecution!.snapshot;
 f.definition.skillId='B';f.definition.activationPercent=0;f.definition.baseActionDurationMs=2000;f.context.skillId='B';f.context.target={mode:'entity',casterId:'actor0',targetId:'actor0'};f.rates.attackSpeed=3;f.rates.cooldownReduction=.5;
 inheritSkillCooldowns(f.cooldowns,'actor0',1,100,[{outgoingSkillId:'A',incomingSkillId:'B'}]);
 f.tick(240);const e=f.events[1]!;expect(e.type).toBe('skill-activated');if(e.type==='skill-activated'){expect(e.skillId).toBe('A');expect(e.target).toEqual({mode:'entity',casterId:'actor0',targetId:'actor1'});expect(e.snapshot.configVersion).toBe('config-1');}
 expect(snapshot.durationMs).toBe(400);expect(snapshot.activationTime).toBe(240);expect(Object.keys(snapshot)).not.toContain('stats');
 expect(f.cooldowns.readyAt.get('actor0')!.get('A')).toBe(4000);expect(f.cooldowns.readyAt.get('actor0')!.get('B')).toBe(4000);
 f.tick(400);f.context.target={mode:'entity',casterId:'actor0',targetId:'actor1'};
 expect(f.start(500,2).success).toBe(false);expect(f.start(4000,2).success).toBe(true);expect(f.slot.activeAction!.actionId).toBe('B');expect(f.slot.activeAction!.durationMs).toBeCloseTo(2000/3);
});
it('ground target coordinate is detached; self bypasses spatial range',()=>{
 const f=fixture();f.definition.targetMode='ground';f.context.target={mode:'ground',casterId:'actor0',position:{x:70,y:30}};f.start();f.context.target.position.x=1000;
 expect(f.slot.skillExecution!.snapshot.target).toEqual({mode:'ground',casterId:'actor0',position:{x:70,y:30}});
 const self=fixture();self.definition.targetMode='self';self.definition.allowedTargetRelations=['self'];self.definition.castRange=0;self.context.target={mode:'self',casterId:'actor0'};self.env.position=()=>undefined;expect(self.start().success).toBe(true);
});
it('range uses actual world distance and shared collision LOS, independent of tags/art',()=>{
 const f=fixture();f.env.grid.cells=Array(5).fill('1101111111');expect(f.start()).toEqual({success:false,reason:'blocked'});expect(f.entities[0]!.currentMp).toBe(50);
 const g=fixture();g.definition.targetMode='ground';g.context.target={mode:'ground',casterId:'actor0',position:{x:111,y:30}};expect(g.start()).toEqual({success:false,reason:'out_of_range'});
});
it('full execution availability is read-only and includes range before cost/cooldown',()=>{
 const f=fixture(),before=structuredClone({entities:f.entities,slot:f.slot,cooldowns:f.cooldowns});
 expect(skillExecutionAvailability(f.definition,f.context,f.slot,f.cooldowns,f.env,0)).toEqual({available:true});
 expect({entities:f.entities,slot:f.slot,cooldowns:f.cooldowns}).toEqual(before);
 f.positions.actor1!.x=1000;f.entities[0]!.currentMp=0;
 expect(skillExecutionAvailability(f.definition,f.context,f.slot,f.cooldowns,f.env,0)).toEqual({available:false,reason:'out_of_range'});
});
it.each([100,300])('defeat at %i cancels exactly once and never refunds or deletes already emitted activation',now=>{
 const f=fixture();f.start();if(now===300)f.tick(240);f.entities[0]!.currentHp=0;f.tick(now);f.tick(800);
 expect(f.events.map(e=>e.type)).toEqual(now===100?['action-started','action-cancelled']:['action-started','skill-activated','action-cancelled']);
 expect(f.entities[0]!.currentMp).toBe(30);expect(f.cooldowns.readyAt.get('actor0')!.get('A')).toBe(4000);expect(f.slot.activeAction).toBeUndefined();
});
it('external Combat Core cancellation/session end cannot activate stale metadata',()=>{
 const f=fixture();f.start();cancelCombatAction(f.slot,100,'interrupted',f.events);f.tick(400);expect(f.events.map(e=>e.type)).toEqual(['action-started','action-cancelled']);expect(f.slot.skillExecution).toBeUndefined();
 const g=fixture();g.start();expect(cancelSkillExecution(g.slot,100,'session_end',g.events)).toBe(true);expect(cancelSkillExecution(g.slot,100,'session_end',g.events)).toBe(false);g.tick(800);expect(g.events).toHaveLength(2);
});
it('target death/movement after start does not retarget or pretend activation is a hit',()=>{
 const f=fixture();f.start();f.entities[1]!.currentHp=0;f.positions.actor1!.x=1000;f.tick(240);
 const event=f.events[1]!;expect(event.type).toBe('skill-activated');if(event.type==='skill-activated')expect(event.target).toEqual({mode:'entity',casterId:'actor0',targetId:'actor1'});
 expect(f.entities[1]!.currentHp).toBe(0);f.tick(400);expect(f.events[2]!.type).toBe('action-completed');
});
it('defeat wins over pending activation at the same tick; replaying zero-cooldown request remains stale',()=>{
 const f=fixture();f.start();f.entities[0]!.currentHp=0;f.tick(240);expect(f.events.map(e=>e.type)).toEqual(['action-started','action-cancelled']);
 const g=fixture();g.definition.cooldownMs=0;g.definition.mpCost=0;g.start();g.tick(400);
 expect(g.start(400,1)).toEqual({success:false,reason:'stale_action'});expect(g.events).toHaveLength(3);
});
it('fractional due timestamps deterministic for coarse versus fine updates; no animation/render clock',()=>{
 const run=(ticks:number[])=>{const f=fixture();f.rates.attackSpeed=3;f.definition.activationPercent=33;f.start();for(const tick of ticks)f.tick(tick);return f.events;};
 expect(run([400])).toEqual(run([1,50,88,100,200,300,400]));
});
it('invalid config/positions/timing return reasons, never enter Acting',()=>{
 for(const patch of [{activationPercent:-1},{activationPercent:101},{activationPercent:NaN},{castRange:-1},{castRange:Infinity}])expect(validateSkillDefinition({...fixture().definition,...patch}).length).toBeGreaterThan(0);
 const f=fixture();f.positions.actor0!.x=NaN;expect(f.start()).toEqual({success:false,reason:'invalid_target_position'});
 const g=fixture();g.rates.cooldownReduction=NaN;expect(g.start()).toEqual({success:false,reason:'invalid_context'});expect(g.slot).toEqual({});
});
it('execution has no reverse Core dependency, damage dispatch or game/client/server/asset policy',()=>{
 const source=readFileSync('src/skills/skill-execution.ts','utf8');
 expect(source).not.toMatch(/Date\.now|Math\.random|fetch\(|GameState|selectAutoSkill|assetUrl|window\.|document\.|applyEntityDamage/);
 for(const name of ['combat-state','combat-entity','damage-core','defense-engine'])expect(readCoreSource(name)).not.toMatch(/from ['"].*skill-execution/);
});
