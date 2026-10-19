// Caller scenarios and observations only, never a second calculator.
import {encode} from './damage-parity-scenarios.mjs';
function keys(value){return value&&typeof value==='object'?Object.keys(value):[];}
export function observeResources(api){
 const cases=[];
 function record(name,run){const trace=[],sentinel={sentinel:name};try{const result=run(trace,sentinel);cases.push({name,result:encode(result),keys:keys(result),trace:encode(trace)});}catch(e){cases.push({name,error:encode({name:e?.name,message:e?.message,original:e===sentinel}),trace:encode(trace)});}}
 const amounts=[[10,0,100],[10,10,100],[10,20,100],[120,10,100],[0,5,100],[0,0,0],[10,0,0],[95,20,100],[100,5,100],[.3,.2,1],[1e-14,0,1],[-0,0,100],[Number.MAX_VALUE/2,Number.MAX_VALUE,Number.MAX_VALUE],[Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE]];
 for(const method of ['applyEntityDamage','applyEntityHealing','applyEntityManaGain']){
  amounts.forEach((input,i)=>record(`${method}:valid:${i}`,()=>api[method](...input)));
  for(const field of [0,1,2])for(const bad of [-1,NaN,Infinity,-Infinity,undefined,null])record(`${method}:invalid:${field}:${String(bad)}`,()=>{const input=[5,2,10];input[field]=bad;return api[method](...input);});
 }
 const defaults=()=>({maxHp:20,maxMana:10,hpRegen:2,manaRegen:3});
 for(const [i,input] of [[undefined,undefined],[0,0],[-5,-2],[30,15],[5,0],[0,5],[1e-14,1e-14],[.1234567890125,.0000000000006]].entries())for(const alive of [true,false])for(const elapsed of [0,1000,1234.5])record(`resources:values:${i}:${alive}:${elapsed}`,()=>api.updateCurrentResources(...input,defaults(),elapsed,alive));
 for(const field of ['maxHp','maxMana','hpRegen','manaRegen'])for(const value of [-1,NaN,Infinity,-Infinity])record(`resources:invalid:${field}:${value}`,()=>api.updateCurrentResources(5,2,{...defaults(),[field]:value},1000));
 for(const value of [-1,NaN,Infinity,-Infinity])record(`resources:invalid:time:${value}`,()=>api.updateCurrentResources(5,2,defaults(),value));
 for(const field of [0,1])for(const value of [NaN,Infinity,-Infinity])record(`resources:invalid:current:${field}:${value}`,()=>{const input=[5,2];input[field]=value;return api.updateCurrentResources(...input,defaults(),1000);});
 record('resources:overflow',()=>api.updateCurrentResources(Number.MAX_VALUE/2,Number.MAX_VALUE/2,{maxHp:Number.MAX_VALUE,maxMana:Number.MAX_VALUE,hpRegen:Number.MAX_VALUE,manaRegen:Number.MAX_VALUE},Number.MAX_VALUE));
 record('resources:zero-maxima',()=>api.updateCurrentResources(undefined,undefined,{maxHp:0,maxMana:0,hpRegen:0,manaRegen:0},1000));
 function watched(t,s,hook){const counts={};for(const k of Object.keys(s)){let v=s[k];Object.defineProperty(s,k,{enumerable:true,get(){const n=counts[k]=(counts[k]??0)+1;t.push(`${k}:${n}`);return hook?.(k,n,v,s)??v;},set(x){v=x;}});}return s;}
 for(const initial of [[5,2],[undefined,undefined],[0,2]])for(const alive of [true,false])record(`resources:reads:${initial.map(String)}:${alive}`,t=>api.updateCurrentResources(...initial,watched(t,defaults()),1000,alive));
 for(const field of ['maxHp','maxMana','hpRegen','manaRegen'])for(const nth of [1,2,3,4])record(`resources:throw:${field}:${nth}`,(t,e)=>api.updateCurrentResources(undefined,undefined,watched(t,defaults(),(k,n,v)=>{if(k===field&&n===nth)throw e;return v;}),1000));
 for(const field of ['maxHp','maxMana','hpRegen','manaRegen'])for(const value of [0,1,40,NaN,Infinity,-1])record(`resources:mutate:${field}:${value}`,t=>api.updateCurrentResources(5,2,watched(t,defaults(),(k,n,v)=>k===field&&n>1?value:v),1000));
 record('resources:between-validation-normalization',t=>api.updateCurrentResources(5,2,watched(t,defaults(),(k,n,v,s)=>{if(k==='manaRegen'&&n===1)s.maxHp=4;return v;}),1000));
 record('resources:between-hp-mp-normalization',t=>api.updateCurrentResources(undefined,undefined,watched(t,defaults(),(k,n,v,s)=>{if(k==='maxHp'&&n===3)s.maxMana=7;return v;}),1000));
 record('resources:between-hp-mp-regen',t=>api.updateCurrentResources(5,2,watched(t,defaults(),(k,n,v,s)=>{if(k==='hpRegen'&&n===2)s.maxMana=3;return v;}),1000));
 record('resources:validation-eager-reads-and-throw',(t,e)=>api.updateCurrentResources(NaN,2,watched(t,{...defaults(),maxHp:-1},k=>{if(k==='manaRegen')throw e;}),1000));
 record('resources:captured-elapsed-holder',t=>{const holder={value:1000,get elapsed(){t.push('elapsed');return this.value;}};const s=watched(t,defaults(),(k,n,v)=>{holder.value=0;return v;});return api.updateCurrentResources(5,2,s,holder.elapsed);});
 return cases;
}
