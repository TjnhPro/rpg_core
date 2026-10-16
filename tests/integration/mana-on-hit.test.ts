import {expect,it} from 'vitest';
import {fixture,direct,damage,projectile,sequence,timed,dot} from '../fixtures/skill-core.js';
import {DEFAULT_INSTANT_AOE,DEFAULT_MELEE_HITBOX} from '../../src/contracts/mechanic-contracts.js';
import {advanceSkillExecution,advanceSkillEffects,dispatchSkillEffects,clearSkillEffects,defineSkill,pinSkillInstanceDefinition,pinSkillTriggerBundle,inspectSkillInstance,validateSkillTriggerReceipt,type SkillGameplayEffect,type SkillActivatedEvent,type SkillTriggerResult} from '../../src/skills/index.js';
const gain=(effect:SkillGameplayEffect=direct(),amount=10)=>({...effect,manaOnHit:{amount}} as SkillGameplayEffect);
function setup(effects:SkillGameplayEffect[]=[gain()],root=false){const f=fixture(effects,0,root,root?'mana-on-hit':undefined);f.entities[0]!.currentMp=60;f.env.resourceStats=e=>({maxMana:f.stats(e).maxMana});return f;}
const gains=(f:ReturnType<typeof fixture>)=>f.events.filter(e=>e.type==='mana-gained');
function activate(f:ReturnType<typeof fixture>,mutate=()=>{}){expect(f.start().success).toBe(true);mutate();advanceSkillEffects(f.runtime,50,f.env);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);const event=f.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!;expect(event).toBeDefined();dispatchSkillEffects(f.runtime,event,f.env);return event;}
it.each(['landed','zero','dodge','fatal'] as const)('MH02/03 %s uses canonical hit independently of damage and retains spent cost',kind=>{
 const d=direct();if(kind==='zero')d.damage.definition.base=0;const f=setup([gain(d)]);if(kind==='zero')f.entities[0]!.baseStats.physicalAttack=0;if(kind==='dodge')f.entities[1]!.baseStats.dodgeChance=.5;if(kind==='fatal')f.entities[1]!.currentHp=10;
 const event=activate(f);expect(f.entities[0]!.currentMp).toBe(kind==='dodge'?55:65);expect(gains(f)).toHaveLength(kind==='dodge'?0:1);
 if(kind!=='dodge')expect(gains(f)).toEqual([{type:'mana-gained',entityId:'actor0',atMs:50,before:55,after:65,appliedMana:10}]);
 if(kind==='zero'){expect(f.hits()[0]!.breakdown.finalDamage).toBe(0);expect(f.entities[1]!.currentHp).toBe(1000);}if(kind==='fatal')expect(f.events.filter(e=>e.type==='entity-defeated')).toHaveLength(1);
 expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);expect(f.slot.actionSerial).toBe(1);
});
it('MH02 missed projectile and DoT ticks grant no MP; changing authored data cannot change emitted gain',()=>{
 const e=gain({...projectile(),onHit:[dot()]});const f=setup([e]);activate(f);if('manaOnHit' in e)e.manaOnHit={amount:100};advanceSkillEffects(f.runtime,800,f.env);expect(f.hits().some(e=>e.mechanic==='dot')).toBe(true);expect(gains(f)).toHaveLength(1);expect(f.entities[0]!.currentMp).toBe(65);
 const g=setup([gain(projectile())]);activate(g);g.positions.actor1={x:80,y:150};g.positions.actor2={x:130,y:150};advanceSkillEffects(g.runtime,1500,g.env);expect(gains(g)).toEqual([]);expect(g.entities[0]!.currentMp).toBe(55);
});
it('MH03 live effective Max Mana includes changed canonical modifiers, caps recovery and leaves full MP event-free',()=>{
 const f=setup();activate(f,()=>{f.modifiers.actor0=[{id:'mana-cap',source:'buff',sourceInstanceId:'live',target:'maxMana',operation:'add_flat',value:-40,enabled:true,conditions:[]}];});expect(f.stats(f.entities[0]!).maxMana).toBe(60);expect(f.entities[0]!.currentMp).toBe(60);expect(gains(f)).toMatchObject([{before:55,after:60,appliedMana:5}]);
 const full=setup();activate(full,()=>{full.entities[0]!.currentMp=100;});expect(gains(full)).toEqual([]);expect(full.entities[0]!.currentMp).toBe(100);
});
it.each(['missing-resolver','invalid-max','negative-max','throw','invalid-mp','over-max'] as const)('MH03 %s safely skips gain, preserving legitimate damage and cost',kind=>{
 const f=setup();const event=activate(f,()=>{if(kind==='missing-resolver')delete f.env.resourceStats;if(kind==='invalid-max')f.env.resourceStats=()=>({maxMana:NaN});if(kind==='negative-max')f.env.resourceStats=()=>({maxMana:-1});if(kind==='throw')f.env.resourceStats=()=>{throw Error('missing trusted stats');};if(kind==='invalid-mp')f.entities[0]!.currentMp=NaN;if(kind==='over-max')f.env.resourceStats=()=>({maxMana:50});});
 expect(gains(f)).toEqual([]);expect(f.entities[1]!.currentHp).toBe(980);expect(f.entities[0]!.currentMp).toBe(kind==='invalid-mp'?NaN:55);expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);
});
it.each(['direct','melee','projectile','aoe','sequence','emitter'] as const)('MH04 %s grants once per distinct canonical enemy contact',kind=>{
 const effects:Record<typeof kind,SkillGameplayEffect>={direct:direct(),melee:{type:'melee_hitbox',damage:damage(),config:{...DEFAULT_MELEE_HITBOX,shape:'circle',radius:110}},projectile:projectile('pierce'),aoe:{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,radius:60}},sequence:sequence(),emitter:timed()};
 const f=setup([gain(effects[kind])]);const ids=f.env.entityIds;f.env.entityIds=()=>[...ids(),...ids()];const event=activate(f);expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);advanceSkillEffects(f.runtime,1400,f.env);const count=kind==='direct'||kind==='emitter'?1:kind==='sequence'?3:2;
 expect(f.hits()).toHaveLength(count);expect(gains(f)).toHaveLength(count);expect(f.entities[0]!.currentMp).toBe(55+count*10);expect(f.entities[3]!.currentHp).toBe(1000);advanceSkillEffects(f.runtime,1400,f.env);expect(gains(f)).toHaveLength(count);
});
it('MH05 damage/HP/MP commit before observers and emit damage/defeat/healing/mana/hit without extra RNG',()=>{
 const effect={...direct(),lifesteal:{rate:.25},manaOnHit:{amount:10}};const f=setup([effect]);f.entities[0]!.currentHp=50;f.entities[1]!.currentHp=10;const emit=f.env.emit;f.env.emit=e=>{expect([f.entities[0]!.currentHp,f.entities[0]!.currentMp,f.entities[1]!.currentHp]).toEqual([52.5,65,0]);emit(e);};activate(f);
 expect(f.events.map(e=>e.type)).toEqual(['damage-applied','entity-defeated','healing-applied','mana-gained','effect-hit']);expect(f.events.filter(e=>e.type==='healing-applied')).toMatchObject([{appliedHealing:2.5}]);expect(gains(f)).toMatchObject([{appliedMana:10}]);expect(f.rolls()).toEqual({critCalls:1,dodgeCalls:0,positionCalls:0});
 const zero=direct();zero.damage.definition.base=0;const g=setup([{...zero,lifesteal:{rate:.25},manaOnHit:{amount:10}}]);g.entities[0]!.baseStats.physicalAttack=0;activate(g);expect(g.events.map(e=>e.type)).toEqual(['mana-gained','effect-hit']);
});
it('MH validation rejects invalid/unsupported closed declarations before costs and freezes accepted configuration',()=>{
 const t=timed();if(t.type!=='timed_object')throw Error('fixture');
 const bad:unknown[]=[...[-1,0,NaN,Infinity,1000001,'10',undefined].map(amount=>({...direct(),manaOnHit:{amount}})),{...direct(),manaOnHit:{amount:10,extra:true}},{...direct(),manaOnHit:null},{...direct(),manaOnHit:[]},{...direct(),manaOnHit:{}},{type:'heal',target:'self',amount:1,manaOnHit:{amount:10}},{type:'modifier_effect',target:'self',definition:{effectId:'mark',durationMs:100,stackingPolicy:'refresh'},manaOnHit:{amount:10}},{...t,projectile:{...t.projectile,manaOnHit:{amount:10}}},{...direct(),onHit:[{...dot(),manaOnHit:{amount:10}}]},{type:'consume_stacks',effectId:'mark',requiredStacks:1,flatPerStack:0,outcome:gain({type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE}})},{type:'consume_stacks',effectId:'mark',requiredStacks:1,flatPerStack:0,outcome:{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE}},manaOnHit:{amount:10}}];
 for(const effect of bad){const f=setup([effect as SkillGameplayEffect],true);expect(f.start().success).toBe(false);expect(f.entities[0]!.currentMp).toBe(60);expect(f.slot.actionSerial).toBeUndefined();expect(f.captures()).toBe(0);}
 expect(defineSkill(setup(Array(33).fill(gain())).definition).success).toBe(false);
 const effect={...direct(),manaOnHit:{amount:.125}};const f=setup([effect]);const event=activate(f,()=>{effect.manaOnHit.amount=100;});const pinned=event.snapshot.definition.effects![0] as typeof effect;expect(pinned.manaOnHit.amount).toBe(.125);expect(Object.isFrozen(pinned.manaOnHit)).toBe(true);expect(f.entities[0]!.currentMp).toBe(55.125);
});
it.each(['dead','replaced','missing','invalid-hp'] as const)('MH06 in-flight %s original source never receives MP',kind=>{
 const f=setup([gain(projectile('pierce'))]);activate(f);if(kind==='dead')f.entities[0]!.currentHp=0;if(kind==='replaced')f.entities[0]={...f.entities[0]!};if(kind==='missing')f.entities.splice(0,1);if(kind==='invalid-hp')f.entities[0]!.currentHp=NaN;advanceSkillEffects(f.runtime,1400,f.env);expect(gains(f)).toEqual([]);expect(f.context.combat.findEntity('actor0')?.currentMp).toBe(kind==='missing'?undefined:55);if(kind==='dead'||kind==='replaced')expect(f.entities[1]!.currentHp).toBe(980);
});
it('MH02 self/ally damage and invalid relation contact grant no MP; missing config never reads resource adapter',()=>{
 for(const relation of ['self','ally'] as const){const f=setup([gain({...direct(),allowedTargetRelations:[relation]})]);f.definition.allowedTargetRelations=[relation];f.context.target={mode:'entity',casterId:'actor0',targetId:relation==='self'?'actor0':'actor3'};activate(f);expect(f.hits()).toHaveLength(1);expect(gains(f)).toEqual([]);}
 const f=setup([gain(projectile())]);activate(f);f.entities[1]!.factionId='player';advanceSkillEffects(f.runtime,600,f.env);expect(gains(f)).toEqual([]);
 const g=setup([direct()]);g.env.resourceStats=()=>{throw Error('must not read');};activate(g);expect(g.events.map(e=>e.type)).toEqual(['damage-applied','effect-hit']);
});
function composition(trigger:'OnHit'|'OnKill'|'OnExpire'='OnHit',children:SkillGameplayEffect[]=[gain(direct(),7)],root:SkillGameplayEffect[]=[gain()]){
 const f=setup(root,true);f.definition.cooldownMs=1000;const child={...f.definition,skillId:'child',targetMode:trigger==='OnHit'?'entity' as const:'ground' as const,effects:children};const bundle=pinSkillTriggerBundle({version:'v1',rootSkillId:'test',definitions:[pinSkillInstanceDefinition(f.definition,'v1',100),pinSkillInstanceDefinition(child,'child',200)],links:[{linkId:'child-link',sourceSkillId:'test',childSkillId:'child',trigger,delayMs:0,maxOccurrences:1}]});
 const results:SkillTriggerResult[]=[];Object.assign(f.executionEnv,{skillInstanceLifetimeMs:100,triggers:{bundle,executeChildren:true,observe:(r:SkillTriggerResult)=>results.push(r)}});return {...f,results};
}
it('MH06 Child owns pinned amount, shares S0, costs once and ignores activation/receipt replay',()=>{
 const f=composition();const event=activate(f);f.entities[0]!.baseStats.physicalAttack=900;advanceSkillEffects(f.runtime,50,f.env);expect(f.entities[1]!.currentHp).toBe(960);expect(f.entities[0]!.currentMp).toBe(72);expect(gains(f).map(e=>e.appliedMana)).toEqual([10,7]);const receipt=f.results[0]!.receipt!,view=inspectSkillInstance(f.runtime,receipt.receiptId)!;expect(view.rootOffense).toBe(event.snapshot.rootOffense);expect(view.configVersion).toBe('child');expect(f.captures()).toBe(1);expect(f.slot.actionSerial).toBe(1);expect(f.cooldowns.readyAt.get('actor0')!.get('test')).toBe(1000);
 expect(validateSkillTriggerReceipt(f.runtime,receipt)).toEqual({success:true,changed:false});expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);advanceSkillEffects(f.runtime,50,f.env);expect(gains(f)).toHaveLength(2);
 const isolated=composition();activate(isolated);expect(validateSkillTriggerReceipt(isolated.runtime,receipt)).toEqual({success:false,reason:'invalid_receipt'});
});
it('MH06 fatal transition retains one OnKill and ground Child; same-ID source replacement cannot redirect expiry gain',()=>{
 const aoe:SkillGameplayEffect={type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:60},manaOnHit:{amount:7}};
 const f=composition('OnKill',[aoe]);f.entities[1]!.currentHp=10;activate(f);advanceSkillEffects(f.runtime,50,f.env);expect(f.results).toHaveLength(1);expect(f.results[0]!.receipt?.trigger).toBe('OnKill');expect(f.events.filter(e=>e.type==='entity-defeated')).toHaveLength(1);expect(f.entities[0]!.currentMp).toBe(72);expect(f.entities[2]!.currentHp).toBe(980);
 const g=composition('OnExpire',[aoe],[direct()]);activate(g);g.entities[0]={...g.entities[0]!};advanceSkillEffects(g.runtime,150,g.env);expect(gains(g)).toEqual([]);expect(g.entities[0]!.currentMp).toBe(55);
});
it('MH06 pending Child deliveries stop after disposal and live-child budget rejection grants no Child MP',()=>{
 const f=composition('OnHit',[gain(sequence())]);activate(f);advanceSkillEffects(f.runtime,50,f.env);const mp=f.entities[0]!.currentMp;clearSkillEffects(f.runtime);advanceSkillEffects(f.runtime,1500,f.env);expect(f.entities[0]!.currentMp).toBe(mp);expect(f.entities[1]!.currentHp).toBe(980);
 const g=composition();const binding=g.executionEnv.triggers!,bundle=pinSkillTriggerBundle({...binding.bundle,links:Array.from({length:33},(_,i)=>({...binding.bundle.links[0]!,linkId:'link'+i}))});Object.assign(g.executionEnv,{triggers:{...binding,bundle}});activate(g);advanceSkillEffects(g.runtime,50,g.env);expect(g.results).toMatchObject([{status:'rejected',dimension:'maxLiveChildren'}]);expect(g.entities[0]!.currentMp).toBe(65);expect(gains(g)).toHaveLength(1);
});
it('MH05 observer disposal cannot split committed HP/MP recovery or run later effects',()=>{
 const f=setup([gain(),gain()]);const emit=f.env.emit;f.env.emit=e=>{emit(e);if(e.type==='damage-applied'){expect(f.entities[0]!.currentMp).toBe(65);clearSkillEffects(f.runtime);}};activate(f);expect(f.events.map(e=>e.type)).toEqual(['damage-applied','mana-gained','effect-hit']);expect(f.entities[1]!.currentHp).toBe(980);
});
it('MH07 coarse/fine advancement agrees on HP/MP/events/instances/deliveries/RNG with Root and Child',()=>{
 const run=(times:number[])=>{const f=composition('OnHit',[gain(projectile('pierce'),3)],[gain(sequence(),2),gain(projectile('pierce'),2)]);activate(f);for(const t of times)advanceSkillEffects(f.runtime,t,f.env);return {resources:f.entities.map(e=>[e.currentHp,e.currentMp]),events:f.events,results:f.results,children:f.results.flatMap(r=>r.receipt?[inspectSkillInstance(f.runtime,r.receipt.receiptId)]:[]),effects:f.runtime.effects.groups(),bullets:f.runtime.bullets.length,sequences:f.runtime.sequences.length,rolls:f.rolls(),captures:f.captures()};};expect(run([1400])).toEqual(run([100,150,200,250,350,530,800,1000,1400]));
});
