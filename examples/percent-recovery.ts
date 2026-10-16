import {createSkillEffectRuntime,createSkillCooldownState,executeSkill,dispatchSkillEffects,clearSkillEffects,DEFAULT_DEFENSE_SETTINGS} from '@rpg/core';
import type {CombatEntity,SkillEngineDefinition,SkillEffectEnvironment,SkillExecutionSlot,EntityCombatEvent} from '@rpg/core';

/** Percent HP/MP restoration with actual caps through the installed public package. */
export function percentRecoveryExample(capped=false){
 const source:CombatEntity={entityId:'source',entityType:'player',level:1,factionId:'a',targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:capped?950:400,currentMp:capped?450:100};
 const combat={findEntity:(id:string)=>id==='source'?source:undefined,relation:()=> 'ally' as const};
 const grid={cellSize:20,columns:20,rows:5,cells:Array(5).fill('1'.repeat(20)) as string[]},position=()=>({x:30,y:50});
 const skill:SkillEngineDefinition={skillId:'restore',targetMode:'self',allowedTargetRelations:['self'],baseActionDurationMs:100,activationPercent:0,castRange:200,mpCost:10,cooldownMs:1000,effects:[{type:'heal',target:'self',amount:{percentOfMax:.2}},{type:'restore_mana',target:'self',amount:{percentOfMax:.3}}]};
 const runtime=createSkillEffectRuntime(0,undefined,{offenseMode:'root'}),slot:SkillExecutionSlot={},cooldowns=createSkillCooldownState();
 const events:EntityCombatEvent[]=[],resources:number[][]=[],recipients:string[]=[];let captures=0,rolls=0;
 const env:SkillEffectEnvironment={combat,grid,position,entityIds:()=>['source'],snapshotDamage:()=>{throw Error('Restore must not snapshot Damage');},defenseStats:()=>({maxHp:1000,armor:0,magicResistance:0,dodgeChance:0}),resourceStats:recipient=>{recipients.push(recipient.entityId);return {maxMana:500};},statuses:()=>[],criticalRoll:()=>{rolls++;return .9;},dodgeRoll:()=>{rolls++;return .9;},positionRoll:()=>{rolls++;return .5;},emit:e=>{if(e.type==='healing-applied'||e.type==='mana-gained'){events.push(e);resources.push([source.currentHp,source.currentMp]);}else throw Error('Unexpected restoration event');}};
 const started=executeSkill(skill,{skillId:skill.skillId,casterId:'source',target:{mode:'self',casterId:'source'},combat},slot,cooldowns,{grid,position,resolveStats:()=>({attackSpeed:1,cooldownReduction:0}),rootOffense:{runtime,capture:()=>{captures++;return {sources:{str:0,dex:0,int:0,vit:0,physicalAttack:0,magicAttack:0},modifiers:[],settings:{skills:{},modifiers:[]},criticalChance:0,criticalBonus:0,attacker:source,defenseConfig:{revision:1,settings:DEFAULT_DEFENSE_SETTINGS},options:[]};}}},{now:0,expectedSerial:1,configVersion:'v1'});
 if(!started.success)throw Error('Restore admission failed');const event=started.events.find(e=>e.type==='skill-activated');if(!event||event.type!=='skill-activated')throw Error('Activation missing');
 dispatchSkillEffects(runtime,event,env);const replay=dispatchSkillEffects(runtime,event,env);
 const result={hp:source.currentHp,mp:source.currentMp,events,resources,recipients,captures,rolls,actionSerial:slot.actionSerial,cooldown:cooldowns.readyAt.get('source')!.get('restore'),replay};clearSkillEffects(runtime);return result;
}
