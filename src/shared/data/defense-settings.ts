export const DEFENSE_TYPES=['dodgeChance','armorReduction','magicReduction'] as const;
export type DefenseType=typeof DEFENSE_TYPES[number];
export interface DefenseRule {default:number;min:number;max:number;enabled:boolean;coefficients:Record<string,number>}
export interface DefenseSettings {version:1;types:Record<DefenseType,DefenseRule>}
export type DamageDelivery='direct_hit'|'melee_hitbox'|'projectile'|'instant_aoe'|'timed_aoe_sequence'|'dot';
export interface DefenseActor {id:string;level?:number|undefined}
export interface DefenseContext {
 source:DefenseActor;target:DefenseActor;damageType:'Physical'|'Magic';tags:readonly string[];
 mechanic:DamageDelivery;armorRating:number;magicResistanceRating:number;dodgeChance?:number;
}
export interface DefenseConfigSnapshot {revision:number;settings:DefenseSettings}
const rule=():DefenseRule=>({default:0,min:0,max:.85,enabled:true,coefficients:{}});
// Configuration readiness is not runtime mechanic support.
export const DEFAULT_DEFENSE_SETTINGS:DefenseSettings={version:1,types:{dodgeChance:rule(),armorReduction:rule(),magicReduction:rule()}};
export function validateDefenseSettings(input:unknown):string[]{
 const errors:string[]=[],object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 if(!object(input)||Object.keys(input).sort().join()!=='types,version'||input.version!==1||!object(input.types)||Object.keys(input.types).sort().join()!==[...DEFENSE_TYPES].sort().join())return ['Defense: version1 and exact types required'];
 for(const id of DEFENSE_TYPES){const r=input.types[id];
  if(!object(r)||Object.keys(r).sort().join()!=='coefficients,default,enabled,max,min'){errors.push(id+': exact defense rule fields required');continue;}
  if(typeof r.enabled!=='boolean'||![r.default,r.min,r.max].every(v=>typeof v==='number'&&Number.isFinite(v))||Number(r.min)<0||Number(r.min)>Number(r.default)||Number(r.default)>Number(r.max)||Number(r.max)>=1)errors.push(id+': boolean Enabled and 0 <= Min <= Default <= Max < 1 required');
  if(!object(r.coefficients)||Object.keys(r.coefficients).length>16||Object.entries(r.coefficients).some(([k,v])=>! /^[a-z][a-zA-Z0-9_]{0,47}$/.test(k)||typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e8))errors.push(id+': up to16 named finite coefficients required');
  if((id==='armorReduction'||id==='magicReduction')&&object(r.coefficients)){
   const c=r.coefficients;
   const label=id==='armorReduction'?'Armor':'Magic Resistance';
   if(c.baseK!==undefined&&(!(typeof c.baseK==='number')||!Number.isFinite(c.baseK)||c.baseK<=0))errors.push(label+': BaseK must be finite and >0');
   if(c.levelPenalty!==undefined&&(!(typeof c.levelPenalty==='number')||!Number.isFinite(c.levelPenalty)||c.levelPenalty<0))errors.push(label+': LevelPenalty must be finite and >=0');
   if(c.levelScalingEnabled!==undefined&&c.levelScalingEnabled!==0&&c.levelScalingEnabled!==1)errors.push(label+': levelScalingEnabled must be0 or1');
  }
 }
 return errors;
}
