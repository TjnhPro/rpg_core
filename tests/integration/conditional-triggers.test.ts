import {expect,it} from 'vitest';
import {fixture,direct,projectile,damage,dot} from '../fixtures/skill-core.js';
import {DEFAULT_INSTANT_AOE} from '../../src/contracts/mechanic-contracts.js';
import {advanceSkillEffects,dispatchSkillEffects,executeSkill,createSkillCooldownState,pinSkillInstanceDefinition,pinSkillTriggerBundle,inspectSkillInstance,rootSkillInstance,validateSkillTriggerReceipt,clearSkillEffects,type SkillTriggerLink,type SkillTriggerResult,type SkillGameplayEffect} from '../../src/skills/index.js';

const mark:Extract<SkillGameplayEffect,{type:'modifier_effect'}>={type:'modifier_effect',target:'selected',definition:{effectId:'mark',durationMs:2000,stackingPolicy:'stack',maxStacks:3}};
const predicate={effectId:'mark',minStacks:3,sourceScope:'currentSource' as const};
function setup(trigger:SkillTriggerLink['trigger'],effects:SkillGameplayEffect[],patch:Partial<SkillTriggerLink>={},options:{entityChild?:boolean;lifetime?:number;links?:number;radius?:number}={}){
 const f=fixture(effects,0,true,'conditional');
 const a=pinSkillInstanceDefinition(f.definition,'v1',options.lifetime);
 const b=pinSkillInstanceDefinition({...f.definition,skillId:'child',targetMode:options.entityChild?'entity':'ground',effects:[{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:options.radius??10}}]},'child',100);
 const link:SkillTriggerLink={linkId:'proc',sourceSkillId:'test',childSkillId:'child',trigger,delayMs:0,maxOccurrences:128,...(trigger==='OnStackThreshold'?{stackThreshold:{effectId:'mark',threshold:3}}:{}),...patch};
 const links=Array.from({length:options.links??1},(_,i)=>{const l={...link,linkId:'proc'+i};if(i)delete l.consumeExactly;return l;});
 const bundle=pinSkillTriggerBundle({version:'conditions',rootSkillId:'test',definitions:[a,b],links});
 const results:SkillTriggerResult[]=[];
 Object.assign(f.executionEnv,{...(options.lifetime===undefined?{}:{skillInstanceLifetimeMs:options.lifetime}),triggers:{bundle,executeChildren:true,observe:(r:SkillTriggerResult)=>results.push(r)}});
 return {...f,a,b,link,bundle,results,accepted:()=>results.filter(r=>r.status==='accepted'),count:()=>f.runtime.effects.groups('actor1').find(g=>g.effectId==='mark'&&g.sourceEntityId==='actor0')?.currentStacks??0};
}
function seed(f:ReturnType<typeof setup>,source='actor0',target='actor1',n=3){for(let i=0;i<n;i++)expect(f.runtime.effects.apply({effectId:'mark',sourceEntityId:source,targetEntityId:target,allowedTargetRelations:['enemy']},mark.definition,{now:f.runtime.now,combat:f.context.combat},f.runtime.effects.nextApplicationSerial(source)).success).toBe(true);}

it('CT01/03: landed, Dodge, zero and lethal use canonical outcome; killed entity is never hit twice',()=>{
 for(const kind of ['landed','dodge','zero','lethal'] as const){
  const hit=direct();if(kind==='zero')hit.damage={...damage(),definition:{...damage().definition,base:0}};
  const f=setup('OnHit',[hit,direct()]);if(kind==='zero')f.entities[0]!.baseStats.physicalAttack=0;
  if(kind==='dodge')f.entities[1]!.baseStats.dodgeChance=.5;
  if(kind==='lethal')f.entities[1]!.currentHp=10;
  const activation=f.activate();advanceSkillEffects(f.runtime,50,f.env);
  expect(f.accepted()).toHaveLength(kind==='dodge'?0:kind==='lethal'?1:2);
  if(kind==='zero')expect(f.hits()[0]!.breakdown.finalDamage).toBe(0);
  if(kind==='lethal')expect(f.events.filter(e=>e.type==='entity-defeated')).toHaveLength(1);
  for(const r of f.accepted())expect(inspectSkillInstance(f.runtime,r.receipt!.receiptId)!.rootOffense).toBe(activation.snapshot.rootOffense);
  expect(f.captures()).toBe(1);expect(f.entities[0]!.currentMp).toBe(95);
 }
});
it('CT02/03: projectile pierce and AoE kill attribution, ground child origin and entity child validation',()=>{
 for(const kind of ['projectile','aoe','direct'] as const){
  const effect:SkillGameplayEffect=kind==='projectile'?projectile('pierce'):kind==='direct'?direct():{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,radius:60,origin:'ground'}};
  const f=setup('OnKill',[effect],{}, {radius:60});f.entities[1]!.currentHp=10;f.activate();advanceSkillEffects(f.runtime,600,f.env);
  expect(f.accepted()).toHaveLength(1);expect(f.accepted()[0]!.receipt).toMatchObject({trigger:'OnKill',targetId:'actor1',origin:f.positions.actor1});
  expect(f.entities[2]!.currentHp).toBeLessThan(1000);expect(f.entities[1]!.currentHp).toBe(0);
  const receipt=f.accepted()[0]!.receipt!,state=JSON.stringify({events:f.events,rolls:f.rolls()});expect(validateSkillTriggerReceipt(f.runtime,receipt)).toEqual({success:true,changed:false});advanceSkillEffects(f.runtime,600,f.env);expect(JSON.stringify({events:f.events,rolls:f.rolls()})).toBe(state);
 }
 const invalid=setup('OnKill',[direct()],{}, {entityChild:true});invalid.entities[1]!.currentHp=10;invalid.activate();advanceSkillEffects(invalid.runtime,50,invalid.env);expect(invalid.accepted()).toEqual([]);expect(invalid.results).toContainEqual(expect.objectContaining({reason:'invalid_child_target'}));
});
it('CT05/06: Apply rising edge, cap refresh, consume below threshold and rearm in the same instance',()=>{
 const spend:SkillGameplayEffect={type:'consume_stacks',effectId:'mark',requiredStacks:3,flatPerStack:0,outcome:{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,radius:1}}};
 const f=setup('OnStackThreshold',[mark,mark,mark,mark,spend,mark,mark,mark]);f.activate();advanceSkillEffects(f.runtime,50,f.env);
 expect(f.accepted()).toHaveLength(2);expect(f.accepted().map(r=>[r.receipt!.beforeStacks,r.receipt!.afterStacks])).toEqual([[2,3],[2,3]]);
 expect(f.count()).toBe(3);expect(f.hits().filter(h=>h.instanceId.includes('OnStackThreshold'))).toHaveLength(2);expect(f.entities[1]!.currentHp).toBe(940);
 expect(new Set(f.accepted().map(r=>r.receipt!.receiptId)).size).toBe(2);
});
it('CT07/09: threshold opt-in consumes exactly N, predicate alone preserves stacks, failure leaves HP/RNG/stacks',()=>{
 for(const n of [undefined,2,3,4]){
  const f=setup('OnStackThreshold',[mark,mark,mark],{requiresStacks:predicate,...(n?{consumeExactly:n}:{})});f.activate();advanceSkillEffects(f.runtime,50,f.env);
  expect(f.count()).toBe(n===2?1:n===3?0:3);expect(f.accepted()).toHaveLength(n===4?0:1);expect(f.entities[1]!.currentHp).toBe(n===4?1000:980);
  if(n===4)expect(f.rolls().critCalls).toBe(0);
 }
 const budget=setup('OnStackThreshold',[mark,mark,mark],{requiresStacks:predicate,consumeExactly:3},{links:33});budget.activate();advanceSkillEffects(budget.runtime,50,budget.env);expect(budget.count()).toBe(3);expect(budget.accepted()).toEqual([]);expect(budget.results).toContainEqual(expect.objectContaining({dimension:'maxLiveChildren'}));expect(budget.rolls().critCalls).toBe(0);
});
it('CT07: impact predicate isolates source/target pools; canonical external Apply cannot emit threshold',()=>{
 for(const source of ['actor0','actor3']){
  const f=setup('OnImpact',[projectile(),{...mark,target:'self'}],{requiresStacks:predicate});seed(f,source);f.activate();advanceSkillEffects(f.runtime,600,f.env);expect(f.accepted()).toHaveLength(source==='actor0'?1:0);expect(f.count()).toBe(source==='actor0'?3:0);
 }
 const f=setup('OnStackThreshold',[mark]);seed(f);f.activate();advanceSkillEffects(f.runtime,50,f.env);expect(f.accepted()).toEqual([]);expect(f.count()).toBe(3);
});
it('CT08: expiry predicate uses pinned target identity and anchor, expiry wins before read',()=>{
 for(const kind of ['valid','replaced','missing','expired'] as const){
  const f=setup('OnExpire',[mark,mark,mark],{requiresStacks:predicate},{lifetime:kind==='expired'?2000:100});f.activate();const anchor={...f.positions.actor1!};f.positions.actor0={x:500,y:50};
  if(kind==='replaced')f.entities[1]={...f.entities[1]!};if(kind==='missing')f.entities.splice(1,1);
  advanceSkillEffects(f.runtime,kind==='expired'?2050:150,f.env);expect(f.accepted()).toHaveLength(kind==='valid'?1:0);
  if(kind==='valid'){expect(f.accepted()[0]!.receipt!.origin).toEqual(anchor);expect(f.entities[1]!.currentHp).toBe(980);expect(f.count()).toBe(3);}
 }
});
it('CT11: pin rejects unsupported consumption/conditions and detaches nested input',()=>{
 const f=setup('OnStackThreshold',[mark],{requiresStacks:predicate,consumeExactly:3});
 for(const patch of [{delayMs:1},{consumeExactly:0},{consumeExactly:1.5},{requiresStacks:undefined},{requiresStacks:{...predicate,sourceScope:'any'}},{stackThreshold:{effectId:'mark',threshold:0}},{requiresStacks:{...predicate,effectId:'unknown'}},{trigger:'OnKill',stackThreshold:undefined}]){
  expect(()=>pinSkillTriggerBundle({...f.bundle,links:[{...f.link,...patch} as SkillTriggerLink]})).toThrow('invalid_trigger_bundle');
 }
 expect(()=>pinSkillTriggerBundle({...f.bundle,links:[f.link,{...f.link,linkId:'duplicate-spend'}]})).toThrow('multiple consuming links');
 expect(Object.isFrozen(f.bundle.links[0]!.requiresStacks)).toBe(true);expect(Object.isFrozen(f.bundle.links[0]!.stackThreshold)).toBe(true);
});
it('CT04/12: DoT kills do not guess owner; coarse/fine conditional gameplay agrees',()=>{
 const poison=setup('OnKill',[{...direct(),onHit:[dot()]}]);poison.entities[1]!.currentHp=25;poison.activate();advanceSkillEffects(poison.runtime,600,poison.env);expect(poison.entities[1]!.currentHp).toBe(0);expect(poison.accepted()).toEqual([]);
 function run(step:number){const f=setup('OnHit',[mark,mark,mark,projectile('pierce')],{requiresStacks:predicate,consumeExactly:2});f.activate();for(let t=50+step;t<600;t+=step)advanceSkillEffects(f.runtime,t,f.env);advanceSkillEffects(f.runtime,600,f.env);const result={events:f.events,results:f.results,rolls:f.rolls(),hp:f.entities.map(e=>e.currentHp),stacks:f.runtime.effects.groups()};expect(f.accepted()).toHaveLength(1);clearSkillEffects(f.runtime);return result;}
 expect(run(1)).toEqual(run(1000));
});
it('CT09/11: replay cannot spend again; notifications see committed Child admission and cannot reenter',()=>{
 const f=setup('OnStackThreshold',[mark,mark,mark],{requiresStacks:predicate,consumeExactly:2});
 const emit=f.env.emit;let removals=0;
 f.env.emit=e=>{if(e.type==='effect-removed'&&e.reason==='consumed'){
  removals++;expect(f.count()).toBe(1);expect(()=>advanceSkillEffects(f.runtime,50,f.env)).toThrow('trigger_reentrancy');
 }emit(e);};
 const activation=f.activate();advanceSkillEffects(f.runtime,50,f.env);expect(removals).toBe(2);expect(f.accepted()).toHaveLength(1);
 expect(f.entities[1]!.currentHp).toBe(980);const state=JSON.stringify({events:f.events,results:f.results,rolls:f.rolls(),groups:f.runtime.effects.groups()});
 expect(dispatchSkillEffects(f.runtime,activation,f.env)).toBe(false);advanceSkillEffects(f.runtime,50,f.env);expect(JSON.stringify({events:f.events,results:f.results,rolls:f.rolls(),groups:f.runtime.effects.groups()})).toBe(state);
 const receipt=f.accepted()[0]!.receipt!;expect(validateSkillTriggerReceipt(f.runtime,{...receipt}).success).toBe(false);
 const other=setup('OnStackThreshold',[mark]);expect(validateSkillTriggerReceipt(other.runtime,receipt).success).toBe(false);
 clearSkillEffects(f.runtime);expect(validateSkillTriggerReceipt(f.runtime,receipt).success).toBe(false);
});
it('CT07/09: invalid Child relation and replaced source reject before any stack spend',()=>{
 for(const kind of ['child','source'] as const){
  const f=setup('OnStackThreshold',[mark,mark,mark],{requiresStacks:predicate,consumeExactly:3},{entityChild:true});
  if(kind==='child'){
   const b=pinSkillInstanceDefinition({...f.definition,skillId:'child',effects:[direct()],allowedTargetRelations:['ally']},'child');
   Object.assign(f.executionEnv,{triggers:{bundle:pinSkillTriggerBundle({...f.bundle,definitions:[f.a,b]}),executeChildren:true,observe:(r:SkillTriggerResult)=>f.results.push(r)}});
  }
  f.activate();if(kind==='source')f.entities[0]={...f.entities[0]!};advanceSkillEffects(f.runtime,50,f.env);
  expect(f.count()).toBe(3);expect(f.accepted()).toEqual([]);expect(f.entities[1]!.currentHp).toBe(1000);expect(f.rolls().critCalls).toBe(0);
 }
});
it('CT02: piercing and AoE landed contacts have one OnHit per target, with no replay fanout',()=>{
 for(const effect of [projectile('pierce'),{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:60}} satisfies SkillGameplayEffect]){
  const f=setup('OnHit',[effect]);f.activate();advanceSkillEffects(f.runtime,1300,f.env);
  expect(f.accepted().map(r=>r.receipt!.targetId)).toEqual(['actor1','actor2']);
  expect(f.entities.slice(1,3).map(e=>e.currentHp)).toEqual([960,960]);
  const before=f.hits().length;advanceSkillEffects(f.runtime,1300,f.env);expect(f.hits()).toHaveLength(before);expect(f.accepted()).toHaveLength(2);
 }
});
it('CT09/11: exact 512 work admits consume + 32 Children; +1 rejects before consume',()=>{
 const p=projectile() as Extract<SkillGameplayEffect,{type:'projectile'}>;
 const spread=(n:number):SkillGameplayEffect=>({...p,config:{...p.config,bulletCount:n,spreadAngles:Array(n).fill(0) as number[]}});
 for(const extra of [191,192]){
  const f=setup('OnStackThreshold',[mark,mark,mark,...Array.from({length:8},()=>spread(32))],{requiresStacks:predicate,consumeExactly:3},{links:32});
  const rootActivation=f.activate();f.positions.actor3={x:30,y:50};
  const rootId=rootSkillInstance(f.runtime,rootActivation.snapshot)!.instanceId;
  const childIds=Array.from({length:32},(_,i)=>JSON.stringify([rootId,'OnStackThreshold',JSON.stringify(['actor0',3]),'proc'+i,50]));
  let committed=false;
  const consume=f.runtime.effects.consumeStacks.bind(f.runtime.effects),find=f.context.combat.findEntity;
  f.runtime.effects.consumeStacks=(plan,context)=>{const result=consume(plan,context);if(result.success)committed=true;return result;};
  f.context.combat.findEntity=id=>{if(committed)for(const childId of childIds)expect(inspectSkillInstance(f.runtime,childId)).toBeDefined();return find(id);};
  const definition={...f.definition,skillId:'work',activationPercent:0,effects:[...Array.from({length:5},()=>spread(32)),spread(extra-160)]};
  const pin=pinSkillInstanceDefinition(definition,'v1');
  const started=executeSkill(definition,{...f.context,skillId:'work',casterId:'actor3',target:{mode:'entity',casterId:'actor3',targetId:'actor1'}},{},createSkillCooldownState(),{...f.executionEnv,triggers:{bundle:pinSkillTriggerBundle({version:'work',rootSkillId:'work',definitions:[pin],links:[]}),executeChildren:true,observe:r=>f.results.push(r)}},{now:50,expectedSerial:1,configVersion:'v1'});
  expect(started.success).toBe(true);if(!started.success)throw Error(started.reason);
  const activation=started.events.find(e=>e.type==='skill-activated');if(!activation||activation.type!=='skill-activated')throw Error('missing activation');
  dispatchSkillEffects(f.runtime,activation,f.env);expect(f.runtime.bullets).toHaveLength(256+extra);
  advanceSkillEffects(f.runtime,50,f.env);
  expect(f.accepted()).toHaveLength(extra===191?32:0);expect(f.count()).toBe(extra===191?0:3);
  if(extra===192){expect(f.results).toContainEqual(expect.objectContaining({dimension:'maxWorkPerBoundary'}));expect(f.rolls().critCalls).toBe(0);}
 }
});
