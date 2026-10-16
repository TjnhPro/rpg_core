import {expect,it} from 'vitest';
import {fixture,direct,damage,projectile,sequence,timed,dot} from '../fixtures/skill-core.js';
import {DEFAULT_INSTANT_AOE,DEFAULT_MELEE_HITBOX} from '../../src/contracts/mechanic-contracts.js';
import {advanceSkillExecution,advanceSkillEffects,dispatchSkillEffects,clearSkillEffects,defineSkill,pinSkillInstanceDefinition,pinSkillTriggerBundle,inspectSkillInstance,validateSkillTriggerReceipt,type SkillGameplayEffect,type SkillActivatedEvent,type SkillTriggerResult} from '../../src/skills/index.js';

const steal=(effect:SkillGameplayEffect=direct(),rate=.25)=>({...effect,lifesteal:{rate}} as SkillGameplayEffect);
function setup(effects:SkillGameplayEffect[]=[steal()],root=false){const f=fixture(effects,0,root,root?'lifesteal':undefined);f.entities[0]!.currentHp=50;f.entities[0]!.baseStats.maxHp=100;return f;}
const heals=(f:ReturnType<typeof fixture>)=>f.events.filter(e=>e.type==='healing-applied');
function activate(f:ReturnType<typeof fixture>,mutate=()=>{}){
 expect(f.start().success).toBe(true);mutate();advanceSkillEffects(f.runtime,50,f.env);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);
 const event=f.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!;expect(event).toBeDefined();dispatchSkillEffects(f.runtime,event,f.env);return event;
}
it('LS01/04 overkill heals actual damage; both HP commit before deterministic damage/defeat/heal/hit notifications',()=>{
 const effect=direct();effect.damage.definition.base=90;const f=setup([steal(effect),steal(effect)]);f.entities[1]!.currentHp=10;
 const emit=f.env.emit;const observed:number[][]=[];f.env.emit=e=>{observed.push([f.entities[0]!.currentHp,f.entities[1]!.currentHp]);emit(e);};
 const event=activate(f);
 expect(f.hits()[0]!.breakdown.finalDamage).toBe(100);expect(f.entities[0]!.currentHp).toBe(52.5);expect(f.entities[1]!.currentHp).toBe(0);
 expect(f.events.map(e=>e.type)).toEqual(['damage-applied','entity-defeated','healing-applied','effect-hit','effect-rejected']);
 expect(observed.every(hp=>hp[0]===52.5&&hp[1]===0)).toBe(true);expect(heals(f)).toMatchObject([{before:50,after:52.5,appliedHealing:2.5}]);
 expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);expect(heals(f)).toHaveLength(1);
});
it.each(['dodge','full','cap','dead','replaced','missing','invalid-max','invalid-hp','over-max'] as const)('LS02 %s uses canonical damage and live Healing cap without resurrection/redirection',kind=>{
 const effect=projectile();const f=setup([steal(effect)]);const event=activate(f);expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);
 if(kind==='dodge')f.entities[1]!.baseStats.dodgeChance=.5;
 if(kind==='full')f.entities[0]!.currentHp=100;
 if(kind==='cap')f.entities[0]!.currentHp=98;
 if(kind==='dead')f.entities[0]!.currentHp=0;
 if(kind==='replaced')f.entities[0]={...f.entities[0]!};
 if(kind==='missing')f.entities.splice(0,1);
 if(kind==='invalid-max'){const original=f.env.defenseStats;f.env.defenseStats=e=>e.entityId==='actor0'?{maxHp:NaN,armor:0,magicResistance:0,dodgeChance:0}:original(e);}
 if(kind==='invalid-hp')f.entities[0]!.currentHp=NaN;
 if(kind==='over-max')f.entities[0]!.currentHp=101;
 advanceSkillEffects(f.runtime,600,f.env);
 expect(heals(f)).toHaveLength(kind==='cap'?1:0);if(kind==='cap')expect(heals(f)).toMatchObject([{appliedHealing:2,after:100}]);
 if(kind==='dead'){expect(f.entities[0]!.currentHp).toBe(0);expect(f.entities[1]!.currentHp).toBe(980);}
 if(kind==='replaced')expect(f.entities[0]!.currentHp).toBe(50);
 if(kind==='dodge')expect(f.entities[1]!.currentHp).toBe(1000);
 expect(()=>dispatchSkillEffects(f.runtime,event,f.env)).toThrow('Advance to SkillActivated boundary');
});
it('LS02 zero landed damage and self/ally damage never heal',()=>{
 const hit=direct();hit.damage.definition.base=0;const f=setup([steal(hit)]);f.entities[0]!.baseStats.physicalAttack=0;activate(f);expect(f.hits()[0]!.breakdown.finalDamage).toBe(0);expect(heals(f)).toEqual([]);
 for(const relation of ['self','ally'] as const){const g=setup([steal({...direct(),allowedTargetRelations:[relation]})]);g.definition.allowedTargetRelations=[relation];g.context.target={mode:'entity',casterId:'actor0',targetId:relation==='self'?'actor0':'actor3'};activate(g);expect(g.hits()).toHaveLength(1);expect(heals(g)).toEqual([]);}
});
it('LS03 validation rejects closed-schema/rate/non-damage/nested declarations before costs and freezes accepted rate',()=>{
 const invalid:unknown[]=[...[-1,0,NaN,Infinity,1.01,'0.25',undefined].map(rate=>({...direct(),lifesteal:{rate}})),{...direct(),lifesteal:{rate:.25,extra:1}},{...direct(),lifesteal:null},{...direct(),lifesteal:[]},{...direct(),lifesteal:{}},{type:'heal',target:'self',amount:1,lifesteal:{rate:.25}},{type:'modifier_effect',target:'self',definition:{effectId:'mark',durationMs:100,stackingPolicy:'refresh'},lifesteal:{rate:.25}},{...timed(),projectile:{config:projectile().type==='projectile'? (projectile() as Extract<SkillGameplayEffect,{type:'projectile'}>).config:{},damage:damage(),lifesteal:{rate:.25}}},{type:'consume_stacks',effectId:'mark',requiredStacks:1,flatPerStack:0,outcome:steal({type:'instant_aoe',config:{...DEFAULT_INSTANT_AOE},damage:damage()})}];
 for(const value of invalid){const f=setup([value as SkillGameplayEffect],true);expect(f.start().success).toBe(false);expect(f.entities[0]!.currentMp).toBe(100);expect(f.slot.actionSerial).toBeUndefined();expect(f.captures()).toBe(0);}
 expect(defineSkill(setup(Array(33).fill(steal())).definition).success).toBe(false);
 const original={...direct(),lifesteal:{rate:1}};const f=setup([original]);const event=activate(f,()=>{original.lifesteal.rate=.1;});
 const pinned=event.snapshot.definition.effects![0] as typeof original;expect(pinned.lifesteal.rate).toBe(1);expect(Object.isFrozen(pinned.lifesteal)).toBe(true);expect(f.entities[0]!.currentHp).toBe(70);
});
it.each(['direct','melee','projectile','aoe','sequence','emitter'] as const)('LS03 %s heals each distinct enemy damage application once',kind=>{
 const effects:Record<typeof kind,SkillGameplayEffect>={direct:direct(),melee:{type:'melee_hitbox',damage:damage(),config:{...DEFAULT_MELEE_HITBOX,shape:'circle',radius:110}},projectile:projectile('pierce'),aoe:{type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,radius:60}},sequence:sequence(),emitter:timed()};
 const f=setup([steal(effects[kind])]);const ids=f.env.entityIds;f.env.entityIds=()=>[...ids(),...ids()];const event=activate(f);expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);advanceSkillEffects(f.runtime,1400,f.env);
 const count=kind==='direct'||kind==='emitter'?1:kind==='sequence'?3:2;
 expect(f.hits()).toHaveLength(count);expect(heals(f)).toHaveLength(count);expect(f.entities[0]!.currentHp).toBe(50+count*5);
 expect(f.entities[3]!.currentHp).toBe(1000);advanceSkillEffects(f.runtime,1400,f.env);expect(heals(f)).toHaveLength(count);
});
it('LS03 emitted projectile keeps pinned rate, DoT ticks never inherit lifesteal',()=>{
 const effect=steal({...projectile(),onHit:[dot()]});const f=setup([effect]);activate(f);
 if('lifesteal' in effect)effect.lifesteal={rate:1};advanceSkillEffects(f.runtime,800,f.env);
 expect(f.hits().some(h=>h.mechanic==='dot')).toBe(true);expect(f.entities[0]!.currentHp).toBe(55);expect(heals(f)).toHaveLength(1);
});
function composition(trigger:'OnKill'|'OnHit'|'OnExpire'='OnHit',childEffects:SkillGameplayEffect[]=[steal(direct(),.5)],rootEffects:SkillGameplayEffect[]=[steal()]){
 const f=setup(rootEffects,true);f.definition.cooldownMs=1000;
 const child={...f.definition,skillId:'child',targetMode:trigger==='OnHit'?'entity' as const:'ground' as const,effects:childEffects};
 const bundle=pinSkillTriggerBundle({version:'v1',rootSkillId:'test',definitions:[pinSkillInstanceDefinition(f.definition,'v1',100),pinSkillInstanceDefinition(child,'child',200)],links:[{linkId:'child-link',sourceSkillId:'test',childSkillId:'child',trigger,delayMs:0,maxOccurrences:1}]});
 const results:SkillTriggerResult[]=[];Object.assign(f.executionEnv,{skillInstanceLifetimeMs:100,triggers:{bundle,executeChildren:true,observe:(r:SkillTriggerResult)=>results.push(r)}});return {...f,results};
}
it('LS04 fatal transition generates one OnKill with damage/defeat/heal/hit ordering and valid ground Child',()=>{
 const f=composition('OnKill',[{type:'instant_aoe',config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:60},damage:damage(),lifesteal:{rate:.5}}]);f.entities[1]!.currentHp=10;
 activate(f);advanceSkillEffects(f.runtime,50,f.env);expect(f.results).toHaveLength(1);expect(f.results[0]!.receipt?.trigger).toBe('OnKill');
 expect(f.events.slice(0,4).map(e=>e.type)).toEqual(['damage-applied','entity-defeated','healing-applied','effect-hit']);expect(f.events.filter(e=>e.type==='entity-defeated')).toHaveLength(1);
 expect(f.entities[0]!.currentHp).toBe(62.5);expect(f.entities[2]!.currentHp).toBe(980);expect(f.entities[1]!.currentHp).toBe(0);
});
it('LS05 trusted Child owns rate and shared S0 without costs/captures/replay; disposal halts pending deliveries',()=>{
 const f=composition();const event=activate(f);f.entities[0]!.baseStats.physicalAttack=900;advanceSkillEffects(f.runtime,50,f.env);
 expect(f.entities[1]!.currentHp).toBe(960);expect(f.entities[0]!.currentHp).toBe(65);expect(heals(f).map(e=>e.appliedHealing)).toEqual([5,10]);
 const receipt=f.results[0]!.receipt!,view=inspectSkillInstance(f.runtime,receipt.receiptId)!;expect(view.rootOffense).toBe(event.snapshot.rootOffense);expect(view.configVersion).toBe('child');
 expect(f.captures()).toBe(1);expect(f.entities[0]!.currentMp).toBe(95);expect(f.slot.actionSerial).toBe(1);expect(f.cooldowns.readyAt.get('actor0')!.get('test')).toBe(1000);
 expect(validateSkillTriggerReceipt(f.runtime,receipt)).toEqual({success:true,changed:false});expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);advanceSkillEffects(f.runtime,50,f.env);expect(heals(f)).toHaveLength(2);
 const g=composition('OnHit',[steal(sequence())]);activate(g);advanceSkillEffects(g.runtime,50,g.env);expect(g.runtime.sequences).toHaveLength(1);const hp=g.entities[0]!.currentHp;clearSkillEffects(g.runtime);advanceSkillEffects(g.runtime,1500,g.env);expect(g.entities[0]!.currentHp).toBe(hp);expect(g.entities[1]!.currentHp).toBe(980);
});
it('LS04/05 Root-only non-lifesteal pins original attacker for Child; replaced source cannot receive expiry Child recovery',()=>{
 const child:SkillGameplayEffect={type:'instant_aoe',damage:damage(),config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:60},lifesteal:{rate:.5}};
 for(const replaced of [false,true]){const f=composition('OnExpire',[child],[direct()]);activate(f);if(replaced)f.entities[0]={...f.entities[0]!};advanceSkillEffects(f.runtime,150,f.env);expect(f.entities[1]!.currentHp).toBe(960);expect(f.entities[0]!.currentHp).toBe(replaced?50:70);expect(heals(f)).toHaveLength(replaced?0:2);}
});
it('LS06 coarse/fine Root and Child timelines match HP/events/RNG/delivery counts and cleanup',()=>{
 const run=(times:number[])=>{const f=composition('OnHit',[steal(projectile('pierce'),.5)],[steal(sequence()),steal(projectile('pierce'))]);activate(f);for(const t of times)advanceSkillEffects(f.runtime,t,f.env);const result={hp:f.entities.map(e=>e.currentHp),events:f.events,rolls:f.rolls(),results:f.results,bullets:f.runtime.bullets.length,captures:f.captures()};clearSkillEffects(f.runtime);return result;};
 expect(run([1400])).toEqual(run([100,150,200,250,350,530,800,1000,1400]));expect(run([1400]).hp[0]).toBeGreaterThan(50);
});
it.each(['dead','replaced'] as const)('LS04/05 emitted Child projectile still damages after %s source, without recovery',kind=>{
 const f=composition('OnHit',[steal(projectile('pierce'))],[direct()]);activate(f);f.positions.actor1={x:200,y:50};advanceSkillEffects(f.runtime,50,f.env);expect(f.runtime.bullets).toHaveLength(1);
 if(kind==='dead')f.entities[0]!.currentHp=0;else f.entities[0]={...f.entities[0]!};
 advanceSkillEffects(f.runtime,1500,f.env);expect(f.entities[1]!.currentHp).toBe(960);expect(f.entities[0]!.currentHp).toBe(kind==='dead'?0:50);expect(heals(f)).toEqual([]);
});
it('LS05 existing live-child budget rejection creates no Child damage or recovery',()=>{
 const f=composition();const binding=f.executionEnv.triggers!,base=binding.bundle;
 const bundle=pinSkillTriggerBundle({...base,links:Array.from({length:33},(_,i)=>({...base.links[0]!,linkId:'link'+i}))});Object.assign(f.executionEnv,{triggers:{...binding,bundle}});
 activate(f);advanceSkillEffects(f.runtime,50,f.env);expect(f.results).toMatchObject([{status:'rejected',dimension:'maxLiveChildren'}]);expect(f.entities[0]!.currentHp).toBe(55);expect(f.entities[1]!.currentHp).toBe(980);expect(heals(f)).toHaveLength(1);
});
it('LS04 source replaced after admission cannot gain Root Lifesteal at dispatch',()=>{
 const f=setup();activate(f,()=>{f.entities[0]={...f.entities[0]!};});expect(f.entities[1]!.currentHp).toBe(980);expect(f.entities[0]!.currentHp).toBe(50);expect(heals(f)).toEqual([]);
});
it('LS04 committed recovery still notifies after damage observer disposes; later ordered effects stop',()=>{
 const f=setup([steal(),steal()]);const emit=f.env.emit;f.env.emit=e=>{emit(e);if(e.type==='damage-applied'){expect(f.entities[0]!.currentHp).toBe(55);clearSkillEffects(f.runtime);}};
 activate(f);expect(f.entities[0]!.currentHp).toBe(55);expect(f.entities[1]!.currentHp).toBe(980);expect(f.events.map(e=>e.type)).toEqual(['damage-applied','healing-applied','effect-hit']);
});
