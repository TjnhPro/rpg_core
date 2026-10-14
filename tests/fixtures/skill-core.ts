import {executeSkill,advanceSkillExecution,type SkillExecutionSlot,type SkillActivatedEvent,type SkillExecutionEvent} from '../../src/skills/skill-execution.js';
import {createSkillCooldownState,type SkillEngineDefinition,type SkillExecutionContext} from '../../src/skills/skill-engine.js';
import {dispatchSkillEffects,advanceSkillEffects,createSkillEffectRuntime,type SkillEffectEnvironment,type SkillEffectEvent} from '../../src/skills/skill-effect-integration.js';
import {snapshotActorDamage} from '../../src/damage/damage-core.js';
import {resolveCharacterStats,updateCurrentResources} from '../../src/stats/stat-calculation.js';
import {prepareModifierResolver} from '../../src/modifiers/modifier-core.js';
import {DEFAULT_CORE_STATS} from '../../src/contracts/stat-contracts.js';
import type {CombatEntity} from '../../src/combat/combat-entity.js';
import {damageDefinition} from '../../src/contracts/damage-contracts.js';
import {DEFAULT_DEFENSE_SETTINGS} from '../../src/contracts/defense-settings.js';
import {DEFAULT_PROJECTILE,DEFAULT_TIMED_OBJECT,DEFAULT_TIMED_AOE_SEQUENCE} from '../../src/contracts/mechanic-contracts.js';
import {DEFAULT_DOT} from '../../src/contracts/dot-contracts.js';
import {type SkillDamageComponent,type SkillGameplayEffect} from '../../src/skills/skill-effects.js';
import type {CombatModifier} from '../../src/contracts/combat-modifiers.js';

export const damage=():SkillDamageComponent=>({id:'component',definition:{...damageDefinition(1),base:10},damageType:'Physical',tags:['Basic','Direct','Physical'],rank:1});
export const direct=():Extract<SkillGameplayEffect,{type:'direct_hit'}>=>({type:'direct_hit',damage:damage()});
export const projectile=(behavior:'stop_on_hit'|'pierce'='stop_on_hit'):SkillGameplayEffect=>({type:'projectile',damage:damage(),config:{...DEFAULT_PROJECTILE,spreadAngles:[0],spawnOffset:0,speed:100,maxRange:300,collisionRadius:2,lifetime:3000,hitBehavior:behavior}});
export const sequence=():SkillGameplayEffect=>({type:'timed_aoe_sequence',damage:damage(),config:{...DEFAULT_TIMED_AOE_SEQUENCE,firstDelayMs:100,intervalMs:100,aoeRadius:20,damageComponent:'component'}});
export const timed=():SkillGameplayEffect=>({type:'timed_object',config:{...DEFAULT_TIMED_OBJECT,delayMs:100,projectileRef:'component',bulletCount:1,placement:'self'},projectile:{config:{...DEFAULT_PROJECTILE,spawnOffset:0,speed:100,collisionRadius:2,spreadAngles:[0]},damage:damage()}});
export const dot=()=>({config:{...DEFAULT_DOT,damageComponent:'component',tags:['DoT','Poison'],firstTickMs:100,tickIntervalMs:100,durationMs:1000},damage:{...damage(),tags:['DoT','Poison']}});

export function fixture(effects:SkillGameplayEffect[]=[direct()],casterIndex=0){
 const entities:CombatEntity[]=['player','monster','monster','player'].map((entityType,i)=>({entityId:`actor${i}`,entityType:entityType as CombatEntity['entityType'],level:1,factionId:entityType,targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0,physicalAttack:10,maxHp:1000,maxMana:100,criticalChance:0,dodgeChance:0},currentHp:1000,currentMp:100}));
 const positions:Record<string,{x:number;y:number}>={actor0:{x:30,y:50},actor1:{x:80,y:50},actor2:{x:130,y:50},actor3:{x:80,y:50}};
 const config=structuredClone(DEFAULT_CORE_STATS);const defense=structuredClone(DEFAULT_DEFENSE_SETTINGS);
 defense.types.armorReduction.coefficients={baseK:100,levelPenalty:0};defense.types.magicReduction.coefficients={baseK:100,levelPenalty:0};
 const modifiers:Record<string,CombatModifier[]>={};
 const contributions=(entityId:string)=>[...(modifiers[entityId]??[]),...runtime.effects.modifiers(entityId)];
 const resolved=(entity:CombatEntity)=>resolveCharacterStats(entity.baseStats,config,prepareModifierResolver(contributions(entity.entityId)),{str:0,dex:0,int:0,vit:0});
 const stats=(entity:CombatEntity)=>resolved(entity).values;
 const casterId=`actor${casterIndex}`,targetId=casterIndex===0?'actor1':'actor0';
 const context:{-readonly [K in keyof SkillExecutionContext]:SkillExecutionContext[K]}={skillId:'test',casterId,target:{mode:'entity',casterId,targetId},combat:{findEntity:id=>entities.find(e=>e.entityId===id),relation:(a,b)=>a.factionId===b.factionId?'ally':'enemy',hasRestriction:(id,r)=>runtime.effects.hasRestriction(id,r)}};
 const definition:{-readonly [K in keyof SkillEngineDefinition]:SkillEngineDefinition[K]}={skillId:'test',targetMode:'entity',allowedTargetRelations:['enemy'],baseActionDurationMs:100,activationPercent:50,castRange:400,mpCost:5,cooldownMs:0,effects};
 const events:SkillEffectEvent[]=[],actions:SkillExecutionEvent[]=[],slot:SkillExecutionSlot={},cooldowns=createSkillCooldownState(),runtime=createSkillEffectRuntime();
 let critCalls=0,dodgeCalls=0,positionCalls=0,seed=123;
 const env:SkillEffectEnvironment={combat:context.combat,grid:{cellSize:20,columns:40,rows:10,cells:Array(10).fill('1'.repeat(40))},entityIds:()=>entities.map(e=>e.entityId),position:id=>positions[id],
  snapshotDamage:(entity,component)=>{const result=resolved(entity),s=result.values;return {...snapshotActorDamage(component.definition,{...result.attributes,physicalAttack:s.physicalAttack,magicAttack:s.magicAttack},contributions(entity.entityId),{skills:{},modifiers:[]},s.criticalChance,s.criticalDamage),rank:component.rank,attacker:entity,defenseConfig:{revision:1,settings:defense},options:[]};},
  actionSlot:id=>id===casterId?slot:undefined,
  defenseStats:entity=>{const s=stats(entity);return {maxHp:s.maxHp,armor:s.armor,magicResistance:s.magicResistance,dodgeChance:s.dodgeChance};},statuses:()=>[],
  criticalRoll:()=>{critCalls++;return .9;},dodgeRoll:()=>{dodgeCalls++;return 0;},positionRoll:()=>{positionCalls++;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;},emit:e=>{
   events.push(e);
   if(e.type==='effect-applied'||e.type==='effect-refreshed'||e.type==='effect-stack-refreshed'||e.type==='effect-expired'||e.type==='effect-removed'){
    const target=context.combat.findEntity(e.instance.targetEntityId);if(target){const resources=updateCurrentResources(target.currentHp,target.currentMp,stats(target),0,target.currentHp>0);target.currentHp=resources.currentHp;target.currentMp=resources.currentMp;}
   }
  }};
 const start=(now=0)=>executeSkill(definition,context,slot,cooldowns,{grid:env.grid,position:env.position,resolveStats:stats},{now,expectedSerial:(slot.actionSerial??0)+1,configVersion:'v1'},actions);
 const activate=()=>{start();advanceSkillEffects(runtime,50,env);advanceSkillExecution(slot,context.combat,50,actions);const event=actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!;dispatchSkillEffects(runtime,event,env);return event;};
 const hits=()=>events.filter((e):e is Extract<SkillEffectEvent,{type:'effect-hit'}>=>e.type==='effect-hit');
 return {cooldowns,stats,resolved,contributions,definition,entities,positions,modifiers,config,defense,context,env,runtime,events,actions,slot,start,activate,hits,rolls:()=>({critCalls,dodgeCalls,positionCalls})};
}
