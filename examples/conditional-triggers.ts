import {createSkillEffectRuntime,createSkillCooldownState,executeSkill,dispatchSkillEffects,advanceSkillEffects,clearSkillEffects,
 pinSkillInstanceDefinition,pinSkillTriggerBundle,inspectSkillInstance,DEFAULT_INSTANT_AOE,DEFAULT_DEFENSE_SETTINGS,damageDefinition} from '@rpg/core';
import type {CombatEntity,SkillEngineDefinition,SkillEffectEnvironment,SkillGameplayEffect,SkillInstanceView} from '@rpg/core';

/** Installed Core: canonical Apply rising edge -> exact-N consumption -> Child AoE. */
export function conditionalTriggersExample(requiredStacks=3){
 const source:CombatEntity={entityId:'source',entityType:'player',level:1,factionId:'a',targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:1000,currentMp:100};
 const target:CombatEntity={...source,entityId:'target',entityType:'monster',factionId:'b'};
 const combat={findEntity:(id:string)=>id==='source'?source:id==='target'?target:undefined,relation:()=> 'enemy' as const};
 const grid={cellSize:20,columns:40,rows:10,cells:Array(10).fill('1'.repeat(40)) as string[]};
 const position=(id:string)=>id==='source'?{x:30,y:50}:{x:80,y:50};
 const runtime=createSkillEffectRuntime(0,undefined,{offenseMode:'root',instanceSession:'stack-consumer'});
 const component={id:'component',definition:{...damageDefinition(1),base:10},rank:1,damageType:'Physical' as const,tags:['Physical','Direct']};
 const mark:SkillGameplayEffect={type:'modifier_effect',target:'selected',definition:{effectId:'mark',durationMs:2000,stackingPolicy:'stack',maxStacks:5}};
 const a:SkillEngineDefinition={skillId:'mark-spend',targetMode:'entity',allowedTargetRelations:['enemy'],baseActionDurationMs:100,activationPercent:0,castRange:400,mpCost:5,cooldownMs:1000,effects:[mark,mark,mark]};
 const root=pinSkillInstanceDefinition(a,'v1'),b=pinSkillInstanceDefinition({...a,skillId:'spend',targetMode:'ground',effects:[{type:'instant_aoe',config:{...DEFAULT_INSTANT_AOE,radius:10,origin:'ground'},damage:component}]},'v2');
 const bundle=pinSkillTriggerBundle({version:'v1',rootSkillId:a.skillId,definitions:[root,b],links:[{linkId:'threshold',sourceSkillId:a.skillId,childSkillId:'spend',trigger:'OnStackThreshold',stackThreshold:{effectId:'mark',threshold:3},requiresStacks:{effectId:'mark',minStacks:3,sourceScope:'currentSource'},consumeExactly:requiredStacks,delayMs:0,maxOccurrences:1}]});
 let captures=0,rolls=0,consumed=0,damage=0,bonus=0;const selected:string[]=[],children:SkillInstanceView[]=[];
 const env:SkillEffectEnvironment={combat,grid,position,entityIds:()=>['source','target'],snapshotDamage:()=>{throw Error('must reuse S0');},
  defenseStats:()=>({maxHp:1000,armor:0,magicResistance:0,dodgeChance:0}),statuses:()=>[],criticalRoll:()=>{rolls++;return .9;},dodgeRoll:()=>{rolls++;return .9;},positionRoll:()=>.5,
  emit:event=>{
   if(event.type==='effect-removed'&&event.reason==='consumed'){consumed++;selected.push(event.instance.effectInstanceId);}
   if(event.type==='effect-hit'&&event.mechanic==='instant_aoe'){damage=event.breakdown.finalDamage;bonus=event.breakdown.b0.flat;}
  }};
 const started=executeSkill(a,{skillId:a.skillId,casterId:'source',target:{mode:'entity',casterId:'source',targetId:'target'},combat},{},createSkillCooldownState(),{
  grid,position,resolveStats:()=>({attackSpeed:1,cooldownReduction:0}),triggers:{bundle,executeChildren:true,observe:r=>{if(r.receipt)children.push(inspectSkillInstance(runtime,r.receipt.receiptId)!);}},
  rootOffense:{runtime,capture:()=>{captures++;return {sources:{str:0,dex:0,int:0,vit:0,physicalAttack:10,magicAttack:0},modifiers:[],settings:{skills:{},modifiers:[]},criticalChance:0,criticalBonus:0,attacker:source,defenseConfig:{revision:1,settings:DEFAULT_DEFENSE_SETTINGS},options:[]};}},
 },{now:0,expectedSerial:1,configVersion:'v1'});
 if(!started.success)throw Error('root rejected');
 const activation=started.events.find(e=>e.type==='skill-activated');if(!activation||activation.type!=='skill-activated')throw Error('no activation');
 dispatchSkillEffects(runtime,activation,env);source.baseStats.physicalAttack=999;advanceSkillEffects(runtime,600,env);
 const result={consumed,selected,remaining:runtime.effects.groups()[0]?.currentStacks??0,damage,bonus,hp:target.currentHp,captures,mp:source.currentMp,rolls,children:children.length,sharedS0:children.every(c=>c.rootOffense===activation.snapshot.rootOffense)};
 clearSkillEffects(runtime);return result;
}
