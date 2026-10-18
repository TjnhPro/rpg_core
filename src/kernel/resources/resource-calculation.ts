import type {ResourceTransitionInput,ResourceTransitionResult,ResourceNormalizationInput,ResourceNormalizationResult,ResourceRegenerationInput} from '../contracts/resources.js';

/** Caller-validated scalar transition: finite ordered bounds, current >= minimum,
 * nonnegative amount. Above-max increase can normalize downward (negative applied).
 * No entity validation, writes, rounding or resource-name policy. */
export function calculateResourceTransition<Resource extends string=string>(input:ResourceTransitionInput<Resource>):ResourceTransitionResult<Resource> {
 const current=input.current,rule=input.rule,minimum=rule.minimum;
 if(rule.currentAboveMaximum==='reject'&&current>input.maximum)throw Error('Current resource exceeds maximum');
 const decrease=input.operation==='decrease';
 const after=decrease?Math.max(minimum,Math.min(input.maximum,current-input.amount))
  :!rule.allowIncreaseFromMinimum&&current===minimum?minimum
  :Math.min(input.maximum,current+Math.min(input.amount,input.maximum-current));
 const applied=decrease?Math.min(current-minimum,input.amount):after-current;
 return {resource:input.resource,before:current,after,applied,reachedMinimum:current>minimum&&after===minimum};
}

/** Undefined initializes full; negative finite current clamps. Maximum is read
 * before the fallback, and again only when current is nullish. No snapshot/freeze. */
export function normalizeResource<Resource extends string=string>(input:ResourceNormalizationInput<Resource>):ResourceNormalizationResult<Resource> {
 const after=Math.max(input.minimum,Math.min(input.maximum,input.current??input.maximum));
 const before=input.current;
 return {resource:input.resource,before,after,initialized:before===undefined};
}

/** Caller supplies normalized current, finite ordered bounds, nonnegative rate/
 * seconds and precision 0..100. Preserve multiplication/addition/toFixed order,
 * living fractions and overflow capping. Ineligible inputs never read regen fields.
 * Live maximum is read before rate; native getter/precision errors propagate. */
export function calculateResourceRegeneration<Resource extends string=string>(input:ResourceRegenerationInput<Resource>):ResourceTransitionResult<Resource> {
 const current=input.current;
 if(!input.eligible)return {resource:input.resource,before:current,after:current,applied:0,reachedMinimum:false};
 const after=Math.min(input.maximum,Math.max(current,Number((current+input.ratePerSecond*input.elapsedSeconds).toFixed(input.precision.decimalPlaces))));
 return {resource:input.resource,before:current,after,applied:after-current,reachedMinimum:current>input.minimum&&after===input.minimum};
}
