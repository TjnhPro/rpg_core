import {DAMAGE_SOURCES,DAMAGE_TAGS,type DamageDefinition} from '../contracts/damage-contracts.js';
import {validateSkillMechanics,type MeleeHitbox,type ProjectileConfig,type TimedObjectConfig,type InstantAOE,type TimedAOESequence} from '../contracts/mechanic-contracts.js';
import {validateDots,type DotConfig} from '../contracts/dot-contracts.js';
import {validAllowedRelations,type FactionRelation} from '../combat/combat-state.js';
import {validateEffectDefinition,type EffectDefinition} from '../effects/effect-system.js';

/** Inline resolved component: config references are checked, never fetched at hit. */
export interface SkillDamageComponent {id:string;definition:DamageDefinition;damageType:'Physical'|'Magic';tags:string[];rank:number}
export interface SkillOnHitDot {config:DotConfig;damage:SkillDamageComponent}
interface EffectBase {allowedTargetRelations?:readonly FactionRelation[];onHit?:SkillOnHitDot[]}
export type SkillGameplayEffect=EffectBase & (
 | {type:'modifier_effect';definition:EffectDefinition;target:'self'|'selected'}
 | {type:'direct_hit';damage:SkillDamageComponent}
 | {type:'melee_hitbox';config:MeleeHitbox;damage:SkillDamageComponent}
 | {type:'projectile';config:ProjectileConfig;damage:SkillDamageComponent}
 | {type:'instant_aoe';config:InstantAOE;damage:SkillDamageComponent}
 | {type:'timed_aoe_sequence';config:TimedAOESequence;damage:SkillDamageComponent}
 | {type:'timed_object';config:TimedObjectConfig;projectile:{config:ProjectileConfig;damage:SkillDamageComponent}}
);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join()===keys.sort().join();
export function validateSkillDamageComponent(value:unknown):string[]{
 if(!object(value)||!exact(value,['id','definition','damageType','tags','rank']))return ['damage: exact resolved component required'];
 const d=value.definition;
 if(typeof value.id!=='string'||!value.id.trim()||!['Physical','Magic'].includes(String(value.damageType))||!Number.isSafeInteger(value.rank)||Number(value.rank)<1)return ['damage: invalid identity/type/rank'];
 if(!Array.isArray(value.tags)||new Set(value.tags).size!==value.tags.length||value.tags.some(t=>!DAMAGE_TAGS.includes(t as never)))return ['damage: invalid tags'];
 if(!object(d)||!exact(d,['base','flat','scaling','perRank'])||![d.base,d.flat,d.perRank].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1000000)
  ||!object(d.scaling)||!exact(d.scaling,[...DAMAGE_SOURCES])||Object.values(d.scaling).some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1000000))return ['damage: invalid existing B0 definition'];
 return [];
}
/** Closed, ordered gameplay-only data. No inferred tag handlers or art paths. */
export function validateSkillEffects(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>32)return ['effects: ordered list, max32 required'];
 const errors:string[]=[];
 for(const e of value){
  if(!object(e)||!['direct_hit','melee_hitbox','projectile','instant_aoe','timed_aoe_sequence','timed_object','modifier_effect'].includes(String(e.type))){errors.push('effects: unsupported type');continue;}
  if(e.type==='modifier_effect'){
   if(!exact(e,['type','definition','target',...(Object.hasOwn(e,'allowedTargetRelations')?['allowedTargetRelations']:[])]))errors.push('effects: unknown/missing modifier effect fields');
   if(e.target!=='self'&&e.target!=='selected')errors.push('effects: invalid modifier recipient');
   if(Object.hasOwn(e,'allowedTargetRelations')&&!validAllowedRelations(e.allowedTargetRelations))errors.push('effects: invalid target relations');
   const result=validateEffectDefinition(e.definition);if(!result.success)errors.push('effects: '+result.reason,...(result.errors??[]));
   continue;
  }
  const keys=['type',...(e.type==='timed_object'?['config','projectile']:['damage',...(e.type==='direct_hit'?[]:['config'])]),...(Object.hasOwn(e,'allowedTargetRelations')?['allowedTargetRelations']:[]),...(Object.hasOwn(e,'onHit')?['onHit']:[])];
  if(!exact(e,keys))errors.push('effects: unknown/missing fields');
  if(Object.hasOwn(e,'allowedTargetRelations')&&!validAllowedRelations(e.allowedTargetRelations))errors.push('effects: invalid target relations');
  if(e.type==='timed_object'){
   errors.push(...validateSkillMechanics({timed_object:e.config}));
   if(!object(e.projectile)||!exact(e.projectile,['config','damage'])){errors.push('effects: resolved projectile required');continue;}
   errors.push(...validateSkillMechanics({projectile:e.projectile.config}),...validateSkillDamageComponent(e.projectile.damage));
   if((e.config as TimedObjectConfig)?.projectileRef!==(e.projectile.damage as SkillDamageComponent)?.id)errors.push('effects: projectileRef mismatch');
  }else{
   errors.push(...validateSkillDamageComponent(e.damage));
   if(e.type!=='direct_hit')errors.push(...validateSkillMechanics({[String(e.type)]:e.config}));
   if(['instant_aoe','timed_aoe_sequence'].includes(String(e.type))&&(e.config as InstantAOE)?.damageComponent!==(e.damage as SkillDamageComponent)?.id)errors.push('effects: damageComponent mismatch');
  }
  if(Object.hasOwn(e,'onHit')){
   if(!Array.isArray(e.onHit)||e.onHit.some(d=>!object(d)||!exact(d,['config','damage']))){errors.push('effects: onHit Dot declarations required');continue;}
   errors.push(...validateDots(e.onHit.map(d=>d.config)));
   for(const d of e.onHit){errors.push(...validateSkillDamageComponent(d.damage));if(d.config?.damageComponent!==d.damage?.id)errors.push('effects: Dot component mismatch');
    if(d.damage?.damageType!==(d.config?.tags?.includes('Magic')?'Magic':'Physical'))errors.push('effects: Dot type/tag mismatch');}
  }
 }
 return errors;
}
export function freezeGameplayData<T>(value:T):T {
 const copy=structuredClone(value);
 const freeze=(v:unknown):void=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};
 freeze(copy);return copy;
}
