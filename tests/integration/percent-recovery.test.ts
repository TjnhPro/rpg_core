import {expect,it} from 'vitest';
import {fixture,direct} from '../fixtures/skill-core.js';
import {advanceSkillExecution,advanceSkillEffects,dispatchSkillEffects,clearSkillEffects,pinSkillInstanceDefinition,pinSkillTriggerBundle,inspectSkillInstance,validateSkillTriggerReceipt,type SkillGameplayEffect,type SkillActivatedEvent,type SkillTriggerResult} from '../../src/skills/index.js';
type Recovery=Extract<SkillGameplayEffect,{type:'heal'|'restore_mana'}>;
const recovery=(type:Recovery['type']='heal',target:'self'|'selected'='self',rate=.2):Recovery=>({type,target,amount:{percentOfMax:rate}});
function setup(effects:SkillGameplayEffect[]=[recovery(),recovery('restore_mana','self',.3)],selected=false){
 const f=fixture(effects,0,true,'percent');f.definition.mpCost=10;f.definition.cooldownMs=1000;
 for(const i of [0,3]){f.entities[i]!.baseStats.maxHp=1000;f.entities[i]!.baseStats.maxMana=500;f.entities[i]!.currentHp=400;f.entities[i]!.currentMp=100;}
 f.env.resourceStats=e=>({maxMana:f.stats(e).maxMana});
 if(selected){f.definition.allowedTargetRelations=['self','ally'];f.context.target={mode:'entity',casterId:'actor0',targetId:'actor3'};}return f;
}
function activate(f:ReturnType<typeof fixture>,mutate=()=>{}){expect(f.start().success).toBe(true);mutate();advanceSkillEffects(f.runtime,50,f.env);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);const event=f.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated')!;if(event)dispatchSkillEffects(f.runtime,event,f.env);return event;}
const resources=(f:ReturnType<typeof fixture>)=>f.events.filter(e=>e.type==='healing-applied'||e.type==='mana-gained');
it.each(['heal','restore_mana'] as const)('PR01 %s closes percent schema and rejects before commitments',type=>{
 const amounts:unknown[]=[...[-1,0,NaN,Infinity,1.001,20,'0.2',undefined].map(percentOfMax=>({percentOfMax})),{},null,[],{percentOfMax:.2,amount:10},{percentOfMax:.2,extra:1},{percentOfMax:.2,flat:10}];
 const invalid:unknown[]=[...amounts.map(amount=>({type,target:'self',amount})),{...recovery(type),percentOfMax:.3},{...recovery(type),onHit:[]},{...recovery(type),lifesteal:{rate:.2}},{...recovery(type),manaOnHit:{amount:5}},{...recovery(type),allowedTargetRelations:['enemy']},{...recovery(type),target:'area'}];
 for(const effect of invalid){const f=setup([effect as SkillGameplayEffect]);expect(f.start().success).toBe(false);expect(f.entities[0]!.currentMp).toBe(100);expect(f.slot.actionSerial).toBeUndefined();expect(f.cooldowns.readyAt.size).toBe(0);expect(f.captures()).toBe(0);}
 const f=setup(Array(33).fill(recovery(type)));expect(f.start().success).toBe(false);expect(f.entities[0]!.currentMp).toBe(100);
});
it.each([[400,.2,600,200],[950,.2,1000,50],[1000,.2,1000,0],[400,1,1000,600],[400,.0001,400.1,.10000000000002274]] as const)('PR02 HP%s rate%s uses Max HP and actual cap',(before,rate,after,applied)=>{
 const f=setup([recovery('heal','selected',rate)],true);f.entities[3]!.currentHp=before;activate(f);expect(f.entities[3]!.currentHp).toBe(after);expect(resources(f)).toEqual(applied?[{type:'healing-applied',entityId:'actor3',atMs:50,before,after,appliedHealing:applied}]:[]);
});
it.each([[100,500,.3,250,150],[450,500,.3,500,50],[500,500,.3,500,0],[0,500,.3,150,150],[0,0,.3,0,0],[100,500,1,500,400]] as const)('PR03 MP%s max%s rate%s',(before,max,rate,after,applied)=>{
 const f=setup([recovery('restore_mana','selected',rate)],true);f.entities[3]!.currentMp=before;f.entities[3]!.baseStats.maxMana=max;activate(f);expect(f.entities[3]!.currentMp).toBe(after);expect(resources(f)).toEqual(applied?[{type:'mana-gained',entityId:'actor3',atMs:50,before,after,appliedMana:applied}]:[]);
});
it('PR04/05 mixed numeric/percent entries preserve authored order, costs and committed observations',()=>{
 const f=setup([{type:'heal',target:'self',amount:10},recovery(),{type:'restore_mana',target:'self',amount:5},recovery('restore_mana','self',.3)]);const seen:number[][]=[];const emit=f.env.emit;f.env.emit=e=>{seen.push([f.entities[0]!.currentHp,f.entities[0]!.currentMp]);emit(e);};const event=activate(f);
 expect(seen).toEqual([[410,90],[610,90],[610,95],[610,245]]);expect(f.events.map(e=>e.type)).toEqual(['healing-applied','healing-applied','mana-gained','mana-gained']);expect(f.rolls()).toEqual({critCalls:0,dodgeCalls:0,positionCalls:0});expect(f.captures()).toBe(1);expect(f.slot.actionSerial).toBe(1);expect(f.cooldowns.readyAt.get('actor0')!.get('test')).toBe(1000);expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);expect(resources(f)).toHaveLength(4);
 const g=setup();activate(g);expect([g.entities[0]!.currentHp,g.entities[0]!.currentMp]).toEqual([600,240]);
 const poor=setup();poor.entities[0]!.currentMp=9;expect(poor.start().success).toBe(false);expect(poor.entities[0]!.currentMp).toBe(9);expect(poor.captures()).toBe(0);
});
it('PR02/03 live recipient maximum is resolved once per effect including canonical modifiers',()=>{
 const f=setup([recovery('heal','selected'),recovery('restore_mana','selected',.3)],true);const seen:string[]=[];const defense=f.env.defenseStats;f.env.defenseStats=e=>{seen.push('hp:'+e.entityId);return defense(e);};f.env.resourceStats=e=>{seen.push('mp:'+e.entityId);return {maxMana:f.stats(e).maxMana};};activate(f,()=>{f.modifiers.actor3=[{id:'hp',source:'buff',sourceInstanceId:'live',target:'maxHp',operation:'add_flat',value:200,enabled:true,conditions:[]},{id:'mp',source:'buff',sourceInstanceId:'live',target:'maxMana',operation:'add_flat',value:100,enabled:true,conditions:[]}];});expect(seen).toEqual(['hp:actor3','mp:actor3']);expect([f.entities[3]!.currentHp,f.entities[3]!.currentMp]).toEqual([640,280]);expect([f.entities[0]!.currentHp,f.entities[0]!.currentMp]).toEqual([400,90]);
});
it.each(['heal','restore_mana'] as const)('PR02/03 %s invalid live stats/state or absent resolver never mutate resources',type=>{
 for(const kind of ['nan','infinity','negative','throw','missing','invalid-current','over-max']){const f=setup([recovery(type,'selected')],true);const t=f.entities[3]!;
  if(type==='heal'){if(kind==='throw')f.env.defenseStats=()=>{throw Error('stats');};else if(kind==='missing')Object.assign(f.env,{defenseStats:undefined});else if(kind==='invalid-current')t.currentHp=NaN;else if(kind==='over-max')t.currentHp=1001;else f.env.defenseStats=()=>({maxHp:kind==='nan'?NaN:kind==='infinity'?Infinity:-1,armor:0,magicResistance:0,dodgeChance:0});}
  else{if(kind==='throw')f.env.resourceStats=()=>{throw Error('stats');};else if(kind==='missing')delete f.env.resourceStats;else if(kind==='invalid-current')t.currentMp=NaN;else if(kind==='over-max')t.currentMp=501;else f.env.resourceStats=()=>({maxMana:kind==='nan'?NaN:kind==='infinity'?Infinity:-1});}
  const before=[t.currentHp,t.currentMp];activate(f);expect([t.currentHp,t.currentMp]).toEqual(before);expect(resources(f)).toEqual([]);expect(f.entities[0]!.currentMp).toBe(90);
 }
});
it('PR01/02/03 finite maximal resource multiplication and gain cannot overflow',()=>{
 for(const type of ['heal','restore_mana'] as const){const f=setup([recovery(type,'selected',1)],true);const t=f.entities[3]!;if(type==='heal'){t.currentHp=Number.MAX_VALUE/2;f.env.defenseStats=()=>({maxHp:Number.MAX_VALUE,armor:0,magicResistance:0,dodgeChance:0});}else{t.currentMp=Number.MAX_VALUE/2;f.env.resourceStats=()=>({maxMana:Number.MAX_VALUE});}activate(f);expect(type==='heal'?t.currentHp:t.currentMp).toBe(Number.MAX_VALUE);expect(resources(f)).toHaveLength(1);}
});
function composition(selected=false,both=false){
 const effects=[recovery('heal',selected?'selected':'self'),...(both?[recovery('restore_mana',selected?'selected':'self',.3)]:[])];
 const f=setup(selected?[direct()]:[],selected),results:SkillTriggerResult[]=[];
 const child={...f.definition,skillId:'percent-child',targetMode:selected?'entity' as const:'self' as const,allowedTargetRelations:['self','ally'] as const,effects};
 const bundle=pinSkillTriggerBundle({version:'v1',rootSkillId:'test',definitions:[pinSkillInstanceDefinition(f.definition,'v1',100),pinSkillInstanceDefinition(child,'percent-child',100)],links:[{linkId:'percent',sourceSkillId:'test',childSkillId:'percent-child',trigger:selected?'OnHit':'OnExpire',delayMs:50,maxOccurrences:1}]});Object.assign(f.executionEnv,{skillInstanceLifetimeMs:100,triggers:{bundle,executeChildren:true,observe:(r:SkillTriggerResult)=>results.push(r)}});return {...f,results,effects};
}
it('PR06 Child-only percent HP pins source with empty Root; uses own frozen rate and live modified Max HP',()=>{
 const f=composition();const event=activate(f);f.modifiers.actor0=[{id:'hp',source:'buff',sourceInstanceId:'child-live',target:'maxHp',operation:'add_flat',value:200,enabled:true,conditions:[]}];const effect=f.effects[0]!;if(typeof effect.amount!=='number')Object.assign(effect.amount,{percentOfMax:1});advanceSkillEffects(f.runtime,200,f.env);
 expect(f.entities[0]!.currentHp).toBe(640);expect(resources(f)).toMatchObject([{type:'healing-applied',atMs:200,before:400,after:640,appliedHealing:240}]);const receipt=f.results[0]!.receipt!,child=inspectSkillInstance(f.runtime,receipt.receiptId)!;expect(child.rootOffense).toBe(event.snapshot.rootOffense);expect(child.instanceId).not.toBe(receipt.instanceId);expect(child.configVersion).toBe('percent-child');expect(Object.isFrozen((child.definition!.effects![0] as Recovery).amount)).toBe(true);expect(validateSkillTriggerReceipt(f.runtime,receipt)).toEqual({success:true,changed:false});advanceSkillEffects(f.runtime,200,f.env);expect(resources(f)).toHaveLength(1);expect(f.entities[0]!.currentMp).toBe(90);expect(f.captures()).toBe(1);expect(f.slot.actionSerial).toBe(1);expect(f.cooldowns.readyAt.get('actor0')!.get('test')).toBe(1000);expect(f.rolls()).toEqual({critCalls:0,dodgeCalls:0,positionCalls:0});
});
it('PR06 selected Child reads ally live modifiers at receipt anchor after source moves',()=>{
 const f=composition(true,true);activate(f);advanceSkillEffects(f.runtime,50,f.env);f.positions.actor0={x:700,y:50};f.modifiers.actor3=[{id:'hp',source:'buff',sourceInstanceId:'live',target:'maxHp',operation:'add_flat',value:200,enabled:true,conditions:[]},{id:'mp',source:'buff',sourceInstanceId:'live',target:'maxMana',operation:'add_flat',value:100,enabled:true,conditions:[]}];advanceSkillEffects(f.runtime,100,f.env);expect([f.entities[3]!.currentHp,f.entities[3]!.currentMp]).toEqual([620,280]);expect(resources(f)).toMatchObject([{type:'healing-applied',appliedHealing:240},{type:'mana-gained',appliedMana:180}]);expect([f.entities[0]!.currentHp,f.entities[0]!.currentMp]).toEqual([400,90]);
});
it.each(['source-replaced','source-dead','target-replaced','target-dead','target-missing','enemy','far','disposed'] as const)('PR06 percent Child rejects %s without recovery or redirect',kind=>{
 const f=composition(true,true);activate(f);advanceSkillEffects(f.runtime,50,f.env);if(kind==='source-replaced')f.entities[0]={...f.entities[0]!};if(kind==='source-dead')f.entities[0]!.currentHp=0;if(kind==='target-replaced')f.entities[3]={...f.entities[3]!};if(kind==='target-dead')f.entities[3]!.currentHp=0;if(kind==='target-missing')f.entities.splice(3,1);if(kind==='enemy')f.entities[3]!.factionId='hostile';if(kind==='far')f.positions.actor3={x:700,y:50};if(kind==='disposed')clearSkillEffects(f.runtime);advanceSkillEffects(f.runtime,100,f.env);expect(resources(f)).toEqual([]);expect(f.entities[0]!.currentMp).toBe(90);
});
it('PR06 Child-only percent HP cannot bind a replaced original source at expiry',()=>{
 const f=composition();activate(f);f.entities[0]={...f.entities[0]!};advanceSkillEffects(f.runtime,200,f.env);expect(f.entities[0]!.currentHp).toBe(400);expect(resources(f)).toEqual([]);
});
it('PR02/03 percent Root cannot restore defeated/replaced targets or enemies and disposal stops ordered effects',()=>{
 for(const kind of ['dead','replaced','enemy'] as const){const f=setup([recovery('heal','selected'),recovery('restore_mana','selected')],true);activate(f,()=>{if(kind==='dead')f.entities[3]!.currentHp=0;if(kind==='replaced')f.entities[3]={...f.entities[3]!};if(kind==='enemy')f.entities[3]!.factionId='hostile';});expect(resources(f)).toEqual([]);expect(f.entities[3]!.currentHp).toBe(kind==='dead'?0:400);}
 const f=setup();const emit=f.env.emit;f.env.emit=e=>{emit(e);if(e.type==='healing-applied')clearSkillEffects(f.runtime);};activate(f);expect([f.entities[0]!.currentHp,f.entities[0]!.currentMp]).toEqual([600,90]);expect(resources(f)).toHaveLength(1);
});
it('PR07 coarse/fine advancement with modifier expiry at the Child boundary agrees on resources/events/instances/RNG',()=>{
 const run=(times:number[])=>{const f=composition(true,true);f.definition.effects=[{type:'modifier_effect',target:'selected',definition:{effectId:'cap',durationMs:50,stackingPolicy:'refresh',modifiers:[{id:'hp',target:'maxHp',operation:'add_flat',value:200,enabled:true,conditions:[]},{id:'mp',target:'maxMana',operation:'add_flat',value:100,enabled:true,conditions:[]}]}},direct()];const binding=f.executionEnv.triggers!;Object.assign(f.executionEnv,{triggers:{...binding,bundle:pinSkillTriggerBundle({...binding.bundle,definitions:[pinSkillInstanceDefinition(f.definition,'v1',100),binding.bundle.definitions[1]!]})}});activate(f);for(const t of times)advanceSkillEffects(f.runtime,t,f.env);return {resources:f.entities.map(e=>[e.currentHp,e.currentMp]),events:f.events,results:f.results,children:f.results.flatMap(r=>r.receipt?[inspectSkillInstance(f.runtime,r.receipt.receiptId)]:[]),rolls:f.rolls(),captures:f.captures(),groups:f.runtime.effects.groups()};};const coarse=run([300]);expect(coarse).toEqual(run([75,100,125,150,200,300]));expect(coarse.resources[3]).toEqual([580,250]);expect(coarse.events.filter(e=>e.type==='healing-applied')).toMatchObject([{atMs:100,appliedHealing:200}]);
});
