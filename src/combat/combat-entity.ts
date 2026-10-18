import type {CombatEntity,CombatEntityIdentity} from '../contracts/combat-entity.js';
import {calculateResourceTransition} from '../kernel/resources/resource-calculation.js';
export type {CombatEntity,CombatEntityIdentity} from '../contracts/combat-entity.js';
import {ATTRIBUTE_IDS,STAT_IDS,type CharacterBaseStats} from '../contracts/stat-contracts.js';
/** Caller owns mechanic-specific contact deduplication and the actual HP field.
 * No ledger, reward, death state or alternate resource store lives in Core. */
export function applyEntityDamage(currentHp:number,finalDamage:number,effectiveMaxHp:number){
 if(![currentHp,finalDamage,effectiveMaxHp].every(n=>Number.isFinite(n)&&n>=0))throw Error('Validated nonnegative HP/damage required');
 const result=calculateResourceTransition({resource:'hp',current:currentHp,maximum:effectiveMaxHp,amount:finalDamage,operation:'decrease',rule:{minimum:0,currentAboveMaximum:'allow',allowIncreaseFromMinimum:false}});
 return {before:currentHp,after:result.after,appliedDamage:result.applied,defeated:result.reachedMinimum};
}
/** Pure HP recovery; resource normalization remains the Stats owner's concern. */
export function applyEntityHealing(currentHp:number,healAmount:number,effectiveMaxHp:number){
 if(![currentHp,healAmount,effectiveMaxHp].every(n=>Number.isFinite(n)&&n>=0)||currentHp>effectiveMaxHp)throw Error('Validated nonnegative HP/healing and HP bounds required');
 const result=calculateResourceTransition({resource:'hp',current:currentHp,maximum:effectiveMaxHp,amount:healAmount,operation:'increase',rule:{minimum:0,currentAboveMaximum:'reject',allowIncreaseFromMinimum:false}});
 return {before:currentHp,after:result.after,appliedHealing:result.applied};
}
/** Pure explicit MP gain; normalization/regeneration remain owned by Stats. */
export function applyEntityManaGain(currentMp:number,gainAmount:number,effectiveMaxMana:number){
 if(![currentMp,gainAmount,effectiveMaxMana].every(n=>Number.isFinite(n)&&n>=0)||currentMp>effectiveMaxMana)throw Error('Validated nonnegative MP/gain and MP bounds required');
 const result=calculateResourceTransition({resource:'mp',current:currentMp,maximum:effectiveMaxMana,amount:gainAmount,operation:'increase',rule:{minimum:0,currentAboveMaximum:'reject',allowIncreaseFromMinimum:true}});
 return {before:currentMp,after:result.after,appliedMana:result.applied};
}
const fields=['entityId','entityType','level','factionId','targetTags','baseStats','currentHp','currentMp'];
const statIds=new Set<string>([...ATTRIBUTE_IDS,...STAT_IDS]);
export function validateCombatEntity(input:unknown):string[]{
 const errors:string[]=[];
 if(!input||typeof input!=='object'||Array.isArray(input))return ['entity: object required'];
 const e=input as Record<string,unknown>;
 if(Object.keys(e).sort().join()!==[...fields].sort().join())errors.push('entity: exact fields required');
 for(const id of ['entityId','factionId'])if(typeof e[id]!=='string'||!e[id].trim())errors.push(id+': nonempty string required');
 if(e.entityType!=='player'&&e.entityType!=='monster')errors.push('entityType: player or monster required');
 if(!Number.isSafeInteger(e.level)||Number(e.level)<1)errors.push('level: positive safe integer required');
 for(const id of ['currentHp','currentMp'])if(typeof e[id]!=='number'||!Number.isFinite(e[id])||e[id]<0)errors.push(id+': finite nonnegative number required');
 if(!Array.isArray(e.targetTags)||e.targetTags.some(t=>t!=='boss'&&t!=='elite')||new Set(e.targetTags).size!==e.targetTags.length)errors.push('targetTags: unique boss/elite tags required');
 if(!e.baseStats||typeof e.baseStats!=='object'||Array.isArray(e.baseStats))errors.push('baseStats: existing Character Stats required');
 else {
  const stats=e.baseStats as Record<string,unknown>;
  for(const id of ATTRIBUTE_IDS)if(!Object.hasOwn(stats,id))errors.push('baseStats.'+id+': required');
  for(const [id,value] of Object.entries(stats))if(!statIds.has(id)||typeof value!=='number'||!Number.isFinite(value))errors.push('baseStats.'+id+': known stat and finite number required');
 }
 return errors;
}
/** Validation only: no registry, manager or persistence. IDs include generation. */
export function validateCombatEntities(entities:readonly CombatEntity[]):string[]{
 const seen=new Set<string>(),errors:string[]=[];
 for(const e of entities){errors.push(...validateCombatEntity(e));if(seen.has(e.entityId))errors.push('duplicate entityId: '+e.entityId);seen.add(e.entityId);}
 return errors;
}
