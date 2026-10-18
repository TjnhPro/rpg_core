import {calculateDamageB0, calculateDamageB1, calculateDamageBonusValue, prepareNumericalModifiers} from '../../src/kernel/index.js';
import type {DamageB0Input, DamageB0Result, ModifierAdapter} from '../../src/kernel/index.js';

/** Consumer-owned source identifiers and eligibility; no Legacy dependency. */
export function kernelDamageConsumer() {
  type Source = 'strength' | 'weapon';
  type Modifier = {id: string; value: number};
  const adapter: ModifierAdapter<Modifier> = {
    identity: m => ({id:m.id,source:'custom',sourceInstanceId:'one'}), enabled: () => true, equivalent: (a,b) => a.id === b.id && a.value === b.value,
    target: () => 'flat', operation: () => 'add_flat', value: m => m.value,
  };
  const resolver = prepareNumericalModifiers([{id:'one',value:3}], adapter);
  const input: DamageB0Input<Source> = {
    perRank: .5, rank: 2, base: 10, sourceOrder: ['strength','weapon'],
    sourceValue: source => source === 'strength' ? 2 : 4,
    coefficient: source => source === 'strength' ? .5 : 2,
    resolveFlat: () => ({definition:1, additional:2, resolved:resolver(0, 'flat').value}),
  };
  const b0: DamageB0Result<Source> = calculateDamageB0(input);
  const bonus = calculateDamageBonusValue([{amount:2},{amount:3}], item => item.amount, () => .1);
  const b1 = calculateDamageB1(b0.raw, [{value:bonus}], .25);
  return {b0, bonus, b1};
}

export function kernelDamageExamples() {
  const text = calculateDamageB0({base:10,rank:1,perRank:0,sourceOrder:['might'],sourceValue:()=>2,coefficient:()=>1,resolveFlat:()=>({definition:0,additional:0,resolved:0})});
  const arpg = calculateDamageB0({base:5,rank:2,perRank:1,sourceOrder:['void:weapon'],sourceValue:()=>5,coefficient:()=>1,resolveFlat:()=>({definition:0,additional:0,resolved:0})});
  return {
    text:calculateDamageB1(text.raw,[{value:.5}],.5).beforeDefense,
    voLam:kernelDamageConsumer(),
    arpg:calculateDamageB1(arpg.raw,[{value:calculateDamageBonusValue([1,2],v=>v,()=>.1)}],.5),
  };
}
