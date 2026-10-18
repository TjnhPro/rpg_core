import {calculateStats,prepareNumericalModifiers,selectCanonicalModifiers,calculateDamageB0,calculateDamageB1,calculateDamageBonusValue,matchesAnyTag,calculateHit,calculateCritical,calculateMitigation,calculateResourceTransition,calculateCooldownDurationMs,captureNumericalOffenseSnapshot} from '@rpg/core/kernel';
import {configuration,probability,resourceRule} from './config.js';
import {observation,frozen,thrown} from '../observations.js';
export const ids=['V1','V2','V3','V4','V5','V6','V7','V8','V9','V10'] as const;
export function runScenario(id:string) {
  const config=configuration(),trace:unknown[]=[];
  const stats=()=>calculateStats(config.input,prepareNumericalModifiers(config.modifiers));
  const build=stats();
  // This consumer alone resolves martial classification, rank and target policy.
  const strike=(inner:boolean)=>{
    const source=inner?'nội_công':'vật_lý',power=inner?build.values.nội_công:build.values.ngoại_công;
    const numerical={base:inner?20:10,rank:inner?2:1,perRank:inner?.5:0,power,coefficient:inner?1.2:2,flat:inner?5:10};
    const hit=calculateHit({eligible:true,dodgeChance:.1,rule:probability,roll:()=>{trace.push(['dodge',.9]);return .9;}});
    const b0=calculateDamageB0({...numerical,sourceOrder:[source],sourceValue:()=>power,coefficient:()=>numerical.coefficient,resolveFlat:()=>{trace.push('flat');return {definition:numerical.flat,additional:0,resolved:0};}});
    const critical=calculateCritical({eligible:!inner,chance:.5,bonus:.5,rule:probability,roll:()=>{trace.push(['critical',.25]);return .25;}});
    const bonuses=inner?[{value:.25}]:[];
    const b1=calculateDamageB1(b0.raw,bonuses,critical.bonus);
    const mitigationInput={damage:b1.beforeDefense,ruleKey:inner?'nội':'ngoại',rating:inner?50:100,rule:{enabled:true,bounds:{},baseK:inner?150:100,levelPenalty:0,levelScalingEnabled:false}};
    const mitigation=calculateMitigation(mitigationInput);
    const hp=calculateResourceTransition({resource:'sinh_lực',current:300,maximum:300,amount:mitigation.finalDamage,operation:'decrease',rule:resourceRule});trace.push(['hp',hp]);
    return {numerical,source,hit,b0,critical,bonuses,b1,mitigationInput,mitigation,hp};
  };
  switch(id){
    case 'V1':return observation(id,config,build,trace,[build.values.ngoại_công,build.values.nội_công,build.values.sinh_lực,build.values.mana,build.values.phòng_ngự]);
    case 'V2':case 'V3':{const output=strike(id==='V3');return observation(id,{numerical:output.numerical,source:output.source,mitigation:output.mitigationInput},output,trace,[output.b0.raw,output.b1.beforeDefense,output.mitigation.finalDamage,output.hp.after,output.critical.roll]);}
    case 'V4':{
      const inputs=[{tags:['hỏa'],required:['hỏa'],terms:[1,1]},{tags:['thủy'],required:['hỏa'],terms:[1,1]}];
      const output=inputs.map(input=>{const eligible=matchesAnyTag(input.required,input.tags);const selected=eligible?input.terms:[];const value=calculateDamageBonusValue(selected,n=>{trace.push(['term',n]);return n;},()=>{trace.push('coefficient');return .125;});return {eligible,selected,value,b1:calculateDamageB1(100,eligible?[{value}]:[],0)};});
      return observation(id,inputs,output,trace,output.map(r=>[r.eligible,r.value,r.b1.beforeDefense]));
    }
    case 'V5':{
      const inputs=[{position:{x:2,y:3},launched:true,eligible:true,contact:true},{position:{x:2,y:3},launched:true,eligible:true,contact:false}];
      const output=inputs.map(input=>{trace.push('launched','eligible',input.contact?'contact':'miss');if(!input.contact)return {requested:false};trace.push('calculation-requested');return {requested:true,result:strike(false)};});
      return observation(id,inputs,output,trace,[output[0]!.requested,output[1]!.requested,output[0]!.result!.hp.after]);
    }
    case 'V6':{
      let mana=40;const initial=mana;const rows=[];
      for(const content of [{rank:1,cost:8,baseMs:1000},{rank:2,cost:12,baseMs:1500},{rank:3,cost:16,baseMs:2000}]){
        const b0=calculateDamageB0({base:20,rank:content.rank,perRank:.5,sourceOrder:['nội_công'],sourceValue:()=>build.values.nội_công,coefficient:()=>1,resolveFlat:()=>({definition:0,additional:0,resolved:0})});
        const mp=calculateResourceTransition({resource:'mana',current:mana,maximum:80,amount:content.cost,operation:'decrease',rule:resourceRule});mana=mp.after;
        const cooldown=calculateCooldownDurationMs(content.baseMs,.25);rows.push({content,b0,mp,cooldown});trace.push(['admit',content.rank,mana,cooldown]);
      }
      const rejected=mana<16;trace.push(['reject',rejected,mana]);
      return observation(id,{initial,source:75,perRank:.5,cdr:.25,nextCost:16},{rows,rejected,mana},trace,[rows.map(r=>r.b0.raw),rows.map(r=>r.mp.after),rows.map(r=>r.cooldown),rejected]);
    }
    case 'V7':{
      const snapshot=captureNumericalOffenseSnapshot({sources:{vật_lý:build.values.ngoại_công},flatContributions:[],bonuses:[],criticalChance:0,criticalBonus:.5});
      const targets=[{id:'a',rating:100,hp:300},{id:'b',rating:300,hp:300}];
      const output=targets.map(target=>{
        const hit=calculateHit({eligible:true,dodgeChance:.1,rule:probability,roll:()=>{trace.push(target.id+'-dodge');return .9;}});
        const b0=calculateDamageB0({base:10,rank:1,perRank:0,sourceOrder:['vật_lý'],sourceValue:key=>snapshot.sources[key],coefficient:()=>2,resolveFlat:()=>({definition:10,additional:0,resolved:0})});
        const critical=calculateCritical({eligible:hit.hit,chance:snapshot.criticalChance,bonus:snapshot.criticalBonus,rule:probability,roll:()=>{trace.push(target.id+'-crit');return .8;}});
        const b1=calculateDamageB1(b0.raw,[],critical.bonus);
        const mitigation=calculateMitigation({damage:b1.beforeDefense,ruleKey:'ngoại',rating:target.rating,rule:{enabled:true,bounds:{},baseK:100,levelPenalty:0,levelScalingEnabled:false}});
        const hp=calculateResourceTransition({resource:'sinh_lực',current:target.hp,maximum:300,amount:mitigation.finalDamage,operation:'decrease',rule:resourceRule});
        return {target:target.id,hit,b0,critical,b1,mitigation,hp};
      });
      return observation(id,{snapshot,targets},output,trace,[output.map(r=>r.mitigation.finalDamage),output.map(r=>r.hp.after),trace]);
    }
    case 'V8':{
      const caller={sources:{vật_lý:50,nội_công:75},flatContributions:[],bonuses:[],criticalChance:0,criticalBonus:.5};
      const snapshot=captureNumericalOffenseSnapshot(caller);caller.sources.vật_lý=500;caller.sources.nội_công=750;
      const b0=calculateDamageB0({base:10,rank:1,perRank:0,sourceOrder:['vật_lý'],sourceValue:key=>snapshot.sources[key],coefficient:()=>2,resolveFlat:()=>({definition:10,additional:0,resolved:0})});
      const write=thrown(()=>{(snapshot.sources as {vật_lý:number}).vật_lý=1000;});
      const checks={detached:snapshot.sources!==caller.sources,frozen:frozen(snapshot),callerMutable:!Object.isFrozen(caller.sources),write};
      return observation(id,{initial:{vật_lý:50,nội_công:75},mutation:caller.sources},{snapshot,caller,b0,checks},trace,[snapshot.sources.vật_lý,snapshot.sources.nội_công,b0.raw,checks.detached,checks.frozen,checks.callerMutable,write.name]);
    }
    case 'V9':{
      const inputs=[{enabled:false,bounds:{},baseK:150,levelPenalty:0,levelScalingEnabled:false},{enabled:true,bounds:{},levelPenalty:0,levelScalingEnabled:false}];
      const output=inputs.map(rule=>calculateMitigation({damage:212.5,ruleKey:'nội',rating:50,rule}));
      return observation(id,inputs,output,trace,output.map(r=>[r.status,r.finalDamage,r.missing]));
    }
    case 'V10':{
      const inactive={identity:{source:'luyện_công' as const,sourceInstanceId:'ẩn',id:'nội'},target:'nội_công' as const,operation:'add_flat' as const,value:100,enabled:true};
      const disabled={...config.modifiers[0]!,identity:{source:'trang_bị' as const,sourceInstanceId:'tắt',id:'ngoại'},enabled:false};
      const all=[...config.modifiers,inactive,disabled];const active={alwaysActive:new Set<string>(),activeInstances:new Map([['trang_bị',new Set(['kiếm','phù','tắt'])]])};
      const selected=selectCanonicalModifiers(all,active);const before=calculateStats(config.input,prepareNumericalModifiers(selected));
      const refs=selected.every(m=>all.includes(m));active.activeInstances.get('trang_bị')!.delete('kiếm');
      const toggled=calculateStats(config.input,prepareNumericalModifiers(selectCanonicalModifiers(all,active)));
      const reset=stats();
      return observation(id,{all,activeInitially:['kiếm','phù','tắt']},{selected,before,toggled,reset,refs},trace,[before.values.ngoại_công,toggled.values.ngoại_công,reset.values.ngoại_công,selected.length,refs]);
    }
    default:throw Error('Unknown Vo Lam scenario '+id);
  }
}
