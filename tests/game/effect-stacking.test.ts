import {expect,it} from 'vitest';
import {EffectLifecycle,type EffectOperationResult} from '../../src/effects/effect-lifecycle.js';
import {defineEffect,validateEffectInstance,type EffectDefinition,type EffectModifier} from '../../src/effects/effect-system.js';
import {prepareModifierResolver} from '../../src/modifiers/modifier-core.js';
import {fixture} from './fixtures/skill-core.js';

const m=(value:number,target='str'):EffectModifier=>({id:'bonus',target,value,operation:'add_flat',enabled:true,conditions:[]});
const d=(value=2,stack=false):EffectDefinition=>({effectId:'rage',durationMs:100,modifiers:[m(value)],...(stack?{stackingPolicy:'stack',maxStacks:2}: {})});
const ok=(r:EffectOperationResult)=>{if(!r.success)throw Error(r.reason);return r;};
function setup(){
 const f=fixture(),owner=new EffectLifecycle();
 const apply=(definition=d(),serial=owner.nextApplicationSerial('actor0'),source='actor0',target='actor1')=>
  owner.apply({effectId:definition.effectId,sourceEntityId:source,targetEntityId:target,allowedTargetRelations:['self','ally','enemy']},definition,{combat:f.context.combat,now:owner.now},serial);
 const advance=(now:number)=>ok(owner.advance(now,f.context.combat));
 return {...f,owner,apply,advance};
}
it('validates only refresh/stack and finite positive integer maxima, default refresh is one',()=>{
 for(const patch of [{stackingPolicy:'strongest'},{stackingPolicy:null},{stackingPolicy:'stack'},{stackingPolicy:'stack',maxStacks:0},{stackingPolicy:'stack',maxStacks:1.5},{stackingPolicy:'stack',maxStacks:Infinity},{maxStacks:NaN}])
  expect(defineEffect({...d(),...patch}).success).toBe(false);
 for(const definition of [d(),d(2,true),{...d(),stackingPolicy:'refresh',maxStacks:20}])expect(defineEffect(definition).success).toBe(true);
 const f=setup();ok(f.apply({...d(),maxStacks:20}));expect(f.owner.groups()[0]).toMatchObject({stackingPolicy:'refresh',maxStacks:1,currentStacks:1});
});
it('refresh preserves identity and creation time, replaces deeply frozen payload, renews once',()=>{
 const f=setup(),first=ok(f.apply()).instance!,old=f.owner.modifiers('actor1');f.advance(60);
 const def=d(9),renewed=ok(f.apply(def,2));
 expect(renewed.events.map(e=>e.type)).toEqual(['effect-refreshed']);expect(renewed.instance).toMatchObject({effectInstanceId:first.effectInstanceId,appliedAt:0,refreshedAt:60,expiresAt:160});
 expect(f.owner.instances()).toHaveLength(1);expect(f.owner.modifiers('actor1').map(x=>x.value)).toEqual([9]);expect(old[0]!.value).toBe(2);
 def.modifiers![0]!.value=99;expect(f.owner.modifiers('actor1')[0]!.value).toBe(9);
 f.advance(80);expect(ok(f.apply(d(9),2))).toMatchObject({duplicate:true,events:[]});expect(ok(f.apply(d(),1))).toEqual({success:true,duplicate:true,events:[]});
 expect(f.owner.nextExpiration()).toBe(160);expect(validateEffectInstance(f.owner.instances()[0],d(9),f.context.combat).success).toBe(true);
 expect(f.advance(160).events.map(e=>e.type)).toEqual(['effect-expired']);expect(f.advance(200).events).toEqual([]);
});
it('stack snapshots separately; below/at max renews the whole group without changing old payloads',()=>{
 const f=setup(),first=ok(f.apply(d(2,true))).instance!;f.advance(30);
 expect(ok(f.apply(d(5,true),2)).events.map(e=>e.type)).toEqual(['effect-applied']);expect(f.owner.instances().map(i=>i.expiresAt)).toEqual([130,130]);
 const snapshots=f.owner.modifiers('actor1');expect(snapshots.map(x=>x.value)).toEqual([2,5]);
 f.advance(60);const def={...d(999,true),durationMs:200};const result=ok(f.apply(def,3));
 expect(result.events.map(e=>e.type)).toEqual(['effect-stack-refreshed']);expect(f.owner.instances()).toHaveLength(2);
 expect(f.owner.modifiers('actor1')).toEqual(snapshots);expect(f.owner.instances().map(i=>i.expiresAt)).toEqual([260,260]);
 for(const instance of f.owner.instances())expect(validateEffectInstance(instance,def,f.context.combat).success).toBe(true);
 expect(f.owner.groups()[0]).toMatchObject({currentStacks:2,maxStacks:2,remainingDurationMs:200});
 expect(prepareModifierResolver(f.owner.modifiers('actor1'))(10,'str').value).toBe(17);
 f.advance(80);expect(ok(f.apply(def,3))).toMatchObject({duplicate:true,events:[]});expect(f.owner.nextExpiration()).toBe(260);
 expect(f.owner.remove(first.effectInstanceId,80).success).toBe(true);expect(f.owner.groups()[0]!.currentStacks).toBe(1);
 expect(ok(f.apply(d(7,true),4)).events.map(e=>e.type)).toEqual(['effect-applied']);expect(f.owner.modifiers('actor1').map(x=>x.value)).toEqual([5,7]);
 expect(f.owner.instances().map(i=>i.expiresAt)).toEqual([180,180]);expect(f.advance(180).events).toHaveLength(2);
 expect(f.owner.groups()).toEqual([]);expect(f.owner.modifiers('actor1')).toEqual([]);expect(f.advance(200).events).toEqual([]);
});
it('groups partition source/target/effect/session and reuse identical modifier IDs without collision',()=>{
 const f=setup();ok(f.apply(d(2,true),1));ok(f.apply(d(3,true),1,'actor2'));ok(f.apply(d(4,true),2,'actor0','actor2'));ok(f.apply({...d(5,true),effectId:'other'},3));
 expect(f.owner.groups()).toHaveLength(4);expect(f.owner.groups('actor1')).toHaveLength(3);
 expect(prepareModifierResolver(f.owner.modifiers('actor1'))(0,'str').value).toBe(10);
 const isolated=setup();ok(isolated.apply());f.owner.dispose(0);expect(f.owner.groups()).toEqual([]);expect(isolated.owner.groups()).toHaveLength(1);
 expect(()=>{(isolated.owner.groups()[0]!.instanceIds as string[]).push('fake');}).toThrow();
});
it('expiry wins at reapply boundary, new identity creates fresh stack instead of resurrection',()=>{
 const f=setup(),old=ok(f.apply(d(2,true))).instance!;expect(f.advance(100).events.map(e=>e.type)).toEqual(['effect-expired']);
 expect(ok(f.apply(d(2,true),1))).toEqual({success:true,duplicate:true,events:[]});
 const next=ok(f.apply(d(3,true),2));expect(next.events.map(e=>e.type)).toEqual(['effect-applied']);expect(next.instance!.effectInstanceId).not.toBe(old.effectInstanceId);
 expect(next.instance!.expiresAt).toBe(200);
});
it('policy/max changes fail closed until group ends; rejection leaves payload/deadline/serial unchanged',()=>{
 const f=setup();ok(f.apply(d(2,true)));f.advance(30);const before=f.owner.groups();
 expect(f.apply(d(9),2)).toEqual({success:false,reason:'group_policy_conflict'});
 expect(f.apply({...d(9,true),maxStacks:3},2)).toEqual({success:false,reason:'group_policy_conflict'});
 expect(f.owner.groups()).toEqual(before);expect(f.owner.nextApplicationSerial('actor0')).toBe(2);
 expect(ok(f.apply({...d(3,true),durationMs:200},2)).instance!.expiresAt).toBe(230);
});
it('target death removes every target group; source death retains other targets, cleanup is terminal',()=>{
 const f=setup();ok(f.apply(d(2,true),1));ok(f.apply(d(2,true),2));ok(f.apply(d(2,true),1,'actor2'));ok(f.apply(d(2,true),3,'actor0','actor2'));
 f.entities[0]!.currentHp=0;expect(f.advance(10).events).toEqual([]);f.entities[1]!.currentHp=0;
 expect(f.advance(20).events).toHaveLength(3);expect(f.owner.groups()).toHaveLength(1);expect(f.owner.modifiers('actor1')).toEqual([]);
 expect(ok(f.owner.dispose(30)).events).toHaveLength(1);expect(ok(f.owner.dispose(40)).events).toEqual([]);expect(f.owner.groups()).toEqual([]);
});
it('duplicate updates and partitioned clocks produce identical ordered apply/refresh/expiry traces',()=>{
 function run(step:number){const f=setup(),events=[];
  for(const [time,serial] of [[0,1],[40,2],[70,3],[170,4]] as const){
   for(let t=f.owner.now+step;t<time;t+=step)events.push(...f.advance(t).events);
   events.push(...f.advance(time).events,...ok(f.apply(d(serial,true),serial)).events);
   events.push(...f.advance(time).events,...ok(f.apply(d(serial,true),serial)).events);
  }
  events.push(...f.advance(300).events);return {events,groups:f.owner.groups(),mods:f.owner.modifiers('actor1')};
 }
 expect(run(1)).toEqual(run(1000));
});
it('many accepted renewals stay at max instances and old retries cannot resnapshot or revive',()=>{
 const f=setup();for(let serial=1;serial<=1000;serial++)ok(f.apply(d(2,true),serial));
 expect(f.owner.instances()).toHaveLength(2);expect(f.owner.modifiers('actor1')).toHaveLength(2);expect(f.owner.nextApplicationSerial('actor0')).toBe(1001);
 f.advance(50);expect(ok(f.apply(d(500,true),1))).toEqual({success:true,duplicate:true,events:[]});expect(f.owner.nextExpiration()).toBe(100);
 f.advance(100);expect(ok(f.apply(d(2,true),1000))).toEqual({success:true,duplicate:true,events:[]});expect(f.owner.groups()).toEqual([]);
});
