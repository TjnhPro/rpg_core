import {expect,it} from 'vitest';
import {fixture,direct,projectile,damage} from '../fixtures/skill-core.js';
import {DEFAULT_INSTANT_AOE} from '../../src/contracts/mechanic-contracts.js';
import {advanceSkillEffects,advanceSkillExecution,dispatchSkillEffects,executeSkill,createSkillCooldownState,pinSkillInstanceDefinition,pinSkillTriggerBundle,inspectSkillInstance,validateSkillTriggerReceipt,clearSkillEffects,type SkillGameplayEffect,type SkillTriggerResult,type SkillActivatedEvent,type SkillInstanceView} from '../../src/skills/index.js';

const hp=(amount: number|{readonly percentOfMax:number}):SkillGameplayEffect=>({type:'heal',target:'self',amount});
const mp=(amount: number|{readonly percentOfMax:number}):SkillGameplayEffect=>({type:'restore_mana',target:'self',amount});
function setup(effects:SkillGameplayEffect[]=[{...direct(),manaOnHit:{amount:3}}],options:{delay?:number;links?:number;maxOccurrences?:number;only?:'OnHit'|'OnKill';percent?:boolean;entityChild?:boolean}={}){
 const f=fixture(effects,0,true,'recovery-closure');f.definition.cooldownMs=1000;
 f.entities[0]!.baseStats.maxHp=100;f.entities[0]!.currentHp=50;f.entities[0]!.currentMp=50;f.entities[1]!.currentHp=10;
 f.env.resourceStats=e=>({maxMana:f.stats(e).maxMana});
 const hit=pinSkillInstanceDefinition({...f.definition,skillId:'life-hit',targetMode:'self',allowedTargetRelations:['self'],effects:[hp(5)]},'hit');
 const kill=pinSkillInstanceDefinition({...f.definition,skillId:'recovery-kill',targetMode:options.entityChild?'entity':'self',allowedTargetRelations:options.entityChild?['enemy']:['self'],effects:options.percent?[hp({percentOfMax:.2}),mp({percentOfMax:.1})]:[hp(20),mp(10)]},'kill');
 const links=Array.from({length:options.links??1},(_,i)=>(['OnHit','OnKill'] as const).filter(trigger=>!options.only||trigger===options.only).map(trigger=>({linkId:trigger+i,sourceSkillId:'test',childSkillId:trigger==='OnHit'?'life-hit':'recovery-kill',trigger,delayMs:options.delay??0,maxOccurrences:options.maxOccurrences??128}))).flat();
 const bundle=pinSkillTriggerBundle({version:'v1',rootSkillId:'test',definitions:[pinSkillInstanceDefinition(f.definition,'v1'),...(!options.only||options.only==='OnHit'?[hit]:[]),...(!options.only||options.only==='OnKill'?[kill]:[])],links});
 const results:SkillTriggerResult[]=[],children:SkillInstanceView[]=[];Object.assign(f.executionEnv,{triggers:{bundle,executeChildren:true,observe:(r:SkillTriggerResult)=>{results.push(r);if(r.receipt)children.push(inspectSkillInstance(f.runtime,r.receipt.receiptId)!);}}});
 return {...f,bundle,results,children,accepted:()=>results.filter(r=>r.status==='accepted')};
}
type F=ReturnType<typeof setup>;
const resources=(f:F)=>f.events.filter(e=>e.type==='healing-applied'||e.type==='mana-gained');
function activate(f:F,mutate=()=>{}){expect(f.start().success).toBe(true);mutate();advanceSkillEffects(f.runtime,50,f.env);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);const e=f.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!;expect(e).toBeDefined();dispatchSkillEffects(f.runtime,e,f.env);return e;}
const flush=(f:F,t=50)=>advanceSkillEffects(f.runtime,t,f.env);

it('RC04 fatal Root commits cost/damage/Mana on Hit before deferred OnHit and OnKill Children',()=>{
 const f=setup(),observed:{type:string;hp:number;mp:number}[]=[];const emit=f.env.emit;f.env.emit=e=>{emit(e);observed.push({type:e.type,hp:f.entities[0]!.currentHp,mp:f.entities[0]!.currentMp});};
 const activation=activate(f);expect([f.entities[0]!.currentHp,f.entities[0]!.currentMp,f.entities[1]!.currentHp]).toEqual([50,48,0]);expect(f.accepted()).toEqual([]);
 expect(f.events.filter(e=>e.type==='damage-applied')).toMatchObject([{before:10,after:0,appliedDamage:10}]);
 flush(f);expect([f.entities[0]!.currentHp,f.entities[0]!.currentMp]).toEqual([75,58]);
 expect(f.events.map(e=>e.type)).toEqual(['damage-applied','entity-defeated','mana-gained','effect-hit','healing-applied','healing-applied','mana-gained']);
 expect(resources(f)).toEqual([{type:'mana-gained',entityId:'actor0',atMs:50,before:45,after:48,appliedMana:3},{type:'healing-applied',entityId:'actor0',atMs:50,before:50,after:55,appliedHealing:5},{type:'healing-applied',entityId:'actor0',atMs:50,before:55,after:75,appliedHealing:20},{type:'mana-gained',entityId:'actor0',atMs:50,before:48,after:58,appliedMana:10}]);
 expect(observed[0]).toEqual({type:'damage-applied',hp:50,mp:48});expect(f.accepted().map(r=>r.receipt!.trigger)).toEqual(['OnHit','OnKill']);
 expect(f.events.filter(e=>e.type==='entity-defeated')).toHaveLength(1);expect(f.captures()).toBe(1);expect(f.slot.actionSerial).toBe(1);expect(f.cooldowns.readyAt.get('actor0')!.get('test')).toBe(1000);expect(f.rolls()).toEqual({critCalls:1,dodgeCalls:0,positionCalls:0});
 for(const child of f.children){expect(child.rootOffense).toBe(activation.snapshot.rootOffense);expect(child.casterId).toBe('actor0');expect(inspectSkillInstance(f.runtime,child.instanceId)!.status).toBe('finished');}
 const before=JSON.stringify({events:f.events,results:f.results,rolls:f.rolls()});expect(dispatchSkillEffects(f.runtime,activation,f.env)).toBe(false);for(const r of f.accepted())expect(validateSkillTriggerReceipt(f.runtime,r.receipt!)).toEqual({success:true,changed:false});flush(f);expect(JSON.stringify({events:f.events,results:f.results,rolls:f.rolls()})).toBe(before);
});
it.each(['landed','zero','dodge','invalid'] as const)('RC01/02 %s contact admits only legitimate recovery occurrences',kind=>{
 const effect=direct();if(kind==='zero')effect.damage={...damage(),definition:{...damage().definition,base:0}};
 const f=setup([effect]);f.entities[1]!.currentHp=100;if(kind==='zero')f.entities[0]!.baseStats.physicalAttack=0;if(kind==='dodge')f.entities[1]!.baseStats.dodgeChance=.5;
 activate(f,()=>{if(kind==='invalid')f.entities[1]!.factionId='player';});flush(f);
 expect(f.entities[0]!.currentHp).toBe(kind==='landed'||kind==='zero'?55:50);expect(f.entities[0]!.currentMp).toBe(45);expect(f.accepted().map(r=>r.receipt!.trigger)).toEqual(kind==='landed'||kind==='zero'?['OnHit']:[]);
});
it.each(['direct','projectile','aoe'] as const)('RC01/02 %s fatal deliveries recover per distinct landed victim, never duplicate contact',kind=>{
 const effect:SkillGameplayEffect=kind==='direct'?direct():kind==='projectile'?projectile('pierce'):{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:60}};
 const f=setup(kind==='projectile'?[effect]:[effect,direct()]);f.entities[2]!.currentHp=10;const event=activate(f);expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);flush(f,1300);
 const n=kind==='direct'?1:2;expect(f.entities[0]!.currentHp).toBe(50+n*25);expect(f.entities[0]!.currentMp).toBe(45+n*10);expect(f.events.filter(e=>e.type==='entity-defeated')).toHaveLength(n);expect(f.accepted().filter(r=>r.receipt!.trigger==='OnKill').map(r=>r.receipt!.targetId)).toEqual(n===1?['actor1']:['actor1','actor2']);
 const before=JSON.stringify(f.events);expect(()=>dispatchSkillEffects(f.runtime,event,f.env)).toThrow('boundary');flush(f,1400);expect(JSON.stringify(f.events)).toBe(before);
});
it('RC02/04 self OnKill admits after defeat while entity-targeted Child retains living-target validation',()=>{
 const f=setup([direct()],{only:'OnKill',entityChild:true});activate(f);flush(f);expect(f.accepted()).toEqual([]);expect(f.results).toContainEqual(expect.objectContaining({reason:'invalid_child_target'}));expect(resources(f)).toEqual([]);
 const dead=setup([direct()]);dead.entities[1]!.currentHp=0;expect(dead.start().success).toBe(false);expect(dead.entities[0]!.currentMp).toBe(50);expect(dead.captures()).toBe(0);
});
it.each([['normal',50,100,55,10],['cap',98,100,100,7],['full',100,100,95,0]] as const)('RC03 Mana on Kill %s respects live cap and positive-event rule',(_name,before,max,after,gain)=>{
 const f=setup([direct()],{only:'OnKill'});f.entities[0]!.currentMp=before;f.entities[0]!.baseStats.maxMana=max;activate(f);if(_name==='full')f.modifiers.actor0=[{id:'mp',source:'buff',sourceInstanceId:'live',target:'maxMana',operation:'add_flat',value:-5,enabled:true,conditions:[]}];flush(f);expect(f.entities[0]!.currentMp).toBe(after);expect(resources(f).filter(e=>e.type==='mana-gained')).toEqual(gain?[{type:'mana-gained',entityId:'actor0',atMs:50,before:before-5,after,appliedMana:gain}]:[]);
});
it('RC01/03 insufficient initial MP and defeated attacker cannot fund or admit recovery',()=>{
 for(const dead of [false,true]){const f=setup();if(dead)f.entities[0]!.currentHp=0;else f.entities[0]!.currentMp=4;expect(f.start().success).toBe(false);expect(resources(f)).toEqual([]);expect(f.slot.actionSerial).toBeUndefined();expect(f.captures()).toBe(0);}
});
it.each(['dead','replaced','missing','disposed'] as const)('RC05 detached lethal projectile after %s source cannot redirect recovery',kind=>{
 const f=setup([{...(projectile() as Extract<SkillGameplayEffect,{type:'projectile'}>),manaOnHit:{amount:3}}]);activate(f);if(kind==='dead')f.entities[0]!.currentHp=0;if(kind==='replaced')f.entities[0]={...f.entities[0]!};if(kind==='missing')f.entities.splice(0,1);if(kind==='disposed')clearSkillEffects(f.runtime);flush(f,600);
 expect(resources(f)).toEqual([]);expect(f.context.combat.findEntity('actor1')!.currentHp).toBe(kind==='disposed'||kind==='missing'?10:0);const source=f.context.combat.findEntity('actor0');if(source)expect(source.currentHp).toBe(kind==='dead'?0:50);
});
it.each(['source-dead','source-replaced','source-missing','target-replaced','target-missing','disposed'] as const)('RC05 delayed self recovery after %s respects authenticated admission and execution identities',kind=>{
 const f=setup([direct()],{delay:100});activate(f);flush(f);expect(f.accepted()).toHaveLength(2);
 if(kind==='source-dead')f.entities[0]!.currentHp=0;if(kind==='source-replaced')f.entities[0]={...f.entities[0]!};if(kind==='source-missing')f.entities.splice(0,1);if(kind==='target-replaced')f.entities[1]={...f.entities[1]!};if(kind==='target-missing')f.entities.splice(1,1);if(kind==='disposed')clearSkillEffects(f.runtime);flush(f,150);
 // Once admitted, a self Child depends on its original source, not the defeated victim.
 const valid=kind==='target-replaced'||kind==='target-missing';expect(resources(f)).toHaveLength(valid?3:0);expect(f.context.combat.findEntity('actor0')?.currentHp).toBe(kind==='source-missing'?undefined:kind==='source-dead'?0:valid?75:50);
});
it('RC05 replaced victim before trigger admission rejects occurrence without retargeting',()=>{
 const f=setup([direct()]);activate(f);f.entities[1]={...f.entities[1]!};flush(f);expect(f.accepted()).toEqual([]);expect(resources(f)).toEqual([]);expect(f.results.every(r=>r.reason==='invalid_child_target')).toBe(true);
});
it.each(['dead','replaced','missing'] as const)('RC05 %s source between hit and trigger admission receives no recovery',kind=>{
 const f=setup([direct()]);activate(f);if(kind==='dead')f.entities[0]!.currentHp=0;if(kind==='replaced')f.entities[0]={...f.entities[0]!};if(kind==='missing')f.entities.splice(0,1);flush(f);expect(resources(f)).toEqual([]);expect(f.context.combat.findEntity('actor0')?.currentHp).toBe(kind==='missing'?undefined:kind==='dead'?0:50);
});
it('RC06 maxOccurrences and live-child overflow never force recovery',()=>{
 const f=setup([direct(),direct()],{only:'OnHit',maxOccurrences:1});f.entities[1]!.currentHp=100;activate(f);flush(f);expect(f.entities[0]!.currentHp).toBe(55);expect(f.accepted()).toHaveLength(1);expect(f.results).toContainEqual(expect.objectContaining({dimension:'maxOccurrences'}));
 const g=setup([direct()],{only:'OnKill',links:33});activate(g);flush(g);expect(resources(g)).toEqual([]);expect(g.results).toContainEqual(expect.objectContaining({dimension:'maxLiveChildren'}));
 const receipt=f.accepted()[0]!.receipt!;expect(validateSkillTriggerReceipt(f.runtime,{...receipt}).success).toBe(false);expect(validateSkillTriggerReceipt(g.runtime,receipt).success).toBe(false);clearSkillEffects(f.runtime);expect(validateSkillTriggerReceipt(f.runtime,receipt).success).toBe(false);
});
it.each([false,true])('RC07 delayed %s-percent recovery uses live recipient modifiers and full HP is inert',percent=>{
 const f=setup([direct()],{only:'OnKill',delay:100,percent});f.entities[0]!.currentHp=100;activate(f);flush(f);
 f.modifiers.actor0=[{id:'hp',source:'buff',sourceInstanceId:'live',target:'maxHp',operation:'add_flat',value:100,enabled:true,conditions:[]},{id:'mp',source:'buff',sourceInstanceId:'live',target:'maxMana',operation:'add_flat',value:100,enabled:true,conditions:[]}];flush(f,150);
 expect([f.entities[0]!.currentHp,f.entities[0]!.currentMp]).toEqual(percent?[140,65]:[120,55]);
 const full=setup([direct()],{only:'OnHit'});full.entities[0]!.currentHp=100;activate(full);flush(full);expect(resources(full)).toEqual([]);
});
it('RC08 coarse/fine recovery matches complete events, receipts, resources, RNG and instance state',()=>{
 const run=(times:number[])=>{const f=setup([{...(projectile('pierce') as Extract<SkillGameplayEffect,{type:'projectile'}>),manaOnHit:{amount:3}}],{delay:100});f.entities[2]!.currentHp=10;activate(f);for(const t of times)flush(f,t);const result={entities:f.entities,events:f.events,results:f.results,instances:f.accepted().map(r=>inspectSkillInstance(f.runtime,r.receipt!.receiptId)),rolls:f.rolls(),bullets:f.runtime.bullets,captures:f.captures()};expect([f.entities[0]!.currentHp,f.entities[0]!.currentMp]).toEqual([100,71]);clearSkillEffects(f.runtime);return result;};
 expect(run([1400])).toEqual(run([100,200,300,400,500,600,700,800,1000,1400]));
});
it('RC06 recovery graph rejects ninth depth at pinning, without resource commitments',()=>{
 const f=setup([direct()],{only:'OnKill'}),root=f.bundle.definitions[0]!;
 const definitions=[root,...Array.from({length:9},(_,i)=>pinSkillInstanceDefinition({...f.definition,skillId:'depth'+i,targetMode:'self',allowedTargetRelations:['self'],effects:[hp(5)]},'d',100))];
 const links=Array.from({length:9},(_,i)=>({linkId:'d'+i,sourceSkillId:i?'depth'+(i-1):'test',childSkillId:'depth'+i,trigger:i?'OnExpire' as const:'OnKill' as const,delayMs:0,maxOccurrences:1}));
 expect(pinSkillTriggerBundle({version:'v1',rootSkillId:'test',definitions:definitions.slice(0,9),links:links.slice(0,8)}).links).toHaveLength(8);
 expect(()=>pinSkillTriggerBundle({version:'v1',rootSkillId:'test',definitions,links})).toThrow('maxDepth');expect(f.entities[0]!.currentMp).toBe(50);expect(resources(f)).toEqual([]);
});
it('RC06 128 recovery intents execute; ninth distinct kill cannot exceed per-root budget',()=>{
 const f=setup([projectile('pierce')],{only:'OnKill',links:16});f.entities[0]!.baseStats.maxHp=10000;f.entities[0]!.baseStats.maxMana=10000;f.entities[2]!.currentHp=10;
 for(let i=0;i<7;i++){const target={...f.entities[2]!,entityId:'extra'+i};f.entities.push(target);f.positions[target.entityId]={x:150+i*20,y:50};}
 activate(f);flush(f,3000);expect(f.events.filter(e=>e.type==='entity-defeated')).toHaveLength(9);expect(f.accepted()).toHaveLength(128);expect(f.results).toContainEqual(expect.objectContaining({dimension:'maxIntentsPerRoot'}));expect([f.entities[0]!.currentHp,f.entities[0]!.currentMp]).toEqual([2610,1325]);expect(resources(f)).toHaveLength(256);
});
it('RC06 shared delayed queue holds 256 recovery Children and rejects overflow; disposal emits no recovery',()=>{
 const f=setup([direct()],{only:'OnKill',links:32,delay:20000});
 for(let i=0;i<9;i++){
  const now=i*1000;if(i){const target={...f.entities[1]!,entityId:'victim'+i,currentHp:10};f.entities.push(target);f.positions[target.entityId]={x:80,y:50};f.context.target={mode:'entity',casterId:'actor0',targetId:target.entityId};}
  flush(f,now);const started=f.start(now);if(!started.success)throw Error(JSON.stringify({i,started}));flush(f,now+50);advanceSkillExecution(f.slot,f.context.combat,now+50,f.actions);const event=f.actions.filter((e):e is SkillActivatedEvent=>e.type==='skill-activated').at(-1)!;dispatchSkillEffects(f.runtime,event,f.env);flush(f,now+50);flush(f,now+100);advanceSkillExecution(f.slot,f.context.combat,now+100,f.actions);
 }
 expect(f.accepted()).toHaveLength(256);expect(f.results).toContainEqual(expect.objectContaining({dimension:'maxQueuedPerBoundary'}));expect(f.children.every(c=>inspectSkillInstance(f.runtime,c.instanceId)!.status==='pending')).toBe(true);expect([f.entities[0]!.currentHp,f.entities[0]!.currentMp]).toEqual([50,5]);clearSkillEffects(f.runtime);flush(f,40000);expect(resources(f)).toEqual([]);
});
it('RC06 shared boundary work exhaustion cancels admitted recovery without HP/MP writes',()=>{
 const bullet=projectile() as Extract<SkillGameplayEffect,{type:'projectile'}>,spread={...bullet,config:{...bullet.config,bulletCount:32,spreadAngles:Array(32).fill(0) as number[]}};
 const f=setup([direct(),...Array.from({length:8},()=>spread)],{only:'OnKill',links:32});activate(f);
 const definition={...f.definition,skillId:'work',activationPercent:0,effects:Array.from({length:7},()=>spread)};
 const bundle=pinSkillTriggerBundle({version:'work',rootSkillId:'work',definitions:[pinSkillInstanceDefinition(definition,'v1')],links:[]});
 const started=executeSkill(definition,{...f.context,skillId:'work',casterId:'actor3',target:{mode:'entity',casterId:'actor3',targetId:'actor2'}},{},createSkillCooldownState(),{...f.executionEnv,triggers:{bundle,executeChildren:true,observe:r=>f.results.push(r)}},{now:50,expectedSerial:1,configVersion:'v1'});
 expect(started.success).toBe(true);if(!started.success)throw Error(started.reason);const event=started.events.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!;dispatchSkillEffects(f.runtime,event,f.env);flush(f);
 expect(f.results).toContainEqual(expect.objectContaining({dimension:'maxWorkPerBoundary'}));expect(f.accepted()).toHaveLength(32);expect(f.runtime.bullets).toHaveLength(480);expect(resources(f)).toEqual([]);expect([f.entities[0]!.currentHp,f.entities[0]!.currentMp]).toEqual([50,45]);for(const child of f.children)expect(inspectSkillInstance(f.runtime,child.instanceId)!.status).toBe('cancelled');clearSkillEffects(f.runtime);
});
