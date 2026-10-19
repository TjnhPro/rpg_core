import {expect, it} from 'vitest';
import {calculateStats, calculateEffectiveValue, calculateCooldownDurationMs} from '../../src/kernel/index.js';
import type {PreparedStatCalculationInput, StatModifierResolver, StatBreakdown, StatCalculationResult, ModifierResult} from '../../src/kernel/index.js';

for (const [attribute, stat] of [['luck', 'persuasion'], ['nội-lực', 'ngoại-công'], ['spirit', 'ward']] as const) {
  it(`calculates custom ${attribute}/${stat} without gameplay dependencies`, () => {
    const input: PreparedStatCalculationInput<string, string> = {
      attributeOrder: [attribute], statOrder: [stat], attributeBases: {[attribute]: 6},
      attributeBaselines: {[attribute]: 2}, attributeRules: {[attribute]: {default: 0, enabled: true, bounds: {max: 5}}},
      baseStats: {}, flatContributions: {[stat]: 1},
      rules: {[stat]: {default: 3, training: 999, scaling: [{attribute, coefficient: 2, enabled: true}], enabled: true, bounds: {max: 25}, precision: {decimalPlaces: 4}}},
      transforms: {[stat]: n => n * 2},
    };
    const calls: [number, string][] = [];
    // Pre-resolved numeric data; deliberately not a modifier calculator.
    const records = {[attribute]: {value: 6, diagnostic: 'attribute'}, [stat]: {value: 10, diagnostic: 'derived'}};
    const resolve: StatModifierResolver<string, {value: number; diagnostic: string}> = (base, key) => {calls.push([base, key]); return records[key]!;};
    const result = calculateStats(input, resolve);
    expect(calls).toStrictEqual([[6, attribute], [10, stat]]);
    expect(result.attributes[attribute]).toBe(5);
    expect(result.details[stat]).toStrictEqual({base: 3, scaling: 6, flat: 1, resolved: records[stat], uncapped: 20, value: 20});
    expect(result.details[stat]!.resolved).toBe(records[stat]);
    expect(result.values[stat]).toBe(20);
  });
}
it('honors ordered accumulation, disabled terms and explicit input values', () => {
  const input: PreparedStatCalculationInput<'a' | 'b' | 'c' | 'd', 'sum' | 'off'> = {
    attributeOrder: ['a', 'b', 'c', 'd'], statOrder: ['sum', 'off'],
    attributeBases: {a: 1e16, b: 1, c: -1e16, d: 1}, attributeBaselines: {a: 0, b: 0, c: 0, d: 0},
    attributeRules: {a: {default: 0, enabled: true, bounds: {}}, b: {default: 0, enabled: true, bounds: {}}, c: {default: 0, enabled: true, bounds: {}}, d: {default: 0, enabled: true, bounds: {}}},
    baseStats: {sum: 0}, flatContributions: {}, rules: {
      sum: {default: 999, training: 999, enabled: true, bounds: {}, scaling: ['a', 'b', 'c', 'd'].map(attribute => ({attribute: attribute as 'a' | 'b' | 'c' | 'd', coefficient: 1, enabled: true}))},
      off: {default: 4, training: 999, enabled: false, bounds: {}, scaling: [{attribute: 'a', coefficient: Infinity, enabled: false}]},
    }, transforms: {off: () => Infinity},
  };
  const trace: string[] = [];
  const result = calculateStats(input, (base, key) => {trace.push(key); return {value: base};});
  expect(trace).toEqual(['a', 'b', 'c', 'd', 'sum', 'off']);
  expect(result.details.sum.scaling).toBe(1);
  expect(result.values.sum).toBe(1);
  expect(result.details.off.scaling).toBe(0);
  expect(result.details.off.uncapped).toBe(Infinity);
  expect(result.values.off).toBe(0);
});
it('retains scalar diagnostics and reclamps rounded values without default precision', () => {
  const resolved = {value: 1.23456};
  const resolve = () => resolved;
  expect(calculateEffectiveValue(0, 'x', resolve, {enabled: true, bounds: {max: 1.23456}, precision: {decimalPlaces: 4}})).toStrictEqual({value: 1.23456, uncapped: 1.23456, resolved});
  expect(calculateEffectiveValue(0, 'x', resolve, {enabled: true, bounds: {}}).value).toBe(1.23456);
  expect(calculateEffectiveValue(0, 'x', () => ({value: -5}), {enabled: true, bounds: {}}).value).toBe(-5);
  expect(calculateCooldownDurationMs(1000, .3)).toBe(700);
  expect(() => calculateCooldownDurationMs(1000, NaN)).toThrow('Invalid resolved cooldown');
});

it('supports prototype-like identifiers and explicit integer-key evaluation order', () => {
  const rule = {default: 0, enabled: true, bounds: {}, scaling: [], training: 0};
  const input: PreparedStatCalculationInput<'__proto__', '2' | '1' | 'constructor'> = {
    attributeOrder: ['__proto__'], statOrder: ['2', '1', 'constructor'],
    attributeBases: {['__proto__']: 5}, attributeBaselines: {['__proto__']: 0},
    attributeRules: {['__proto__']: rule}, baseStats: Object.create(null), flatContributions: Object.create(null),
    rules: {'1': rule, '2': rule, constructor: rule},
  };
  const calls: string[] = [];
  const result = calculateStats(input, (base, key) => {calls.push(key); return {value: base};});
  expect(calls).toEqual(['__proto__', '2', '1', 'constructor']);
  expect(Object.hasOwn(result.attributes, '__proto__')).toBe(true);
  expect(result.attributes.__proto__).toBe(5);
  expect(result.values.constructor).toBe(0);
});

// Default generic instantiations keep the v2.0.2 resolved contracts exactly.
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const defaultBreakdown: Equal<StatBreakdown<'a', 's', 'src'>['resolved'], ModifierResult<'a' | 's', 'src'>> = true;
const defaultResult: Equal<StatCalculationResult<'a', 's', 'src'>['attributeDetails']['a']['resolved'], ModifierResult<'a' | 's', 'src'>> = true;
void [defaultBreakdown, defaultResult];
