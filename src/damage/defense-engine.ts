import {DEFAULT_DEFENSE_SETTINGS,DEFENSE_TYPES,type DefenseContext,type DefenseConfigSnapshot} from '../contracts/defense-settings.js';
import {calculateHit,calculateMitigation} from '../kernel/defense/defense-calculation.js';
export type {DefenseContext,DefenseConfigSnapshot} from '../contracts/defense-settings.js';
export function validateDefenseContext(c:DefenseContext){
 if(c?.dodgeChance!==undefined&&(!Number.isFinite(c.dodgeChance)||c.dodgeChance<0))throw Error('Invalid Dodge Chance');
 if(!c||!['Physical','Magic'].includes(c.damageType)||!['direct_hit','melee_hitbox','projectile','instant_aoe','timed_aoe_sequence','dot'].includes(c.mechanic)||!Array.isArray(c.tags)||c.tags.some(t=>typeof t!=='string')||![c.armorRating,c.magicResistanceRating].every(n=>Number.isFinite(n)&&n>=0)||![c.source,c.target].every(a=>a&&typeof a.id==='string'&&a.id.length>0&&a.id.length<=200&&(a.level===undefined||Number.isInteger(a.level)&&a.level>=1)))throw Error('Invalid Defense Context');
}
export function resolveDefenseHit(context:DefenseContext,snapshot?:DefenseConfigSnapshot,roll:number|(()=>number)=1){
 validateDefenseContext(context);
 const rule=(snapshot?.settings??DEFAULT_DEFENSE_SETTINGS).types.dodgeChance,dodgeEligible=context.mechanic!=='dot';
 // Forward live reads; Kernel calls the supplied local roll without a receiver.
 const result=calculateHit({eligible:dodgeEligible,get dodgeChance(){return context.dodgeChance!;},roll,
  rule:{get enabled(){return rule.enabled;},bounds:{get min(){return rule.min;},get max(){return rule.max;}}}});
 return {hit:result.hit,dodged:result.dodged,onHitSuccess:result.onHitSuccess,dodgeEligible,enabled:result.enabled,chance:result.chance,roll:result.roll,status:'implemented' as const};
}
export function mitigateDefense(damage:number,context:DefenseContext,snapshot?:DefenseConfigSnapshot){
 validateDefenseContext(context);if(!Number.isFinite(damage)||damage<0)throw Error('Validated nonnegative damage required');
 const settings=snapshot?.settings??DEFAULT_DEFENSE_SETTINGS,magic=context.damageType==='Magic';
 const rule=settings.types[magic?'magicReduction':'armorReduction'];
 const rating=magic?context.magicResistanceRating:context.armorRating,c=rule.coefficients;
 // Capture the coefficient container once, but forward its fields and actor
 // levels live. Non-null assertions erase only types, never missing values.
 const result=calculateMitigation({damage,ruleKey:magic?'magicReduction':'armorReduction',rating,
  get sourceLevel(){return context.source.level!;},get targetLevel(){return context.target.level!;},
  rule:{get enabled(){return rule.enabled;},get baseK(){return c.baseK!;},get levelPenalty(){return c.levelPenalty!;},get levelScalingEnabled(){return c.levelScalingEnabled!==0;},bounds:{get min(){return rule.min;},get max(){return rule.max;}}}});
 const {reduction,finalDamage}=result;
 const details={status:result.status as string,missing:result.missing.map(field=>field==='source/target level'?'attacker/defender level':field),levelGap:result.levelGap,levelScalingEnabled:result.levelScalingEnabled,effectiveK:result.effectiveK,rawReduction:result.rawReduction};
 return {armor:context.armorRating,context,config:{version:settings.version,revision:snapshot?.revision??0},
  mechanics:DEFENSE_TYPES.map(type=>({type,enabled:settings.types[type].enabled,status:'implemented' as const,appliedReduction:type===(magic?'magicReduction':'armorReduction')?reduction:0})),
  mitigation:{mode:magic?'magic_resistance' as const:'physical_armor' as const,...details,reductionMin:rule.min,reductionCap:rule.max,damageType:context.damageType,attackerLevel:context.source.level??null,defenderLevel:context.target.level??null,effectiveArmor:context.armorRating,effectiveMagicResistance:context.magicResistanceRating,armorReduction:magic?0:reduction,magicReduction:magic?reduction:0,inputDamage:damage,preventedDamage:result.preventedDamage,finalDamage},finalDamage};
}
