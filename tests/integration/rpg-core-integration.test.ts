import {expect,it} from 'vitest';
import {fixture,direct,projectile,sequence,timed,dot,damage} from '../fixtures/skill-core.js';
import {timeline} from '../fixtures/skill-timeline.js';
import {executeSkill,cancelSkillExecution,type SkillExecutionSlot,type SkillExecutionEvent} from '../../src/skills/skill-execution.js';
import {createSkillCooldownState,type SkillEngineDefinition} from '../../src/skills/skill-engine.js';
import {clearSkillEffects} from '../../src/skills/skill-effect-integration.js';
import {combatState} from '../../src/combat/combat-state.js';
import {validateCombatEntities} from '../../src/combat/combat-entity.js';
import {updateCurrentResources} from '../../src/stats/stat-calculation.js';
import type {SkillGameplayEffect} from '../../src/skills/skill-effects.js';
import type {EffectDefinition} from '../../src/effects/effect-system.js';

const effect=(definition:EffectDefinition,target:'self'|'selected'='self'):SkillGameplayEffect=>({type:'modifier_effect',definition,target,allowedTargetRelations:target==='self'?['self']:['enemy']});
const modifier=(target:string,value:number,operation:'add_flat'|'add_percent'|'add_percentage_points'='add_flat')=>({id:target,target,value,operation,enabled:true,conditions:[]});

it.each([0,1])('A — Basic lethal combat actor%i: configured cores/modifiers → defense → one defeat, no repeat damage',caster=>{
 const f=fixture([direct()],caster),source=f.entities[caster]!,victim=f.entities[caster===0?1:0]!,t=timeline(f);
 f.definition.classification='basic';f.definition.mpCost=0;victim.currentHp=10;victim.baseStats.armor=100;
 f.modifiers[source.entityId]=[{...modifier('str',10),source:'equipment',sourceInstanceId:'item-str'},{...modifier('flat_damage',10),source:'setting',sourceInstanceId:'flat',scope:'direct'}];
 expect(validateCombatEntities(f.entities)).toEqual([]);expect(f.resolved(source).attributes.str).toBe(10);
 expect(f.stats(source).armor).toBe(4);expect(t.start().success).toBe(true);t.advance(100);t.advance(100);
 expect(f.hits()[0]!.breakdown).toMatchObject({b0:{raw:36},beforeDefense:36,finalDamage:18});
 expect(victim.currentHp).toBe(0);expect(combatState(victim,'idle')).toMatchObject({lifeState:'defeated'});
 expect(t.events.filter(e=>e.type==='entity-defeated')).toHaveLength(1);expect(t.events.filter(e=>e.type==='damage-applied')).toHaveLength(1);
 expect(t.start()).toMatchObject({success:false,reason:'target_defeated'});expect(source.currentMp).toBe(100);
 clearSkillEffects(f.runtime,f.env);expect(f.runtime.effects.instances()).toEqual([]);
});

// F is an ordered application input schedule, not Auto policy/AI or another engine.
function fullCombat(){
 const f=fixture([]);f.entities.splice(2);const hero=f.entities[0]!,monster=f.entities[1]!;
 Object.assign(hero.baseStats,{maxHp:200,maxMana:100,hpRegen:2,manaRegen:5,armor:50,magicResistance:100,criticalChance:.2,dodgeChance:.1});
 Object.assign(monster.baseStats,{maxHp:150,maxMana:100,hpRegen:1,manaRegen:2,armor:100,magicResistance:50,criticalChance:.2,dodgeChance:.1});
 hero.currentHp=120;hero.currentMp=30;monster.currentHp=150;monster.currentMp=60;
 const monsterSlot:SkillExecutionSlot={},monsterActions:SkillExecutionEvent[]=[],cooldowns=createSkillCooldownState();
 f.env.actionSlot=id=>id==='actor0'?f.slot:id==='actor1'?monsterSlot:undefined;
 let seed=73,rolls=0;const roll=()=>{rolls++;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
 f.env.criticalRoll=roll;f.env.dodgeRoll=roll;f.env.positionRoll=roll;
 const regeneration:{atMs:number;id:string;before:number[];after:number[]}[]=[];
 const t=timeline(f,[{casterId:'actor1',slot:monsterSlot,actions:monsterActions}],(from,to)=>{
  for(const actor of f.entities){const before=[actor.currentHp,actor.currentMp];const next=updateCurrentResources(actor.currentHp,actor.currentMp,f.stats(actor),to-from,actor.currentHp>0);
   actor.currentHp=next.currentHp;actor.currentMp=next.currentMp;
   if(to>from)regeneration.push({atMs:to,id:actor.entityId,before,after:[actor.currentHp,actor.currentMp]});}
 });
 const contexts=[f.context,{...f.context,casterId:'actor1',target:{mode:'entity' as const,casterId:'actor1',targetId:'actor0'}}];
 const slots=[f.slot,monsterSlot],actions=[f.actions,monsterActions],deadlines=[f.cooldowns,cooldowns];
 const samples:unknown[]=[];
 const sample=()=>samples.push(structuredClone({atMs:f.runtime.now,entities:f.entities,effective:f.entities.map(f.resolved),slots,deadlines,instances:f.runtime.effects.instances(),groups:f.runtime.effects.groups(),seed,rolls}));
 const request=(actor:number,skillId:string,effects:SkillGameplayEffect[],classification:'basic'|'active'='active',cooldownMs=0)=>{
  const definition:SkillEngineDefinition={...f.definition,skillId,effects,classification,mpCost:classification==='basic'?0:5,cooldownMs};
  const context={...contexts[actor]!,skillId};
  const result=executeSkill(definition,context,slots[actor]!,deadlines[actor]!,{grid:f.env.grid,position:f.env.position,resolveStats:f.stats},{now:f.runtime.now,expectedSerial:(slots[actor]!.actionSerial??0)+1,configVersion:'core-v1'},actions[actor]);
  t.flush();return result;
 };
 const accepted=(...args:Parameters<typeof request>)=>expect(request(...args).success).toBe(true);
 const hit=direct();hit.onHit=[dot()];
 monster.baseStats.dodgeChance=0; // A guaranteed initial contact witnesses DoT.
 accepted(0,'basic',[hit],'basic');accepted(1,'basic',[direct()],'basic');t.advance(100);monster.baseStats.dodgeChance=.1;
 accepted(0,'battle-cry',[effect({effectId:'battle-cry',durationMs:200,modifiers:[modifier('attackSpeed',.2,'add_percent')]})]);
 accepted(1,'basic',[direct()],'basic');t.advance(200);sample();
 const fireball=projectile();if(fireball.type!=='projectile')throw Error('fixture');fireball.damage.damageType='Magic';fireball.damage.tags=['Magic','Direct'];
 accepted(0,'fireball',[fireball], 'active',1000);
 accepted(1,'stun',[effect({effectId:'stun',durationMs:100,restrictions:['stun']},'selected')]);t.advance(300);
 expect(f.slot.activeAction).toBeUndefined();expect(f.cooldowns.readyAt.get('actor0')!.get('fireball')).toBe(1200);
 accepted(1,'silence',[effect({effectId:'silence',durationMs:200,restrictions:['silence']},'selected')]);t.advance(350);
 const mp=hero.currentMp;expect(request(0,'fireball',[fireball])).toMatchObject({success:false,reason:'silenced'});expect(hero.currentMp).toBe(mp);
 accepted(0,'basic',[hit],'basic');t.advance(450);
 accepted(1,'slow',[effect({effectId:'slow',durationMs:200,modifiers:[modifier('movementSpeedMultiplier',-.3,'add_percent')]},'selected')]);t.advance(550);sample();
 expect(f.stats(hero).movementSpeedMultiplier).toBeCloseTo(.7);
 accepted(0,'meteor',[sequence(),timed(),projectile('pierce')]);accepted(1,'basic',[direct()],'basic');t.advance(650);
 const resources=[hero.currentHp,hero.currentMp];
 f.modifiers.actor0=[{...modifier('physicalAttack',20),source:'equipment',sourceInstanceId:'new-item'}];
 Object.assign(hero,updateCurrentResources(hero.currentHp,hero.currentMp,f.stats(hero),0));expect([hero.currentHp,hero.currentMp]).toEqual(resources);
 t.advance(1000);
 // Force a guaranteed valid final contact through existing defense configuration,
 // not a direct HP write. Monster's pending action has not activated at that tick.
 const finisher=direct();finisher.damage={...damage(),definition:{...damage().definition,base:1000}};
 monster.baseStats.dodgeChance=0;
 if(monster.currentHp>0){accepted(0,'finish',[finisher],'basic');accepted(1,'pending',[projectile()]);t.advance(1100);}
 expect(monster.currentHp).toBe(0);expect(t.events.filter(e=>e.type==='entity-defeated'&&e.entityId==='actor1')).toHaveLength(1);
 expect(monsterSlot.activeAction).toBeUndefined();expect(monsterSlot.skillExecution).toBeUndefined();
 expect(t.events.some(e=>e.type==='skill-activated'&&e.casterId==='actor1'&&e.skillId==='pending')).toBe(false);
 expect(regeneration.some(r=>r.id==='actor0'&&r.after[0]!>r.before[0]!)).toBe(true);expect(regeneration.some(r=>r.id==='actor1'&&r.after[1]!>r.before[1]!)).toBe(true);
 expect(f.hits().some(h=>h.breakdown.entities?.attacker.entityId==='actor1')).toBe(true);
 expect(f.hits().some(h=>h.mechanic==='projectile'&&h.breakdown.event.damageType==='Magic')).toBe(true);
 expect(f.hits().some(h=>h.mechanic==='dot')).toBe(true);
 expect(t.events.some(e=>e.type==='action-cancelled'&&e.reason==='interrupted')).toBe(true);
 expect(validateCombatEntities(f.entities)).toEqual([]);
 for(const actor of f.entities)expect(actor.currentMp).toBeGreaterThanOrEqual(0);
 const pending=executeSkill({...f.definition,skillId:'session-pending',targetMode:'self',allowedTargetRelations:['self'],effects:[]},{...f.context,skillId:'session-pending',target:{mode:'self',casterId:'actor0'}},f.slot,f.cooldowns,{grid:f.env.grid,position:f.env.position,resolveStats:f.stats},{now:f.runtime.now,expectedSerial:(f.slot.actionSerial??0)+1,configVersion:'core-v1'},f.actions);
 expect(pending.success).toBe(true);t.flush();
 for(const actor of [{slot:f.slot,actions:f.actions},{slot:monsterSlot,actions:monsterActions}])cancelSkillExecution(actor.slot,f.runtime.now,'session_end',actor.actions);
 t.flush();clearSkillEffects(f.runtime,f.env);const count=t.events.length;
 clearSkillEffects(f.runtime,f.env);t.advance(5000);expect(t.events).toHaveLength(count);
 expect(f.runtime.effects.instances()).toEqual([]);expect(f.runtime.effects.groups()).toEqual([]);expect(f.runtime.dots.groups).toEqual([]);expect(f.runtime.dotPolicies.size).toBe(0);
 expect([f.runtime.bullets,f.runtime.objects,f.runtime.sequences]).toEqual([[],[],[]]);
 expect(slots.every(s=>!s.activeAction&&!s.skillExecution)).toBe(true);
 const deadResources=updateCurrentResources(0,monster.currentMp,f.stats(monster),1000,false);expect(deadResources).toEqual({currentHp:0,currentMp:monster.currentMp});
 return structuredClone({entities:f.entities,effective:f.entities.map(f.resolved),slots,deadlines,events:t.events,samples,regeneration,seed,rolls,clock:f.runtime.now,instances:f.runtime.effects.instances(),groups:f.runtime.effects.groups()});
}
it('F — full two-actor combat, regeneration, restrictions, defeat and disposal; independent seeded sessions are identical',()=>{
 const first=fullCombat();expect(fullCombat()).toEqual(first);expect(first.rolls).toBeGreaterThan(0);
});
