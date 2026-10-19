// Observations and caller inputs only; no second calculation implementation.
import {encode,damageInput,combat} from './damage-parity-scenarios.mjs';
export const context=()=>({source:{id:'a',level:5},target:{id:'b',level:1},damageType:'Physical',tags:[],mechanic:'direct_hit',armorRating:100,magicResistanceRating:300,dodgeChance:.5});
export function snapshot(defaults){const settings=structuredClone(defaults);for(const key of ['armorReduction','magicReduction'])settings.types[key].coefficients={baseK:100,levelPenalty:.25};return {revision:7,settings};}
function keyOrder(value,path='$',out=[]){if(value&&typeof value==='object'){out.push([path,Object.keys(value)]);for(const key of Object.keys(value))keyOrder(value[key],`${path}.${key}`,out);}return out;}
export function observeDefense(api,defaults){
 const cases=[];
 function record(name,run){const trace=[],c=context(),s=snapshot(defaults),i=damageInput(trace);try{const result=run({c,s,i,t:trace});cases.push({name,result:encode(result),keys:keyOrder(result),trace:encode(trace)});}catch(e){cases.push({name,error:encode({name:e?.name,message:e?.message}),trace:encode(trace)});}}
 function watch(o,key,label,t,hook){let value=o[key],count=0;Object.defineProperty(o,key,{enumerable:true,configurable:true,get(){t.push(label);return hook?hook(++count,value):value;},set(v){t.push(`set:${label}`);value=v;}});}
 for(const chance of [undefined,0,.5,1,2,-1,NaN,Infinity,-0])for(const mode of ['direct','dot','disabled'])record(`hit:${chance}:${mode}`,({c,s,t})=>{c.dodgeChance=chance;c.mechanic=mode==='dot'?'dot':'direct_hit';s.settings.types.dodgeChance.enabled=mode!=='disabled';return api.resolveDefenseHit(c,s,()=>{t.push('dodge');return .5;});});
 for(const roll of [-.1,0,.499,.5,1,1.1,NaN,Infinity,-Infinity,null,undefined])record(`hit:roll:${roll}`,({c,s})=>api.resolveDefenseHit(c,s,roll));
 for(const mode of ['zero','disabled','dot'])record(`hit:invalid-unconsumed:${mode}`,({c,s})=>{if(mode==='zero')c.dodgeChance=0;if(mode==='disabled')s.settings.types.dodgeChance.enabled=false;if(mode==='dot')c.mechanic='dot';return api.resolveDefenseHit(c,s,NaN);});
 record('hit:default-settings-and-roll',({c})=>api.resolveDefenseHit(c));
 record('hit:unbound-receiver-late-enabled',({c,s,t})=>api.resolveDefenseHit(c,s,function(){t.push(['receiverUndefined',this===undefined]);s.settings.types.dodgeChance.enabled=false;c.mechanic='dot';c.dodgeChance=0;return .1;}));
 record('hit:trace-all',({c,s,t})=>{for(const k of ['dodgeChance','mechanic'])watch(c,k,`context.${k}`,t);const r=s.settings.types.dodgeChance;for(const k of ['enabled','min','max'])watch(r,k,`dodge.${k}`,t);return api.resolveDefenseHit(c,s,()=>{t.push('dodge');return 1;});});
 for(const field of ['min','max'])record(`hit:missing-bound:${field}`,({c,s})=>{delete s.settings.types.dodgeChance[field];return api.resolveDefenseHit(c,s,NaN);});
 for(const type of ['Physical','Magic'])for(const mode of ['configured','missing-all','missing-baseK','missing-penalty','missing-source','missing-target','unscaled','disabled','disabled-missing','zero-rating','zero-damage','lower-source','equal-levels','custom-bounds'])record(`mitigation:${type}:${mode}`,({c,s})=>{
  c.damageType=type;const r=s.settings.types[type==='Magic'?'magicReduction':'armorReduction'];
  if(mode==='missing-all'||mode==='disabled-missing'){r.coefficients={};delete c.source.level;delete c.target.level;}
  if(mode==='missing-baseK')delete r.coefficients.baseK;if(mode==='missing-penalty')delete r.coefficients.levelPenalty;
  if(mode==='missing-source')delete c.source.level;if(mode==='missing-target')delete c.target.level;
  if(mode==='unscaled'){r.coefficients.levelScalingEnabled=0;delete c.source.level;delete c.target.level;}
  if(mode.startsWith('disabled'))r.enabled=false;if(mode==='zero-rating'){c.armorRating=0;c.magicResistanceRating=0;}
  if(mode==='lower-source')c.source.level=1,c.target.level=5;if(mode==='equal-levels')c.source.level=1;
  if(mode==='custom-bounds')r.min=.6,r.max=.7;
  return api.mitigateDefense(mode==='zero-damage'?0:120,c,s);
 });
 for(const flag of [undefined,0,1,2,-1,NaN])record(`mitigation:scaling-flag:${flag}`,({c,s})=>{s.settings.types.armorReduction.coefficients.levelScalingEnabled=flag;return api.mitigateDefense(100,c,s);});
 for(const field of ['baseK','levelPenalty'])for(const value of [undefined,0,-1,NaN,Infinity])record(`mitigation:coefficient:${field}:${value}`,({c,s})=>{s.settings.types.armorReduction.coefficients[field]=value;return api.mitigateDefense(100,c,s);});
 for(const value of [-1,NaN,Infinity,-Infinity,-0])record(`mitigation:damage:${value}`,({c,s})=>api.mitigateDefense(value,c,s));
 for(const field of ['min','max'])record(`mitigation:missing-bound:${field}`,({c,s})=>{delete s.settings.types.armorReduction[field];return api.mitigateDefense(100,c,s);});
 record('mitigation:floating-point',({c,s})=>{c.armorRating=.1;s.settings.types.armorReduction.coefficients={baseK:.2,levelPenalty:.3};return api.mitigateDefense(.7,c,s);});
 record('mitigation:trace-all',({c,s,t})=>{
  const r=s.settings.types.armorReduction,coeff=r.coefficients;
  for(const k of ['source','target','armorRating','magicResistanceRating','damageType'])watch(c,k,`context.${k}`,t);
  watch(c.source,'level','source.level',t);watch(c.target,'level','target.level',t);
  for(const k of ['levelScalingEnabled','baseK','levelPenalty'])watch(coeff,k,`coeff.${k}`,t);
  for(const k of ['coefficients','enabled','min','max'])watch(r,k,`rule.${k}`,t);
  for(const k of ['settings','revision'])watch(s,k,`snapshot.${k}`,t);watch(s.settings,'version','settings.version',t);
  for(const k of ['dodgeChance','magicReduction'])watch(s.settings.types[k],'enabled',`${k}.enabled`,t);
  return api.mitigateDefense(120,c,s);
 });
 record('mitigation:captured-coefficients-live-values',({c,s,t})=>{const r=s.settings.types.armorReduction,coeff=r.coefficients;watch(coeff,'levelScalingEnabled','flag',t,()=>{r.coefficients={baseK:999,levelPenalty:99};return 0;});watch(coeff,'baseK','baseK',t,(n)=>n===1?100:200);return api.mitigateDefense(120,c,s);});
 record('mitigation:late-levels',({c,s,t})=>{watch(c.source,'level','source.level',t,(n)=>n<4?5:9);watch(c.target,'level','target.level',t,(n)=>n<4?1:3);return api.mitigateDefense(120,c,s);});
 record('mitigation:replace-actor-after-validation',({c,s,t})=>{watch(s.settings.types.armorReduction.coefficients,'levelScalingEnabled','flag',t,()=>{c.source={id:'new',level:11};return 1;});return api.mitigateDefense(120,c,s);});
 record('mitigation:late-config-diagnostics',({c,s,t})=>{watch(s.settings,'version','version',t,()=>{s.revision=42;s.settings.types.magicReduction.enabled=false;c.armorRating=777;return 1;});watch(s.settings.types.armorReduction,'min','min',t,(n)=>{if(n===2)c.source.level=99;return 0;});return api.mitigateDefense(120,c,s);});
 record('mitigation:enabled-status-precedence',({c,s,t})=>{watch(s.settings.types.armorReduction,'enabled','enabled',t,n=>n!==1);return api.mitigateDefense(120,c,s);});
 for(const mode of ['bad-context-before-damage','bad-dodge-before-context','missing-coeff-object','null-rule','invalid-source'])record(`validation:${mode}`,({c,s,t})=>{if(mode==='bad-context-before-damage'){c.source.id='';return api.mitigateDefense(NaN,c,s);}if(mode==='bad-dodge-before-context'){c.dodgeChance=-1;c.source.id='';return api.resolveDefenseHit(c,s,()=>{t.push('UNEXPECTED');return 1;});}if(mode==='missing-coeff-object')delete s.settings.types.armorReduction.coefficients;if(mode==='null-rule')s.settings.types.armorReduction=null;if(mode==='invalid-source')c.source=null;return api.mitigateDefense(100,c,s);});
 for(const chance of [0,-1,.5,1,NaN,Infinity])record(`critical:chance:${chance}`,({i})=>{i.criticalChance=chance;return api.calculateDamage(i);});
 for(const roll of [0,.5,.85,1,-1,NaN,Infinity,-Infinity,null,undefined])record(`critical:roll:${roll}`,({i,t})=>{i.roll=()=>{t.push('crit');return roll;};return api.calculateDamage(i);});
 for(const bonus of [-1,0,.1,NaN,Infinity])record(`critical:bonus:${bonus}`,({i})=>{i.criticalBonus=bonus;return api.calculateDamage(i);});
 record('critical:original-receiver-two-property-reads',({i,t})=>{let n=0;Object.defineProperty(i,'roll',{get(){t.push(`roll.get:${++n}`);return function(){t.push(['thisIsInput',this===i]);return 0;};}});return api.calculateDamage(i);});
 record('critical:chance-bonus-late',({i,t})=>{i.roll=function(){t.push(['thisIsInput',this===i]);i.criticalChance=.8;i.criticalBonus=.75;return .1;};watch(i,'criticalChance','criticalChance',t);watch(i,'criticalBonus','criticalBonus',t);return api.calculateDamage(i);});
 record('critical:bonus-not-read',({i})=>{i.criticalChance=0;Object.defineProperty(i,'criticalBonus',{get(){throw Error('bonus must remain unread');}});return api.calculateDamage(i);});
 for(const mechanic of ['dot','direct_hit','melee_hitbox','projectile','instant_aoe','timed_aoe_sequence'])record(`pipeline:${mechanic}`,({i,s,t})=>{i.context.defender={source:{id:'a',level:5},target:{id:'b',level:1},mechanic,dodgeChance:.5,magicResistanceRating:200};i.armor=100;i.defenseConfig=s;i.dodgeRoll=()=>{t.push('dodge');return 1;};return api.calculateDamage(i);});
 record('pipeline:dodge-suppresses-B0-critical',({i,s,t})=>{i.context.defender={source:{id:'a'},target:{id:'b'},mechanic:'direct_hit',dodgeChance:.5};i.defenseConfig=s;i.dodgeRoll=()=>{t.push('dodge');return 0;};Object.defineProperty(i.definition,'perRank',{get(){throw Error('B0 must remain unread');}});return api.calculateDamage(i);});
 record('pipeline:critical-mutates-defense-modifier',({i,s,t})=>{const m=combat('damage_bonus',{value:.2});i.bonusModifiers=[m];i.armor=100;i.defenseConfig=s;i.context.defender={source:{id:'a',level:5},target:{id:'b',level:1},mechanic:'direct_hit'};i.roll=()=>{t.push('crit');s.settings.types.armorReduction.coefficients.baseK=300;m.value=.9;i.criticalBonus=.4;return 0;};return api.calculateDamage(i);});
 for(const point of ['dodge','critical','baseK','levelPenalty','level','enabled','version','revision'])record(`error-identity:${point}`,({c,s,i,t})=>{const error={point},fail=()=>{t.push(`throw:${point}`);throw error;};let run;
  if(point==='dodge')run=()=>api.resolveDefenseHit(c,s,fail);
  else if(point==='critical'){i.roll=fail;run=()=>api.calculateDamage(i);}
  else {const target=point==='level'?c.source:point==='version'?s.settings:point==='revision'?s:point==='enabled'?s.settings.types.armorReduction:s.settings.types.armorReduction.coefficients;Object.defineProperty(target,point==='level'?'level':point,{get:fail});run=()=>api.mitigateDefense(100,c,s);}
  try{run();return {thrown:false};}catch(e){return {thrown:true,same:e===error};}
 });
 record('identity:context-and-mutable-missing',({c,s})=>{s.settings.types.armorReduction.coefficients={};const r=api.mitigateDefense(100,c,s),same=r.context===c;r.mitigation.missing.push('caller');return {same,missing:r.mitigation.missing};});
 return cases;
}
