import {it,expect} from 'vitest';
import {nestedFixture} from '../fixtures/nested-skill.js';
import {direct,projectile,timed} from '../fixtures/skill-core.js';
import {advanceSkillEffects,clearSkillEffects,dispatchSkillEffects} from '../../src/skills/skill-effect-integration.js';
import {advanceSkillExecution,executeSkill,type SkillActivatedEvent,type SkillExecutionSlot,type SkillExecutionEvent} from '../../src/skills/skill-execution.js';
import {rootSkillInstance,inspectSkillInstance,cancelSkillInstance,validateSkillTriggerReceipt,pinSkillTriggerBundle,pinSkillInstanceDefinition,registerChildSkillInstance,createSkillCooldownState,type SkillGameplayEffect} from '../../src/skills/index.js';
import {registerTriggeredSkillChildren} from '../../src/skills/skill-instance.js';

it('N1-N4: real A contact → B AoE → B expiry → C timed radial; same S0, own ranks, one action/cost',()=>{
 const f=nestedFixture(),activation=f.activate(),s0=activation.snapshot.rootOffense;
 const root=rootSkillInstance(f.runtime,activation.snapshot)!,cooldowns=structuredClone(f.cooldowns);
 expect(dispatchSkillEffects(f.runtime,activation,f.env)).toBe(false);
 advanceSkillEffects(f.runtime,100,f.env);advanceSkillExecution(f.slot,f.context.combat,100,f.actions);
 f.entities[0]!.baseStats.physicalAttack=999;f.positions.actor0={x:300,y:100};
 advanceSkillEffects(f.runtime,530,f.env);
 expect(f.hits().map(h=>h.breakdown.finalDamage)).toEqual([20,45]);
 expect(f.entities[1]!.currentHp).toBe(935);
 const b=f.observations[0]!;
 expect(b).toMatchObject({skillId:'explosion',parentInstanceId:root.instanceId,rootInstanceId:root.instanceId,status:'pending',configVersion:'B-v2'});
 expect(b.rootOffense).toBe(s0);expect(b.definition).toBe(f.b.definition);
 expect(inspectSkillInstance(f.runtime,b.instanceId)).toMatchObject({status:'active',activatedAt:530,expiresAt:630});
 f.positions.actor1={x:100,y:50};f.positions.actor2={x:78,y:80};
 advanceSkillEffects(f.runtime,630,f.env);
 const c=f.observations[1]!;expect(c).toMatchObject({skillId:'ring',parentInstanceId:b.instanceId,rootInstanceId:root.instanceId});
 expect(c.rootOffense).toBe(s0);expect(c.definition).toBe(f.c.definition);
 expect(inspectSkillInstance(f.runtime,b.instanceId)?.status).toBe('expired');expect(inspectSkillInstance(f.runtime,c.instanceId)?.status).toBe('finished');
 expect(f.runtime.objects[0]?.position).toEqual({x:78,y:50});
 advanceSkillEffects(f.runtime,730,f.env);
 expect(f.runtime.bullets).toHaveLength(4);
 expect(new Set(f.runtime.bullets.map(b=>JSON.stringify(b.direction))).size).toBe(4);
 expect(f.runtime.bullets.every(b=>b.activation.skillId==='ring')).toBe(true);
 advanceSkillEffects(f.runtime,1100,f.env);
 const ringHits=f.hits().filter(h=>h.instanceId.startsWith(c.instanceId));
 expect(ringHits).toHaveLength(2);expect(ringHits.map(h=>h.breakdown.finalDamage)).toEqual([80,80]);
 expect(f.entities[2]!.currentHp).toBe(920);expect(f.captures()).toBe(1);expect(f.entities[0]!.currentMp).toBe(95);
 expect(f.cooldowns).toEqual(cooldowns);expect(f.slot.activeAction).toBeUndefined();expect(f.slot.actionSerial).toBe(1);expect(f.actions.filter(e=>e.type==='action-started')).toHaveLength(1);
});

it('N5-N7: issued projectile after cancellation/death remains detached; cancel B never expires into C',()=>{
 for(const mode of ['cancel','dead','missing'] as const){
  const f=nestedFixture({rootLifetime:1000}),e=f.activate(),root=rootSkillInstance(f.runtime,e.snapshot)!;
  if(mode==='cancel')expect(cancelSkillInstance(f.runtime,root,50).success).toBe(true);
  if(mode==='dead')f.entities[0]!.currentHp=0;
  if(mode==='missing')f.entities.splice(0,1);
  advanceSkillEffects(f.runtime,530,f.env);
  expect(f.observations).toHaveLength(mode==='missing'?0:1);
  if(mode!=='missing'){expect(f.hits()).toHaveLength(2);const b=f.observations[0]!;expect(cancelSkillInstance(f.runtime,b,530).success).toBe(true);}
  advanceSkillEffects(f.runtime,2000,f.env);expect(f.observations).toHaveLength(mode==='missing'?0:1);
 }
});

it('N5/N6: dodge is impact; live defense, faction and target removal govern subsequent child hits',()=>{
 const f=nestedFixture();f.entities[1]!.baseStats.dodgeChance=1;f.activate();advanceSkillEffects(f.runtime,530,f.env);
 expect(f.observations).toHaveLength(1);expect(f.entities[1]!.currentHp).toBe(1000);expect(f.hits().every(h=>!h.breakdown.defense.hit.hit)).toBe(true);
 f.entities[1]!.baseStats.dodgeChance=0;f.entities[1]!.baseStats.armor=100;f.positions.actor1={x:100,y:50};f.positions.actor2={x:78,y:80};
 advanceSkillEffects(f.runtime,800,f.env);f.entities[2]!.factionId='player';advanceSkillEffects(f.runtime,1100,f.env);
 expect(f.hits().at(-1)!.breakdown.finalDamage).toBe(40);expect(f.entities[1]!.currentHp).toBe(960);expect(f.entities[2]!.currentHp).toBe(1000);
 const g=nestedFixture();g.activate();advanceSkillEffects(g.runtime,530,g.env);g.entities.splice(1,1);advanceSkillEffects(g.runtime,1100,g.env);
 expect(g.hits().filter(h=>h.targetId==='actor1')).toHaveLength(2);
});

it('N8/N11: consumed/forged/cross-session receipts cannot register; duplicate advance is inert; dispose drops delayed work',()=>{
 const f=nestedFixture({delay:100}),g=nestedFixture({delay:100});f.activate();g.activate();advanceSkillEffects(f.runtime,530,f.env);advanceSkillEffects(g.runtime,530,g.env);
 const receipt=f.accepted()[0]!.receipt!,before=structuredClone({events:f.events,rolls:f.rolls(),mp:f.entities[0]!.currentMp});
 expect(registerTriggeredSkillChildren(f.runtime,[receipt],f.context.combat)).toBeUndefined();
 expect(registerTriggeredSkillChildren(f.runtime,[{...receipt}],f.context.combat)).toBeUndefined();
 expect(registerTriggeredSkillChildren(g.runtime,[receipt],g.context.combat)).toBeUndefined();
 expect(validateSkillTriggerReceipt(f.runtime,receipt)).toEqual({success:true,changed:false});
 advanceSkillEffects(f.runtime,530,f.env);expect({events:f.events,rolls:f.rolls(),mp:f.entities[0]!.currentMp}).toEqual(before);
 expect(f.observations[0]!.rootOffense).not.toBe(g.observations[0]!.rootOffense);
 clearSkillEffects(f.runtime);clearSkillEffects(f.runtime);advanceSkillEffects(f.runtime,2000,f.env);
 expect(f.events).toEqual(before.events);expect(validateSkillTriggerReceipt(f.runtime,receipt).success).toBe(false);
 advanceSkillEffects(g.runtime,630,g.env);expect(g.hits()).toHaveLength(2);
});

it('N9: whole occurrence child admission accepts 32 and rejects 33 with no partial children/effects',()=>{
 for(const count of [32,33]){const f=nestedFixture({links:count});f.entities[1]!.baseStats.maxHp=100000;f.entities[1]!.currentHp=100000;f.activate();advanceSkillEffects(f.runtime,530,f.env);
  expect(f.observations).toHaveLength(count===32?32:0);expect(f.hits()).toHaveLength(count===32?33:1);
  if(count===33)expect(f.results.at(-1)).toMatchObject({status:'rejected',dimension:'maxLiveChildren'});
 }
 const f=nestedFixture({rootLifetime:2000,links:32});f.activate();const root=rootSkillInstance(f.runtime,f.slot.skillExecution!.snapshot)!;
 for(let i=0;i<32;i++)expect(registerChildSkillInstance(f.runtime,root,f.b,'manual'+i,50,f.context.combat).success).toBe(true);
 expect(registerChildSkillInstance(f.runtime,root,f.b,'overflow',50,f.context.combat)).toMatchObject({success:false,reason:'maxLiveChildren'});
 advanceSkillEffects(f.runtime,530,f.env);expect(f.observations).toEqual([]);
});

it('N9: invalid sibling rejects an entire occurrence before creating any valid sibling',()=>{
 const f=nestedFixture();const entityChild=pinSkillInstanceDefinition({...f.definition,skillId:'entityChild',allowedTargetRelations:['ally'],effects:[direct()]},'invalid-target');
 const bundle=pinSkillTriggerBundle({...f.bundle,definitions:[...f.bundle.definitions,entityChild],links:[...f.bundle.links,{...f.bundle.links[0]!,linkId:'bad',childSkillId:'entityChild'}]});
 Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:f.observe}});f.activate();advanceSkillEffects(f.runtime,530,f.env);
 expect(f.observations).toEqual([]);expect(f.hits()).toHaveLength(1);expect(f.results.at(-1)).toMatchObject({status:'rejected',reason:'invalid_child_target',linkIds:['impact0','bad']});
});

it('N9: actual projectile family cap includes root; whole timed bursts reject at emission, without reserving future work',()=>{
 const burst=timed() as Extract<SkillGameplayEffect,{type:'timed_object'}>;
 const effects=Array.from({length:9},(_,i)=>({...burst,config:{...burst.config,bulletCount:i===7?31:32,delayMs:100+i*10}}));
 const f=nestedFixture({childEffects:effects});f.activate();advanceSkillEffects(f.runtime,530,f.env);
 expect(f.runtime.objects).toHaveLength(9);expect(f.results.every(r=>r.status==='accepted')).toBe(true);
 advanceSkillEffects(f.runtime,710,f.env);
 const created=f.events.filter(e=>e.type==='effect-created'&&e.mechanic==='projectile');expect(created).toHaveLength(256);
 expect(f.results.filter(r=>r.dimension==='maxProjectilesPerRoot')).toHaveLength(1);
 expect(f.captures()).toBe(1);expect(f.entities[0]!.currentMp).toBe(95);
});

it('N10: seeded coarse/fine boundaries preserve delay, lifetime, radial events, states and RNG',()=>{
 const run=(fine:boolean)=>{const f=nestedFixture({delay:70});f.activate();f.entities[0]!.baseStats.physicalAttack=99;
  if(fine)for(let at=60;at<=1200;at+=10)advanceSkillEffects(f.runtime,at,f.env);else advanceSkillEffects(f.runtime,1200,f.env);
  return {events:f.events,results:f.results,rolls:f.rolls(),entities:f.entities,instances:f.observations.map(v=>inspectSkillInstance(f.runtime,v.instanceId))};};
 expect(run(false)).toEqual(run(true));
});

it('N7/N11: missing source rejects delayed activation; callback disposal prevents all pending dispatch',()=>{
 const f=nestedFixture({delay:100});f.activate();advanceSkillEffects(f.runtime,530,f.env);const b=f.observations[0]!;
 f.entities.splice(0,1);advanceSkillEffects(f.runtime,630,f.env);expect(inspectSkillInstance(f.runtime,b.instanceId)?.status).toBe('cancelled');expect(f.hits()).toHaveLength(1);
 const g=nestedFixture({links:2});Object.assign(g.executionEnv,{triggers:{bundle:g.bundle,executeChildren:true,observe:()=>clearSkillEffects(g.runtime)}});
 g.activate();advanceSkillEffects(g.runtime,2000,g.env);expect(g.hits()).toHaveLength(1);expect(g.runtime.active).toBe(false);expect(g.runtime.objects).toEqual([]);
});

it('N9: depth 8 executes real generations, depth 9/cycles reject before cast',()=>{
 const f=nestedFixture({rootLifetime:10});
 const definitions=[f.root,...Array.from({length:8},(_,i)=>pinSkillInstanceDefinition({...f.b.definition,skillId:'depth'+i} as typeof f.definition,'d'+i,i===7?undefined:10))];
 const links=definitions.slice(0,-1).map((pin,i)=>({linkId:'d'+i,sourceSkillId:pin.definition.skillId,childSkillId:definitions[i+1]!.definition.skillId,trigger:'OnExpire' as const,delayMs:0,maxOccurrences:1}));
 const bundle=pinSkillTriggerBundle({version:'depth',rootSkillId:'test',definitions,links});
 Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:f.observe}});f.activate();advanceSkillEffects(f.runtime,200,f.env);
 expect(f.observations).toHaveLength(8);expect(f.hits()).toHaveLength(8);expect(f.accepted().map(r=>r.receipt!.depth)).toEqual([1,2,3,4,5,6,7,8]);
 const ninth=pinSkillInstanceDefinition({...f.definition,skillId:'ninth'},'d9');
 const eighthWithLifetime=pinSkillInstanceDefinition({...definitions[8]!.definition} as typeof f.definition,'d7',10);
 expect(()=>pinSkillTriggerBundle({...bundle,definitions:[...definitions.slice(0,8),eighthWithLifetime,ninth],links:[...links,{...links[0]!,linkId:'d8',sourceSkillId:'depth7',childSkillId:'ninth'}]})).toThrow('maxDepth');
 expect(()=>pinSkillTriggerBundle({...bundle,links:[...links,{...links[0]!,linkId:'cycle',sourceSkillId:'depth6',childSkillId:'test'}]})).toThrow('cycle');
});

it('N9/N11: concurrent families share actual 512 work cap; each root has its own 256 projectile budget',()=>{
 const bullet=projectile() as Extract<SkillGameplayEffect,{type:'projectile'}>;
 const spread={...bullet,config:{...bullet.config,bulletCount:32,spreadAngles:Array(32).fill(0) as number[]}};
 const f=nestedFixture({rootEffects:Array.from({length:8},()=>spread)});
 expect(f.start().success).toBe(true);
 const slots:SkillExecutionSlot[]=[f.slot],events:SkillExecutionEvent[][]=[f.actions];
 for(const casterId of ['actor3','actor2']){
  const slot:SkillExecutionSlot={},out:SkillExecutionEvent[]=[];
  const context={...f.context,casterId,target:{mode:'entity' as const,casterId,targetId:casterId==='actor3'?'actor1':'actor0'}};
  expect(executeSkill(f.definition,context,slot,createSkillCooldownState(),f.executionEnv,{now:0,expectedSerial:1,configVersion:'v1'},out).success).toBe(true);
  slots.push(slot);events.push(out);
 }
 advanceSkillEffects(f.runtime,50,f.env);
 for(let i=0;i<slots.length;i++){
  advanceSkillExecution(slots[i]!,f.context.combat,50,events[i]!);
  dispatchSkillEffects(f.runtime,events[i]!.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!,f.env);
 }
 expect(f.events.filter(e=>e.type==='effect-created'&&e.mechanic==='projectile')).toHaveLength(512);
 expect(f.results.filter(r=>r.dimension==='maxWorkPerBoundary')).toHaveLength(8);
 expect(f.results.some(r=>r.dimension==='maxProjectilesPerRoot')).toBe(false);expect(f.captures()).toBe(3);
});

it('N9: family budget counts traversable projectiles only and preserves 32/emission validator',()=>{
 const p=projectile() as Extract<SkillGameplayEffect,{type:'projectile'}>;
 const spread={...p,config:{...p.config,spawnOffset:100,bulletCount:32,spreadAngles:[...Array(16).fill(0),...Array(16).fill(180)] as number[]}};
 const f=nestedFixture({rootEffects:Array.from({length:17},()=>spread)});f.activate();
 expect(f.runtime.bullets).toHaveLength(256);expect(f.results.filter(r=>r.dimension==='maxProjectilesPerRoot')).toHaveLength(1);
 expect(()=>pinSkillInstanceDefinition({...f.definition,effects:[{...spread,config:{...spread.config,bulletCount:33,spreadAngles:Array(33).fill(0) as number[]}}]},'bad')).toThrow('invalid_instance_definition');
});

it('N6/N8: delayed entity child never retargets a replacement registered under the same ID',()=>{
 const f=nestedFixture({delay:100});const b=pinSkillInstanceDefinition({...f.definition,skillId:'entityChild',effects:[direct()]},'entity');
 const bundle=pinSkillTriggerBundle({version:'entity',rootSkillId:'test',definitions:[f.root,b],links:[{...f.bundle.links[0]!,childSkillId:'entityChild'}]});
 Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:f.observe}});f.activate();advanceSkillEffects(f.runtime,530,f.env);
 const original=f.entities[1]!;f.entities[1]={...original};advanceSkillEffects(f.runtime,630,f.env);
 expect(f.hits()).toHaveLength(1);expect(f.entities[1]!.currentHp).toBe(original.currentHp);
 expect(f.results.at(-1)).toMatchObject({status:'rejected',reason:'invalid_child_target',atMs:630});
 expect(inspectSkillInstance(f.runtime,f.observations[0]!.instanceId)?.status).toBe('cancelled');
});

it('N9: the existing trigger session bounds real delayed execution queue at 256 across roots',()=>{
 const f=nestedFixture({rootEffects:[],rootLifetime:1,links:32,delay:10000});
 const bundle=pinSkillTriggerBundle({...f.bundle,links:f.bundle.links.map(l=>l.trigger==='OnImpact'?{...l,trigger:'OnExpire' as const}:l)});
 Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:f.observe}});
 for(let i=0;i<9;i++){
  expect(f.start(i*100).success).toBe(true);
  advanceSkillEffects(f.runtime,i*100+50,f.env);advanceSkillExecution(f.slot,f.context.combat,i*100+50,f.actions);
  advanceSkillEffects(f.runtime,i*100+100,f.env);advanceSkillExecution(f.slot,f.context.combat,i*100+100,f.actions);
 }
 expect(f.observations).toHaveLength(256);expect(f.results.at(-1)).toMatchObject({status:'rejected',dimension:'maxQueuedPerBoundary',linkIds:Array.from({length:32},(_,i)=>'impact'+i)});
 expect(f.observations.every(c=>inspectSkillInstance(f.runtime,c.instanceId)?.status==='pending')).toBe(true);
 clearSkillEffects(f.runtime);advanceSkillEffects(f.runtime,20000,f.env);expect(f.hits()).toEqual([]);
});

it('N9: one family executes 128 real instant children, then rejects the next whole occurrence',()=>{
 const f=nestedFixture({rootEffects:[projectile('pierce')]});
 for(let i=0;i<7;i++){const entity={...f.entities[2]!,entityId:'extra'+i};f.entities.push(entity);f.positions[entity.entityId]={x:150+i*20,y:50};}
 const b=pinSkillInstanceDefinition({...f.definition,skillId:'instant',effects:[direct()]},'instant');
 const links=Array.from({length:16},(_,i)=>({...f.bundle.links[0]!,linkId:'i'+i,childSkillId:'instant'}));
 const bundle=pinSkillTriggerBundle({version:'totals',rootSkillId:'test',definitions:[f.root,b],links});
 Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:f.observe}});f.activate();advanceSkillEffects(f.runtime,3000,f.env);
 expect(f.observations).toHaveLength(128);expect(f.observations.every(c=>inspectSkillInstance(f.runtime,c.instanceId)?.status==='finished')).toBe(true);
 expect(f.hits()).toHaveLength(137);expect(f.results.at(-1)).toMatchObject({status:'rejected',dimension:'maxIntentsPerRoot',linkIds:links.map(l=>l.linkId)});
});

it('N9/N10: zero-delay impact generations drain iteratively at the same timestamp through depth 8',()=>{
 const f=nestedFixture();
 const definitions=[f.root,...Array.from({length:8},(_,i)=>pinSkillInstanceDefinition({...f.definition,skillId:'zero'+i,targetMode:'ground'},'z'+i))];
 const links=definitions.slice(0,-1).map((pin,i)=>({...f.bundle.links[0]!,linkId:'z'+i,sourceSkillId:pin.definition.skillId,childSkillId:definitions[i+1]!.definition.skillId}));
 const bundle=pinSkillTriggerBundle({version:'zero',rootSkillId:'test',definitions,links});
 Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:f.observe}});f.activate();advanceSkillEffects(f.runtime,530,f.env);
 expect(f.observations).toHaveLength(8);expect(f.hits()).toHaveLength(9);expect(f.hits().every(h=>h.atMs===530)).toBe(true);
 expect(f.results.every(r=>r.atMs===530)).toBe(true);expect(f.runtime.bullets).toEqual([]);expect(f.captures()).toBe(1);
});
