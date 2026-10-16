import {applyEntityHealing} from '@rpg/core/combat';
import {createSkillEffectRuntime,createSkillCooldownState,executeSkill,dispatchSkillEffects,advanceSkillEffects,clearSkillEffects,pinSkillInstanceDefinition,pinSkillTriggerBundle,inspectSkillInstance,DEFAULT_DEFENSE_SETTINGS} from '@rpg/core';
import type {CombatEntity,EntityCombatEvent,SkillEngineDefinition,SkillEffectEnvironment,SkillExecutionSlot,SkillTriggerResult} from '@rpg/core';

/** Public installed-package HP transition plus actual Root/Child Healing. */
export function healingExample(){
 const primitive=applyEntityHealing(90,30,100);
 const source:CombatEntity={entityId:'source',entityType:'player',level:1,factionId:'a',targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:50,currentMp:100};
 const target:CombatEntity={...source,entityId:'ally',currentHp:90};
 const combat={findEntity:(id:string)=>id===source.entityId?source:id===target.entityId?target:undefined,relation:()=> 'ally' as const};
 const grid={cellSize:20,columns:20,rows:5,cells:Array(5).fill('1'.repeat(20)) as string[]};
 const position=(id:string)=>({x:id==='source'?30:80,y:50});
 const root:SkillEngineDefinition={skillId:'heal',targetMode:'entity',allowedTargetRelations:['ally'],baseActionDurationMs:100,activationPercent:0,castRange:200,mpCost:5,cooldownMs:1000,effects:[{type:'heal',target:'selected',amount:30}]};
 const child:SkillEngineDefinition={...root,skillId:'child',targetMode:'self',allowedTargetRelations:['self'],effects:[{type:'heal',target:'self',amount:100}]};
 const bundle=pinSkillTriggerBundle({version:'v1',rootSkillId:'heal',definitions:[pinSkillInstanceDefinition(root,'v1',100),pinSkillInstanceDefinition(child,'child',100)],links:[{linkId:'expiry',sourceSkillId:'heal',childSkillId:'child',trigger:'OnExpire',delayMs:0,maxOccurrences:1}]});
 const runtime=createSkillEffectRuntime(0,undefined,{offenseMode:'root',instanceSession:'healing-consumer'});
 const events:Extract<EntityCombatEvent,{type:'healing-applied'}>[]=[],results:SkillTriggerResult[]=[];let captures=0,rolls=0;
 const env:SkillEffectEnvironment={combat,grid,position,entityIds:()=>['source','ally'],snapshotDamage:()=>{throw Error('Healing must not snapshot damage');},defenseStats:()=>({maxHp:100,armor:0,magicResistance:0,dodgeChance:0}),statuses:()=>[],criticalRoll:()=>{rolls++;return .9;},dodgeRoll:()=>{rolls++;return .9;},positionRoll:()=>{rolls++;return .5;},emit:e=>{if(e.type==='healing-applied'){if(combat.findEntity(e.entityId)!.currentHp!==e.after)throw Error('HP must commit before event');events.push(e);}}};
 const slot:SkillExecutionSlot={},cooldowns=createSkillCooldownState();
 const started=executeSkill(root,{skillId:'heal',casterId:'source',target:{mode:'entity',casterId:'source',targetId:'ally'},combat},slot,cooldowns,{grid,position,resolveStats:()=>({attackSpeed:1,cooldownReduction:0}),skillInstanceLifetimeMs:100,triggers:{bundle,executeChildren:true,observe:r=>results.push(r)},rootOffense:{runtime,capture:()=>{captures++;return {sources:{str:0,dex:0,int:0,vit:0,physicalAttack:0,magicAttack:0},modifiers:[],settings:{skills:{},modifiers:[]},criticalChance:0,criticalBonus:0,attacker:source,defenseConfig:{revision:1,settings:DEFAULT_DEFENSE_SETTINGS},options:[]};}}},{now:0,expectedSerial:1,configVersion:'v1'});
 if(!started.success)throw Error('Healing admission failed');
 const activation=started.events.find(e=>e.type==='skill-activated');if(!activation||activation.type!=='skill-activated')throw Error('Activation missing');
 dispatchSkillEffects(runtime,activation,env);const duplicate=dispatchSkillEffects(runtime,activation,env);advanceSkillEffects(runtime,100,env);
 const receipt=results[0]?.receipt;if(!receipt)throw Error('Child missing');
 const view=inspectSkillInstance(runtime,receipt.receiptId)!;
 const result={primitive,targetHp:target.currentHp,sourceHp:source.currentHp,events,captures,rolls,mp:source.currentMp,actionSerial:slot.actionSerial,cooldown:cooldowns.readyAt.get('source')!.get('heal'),children:results.length,sharedS0:view.rootOffense===activation.snapshot.rootOffense,duplicate};clearSkillEffects(runtime);return result;
}
