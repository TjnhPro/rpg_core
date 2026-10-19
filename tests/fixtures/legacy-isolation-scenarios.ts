import {fixture,direct,damage,projectile,sequence,timed,dot} from './skill-core.js';
import {timeline} from './skill-timeline.js';
import {nestedFixture} from './nested-skill.js';
import {DEFAULT_INSTANT_AOE,DEFAULT_MELEE_HITBOX} from '../../src/contracts/index.js';
import {advanceSkillEffects,advanceSkillExecution,executeSkill,createSkillCooldownState,dispatchSkillEffects,cancelSkillExecution,clearSkillEffects,pinSkillInstanceDefinition,pinSkillTriggerBundle,inspectSkillInstance,rootSkillInstance,deriveSkillRootDamage,validateSkillTriggerReceipt,type SkillGameplayEffect,type SkillTriggerLink,type SkillTriggerResult} from '../../src/skills/index.js';

// Observation encoding, never a calculator/runtime. Preserve key order, aliases,
// undefined and IEEE-754 edge values; identity checks below also run on live objects.
export function encodeObservation(value:unknown):unknown {
 const seen=new Map<object,number>();
 const visit=(v:unknown):unknown=>{
  if(v===undefined)return {kind:'undefined'};
  if(typeof v==='number'&&(!Number.isFinite(v)||Object.is(v,-0)))return {kind:'number',value:Object.is(v,-0)?'-0':String(v)};
  if(v===null||typeof v!=='object')return v;
  if(seen.has(v))return {ref:seen.get(v)};
  const id=seen.size;seen.set(v,id);
  if(v instanceof Map)return {kind:'map',id,entries:[...v].map(([k,x])=>[visit(k),visit(x)])};
  if(v instanceof Set)return {kind:'set',id,values:[...v].map(visit)};
  if(Array.isArray(v))return {kind:'array',id,values:v.map(visit)};
  return {kind:'object',id,entries:Object.entries(v).map(([k,x])=>[k,visit(x)])};
 };return visit(value);
}
type F=ReturnType<typeof fixture>;
export type IsolationObservation={name:string;observation:unknown;summary:{hits:number;events:number;captures:number;rolls:ReturnType<F['rolls']>;hp:number[];mp:number[];sharedS0:boolean;errors:number;childrenObserved:number;triggerAccepted:number;budgetDimensions:string[]}};
function observe(name:string,f:F,run:(record:(label:string,value?:unknown)=>void)=>unknown):IsolationObservation {
 const entries:unknown[]=[],errors:unknown[]=[];
 const state=()=>({now:f.runtime.now,active:f.runtime.active,hp:f.entities.map(e=>[e.entityId,e.currentHp,e.currentMp]),serial:f.slot.actionSerial,action:f.slot.activeAction,execution:f.slot.skillExecution&&{activated:f.slot.skillExecution.activated,snapshot:f.slot.skillExecution.snapshot.actionInstanceId},cooldowns:[...f.cooldowns.readyAt].map(([id,m])=>[id,[...m]]),deliveries:[f.runtime.bullets.length,f.runtime.objects.length,f.runtime.sequences.length,f.runtime.dots.groups.length],groups:f.runtime.effects.groups(),rolls:f.rolls(),captures:f.captures()});
 const record=(label:string,value?:unknown)=>entries.push({label,value:encodeObservation(value),state:encodeObservation(state())});
 const emit=f.env.emit;f.env.emit=e=>{record('notify-before',e);emit(e);record('notify-after',e);};
 for(const key of ['criticalRoll','dodgeRoll','positionRoll'] as const){const original=f.env[key];f.env[key]=function(this:unknown){record(key,{receiver:this===f.env});const value=original();record(key+'-result',value);return value;};}
 const originalDefense=f.env.defenseStats;f.env.defenseStats=e=>{record('defenseStats',e.entityId);return originalDefense(e);};
 let result:unknown;
 try{record('initial');result=run(record);}catch(e){errors.push({name:e instanceof Error?e.name:undefined,message:e instanceof Error?e.message:e});record('throw',errors.at(-1));}
 const activated=f.actions.find(e=>e.type==='skill-activated');
 const snapshot=activated?.type==='skill-activated'?activated.snapshot:undefined;
 const root=snapshot?.rootOffense;
 const children='observations' in f?(f as ReturnType<typeof nestedFixture>).observations:[];
 const roots=f.actions.flatMap(a=>a.type==='skill-activated'?[a.snapshot.rootOffense]:[]);
 const sharedS0=children.every(c=>roots.includes(c.rootOffense));
 const identity={sharedS0,rootFrozen:root?Object.isFrozen(root):undefined,rootOffenseFrozen:root?Object.isFrozen(root.offense):undefined,rootInstanceMatches:snapshot?rootSkillInstance(f.runtime,snapshot)?.rootOffense===root:undefined,clonedExecutionRejected:snapshot?rootSkillInstance(f.runtime,{...snapshot})===undefined:undefined};
 record('final',{result,actions:f.actions,events:f.events,identity,errors,stats:f.entities.map(e=>f.resolved(e)),...( 'results' in f?{triggers:f.results,children}:{} )});
 const results='results' in f?(f as F & {results:SkillTriggerResult[]}).results:[];
 return {name,observation:entries,summary:{hits:f.hits().length,events:f.events.length,captures:f.captures(),rolls:f.rolls(),hp:f.entities.map(e=>e.currentHp),mp:f.entities.map(e=>e.currentMp),sharedS0,errors:errors.length,childrenObserved:children.length,triggerAccepted:results.filter(r=>r.status==='accepted').length,budgetDimensions:[...new Set(results.flatMap(r=>r.dimension?[r.dimension]:[]))]}};
}
const mark:Extract<SkillGameplayEffect,{type:'modifier_effect'}>={type:'modifier_effect',target:'selected',definition:{effectId:'mark',durationMs:2000,stackingPolicy:'stack',maxStacks:3}};
function conditional(trigger:SkillTriggerLink['trigger'],effects:SkillGameplayEffect[],count=1,consume=2){
 const f=fixture(effects,0,true,'isolation-conditional');
 const root=pinSkillInstanceDefinition(f.definition,'v1',100);
 const child=pinSkillInstanceDefinition({...f.definition,skillId:'child',targetMode:'ground',effects:[{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:10}}]},'child-v1',100);
 const links:SkillTriggerLink[]=Array.from({length:count},(_,i)=>({linkId:'link'+i,sourceSkillId:'test',childSkillId:'child',trigger,delayMs:0,maxOccurrences:128,...(trigger==='OnStackThreshold'?{stackThreshold:{effectId:'mark',threshold:3},requiresStacks:{effectId:'mark',minStacks:3,sourceScope:'currentSource'},...(i===0?{consumeExactly:consume}:{})}:{})}));
 const bundle=pinSkillTriggerBundle({version:'isolation',rootSkillId:'test',definitions:[root,child],links});
 const results:SkillTriggerResult[]=[],observations:NonNullable<ReturnType<typeof inspectSkillInstance>>[]=[];
 Object.assign(f.executionEnv,{skillInstanceLifetimeMs:100,triggers:{bundle,executeChildren:true,observe:(r:SkillTriggerResult)=>{results.push(r);if(r.receipt){const child=inspectSkillInstance(f.runtime,r.receipt.receiptId);if(child)observations.push(child);}}}});
 return {...f,results,observations};
}
export function observeLegacyIsolation():IsolationObservation[]{
 const observations:IsolationObservation[]=[];
 const add=(name:string,f:F,run:Parameters<typeof observe>[2])=>observations.push(observe(name,f,run));
 for(const root of [false,true])for(const at of [0,50,100]){
  const f=fixture([direct()],0,root,root?'direct':undefined);f.definition.activationPercent=at;f.definition.cooldownMs=1000;
  f.entities[0]!.baseStats.criticalChance=.5;f.entities[1]!.baseStats.dodgeChance=.25;
  add(`direct-${root?'root':'legacy'}-${at}`,f,record=>{const t=timeline(f);record('admission',t.start());record('busy-rejection',f.start(0));t.advance(at);const activation=f.actions.find(e=>e.type==='skill-activated');record('replay',activation?.type==='skill-activated'&&dispatchSkillEffects(f.runtime,activation,f.env));t.advance(100);record('timeline',t.events);});
 }
 for(const kind of ['critical','critical-miss','getters'] as const){
  const f=fixture([direct()],0,true,'numerical-observers');f.entities[0]!.baseStats.criticalChance=.5;f.entities[1]!.baseStats.dodgeChance=.25;
  const dodgeRoll=f.env.dodgeRoll,criticalRoll=f.env.criticalRoll;
  f.env.dodgeRoll=()=>{dodgeRoll();return .9;};f.env.criticalRoll=()=>{criticalRoll();return kind==='critical'?.1:.9;};
  add('direct-'+kind,f,r=>{if(kind==='getters'){Object.defineProperty(f.entities[0]!.baseStats,'physicalAttack',{enumerable:true,get(){r('getter-physicalAttack');return 10;}});Object.defineProperty(f.config.stats.physicalAttack,'default',{enumerable:true,get(){r('getter-default');return 7;}});}const t=timeline(f);t.start();t.advance(100);r('timeline',t.events);});
 }
 for(const kind of ['dodge','zero','lethal','cancelled','dead','replaced','rejected','error'] as const){
  const hit=direct();const f=fixture([hit]);
  if(kind==='dodge')f.entities[1]!.baseStats.dodgeChance=.5;
  if(kind==='zero'){f.entities[0]!.baseStats.physicalAttack=0;hit.damage.definition.base=0;}
  if(kind==='lethal')f.entities[1]!.currentHp=10;
  if(kind==='rejected')f.entities[0]!.currentMp=0;
  const token={error:'original callback object'};
  if(kind==='error')f.env.defenseStats=()=>{throw token;};
  add('direct-'+kind,f,record=>{const t=timeline(f);record('admission',t.start());if(kind==='cancelled'){cancelSkillExecution(f.slot,25,'interrupted',f.actions);t.flush();}if(kind==='dead')f.entities[0]!.currentHp=0;if(kind==='replaced')f.entities[0]={...f.entities[0]!};try{t.advance(100);}catch(e){record('thrown-object-identity',e===token);throw e;}record('timeline',t.events);});
 }
 for(const kind of ['stop_on_hit','pierce','wall','tie','live-defense'] as const){
  const f=fixture([projectile(kind==='pierce'?'pierce':'stop_on_hit')]);
  if(kind==='wall')f.env.grid={...f.env.grid,cells:f.env.grid.cells.map((s,i)=>i===2?s.substring(0,3)+'0'+s.substring(4):s)};
  if(kind==='tie')f.positions.actor2={...f.positions.actor1!};
  add('projectile-'+kind,f,record=>{const t=timeline(f);t.start();t.advance(50);f.entities[0]!.baseStats.physicalAttack=999;if(kind==='live-defense')f.entities[1]!.baseStats.armor=100;t.advance(1500);record('timeline',t.events);});
 }
 for(const shape of ['circle','cone','rectangle'] as const){const f=fixture([{type:'melee_hitbox',damage:damage(),config:{...DEFAULT_MELEE_HITBOX,shape,radius:110,length:110,width:40}}]);add('melee-'+shape,f,r=>{const t=timeline(f);t.start();t.advance(100);r('timeline',t.events);});}
 {const f=fixture([{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,radius:60,origin:'ground'}}]);add('instant-aoe',f,r=>{const t=timeline(f);t.start();t.advance(100);r('timeline',t.events);});}
 for(const step of [1,1000])for(const kind of ['sequence','emitter','dot'] as const){const f=fixture([kind==='sequence'?sequence():kind==='emitter'?timed():{...direct(),onHit:[dot()]}]);add(`${kind}-step-${step}`,f,r=>{const t=timeline(f);t.start();for(let now=step;now<1200;now+=step)t.advance(now);t.advance(1200);r('timeline',t.events);});}
 for(const kind of ['recovery','percent','zero-mp','dead-recipient','replaced-recipient'] as const){
  const f=fixture([{type:'heal',target:'self',amount:kind==='percent'?{percentOfMax:.2}:25},{type:'restore_mana',target:'self',amount:kind==='percent'?{percentOfMax:.3}:20}],0,true,'recovery');
  f.entities[0]!.currentHp=80;f.entities[0]!.baseStats.maxHp=100;f.entities[0]!.currentMp=40;f.definition.cooldownMs=1000;f.env.resourceStats=e=>({maxMana:f.stats(e).maxMana});
  add(kind,f,r=>{const t=timeline(f);t.start();if(kind==='zero-mp')f.entities[0]!.currentMp=0;if(kind==='dead-recipient')f.entities[0]!.currentHp=0;if(kind==='replaced-recipient')f.entities[0]={...f.entities[0]!};t.advance(100);r('timeline',t.events);});
 }
 {const hit=direct();hit.damage.definition.base=90;const f=fixture([{...hit,lifesteal:{rate:.25},manaOnHit:{amount:3}}],0,true,'hit-recovery');f.entities[0]!.currentHp=50;f.entities[0]!.baseStats.maxHp=100;f.entities[0]!.currentMp=40;f.entities[1]!.currentHp=10;f.env.resourceStats=e=>({maxMana:f.stats(e).maxMana});add('overkill-lifesteal-mana',f,r=>{const t=timeline(f);t.start();t.advance(100);r('timeline',t.events);});}
 for(const trigger of ['OnHit','OnKill','OnImpact','OnExpire','OnStackThreshold'] as const){
  const f=conditional(trigger,trigger==='OnStackThreshold'?[mark,mark,mark]:trigger==='OnImpact'?[projectile()]:[direct()]);if(trigger==='OnKill')f.entities[1]!.currentHp=10;
  add('trigger-'+trigger,f,r=>{const t=timeline(f);t.start();t.advance(800);r('timeline',t.events);const receipt=f.results.find(x=>x.receipt)?.receipt;
   if(receipt){r('receipt-valid',validateSkillTriggerReceipt(f.runtime,receipt));r('receipt-forged',validateSkillTriggerReceipt(f.runtime,{...receipt}));const other=fixture([],0,true,'other');r('receipt-cross-session',validateSkillTriggerReceipt(other.runtime,receipt));clearSkillEffects(other.runtime);}
   const before=encodeObservation({events:f.events,results:f.results,hp:f.entities.map(e=>e.currentHp),rolls:f.rolls()});t.advance(800);r('once-only',JSON.stringify(before)===JSON.stringify(encodeObservation({events:f.events,results:f.results,hp:f.entities.map(e=>e.currentHp),rolls:f.rolls()})));clearSkillEffects(f.runtime);if(receipt)r('receipt-disposed',validateSkillTriggerReceipt(f.runtime,receipt));
  });
 }
 for(const count of [1,32,33]){
  const f=conditional('OnStackThreshold',[mark,mark,mark],count);
  add('atomic-stack-children-'+count,f,r=>{const emit=f.env.emit;f.env.emit=e=>{if(e.type==='effect-removed'&&e.reason==='consumed'){r('consume-observer',f.runtime.effects.groups());try{advanceSkillEffects(f.runtime,f.runtime.now,f.env);}catch(e){r('reentrancy',e instanceof Error?e.message:e);}}emit(e);};const t=timeline(f);t.start();t.advance(100);r('timeline',t.events);r('results',f.results);});
 }
 // Budget/atomicity observations use the same canonical public APIs as the
 // accepted nested/conditional suites, with full notification state captured.
 for(const count of [32,33]){const f=nestedFixture({links:count});f.entities[1]!.baseStats.maxHp=100000;f.entities[1]!.currentHp=100000;add('live-child-limit-'+count,f,r=>{f.activate();advanceSkillEffects(f.runtime,530,f.env);r('children-and-rejections',{children:f.observations,results:f.results});});}
 {const burst=timed() as Extract<SkillGameplayEffect,{type:'timed_object'}>;const f=nestedFixture({childEffects:Array.from({length:9},(_,i)=>({...burst,config:{...burst.config,bulletCount:i===7?31:32,delayMs:100+i*10}}))});add('projectile-family-limit-256',f,r=>{f.activate();advanceSkillEffects(f.runtime,710,f.env);r('budget',f.results);});}
 {const f=nestedFixture({rootLifetime:10});
  const definitions=[f.root,...Array.from({length:8},(_,i)=>pinSkillInstanceDefinition({...f.b.definition,skillId:'depth'+i} as typeof f.definition,'d'+i,i===7?undefined:10))];
  const links=definitions.slice(0,-1).map((pin,i)=>({linkId:'d'+i,sourceSkillId:pin.definition.skillId,childSkillId:definitions[i+1]!.definition.skillId,trigger:'OnExpire' as const,delayMs:0,maxOccurrences:1}));
  const bundle=pinSkillTriggerBundle({version:'depth',rootSkillId:'test',definitions,links});Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:f.observe}});
  add('depth-8-and-reject-9',f,r=>{f.activate();advanceSkillEffects(f.runtime,200,f.env);r('depths',f.accepted().map(x=>x.receipt!.depth));const ninth=pinSkillInstanceDefinition({...f.definition,skillId:'ninth'},'d9');const eighth=pinSkillInstanceDefinition({...definitions[8]!.definition} as typeof f.definition,'d7',10);try{pinSkillTriggerBundle({...bundle,definitions:[...definitions.slice(0,8),eighth,ninth],links:[...links,{...links[0]!,linkId:'d8',sourceSkillId:'depth7',childSkillId:'ninth'}]});}catch(e){r('pin-depth-rejection',e instanceof Error?e.message:e);}});
 }
 {const f=nestedFixture({rootEffects:[],rootLifetime:1,links:32,delay:10000});const bundle=pinSkillTriggerBundle({...f.bundle,links:f.bundle.links.map(l=>l.trigger==='OnImpact'?{...l,trigger:'OnExpire' as const}:l)});Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:f.observe}});
  add('delayed-queue-256-across-roots',f,r=>{for(let i=0;i<9;i++){r('root-start',f.start(i*100));advanceSkillEffects(f.runtime,i*100+50,f.env);advanceSkillExecution(f.slot,f.context.combat,i*100+50,f.actions);advanceSkillEffects(f.runtime,i*100+100,f.env);advanceSkillExecution(f.slot,f.context.combat,i*100+100,f.actions);}r('queue-results',f.results);clearSkillEffects(f.runtime);advanceSkillEffects(f.runtime,20000,f.env);r('disposed-no-hits',f.hits());});
 }
 {const f=nestedFixture({rootEffects:[projectile('pierce')]});for(let i=0;i<7;i++){const e={...f.entities[2]!,entityId:'extra'+i};f.entities.push(e);f.positions[e.entityId]={x:150+i*20,y:50};}const b=pinSkillInstanceDefinition({...f.definition,skillId:'instant',effects:[direct()]},'instant');const links=Array.from({length:16},(_,i)=>({...f.bundle.links[0]!,linkId:'i'+i,childSkillId:'instant'}));const bundle=pinSkillTriggerBundle({version:'totals',rootSkillId:'test',definitions:[f.root,b],links});Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:f.observe}});add('intent-family-limit-128',f,r=>{f.activate();advanceSkillEffects(f.runtime,3000,f.env);r('budget',f.results);});}
 for(const extra of [191,192]){
  const p=projectile() as Extract<SkillGameplayEffect,{type:'projectile'}>;const spread=(n:number):SkillGameplayEffect=>({...p,config:{...p.config,bulletCount:n,spreadAngles:Array(n).fill(0) as number[]}});
  const f=conditional('OnStackThreshold',[mark,mark,mark,...Array.from({length:8},()=>spread(32))],32,3);
  add('atomic-work-512-extra-'+extra,f,r=>{f.activate();f.positions.actor3={x:30,y:50};const definition={...f.definition,skillId:'work',activationPercent:0,effects:[...Array.from({length:5},()=>spread(32)),spread(extra-160)]};const pin=pinSkillInstanceDefinition(definition,'v1',100);const started=executeSkill(definition,{...f.context,skillId:'work',casterId:'actor3',target:{mode:'entity',casterId:'actor3',targetId:'actor1'}},{},createSkillCooldownState(),{...f.executionEnv,triggers:{bundle:pinSkillTriggerBundle({version:'work',rootSkillId:'work',definitions:[pin],links:[]}),executeChildren:true,observe:x=>f.results.push(x)}},{now:50,expectedSerial:1,configVersion:'v1'});r('other-root-admission',started);if(!started.success)throw Error(started.reason);const activation=started.events.find(e=>e.type==='skill-activated');if(!activation||activation.type!=='skill-activated')throw Error('missing activation');dispatchSkillEffects(f.runtime,activation,f.env);advanceSkillEffects(f.runtime,50,f.env);r('atomic-budget',f.results);});
 }
 for(const kind of ['missing-source','replaced-target','observer-disposal','invalid-sibling'] as const){
  const f=nestedFixture({delay:kind==='observer-disposal'||kind==='invalid-sibling'?0:100});
  if(kind==='observer-disposal')Object.assign(f.executionEnv,{triggers:{bundle:f.bundle,executeChildren:true,observe:()=>clearSkillEffects(f.runtime)}});
  if(kind==='invalid-sibling'){const invalid=pinSkillInstanceDefinition({...f.definition,skillId:'invalid',allowedTargetRelations:['ally'],effects:[direct()]},'bad');const bundle=pinSkillTriggerBundle({...f.bundle,definitions:[...f.bundle.definitions,invalid],links:[...f.bundle.links,{...f.bundle.links[0]!,linkId:'bad',childSkillId:'invalid'}]});Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:f.observe}});}
  add('child-'+kind,f,r=>{f.activate();advanceSkillEffects(f.runtime,530,f.env);if(kind==='missing-source')f.entities.splice(0,1);if(kind==='replaced-target')f.entities[1]={...f.entities[1]!};advanceSkillEffects(f.runtime,1200,f.env);r('results',f.results);});
 }
 {const f=nestedFixture();add('root-impact-expire-ring',f,r=>{const t=timeline(f);t.start();t.advance(50);const snapshot=f.actions.find(e=>e.type==='skill-activated');if(snapshot?.type==='skill-activated'){const derived=deriveSkillRootDamage(f.runtime,snapshot.snapshot,damage());r('detached-public-projection',derived!==snapshot.snapshot.rootOffense?.offense);}
  f.entities[0]!.baseStats.physicalAttack=999;t.advance(1800);r('timeline',t.events);r('children',f.observations);r('receipts',f.results);});}
 for(const step of [1,1000]){
  const effect=sequence() as Extract<SkillGameplayEffect,{type:'timed_aoe_sequence'}>;
  effect.config={...effect.config,pattern:'random_in_area',strikeCount:3,areaRadius:30,aoeRadius:20};
  const f=fixture([effect],0,true,'position-rng');
  f.context.target={mode:'entity',casterId:'actor0',targetId:'actor2'};
  f.positions.actor1={x:0,y:0};f.entities[0]!.baseStats.criticalChance=.5;
  add(`random-in-area-step-${step}`,f,r=>{
   // Synchronous observation only: preserve the native geometry result. The
   // first eligible target is the origin probe. Its distance operands are the
   // exact negated strike center, avoiding a second position calculator.
   const hypot=Math.hypot;let geometryCalls=0;
   Math.hypot=(...args:number[])=>{
    const result=hypot(...args);
    if(f.rolls().positionCalls>0){geometryCalls++;r('geometry-hypot',{args,result});
     if(geometryCalls%4===2)r('strike-position',{x:-args[0]!,y:-args[1]!,atMs:f.runtime.now});
    }
    return result;
   };
   try{const t=timeline(f);r('admission',t.start());for(let now=step;now<1200;now+=step)t.advance(now);t.advance(1200);r('geometry-call-count',geometryCalls);r('timeline',t.events);}
   finally{Math.hypot=hypot;}
  });
 }
 return observations;
}
