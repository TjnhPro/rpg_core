import {describe,it,expect} from 'vitest';
import {fixture,projectile,sequence,timed,direct,dot} from './fixtures/skill-core.js';
import {defineEffect,type EffectDefinition} from '../../src/effects/effect-system.js';
import {defineSkill} from '../../src/skills/skill-engine.js';
import {advanceSkillExecution,reconcileSkillRestrictions,type SkillActivatedEvent} from '../../src/skills/skill-execution.js';
import {advanceSkillEffects,dispatchSkillEffects,clearSkillEffects} from '../../src/skills/skill-effect-integration.js';
import {validateMovementIntent,startCombatAction,reconcileCombatRestrictions,completeCombatAction,type CombatActionSlot,type EntityCombatEvent} from '../../src/combat/combat-state.js';

const status=(restrictions:NonNullable<EffectDefinition['restrictions']>,durationMs=100):EffectDefinition=>({effectId:'arbitrary-id',durationMs,restrictions});
function apply(f:ReturnType<typeof fixture>,definition:EffectDefinition,source='actor1'){
 const r=f.runtime.effects.apply({effectId:definition.effectId,sourceEntityId:source,targetEntityId:f.context.casterId,allowedTargetRelations:['self','ally','enemy']},definition,{now:f.runtime.now,combat:f.context.combat},f.runtime.effects.nextApplicationSerial(source));
 expect(r.success).toBe(true);
 if(r.success){for(const e of r.events)f.env.emit(e);reconcileSkillRestrictions(f.slot,f.context.combat,f.runtime.now,f.actions);}
 return r;
}
const cancelled=(f:ReturnType<typeof fixture>)=>f.actions.filter(e=>e.type==='action-cancelled');

describe('RPG Core status restrictions',()=>{
 it('validates explicit restrictions and classification, never infers them from IDs',()=>{
  for(const restrictions of [[],['stun'],['silence'],['stun','silence']])expect(defineEffect(status(restrictions as NonNullable<EffectDefinition['restrictions']>)).success).toBe(true);
  for(const restrictions of ['stun',['slow'],['stun','stun'],[null],undefined])expect(defineEffect({...status([]),restrictions}).success).toBe(false);
  const f=fixture();for(const classification of ['basic','active'])expect(defineSkill({...f.definition,classification}).success).toBe(true);
  for(const classification of ['Basic',null,undefined])expect(defineSkill({...f.definition,classification}).success).toBe(false);
  const d={effectId:'stun',durationMs:100};apply(f,d);expect(f.start().success).toBe(true);
  const raw=status(['stun']);const frozen=defineEffect(raw);expect(frozen.success).toBe(true);
  if(frozen.success)expect(Object.isFrozen(frozen.definition.restrictions)).toBe(true);
 });
 it.each([0,1])('stun rejects basic/active and movement for shared actor %i without spending',index=>{
  const f=fixture([],index);apply(f,status(['stun','silence']));
  for(const classification of ['basic','active'] as const){f.definition.classification=classification;expect(f.start()).toMatchObject({success:false,reason:'stunned'});}
  expect(f.entities[index]!.currentMp).toBe(100);expect(f.cooldowns.readyAt.size).toBe(0);expect(f.slot.actionSerial).toBeUndefined();expect(f.actions).toEqual([]);
  expect(validateMovementIntent(f.context.casterId,f.context.combat)).toEqual({allowed:false,reason:'stunned'});
  advanceSkillEffects(f.runtime,100,f.env);expect(f.start(100).success).toBe(true);
 });
 it('cancels pending activation once at Apply, preserving cost/cooldown even after short stun expires',()=>{
  const f=fixture([projectile()]);f.definition.cooldownMs=500;expect(f.start().success).toBe(true);
  advanceSkillEffects(f.runtime,20,f.env);apply(f,status(['stun'],5));apply(f,status(['stun'],5));
  expect(cancelled(f)).toMatchObject([{reason:'interrupted',atMs:20}]);expect(f.slot.activeAction).toBeUndefined();expect(f.slot.skillExecution).toBeUndefined();
  advanceSkillEffects(f.runtime,100,f.env);advanceSkillExecution(f.slot,f.context.combat,100,f.actions);
  expect(f.actions.filter(e=>e.type==='skill-activated'||e.type==='action-completed')).toEqual([]);expect(f.runtime.bullets).toEqual([]);
  expect(f.entities[0]!.currentMp).toBe(95);expect(f.cooldowns.readyAt.get('actor0')?.get('test')).toBe(500);
  expect(f.start(100)).toMatchObject({success:false,reason:'skill_on_cooldown'});expect(f.start(500).success).toBe(true);
 });
 it('silence only rejects new active requests; running activation/completion and explicit basic continue',()=>{
  const f=fixture();expect(f.start().success).toBe(true);advanceSkillEffects(f.runtime,20,f.env);apply(f,status(['silence'],200));
  advanceSkillEffects(f.runtime,50,f.env);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);
  const event=f.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!;expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(true);
  advanceSkillEffects(f.runtime,100,f.env);advanceSkillExecution(f.slot,f.context.combat,100,f.actions);
  expect(cancelled(f)).toEqual([]);expect(f.actions.filter(e=>e.type==='action-completed')).toHaveLength(1);
  expect(f.start(100)).toMatchObject({success:false,reason:'silenced'});expect(f.entities[0]!.currentMp).toBe(95);expect(f.slot.actionSerial).toBe(1);
  f.definition.classification='basic';expect(f.start(100).success).toBe(true);expect(validateMovementIntent('actor0',f.context.combat)).toEqual({allowed:true});
  advanceSkillEffects(f.runtime,220,f.env);advanceSkillExecution(f.slot,f.context.combat,220,f.actions);f.definition.classification='active';expect(f.start(220).success).toBe(true);
 });
 it('overlap, stack/refresh snapshots and Slow reuse one owner/resolver through cleanup',()=>{
  const f=fixture([]),before=f.stats(f.entities[0]!).movementSpeedMultiplier,position=structuredClone(f.positions);
  const slow:EffectDefinition={effectId:'slow-custom',durationMs:30,restrictions:['silence'],modifiers:[{id:'slow',enabled:true,target:'movementSpeedMultiplier',operation:'add_percent',value:-.3,conditions:[]}]};
  apply(f,slow);expect(f.stats(f.entities[0]!).movementSpeedMultiplier).toBeCloseTo(before*.7);expect(f.positions).toEqual(position);
  apply(f,status(['stun'],40));apply(f,status(['stun'],80),'actor2');
  const stack={...status(['stun'],60),effectId:'stacked',stackingPolicy:'stack' as const,maxStacks:2};
  apply(f,stack);apply(f,{...stack,restrictions:['silence']});apply(f,{...stack,restrictions:[]});
  expect(f.runtime.effects.groups('actor0').find(g=>g.effectId==='stacked')?.currentStacks).toBe(2);
  advanceSkillEffects(f.runtime,40,f.env);expect(f.runtime.effects.hasRestriction('actor0','stun')).toBe(true);expect(f.stats(f.entities[0]!).movementSpeedMultiplier).toBe(before);
  const group=f.runtime.effects.groups('actor0').find(g=>g.effectId==='stacked')!;
  f.runtime.effects.remove(group.instanceIds[0]!,40);expect(f.runtime.effects.hasRestriction('actor0','silence')).toBe(true);
  f.entities[2]!.currentHp=0;advanceSkillEffects(f.runtime,60,f.env);expect(f.runtime.effects.hasRestriction('actor0','stun')).toBe(true); // source death retains
  advanceSkillEffects(f.runtime,80,f.env);expect(f.runtime.effects.hasRestriction('actor0','stun')).toBe(false);expect(f.runtime.effects.hasRestriction('actor0','silence')).toBe(false);
  apply(f,status(['stun','silence']));f.entities[0]!.currentHp=0;advanceSkillEffects(f.runtime,80,f.env);expect(f.runtime.effects.instances('actor0')).toEqual([]);
  f.entities[0]!.currentHp=100;apply(f,status(['stun']));clearSkillEffects(f.runtime,f.env);expect(f.runtime.effects.hasRestriction('actor0','stun')).toBe(false);
 });
 it('same-tick order preserves already emitted projectile, timed object, sequence and DoT',()=>{
  const run=(stunFirst:boolean)=>{
   const hit=direct();hit.onHit=[dot()];const f=fixture([projectile(),timed(),sequence(),hit]);f.start();advanceSkillEffects(f.runtime,50,f.env);
   if(stunFirst)apply(f,status(['stun']));
   advanceSkillExecution(f.slot,f.context.combat,50,f.actions);
   for(const e of f.actions)if(e.type==='skill-activated')dispatchSkillEffects(f.runtime,e,f.env);
   if(!stunFirst)apply(f,status(['stun']));
   const counts=[f.runtime.bullets.length,f.runtime.objects.length,f.runtime.sequences.length,f.runtime.dots.groups.length];
   advanceSkillEffects(f.runtime,600,f.env);advanceSkillExecution(f.slot,f.context.combat,600,f.actions);
   return {counts,actions:f.actions,hits:f.hits(),hp:f.entities.map(e=>e.currentHp)};
  };
  const before=run(true);expect(before.counts).toEqual([0,0,0,0]);expect(before.hits).toEqual([]);
  const after=run(false);expect(after.counts).toEqual([1,1,1,1]);
  for(const mechanic of ['projectile','timed_aoe_sequence','dot'])expect(after.hits.some(h=>h.mechanic===mechanic)).toBe(true);
  expect(after.actions.filter(e=>e.type==='action-cancelled')).toHaveLength(1);expect(after.actions.some(e=>e.type==='action-completed')).toBe(false);expect(run(false)).toEqual(after);
 });
 it('generic Combat cancellation and defeat ordering use one terminal action, no new state',()=>{
  const f=fixture([]),slot:CombatActionSlot={},events:EntityCombatEvent[]=[];
  expect(startCombatAction(slot,{actorId:'actor0',classification:'basic',target:f.context.target,requiresLivingTarget:true,allowedRelations:['enemy']},f.context.combat,'anything',0,100,1,events).allowed).toBe(true);
  apply(f,status(['stun']));f.entities[0]!.currentHp=0;
  expect(reconcileCombatRestrictions(slot,f.context.combat,0,events)).toBe(true);expect(reconcileCombatRestrictions(slot,f.context.combat,0,events)).toBe(false);expect(completeCombatAction(slot,100,events)).toBe(false);
  expect(events.filter(e=>e.type==='action-cancelled')).toMatchObject([{reason:'defeated'}]);
 });
 it('Skill modifier_effect dispatch immediately reconciles the existing actor slot',()=>{
  const f=fixture([{type:'modifier_effect',target:'self',definition:status(['stun'],5),allowedTargetRelations:['self']}]);
  f.activate(); // Apply at activation 50, not a later frame / completion at100
  expect(f.slot.activeAction).toBeUndefined();expect(f.slot.skillExecution).toBeUndefined();
  expect(f.events.filter(e=>e.type==='action-cancelled')).toMatchObject([{atMs:50,reason:'interrupted'}]);
  expect(f.events.map(e=>e.type)).toEqual(['effect-applied','action-cancelled']);
  advanceSkillEffects(f.runtime,100,f.env);advanceSkillExecution(f.slot,f.context.combat,100,f.actions);
  expect(f.actions.some(e=>e.type==='action-completed')).toBe(false);expect(f.entities[0]!.currentMp).toBe(95);
 });
 it('refresh replaces restriction payload but capped stack reapplication retains each snapshot',()=>{
  const f=fixture([]);apply(f,status(['stun']));apply(f,status(['silence']));
  expect(f.runtime.effects.hasRestriction('actor0','stun')).toBe(false);expect(f.runtime.effects.hasRestriction('actor0','silence')).toBe(true);
  const stack={...status(['stun']),effectId:'independent',stackingPolicy:'stack' as const,maxStacks:1};
  apply(f,stack);advanceSkillEffects(f.runtime,40,f.env);apply(f,{...stack,restrictions:[]});
  expect(f.runtime.effects.hasRestriction('actor0','stun')).toBe(true);
  advanceSkillEffects(f.runtime,100,f.env);expect(f.runtime.effects.hasRestriction('actor0','silence')).toBe(false);expect(f.runtime.effects.hasRestriction('actor0','stun')).toBe(true);
  advanceSkillEffects(f.runtime,140,f.env);expect(f.start(140).success).toBe(true);
 });
 it('stun followed by defeat and repeated reconciliation never adds another terminal event',()=>{
  const f=fixture();f.start();apply(f,status(['stun']));f.entities[0]!.currentHp=0;
  advanceSkillEffects(f.runtime,0,f.env);reconcileSkillRestrictions(f.slot,f.context.combat,0,f.actions);advanceSkillExecution(f.slot,f.context.combat,100,f.actions);
  expect(cancelled(f)).toMatchObject([{reason:'interrupted'}]);expect(f.actions.some(e=>e.type==='action-completed'||e.type==='skill-activated')).toBe(false);
  expect(f.runtime.effects.instances('actor0')).toEqual([]);
 });
});
