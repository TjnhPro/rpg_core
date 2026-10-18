import {calculateHit,calculateCritical,calculateMitigation,calculateDamageB0,calculateDamageB1,type RatingMitigationRule} from '../../src/kernel/index.js';

/** Three caller-owned numerical policies using only the public Kernel surface. */
export function kernelDefenseExamples(){
 const textHit=calculateHit({eligible:true,dodgeChance:.4,rule:{enabled:true,bounds:{min:0,max:.6}},roll:.5});
 const textCrit=calculateCritical({eligible:textHit.hit,chance:.8,bonus:.5,rule:{enabled:true,bounds:{min:0,max:.75}},roll:()=>.2});
 const textDamage=calculateDamageB1(20,[],textCrit.bonus);
 const text=calculateMitigation({ruleKey:'fixed-ward',damage:textDamage.beforeDefense,rating:10,rule:{enabled:true,bounds:{min:.25,max:.25},baseK:20,levelPenalty:0,levelScalingEnabled:false}});
 const base=calculateDamageB0({base:100,rank:1,perRank:0,sourceOrder:['nội-lực'],sourceValue:()=>40,coefficient:()=>.5,resolveFlat:()=>({definition:0,additional:0,resolved:0})});
 const voLam=calculateMitigation({ruleKey:'hộ-thể',damage:calculateDamageB1(base.raw,[],0).beforeDefense,rating:100,sourceLevel:5,targetLevel:1,rule:{enabled:true,bounds:{min:0,max:.85},baseK:100,levelPenalty:.25,levelScalingEnabled:true}});
 const rule:RatingMitigationRule={enabled:true,bounds:{min:0,max:.9},baseK:100,levelPenalty:0,levelScalingEnabled:false};
 const critical=calculateCritical({eligible:true,chance:.4,bonus:.5,rule:{enabled:true,bounds:{min:0,max:1}},roll:()=>.1});
 const arpgDamage=calculateDamageB1(20,[{value:.5}],critical.bonus).beforeDefense;
 const arpg=['plate','aether'].map((ruleKey,index)=>calculateMitigation({ruleKey,damage:arpgDamage,rating:index===0?300:100,rule}));
 const literal:'hộ-thể'=voLam.ruleKey;void literal;
 return {textHit,textCrit,text,voLam,arpg};
}
