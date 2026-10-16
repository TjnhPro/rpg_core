import {expect,it} from 'vitest';
import {EffectLifecycle,type EffectStackConsumeRequest} from '../../src/effects/index.js';
import {fixture} from '../fixtures/skill-core.js';

function setup(){
 const f=fixture(),owner=new EffectLifecycle();
 const consumeContext=()=>({now:owner.now,combat:f.context.combat});
 const request:EffectStackConsumeRequest={sourceEntityId:'actor0',targetEntityId:'actor1',effectId:'mark',requiredStacks:2,allowedTargetRelations:['enemy']};
 const apply=(source='actor0',target='actor1',stack=true)=>owner.apply({effectId:'mark',sourceEntityId:source,targetEntityId:target,allowedTargetRelations:['enemy','ally']},
  {effectId:'mark',durationMs:100,stackingPolicy:stack?'stack':'refresh',maxStacks:5,restrictions:['silence'],modifiers:[{id:'armor',target:'armor',operation:'add_flat',value:1,enabled:true,conditions:[]}]},consumeContext(),owner.nextApplicationSerial(source));
 const plan=(patch:Partial<EffectStackConsumeRequest>={})=>{const r=owner.prepareConsumeStacks({...request,...patch},consumeContext());if(!r.success)throw Error(r.reason);return r.plan;};
 return {...f,owner,consumeContext,request,apply,plan};
}
it('S01/S02/S06: exact N removes stable identities/contributions, preserves surviving payloads and cap refresh',()=>{
 const f=setup();for(let i=0;i<5;i++)expect(f.apply().success).toBe(true);
 const before=f.owner.instances(),serial=f.owner.nextApplicationSerial('actor0'),plan=f.plan({requiredStacks:3});
 expect(plan.consumedInstanceIds).toEqual(before.slice(0,3).map(i=>i.effectInstanceId));
 const result=f.owner.consumeStacks(plan,f.consumeContext());expect(result).toMatchObject({success:true,consumedCount:3,remainingStacks:2,duplicate:false});
 if(!result.success)throw Error(result.reason);
 expect(result.events.map(e=>e.type==='effect-removed'&&e.reason)).toEqual(['consumed','consumed','consumed']);
 expect(f.owner.instances()).toEqual(before.slice(3));expect(f.owner.modifiers('actor1')).toHaveLength(2);expect(f.owner.hasRestriction('actor1','silence')).toBe(true);
 expect(f.owner.nextApplicationSerial('actor0')).toBe(serial);expect(Object.isFrozen(result.events)).toBe(true);expect(Object.isFrozen(result.consumedInstanceIds)).toBe(true);
 expect(f.owner.consumeStacks(f.plan(),f.consumeContext())).toMatchObject({success:true,remainingStacks:0});expect(f.owner.hasRestriction('actor1','silence')).toBe(false);
 for(let i=0;i<6;i++)f.apply();f.owner.advance(25,f.context.combat);f.apply();
 const refreshed=f.owner.instances();expect(refreshed).toHaveLength(5);expect(refreshed.every(i=>i.expiresAt===125)).toBe(true);
 expect(f.owner.consumeStacks(f.plan({requiredStacks:2}),f.consumeContext())).toMatchObject({success:true,remainingStacks:3});expect(f.owner.instances()).toEqual(refreshed.slice(2));
});
it('S03/S05: invalid/insufficient/wrong pool requests leave effects, contributions and application serial untouched',()=>{
 const f=setup();f.apply();f.apply();f.apply('actor3');f.apply('actor0','actor2');const before=f.owner.groups(),serial=f.owner.nextApplicationSerial('actor0');
 for(const patch of [{requiredStacks:3},{requiredStacks:0},{requiredStacks:-1},{requiredStacks:1.5},{requiredStacks:NaN},{requiredStacks:Infinity},{sourceEntityId:'missing'},{effectId:'other'},{targetEntityId:'missing'}])expect(f.owner.prepareConsumeStacks({...f.request,...patch},f.consumeContext()).success).toBe(false);
 expect(f.owner.groups()).toEqual(before);expect(f.owner.nextApplicationSerial('actor0')).toBe(serial);
 f.owner.consumeStacks(f.plan(),f.consumeContext());expect(f.owner.groups().map(g=>[g.sourceEntityId,g.targetEntityId,g.currentStacks])).toEqual([['actor0','actor2',1],['actor3','actor1',1]]);
 const g=setup();g.apply('actor0','actor1',false);expect(g.owner.prepareConsumeStacks({...g.request,requiredStacks:1},g.consumeContext())).toEqual({success:false,reason:'not_stack_policy'});
});
it('S04/S07: owner-issued plans reject forgery, cross-session, stale payload/clock and terminal owner; accepted replay is inert',()=>{
 const f=setup(),g=setup();f.apply();f.apply();g.apply();g.apply();const token=f.plan();
 expect(g.owner.consumeStacks(token,g.consumeContext())).toEqual({success:false,reason:'invalid_consume_plan'});
 expect(f.owner.consumeStacks({...token},f.consumeContext())).toEqual({success:false,reason:'invalid_consume_plan'});
 const first=f.owner.consumeStacks(token,f.consumeContext());expect(first.success).toBe(true);const before=f.owner.groups();
 expect(f.owner.consumeStacks(token,f.consumeContext())).toMatchObject({success:true,duplicate:true,events:[]});expect(f.owner.groups()).toEqual(before);
 f.apply();f.apply();const stale=f.plan();f.apply();expect(f.owner.consumeStacks(stale,f.consumeContext())).toEqual({success:false,reason:'stale_consume_plan'});expect(f.owner.instances()).toHaveLength(3);
 const expires=f.plan();f.owner.advance(100,f.context.combat);expect(f.owner.consumeStacks(expires,f.consumeContext())).toEqual({success:false,reason:'invalid_timeline'});expect(f.owner.groups()).toEqual([]);
 f.owner.dispose(100);expect(f.owner.consumeStacks(token,f.consumeContext())).toEqual({success:false,reason:'session_ended'});expect(f.owner.dispose(100)).toEqual({success:true,events:[]});expect(g.owner.instances()).toHaveLength(2);
});
it('S04/S07: refreshed selections, missing/replaced entities and defeated targets cannot commit stale plans',()=>{
 const f=setup();f.apply();f.apply();const refreshed=f.plan();f.apply();expect(f.owner.consumeStacks(refreshed,f.consumeContext()).success).toBe(false);
 const replaced=f.plan();f.entities[1]={...f.entities[1]!};expect(f.owner.consumeStacks(replaced,f.consumeContext())).toEqual({success:false,reason:'stale_consume_plan'});
 const defeated=f.plan();f.entities[1]!.currentHp=0;expect(f.owner.consumeStacks(defeated,f.consumeContext()).success).toBe(false);expect(f.owner.instances()).toHaveLength(3);
 f.owner.advance(0,f.context.combat);expect(f.owner.instances()).toEqual([]);
});
