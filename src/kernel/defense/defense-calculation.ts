import type {HitCalculationInput,HitCalculationResult,CriticalCalculationInput,CriticalCalculationResult,MitigationCalculationInput,MitigationCalculationResult} from '../contracts/defense.js';

/** Lazy numerical Dodge. Caller supplies eligibility and selected bounds.
 * A consumed roll is validated; zero/disabled/ineligible chance never draws.
 * Callbacks are invoked unbound. Live getters are read at the shown boundaries. */
export function calculateHit(input:HitCalculationInput):HitCalculationResult {
 const chance=input.rule.enabled&&input.eligible&&input.dodgeChance!==undefined
  ?Math.max('min' in input.rule.bounds?input.rule.bounds.min!:-Infinity,Math.min('max' in input.rule.bounds?input.rule.bounds.max!:Infinity,input.dodgeChance)):0;
 const roll=chance>0?input.roll:null;
 const value=roll===null?null:typeof roll==='function'?roll():roll;
 if(value!==null&&(!Number.isFinite(value)||value<0||value>1))throw Error('Dodge roll must be0..1');
 const dodged=value!==null&&value<chance;
 return {hit:!dodged,dodged,onHitSuccess:!dodged,eligible:input.eligible,enabled:input.rule.enabled,chance,roll:value};
}

/** Eligible Critical draws before chance, even at zero chance. Unlike Dodge,
 * rolls are not range-validated. Bonus is read only on success; multiplier is
 * diagnostic only and must not replace the additive bonus used by B1. */
export function calculateCritical(input:CriticalCalculationInput):CriticalCalculationResult {
 if(!input.eligible||!input.rule.enabled)return {chance:0,roll:null,isCritical:false,bonus:0,multiplier:1};
 const roll=input.roll,value=typeof roll==='function'?roll():roll;
 const chance=Math.max('min' in input.rule.bounds?input.rule.bounds.min!:-Infinity,Math.min('max' in input.rule.bounds?input.rule.bounds.max!:Infinity,input.chance));
 const isCritical=value<chance,bonus=isCritical?Math.max(0,input.bonus):0;
 return {chance,roll:value,isCritical,bonus,multiplier:1+bonus};
}

/** Generic rating mitigation. Missing diagnostics are computed even when
 * disabled. Optional absent bounds are unbounded; explicit invalid values are
 * not normalized. No gameplay vocabulary, default coefficients or rounding. */
export function calculateMitigation<RuleKey extends string=string>(input:MitigationCalculationInput<RuleKey>):MitigationCalculationResult<RuleKey> {
 const rating=input.rating,rule=input.rule,levelScalingEnabled=rule.levelScalingEnabled;
 const missing:string[]=[];
 if(!(Number.isFinite(rule.baseK)&&rule.baseK!>0))missing.push('baseK');
 if(!(Number.isFinite(rule.levelPenalty)&&rule.levelPenalty!>=0))missing.push('levelPenalty');
 if(levelScalingEnabled&&(input.sourceLevel===undefined||input.targetLevel===undefined))missing.push('source/target level');
 const levelGap=input.sourceLevel!==undefined&&input.targetLevel!==undefined?Math.max(0,input.sourceLevel-input.targetLevel):null;
 const effectiveK=missing.length?null:rule.baseK!*(1+(levelScalingEnabled?levelGap!:0)*rule.levelPenalty!);
 const rawReduction=effectiveK!==null&&rating>0?rating/(rating+effectiveK):0;
 const reduction=rule.enabled&&!missing.length&&rating>0?Math.max('min' in rule.bounds?rule.bounds.min!:-Infinity,Math.min('max' in rule.bounds?rule.bounds.max!:Infinity,rawReduction)):0;
 const status=!rule.enabled?'disabled':missing.length?'missing_config':'applied';
 const damage=input.damage,finalDamage=damage*(1-reduction),preventedDamage=damage-finalDamage;
 return {ruleKey:input.ruleKey,status,missing,levelGap,levelScalingEnabled,effectiveK,rawReduction,reduction,inputDamage:damage,preventedDamage,finalDamage};
}
