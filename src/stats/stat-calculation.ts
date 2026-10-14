import { ATTRIBUTE_IDS,DEFAULT_CORE_STATS,ELEMENTAL_STATS,STAT_IDS,type CharacterBaseStats,type CoreAttribute,type PlayerStat,type PlayerStatsConfig } from '../contracts/stat-contracts.js';
import type { prepareModifierResolver } from '../modifiers/modifier-core.js';

// CDR is already resolved/capped by the shared stat resolver, not capped here.
export function cooldownDurationMs(baseMs:number,effectiveCdr:number):number {
 if(!Number.isFinite(baseMs)||baseMs<0||!Number.isFinite(effectiveCdr)||effectiveCdr<0||effectiveCdr>1)throw Error('Invalid resolved cooldown');
 return baseMs*(1-effectiveCdr);
}

// Actor-independent Flat → summed Percent/Points → transform → bounds. Base
// adapters own content/scaling; neither Player defaults nor equipment leak into NPCs.
export function calculateEffectiveStat(base:number,target:string,resolve:ReturnType<typeof prepareModifierResolver>,rule:{min:number;max?:number;enabled?:boolean},transform:(value:number)=>number=value=>value,precision?:number){
 const resolved=resolve(base,target),uncapped=transform(resolved.value);
 const clamp=(value:number)=>Math.max(rule.min,Math.min(rule.max??Infinity,value));
 let value=rule.enabled===false?0:clamp(uncapped);
 if(precision!==undefined&&rule.enabled!==false)value=clamp(Number(value.toFixed(precision)));
 return {value,uncapped,resolved};
}

// One Core → Derived pass. Callers supply bases/sources, never actor type.
export function resolveCharacterStats(bases:CharacterBaseStats,config:PlayerStatsConfig,resolve:ReturnType<typeof prepareModifierResolver>,baseline:Record<CoreAttribute,number>,extras:Partial<Record<PlayerStat,number>>={},transform:(id:PlayerStat,value:number)=>number=(_,v)=>v){
 const attributes={} as Record<CoreAttribute,number>,core={} as Record<CoreAttribute,ReturnType<typeof calculateEffectiveStat>>;
 for(const id of ATTRIBUTE_IDS){const r=config.attributes[id];core[id]=calculateEffectiveStat(bases[id],id,resolve,{min:r.min??0,...(r.max!==undefined?{max:r.max}:{})});attributes[id]=core[id].value;}
 const values={} as Record<PlayerStat,number>,details={} as Record<PlayerStat,ReturnType<typeof calculateEffectiveStat>>,scaling={} as Record<PlayerStat,number>;
 for(const id of STAT_IDS){const r=config.stats[id]??DEFAULT_CORE_STATS.stats[id],dodge=id==='dodgeChance'?config.defense?.types.dodgeChance:undefined;
  scaling[id]=ATTRIBUTE_IDS.reduce((n,k)=>n+(r.scalingEnabled?.[k]===false?0:(attributes[k]-baseline[k])*r.scaling[k]),0);
  const cap=dodge?.max??r.max;
  details[id]=calculateEffectiveStat((bases[id]??r.default)+scaling[id]+(extras[id]??0),id,resolve,{min:dodge?.min??r.min,...(cap!==undefined?{max:cap}:{}),enabled:!(config.version>=2&&ELEMENTAL_STATS.has(id))&&dodge?.enabled!==false},v=>transform(id,v),4);
  values[id]=details[id].value;
 }
 return {attributes,core,values,details,scaling};
}

// Extracted resource rule from v0.5.6; callers write back into existing state.
// Undefined initializes full; zero/absolute resources survive recalculation.
export function updateCurrentResources(hp:number|undefined,mp:number|undefined,stats:{maxHp:number;maxMana:number;hpRegen:number;manaRegen:number},elapsedMs=0,alive=true){
 if(![stats.maxHp,stats.maxMana,stats.hpRegen,stats.manaRegen,elapsedMs].every(v=>Number.isFinite(v)&&v>=0)||[hp,mp].some(v=>v!==undefined&&!Number.isFinite(v)))throw Error('Invalid resource input');
 let currentHp=Math.max(0,Math.min(stats.maxHp,hp??stats.maxHp)),currentMp=Math.max(0,Math.min(stats.maxMana,mp??stats.maxMana));
 if(alive&&currentHp>0){const seconds=elapsedMs/1000;
  // Precision normalization must never remove a living fraction or spend MP.
  currentHp=Math.min(stats.maxHp,Math.max(currentHp,Number((currentHp+stats.hpRegen*seconds).toFixed(12))));
  currentMp=Math.min(stats.maxMana,Math.max(currentMp,Number((currentMp+stats.manaRegen*seconds).toFixed(12))));
 }
 return {currentHp,currentMp};
}
