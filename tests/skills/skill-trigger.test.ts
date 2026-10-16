import {it,expect} from 'vitest';
import {DEFAULT_INSTANT_AOE} from '../../src/contracts/mechanic-contracts.js';
import {fixture,projectile,direct,damage} from '../fixtures/skill-core.js';
import {pinSkillInstanceDefinition,pinSkillTriggerBundle,validateSkillTriggerReceipt,rootSkillInstance,inspectSkillInstance,cancelSkillInstance,registerChildSkillInstance,activateSkillInstance,type SkillTriggerResult,type SkillTriggerLink,type SkillTriggerBundle,SKILL_TRIGGER_LIMITS} from '../../src/skills/index.js';
import {advanceSkillEffects,clearSkillEffects,dispatchSkillEffects} from '../../src/skills/skill-effect-integration.js';
import {advanceSkillExecution,cancelSkillExecution,type SkillActivatedEvent} from '../../src/skills/skill-execution.js';

function setup(trigger:'OnImpact'|'OnExpire'='OnImpact',lifetime?:number,behavior:'stop_on_hit'|'pierce'='stop_on_hit',count=1,maxOccurrences=128){
 const f=fixture([projectile(behavior)],0,true,'session'),results:SkillTriggerResult[]=[];
 const root=pinSkillInstanceDefinition(f.definition,'v1',lifetime),child=pinSkillInstanceDefinition({...f.definition,skillId:'child',effects:[direct()]},'child-v1');
 const links:SkillTriggerLink[]=Array.from({length:count},(_,i)=>({linkId:'link'+i,sourceSkillId:'test',childSkillId:'child',trigger,delayMs:0,maxOccurrences}));
 const bundle=pinSkillTriggerBundle({version:'bundle-v1',rootSkillId:'test',definitions:[root,child],links});
 Object.assign(f.executionEnv,{...(lifetime===undefined?{}:{skillInstanceLifetimeMs:lifetime}),triggers:{bundle,observe:(r:SkillTriggerResult)=>results.push(r)}});
 const accepted=()=>results.filter(r=>r.status==='accepted');
 return {...f,results,accepted,bundle,child};
}
it('T1: real projectile collision pins contact point; dodge is impact; stop/pierce occurrence policy',()=>{
 for(const behavior of ['stop_on_hit','pierce'] as const){
  const f=setup('OnImpact',undefined,behavior);f.entities[1]!.baseStats.dodgeChance=1;const event=f.activate();
  const state={mp:f.entities[0]!.currentMp,captures:f.captures()};advanceSkillEffects(f.runtime,1200,f.env);
  expect(f.accepted()).toHaveLength(behavior==='pierce'?2:1);
  const receipt=f.accepted()[0]!.receipt!;
  expect(receipt).toMatchObject({instanceId:'["session","actor0#1"]',rootInstanceId:'["session","actor0#1"]',parentInstanceId:null,sourceEntityId:'actor0',trigger:'OnImpact',childSkillId:'child',targetId:'actor1',deliveryId:'actor0#1/effect0/bullet0',origin:{x:78,y:50},atMs:530,depth:1});
  expect(f.hits()[0]!.breakdown.defense.hit.hit).toBe(false);expect(f.entities[1]!.currentHp).toBe(1000);
  expect(Object.isFrozen(receipt.origin)).toBe(true);expect(f.captures()).toBe(state.captures);expect(f.entities[0]!.currentMp).toBe(state.mp);
  expect(inspectSkillInstance(f.runtime,receipt.instanceId)?.status).toBe('finished');
  expect(inspectSkillInstance(f.runtime,receipt.receiptId)).toBeUndefined();expect(()=>dispatchSkillEffects(f.runtime,{...event,atMs:1200},f.env)).toThrow('invalid_root_offense');
 }
});
it('T2: natural expiry once, pinned anchor, no cancellation/action/projectile/disposal expiry',()=>{
 const f=setup('OnExpire',100);f.activate();f.positions.actor1={x:200,y:70};f.positions.actor0={x:10,y:10};
 advanceSkillEffects(f.runtime,100,f.env);advanceSkillExecution(f.slot,f.context.combat,100,f.actions);advanceSkillEffects(f.runtime,150,f.env);advanceSkillEffects(f.runtime,160,f.env);
 expect(f.results).toHaveLength(1);expect(f.results[0]!.receipt).toMatchObject({trigger:'OnExpire',atMs:150,origin:{x:80,y:50}});
 const terminal=inspectSkillInstance(f.runtime,'["session","actor0#1"]')!;expect(terminal.status).toBe('expired');expect(terminal.rootOffense).toBeUndefined();expect(terminal.definition).toBeUndefined();
 for(const mode of ['cancel','dispose','action'] as const){const g=setup('OnExpire',100);g.activate();const root=rootSkillInstance(g.runtime,g.slot.skillExecution!.snapshot)!;
  if(mode==='cancel')expect(cancelSkillInstance(g.runtime,root,50).success).toBe(true);
  if(mode==='dispose')clearSkillEffects(g.runtime);
  if(mode==='action')cancelSkillExecution(g.slot,50,'session_end');
  advanceSkillEffects(g.runtime,4000,g.env);expect(g.results).toEqual([]);
 }
});
it('T3: trusted shared pins, finite reachable DAG, closed schema and lifetime validation',()=>{
 const f=setup(),root=f.bundle.definitions[0]!,child=f.child,grand=pinSkillInstanceDefinition({...f.definition,skillId:'grand'},'v1');
 const link=f.bundle.links[0]!;
 const valid={...f.bundle,definitions:[root,child,grand],links:[link,{...link,linkId:'grand',sourceSkillId:'child',childSkillId:'grand'}]};
 expect(pinSkillTriggerBundle(valid).definitions[0]).toBe(root);
 const invalid:SkillTriggerBundle[]=[{...f.bundle,definitions:[{...root},child]},{...f.bundle,definitions:[root,child,grand]},
 {...f.bundle,links:[link,link]}, {...f.bundle,links:[{...link,childSkillId:'test'}]},
 {...f.bundle,links:[link,{...link,linkId:'cycle',sourceSkillId:'child',childSkillId:'test'}]}];
 for(const patch of [{childSkillId:'unknown'},{delayMs:-1},{delayMs:Infinity},{maxOccurrences:0},{maxOccurrences:129},{trigger:'OnHit'},{trigger:'OnExpire'},{extra:1}])invalid.push({...f.bundle,links:[{...link,...patch} as SkillTriggerLink]});
 for(const bundle of invalid)expect(()=>pinSkillTriggerBundle(bundle)).toThrow('invalid_trigger_bundle');
 expect(f.captures()).toBe(0);expect(f.entities[0]!.currentMp).toBe(100);
});
it('T4/T10: exact receipt replay is inert; altered/root/parent/session/clone/disposed handles reject',()=>{
 const f=setup();f.activate();advanceSkillEffects(f.runtime,600,f.env);const receipt=f.accepted()[0]!.receipt!;
 const before=structuredClone({entities:f.entities,results:f.results,rolls:f.rolls(),cooldowns:f.cooldowns});
 for(let i=0;i<3;i++)expect(validateSkillTriggerReceipt(f.runtime,receipt)).toEqual({success:true,changed:false});
 for(const patch of [{},{rootInstanceId:'wrong'},{parentInstanceId:'wrong'},{sessionNamespace:'wrong'},{executeAtMs:999}])expect(validateSkillTriggerReceipt(f.runtime,{...receipt,...patch})).toEqual({success:false,reason:'invalid_receipt'});
 const g=setup();g.activate();advanceSkillEffects(g.runtime,600,g.env);expect(g.accepted()[0]!.receipt!.receiptId).toBe(receipt.receiptId);
 expect(validateSkillTriggerReceipt(g.runtime,receipt)).toEqual({success:false,reason:'invalid_receipt'});
 expect({entities:f.entities,results:f.results,rolls:f.rolls(),cooldowns:f.cooldowns}).toEqual(before);
 clearSkillEffects(f.runtime);clearSkillEffects(f.runtime);expect(validateSkillTriggerReceipt(f.runtime,receipt)).toEqual({success:false,reason:'invalid_session'});
});
it('T5/T9: coarse/fine partitions preserve ordered intents and RNG; expiry before contact',()=>{
 const run=(fine:boolean)=>{const f=setup('OnImpact',480,'pierce');
  const extra={...f.bundle.links[0]!,linkId:'expiry',trigger:'OnExpire' as const};
  const bundle=pinSkillTriggerBundle({...f.bundle,links:[...f.bundle.links,extra]});Object.assign(f.executionEnv,{triggers:{bundle,observe:(r:SkillTriggerResult)=>f.results.push(r)}});
  f.activate();if(fine)for(let at=60;at<=1200;at+=10)advanceSkillEffects(f.runtime,at,f.env);else advanceSkillEffects(f.runtime,1200,f.env);
  expect(f.results.slice(0,2).map(r=>r.receipt!.trigger)).toEqual(['OnExpire','OnImpact']);
  return {results:f.results,rolls:f.rolls(),events:f.events,entities:f.entities};};expect(run(false)).toEqual(run(true));
});
it('T6: root intent limit and atomic whole-batch rejection; damage still commits',()=>{
 const f=setup('OnImpact',undefined,'pierce',128);f.activate();advanceSkillEffects(f.runtime,1200,f.env);
 expect(f.accepted()).toHaveLength(128);expect(f.results.at(-1)).toMatchObject({status:'rejected',reason:'budget_exceeded',dimension:'maxIntentsPerRoot'});
 expect(f.results.at(-1)!.linkIds).toHaveLength(128);expect(f.hits()).toHaveLength(2);expect(f.entities[2]!.currentHp).toBeLessThan(1000);
 const g=setup('OnImpact',undefined,'pierce',1,1);g.activate();advanceSkillEffects(g.runtime,1200,g.env);expect(g.accepted()).toHaveLength(1);expect(g.results.at(-1)).toMatchObject({dimension:'maxOccurrences'});
 expect(SKILL_TRIGGER_LIMITS).toEqual({maxDepth:8,maxIntentsPerRoot:128,maxLiveChildren:32,maxQueuedPerBoundary:256,maxWorkPerBoundary:512});
});
it('T6: maxDepth accepts 8 edges, rejects 9 before admission',()=>{
 const f=setup();const graph=(edges:number)=>{const definitions=Array.from({length:edges+1},(_,i)=>pinSkillInstanceDefinition({...f.definition,skillId:'s'+i},'v1'));
  return {version:'v1',rootSkillId:'s0',definitions,links:Array.from({length:edges},(_,i)=>({linkId:'l'+i,sourceSkillId:'s'+i,childSkillId:'s'+(i+1),trigger:'OnImpact' as const,delayMs:0,maxOccurrences:1}))};};
 expect(pinSkillTriggerBundle(graph(8)).links).toHaveLength(8);expect(()=>pinSkillTriggerBundle(graph(9))).toThrow('maxDepth');
});
it('T7: observers cannot reenter mutation; cleanup interrupts detached pending notifications',()=>{
 const f=setup('OnImpact',undefined,'stop_on_hit',2);let calls=0;
 Object.assign(f.executionEnv,{triggers:{bundle:f.bundle,observe:()=>{calls++;
  expect(()=>advanceSkillEffects(f.runtime,f.runtime.now,f.env)).toThrow('trigger_reentrancy');
  expect(f.start(f.runtime.now).success).toBe(false);
  expect(()=>cancelSkillExecution(f.slot,f.runtime.now,'session_end')).toThrow('trigger_reentrancy');
  clearSkillEffects(f.runtime);
 }}});f.activate();advanceSkillEffects(f.runtime,600,f.env);expect(calls).toBe(1);expect(f.runtime.active).toBe(false);expect(f.runtime.bullets).toEqual([]);
});
it('T8: cancelled/finished parents retain issued delivery authority; dead registered source allowed, missing rejected',()=>{
 for(const mode of ['cancel','dead','missing'] as const){const f=setup('OnImpact',1000);f.activate();const root=rootSkillInstance(f.runtime,f.slot.skillExecution!.snapshot)!;
  if(mode==='cancel'){expect(cancelSkillInstance(f.runtime,root,50).success).toBe(true);expect(registerChildSkillInstance(f.runtime,root,f.child,'late',50,f.context.combat)).toMatchObject({success:false,reason:'parent_terminal'});}
  if(mode==='dead')f.entities[0]!.currentHp=0;
  if(mode==='missing')f.entities.splice(0,1);
  advanceSkillEffects(f.runtime,600,f.env);expect(f.accepted()).toHaveLength(mode==='missing'?0:1);expect(f.captures()).toBe(1);
 }
 const late=setup('OnImpact',1000);expect(late.start().success).toBe(true);
 advanceSkillEffects(late.runtime,50,late.env);advanceSkillExecution(late.slot,late.context.combat,50,late.actions);
 const root=rootSkillInstance(late.runtime,late.slot.skillExecution!.snapshot)!;
 expect(cancelSkillInstance(late.runtime,root,50).success).toBe(true);
 dispatchSkillEffects(late.runtime,late.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!,late.env);
 advanceSkillEffects(late.runtime,600,late.env);expect(late.hits()).toHaveLength(1);expect(late.results).toEqual([]);

});
it('T11: opt-out stays inert; invalid bundle admission has no costs or snapshot capture',()=>{
 const legacy=fixture([projectile()]);legacy.activate();advanceSkillEffects(legacy.runtime,600,legacy.env);expect(legacy.hits()).toHaveLength(1);
 const f=setup();Object.assign(f.executionEnv,{triggers:{bundle:{...f.bundle},observe:()=>{throw Error('unreachable');}}});
 expect(f.start()).toMatchObject({success:false,reason:'invalid_context'});expect(f.captures()).toBe(0);expect(f.entities[0]!.currentMp).toBe(100);expect(f.slot.activeAction).toBeUndefined();
});

it('T5/T6: numeric root admission order beats lexical 10/2 and reversed expiry discovery; queue/work limits',()=>{
 const run=(count:number,links:number|readonly number[])=>{
  const f=fixture([],0,true,'order'),results:SkillTriggerResult[]=[];
  for(let i=0;i<count;i++){
   const now=i*100,lifetime=2000-(now+50);
   const root=pinSkillInstanceDefinition(f.definition,'v1',lifetime),child=pinSkillInstanceDefinition({...f.definition,skillId:'child'},'v1');
   const bundle=pinSkillTriggerBundle({version:'v1',rootSkillId:'test',definitions:[root,child],links:Array.from({length:typeof links==='number'?links:links[i]!},(_,j)=>({linkId:'l'+j,sourceSkillId:'test',childSkillId:'child',trigger:'OnExpire',delayMs:0,maxOccurrences:1}))});
   Object.assign(f.executionEnv,{skillInstanceLifetimeMs:lifetime,triggers:{bundle,observe:(r:SkillTriggerResult)=>results.push(r)}});
   expect(f.start(now).success).toBe(true);advanceSkillEffects(f.runtime,now+50,f.env);advanceSkillExecution(f.slot,f.context.combat,now+50,f.actions);
   advanceSkillEffects(f.runtime,now+100,f.env);advanceSkillExecution(f.slot,f.context.combat,now+100,f.actions);
  }
  advanceSkillEffects(f.runtime,2000,f.env);return results;
 };
 const order=run(10,1);expect(order.map(r=>JSON.parse(r.instanceId)[1])).toEqual(Array.from({length:10},(_,i)=>'actor0#'+(i+1)));
 const queue=run(3,[128,128,1]);expect(queue.filter(r=>r.status==='accepted')).toHaveLength(256);
 expect(queue.at(-1)).toMatchObject({instanceId:'["order","actor0#3"]',dimension:'maxQueuedPerBoundary'});
 const work=run(5,[128,128,128,128,1]);expect(work.filter(r=>r.status==='accepted')).toHaveLength(256);
 expect(work.filter(r=>r.dimension==='maxWorkPerBoundary')).toHaveLength(1);
 expect(work.find(r=>r.dimension==='maxWorkPerBoundary')).toMatchObject({rejectedBatches:1});
});

it('T1/T2: no target, wall, AoE/direct and status expiry cannot manufacture impact/skill expiry',()=>{
 for(const mode of ['missing-target','wall','direct','aoe','status'] as const){
  const f=setup();if(mode==='direct'||mode==='aoe'){
   f.definition.effects=mode==='direct'?[direct()]:[{type:'instant_aoe',config:DEFAULT_INSTANT_AOE,damage:damage()}];const root=pinSkillInstanceDefinition(f.definition,'v1');
   const bundle=pinSkillTriggerBundle({...f.bundle,definitions:[root,f.child]});Object.assign(f.executionEnv,{triggers:{bundle,observe:(r:SkillTriggerResult)=>f.results.push(r)}});
  }
  if(mode==='missing-target')f.positions.actor1={x:80,y:90};
  f.activate();if(mode==='wall')Object.assign(f.env.grid,{cells:f.env.grid.cells.map((row,i)=>i===2?'110'+'1'.repeat(37):row)});if(mode==='missing-target')f.entities.splice(1,2);
  if(mode==='status'){
   f.env.emit({type:'effect-rejected',atMs:50,instanceId:'vfx',targetId:'actor1',reason:'not a trigger'});
   expect(f.runtime.effects.apply({effectId:'status',sourceEntityId:'actor0',targetEntityId:'actor1',allowedTargetRelations:['enemy']},{effectId:'status',durationMs:100},{now:50,combat:f.context.combat},1).success).toBe(true);
  }
  advanceSkillEffects(f.runtime,4000,f.env);
  expect(f.accepted()).toHaveLength(mode==='status'?1:0);
  expect(f.results.every(r=>r.receipt?.trigger!=='OnExpire')).toBe(true);
 }
});
it('T7: legacy event observers are also guarded in opt-in sessions; cleanup suppresses queued intent',()=>{
 const f=setup();const emit=f.env.emit;let blocked=false;
 f.env.emit=e=>{emit(e);if(e.type==='effect-hit'){
  expect(()=>advanceSkillEffects(f.runtime,f.runtime.now,f.env)).toThrow('trigger_reentrancy');
  const root=inspectSkillInstance(f.runtime,'["session","actor0#1"]')!;
  expect(registerChildSkillInstance(f.runtime,root,f.child,'observer',f.runtime.now,f.context.combat)).toMatchObject({success:false,reason:'invalid_transition'});
  blocked=true;clearSkillEffects(f.runtime);
 }};
 f.activate();advanceSkillEffects(f.runtime,600,f.env);expect(blocked).toBe(true);expect(f.results).toEqual([]);expect(f.runtime.bullets).toEqual([]);
});
it('T6: runtime depth/ancestry checks defend manual lifecycle children without altering v1.1.2 admission',()=>{
 const f=setup('OnExpire',1000),rootPin=f.bundle.definitions[0]!;
 expect(f.start().success).toBe(true);const root=rootSkillInstance(f.runtime,f.slot.skillExecution!.snapshot)!;
 let parent=root;
 for(let i=0;i<9;i++){const child=registerChildSkillInstance(f.runtime,parent,rootPin,'manual'+i,0,f.context.combat);if(!child.success)throw Error(child.reason);parent=child.instance;}
 expect(activateSkillInstance(f.runtime,parent,0,f.context.combat).success).toBe(true);
 advanceSkillEffects(f.runtime,1000,f.env);expect(f.results).toHaveLength(1);expect(f.results[0]).toMatchObject({status:'rejected',dimension:'maxDepth'});
});
