import {expect, it, vi} from 'vitest';
import {DEFAULT_DEFENSE_SETTINGS, type DefenseContext} from '../../src/contracts/defense-settings.js';
import {mitigateDefense, resolveDefenseHit, validateDefenseContext} from '../../src/damage/defense-engine.js';

const context = (): DefenseContext => ({source: {id: 'a', level: 5}, target: {id: 'b', level: 1},
  damageType: 'Physical', tags: [], mechanic: 'direct_hit', armorRating: 100, magicResistanceRating: 300, dodgeChance: .5});
const snapshot = () => {
  const settings = structuredClone(DEFAULT_DEFENSE_SETTINGS);
  settings.types.armorReduction.coefficients = {baseK: 100, levelPenalty: .25};
  settings.types.magicReduction.coefficients = {baseK: 100, levelPenalty: .25};
  return {revision: 7, settings};
};

it('selects armor/MR, scales only positive level gaps and honors configured caps', () => {
  expect(mitigateDefense(120, context(), snapshot()).finalDamage).toBeCloseTo(80);
  expect(mitigateDefense(120, {...context(), damageType: 'Magic'}, snapshot()).finalDamage).toBeCloseTo(48);
  const lower = {...context(), source: {id: 'a', level: 1}, target: {id: 'b', level: 5}};
  expect(mitigateDefense(120, lower, snapshot()).finalDamage).toBe(60);
  const capped = snapshot(); capped.settings.types.armorReduction.max = .2;
  expect(mitigateDefense(120, lower, capped).finalDamage).toBe(96);
});

it('reports missing coefficients/levels without inventing mitigation; disabled policy consumes no reduction', () => {
  expect(mitigateDefense(100, context()).mitigation.status).toBe('missing_config');
  const noLevels = {...context(), source: {id: 'a'}, target: {id: 'b'}};
  expect(mitigateDefense(100, noLevels, snapshot()).finalDamage).toBe(100);
  const unscaled = snapshot(); unscaled.settings.types.armorReduction.coefficients.levelScalingEnabled = 0;
  expect(mitigateDefense(100, noLevels, unscaled).finalDamage).toBe(50);
  unscaled.settings.types.armorReduction.enabled = false;
  expect(mitigateDefense(100, noLevels, unscaled).mitigation.status).toBe('disabled');
  expect(mitigateDefense(0, context(), snapshot()).finalDamage).toBe(0);
});

it('uses a strict dodge threshold and consumes no RNG for DoT, zero chance or disabled dodge', () => {
  expect(resolveDefenseHit(context(), snapshot(), .499).dodged).toBe(true);
  expect(resolveDefenseHit(context(), snapshot(), .5).hit).toBe(true);
  const roll = vi.fn(() => {throw Error('Unexpected RNG');});
  expect(resolveDefenseHit({...context(), mechanic: 'dot'}, snapshot(), roll).roll).toBeNull();
  expect(resolveDefenseHit({...context(), dodgeChance: 0}, snapshot(), roll).roll).toBeNull();
  const disabled = snapshot(); disabled.settings.types.dodgeChance.enabled = false;
  expect(resolveDefenseHit(context(), disabled, roll).roll).toBeNull();
  expect(roll).not.toHaveBeenCalled();
});

it('rejects malformed defense actors, ratings, chances, damage and RNG before resolving', () => {
  for (const change of [{armorRating: -1}, {magicResistanceRating: NaN}, {dodgeChance: Infinity},
    {source: {id: ''}}, {target: {id: 'b', level: 0}}]) {
    expect(() => validateDefenseContext({...context(), ...change})).toThrow();
  }
  for (const value of [-1, NaN, Infinity]) expect(() => mitigateDefense(value, context(), snapshot())).toThrow();
  for (const value of [-.01, 1.01, NaN]) expect(() => resolveDefenseHit(context(), snapshot(), value)).toThrow('Dodge roll');
});
