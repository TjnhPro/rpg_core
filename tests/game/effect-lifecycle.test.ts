import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {EffectLifecycle,type EffectOperationResult,type EffectLifecycleEvent} from '../../src/shared/game/effect-lifecycle.js';
import type {CombatEntity} from '../../src/shared/game/combat-entity.js';
import type {EffectApplyRequest} from '../../src/shared/game/effect-system.js';
import {completeCombatAction,type CombatActionSlot} from '../../src/shared/game/combat-state.js';
import {fixture as skillFixture} from './fixtures/skill-core.js';
import {advanceSkillExecution,cancelSkillExecution} from '../../src/shared/game/skill-execution.js';
import {inheritSkillCooldowns} from '../../src/shared/game/skill-engine.js';

function fixture(){
 const entities:CombatEntity[]=['player','monster','monster'].map((type,i)=>({entityId:`actor${i}#1`,entityType:type as CombatEntity['entityType'],level:1,factionId:type,targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:10,currentMp:0}));
 const combat={findEntity:(id:string)=>entities.find(e=>e.entityId===id),relation:()=> 'enemy' as const};
 const request:EffectApplyRequest={effectId:'cry',sourceEntityId:entities[0]!.entityId,targetEntityId:entities[1]!.entityId,allowedTargetRelations:['enemy']};
 const definition={effectId:'cry',durationMs:100,stackingPolicy:'stack' as const,maxStacks:10};
 const runtime=new EffectLifecycle();
 return {entities,combat,request,definition,runtime,context:{combat,now:0}};
}
function accepted(r:EffectOperationResult){if(!r.success)throw Error(r.reason);return r;}
it('applies frozen independent instances with shared identities and no resource/stat writes',()=>{
 const f=fixture(),before=structuredClone(f.entities);
 const first=accepted(f.runtime.apply(f.request,f.definition,f.context,1));
 expect(first.events).toEqual([{type:'effect-applied',instance:first.instance,atMs:0}]);
 expect(first.instance?.effectInstanceId).toBe(JSON.stringify([f.request.sourceEntityId,1]));
 expect(first.instance?.expiresAt).toBe(100);expect(Object.isFrozen(first.instance)).toBe(true);
 accepted(f.runtime.apply(f.request,f.definition,f.context,2));
 accepted(f.runtime.apply({...f.request,targetEntityId:f.entities[2]!.entityId},f.definition,f.context,3));
 accepted(f.runtime.apply({...f.request,sourceEntityId:f.entities[1]!.entityId,targetEntityId:f.entities[0]!.entityId},f.definition,f.context,1));
 expect(f.runtime.instances()).toHaveLength(4);expect(f.runtime.instances(f.request.targetEntityId)).toHaveLength(2);
 const queried=f.runtime.instances() as unknown[];queried.pop();expect(f.runtime.instances()).toHaveLength(4);
 f.definition.durationMs=999;expect(first.instance?.expiresAt).toBe(100);expect(f.entities).toEqual(before);
});
it('rejects invalid definitions, targets, relation policy, time and identities without changing active effects',()=>{
 const f=fixture();accepted(f.runtime.apply(f.request,f.definition,f.context,1));const before=f.runtime.instances();
 for(const r of [
  f.runtime.apply(f.request,null,f.context,2),
  f.runtime.apply(f.request,{...f.definition,durationMs:0},f.context,2),
  f.runtime.apply({...f.request,targetEntityId:'missing'},f.definition,f.context,2),
  f.runtime.apply({...f.request,allowedTargetRelations:['ally']},f.definition,f.context,2),
  f.runtime.apply(f.request,f.definition,{...f.context,now:1},2),
  ...[0,-1,1.5,Infinity,NaN].map(serial=>f.runtime.apply(f.request,f.definition,f.context,serial))
 ])expect(r.success).toBe(false);
 f.entities[2]!.currentHp=0;
 expect(f.runtime.apply({...f.request,targetEntityId:f.entities[2]!.entityId},f.definition,f.context,2)).toEqual({success:false,reason:'target_defeated'});
 expect(f.runtime.instances()).toEqual(before);
 // Rejected identities are not consumed.
 accepted(f.runtime.apply(f.request,f.definition,f.context,2));expect(f.runtime.instances()).toHaveLength(2);
});
it('deduplicates accepted identity without refresh; conflicting latest receipt rejects and older/terminal retries are inert',()=>{
 const f=fixture(),first=accepted(f.runtime.apply(f.request,f.definition,f.context,1));
 accepted(f.runtime.advance(25,f.combat));
 expect(f.runtime.apply(f.request,f.definition,{...f.context,now:25},1)).toEqual({success:true,instance:first.instance,duplicate:true,events:[]});
 expect(f.runtime.apply({...f.request,targetEntityId:f.entities[2]!.entityId},f.definition,{...f.context,now:25},1)).toEqual({success:false,reason:'apply_identity_conflict'});
 expect(f.runtime.apply(f.request,{...f.definition,durationMs:200},{...f.context,now:25},1)).toEqual({success:false,reason:'apply_identity_conflict'});
 accepted(f.runtime.remove(first.instance!.effectInstanceId,25));
 expect(f.runtime.apply(f.request,f.definition,{...f.context,now:25},1)).toEqual({success:true,duplicate:true,events:[]});
 accepted(f.runtime.apply(f.request,f.definition,{...f.context,now:25},5));
 expect(f.runtime.apply(f.request,f.definition,{...f.context,now:25},4)).toEqual({success:true,duplicate:true,events:[]});
 accepted(f.runtime.advance(125,f.combat));
 expect(f.runtime.apply(f.request,f.definition,{...f.context,now:125},5)).toEqual({success:true,duplicate:true,events:[]});
});
it('expires at the exact boundary before same-tick hit reads and never emits twice',()=>{
 const f=fixture(),i=accepted(f.runtime.apply(f.request,f.definition,f.context,1)).instance!;
 expect(f.runtime.nextExpiration()).toBe(100);
 expect(accepted(f.runtime.advance(99.99,f.combat)).events).toEqual([]);expect(f.runtime.instances()).toHaveLength(1);
 expect(accepted(f.runtime.advance(100,f.combat)).events).toEqual([{type:'effect-expired',instance:i,atMs:100}]);
 // The same loop resolves hit AFTER advancing; it cannot see expired effects.
 expect(f.runtime.instances(i.targetEntityId)).toEqual([]);expect(f.runtime.nextExpiration()).toBe(Infinity);
 expect(accepted(f.runtime.advance(100,f.combat)).events).toEqual([]);
 expect(accepted(f.runtime.advance(1000,f.combat)).events).toEqual([]);
 expect(f.runtime.remove(i.effectInstanceId,1000)).toEqual({success:false,reason:'effect_not_active'});
});
it('explicit remove is terminal and repeated removal or update cannot resurrect it',()=>{
 const f=fixture(),i=accepted(f.runtime.apply(f.request,f.definition,f.context,1)).instance!;
 accepted(f.runtime.advance(50,f.combat));
 expect(accepted(f.runtime.remove(i.effectInstanceId,50)).events).toEqual([{type:'effect-removed',instance:i,atMs:50,reason:'explicit'}]);
 expect(f.runtime.remove(i.effectInstanceId,50)).toEqual({success:false,reason:'effect_not_active'});
 expect(f.runtime.remove('missing',50)).toEqual({success:false,reason:'effect_not_active'});
 expect(accepted(f.runtime.advance(200,f.combat)).events).toEqual([]);expect(f.runtime.instances()).toEqual([]);
});
it('source defeat/removal does not cancel effects; target defeat affects that target only',()=>{
 const f=fixture();accepted(f.runtime.apply(f.request,f.definition,f.context,1));
 accepted(f.runtime.apply({...f.request,targetEntityId:f.entities[2]!.entityId},f.definition,f.context,2));
 f.entities[0]!.currentHp=0;expect(accepted(f.runtime.advance(10,f.combat)).events).toEqual([]);
 // Emitted effect admission uses existing hit eligibility, not caster action admission.
 accepted(f.runtime.apply(f.request,f.definition,{...f.context,now:10},3));
 f.entities.splice(0,1);expect(accepted(f.runtime.advance(20,f.combat)).events).toEqual([]);
 f.entities[0]!.currentHp=0;
 const events=accepted(f.runtime.targetDefeated(f.entities[0]!.entityId,{combat:f.combat,now:20})).events;
 expect(events).toHaveLength(2);expect(events.every(e=>e.type==='effect-removed'&&e.reason==='target_defeated')).toBe(true);
 expect(f.runtime.instances()).toHaveLength(1);
 expect(accepted(f.runtime.targetDefeated(f.entities[0]!.entityId,{combat:f.combat,now:20})).events).toEqual([]);
 expect(accepted(f.runtime.advance(100,f.combat)).events.map(e=>e.type)).toEqual(['effect-expired']);
});
it('advance also cleans defeated targets, with expiration winning at the same timestamp',()=>{
 const f=fixture();accepted(f.runtime.apply(f.request,f.definition,f.context,1));f.entities[1]!.currentHp=0;
 expect(accepted(f.runtime.advance(100,f.combat)).events.map(e=>e.type)).toEqual(['effect-expired']);
 const g=fixture();accepted(g.runtime.apply(g.request,g.definition,g.context,1));g.entities[1]!.currentHp=0;
 expect(accepted(g.runtime.advance(50,g.combat)).events).toMatchObject([{type:'effect-removed',reason:'target_defeated',atMs:50}]);
 expect(accepted(g.runtime.advance(100,g.combat)).events).toEqual([]);
});
it('rejects backward/invalid clock and unadvanced operations without mutation',()=>{
 const f=fixture();accepted(f.runtime.apply(f.request,f.definition,f.context,1));accepted(f.runtime.advance(10,f.combat));
 for(const now of [9,-1,NaN,Infinity])expect(f.runtime.advance(now,f.combat)).toEqual({success:false,reason:'invalid_timeline'});
 expect(f.runtime.remove(f.runtime.instances()[0]!.effectInstanceId,100)).toEqual({success:false,reason:'invalid_timeline'});
 expect(f.runtime.targetDefeated('missing',{combat:f.combat,now:10})).toEqual({success:false,reason:'invalid_entity_context'});
 expect(f.runtime.targetDefeated(f.entities[1]!.entityId,{combat:f.combat,now:10})).toEqual({success:false,reason:'invalid_entity_context'});
 expect(f.runtime.dispose(9)).toEqual({success:false,reason:'invalid_timeline'});expect(f.runtime.instances()).toHaveLength(1);expect(f.runtime.now).toBe(10);
 expect(()=>new EffectLifecycle(NaN)).toThrow();
});
it('session cleanup is isolated, terminal, releases all instances and is idempotent',()=>{
 const f=fixture(),other=fixture();accepted(f.runtime.apply(f.request,f.definition,f.context,1));accepted(other.runtime.apply(other.request,other.definition,other.context,1));
 expect(accepted(f.runtime.dispose(50)).events).toMatchObject([{type:'effect-removed',reason:'session_cleanup',atMs:50}]);
 expect(f.runtime.instances()).toEqual([]);expect(f.runtime.active).toBe(false);expect(f.runtime.nextExpiration()).toBe(Infinity);
 expect(accepted(f.runtime.dispose(60)).events).toEqual([]);expect(f.runtime.now).toBe(50);
 expect(f.runtime.advance(60,f.combat)).toEqual({success:false,reason:'session_ended'});
 expect(f.runtime.apply(f.request,f.definition,{...f.context,now:50},1)).toEqual({success:false,reason:'session_ended'});
 expect(f.runtime.remove('missing',50)).toEqual({success:false,reason:'session_ended'});
 expect(other.runtime.instances()).toHaveLength(1);
 const g=fixture();accepted(g.runtime.apply(g.request,g.definition,g.context,1));expect(accepted(g.runtime.dispose(100)).events.map(e=>e.type)).toEqual(['effect-expired']);
});
it('skill completion and accepted loadout changes have no effect ownership or stat consequences',()=>{
 const f=fixture();accepted(f.runtime.apply(f.request,f.definition,f.context,1));
 const slot:CombatActionSlot={activeAction:{actionInstanceId:'action1',entityId:f.entities[0]!.entityId,actionId:'skill1',startedAt:0,durationMs:10,speedMultiplier:1}};
 expect(completeCombatAction(slot,10)).toBe(true);f.entities[0]!.baseStats.str=40;
 accepted(f.runtime.advance(10,f.combat));expect(f.runtime.instances()).toHaveLength(1);expect(f.entities[0]!.baseStats.str).toBe(40);
});
it('coarse/fine updates yield identical events, identities and terminal state with deterministic ordering',()=>{
 function run(step:number){
  const f=fixture(),events:EffectLifecycleEvent[]=[];
  events.push(...accepted(f.runtime.apply(f.request,{...f.definition,durationMs:100},f.context,2)).events);
  events.push(...accepted(f.runtime.apply({...f.request,sourceEntityId:f.entities[2]!.entityId},{...f.definition,durationMs:50},f.context,1)).events);
  for(let now=step;now<=200;now+=step)events.push(...accepted(f.runtime.advance(now,f.combat)).events);
  return {events,instances:f.runtime.instances(),now:f.runtime.now};
 }
 expect(run(200)).toEqual(run(10));expect(run(25)).toEqual(run(10));
});
it.each([0,1])('real Skill activation actor%i can request an effect that survives completion/loadout/caster defeat',caster=>{
 const f=skillFixture([],caster),effects=new EffectLifecycle(),definition={effectId:'temporary',durationMs:200};
 expect(f.start().success).toBe(true);
 accepted(effects.advance(50,f.context.combat));advanceSkillExecution(f.slot,f.context.combat,50,f.actions);
 const activation=f.actions.find(e=>e.type==='skill-activated');expect(activation).toBeDefined();
 // Test caller integration only: no new SkillGameplayEffect or dispatcher.
 const request:EffectApplyRequest={effectId:definition.effectId,sourceEntityId:f.context.casterId,targetEntityId:caster===0?'actor1':'actor0',allowedTargetRelations:['enemy']};
 const applied=accepted(effects.apply(request,definition,{combat:f.context.combat,now:50},1));
 advanceSkillExecution(f.slot,f.context.combat,100,f.actions);expect(f.slot.activeAction).toBeUndefined();
 inheritSkillCooldowns(f.cooldowns,f.context.casterId,1,100,[{outgoingSkillId:'test',incomingSkillId:'replacement'}]);
 f.modifiers[f.context.casterId]=[{id:'str',source:'equipment',sourceInstanceId:'item1',operation:'add_flat',target:'str',value:5,enabled:true,conditions:[]}];
 accepted(effects.advance(100,f.context.combat));expect(effects.instances()).toEqual([applied.instance]);
 f.entities[caster]!.currentHp=0;cancelSkillExecution(f.slot,100,'defeated',f.actions);
 expect(accepted(effects.advance(200,f.context.combat)).events).toEqual([]);
 expect(accepted(effects.advance(250,f.context.combat)).events.map(e=>e.type)).toEqual(['effect-expired']);
 expect(f.entities[caster]!.currentMp).toBe(95);
});
it('keeps lifecycle independent of damage, modifier calculation, skill dispatch and external runtime',()=>{
 const source=readFileSync('src/shared/game/effect-lifecycle.ts','utf8');
 expect(source).not.toMatch(/Date\.now|Math\.random|setTimeout|setInterval|GameState|calculateDamage|resolveModifiers|fetch\(|window\.|document\.|assetUrl/);
 for(const module of ['skill-engine','dot-core','combat-entity','modifier-core'])
  expect(readFileSync(`src/shared/game/${module}.ts`,'utf8')).not.toContain('effect-lifecycle');
});
