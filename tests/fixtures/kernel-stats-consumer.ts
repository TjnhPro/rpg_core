import {calculateStats, calculateEffectiveValue, calculateCooldownDurationMs} from '../../src/kernel/index.js';
import type {PreparedStatCalculationInput, StatModifierResolver} from '../../src/kernel/index.js';

export function kernelStatsConsumer() {
  const input: PreparedStatCalculationInput<'luck', 'power'> = {
    attributeOrder: ['luck'], statOrder: ['power'], attributeBases: {luck: 6}, attributeBaselines: {luck: 2},
    attributeRules: {luck: {default: 0, enabled: true, bounds: {max: 5}}}, baseStats: {}, flatContributions: {power: 1},
    rules: {power: {default: 3, training: 100, enabled: true, bounds: {}, scaling: [{attribute: 'luck', coefficient: 2, enabled: true}]}},
  };
  const calls: string[] = [];
  const resolve: StatModifierResolver<'luck' | 'power', {value: number}> = (base, key) => {calls.push(key); return {value: base};};
  const result = calculateStats(input, resolve);
  if (result.attributes.luck !== 5 || result.values.power !== 10 || result.details.power.scaling !== 6 || calls.join(',') !== 'luck,power') throw Error('Installed Kernel stat calculation mismatch');
  if (calculateEffectiveValue(1.23456, 'x', base => ({value: base}), {bounds: {}, enabled: true, precision: {decimalPlaces: 4}}).value !== 1.2346) throw Error('Installed Kernel scalar mismatch');
  if (calculateCooldownDurationMs(1000, .5) !== 500) throw Error('Installed Kernel cooldown mismatch');
  return result.values.power;
}
