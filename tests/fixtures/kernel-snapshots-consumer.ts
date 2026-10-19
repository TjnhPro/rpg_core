import {captureNumericalOffenseSnapshot,captureCalculationSnapshot,calculateDamageB0,calculateDamageB1,calculateHit,calculateCritical,type NumericalOffenseSnapshot,type CalculationSnapshot} from '../../src/kernel/index.js';
function check(ok:unknown):asserts ok {if(!ok)throw Error('Snapshot consumer assertion failed');}
export function kernelSnapshotExamples(){
 const draws:string[]=[],sources={strength:10,magic:4};
 const offense=captureNumericalOffenseSnapshot({sources,flatContributions:[],bonuses:[],criticalChance:0,criticalBonus:.5});
 const typed:NumericalOffenseSnapshot<'strength'|'magic'>=offense;void typed;
 sources.strength=999;check(offense.sources.strength===10&&Object.isFrozen(offense.sources));
 const b0=calculateDamageB0({base:0,perRank:0,rank:1,sourceOrder:['strength','magic'] as const,sourceValue:k=>offense.sources[k],coefficient:k=>k==='strength'?2:0,resolveFlat:()=>({definition:0,additional:0,resolved:0})});
 const hit=calculateHit({eligible:true,dodgeChance:0,rule:{enabled:true,bounds:{min:0,max:.85}},roll:()=>{draws.push('dodge');return 1;}});
 const critical=calculateCritical({eligible:hit.hit,chance:offense.criticalChance,bonus:offense.criticalBonus,rule:{enabled:true,bounds:{min:0,max:.85}},roll:()=>{draws.push('critical');return 1;}});
 const text=calculateDamageB1(b0.raw,offense.bonuses,critical.bonus).beforeDefense;
 const voInput={sources:{sucManh:12,noiCong:4},flatContributions:[],bonuses:[],criticalChance:.2,criticalBonus:.5};
 const vo=captureNumericalOffenseSnapshot(voInput);voInput.sources.sucManh=999;
 const component=(base:number)=>calculateDamageB0({base,perRank:0,rank:1,sourceOrder:['sucManh'] as const,sourceValue:k=>vo.sources[k],coefficient:()=>2,resolveFlat:()=>({definition:0,additional:0,resolved:0})}).raw;
 const values={power:25},tags=['delayed'];
 const state:CalculationSnapshot<'power','power',string,'fire',string>=captureCalculationSnapshot({attributes:values,stats:values,statRules:{power:{default:0,enabled:true,bounds:{},training:0,scaling:[{attribute:'power' as const,coefficient:2,enabled:true}]}},modifiers:[],context:{damageType:'fire' as const,tags,ownerId:'label',revision:'r1'}});
 values.power=1;tags.push('mutated');check(state.attributes===state.stats&&state.stats.power===25&&state.context.tags?.length===1);
 check(Object.isFrozen(state.statRules.power.scaling[0])&&Object.isFrozen(state.context.tags));
 let rejected=false;try{(state.context.tags as string[]).push('x');}catch{rejected=true;}check(rejected);
 const arpg=calculateDamageB0({base:0,perRank:0,rank:1,sourceOrder:['power'] as const,sourceValue:k=>state.stats[k],coefficient:()=>2,resolveFlat:()=>({definition:0,additional:0,resolved:0})}).raw;
 check(text===20&&component(0)===24&&component(10)===34&&arpg===50&&draws.join()==='critical');
 return {text,voLam:[component(0),component(10)],arpg,draws,shared:state.attributes===state.stats,frozen:rejected};
}
