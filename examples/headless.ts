// Minimal integration recipe: application supplies content, clock, RNG and entities.
import {DEFAULT_CORE_STATS} from '@rpg/core';
import {damageDefinition} from '@rpg/core';
import {DEFAULT_DEFENSE_SETTINGS} from '@rpg/core';
import type {CombatEntity} from '@rpg/core';
import {prepareModifierResolver} from '@rpg/core';
import {resolveCharacterStats} from '@rpg/core';
import {snapshotActorDamage} from '@rpg/core';
import {createSkillCooldownState,type SkillEngineDefinition} from '@rpg/core';
import {executeSkill,advanceSkillExecution,cancelSkillExecution,type SkillExecutionSlot,type SkillExecutionEvent} from '@rpg/core';
import {createSkillEffectRuntime,dispatchSkillEffects,advanceSkillEffects,clearSkillEffects,type SkillEffectEnvironment,type SkillEffectEvent} from '@rpg/core';

export function headlessCombat(seed=73){
 const entities:CombatEntity[]=['player','monster'].map((kind,i)=>({entityId:`actor${i}`,entityType:kind as CombatEntity['entityType'],level:1,factionId:kind,targetTags:[],
  baseStats:{str:10,dex:10,int:10,vit:10,maxHp:100,maxMana:30,physicalAttack:10,criticalChance:.5},currentHp:100,currentMp:30}));
 const slots=new Map(entities.map(e=>[e.entityId,{} as SkillExecutionSlot])),runtime=createSkillEffectRuntime();
 const events:SkillEffectEvent[]=[],actions:SkillExecutionEvent[]=[],cooldowns=createSkillCooldownState();
 const stats=(e:CombatEntity)=>resolveCharacterStats(e.baseStats,DEFAULT_CORE_STATS,prepareModifierResolver(runtime.effects.modifiers(e.entityId)),{str:10,dex:10,int:10,vit:10}).values;
 let rng=seed>>>0;const roll=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)/4294967296;};
 const combat={findEntity:(id:string)=>entities.find(e=>e.entityId===id),relation:()=> 'enemy' as const,hasRestriction:(id:string,r:'stun'|'silence')=>runtime.effects.hasRestriction(id,r)};
 const positions:{[id:string]:{x:number;y:number}}={actor0:{x:20,y:20},actor1:{x:40,y:20}};
 const env:SkillEffectEnvironment={combat,grid:{cellSize:20,columns:10,rows:10,cells:Array(10).fill('1111111111')},entityIds:()=>entities.map(e=>e.entityId),position:id=>positions[id],
  actionSlot:id=>slots.get(id),statuses:()=>[],criticalRoll:roll,dodgeRoll:roll,positionRoll:roll,emit:e=>events.push(e),
  defenseStats:e=>{const s=stats(e);return {maxHp:s.maxHp,armor:s.armor,magicResistance:s.magicResistance,dodgeChance:s.dodgeChance};},
  snapshotDamage:(e,c)=>{const s=stats(e);return {...snapshotActorDamage(c.definition,{str:10,dex:10,int:10,vit:10,physicalAttack:s.physicalAttack,magicAttack:s.magicAttack},[...runtime.effects.modifiers(e.entityId)],{skills:{},modifiers:[]},s.criticalChance,s.criticalDamage),rank:c.rank,attacker:e,defenseConfig:{revision:1,settings:DEFAULT_DEFENSE_SETTINGS},options:[]};}};
 const skill:SkillEngineDefinition={skillId:'example-basic',classification:'basic',targetMode:'entity',allowedTargetRelations:['enemy'],baseActionDurationMs:100,activationPercent:50,castRange:100,mpCost:0,cooldownMs:0,
  effects:[{type:'direct_hit',damage:{id:'example-damage',definition:{...damageDefinition(1),base:10},damageType:'Physical',tags:['Basic','Physical','Direct'],rank:1}}]};
 const slot=slots.get('actor0')!,context={skillId:skill.skillId,casterId:'actor0',target:{mode:'entity' as const,casterId:'actor0',targetId:'actor1'},combat};
 const result=executeSkill(skill,context,slot,cooldowns,{grid:env.grid,position:env.position,resolveStats:stats},{now:0,expectedSerial:1,configVersion:'example-v1'},actions);
 if(!result.success)throw Error(JSON.stringify(result));
 // The caller partitions at the real activation boundary, then completion.
 advanceSkillEffects(runtime,50,env);advanceSkillExecution(slot,combat,50,actions);
 for(const event of actions)if(event.type==='skill-activated')dispatchSkillEffects(runtime,event,env);
 advanceSkillEffects(runtime,100,env);advanceSkillExecution(slot,combat,100,actions);
 for(const actorSlot of slots.values())cancelSkillExecution(actorSlot,100,'session_end',actions);
 clearSkillEffects(runtime,env);
 if(entities[1]!.currentHp>=100||runtime.active)throw Error('Example combat/cleanup failed');
 return {entities,actions,events,rng:rng>>>0};
}
