import {calculateStats, prepareNumericalModifiers, selectCanonicalModifiers, calculateHit, calculateCritical, calculateDamageB0, calculateDamageB1, calculateDamageBonusValue, matchesAnyTag, calculateMitigation, calculateResourceTransition, normalizeResource, calculateResourceRegeneration, calculateCooldownDurationMs} from '@rpg/core/kernel';
import {configuration, probability, resourceRule} from './config.js';
import {observation, thrown} from '../observations.js';
export const ids = ['T1','T2','T3','T4','T5','T6','T7','T8','T9'] as const;

export function runScenario(id: string) {
  const trace: unknown[] = [];
  const config = configuration();
  const stats = () => calculateStats(config.input, prepareNumericalModifiers(selectCanonicalModifiers(config.modifiers)));
  // Text-only policy. It has neither positions nor skill/runtime contracts.
  const attack = (magic: boolean, dodged = false, currentMp = 20) => {
    const character = stats();
    const hitInput = {eligible: true, dodgeChance: magic ? 0 : .25, rule: probability};
    trace.push('hit');
    const hit = calculateHit({...hitInput, roll: () => {trace.push(['dodge', dodged ? .1 : .75]); return dodged ? .1 : .75;}});
    if (!hit.hit) return {inputs: {hitInput}, hit};
    const source = magic ? 'spell' : 'blade';
    const power = magic ? character.values.magicPower : character.values.attackPower;
    const b0Input = {base: magic ? 4 : 8, perRank: 0, rank: 1, sources: {[source]: power}, coefficients: {[source]: 2}, flat: magic ? 0 : 3};
    trace.push('B0');
    const b0 = calculateDamageB0({base: b0Input.base, perRank: 0, rank: 1, sourceOrder: [source], sourceValue: () => power, coefficient: () => 2,
      resolveFlat: () => {trace.push('flat');return {definition: b0Input.flat, additional: 0, resolved: 0};}});
    trace.push('critical');
    const critical = calculateCritical({eligible: true, chance: magic ? 0 : .5, bonus: .5, rule: probability, roll: () => {trace.push(['critical-roll', .25]);return .25;}});
    const eligibleBonus = matchesAnyTag(['physical'], [magic ? 'arcane' : 'physical']);
    const bonus = calculateDamageBonusValue(eligibleBonus ? [1] : [], n => n, () => .25);
    const bonuses = eligibleBonus ? [{id: 'blade-training', value: bonus}] : [];
    trace.push('B1');const b1 = calculateDamageB1(b0.raw, bonuses, critical.bonus);
    const mitigationInput = {damage: b1.beforeDefense, ruleKey: magic ? 'ward' : 'guard', rating: magic ? 100 : 25,
      rule: {enabled: true, bounds: {}, baseK: 100, levelPenalty: 0, levelScalingEnabled: false}};
    trace.push('mitigation');const mitigation = calculateMitigation(mitigationInput);
    const hpInput = {resource: 'hp', current: magic ? 100 : 200, maximum: magic ? 100 : 200, amount: mitigation.finalDamage, operation: 'decrease' as const, rule: resourceRule};
    const hp = calculateResourceTransition(hpInput);
    const costInput = {resource: 'mp', current: currentMp, maximum: 20, amount: magic ? 6 : 0, operation: 'decrease' as const, rule: resourceRule};
    const mp = calculateResourceTransition(costInput);
    trace.push(['commit', hp.after, mp.after]);
    return {inputs: {hitInput, b0Input, critical: {chance: magic ? 0 : .5, bonus: .5, roll: .25}, bonuses, mitigationInput, hpInput, costInput}, hit, b0, critical, b1, mitigation, hp, mp};
  };
  switch(id) {
    case 'T1': {const output = stats();return observation(id, config, output, trace, [output.values.attackPower, output.values.magicPower, output.values.maxHp, output.values.maxMp, output.details.attackPower.uncapped]);}
    case 'T2': case 'T3': {const output = attack(id === 'T3');return observation(id, output.inputs, output, trace, [output.b0!.raw, output.b1!.beforeDefense, output.mitigation!.finalDamage, output.hp!.after, output.mp!.after]);}
    case 'T4': {
      const inputs = [[90,100,25,false],[19,20,8,true],[100,100,5,false],[0,100,5,false],[0,20,5,true]] as const;
      const output = inputs.map(([current,maximum,amount,mana]) => calculateResourceTransition({resource: mana ? 'mp' : 'hp',current,maximum,amount,operation:'increase',rule:{...resourceRule,allowIncreaseFromMinimum:mana}}));
      return observation(id, inputs, output, trace, output.map(r => [r.after,r.applied]));
    }
    case 'T5': {
      const initial={hp:80,mp:2,enemyHp:200};const state={...initial};
      const first=attack(false,false,state.mp);state.enemyHp=first.hp!.after;trace.push(['attack', {...state}]);
      const defenseInput={damage:20,ruleKey:'guard',rating:1,rule:{enabled:true,bounds:{min:.5,max:.5},baseK:100,levelPenalty:0,levelScalingEnabled:false}};
      const defense=calculateMitigation(defenseInput);
      const defend=calculateResourceTransition({resource:'hp',current:state.hp,maximum:100,amount:defense.finalDamage,operation:'decrease',rule:resourceRule});state.hp=defend.after;trace.push(['defend',{...state}]);
      const recovery=calculateResourceTransition({resource:'hp',current:state.hp,maximum:100,amount:15,operation:'increase',rule:resourceRule});state.hp=recovery.after;trace.push(['recover',{...state}]);
      const rejected=state.mp<6;trace.push(['spell',rejected?'insufficient-mp':'admitted',{...state}]);
      return observation(id,{initial,defenseInput,recovery:15,cost:6},{first,defense,defend,recovery,rejected,state},trace,[state.hp,state.mp,state.enemyHp,rejected]);
    }
    case 'T6': {const output=attack(false,true);return observation(id,output.inputs,output,trace,[output.hit.dodged,trace]);}
    case 'T7': {
      const input={attributeOrder:['__proto__'],statOrder:['__proto__'],attributeBases:{['__proto__']:7},attributeBaselines:{['__proto__']:0},attributeRules:{['__proto__']:{default:0,enabled:true,bounds:{}}},baseStats:{},flatContributions:{},rules:{['__proto__']:{default:1,enabled:true,bounds:{},training:0,scaling:[{attribute:'__proto__',coefficient:2,enabled:true}]}}};
      const output=calculateStats(input,prepareNumericalModifiers([]));
      return observation(id,input,output,trace,[output.attributes['__proto__'],output.values['__proto__'],Object.hasOwn(output.values,'__proto__'),output.details['__proto__']!.resolved.contributions.length,Object.keys(output.values)]);
    }
    case 'T8': {
      const inputs={normalize:{resource:'hp',minimum:0,maximum:100},regen:{resource:'hp',current:99.5,minimum:0,maximum:100,ratePerSecond:.125,elapsedSeconds:2,eligible:true,precision:{decimalPlaces:12}}};
      const absent=normalizeResource(inputs.normalize),negative=normalizeResource({...inputs.normalize,current:-1}),regen=calculateResourceRegeneration(inputs.regen);
      const skipped=calculateResourceRegeneration({resource:'mp',current:2,minimum:0,get maximum():number{trace.push('maximum');throw Error('skipped');},get ratePerSecond():number{throw Error('skipped');},get elapsedSeconds():number{throw Error('skipped');},eligible:false,get precision():{decimalPlaces:number}{throw Error('skipped');}});
      return observation(id,inputs,{absent,negative,regen,skipped},trace,[absent.after,absent.initialized,negative.after,regen.after,regen.applied,skipped.after,trace]);
    }
    case 'T9': {
      const input={resource:'hp',current:120,maximum:100,amount:5,rule:resourceRule};
      const increase=calculateResourceTransition({...input,operation:'increase'}),decrease=calculateResourceTransition({...input,operation:'decrease'});
      const rejected=thrown(()=>calculateResourceTransition({...input,operation:'increase',rule:{...resourceRule,currentAboveMaximum:'reject'}}));
      const sentinel={caller:'text-rng'};const error=thrown(()=>calculateHit({eligible:true,dodgeChance:.5,rule:probability,roll:()=>{trace.push('throw');throw sentinel;}}),sentinel);
      const cooldown=calculateCooldownDurationMs(1000,.25);
      return observation(id,{input,baseMs:1000,cdr:.25},{increase,decrease,rejected,error,cooldown},trace,[cooldown,increase.after,increase.applied,decrease.applied,rejected.message,error.same]);
    }
    default: throw Error('Unknown Text scenario '+id);
  }
}
