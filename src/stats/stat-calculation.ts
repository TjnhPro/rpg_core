import { ATTRIBUTE_IDS,DEFAULT_CORE_STATS,ELEMENTAL_STATS,STAT_IDS,type CharacterBaseStats,type CoreAttribute,type PlayerStat,type PlayerStatsConfig } from '../contracts/stat-contracts.js';
import {calculateEffectiveValue,calculateStats,calculateCooldownDurationMs} from '../kernel/stats/stat-calculation.js';
import {normalizeResource,calculateResourceRegeneration} from '../kernel/resources/resource-calculation.js';
import type {NumericRule} from '../kernel/contracts/common.js';
import type {DerivedStatRule} from '../kernel/contracts/stats.js';
import type { prepareModifierResolver } from '../modifiers/modifier-core.js';

// CDR is already resolved/capped; the numerical implementation belongs to Kernel.
export function cooldownDurationMs(baseMs:number,effectiveCdr:number):number {
 return calculateCooldownDurationMs(baseMs,effectiveCdr);
}

// Preserve the Legacy signature and original resolver diagnostics by reference.
export function calculateEffectiveStat(base:number,target:string,resolve:ReturnType<typeof prepareModifierResolver>,rule:{min:number;max?:number;enabled?:boolean},transform:(value:number)=>number=value=>value,precision?:number){
 // Standalone Legacy rules are read after resolver/transform, on each clamp.
 const result=calculateEffectiveValue(base,target,resolve,{bounds:{get min(){return rule.min;},get max(){return rule.max??Infinity;}},get enabled(){return rule.enabled!==false;},...(precision!==undefined?{precision:{decimalPlaces:precision}}:{})},transform);
 return {value:result.value,uncapped:result.uncapped,resolved:result.resolved};
}

// Legacy owns vocabulary/config selection only; Kernel owns the complete pass.
export function resolveCharacterStats(bases:CharacterBaseStats,config:PlayerStatsConfig,resolve:ReturnType<typeof prepareModifierResolver>,baseline:Record<CoreAttribute,number>,extras:Partial<Record<PlayerStat,number>>={},transform:(id:PlayerStat,value:number)=>number=(_,v)=>v){
 // Select each rule on its turn, then capture its scalar policy before its own
 // callback, as the original character adapter did. These are numerical views,
 // not a configuration snapshot or a second calculation pass.
 const attributeRules=Object.defineProperties({},Object.fromEntries(ATTRIBUTE_IDS.map(id=>[id,{enumerable:true,get():NumericRule{const r=config.attributes[id];return {default:r.default,bounds:{min:r.min??0,...(r.max!==undefined?{max:r.max}:{})},enabled:true};}}]))) as Record<CoreAttribute,NumericRule>;
 const rules=Object.defineProperties({},Object.fromEntries(STAT_IDS.map(id=>[id,{enumerable:true,get():DerivedStatRule<CoreAttribute>{const r=config.stats[id]??DEFAULT_CORE_STATS.stats[id],dodge=id==='dodgeChance'?config.defense?.types.dodgeChance:undefined;
  const cap=dodge?.max??r.max;
  return {get default(){return r.default;},training:r.training,scaling:ATTRIBUTE_IDS.map(k=>({attribute:k,coefficient:r.scaling[k],enabled:r.scalingEnabled?.[k]!==false})),bounds:{min:dodge?.min??r.min,...(cap!==undefined?{max:cap}:{})},enabled:!(config.version>=2&&ELEMENTAL_STATS.has(id))&&dodge?.enabled!==false,precision:{decimalPlaces:4}};
 }}]))) as Record<PlayerStat,DerivedStatRule<CoreAttribute>>;
 const transforms=Object.fromEntries(STAT_IDS.map(id=>[id,(value:number)=>transform(id,value)])) as Record<PlayerStat,(value:number)=>number>;
 const baseStats=Object.defineProperties({},Object.fromEntries(STAT_IDS.map(id=>[id,{enumerable:true,get(){return bases[id];}}]))) as Partial<Record<PlayerStat,number>>;
 const flatContributions=Object.defineProperties({},Object.fromEntries(STAT_IDS.map(id=>[id,{enumerable:true,get(){return extras[id];}}]))) as Partial<Record<PlayerStat,number>>;
 const result=calculateStats({attributeOrder:ATTRIBUTE_IDS,statOrder:STAT_IDS,attributeBases:bases,attributeRules,attributeBaselines:baseline,baseStats,rules,flatContributions,transforms},resolve);
 const attributes=result.attributes as Record<CoreAttribute,number>,core={} as Record<CoreAttribute,ReturnType<typeof calculateEffectiveStat>>;
 for(const id of ATTRIBUTE_IDS){const d=result.attributeDetails[id];core[id]={value:d.value,uncapped:d.uncapped,resolved:d.resolved};}
 const values=result.values as Record<PlayerStat,number>,details={} as Record<PlayerStat,ReturnType<typeof calculateEffectiveStat>>,scaling={} as Record<PlayerStat,number>;
 for(const id of STAT_IDS){const d=result.details[id];details[id]={value:d.value,uncapped:d.uncapped,resolved:d.resolved};scaling[id]=d.scaling;}
 return {attributes,core,values,details,scaling};
}

// Extracted resource rule from v0.5.6; callers write back into existing state.
// Undefined initializes full; zero/absolute resources survive recalculation.
export function updateCurrentResources(hp:number|undefined,mp:number|undefined,stats:{maxHp:number;maxMana:number;hpRegen:number;manaRegen:number},elapsedMs=0,alive=true){
 if(![stats.maxHp,stats.maxMana,stats.hpRegen,stats.manaRegen,elapsedMs].every(v=>Number.isFinite(v)&&v>=0)||[hp,mp].some(v=>v!==undefined&&!Number.isFinite(v)))throw Error('Invalid resource input');
 let currentHp=normalizeResource({resource:'hp',...(hp===undefined?{}:{current:hp}),minimum:0,get maximum(){return stats.maxHp;}}).after,
     currentMp=normalizeResource({resource:'mp',...(mp===undefined?{}:{current:mp}),minimum:0,get maximum(){return stats.maxMana;}}).after;
 if(alive&&currentHp>0){const seconds=elapsedMs/1000;
  currentHp=calculateResourceRegeneration({resource:'hp',current:currentHp,minimum:0,get maximum(){return stats.maxHp;},get ratePerSecond(){return stats.hpRegen;},elapsedSeconds:seconds,eligible:true,precision:{decimalPlaces:12}}).after;
  currentMp=calculateResourceRegeneration({resource:'mp',current:currentMp,minimum:0,get maximum(){return stats.maxMana;},get ratePerSecond(){return stats.manaRegen;},elapsedSeconds:seconds,eligible:true,precision:{decimalPlaces:12}}).after;
 }
 return {currentHp,currentMp};
}
