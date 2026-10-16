// Installed-package trigger intent example. No Child Skill execution.
import {createSkillEffectRuntime,createSkillCooldownState,executeSkill,advanceSkillEffects,clearSkillEffects} from '@rpg/core';
import {pinSkillInstanceDefinition,pinSkillTriggerBundle,validateSkillTriggerReceipt,inspectSkillInstance} from '@rpg/core/skills';
import type {CombatEntity,SkillExecutionSlot,SkillEngineDefinition,SkillTriggerResult,SkillEffectEnvironment} from '@rpg/core';
export function skillTriggerExample(){
 const actor:CombatEntity={entityId:'source',entityType:'player',level:1,factionId:'a',targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:100,currentMp:100};
 const combat={findEntity:(id:string)=>id==='source'?actor:undefined,relation:()=> 'self' as const};
 const runtime=createSkillEffectRuntime(0,undefined,{offenseMode:'root',instanceSession:'trigger-session'}),slot:SkillExecutionSlot={};
 const definition:SkillEngineDefinition={skillId:'root',targetMode:'self',allowedTargetRelations:['self'],baseActionDurationMs:100,activationPercent:0,castRange:0,mpCost:5,cooldownMs:0};
 const root=pinSkillInstanceDefinition(definition,'v1',100),child=pinSkillInstanceDefinition({...definition,skillId:'child'},'v1');
 const bundle=pinSkillTriggerBundle({version:'v1',rootSkillId:'root',definitions:[root,child],links:[{linkId:'expire',sourceSkillId:'root',childSkillId:'child',trigger:'OnExpire',delayMs:10,maxOccurrences:1}]});
 const results:SkillTriggerResult[]=[];let captures=0;
 const grid={cellSize:10,columns:1,rows:1,cells:['1']},position=()=>({x:0,y:0});
 const result=executeSkill(definition,{skillId:'root',casterId:'source',target:{mode:'self',casterId:'source'},combat},slot,createSkillCooldownState(),{
  grid,position,resolveStats:()=>({attackSpeed:1,cooldownReduction:0}),skillInstanceLifetimeMs:100,triggers:{bundle,observe:r=>results.push(r)},
  rootOffense:{runtime,capture:()=>{captures++;return {sources:{str:0,dex:0,int:0,vit:0,physicalAttack:10,magicAttack:0},modifiers:[],settings:{skills:{},modifiers:[]},criticalChance:0,criticalBonus:0,attacker:actor,defenseConfig:undefined,options:[]};}},
 },{now:0,expectedSerial:1,configVersion:'v1'});
 if(!result.success)throw Error('admission failed');
 const env:SkillEffectEnvironment={combat,grid,position,entityIds:()=>['source'],snapshotDamage:()=>{throw Error('no effects');},
  defenseStats:()=>({maxHp:100,armor:0,magicResistance:0,dodgeChance:0}),statuses:()=>[],criticalRoll:()=>{throw Error('no damage');},dodgeRoll:()=>{throw Error('no damage');},positionRoll:()=>{throw Error('no spatial effects');},emit:()=>{}};
 advanceSkillEffects(runtime,100,env);const receipt=results[0]!.receipt!;
 // @ts-expect-error capabilities are immutable observations
 if(false)receipt.executeAtMs=0;
 const replay=validateSkillTriggerReceipt(runtime,receipt).success,forged=validateSkillTriggerReceipt(runtime,{...receipt}).success;
 const status=inspectSkillInstance(runtime,receipt.instanceId)!.status;
 clearSkillEffects(runtime);
 return {intents:results.length,status,executeAtMs:receipt.executeAtMs,replay,forged,disposed:validateSkillTriggerReceipt(runtime,receipt).success,captures,mp:actor.currentMp};
}
