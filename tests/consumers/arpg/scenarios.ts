import {calculateStats,calculateEffectiveValue,prepareNumericalModifiers,selectCanonicalModifiers,matchesAnyTag,calculateDamageB0,calculateDamageB1,calculateDamageBonusValue,calculateHit,calculateCritical,calculateMitigation,calculateResourceTransition,normalizeResource,calculateResourceRegeneration,captureCalculationSnapshot,captureNumericalOffenseSnapshot} from '@rpg/core/kernel';
import {type Attribute,type Stat,type Source,configuration,probability,resourceRule} from './config.js';
import {observation,thrown,frozen} from '../observations.js';
export const ids=['A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12','A13'] as const;
export function runScenario(id:string){
  const config=configuration(),trace:unknown[]=[];
  const selection=(buff=false)=>({alwaysActive:new Set(['weapon','armor','accessory']),activeInstances:new Map([['buff',new Set(buff?['rage']:[])]])});
  const build=(buff=false)=>calculateStats(config.input,prepareNumericalModifiers(selectCanonicalModifiers(config.modifiers,selection(buff))));
  // ARPG-only routing: additive supported subset, never conversion/penetration.
  const damage=(elemental:boolean,buff=false,criticalRoll=.1,criticalChance=.25,current=200,maximum=200)=>{
    const stats=build(buff),source=elemental?'elemental':'weapon';
    const inputs={base:elemental?10:7,power:elemental?stats.values.elementalPower:stats.values.weaponPower,coefficient:2,source,criticalRoll,criticalChance,current};
    const hit=calculateHit({eligible:true,dodgeChance:0,rule:probability,roll:()=>{trace.push('unexpected-dodge');return .9;}});
    const b0=calculateDamageB0({base:inputs.base,rank:1,perRank:0,sourceOrder:[source],sourceValue:()=>inputs.power,coefficient:()=>2,resolveFlat:()=>{trace.push('flat');return {definition:0,additional:0,resolved:0};}});
    const critical=calculateCritical({eligible:hit.hit,chance:criticalChance,bonus:.5,rule:probability,roll:()=>{trace.push(['crit',criticalRoll]);return criticalRoll;}});
    const eligible=matchesAnyTag(elemental?['fire']:['physical'],elemental?['fire','spell']:['physical']);
    const bonus=calculateDamageBonusValue(eligible?[1]:[],n=>n,()=>.25),bonuses=eligible?[{value:bonus}]:[];
    const b1=calculateDamageB1(b0.raw,bonuses,critical.bonus);
    const mitigationInput={damage:b1.beforeDefense,ruleKey:elemental?'elementWard':'armor',rating:elemental?50:100,rule:{enabled:true,bounds:{},baseK:elemental?150:100,levelPenalty:0,levelScalingEnabled:false}};
    const mitigation=calculateMitigation(mitigationInput);
    const resourceInput={resource:'life',current,maximum,amount:mitigation.finalDamage,operation:'decrease' as const,rule:resourceRule};
    const life=calculateResourceTransition(resourceInput);trace.push(['life',life.after]);
    return {inputs,stats,hit,b0,critical,bonuses,b1,mitigationInput,mitigation,resourceInput,life};
  };
  switch(id){
    case 'A1':{const output=build();return observation(id,config,output,trace,[output.values.weaponPower,output.values.elementalPower,output.values.maxLife,output.values.maxMana,output.values.armorRating]);}
    case 'A2':{
      const original=config.modifiers[0]!,duplicate={...original,identity:{...original.identity}};
      const inputs=[...config.modifiers].reverse().concat(duplicate);const selected=selectCanonicalModifiers(inputs,selection());
      const output=calculateStats(config.input,prepareNumericalModifiers(selected));const identity=selected.find(m=>m.identity.source==='weapon')===duplicate;
      const conflict=thrown(()=>selectCanonicalModifiers([...inputs,{...original,value:7}],selection()));
      return observation(id,{inputs,activeSources:['weapon','armor','accessory']},{selected,output,identity,conflict},trace,[selected.length,output.values.weaponPower,identity,conflict.message,selected.map(m=>m.identity.source)]);
    }
    case 'A3':{
      const disabled={...config.modifiers[0]!,identity:{source:'weapon' as const,sourceInstanceId:'disabled',id:'power'},value:100,enabled:false};config.modifiers.push(disabled);
      const on=build(true),off=build(false);return observation(id,{config,activeBuff:'rage'},{on,off},trace,[on.values.weaponPower,off.values.weaponPower,on.details.weaponPower.resolved.contributions.length]);
    }
    case 'A4':{const physical=damage(false),elemental=damage(true,false,.8,0);return observation(id,{physical:physical.inputs,elemental:elemental.inputs},{physical,elemental},trace,[physical.b0.raw,physical.b1.beforeDefense,physical.mitigation.finalDamage,physical.life.after,elemental.b0.raw,elemental.b1.beforeDefense,elemental.mitigation.finalDamage,elemental.life.after]);}
    case 'A5':{
      const inputs=[{dodge:.1,crit:.1},{dodge:.9,crit:.1},{dodge:.9,crit:.8}];
      const output=inputs.map(input=>{
        const hit=calculateHit({eligible:true,dodgeChance:.2,rule:probability,roll:()=>{trace.push(['dodge',input.dodge]);return input.dodge;}});
        if(!hit.hit)return {hit};
        const b0=calculateDamageB0({base:100,rank:1,perRank:0,sourceOrder:[],sourceValue:()=>0,coefficient:()=>0,resolveFlat:()=>({definition:0,additional:0,resolved:0})});
        const critical=calculateCritical({eligible:true,chance:.25,bonus:.5,rule:probability,roll:()=>{trace.push(['crit',input.crit]);return input.crit;}});
        return {hit,b0,critical,b1:calculateDamageB1(b0.raw,[{value:.25}],critical.bonus)};
      });
      const sentinel={rng:'arpg'};const error=thrown(()=>calculateCritical({eligible:true,chance:.25,bonus:.5,rule:probability,roll:()=>{throw sentinel;}}),sentinel);
      return observation(id,inputs,{output,error},trace,[output.map(r=>r.hit.dodged),output.map(r=>r.critical?.bonus),output.map(r=>r.b1?.beforeDefense),trace.length,error.same]);
    }
    case 'A6':{
      const base={damage:200,ruleKey:'armor',rating:200,sourceLevel:12,targetLevel:10,rule:{enabled:true,bounds:{},baseK:100,levelPenalty:.5,levelScalingEnabled:true}};
      const rating=calculateMitigation(base),fixed=calculateMitigation({...base,rule:{...base.rule,bounds:{min:.25,max:.25}}});
      const disabled=calculateMitigation({...base,rule:{...base.rule,enabled:false}}),missing=calculateMitigation({...base,rule:{enabled:true,bounds:{},levelPenalty:0,levelScalingEnabled:false}});
      return observation(id,base,{rating,fixed,disabled,missing},trace,[rating.levelGap,rating.effectiveK,rating.rawReduction,rating.finalDamage,rating.preventedDamage,fixed.reduction,fixed.finalDamage,disabled.status,missing.status]);
    }
    case 'A7':{
      const stats=build();const shared={default:1,training:0,enabled:true,bounds:{},scaling:[{attribute:'might' as const,coefficient:1,enabled:true}]};
      const caller={attributes:{...config.input.attributeBases},stats:{...stats.values},statRules:{...config.input.rules,weaponPower:shared,elementalPower:shared},modifiers:config.modifiers,context:{damageType:'physical',tags:['physical'],ownerId:'build-a',revision:'one'}};
      const before={power:caller.stats.weaponPower,tags:[...caller.context.tags]};const snapshot=captureCalculationSnapshot<Attribute,Stat,Source>(caller);
      const offenseCaller={sources:{weapon:stats.values.weaponPower},flatContributions:[],bonuses:[],criticalChance:.25,criticalBonus:.5};const offense=captureNumericalOffenseSnapshot(offenseCaller);
      caller.attributes.might=120;caller.stats.weaponPower=999;caller.modifiers[0]={...caller.modifiers[0]!,value:99};caller.context.tags.push('fire');offenseCaller.sources.weapon=999;
      const capturedBuild=calculateStats({...config.input,attributeBases:snapshot.attributes,baseStats:snapshot.stats,flatContributions:{},rules:snapshot.statRules},prepareNumericalModifiers([]));
      const checks={alias:snapshot.statRules.weaponPower===snapshot.statRules.elementalPower,detached:snapshot.statRules.weaponPower!==shared,deepFrozen:frozen(snapshot)&&frozen(offense),callerMutable:!Object.isFrozen(caller.modifiers),write:thrown(()=>{(snapshot.context.tags as string[]).push('bad');})};
      const getter=thrown(()=>captureCalculationSnapshot<Attribute,Stat,Source>({...caller,context:{get tags(){trace.push('getter');return ['bad'];}}}));
      const callback=thrown(()=>captureNumericalOffenseSnapshot({...offenseCaller,criticalChance:(()=>0) as unknown as number}));
      return observation(id,{before,mutations:{might:120,power:999,modifier:99,tag:'fire'}},{snapshot,offense,caller,capturedBuild,checks,getter,callback},trace,[snapshot.attributes.might,snapshot.stats.weaponPower,offense.sources.weapon,capturedBuild.values.weaponPower,checks.alias,checks.detached,checks.deepFrozen,checks.callerMutable,checks.write.name,getter.name,callback.name,trace]);
    }
    case 'A8':{
      let life=400;const events=[];
      const first=damage(false,true,.8,0,life,400);life=first.life.after;events.push({event:'buff-on',revision:1,result:first,state:{life,mana:60}});
      const second=damage(true,false,.8,0,life,400);life=second.life.after;events.push({event:'buff-off',revision:1,result:second,state:{life,mana:60}});
      config.modifiers[0]={...config.modifiers[0]!,value:14};const third=damage(false,false,.8,0,life,400);life=third.life.after;events.push({event:'weapon-swap',revision:2,result:third,state:{life,mana:0}});
      const rejected={event:'rejected-cost',cost:5,state:{life,mana:0},admitted:false};trace.push(rejected);
      return observation(id,{initial:{life:400,mana:60},events:['buff-on','buff-off','weapon-swap','rejected-cost']},{events,rejected},trace,[events.map(e=>e.result.b0.raw),events.map(e=>e.result.mitigation.finalDamage),events.map(e=>e.state.life),rejected.admitted]);
    }
    case 'A9':{
      const input={resource:'life',current:199.5,minimum:0,maximum:200,ratePerSecond:.125,elapsedSeconds:2,eligible:true,precision:{decimalPlaces:12}};
      const mana=normalizeResource({resource:'mana',minimum:0,maximum:60}),regen=calculateResourceRegeneration(input),full=calculateResourceRegeneration({...input,current:200});
      const skipped=calculateResourceRegeneration({...input,eligible:false,get ratePerSecond():number{trace.push('rate');throw Error('skipped');}});
      return observation(id,input,{mana,regen,full,skipped},trace,[mana.after,regen.after,regen.applied,full.after,full.applied,skipped.after,trace]);
    }
    case 'A10':{
      const input={resource:'life',current:12,maximum:200,amount:9,operation:'decrease' as const,rule:{...resourceRule,minimum:10}};
      const minimum=calculateResourceTransition(input),full=calculateResourceTransition({...input,current:200,amount:5,operation:'increase'}),overflow=calculateResourceTransition({...input,current:Number.MAX_VALUE,maximum:Number.MAX_VALUE,amount:Number.MAX_VALUE,operation:'increase'});
      return observation(id,input,{minimum,full,overflow},trace,[minimum.after,minimum.applied,minimum.reachedMinimum,full.applied,overflow.after,Number.isFinite(overflow.after)]);
    }
    case 'A11':{
      const a=selectCanonicalModifiers(config.modifiers,selection()),b=selectCanonicalModifiers([...config.modifiers].reverse(),selection());
      const resolveA=prepareNumericalModifiers(a),resolveB=prepareNumericalModifiers(b);const first=resolveA(44,'weaponPower'),second=resolveB(44,'weaponPower');
      const conflict=thrown(()=>selectCanonicalModifiers([...config.modifiers,{...config.modifiers[0]!,value:7}],selection()));
      const empty=calculateDamageBonusValue([],()=>{trace.push('value');throw Error('empty');},()=>{trace.push('coefficient');throw Error('empty');});
      return observation(id,config.modifiers,{first,second,conflict,empty},trace,[first.value,second.value,first.contributions.map(m=>m.identity.source),second.contributions.map(m=>m.identity.source),conflict.message,empty,trace]);
    }
    case 'A12':{
      const input={base:1.234,target:'threshold',rule:{enabled:true,bounds:{max:1.225},precision:{decimalPlaces:2}}};
      const resolve=prepareNumericalModifiers([]),rounded=calculateEffectiveValue(input.base,input.target,resolve,input.rule);
      const disabled=calculateEffectiveValue(input.base,input.target,resolve,{...input.rule,enabled:false},value=>{trace.push('transform');return value;});
      return observation(id,input,{rounded,disabled},trace,[rounded.value,disabled.value,disabled.uncapped,trace]);
    }
    case 'A13':{
      const context={damageType:undefined,tags:['fire']};const shared={id:'edge',value:-0};
      const caller={sources:{nan:NaN,infinite:Infinity,negativeZero:-0},flatContributions:[shared],bonuses:[{id:'edge',source:'accessory',eligible:true,reason:'caller-selected',value:0,contributions:[shared]}],criticalChance:0,criticalBonus:0};
      const snapshot=captureNumericalOffenseSnapshot(caller);
      const full=captureCalculationSnapshot({attributes:{focus:1},stats:{power:1},statRules:{power:{default:1,training:0,enabled:true,bounds:{},scaling:[]}},modifiers:[],
        // @ts-expect-error Deliberate runtime edge: optional undefined is accepted by capture but exactOptionalPropertyTypes forbids constructing it.
        context});
      const cyclic={...caller};cyclic.bonuses[0]!.contributions=[cyclic as unknown as typeof shared];
      const cycle=thrown(()=>captureNumericalOffenseSnapshot(cyclic)),unknown=thrown(()=>captureNumericalOffenseSnapshot({...caller,session:{}} as typeof caller));
      const write=thrown(()=>{(full.context.tags as string[]).push('bad');});
      return observation(id,{keys:['nan','infinite','negativeZero'],context},{snapshot,full,cycle,unknown,write},trace,[Number.isNaN(snapshot.sources.nan),snapshot.sources.infinite,Object.is(snapshot.sources.negativeZero,-0),Object.keys(snapshot.sources),Object.hasOwn(full.context,'damageType'),snapshot.flatContributions[0]===snapshot.bonuses[0]!.contributions[0],cycle.name,unknown.name,write.name]);
    }
    default:throw Error('Unknown ARPG scenario '+id);
  }
}
