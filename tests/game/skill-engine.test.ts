import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {defineSkill,validateSkillDefinition,validateSkillContext,type SkillExecutionContext} from '../../src/shared/game/skill-engine.js';
import {startCombatAction,type CombatActionSlot} from '../../src/shared/game/combat-state.js';
import type {CombatEntity} from '../../src/shared/game/combat-entity.js';

const definition={skillId:'dao-basic',targetMode:'entity',allowedTargetRelations:['enemy'],baseActionDurationMs:800,mpCost:0,cooldownMs:0,castRange:300,activationPercent:60};
const actors:CombatEntity[]=['player','monster'].map((type,i)=>({entityId:`actor${i}`,entityType:type as CombatEntity['entityType'],level:1,factionId:type,targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:10,currentMp:0}));
function context(caster=0):SkillExecutionContext{return {skillId:'dao-basic',casterId:actors[caster]!.entityId,target:{mode:'entity',casterId:actors[caster]!.entityId,targetId:actors[1-caster]!.entityId},combat:{findEntity:id=>actors.find(a=>a.entityId===id),relation:()=> 'enemy'}};}
it('accepts stable existing IDs and returns detached immutable gameplay data',()=>{
 const before=structuredClone(definition),r=defineSkill(definition);expect(r.success).toBe(true);
 if(!r.success)return;expect(r.definition).toEqual(definition);expect(Object.isFrozen(r.definition)).toBe(true);expect(Object.isFrozen(r.definition.allowedTargetRelations)).toBe(true);
 expect(r.definition.allowedTargetRelations).not.toBe(definition.allowedTargetRelations);expect(definition).toEqual(before);
});
it('rejects missing fields, invalid modes/relations/durations and asset data deterministically',()=>{
 for(const field of Object.keys(definition)){const d={...definition} as Record<string,unknown>;delete d[field];expect(defineSkill(d).success).toBe(false);}
 for(const patch of [{skillId:''},{skillId:' '},{targetMode:'nearest'},{allowedTargetRelations:[]},{allowedTargetRelations:['enemy','enemy']},{allowedTargetRelations:['neutral']},{baseActionDurationMs:0},{baseActionDurationMs:-1},{baseActionDurationMs:Infinity},{baseActionDurationMs:'800'},{icon:'asset.png'}]){
  const d={...definition,...patch};expect(validateSkillDefinition(d).length).toBeGreaterThan(0);expect(validateSkillDefinition(d)).toEqual(validateSkillDefinition(d));
 }
 expect(defineSkill(null).success).toBe(false);
});
it('Player and Monster share references, Targeting and existing action timing without a Skill runtime',()=>{
 const d=defineSkill(definition);if(!d.success)throw Error('fixture');
 for(const caster of [0,1]){
  const c=context(caster),slot:CombatActionSlot={};expect(validateSkillContext(d.definition,c)).toEqual({success:true});
  expect(startCombatAction(slot,{actorId:c.casterId,target:c.target,allowedRelations:d.definition.allowedTargetRelations,requiresLivingTarget:true},c.combat,d.definition.skillId,0,d.definition.baseActionDurationMs,2)).toEqual({allowed:true});
  expect(slot.activeAction!.durationMs).toBe(400);
 }
});
it('reports invalid references, mismatched identity and malformed ground targets without executing',()=>{
 expect(validateSkillContext(definition,null)).toEqual({success:false,reason:'invalid_context'});
 expect(validateSkillContext(definition,{...context(),currentHp:999})).toEqual({success:false,reason:'invalid_context'});
 expect(validateSkillContext(definition,{...context(),skillId:'missing'})).toEqual({success:false,reason:'skill_mismatch'});
 expect(validateSkillContext(definition,{...context(),casterId:'missing'})).toEqual({success:false,reason:'entity_not_found'});
 expect(validateSkillContext(definition,{...context(),target:{mode:'entity',casterId:'actor0',targetId:'missing'}})).toEqual({success:false,reason:'target_not_found'});
 const ground={...definition,targetMode:'ground'};
 expect(validateSkillContext(ground,{...context(),target:{mode:'ground',casterId:'actor0',position:{x:NaN,y:0}}})).toEqual({success:false,reason:'invalid_target_position'});
 expect(validateSkillContext({...definition,targetMode:'self'},{...context(),target:{mode:'self',casterId:'actor0'}})).toEqual({success:true});
 expect(validateSkillContext(ground,{...context(),target:{mode:'ground',casterId:'actor0',position:{x:0,y:1}}})).toEqual({success:true});
});
it('keeps foundation dependencies one-way and free from game policy/rendering/runtime',()=>{
 const source=readFileSync('src/shared/game/skill-engine.ts','utf8');
 const imports=[...source.matchAll(/from '([^']+)'/g)].map(m=>m[1]);expect(imports).toEqual(['./combat-state.js','./stat-calculation.js','./combat-entity.js','./combat-state.js','../data/skill-effects.js']);
 for(const name of ['combat-state','combat-entity','damage-core','defense-engine'])expect(readFileSync(`src/shared/game/${name}.ts`,'utf8')).not.toContain("from './skill-engine");
 expect(source).not.toMatch(/Date\.now|Math\.random|fetch\(|GameState|selectAutoSkill|assetUrl|window\.|document\./);
});
