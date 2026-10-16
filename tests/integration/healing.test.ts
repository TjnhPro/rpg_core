import {expect,it} from 'vitest';
import {fixture,direct} from '../fixtures/skill-core.js';
import {advanceSkillExecution,advanceSkillEffects,dispatchSkillEffects,pinSkillInstanceDefinition,pinSkillTriggerBundle,inspectSkillInstance,clearSkillEffects,type SkillActivatedEvent,type SkillTriggerResult,type SkillGameplayEffect} from '../../src/skills/index.js';

const heal=(target:'self'|'selected'='selected',amount=30):SkillGameplayEffect=>({type:'heal',target,amount});
function ally(effects:SkillGameplayEffect[]=[heal()],root=false){
 const f=fixture(effects,0,root,root?'healing':undefined);
 f.definition.allowedTargetRelations=['self','ally'];f.context.target={mode:'entity',casterId:'actor0',targetId:'actor3'};
 f.entities[0]!.currentHp=50;f.entities[3]!.currentHp=90;f.entities[3]!.baseStats.maxHp=100;return f;
}
function activate(f:ReturnType<typeof fixture>,mutate=()=>{}){
 expect(f.start().success).toBe(true);mutate();advanceSkillEffects(f.runtime,50,f.env);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);
 const activation=f.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!;
 expect(activation).toBeDefined();dispatchSkillEffects(f.runtime,activation,f.env);return activation;
}
it('T3 real ally heal reads live cap, emits after HP commit and spends once; replay is inert',()=>{
 const f=ally();f.definition.cooldownMs=1000;
 const emit=f.env.emit;let eventHp=0;f.env.emit=e=>{if(e.type==='healing-applied')eventHp=f.entities[3]!.currentHp;emit(e);};
 const activation=activate(f,()=>{f.entities[3]!.baseStats.maxHp=110;});
 expect(f.entities[3]!.currentHp).toBe(110);expect(eventHp).toBe(110);
 expect(f.events).toEqual([{type:'healing-applied',entityId:'actor3',atMs:50,before:90,after:110,appliedHealing:20}]);
 const cooldown=f.cooldowns.readyAt.get('actor0')!.get('test');expect(cooldown).toBe(1000);
 expect(f.entities[0]!.currentMp).toBe(95);expect(f.slot.actionSerial).toBe(1);
 expect(dispatchSkillEffects(f.runtime,activation,f.env)).toBe(false);expect(f.events).toHaveLength(1);
 expect(f.cooldowns.readyAt.get('actor0')!.get('test')).toBe(cooldown);expect(f.rolls()).toEqual({critCalls:0,dodgeCalls:0,positionCalls:0});
});
it('T2 self heals caster even when Root selects an enemy, and selected self uses canonical self relation',()=>{
 const f=fixture([heal('self')]);f.entities[0]!.currentHp=50;activate(f);expect(f.entities[0]!.currentHp).toBe(80);expect(f.entities[1]!.currentHp).toBe(1000);
 const s=ally();s.definition.targetMode='self';s.context.target={mode:'self',casterId:'actor0'};activate(s);expect(s.entities[0]!.currentHp).toBe(80);
});
it.each(['enemy','missing','dead','replaced','source-replaced','far','blocked','no-position','bad-position','invalid-max','over-max','invalid-hp'] as const)('T2/5 rejected runtime %s preserves HP and accepted costs',kind=>{
 const f=ally();const mutate=()=>{
  const target=f.entities[3]!;
  if(kind==='enemy')target.factionId='hostile';
  if(kind==='missing')f.entities.splice(3,1);
  if(kind==='dead')target.currentHp=0;
  if(kind==='replaced')f.entities[3]={...target};
  if(kind==='source-replaced')f.entities[0]={...f.entities[0]!};
  if(kind==='far')f.positions.actor3={x:700,y:50};
  if(kind==='blocked')f.env.grid={...f.env.grid,cells:f.env.grid.cells.map((row,i)=>i===2?'110'+'1'.repeat(37):row)};
  if(kind==='no-position')delete f.positions.actor3;
  if(kind==='bad-position')f.positions.actor3={x:NaN,y:50};
  if(kind==='invalid-max')f.env.defenseStats=()=>({maxHp:NaN,armor:0,magicResistance:0,dodgeChance:0});
  if(kind==='over-max')target.currentHp=101;
  if(kind==='invalid-hp')target.currentHp=NaN;
 };
 activate(f,mutate);
 expect(f.events.some(e=>e.type==='effect-rejected')).toBe(true);expect(f.events.some(e=>e.type==='healing-applied')).toBe(false);
 expect(f.entities[3]?.currentHp).toBe(kind==='missing'?undefined:kind==='dead'?0:kind==='over-max'?101:kind==='invalid-hp'?NaN:90);
 expect(f.entities[0]!.currentMp).toBe(95);expect(f.rolls()).toEqual({critCalls:0,dodgeCalls:0,positionCalls:0});
});
it('T2/5 range rejects before cost, ground selected rejects at dispatch, full HP stays event-free',()=>{
 const f=ally();f.positions.actor3={x:700,y:50};expect(f.start()).toMatchObject({success:false,reason:'out_of_range'});expect(f.entities[0]!.currentMp).toBe(100);
 const g=ally();g.definition.targetMode='ground';g.context.target={mode:'ground',casterId:'actor0',position:{x:80,y:50}};activate(g);expect(g.events).toMatchObject([{type:'effect-rejected',reason:'invalid_target_mode'}]);
 const full=ally();full.entities[3]!.currentHp=100;activate(full);expect(full.events).toEqual([]);
});
it('T5 invalid definition rejects before MP, serial or S0 capture',()=>{
 const values:unknown[]=[heal('self',0),heal('self',-1),heal('self',NaN),heal('self',Infinity),heal('self',1000001),{...heal(),extra:true},{...heal(),onHit:[]},{...heal(),target:'area'},{...heal(),allowedTargetRelations:['enemy']},{...heal(),allowedTargetRelations:[]}];
 for(const value of values){const f=ally([value as SkillGameplayEffect],true);expect(f.start().success).toBe(false);expect(f.entities[0]!.currentMp).toBe(100);expect(f.slot.actionSerial).toBeUndefined();expect(f.captures()).toBe(0);}
});
function composition(delay=0,selected=false){
 const f=ally(selected?[direct()]:[heal('self')],true);const results:SkillTriggerResult[]=[];
 const root=pinSkillInstanceDefinition(f.definition,'v1',100);
 const child=pinSkillInstanceDefinition({...f.definition,skillId:'healing-child',targetMode:selected?'entity':'self',effects:[heal(selected?'selected':'self')]},'child',100);
 const bundle=pinSkillTriggerBundle({version:'v1',rootSkillId:'test',definitions:[root,child],links:[{linkId:'expiry',sourceSkillId:'test',childSkillId:'healing-child',trigger:selected?'OnHit':'OnExpire',delayMs:delay,maxOccurrences:1},...(selected?[]:[{linkId:'hit',sourceSkillId:'test',childSkillId:'healing-child',trigger:'OnHit' as const,delayMs:0,maxOccurrences:1}]),{linkId:'kill',sourceSkillId:'test',childSkillId:'healing-child',trigger:'OnKill',delayMs:0,maxOccurrences:1}]});
 Object.assign(f.executionEnv,{skillInstanceLifetimeMs:100,triggers:{bundle,executeChildren:true,observe:(r:SkillTriggerResult)=>results.push(r)}});return {...f,results};
}
it('T4/5 natural expiry creates trusted Child healing with shared S0, single cost and guarded callbacks',()=>{
 const f=composition();const activation=activate(f);expect(f.results).toEqual([]);expect(f.captures()).toBe(1);
 const emit=f.env.emit;let replay:boolean|undefined;f.env.emit=e=>{if(e.type==='healing-applied')replay=dispatchSkillEffects(f.runtime,activation,f.env);emit(e);};
 f.positions.actor0={x:700,y:50}; // Child uses pinned expiry origin, not current caster position.
 advanceSkillEffects(f.runtime,150,f.env);
 expect(f.entities[0]!.currentHp).toBe(110);expect(f.entities[3]!.currentHp).toBe(90);expect(replay).toBe(false);
 expect(f.results).toHaveLength(1);const receipt=f.results[0]!.receipt!;
 const child=inspectSkillInstance(f.runtime,receipt.receiptId)!;expect(child.parentInstanceId).toBe(receipt.instanceId);expect(child.rootOffense).toBe(activation.snapshot.rootOffense);expect(child.configVersion).toBe('child');
 expect(f.events.filter(e=>e.type==='healing-applied')).toHaveLength(2);expect(f.events.some(e=>e.type==='effect-hit'||e.type==='damage-applied'||e.type==='entity-defeated')).toBe(false);
 expect(f.rolls()).toEqual({critCalls:0,dodgeCalls:0,positionCalls:0});expect(f.captures()).toBe(1);expect(f.entities[0]!.currentMp).toBe(95);expect(f.slot.actionSerial).toBe(1);
 const events=JSON.stringify(f.events);advanceSkillEffects(f.runtime,150,f.env);expect(JSON.stringify(f.events)).toBe(events);clearSkillEffects(f.runtime);advanceSkillEffects(f.runtime,400,f.env);expect(JSON.stringify(f.events)).toBe(events);
});
it.each(['replaced','dead','far'] as const)('T4 delayed Child rejects %s target without healing',kind=>{
 const f=composition(50,true);activate(f);advanceSkillEffects(f.runtime,50,f.env);
 if(kind==='replaced')f.entities[3]={...f.entities[3]!};if(kind==='dead')f.entities[3]!.currentHp=0;if(kind==='far')f.positions.actor3={x:700,y:50};
 advanceSkillEffects(f.runtime,100,f.env);expect(f.entities[3]!.currentHp).toBe(kind==='dead'?0:70);expect(f.events.filter(e=>e.type==='healing-applied')).toHaveLength(0);
});
it('T4 selected Child heals from authenticated contact origin after caster moves',()=>{
 const f=composition(50,true);activate(f);advanceSkillEffects(f.runtime,50,f.env);expect(f.entities[3]!.currentHp).toBe(70);
 const rolls=f.rolls();f.positions.actor0={x:700,y:50};advanceSkillEffects(f.runtime,100,f.env);
 expect(f.entities[3]!.currentHp).toBe(100);expect(f.rolls()).toEqual(rolls);expect(f.captures()).toBe(1);expect(f.entities[0]!.currentMp).toBe(95);
 expect(f.events.filter(e=>e.type==='healing-applied')).toEqual([{type:'healing-applied',entityId:'actor3',atMs:100,before:70,after:100,appliedHealing:30}]);
});
it('T5 ordered healing pins recipients across event callbacks and stops on disposal',()=>{
 const f=ally([heal(),heal()]);f.entities[3]!.currentHp=20;
 const emit=f.env.emit;f.env.emit=e=>{emit(e);if(e.type==='healing-applied')f.entities[3]={...f.entities[3]!};};
 activate(f);expect(f.entities[3]!.currentHp).toBe(50);expect(f.events.filter(e=>e.type==='healing-applied')).toHaveLength(1);expect(f.events.at(-1)).toMatchObject({type:'effect-rejected',reason:'invalid_healing_target'});
 const g=ally([heal('self'),heal()]);const original=g.env.emit;g.env.emit=e=>{original(e);if(e.type==='healing-applied')clearSkillEffects(g.runtime);};activate(g);expect(g.entities[3]!.currentHp).toBe(90);expect(g.events.filter(e=>e.type==='healing-applied')).toHaveLength(1);
});
it('T2 effect relations can narrow self/ally but never inherit enemy eligibility',()=>{
 const restricted=ally([{type:'heal',target:'selected',amount:30,allowedTargetRelations:['self']}]);activate(restricted);
 expect(restricted.entities[3]!.currentHp).toBe(90);expect(restricted.events).toMatchObject([{type:'effect-rejected',reason:'invalid_target_relation'}]);
 const allowed=ally([{type:'heal',target:'selected',amount:30,allowedTargetRelations:['ally']}]);activate(allowed);expect(allowed.entities[3]!.currentHp).toBe(100);
});
