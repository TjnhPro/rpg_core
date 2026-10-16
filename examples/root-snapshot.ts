// Installed-package recipe: capture/bind/derive, not nested Skill execution.
import {createSkillEffectRuntime,createSkillCooldownState,executeSkill,deriveSkillRootDamage,calculateDamage,damageDefinition,clearSkillEffects} from '@rpg/core';
import {snapshotActorOffense,type ActorOffenseInput} from '@rpg/core/damage';
import type {CombatEntity,SkillExecutionSlot,SkillDamageComponent,SkillEngineDefinition} from '@rpg/core';

export function rootSnapshotExample(){
 const actor:CombatEntity={entityId:'source',entityType:'player',level:1,factionId:'a',targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:100,currentMp:100};
 const runtime=createSkillEffectRuntime(0,undefined,{offenseMode:'root'}),slot:SkillExecutionSlot={};
 const input:ActorOffenseInput={sources:{str:0,dex:0,int:0,vit:0,physicalAttack:10,magicAttack:0},modifiers:[],settings:{skills:{},modifiers:[]},criticalChance:0,criticalBonus:0,attacker:actor,defenseConfig:undefined,options:[]};
 const standalone=snapshotActorOffense(input);
 // @ts-expect-error offense views are deeply readonly
 if(false)standalone.sources.physicalAttack=500;
 const definition:SkillEngineDefinition={skillId:'root',targetMode:'self',allowedTargetRelations:['self'],baseActionDurationMs:100,activationPercent:0,castRange:0,mpCost:5,cooldownMs:0};
 let captures=0;
 const result=executeSkill(definition,{skillId:'root',casterId:'source',target:{mode:'self',casterId:'source'},combat:{findEntity:id=>id==='source'?actor:undefined,relation:()=> 'self'}},slot,createSkillCooldownState(),{
  grid:{cellSize:10,columns:1,rows:1,cells:['1']},position:()=>({x:0,y:0}),resolveStats:()=>({attackSpeed:1,cooldownReduction:0}),
  rootOffense:{runtime,capture:()=>{captures++;return input;}},
 },{now:0,expectedSerial:1,configVersion:'content-v1'});
 if(!result.success)throw Error('root admission failed');
 const snapshot=slot.skillExecution!.snapshot;
 input.sources.physicalAttack=900;
 const b:SkillDamageComponent={id:'B',definition:{...damageDefinition(1),base:10},damageType:'Physical',tags:['Physical','AoE'],rank:1};
 const c:SkillDamageComponent={...b,id:'C',definition:{...damageDefinition(2),base:10,perRank:1},rank:2};
 const damage=(component:SkillDamageComponent)=>calculateDamage({...deriveSkillRootDamage(runtime,snapshot,component),context:{type:component.damageType,tags:component.tags,target:'Normal',statuses:[]},roll:1}).finalDamage;
 const values={b:damage(b),c:damage(c),captures,mp:actor.currentMp,configVersion:snapshot.rootOffense!.configVersion};
 clearSkillEffects(runtime);return values;
}
