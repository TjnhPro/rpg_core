import {DEFAULT_DEFENSE_SETTINGS,DEFENSE_TYPES,type DefenseContext,type DefenseConfigSnapshot} from '../contracts/defense-settings.js';
export type {DefenseContext,DefenseConfigSnapshot} from '../contracts/defense-settings.js';
export function validateDefenseContext(c:DefenseContext){
 if(c?.dodgeChance!==undefined&&(!Number.isFinite(c.dodgeChance)||c.dodgeChance<0))throw Error('Invalid Dodge Chance');
 if(!c||!['Physical','Magic'].includes(c.damageType)||!['direct_hit','melee_hitbox','projectile','instant_aoe','timed_aoe_sequence','dot'].includes(c.mechanic)||!Array.isArray(c.tags)||c.tags.some(t=>typeof t!=='string')||![c.armorRating,c.magicResistanceRating].every(n=>Number.isFinite(n)&&n>=0)||![c.source,c.target].every(a=>a&&typeof a.id==='string'&&a.id.length>0&&a.id.length<=200&&(a.level===undefined||Number.isInteger(a.level)&&a.level>=1)))throw Error('Invalid Defense Context');
}
export function resolveDefenseHit(context:DefenseContext,snapshot?:DefenseConfigSnapshot,roll:number|(()=>number)=1){
 validateDefenseContext(context);
 const rule=(snapshot?.settings??DEFAULT_DEFENSE_SETTINGS).types.dodgeChance,dodgeEligible=context.mechanic!=='dot';
 const chance=rule.enabled&&dodgeEligible&&context.dodgeChance!==undefined?Math.max(rule.min,Math.min(rule.max,context.dodgeChance)):0;
 // Zero chance, disabled policy and DoT consume no RNG. Roll at contact, not cast.
 const value=chance>0?(typeof roll==='function'?roll():roll):null;
 if(value!==null&&(!Number.isFinite(value)||value<0||value>1))throw Error('Dodge roll must be0..1');
 const dodged=value!==null&&value<chance;
 return {hit:!dodged,dodged,onHitSuccess:!dodged,dodgeEligible,enabled:rule.enabled,chance,roll:value,status:'implemented' as const};
}
function ratingReduction(rating:number,context:DefenseContext,rule:(typeof DEFAULT_DEFENSE_SETTINGS)['types']['armorReduction']){
 const c=rule.coefficients,levelScalingEnabled=c.levelScalingEnabled!==0;
 const missing:string[]=[];
 if(!(Number.isFinite(c.baseK)&&c.baseK!>0))missing.push('baseK');
 if(!(Number.isFinite(c.levelPenalty)&&c.levelPenalty!>=0))missing.push('levelPenalty');
 if(levelScalingEnabled&&(context.source.level===undefined||context.target.level===undefined))missing.push('attacker/defender level');
 const levelGap=context.source.level!==undefined&&context.target.level!==undefined?Math.max(0,context.source.level-context.target.level):null;
 const effectiveK=missing.length?null:c.baseK!*(1+(levelScalingEnabled?levelGap!:0)*c.levelPenalty!);
 const rawReduction=effectiveK!==null&&rating>0?rating/(rating+effectiveK):0;
 const reduction=rule.enabled&&!missing.length&&rating>0?Math.max(rule.min,Math.min(rule.max,rawReduction)):0;
 const status=!rule.enabled?'disabled':missing.length?'missing_config':'applied';
 return {status,missing,levelGap,levelScalingEnabled,effectiveK,rawReduction,reduction};
}
export function mitigateDefense(damage:number,context:DefenseContext,snapshot?:DefenseConfigSnapshot){
 validateDefenseContext(context);if(!Number.isFinite(damage)||damage<0)throw Error('Validated nonnegative damage required');
 const settings=snapshot?.settings??DEFAULT_DEFENSE_SETTINGS,magic=context.damageType==='Magic';
 const rule=settings.types[magic?'magicReduction':'armorReduction'];
 const result=ratingReduction(magic?context.magicResistanceRating:context.armorRating,context,rule);
 const {reduction,...details}=result;
 const finalDamage=damage*(1-reduction);
 return {armor:context.armorRating,context,config:{version:settings.version,revision:snapshot?.revision??0},
  mechanics:DEFENSE_TYPES.map(type=>({type,enabled:settings.types[type].enabled,status:'implemented' as const,appliedReduction:type===(magic?'magicReduction':'armorReduction')?reduction:0})),
  mitigation:{mode:magic?'magic_resistance' as const:'physical_armor' as const,...details,reductionMin:rule.min,reductionCap:rule.max,damageType:context.damageType,attackerLevel:context.source.level??null,defenderLevel:context.target.level??null,effectiveArmor:context.armorRating,effectiveMagicResistance:context.magicResistanceRating,armorReduction:magic?0:reduction,magicReduction:magic?reduction:0,inputDamage:damage,preventedDamage:damage-finalDamage,finalDamage},finalDamage};
}
