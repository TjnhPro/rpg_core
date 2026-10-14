import {ATTRIBUTE_IDS,STAT_IDS,type CharacterBaseStats} from '../data/stat-contracts.js';

/** Pure session-local data view, never an alternative saved/authoritative state. */
export interface CombatEntity {
 entityId:string;
 entityType:'player'|'monster';
 level:number;
 factionId:string;
 targetTags:('boss'|'elite')[];
 baseStats:CharacterBaseStats;
 currentHp:number;
 currentMp:number;
}
export type CombatEntityIdentity=Pick<CombatEntity,'entityId'|'entityType'|'level'|'targetTags'>;
/** Caller owns mechanic-specific contact deduplication and the actual HP field.
 * No ledger, reward, death state or alternate resource store lives in Core. */
export function applyEntityDamage(currentHp:number,finalDamage:number,effectiveMaxHp:number){
 if(![currentHp,finalDamage,effectiveMaxHp].every(n=>Number.isFinite(n)&&n>=0))throw Error('Validated nonnegative HP/damage required');
 const after=Math.max(0,Math.min(effectiveMaxHp,currentHp-finalDamage));
 return {before:currentHp,after,appliedDamage:Math.min(currentHp,finalDamage),defeated:currentHp>0&&after===0};
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
