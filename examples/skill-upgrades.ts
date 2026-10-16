import {createSkillEffectRuntime,createSkillCooldownState,executeSkill,dispatchSkillEffects,advanceSkillEffects,clearSkillEffects,
 defineSkill,resolveSkillUpgrades,pinSkillInstanceDefinition,pinSkillTriggerBundle,DEFAULT_PROJECTILE,DEFAULT_DEFENSE_SETTINGS,damageDefinition} from '@rpg/core';
import type {CombatEntity,SkillEngineDefinition,SkillEffectEnvironment,SkillTriggerBundle} from '@rpg/core';

/** Installed consumer selects a revision explicitly; no lookup during delivery. */
export function skillUpgradesExample(){
 const definition:SkillEngineDefinition={skillId:'shot',targetMode:'entity',allowedTargetRelations:['enemy'],baseActionDurationMs:100,activationPercent:0,castRange:400,mpCost:5,cooldownMs:1000,
  effects:[{type:'projectile',config:{...DEFAULT_PROJECTILE,bulletCount:1,spreadAngles:[0],spawnOffset:0,speed:100,collisionRadius:2,maxRange:300,lifetime:3000},damage:{id:'component',definition:{...damageDefinition(1),base:10},rank:1,damageType:'Physical',tags:['Physical','Direct']}}]};
 const original=pinSkillTriggerBundle({version:'v1',rootSkillId:'shot',definitions:[pinSkillInstanceDefinition(definition,'v1')],links:[]});
 const resolved=resolveSkillUpgrades(original,[{upgradeId:'triple',skillId:'shot',type:'projectile_pattern',effectIndex:0,expectedType:'projectile',expectedComponentId:'component',bulletCount:3,spreadAngles:[0,0,0]}],'v1','v2');
 if(!resolved.success)throw Error(resolved.errors.join());
 const run=(bundle:SkillTriggerBundle)=>{
  const source:CombatEntity={entityId:'source',entityType:'player',level:1,factionId:'a',targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:1000,currentMp:100};
  const target:CombatEntity={...source,entityId:'target',entityType:'monster',factionId:'b'};
  const combat={findEntity:(id:string)=>id==='source'?source:id==='target'?target:undefined,relation:()=> 'enemy' as const};
  const grid={cellSize:20,columns:40,rows:10,cells:Array(10).fill('1'.repeat(40)) as string[]};
  const position=(id:string)=>id==='source'?{x:30,y:50}:{x:80,y:50};
  const runtime=createSkillEffectRuntime(0,undefined,{offenseMode:'root',instanceSession:'upgrades-consumer'});let captures=0;
  const env:SkillEffectEnvironment={combat,grid,position,entityIds:()=>['source','target'],snapshotDamage:()=>{throw Error('must reuse S0');},
   defenseStats:()=>({maxHp:1000,armor:0,magicResistance:0,dodgeChance:0}),statuses:()=>[],criticalRoll:()=>.9,dodgeRoll:()=>.9,positionRoll:()=>.5,emit:()=>{}};
  const pin=bundle.definitions[0]!,skill=defineSkill(pin.definition);if(!skill.success)throw Error('definition');
  const started=executeSkill(skill.definition,{skillId:'shot',casterId:'source',target:{mode:'entity',casterId:'source',targetId:'target'},combat},{},createSkillCooldownState(),{
   grid,position,resolveStats:()=>({attackSpeed:1,cooldownReduction:0}),triggers:{bundle,executeChildren:true,observe:()=>{}},
   rootOffense:{runtime,capture:()=>{captures++;return {sources:{str:0,dex:0,int:0,vit:0,physicalAttack:10,magicAttack:0},modifiers:[],settings:{skills:{},modifiers:[]},criticalChance:0,criticalBonus:0,attacker:source,defenseConfig:{revision:1,settings:DEFAULT_DEFENSE_SETTINGS},options:[]};}},
  },{now:0,expectedSerial:1,configVersion:pin.configVersion});
  if(!started.success)throw Error('root rejected');
  const activation=started.events.find(e=>e.type==='skill-activated');if(!activation||activation.type!=='skill-activated')throw Error('activation');
  dispatchSkillEffects(runtime,activation,env);const projectiles=runtime.bullets.length;source.baseStats.physicalAttack=999;advanceSkillEffects(runtime,600,env);
  const result={revision:activation.snapshot.configVersion,projectiles,hp:target.currentHp,captures,mp:source.currentMp};clearSkillEffects(runtime);return result;
 };
 return {old:run(original),upgraded:run(resolved.resolved),oldAgain:run(original)};
}
