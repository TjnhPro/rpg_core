import {validateCombatModifiers,type CombatModifier} from '../data/combat-modifiers.js';
import {ATTRIBUTE_IDS,STAT_IDS,ELEMENTAL_STATS} from '../data/stat-contracts.js';
import type {DamageContext} from '../data/damage-contracts.js';

export function damageBonusReason(m:CombatModifier,c:DamageContext,attackerOnly=false){
 const scope=c.defender?.mechanic==='dot'?'dot':'direct';
 if((m.damageType??'all')!=='all'&&m.damageType!==c.type.toLowerCase())return 'damage type mismatch';
 if((m.scope??'direct')!=='all'&&(m.scope??'direct')!==scope)return 'scope mismatch';
 if(m.eventTags?.length&&!m.eventTags.some(t=>(c.eventTags??c.tags).some(tag=>tag.toLowerCase()===t)))return 'event tag mismatch';
 const targetTags=c.entities?.defender.targetTags??[c.target.toLowerCase()];
 if(!attackerOnly&&m.targetTags?.length&&!m.targetTags.some(t=>targetTags.includes(t)))return 'target tag mismatch';
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
 return uniqueModifierInstances(modifiers.filter(m=>m.source==='setting'
  ||m.source==='equipment'&&sources.equipment?.has(m.sourceInstanceId)
  ||m.source==='buff'&&sources.buffs?.has(m.sourceInstanceId)
  ||m.source==='passive'&&sources.passives?.has(m.sourceInstanceId)));
}

function uniqueModifierInstances(modifiers:readonly CombatModifier[]){
 const instances=new Map<string,CombatModifier>();
 for(const m of modifiers){
  if(!m.enabled)continue;
  const key=JSON.stringify([m.source,m.sourceInstanceId,m.id]),previous=instances.get(key);
  if(previous&&JSON.stringify(previous)!==JSON.stringify(m))throw Error('Conflicting Modifier instance');
  instances.set(key,m);
 }
 return [...instances.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,m])=>m);
}

// Prepared only for one calculation boundary, never cached across equipment,
// status or config changes. Validate/sort once, not once for each derived stat.
export function prepareModifierResolver(modifiers:readonly CombatModifier[]){
 const contributions=uniqueModifierInstances(modifiers);
 // Config validation owns versioned operation policy. Preserve historical pinned
 // relative-percent semantics here; never silently convert them into points.
 if(contributions.length){const errors=validateCombatModifiers(contributions,[...ATTRIBUTE_IDS,...STAT_IDS.filter(id=>!ELEMENTAL_STATS.has(id))],false);if(errors.length)throw Error(errors.join('\n'));}
 const groups=new Map<string,CombatModifier[]>();for(const m of contributions){const group=groups.get(m.target)??[];group.push(m);groups.set(m.target,group);}
 return (base:number,target:string)=>{
 const contributions=groups.get(target)??[];
 const sum=(op:CombatModifier['operation'])=>contributions.filter(m=>m.operation===op).reduce((n,m)=>n+m.value,0);
 const flat=sum('add_flat'),percent=sum('add_percent'),percentagePoints=sum('add_percentage_points');
 const totalFlat=base+flat,value=totalFlat*(1+percent)+percentagePoints;
 if(!Number.isFinite(value))throw Error('Nonfinite Modifier result');
 return {base,flat,percent,percentagePoints,totalFlat,value,contributions};
 };
}

export function resolveModifiers(base:number,target:string,modifiers:readonly CombatModifier[]){
 return prepareModifierResolver(modifiers)(base,target);
}
