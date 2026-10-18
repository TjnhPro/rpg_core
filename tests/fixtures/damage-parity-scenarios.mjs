// Inputs/observations only. Historical arithmetic is captured from accepted Git blobs.
import {encode as scalar} from './stat-parity-scenarios.mjs';
export function encode(value) {
  if (value === undefined) return {$undefined: true};
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,encode(v)]));
  return scalar(value);
}
export const keys = ['str','dex','int','vit','physicalAttack','magicAttack'];
export function damageInput(trace = []) {
  return {definition:{base:10,flat:1,perRank:.5,scaling:Object.fromEntries(keys.map(k=>[k,.1]))},
    sources:Object.fromEntries(keys.map(k=>[k,1])),rank:2,flat:2,
    settings:{skills:{},modifiers:[]},context:{type:'Physical',tags:['Basic'],target:'Boss',statuses:[]},
    criticalChance:.5,criticalBonus:.25,roll:()=>{trace.push('crit');return 0;}};
}
export const setting = (changes={}) => ({id:'bonus',enabled:true,value:.2,source:'setting',option:'x',types:[],tags:[],targets:[],statuses:[],...changes});
export const combat = (target='flat_damage',changes={}) => ({id:'a',source:'setting',sourceInstanceId:'s',target,operation:target==='damage_bonus'?'add_percentage_points':'add_flat',enabled:true,value:2,conditions:[],...changes});
export function observeDamage(api, defaults) {
  const cases=[];
  function record(name, setup) {
    const trace=[],input=damageInput(trace);
    try {const result=setup(input,trace);cases.push({name,result:encode(result===undefined?api.calculateDamage(input):result),trace:encode(trace)});}
    catch(e){cases.push({name,error:{name:e.name,message:e.message},trace:encode(trace)});}
  }
  record('default',()=>{});
  for(const rank of [undefined,1,0,-2,2,5,NaN,Infinity])record(`rank:${rank}`,i=>{i.rank=rank;});
  for(const perRank of [0,-2,NaN,Infinity])record(`perRank:${perRank}`,i=>{i.definition.perRank=perRank;});
  for(const base of [0,-10,-0,Number.MAX_VALUE,NaN,Infinity])record(`base:${base}`,i=>{i.definition.base=base;});
  for(const source of keys)record(`source:${source}`,i=>{i.sources=Object.fromEntries(keys.map(k=>[k,k===source?7:0]));});
  record('scaling:cancellation-order',i=>{i.definition.scaling=Object.fromEntries(keys.map(k=>[k,1]));i.definition.perRank=0;i.sources={str:1e16,dex:1,int:-1e16,vit:.1,physicalAttack:.2,magicAttack:.3};});
  for(const field of ['definition','input','registry','offense'])record(`flat:${field}`,i=>{
    if(field==='definition')i.definition.flat=17;
    if(field==='input')i.flat=13;
    if(field==='registry')i.flatModifiers=[combat()];
    if(field==='offense'){const snapshot=api.snapshotActorDamage(i.definition,i.sources,[combat('damage.flat')],i.settings,i.criticalChance,i.criticalBonus);Object.assign(i,snapshot);}
  });
  for(const [name,mods] of [
    ['setting',[setting()]],['disabled',[setting({enabled:false})]],['type',[setting({types:['Magic']})]],
    ['tag',[setting({tags:['Core']})]],['target',[setting({targets:['Elite']})]],['status',[setting({statuses:['Poison']})]],
    ['negative',[setting({value:-2})]],['item',[setting({source:'item'})]],['item-missing',[setting({source:'item',option:'missing'})]],
    ['item-ineligible',[setting({source:'item',enabled:false})]],
    ['sum-order',[setting({id:'a',value:1e16}),setting({id:'b',value:1}),setting({id:'c',value:-1e16}),setting({id:'d',value:.2})]],
  ])record(`bonus:${name}`,i=>{i.settings.modifiers=mods;i.options=[{id:'x',value:2,source:'one'},{id:'x',value:.1,source:'two'},{id:'other',value:9}];});
  for(const value of [-.2,0,.3])record(`canonical-bonus:${value}`,i=>{i.bonusModifiers=[combat('damage_bonus',{value})];});
  record('canonical-bonus:diagnostics',i=>{i.bonusModifiers=[combat('damage_bonus',{value:.3,eventTags:['magic']}),combat('damage_bonus',{id:'b',value:.2})];});
  for(const roll of [0,.5,1,-1,NaN,Infinity])record(`crit-roll:${roll}`,i=>{i.roll=roll;});
  for(const chance of [0,-1,1,NaN,Infinity])record(`crit-chance:${chance}`,i=>{i.criticalChance=chance;});
  for(const bonus of [-1,NaN,Infinity])record(`crit-bonus:${bonus}`,i=>{i.criticalBonus=bonus;});
  for(const mode of ['success','fail','zero','disabled','dot','invalid','throws'])record(`dodge:${mode}`,(i,t)=>{
    i.context.defender={source:{id:'a',level:3},target:{id:'b',level:1},mechanic:mode==='dot'?'dot':'direct_hit',dodgeChance:mode==='zero'?0:.5};
    i.defenseConfig={revision:2,settings:structuredClone(defaults)};
    if(mode==='disabled')i.defenseConfig.settings.types.dodgeChance.enabled=false;
    i.dodgeRoll=()=>{t.push('dodge');if(mode==='throws')throw Error('dodge callback');return mode==='invalid'?NaN:mode==='success'?0:1;};
    if(mode==='success')Object.defineProperty(i.definition,'perRank',{get(){throw Error('B0 unread');}});
  });
  for(const type of ['Physical','Magic'])for(const mode of ['configured','missing','disabled','invalid'])record(`defense:${type}:${mode}`,i=>{
    i.context.type=type;i.armor=100;i.context.defender={source:{id:'a',level:3},target:{id:'b',level:1},mechanic:'direct_hit',magicResistanceRating:300};
    i.defenseConfig={revision:7,settings:structuredClone(defaults)};
    if(mode!=='missing')for(const k of ['armorReduction','magicReduction'])i.defenseConfig.settings.types[k].coefficients={baseK:100,levelPenalty:.25};
    if(mode==='disabled')for(const k of ['armorReduction','magicReduction'])i.defenseConfig.settings.types[k].enabled=false;
    if(mode==='invalid')i.context.defender.source.id='';
  });
  for(const mode of ['flat-target','bonus-target','condition','conflict','registry-budget','settings-budget','invalid-defense-and-flat'])record(`validation:${mode}`,i=>{
    if(mode==='flat-target')i.flatModifiers=[combat('str')];
    if(mode==='bonus-target')i.bonusModifiers=[combat()];
    if(mode==='condition')i.flatModifiers=[combat('flat_damage',{conditions:['x']})];
    if(mode==='conflict')i.flatModifiers=[combat(),combat('flat_damage',{value:3})];
    if(mode==='registry-budget')i.flatModifiers=Array.from({length:257},(_,n)=>combat('flat_damage',{id:String(n)}));
    if(mode==='settings-budget')i.settings.modifiers=Array.from({length:357},()=>setting());
    if(mode==='invalid-defense-and-flat'){i.flatModifiers=[combat('str')];i.armor=NaN;}
  });
  for(const mode of ['b0-trace','source-mutation','flat-after-resolve','item-product','ineligible-item-error','critical-mutation','critical-error','eligibility-mutation','bonus-live-read','entity-capture'])record(`timing:${mode}`,(i,t)=>{
    if(mode==='b0-trace'){
      for(const field of ['perRank','base','flat']){const v=i.definition[field];Object.defineProperty(i.definition,field,{get(){t.push(`definition.${field}`);return v;}});}
      for(const id of keys){Object.defineProperty(i.sources,id,{get(){t.push(`source.${id}`);return 1;}});Object.defineProperty(i.definition.scaling,id,{get(){t.push(`coefficient.${id}`);return .1;}});}
      for(const field of ['rank','flat']){const v=i[field];Object.defineProperty(i,field,{get(){t.push(field);return v;}});}
    }
    if(mode==='source-mutation')Object.defineProperty(i.sources,'str',{get(){t.push('source.str');i.definition.scaling.str=.7;i.sources.dex=99;return 3;}});
    if(mode==='flat-after-resolve'){
      const m=combat();let reads=0;Object.defineProperty(m,'value',{enumerable:true,get(){t.push('flat.value');if(++reads>1){i.definition.flat=9;i.flat=8;}return 2;}});i.flatModifiers=[m];
      Object.defineProperty(i.definition,'flat',{get(){t.push('definition.flat');return 9;},set(v){t.push(`set.flat:${v}`);}});
    }
    if(['item-product','ineligible-item-error','critical-mutation'].includes(mode)){
      let coefficient=.1;const m=setting({source:'item'});Object.defineProperty(m,'value',{enumerable:true,get(){t.push('modifier.value');return coefficient;}});
      const a={id:'x',get value(){t.push('option.a');coefficient=.3;return 2;}},b={id:'x',get value(){t.push('option.b');coefficient=.4;return 3;}};
      i.settings.modifiers=[m];i.options=[a,b];
      if(mode==='ineligible-item-error'){m.enabled=false;Object.defineProperty(a,'value',{get(){t.push('option.error');throw Error('disabled item still computes');}});}
      if(mode==='critical-mutation')i.roll=()=>{t.push('crit');coefficient=99;i.options.push({id:'x',value:100});i.definition.base=999;i.criticalChance=0;i.criticalBonus=99;return 0;};
    }
    if(mode==='critical-error')i.roll=()=>{t.push('crit');throw Error('critical callback');};
    if(mode==='eligibility-mutation'){
      const m=setting();Object.defineProperty(m,'enabled',{get(){t.push('enabled');m.value=.7;m.types=['Magic'];return true;}});i.settings.modifiers=[m];
    }
    if(mode==='bonus-live-read'){
      const m=combat('damage_bonus',{value:.2});let n=0;Object.defineProperty(m,'value',{enumerable:true,get(){t.push('bonus.value');return ++n/10;}});i.bonusModifiers=[m];
    }
    if(mode==='entity-capture'){
      i.context.entities={attacker:{entityId:'a',entityType:'player',level:1,targetTags:[]},defender:{entityId:'b',entityType:'monster',level:1,targetTags:['boss']},defenderStats:{armor:0,magicResistance:0,dodgeChance:0}};
      Object.defineProperty(i,'flat',{get(){t.push('input.flat');return 2;}});i.roll=()=>{t.push('crit');i.definition.flat=77;return 1;};
    }
  });
  record('timing:container-accessors',(i,t)=>{
    const sources=i.sources,scaling=i.definition.scaling;
    Object.defineProperty(i,'sources',{get(){t.push('sources');return sources;}});
    Object.defineProperty(i.definition,'scaling',{get(){t.push('scaling');return scaling;}});
    let n=0;Object.defineProperty(i,'roll',{get(){t.push('roll.get');return ()=>{t.push('roll.call');return ++n/10;};}});
  });
  record('timing:critical-late-bonus-and-defense',(i,t)=>{
    i.armor=100;i.defenseConfig={revision:1,settings:structuredClone(defaults)};
    i.defenseConfig.settings.types.armorReduction.coefficients={baseK:100,levelPenalty:0};
    i.context.defender={source:{id:'a',level:1},target:{id:'b',level:1},mechanic:'direct_hit'};
    const m=setting();i.settings.modifiers=[m];
    i.roll=()=>{t.push('crit');i.definition.base=999;i.flat=99;m.value=99;i.armor=900;i.criticalBonus=.75;i.defenseConfig.settings.types.armorReduction.coefficients.baseK=200;return 0;};
  });
  record('bonus:item-fp-product-order',i=>{
    i.settings.modifiers=[setting({source:'item',value:.1})];i.options=[{id:'x',value:1e16},{id:'x',value:1},{id:'x',value:-1e16},{id:'x',value:.3}];
  });
  record('bonus:reason-precedence',i=>{
    i.settings.modifiers=[setting({enabled:false,types:['Magic'],tags:['Core'],targets:['Elite'],statuses:['Poison']}),setting({id:'b',types:['Magic'],tags:['Core'],targets:['Elite'],statuses:['Poison']}),setting({id:'c',tags:['Core'],targets:['Elite'],statuses:['Poison']}),setting({id:'d',targets:['Elite'],statuses:['Poison']}),setting({id:'e',statuses:['Poison']})];
  });
  record('flat:type-scope-filter',i=>{i.flatModifiers=[combat('flat_damage',{id:'a',damageType:'magic'}),combat('flat_damage',{id:'b',scope:'dot'}),combat('flat_damage',{id:'c',damageType:'physical',scope:'all',value:3})];});
  record('identities:aliases-and-last-duplicate',i=>{
    const first=combat(),last={...first},option={id:'x',value:2};
    i.flatModifiers=[first,last];i.options=[option];i.settings.modifiers=[setting({source:'item'})];
    const r=api.calculateDamage(i),before=encode(r);
    const identities={lastDuplicate:r.b0.flatModifiers[0]===last,item:r.b1.modifiers[0].sources[0]===option,newItemArray:r.b1.modifiers[0].sources!==i.options};
    option.value=99;last.value=9;
    return {before,identities,after:encode(r)};
  });
  for(const point of ['scaling','flat','option','critical','dodge'])record(`identities:error:${point}`,(i,t)=>{
    const error={point},fail=()=>{t.push(point);throw error;};
    if(point==='scaling')Object.defineProperty(i.sources,'str',{get:fail});
    if(point==='flat')Object.defineProperty(i.definition,'flat',{get:fail});
    if(point==='option'){i.settings.modifiers=[setting({source:'item'})];i.options=[{id:'x',get value(){return fail();}}];}
    if(point==='critical')i.roll=fail;
    if(point==='dodge'){i.context.defender={source:{id:'a'},target:{id:'b'},mechanic:'direct_hit',dodgeChance:.5};i.defenseConfig={revision:1,settings:structuredClone(defaults)};i.dodgeRoll=fail;}
    try{api.calculateDamage(i);return {thrown:false};}catch(e){return {thrown:true,same:e===error};}
  });
  return cases;
}
