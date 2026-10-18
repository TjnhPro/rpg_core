// Observations only. No snapshot or numerical implementation is duplicated here.
import {encode,damageInput,combat,setting,keys} from './damage-parity-scenarios.mjs';
function snapshotEncode(v){if(typeof v==='function')return {$function:true};if(Array.isArray(v))return v.map(snapshotEncode);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,snapshotEncode(x)]));return encode(v);}
export function observeSnapshots(api){
 const cases=[];
 const record=(name,run)=>{const trace=[],sentinel={marker:name};try{cases.push({name,result:snapshotEncode(run(trace,sentinel)),trace});}catch(e){cases.push({name,error:snapshotEncode({name:e?.name,message:e?.message,original:e===sentinel}),trace});}};
 const input=()=>({sources:Object.fromEntries(keys.map(k=>[k,2])),modifiers:[combat(),combat('damage_bonus',{id:'bonus',value:-.1}),combat('damage.flat',{id:'flat',value:3})],settings:{skills:{},modifiers:[setting()]},criticalChance:.2,criticalBonus:.5,attacker:{entityId:'actor',entityType:'player',level:2,targetTags:[]},defenseConfig:undefined,options:[{id:'x',value:2}]});
 const graph=value=>{const seen=new Map(),nodes=[];function visit(v,path){if(!v||typeof v!=='object')return;if(seen.has(v)){nodes.push({path,alias:seen.get(v)});return;}seen.set(v,path);nodes.push({path,keys:Object.keys(v),frozen:Object.isFrozen(v)});for(const k of Object.keys(v))visit(v[k],`${path}.${k}`);}visit(value,'$');return nodes;};
 function capture(i,root){return root?api.snapshotActorOffense(i):api.snapshotActorDamage(api.damageDefinition(1),i.sources,i.modifiers,i.settings,i.criticalChance,i.criticalBonus);}
 for(const root of [false,true]){
  record(`base:${root}`,()=>{const i=input(),s=capture(i,root);return {s,graph:graph(s),sourceAlias:s.sources===i.sources,settingAlias:s.settings.modifiers[0]===i.settings.modifiers[0],modifierDetached:s.flatModifiers[0]!==i.modifiers[0]};});
  record(`mutation:${root}`,()=>{const i=input(),s=capture(i,root);i.sources.str=99;i.settings.modifiers[0].value=.8;i.modifiers[0].value=99;i.options[0].value=99;return {s,graph:graph(s)};});
  for(const type of ['player','monster'])record(`actor:${root}:${type}`,()=>{const i=input();i.attacker.entityType=type;return capture(i,root);});
  for(const field of ['sources','modifiers','settings','criticalChance','criticalBonus','attacker','options','defenseConfig']){
   record(`reads:${root}:${field}`,t=>{const i=input(),v=i[field];Object.defineProperty(i,field,{enumerable:true,get(){t.push(field);return v;}});return capture(i,root);});
   for(const n of [1,2,3,4])record(`throw:${root}:${field}:${n}`,(t,e)=>{const i=input(),v=i[field];let count=0;Object.defineProperty(i,field,{enumerable:true,get(){t.push(`${field}:${++count}`);if(count===n)throw e;return v;}});return capture(i,root);});
  }
  for(const field of keys)record(`source-getter:${root}:${field}`,t=>{const i=input();Object.defineProperty(i.sources,field,{enumerable:true,get(){t.push(field);return t.length;}});return capture(i,root);});
  record(`clone-function:${root}`,()=>{const i=input();i.sources.extra=()=>0;return capture(i,root);});
  record(`nested-modifier-getter:${root}`,t=>{const i=input();let n=0;Object.defineProperty(i.modifiers[0],'value',{enumerable:true,get(){t.push(`value:${++n}`);return n;}});return capture(i,root);});
 }
 for(const field of keys)for(const v of [NaN,Infinity,-Infinity,-0,undefined])record(`invalid-source:${field}:${String(v)}`,()=>{const i=input();i.sources[field]=v;return capture(i,true);});
 for(const n of [0,100,101])record(`settings-budget:${n}`,()=>{const i=input();i.settings.modifiers=Array.from({length:n},(_,k)=>setting({id:String(k)}));return capture(i,true);});
 for(const n of [0,256,257])record(`modifier-budget:${n}`,()=>{const i=input();i.modifiers=Array.from({length:n},(_,k)=>combat('flat_damage',{id:String(k)}));return capture(i,true);});
 record('source-extra',()=>{const i=input();i.sources.other=1;return capture(i,true);});
 record('source-missing',()=>{const i=input();delete i.sources.str;return capture(i,true);});
 record('shared-root-graph',()=>{const i=input();i.modifiers=[];i.options=[];i.attacker.targetTags=i.options;const s=capture(i,true);return {s,graph:graph(s),shared:s.options===s.attacker.targetTags,detached:s.options!==i.options};});
 record('inherited-source',()=>{const i=input();i.sources=Object.create(i.sources);return capture(i,true);});
 record('cycle-remapping',()=>{const i=input();i.sources.str=i.sources;return capture(i,true);});
 record('freeze-write',()=>{const s=capture(input(),true);try{s.sources.str=90;}catch(e){return {error:e.name,value:s.sources.str};}return {value:s.sources.str};});
 for(const mode of ['zero-dodge','dodge','crit-zero','dot','rng-error'])record(`rng:${mode}`,(t,e)=>{const i=damageInput(t);i.context.defender={source:{id:'a'},target:{id:'b'},mechanic:mode==='dot'?'dot':'direct_hit',dodgeChance:mode==='dodge'?.5:0};i.criticalChance=mode==='crit-zero'?0:.5;i.dodgeRoll=function(){t.push(`dodge:${this===undefined}`);return 0;};i.roll=function(){t.push(`crit:${this===i}`);if(mode==='rng-error')throw e;return .1;};return api.calculateDamage(i);});
 return cases;
}
