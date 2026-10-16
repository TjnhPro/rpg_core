import {applyEntityManaGain} from '@rpg/core/combat';
import {createSkillEffectRuntime,createSkillCooldownState,executeSkill,dispatchSkillEffects,clearSkillEffects,damageDefinition,DEFAULT_DEFENSE_SETTINGS} from '@rpg/core';
import type {CombatEntity,SkillEngineDefinition,SkillEffectEnvironment,SkillExecutionSlot,EntityCombatEvent} from '@rpg/core';
import type {SkillManaOnHit} from '@rpg/core/skills';

/** Real packaged Root damage -> canonical MP gain, with strict public imports. */
export function manaOnHitExample(){
 const source:CombatEntity={entityId:'source',entityType:'player',level:1,factionId:'a',targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:50,currentMp:60};
 const target:CombatEntity={...source,entityId:'enemy',factionId:'b',currentHp:100};
 const combat={findEntity:(id:string)=>id===source.entityId?source:id===target.entityId?target:undefined,relation:()=> 'enemy' as const};
 const grid={cellSize:20,columns:20,rows:5,cells:Array(5).fill('1'.repeat(20)) as string[]};
 const position=(id:string)=>({x:id==='source'?30:80,y:50});
 const manaOnHit:SkillManaOnHit={amount:10};
 const skill:SkillEngineDefinition={skillId:'mana-on-hit',targetMode:'entity',allowedTargetRelations:['enemy'],baseActionDurationMs:100,activationPercent:0,castRange:200,mpCost:5,cooldownMs:1000,effects:[{type:'direct_hit',damage:{id:'component',definition:{...damageDefinition(1),base:10},damageType:'Physical',tags:['Basic','Direct','Physical'],rank:1},lifesteal:{rate:.25},manaOnHit}]};
 const defense=structuredClone(DEFAULT_DEFENSE_SETTINGS);defense.types.armorReduction.coefficients={baseK:100,levelPenalty:0};defense.types.magicReduction.coefficients={baseK:100,levelPenalty:0};
 const runtime=createSkillEffectRuntime(0,undefined,{offenseMode:'root'}),slot:SkillExecutionSlot={},cooldowns=createSkillCooldownState();
 const mana:Extract<EntityCombatEvent,{type:'mana-gained'}>[]=[],healing:Extract<EntityCombatEvent,{type:'healing-applied'}>[]=[],damage:Extract<EntityCombatEvent,{type:'damage-applied'}>[]=[];let captures=0;
 const env:SkillEffectEnvironment={combat,grid,position,entityIds:()=>['source','enemy'],snapshotDamage:()=>{throw Error('Root S0 required');},defenseStats:()=>({maxHp:100,armor:0,magicResistance:0,dodgeChance:0}),resourceStats:()=>({maxMana:100}),statuses:()=>[],criticalRoll:()=>.9,dodgeRoll:()=>.9,positionRoll:()=>.5,emit:e=>{if(e.type==='damage-applied'){if(source.currentHp!==55||source.currentMp!==65||target.currentHp!==80)throw Error('Coupled HP/MP commit must precede notifications');damage.push(e);}if(e.type==='healing-applied')healing.push(e);if(e.type==='mana-gained')mana.push(e);}};
 const started=executeSkill(skill,{skillId:skill.skillId,casterId:'source',target:{mode:'entity',casterId:'source',targetId:'enemy'},combat},slot,cooldowns,{grid,position,resolveStats:()=>({attackSpeed:1,cooldownReduction:0}),rootOffense:{runtime,capture:()=>{captures++;return {sources:{str:0,dex:0,int:0,vit:0,physicalAttack:10,magicAttack:0},modifiers:[],settings:{skills:{},modifiers:[]},criticalChance:0,criticalBonus:0,attacker:source,defenseConfig:{revision:1,settings:defense},options:[]};}}},{now:0,expectedSerial:1,configVersion:'v1'});
 if(!started.success)throw Error('Mana on Hit admission failed');const event=started.events.find(e=>e.type==='skill-activated');if(!event||event.type!=='skill-activated')throw Error('Activation missing');
 dispatchSkillEffects(runtime,event,env);const replay=dispatchSkillEffects(runtime,event,env);
 const result={primitive:applyEntityManaGain(95,10,100),sourceHp:source.currentHp,targetHp:target.currentHp,appliedDamage:damage[0]!.appliedDamage,healing,mana,captures,mp:source.currentMp,actionSerial:slot.actionSerial,replay};clearSkillEffects(runtime);return result;
}
