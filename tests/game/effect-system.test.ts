import {readCoreSource} from './fixtures/source.js';
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {defineEffect,validateEffectDefinition,validateEffectInstance,validateEffectApplyRequest,
 type EffectApplyRequest,type EffectInstance,type EffectLifecycleResult,type EffectModifierSource} from '../../src/effects/effect-system.js';
import type {CombatEntity} from '../../src/combat/combat-entity.js';
import type {CombatValidationContext} from '../../src/combat/combat-state.js';
import {collectActiveModifiers,resolveModifiers} from '../../src/modifiers/modifier-core.js';
import type {CombatModifier} from '../../src/contracts/combat-modifiers.js';

const definition={effectId:'battle_cry_buff',durationMs:10000};
function fixture(){
 const entities:CombatEntity[]=['player','monster','monster'].map((type,i)=>({entityId:`actor${i}#generation1`,entityType:type as CombatEntity['entityType'],level:1,factionId:type,targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:10,currentMp:0}));
 const combat:CombatValidationContext={findEntity:id=>entities.find(e=>e.entityId===id),relation:()=> 'enemy'};
 const instance:EffectInstance={effectInstanceId:'session1/effect1',effectId:definition.effectId,sourceEntityId:entities[0]!.entityId,targetEntityId:entities[1]!.entityId,appliedAt:5000,expiresAt:15000};
 const request:EffectApplyRequest={effectId:instance.effectId,sourceEntityId:instance.sourceEntityId,targetEntityId:instance.targetEntityId,allowedTargetRelations:['enemy']};
 return {entities,combat,instance,request};
}
it('creates detached immutable minimal gameplay definitions without touching input',()=>{
 const input={...definition},result=defineEffect(input);expect(result.success).toBe(true);
 if(!result.success)throw Error('fixture');
 expect(result.definition).toEqual(input);expect(result.definition).not.toBe(input);expect(Object.isFrozen(result.definition)).toBe(true);
 input.durationMs=20;expect(result.definition.durationMs).toBe(10000);
 expect(()=>Object.assign(result.definition,{durationMs:10})).toThrow();
});
it.each([undefined,null,[],{}, {durationMs:10},{...definition,effectId:''},{...definition,effectId:' spaced '}])('rejects invalid definition/identity %j',value=>{
 expect(defineEffect(value).success).toBe(false);expect(validateEffectDefinition(value)).toEqual(validateEffectDefinition(value));
});
it.each([0,-1,NaN,Infinity,-Infinity,'1000',undefined])('rejects non-positive/non-finite duration %s',durationMs=>{
 expect(defineEffect({...definition,durationMs})).toEqual({success:false,reason:'invalid_duration'});
});
it('rejects art, computed stats and unsupported future fields rather than adopting them',()=>{
 for(const patch of [{assetPath:'sprite.webp'},{skillId:'cry'},{modifiers:{}},{stackLimit:3},{effectiveStats:{}},{version:1}])
  expect(defineEffect({...definition,...patch}).success).toBe(false);
});
it('validates definition references, instance identities and exact gameplay-only fields',()=>{
 const {instance,combat}=fixture();expect(validateEffectInstance(instance,definition,combat)).toEqual({success:true});
 expect(validateEffectInstance(instance,undefined,combat)).toEqual({success:false,reason:'missing_effect_definition'});
 expect(validateEffectInstance(instance,{...definition,effectId:'other'},combat)).toEqual({success:false,reason:'missing_effect_definition'});
 expect(validateEffectInstance({...instance,effectId:''},definition,combat)).toEqual({success:false,reason:'invalid_effect_id'});
 expect(validateEffectInstance(instance,{...definition,durationMs:0},combat)).toEqual({success:false,reason:'invalid_duration'});
 for(const patch of [{effectInstanceId:''},{effectInstanceId:' '},{effectiveStats:{}},{status:'active'},{assetId:'ani001'}])
  expect(validateEffectInstance({...instance,...patch},definition,combat).success).toBe(false);
 for(const field of Object.keys(instance)){const input={...instance} as Record<string,unknown>;delete input[field];expect(validateEffectInstance(input,definition,combat).success).toBe(false);}
});
it('accepts independent instances of one definition across multiple sources/targets and actor types',()=>{
 const {instance,entities,combat}=fixture(),before=structuredClone(entities);
 for(const [index,source,target] of [[1,0,1],[2,0,2],[3,2,1],[4,1,0],[5,1,1],[6,0,1]]){
  const candidate={...instance,effectInstanceId:`effect${index}`,sourceEntityId:entities[source!]!.entityId,targetEntityId:entities[target!]!.entityId};
  expect(validateEffectInstance(candidate,definition,combat)).toEqual({success:true});
 }
 expect(entities).toEqual(before);expect(Object.keys(instance).sort()).toEqual(['effectInstanceId','effectId','sourceEntityId','targetEntityId','appliedAt','expiresAt'].sort());
});
it('validates trusted CombatEntity references but not liveness/faction admission or lifecycle',()=>{
 const {instance,entities,combat}=fixture();entities[0]!.currentHp=0;
 expect(validateEffectInstance(instance,definition,combat)).toEqual({success:true});
 expect(validateEffectInstance(instance,definition,{...combat,relation:()=>undefined})).toEqual({success:true});
 for(const patch of [{sourceEntityId:'missing'},{targetEntityId:'missing'},{targetEntityId:''}])
  expect(validateEffectInstance({...instance,...patch},definition,combat)).toEqual({success:false,reason:'invalid_entity_context'});
 expect(validateEffectInstance(instance,definition,{...combat,findEntity:()=>entities[2]})).toEqual({success:false,reason:'invalid_entity_context'});
 entities[0]!.currentMp=NaN;expect(validateEffectInstance(instance,definition,combat)).toEqual({success:false,reason:'invalid_entity_context'});
});
it('uses exact caller simulation timestamps including fractional duration, rejecting overflow/precision loss',()=>{
 const {instance,combat}=fixture();
 for(const patch of [{appliedAt:-1},{appliedAt:NaN},{expiresAt:Infinity},{expiresAt:14999},{appliedAt:Infinity},{appliedAt:1e308,expiresAt:Infinity},{appliedAt:1e308,expiresAt:1e308}])
  expect(validateEffectInstance({...instance,...patch},definition,combat)).toEqual({success:false,reason:'invalid_timeline'});
 const fractional={...definition,durationMs:0.25},data={...instance,appliedAt:0.5,expiresAt:0.75};
 expect(validateEffectInstance(data,fractional,combat)).toEqual({success:true});
 expect(validateEffectInstance(data,fractional,combat)).toEqual(validateEffectInstance(data,fractional,combat));
});
it('prepares apply references and relation policy without executing or bypassing future admission',()=>{
 const {request,combat,entities}=fixture(),before=structuredClone(entities),context={combat,now:5000};
 expect(validateEffectApplyRequest(request,definition,context)).toEqual({success:true});
 // Validation is not eligibility: missing faction relation/defeated source need
 // actual Combat admission in v0.9.1, not an implicit Foundation policy.
 entities[0]!.currentHp=0;
 expect(validateEffectApplyRequest(request,definition,{...context,combat:{...combat,relation:()=>undefined}})).toEqual({success:true});
 for(const patch of [{allowedTargetRelations:[]},{allowedTargetRelations:['neutral']},{allowedTargetRelations:['enemy','enemy']},{skillId:'cry'}])
  expect(validateEffectApplyRequest({...request,...patch},definition,context).success).toBe(false);
 expect(validateEffectApplyRequest(request,null,context)).toEqual({success:false,reason:'missing_effect_definition'});
 expect(validateEffectApplyRequest({...request,targetEntityId:'missing'},definition,context)).toEqual({success:false,reason:'invalid_entity_context'});
 for(const now of [-1,NaN,Infinity,1e308])expect(validateEffectApplyRequest(request,definition,{combat,now})).toEqual({success:false,reason:'invalid_timeline'});
 entities[0]!.currentHp=before[0]!.currentHp;expect(entities).toEqual(before);
});
it('represents mutually exclusive lifecycle outcomes and reuses existing buff source identity/resolver',()=>{
 const {instance}=fixture();
 const outcomes:EffectLifecycleResult[]=[{phase:'active',instance,atMs:5000},{phase:'expired',instance,atMs:15000},{phase:'removed',instance,atMs:7000}];
 expect(outcomes.map(o=>o.phase)).toEqual(['active','expired','removed']);
 // @ts-expect-error Two terminal phases cannot be represented together.
 const impossible:EffectLifecycleResult={phase:['expired','removed'],instance,atMs:10000};void impossible;
 const source:EffectModifierSource={source:'buff',sourceInstanceId:instance.effectInstanceId};
 const modifier:CombatModifier={...source,id:'str-flat',target:'str',operation:'add_flat',value:2,enabled:true,conditions:[]};
 const active=collectActiveModifiers([modifier],{buffs:new Set([source.sourceInstanceId])});
 expect(resolveModifiers(10,'str',active).value).toBe(12);
 expect(collectActiveModifiers([modifier],{buffs:new Set()})).toEqual([]);
 // This test supplies the source externally, NOT effect modifier application.
});
it('keeps dependencies one-way, has no runtime store/scheduler and does not replace damage/DoT/skill dispatch',()=>{
 const source=readFileSync('src/effects/effect-system.ts','utf8');
 expect([...source.matchAll(/from '([^']+)'/g)].map(m=>m[1])).toEqual(['../contracts/effects.js','../contracts/effects.js','../combat/combat-entity.js','../combat/combat-entity.js','../combat/combat-state.js','../contracts/combat-modifiers.js','../contracts/stat-contracts.js']);
 expect(source).not.toMatch(/Date\.now|Math\.random|setInterval|setTimeout|GameState|fetch\(|window\.|document\.|assetUrl|new Map|calculateDamage|resolveModifiers\(/);
 for(const file of ['combat-entity','modifier-core','stat-calculation','dot-core','skill-engine','skill-execution'])
  expect(readCoreSource(file)).not.toMatch(/from ['"].*effect-system/);
 expect(readFileSync('src/contracts/combat-modifiers.ts','utf8')).not.toContain('effect-system');
});
