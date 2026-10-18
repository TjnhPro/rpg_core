import {calculateResourceTransition,normalizeResource,calculateResourceRegeneration} from '../../src/kernel/index.js';
export function kernelResourceExamples(){
 const textDamage=calculateResourceTransition({resource:'health',current:120,maximum:100,amount:10,operation:'decrease',rule:{minimum:0,currentAboveMaximum:'allow',allowIncreaseFromMinimum:false}});
 const textHeal=calculateResourceTransition({resource:'health',current:0,maximum:100,amount:20,operation:'increase',rule:{minimum:0,currentAboveMaximum:'reject',allowIncreaseFromMinimum:false}});
 const hp=normalizeResource({resource:'sinhLuc',minimum:0,maximum:120});
 const mp=normalizeResource({resource:'noiLuc',current:-10,minimum:0,maximum:80});
 const manaGain=calculateResourceTransition({resource:'noiLuc',current:0,maximum:80,amount:20,operation:'increase',rule:{minimum:0,currentAboveMaximum:'reject',allowIncreaseFromMinimum:true}});
 const voLam=calculateResourceRegeneration({resource:mp.resource,current:mp.after,minimum:0,maximum:80,ratePerSecond:3,elapsedSeconds:.5,eligible:hp.after>0,precision:{decimalPlaces:12}});
 const arpg=calculateResourceTransition({resource:'energy',current:Number.MAX_VALUE/2,maximum:Number.MAX_VALUE,amount:Number.MAX_VALUE,operation:'increase',rule:{minimum:10,currentAboveMaximum:'reject',allowIncreaseFromMinimum:true}});
 const arpgRegen=calculateResourceRegeneration({resource:'energy',current:10,minimum:10,maximum:100,ratePerSecond:2,elapsedSeconds:3,eligible:true,precision:{decimalPlaces:2}});
 const literal:'health'=textDamage.resource;
 return {textDamage,textHeal,hp,mp,manaGain,voLam,arpg,arpgRegen,literal};
}
