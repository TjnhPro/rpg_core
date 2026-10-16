import {it,expect} from 'vitest';
import {fixture,direct,projectile} from '../fixtures/skill-core.js';
import {pinSkillInstanceDefinition,rootSkillInstance,inspectSkillInstance,registerChildSkillInstance,activateSkillInstance,finishSkillInstance,cancelSkillInstance,type SkillInstanceResult} from '../../src/skills/index.js';
import {advanceSkillExecution,cancelSkillExecution} from '../../src/skills/skill-execution.js';
import {advanceSkillEffects,clearSkillEffects,createSkillEffectRuntime,dispatchSkillEffects,nextSkillEffectBoundary} from '../../src/skills/skill-effect-integration.js';

const value=(r:SkillInstanceResult)=>{if(!r.success)throw Error(r.reason);return r.instance;};
function setup(namespace='session',lifetime:number|null=200){
 const f=fixture([direct()],0,true,namespace);
 if(lifetime!==null)Object.assign(f.executionEnv,{skillInstanceLifetimeMs:lifetime});
 expect(f.start().success).toBe(true);
 const snapshot=f.slot.skillExecution!.snapshot,root=rootSkillInstance(f.runtime,snapshot)!;
 const definition={...f.definition,skillId:'child',effects:[direct()]};
 const pin=pinSkillInstanceDefinition(definition,'child-v2',100);
 const child=(receipt:string,parent=root,p=pin)=>value(registerChildSkillInstance(f.runtime,parent,p,receipt,f.runtime.now,f.context.combat));
 const tick=(at:number)=>{advanceSkillEffects(f.runtime,at,f.env);advanceSkillExecution(f.slot,f.context.combat,at,f.actions);};
 return {...f,root,snapshot,pin,child,tick};
}
it('L1/L10: accepted action identity, rejected admission, opt-in and distinct roots/sessions',()=>{
 const f=setup();expect(f.root).toMatchObject({status:'pending',instanceId:'["session","actor0#1"]',parentInstanceId:null,createdAt:0});
 const before=f.entities[0]!.currentMp;expect(f.start().success).toBe(false);expect(f.captures()).toBe(1);expect(f.entities[0]!.currentMp).toBe(before);
 f.tick(100);expect(f.slot.activeAction).toBeUndefined();expect(inspectSkillInstance(f.runtime,f.root.instanceId)?.status).toBe('active');
 expect(f.start(100).success).toBe(true);const second=rootSkillInstance(f.runtime,f.slot.skillExecution!.snapshot)!;
 expect(second.instanceId).not.toBe(f.root.instanceId);expect(second.rootOffense).not.toBe(f.root.rootOffense);
 const other=setup('another');expect(other.root.instanceId).not.toBe(f.root.instanceId);
 expect(registerChildSkillInstance(other.runtime,f.root,f.pin,'x',0,other.context.combat)).toMatchObject({success:false,reason:'invalid_instance'});
 const legacy=fixture();legacy.start();expect(rootSkillInstance(legacy.runtime,legacy.slot.skillExecution!.snapshot)).toBeUndefined();
 const rejected=fixture([],0,true,'rejected');rejected.entities[0]!.currentMp=0;expect(rejected.start().success).toBe(false);
 expect(inspectSkillInstance(rejected.runtime,'["rejected","actor0#1"]')).toBeUndefined();expect(rejected.captures()).toBe(0);
});
it('L2/L3/L4/L12: independent own pins/ranks, shared exact S0 through grandchildren, no gameplay',()=>{
 const f=setup(),definition={...f.definition,skillId:'own',effects:[direct()]};definition.effects[0]!.damage.rank=3;
 const pin=pinSkillInstanceDefinition(definition,'own-v3',150),a=f.child('a',f.root,pin),b=f.child('b',f.root,pin),c=f.child('c',a);
 expect(new Set([a.instanceId,b.instanceId,c.instanceId]).size).toBe(3);
 expect(c).toMatchObject({parentInstanceId:a.instanceId,rootInstanceId:f.root.instanceId,configVersion:'child-v2'});
 for(const child of [a,b,c])expect(child.rootOffense).toBe(f.root.rootOffense);
 expect(a.definition).toBe(b.definition);expect(a.definition).toBe(pin.definition);
 definition.effects[0]!.damage.rank=9;expect(a.definition!.effects![0]).toMatchObject({damage:{rank:3}});
 expect(Object.isFrozen(a)).toBe(true);expect(Object.isFrozen(a.definition!.effects)).toBe(true);
 const state=structuredClone({entities:f.entities,cooldowns:f.cooldowns,slot:f.slot,events:f.events,rolls:f.rolls()});
 value(activateSkillInstance(f.runtime,c,0,f.context.combat));
 expect({entities:f.entities,cooldowns:f.cooldowns,slot:f.slot,events:f.events,rolls:f.rolls()}).toEqual(state);
 expect(f.runtime.bullets).toEqual([]);expect(f.runtime.dots.groups).toEqual([]);expect(f.captures()).toBe(1);
});
it('L5/L7: detached children survive finish/cancel; terminal parent forbids new registration',()=>{
 const f=setup(),a=f.child('a'),b=f.child('b');f.tick(50);
 value(activateSkillInstance(f.runtime,a,50,f.context.combat));
 value(finishSkillInstance(f.runtime,f.root,50));
 expect(inspectSkillInstance(f.runtime,a.instanceId)?.status).toBe('active');expect(inspectSkillInstance(f.runtime,b.instanceId)?.status).toBe('pending');
 expect(registerChildSkillInstance(f.runtime,f.root,f.pin,'late',50,f.context.combat)).toMatchObject({success:false,reason:'parent_terminal'});
 value(cancelSkillInstance(f.runtime,a,50));expect(cancelSkillInstance(f.runtime,a,50)).toMatchObject({success:true,changed:false});
 expect(inspectSkillInstance(f.runtime,b.instanceId)?.status).toBe('pending');
 const g=setup(),child=g.child('before');expect(cancelSkillInstance(g.runtime,g.root,0)).toMatchObject({success:false,reason:'action_owned'});
 expect(cancelSkillExecution(g.slot,0,'session_end')).toBe(true);expect(inspectSkillInstance(g.runtime,g.root.instanceId)?.status).toBe('cancelled');
 expect(inspectSkillInstance(g.runtime,child.instanceId)?.status).toBe('pending');value(activateSkillInstance(g.runtime,child,0,g.context.combat));
 expect(cancelSkillExecution(g.slot,0,'session_end')).toBe(false);
});
it('L6/L14: trusted handles, exact replay and conflicting receipt, rollback and invalid transition guards',()=>{
 const f=setup(),a=f.child('receipt'),before=inspectSkillInstance(f.runtime,a.instanceId);
 expect(registerChildSkillInstance(f.runtime,f.root,f.pin,'receipt',0,f.context.combat)).toEqual({success:true,instance:before,changed:false});
 expect(registerChildSkillInstance(f.runtime,f.root,pinSkillInstanceDefinition(f.definition,'v3'),'receipt',0,f.context.combat)).toMatchObject({success:false,reason:'conflicting_replay'});
 expect(registerChildSkillInstance(f.runtime,{...f.root},f.pin,'new',0,f.context.combat)).toMatchObject({success:false,reason:'invalid_instance'});
 expect(registerChildSkillInstance(f.runtime,f.root,{...f.pin},'new',0,f.context.combat)).toMatchObject({success:false,reason:'invalid_definition'});
 expect(registerChildSkillInstance(f.runtime,f.root,f.pin,' ',0,f.context.combat)).toMatchObject({success:false,reason:'invalid_receipt'});
 expect(finishSkillInstance(f.runtime,a,0)).toMatchObject({success:false,reason:'invalid_transition'});
 value(cancelSkillInstance(f.runtime,a,0));expect(activateSkillInstance(f.runtime,a,0,f.context.combat)).toMatchObject({success:false,reason:'invalid_transition'});
 f.tick(50);expect(activateSkillInstance(f.runtime,f.root,50,f.context.combat)).toMatchObject({success:false,reason:'action_owned'});
 for(const at of [-1,NaN,Infinity,49,51])expect(registerChildSkillInstance(f.runtime,f.root,f.pin,'new',at,f.context.combat)).toMatchObject({success:false,reason:'invalid_time'});
 expect(inspectSkillInstance(f.runtime,a.instanceId)?.status).toBe('cancelled');
});
it('L8: dead registered source permits child; missing source rejects new work but accepted replay inert',()=>{
 const f=setup(),a=f.child('a');f.entities[0]!.currentHp=0;
 const b=f.child('b');value(activateSkillInstance(f.runtime,a,0,f.context.combat));
 f.entities.splice(0,1);
 expect(registerChildSkillInstance(f.runtime,f.root,f.pin,'a',0,f.context.combat)).toMatchObject({success:true,changed:false});
 expect(activateSkillInstance(f.runtime,a,0,f.context.combat)).toMatchObject({success:true,changed:false});
 expect(registerChildSkillInstance(f.runtime,f.root,f.pin,'missing',0,f.context.combat)).toMatchObject({success:false,reason:'entity_not_found'});
 expect(activateSkillInstance(f.runtime,b,0,f.context.combat)).toMatchObject({success:false,reason:'entity_not_found'});
 f.tick(50);expect(inspectSkillInstance(f.runtime,f.root.instanceId)?.status).toBe('cancelled');expect(inspectSkillInstance(f.runtime,a.instanceId)?.status).toBe('active');
 const g=setup(),c=g.child('target-loss');g.entities.splice(1,1);g.tick(50);
 expect(inspectSkillInstance(g.runtime,g.root.instanceId)?.status).toBe('active');value(activateSkillInstance(g.runtime,c,50,g.context.combat));
});
it('L9: shutdown cancels live instances once, releases observations/payload, rejects stale handles',()=>{
 const f=setup(),a=f.child('a');value(activateSkillInstance(f.runtime,a,0,f.context.combat));
 const terminal=clearSkillEffects(f.runtime);expect(terminal).toHaveLength(2);
 for(const v of terminal!){expect(v).toMatchObject({status:'cancelled',reason:'session_end',endedAt:0});expect(v.rootOffense).toBeUndefined();expect(v.definition).toBeUndefined();}
 expect(clearSkillEffects(f.runtime)).toBeUndefined();expect(inspectSkillInstance(f.runtime,a.instanceId)).toBeUndefined();expect(rootSkillInstance(f.runtime,f.snapshot)).toBeUndefined();
 expect(activateSkillInstance(f.runtime,a,0,f.context.combat)).toMatchObject({success:false,reason:'invalid_session'});
 expect(registerChildSkillInstance(f.runtime,f.root,f.pin,'stale',0,f.context.combat)).toMatchObject({success:false,reason:'invalid_session'});
 expect(()=>advanceSkillExecution(f.slot,f.context.combat,0)).toThrow('invalid_instance_time');
});
it('L11: expiry precedes equal-time finish/cancel; coarse/fine converge at exact deadlines',()=>{
 const run=(steps:number[])=>{const f=setup(),a=f.child('a');value(activateSkillInstance(f.runtime,a,0,f.context.combat));for(const at of steps)f.tick(at);
  expect(finishSkillInstance(f.runtime,a,100)).toMatchObject({success:false,reason:'invalid_transition'});
  expect(cancelSkillInstance(f.runtime,a,100)).toMatchObject({success:false,reason:'invalid_transition'});
  expect(activateSkillInstance(f.runtime,a,100,f.context.combat)).toMatchObject({success:true,changed:false});
  return inspectSkillInstance(f.runtime,a.instanceId);};
 expect(run([100])).toEqual(run([25,50,75,100]));expect(run([100])).toMatchObject({status:'expired',endedAt:100,reason:'lifetime'});
 const root=(steps:number[])=>{const f=setup('root',20);for(const at of steps)f.tick(at);return inspectSkillInstance(f.runtime,f.root.instanceId);};
 expect(root([100])).toEqual(root([50,70,100]));expect(root([100])).toMatchObject({activatedAt:50,endedAt:70});
});
it('L1/L11: durationless roots finish at activation before action completion and do not need lifetime',()=>{
 const f=setup('instant',null);f.tick(50);expect(inspectSkillInstance(f.runtime,f.root.instanceId)).toMatchObject({status:'finished',activatedAt:50,endedAt:50,reason:'instant'});
 expect(f.slot.activeAction).toBeDefined();f.tick(100);expect(f.slot.activeAction).toBeUndefined();
 const g=fixture([],0,true,'equal');g.definition.activationPercent=100;g.start();const s=g.slot.skillExecution!.snapshot;
 advanceSkillEffects(g.runtime,100,g.env);advanceSkillExecution(g.slot,g.context.combat,100,g.actions);
 expect(g.actions.map(e=>e.type).slice(-2)).toEqual(['skill-activated','action-completed']);expect(rootSkillInstance(g.runtime,s)?.status).toBe('finished');
});
it('L5/L12: existing delivery retains S0/provenance and survives finished root',()=>{
 const f=fixture([projectile()],0,true,'delivery');f.start();const s=f.slot.skillExecution!.snapshot;
 advanceSkillEffects(f.runtime,50,f.env);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);
 const event=f.actions.find(e=>e.type==='skill-activated')!;if(event.type!=='skill-activated')throw Error('activation');dispatchSkillEffects(f.runtime,event,f.env);
 expect(rootSkillInstance(f.runtime,s)?.status).toBe('finished');expect(f.runtime.bullets).toHaveLength(1);
 expect(f.runtime.bullets[0]!.activation.snapshot.rootOffense).toBe(s.rootOffense);
 advanceSkillEffects(f.runtime,600,f.env);expect(f.hits().length).toBeGreaterThan(0);
});
it('L7/L11: real restriction cancels action/root without cascade; expiry beats root action cancellation',()=>{
 const f=setup(),a=f.child('a');f.tick(50);value(activateSkillInstance(f.runtime,a,50,f.context.combat));
 const applied=f.runtime.effects.apply({effectId:'stun',sourceEntityId:'actor1',targetEntityId:'actor0',allowedTargetRelations:['enemy']},
  {effectId:'stun',durationMs:100,restrictions:['stun']},{now:50,combat:f.context.combat},1);
 expect(applied.success).toBe(true);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);
 expect(inspectSkillInstance(f.runtime,f.root.instanceId)).toMatchObject({status:'cancelled',reason:'interrupted',endedAt:50});
 expect(inspectSkillInstance(f.runtime,a.instanceId)?.status).toBe('active');
 expect(registerChildSkillInstance(f.runtime,f.root,f.pin,'a',50,f.context.combat)).toMatchObject({success:true,changed:false});
 const g=setup('deadline',20);g.tick(50);advanceSkillEffects(g.runtime,70,g.env);
 expect(cancelSkillExecution(g.slot,70,'session_end')).toBe(true);
 expect(inspectSkillInstance(g.runtime,g.root.instanceId)).toMatchObject({status:'expired',reason:'lifetime',endedAt:70});
});
it('L6/L10/L14: same textual IDs grant no cross-session rights; instant child and terminal replay',()=>{
 const f=setup(),g=setup();expect(f.root.instanceId).toBe(g.root.instanceId);
 expect(rootSkillInstance(g.runtime,f.snapshot)).toBeUndefined();expect(rootSkillInstance(f.runtime,{...f.snapshot})).toBeUndefined();
 expect(registerChildSkillInstance(g.runtime,f.root,f.pin,'foreign',0,g.context.combat)).toMatchObject({success:false,reason:'invalid_instance'});
 const pin=pinSkillInstanceDefinition(f.definition,'instant'),child=f.child('instant',f.root,pin);
 expect(value(activateSkillInstance(f.runtime,child,0,f.context.combat))).toMatchObject({status:'finished',reason:'instant',endedAt:0});
 expect(finishSkillInstance(f.runtime,child,0)).toMatchObject({success:true,changed:false});
 expect(activateSkillInstance(f.runtime,child,0,f.context.combat)).toMatchObject({success:true,changed:false});
 expect(registerChildSkillInstance(f.runtime,f.root,pin,'instant',0,f.context.combat)).toMatchObject({success:true,changed:false});
 expect(clearSkillEffects(fixture().runtime)).toBeUndefined();
});
it('L14: closed session/lifetime validation and overflow reject before capture/resources',()=>{
 for(const namespace of ['', ' bad '])expect(()=>createSkillEffectRuntime(0,undefined,{offenseMode:'root',instanceSession:namespace})).toThrow('invalid_instance_session');
 expect(()=>createSkillEffectRuntime(0,undefined,{instanceSession:'s'})).toThrow('invalid_instance_session');
 for(const life of [0,-1,NaN,Infinity]){const f=fixture([],0,true,'bad');Object.assign(f.executionEnv,{skillInstanceLifetimeMs:life});expect(f.start().success).toBe(false);expect(f.captures()).toBe(0);expect(f.entities[0]!.currentMp).toBe(100);expect(()=>pinSkillInstanceDefinition(f.definition,'v',life)).toThrow();}
 const f=fixture([],0,true);Object.assign(f.executionEnv,{skillInstanceLifetimeMs:10});expect(f.start().success).toBe(false);
 const g=setup(),a=g.child('a');advanceSkillEffects(g.runtime,Number.MAX_VALUE,g.env);
 expect(activateSkillInstance(g.runtime,a,Number.MAX_VALUE,g.context.combat)).toMatchObject({success:false,reason:'invalid_time'});
 expect(nextSkillEffectBoundary(g.runtime,g.env,0)).toBe(Infinity);
});
