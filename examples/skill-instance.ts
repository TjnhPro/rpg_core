// Installed-package lifecycle linkage only; no child gameplay dispatch.
import {createSkillEffectRuntime,createSkillCooldownState,executeSkill,clearSkillEffects} from '@rpg/core';
import {pinSkillInstanceDefinition,rootSkillInstance,registerChildSkillInstance,activateSkillInstance,finishSkillInstance,inspectSkillInstance} from '@rpg/core/skills';
import type {CombatEntity,SkillExecutionSlot,SkillEngineDefinition,SkillInstanceResult} from '@rpg/core';

export function skillInstanceExample(){
 const actor:CombatEntity={entityId:'source',entityType:'player',level:1,factionId:'a',targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:100,currentMp:100};
 const combat={findEntity:(id:string)=>id==='source'?actor:undefined,relation:()=> 'self' as const};
 const runtime=createSkillEffectRuntime(0,undefined,{offenseMode:'root',instanceSession:'server-session'}),slot:SkillExecutionSlot={};
 const definition:SkillEngineDefinition={skillId:'root',targetMode:'self',allowedTargetRelations:['self'],baseActionDurationMs:100,activationPercent:0,castRange:0,mpCost:5,cooldownMs:0};
 let captures=0;
 const result=executeSkill(definition,{skillId:'root',casterId:'source',target:{mode:'self',casterId:'source'},combat},slot,createSkillCooldownState(),{
  grid:{cellSize:10,columns:1,rows:1,cells:['1']},position:()=>({x:0,y:0}),resolveStats:()=>({attackSpeed:1,cooldownReduction:0}),skillInstanceLifetimeMs:100,
  rootOffense:{runtime,capture:()=>{captures++;return {sources:{str:0,dex:0,int:0,vit:0,physicalAttack:10,magicAttack:0},modifiers:[],settings:{skills:{},modifiers:[]},criticalChance:0,criticalBonus:0,attacker:actor,defenseConfig:undefined,options:[]};}},
 },{now:0,expectedSerial:1,configVersion:'content-v1'});
 if(!result.success)throw Error('root admission failed');
 const root=rootSkillInstance(runtime,slot.skillExecution!.snapshot)!;
 const unwrap=(r:SkillInstanceResult)=>{if(!r.success)throw Error(r.reason);return r.instance;};
 const pin=pinSkillInstanceDefinition({...definition,skillId:'child'},'child-v2',100);
 const child=unwrap(registerChildSkillInstance(runtime,root,pin,'trusted-B',0,combat));
 const grandchild=unwrap(registerChildSkillInstance(runtime,child,pin,'trusted-C',0,combat));
 // @ts-expect-error frozen definition views cannot be mutated by consumers
 if(false)child.definition!.mpCost=0;
 // @ts-expect-error frozen S0 is shared safely through every generation
 if(false)grandchild.rootOffense!.offense.sources.physicalAttack=500;
 unwrap(activateSkillInstance(runtime,child,0,combat));unwrap(finishSkillInstance(runtime,root,0));
 const values={root:inspectSkillInstance(runtime,root.instanceId)!.status,child:inspectSkillInstance(runtime,child.instanceId)!.status,
  grandchild:grandchild.status,sharedSnapshot:child.rootOffense===grandchild.rootOffense&&child.rootOffense===root.rootOffense,
  sharedPin:child.definition===grandchild.definition,captures,mp:actor.currentMp};
 clearSkillEffects(runtime);return values;
}
