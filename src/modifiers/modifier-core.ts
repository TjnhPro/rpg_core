import {validateCombatModifiers,type CombatModifier} from '../contracts/combat-modifiers.js';
import {ATTRIBUTE_IDS,STAT_IDS,ELEMENTAL_STATS} from '../contracts/stat-contracts.js';
import type {DamageContext} from '../contracts/damage-contracts.js';
import {selectCanonicalModifiers,prepareNumericalModifiers,matchesAnyTag} from '../kernel/modifiers/modifier-resolution.js';
import type {ModifierAdapter} from '../kernel/contracts/modifier-resolution.js';

const legacyAdapter:ModifierAdapter<CombatModifier>={
 identity:m=>m,enabled:m=>m.enabled,target:m=>m.target,operation:m=>m.operation,value:m=>m.value,
 equivalent:(previous,next)=>JSON.stringify(previous)===JSON.stringify(next),
};

export function damageBonusReason(m:CombatModifier,c:DamageContext,attackerOnly=false){
 const scope=c.defender?.mechanic==='dot'?'dot':'direct';
 if((m.damageType??'all')!=='all'&&m.damageType!==c.type.toLowerCase())return 'damage type mismatch';
 if((m.scope??'direct')!=='all'&&(m.scope??'direct')!==scope)return 'scope mismatch';
 // Keep the context expression inside each required-tag branch, including its
 // short-circuit reads. Capturing event tags before matching changes Legacy timing.
 if(m.eventTags?.length&&!m.eventTags.some(t=>matchesAnyTag([t],c.eventTags??c.tags,tag=>tag.toLowerCase())))return 'event tag mismatch';
 const targetTags=c.entities?.defender.targetTags??[c.target.toLowerCase()];
 if(!attackerOnly&&m.targetTags?.length&&!matchesAnyTag(m.targetTags,targetTags))return 'target tag mismatch';
 return 'eligible';
}

// Lifecycle stays with Inventory/Effect systems. Unknown passive lifecycle is
// explicit inactive, never inferred from an active skill's learned rank.
export interface ActiveModifierSources {
 equipment?:ReadonlySet<string>;
 buffs?:ReadonlySet<string>;
 passives?:ReadonlySet<string>;
}

// Source adapters supply live identities only. No Entity registry, cached
// collection or duration ownership; identity normalization is shared with resolver.
export function collectActiveModifiers(modifiers:readonly CombatModifier[],sources:ActiveModifierSources={}){
 // Membership remains caller-owned and is read lazily for each selected source.
 const activeInstances=Object.assign(new Map<string,ReadonlySet<string>>(),{
  get(key:string){return key==='equipment'?sources.equipment:key==='buff'?sources.buffs:key==='passive'?sources.passives:undefined;},
 });
 return selectCanonicalModifiers(modifiers,legacyAdapter,{alwaysActive:new Set(['setting']),activeInstances});
}

// Prepared only for one calculation boundary, never cached across equipment,
// status or config changes. Validate/sort once, not once for each derived stat.
export function prepareModifierResolver(modifiers:readonly CombatModifier[]){
 const resolve=prepareNumericalModifiers(modifiers,legacyAdapter,contributions=>{
 // Config validation owns versioned operation policy. Preserve historical pinned
 // relative-percent semantics here; never silently convert them into points.
 if(contributions.length){const errors=validateCombatModifiers(contributions,[...ATTRIBUTE_IDS,...STAT_IDS.filter(id=>!ELEMENTAL_STATS.has(id))],false);if(errors.length)throw Error(errors.join('\n'));}
 });
 return (base:number,target:string)=>{
 const {flat,percent,percentagePoints,totalFlat,value,contributions}=resolve(base,target);
 return {base,flat,percent,percentagePoints,totalFlat,value,contributions};
 };
}

export function resolveModifiers(base:number,target:string,modifiers:readonly CombatModifier[]){
 return prepareModifierResolver(modifiers)(base,target);
}
