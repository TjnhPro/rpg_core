// Real installed-package A → B → C; caller owns entities, clock and RNG.
import {createSkillEffectRuntime,createSkillCooldownState,executeSkill,advanceSkillExecution,dispatchSkillEffects,advanceSkillEffects,clearSkillEffects,
 pinSkillInstanceDefinition,pinSkillTriggerBundle,inspectSkillInstance,DEFAULT_PROJECTILE,DEFAULT_INSTANT_AOE,DEFAULT_TIMED_OBJECT,DEFAULT_DEFENSE_SETTINGS,damageDefinition} from '@rpg/core';
import type {CombatEntity,SkillEngineDefinition,SkillExecutionSlot,SkillEffectEnvironment,SkillTriggerResult,SkillInstanceView,SkillDamageComponent} from '@rpg/core';

export function nestedCompositionExample(){
 const source:CombatEntity={entityId:'source',entityType:'player',level:1,factionId:'a',targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:1000,currentMp:100};
 const target:CombatEntity={...source,entityId:'target',entityType:'monster',factionId:'b'};
 const combat={findEntity:(id:string)=>id==='source'?source:id==='target'?target:undefined,relation:()=> 'enemy' as const};
 const grid={cellSize:20,columns:40,rows:10,cells:Array(10).fill('1'.repeat(40)) as string[]};
 const position=(id:string)=>id==='source'?{x:30,y:50}:{x:80,y:50};
 const runtime=createSkillEffectRuntime(0,undefined,{offenseMode:'root',instanceSession:'nested-consumer'}),slot:SkillExecutionSlot={},cooldowns=createSkillCooldownState();
 const component=(base:number,rank:number):SkillDamageComponent=>({id:'component',definition:{...damageDefinition(1),base,perRank:.5},rank,damageType:'Physical',tags:['Physical','Direct']});
 const projectile={...DEFAULT_PROJECTILE,speed:100,collisionRadius:2,spawnOffset:0,spreadAngles:[0]};
 const a:SkillEngineDefinition={skillId:'meteor',targetMode:'entity',allowedTargetRelations:['enemy'],baseActionDurationMs:100,activationPercent:0,castRange:400,mpCost:5,cooldownMs:1000,
  effects:[{type:'projectile',config:projectile,damage:component(10,1)}]};
 const b=pinSkillInstanceDefinition({...a,skillId:'explosion',targetMode:'ground',effects:[{type:'instant_aoe',config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:10},damage:component(20,2)}]},'B-v2',100);
 const c=pinSkillInstanceDefinition({...a,skillId:'ring',targetMode:'ground',effects:[{type:'timed_object',config:{...DEFAULT_TIMED_OBJECT,delayMs:100,bulletCount:4},projectile:{config:projectile,damage:component(30,3)}}]},'C-v3');
 const bundle=pinSkillTriggerBundle({version:'v1',rootSkillId:'meteor',definitions:[pinSkillInstanceDefinition(a,'A-v1'),b,c],links:[
  {linkId:'impact',sourceSkillId:'meteor',childSkillId:'explosion',trigger:'OnImpact',delayMs:0,maxOccurrences:1},
  {linkId:'expiry',sourceSkillId:'explosion',childSkillId:'ring',trigger:'OnExpire',delayMs:0,maxOccurrences:1}]});
 let captures=0,bHits=0,cHits=0;const results:SkillTriggerResult[]=[],children:SkillInstanceView[]=[],directions:string[]=[];
 const env:SkillEffectEnvironment={combat,grid,position,entityIds:()=>['source','target'],snapshotDamage:()=>{throw Error('must reuse S0');},
  defenseStats:()=>({maxHp:1000,armor:0,magicResistance:0,dodgeChance:0}),statuses:()=>[],criticalRoll:()=>.9,dodgeRoll:()=>0,positionRoll:()=>.5,
  emit:event=>{
   if(event.type==='effect-hit'){if(event.instanceId.startsWith(children[0]?.instanceId??'!'))bHits++;if(event.instanceId.startsWith(children[1]?.instanceId??'!'))cHits++;}
   if(event.type==='effect-created'&&event.mechanic==='projectile'&&children[1]&&event.instanceId.startsWith(children[1].instanceId))directions.push(JSON.stringify(runtime.bullets.find(b=>b.id===event.instanceId)!.direction));
  }};
 const started=executeSkill(a,{skillId:a.skillId,casterId:'source',target:{mode:'entity',casterId:'source',targetId:'target'},combat},slot,cooldowns,{
  grid,position,resolveStats:()=>({attackSpeed:1,cooldownReduction:0}),triggers:{bundle,executeChildren:true,observe:r=>{results.push(r);if(r.receipt)children.push(inspectSkillInstance(runtime,r.receipt.receiptId)!);}},
  rootOffense:{runtime,capture:()=>{captures++;return {sources:{str:0,dex:0,int:0,vit:0,physicalAttack:10,magicAttack:0},modifiers:[],settings:{skills:{},modifiers:[]},criticalChance:0,criticalBonus:0,attacker:source,defenseConfig:{revision:1,settings:DEFAULT_DEFENSE_SETTINGS},options:[]};}},
 },{now:0,expectedSerial:1,configVersion:'A-v1'});
 if(!started.success)throw Error('root rejected');
 const deadline=cooldowns.readyAt.get('source')?.get('meteor');
 const activation=started.events.find(e=>e.type==='skill-activated');if(!activation||activation.type!=='skill-activated')throw Error('no activation');
 dispatchSkillEffects(runtime,activation,env);
 advanceSkillEffects(runtime,100,env);advanceSkillExecution(slot,combat,100);
 source.baseStats.physicalAttack=999;
 advanceSkillEffects(runtime,1000,env);
 const value={instances:1+children.length,sharedS0:children.every(c=>c.rootOffense===activation.snapshot.rootOffense),bHits,cHits,radialDirections:new Set(directions).size,
  targetHp:target.currentHp,captures,mp:source.currentMp,actionSerial:slot.actionSerial,cooldownUnchanged:deadline===1000&&cooldowns.readyAt.get('source')?.get('meteor')===deadline&&cooldowns.readyAt.get('source')?.size===1,actionCompleted:slot.activeAction===undefined,intents:results.filter(r=>r.status==='accepted').length};
 clearSkillEffects(runtime);return value;
}
