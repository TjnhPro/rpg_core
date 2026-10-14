import {expect, it} from 'vitest';
import type {CombatModifier} from '../../src/contracts/combat-modifiers.js';
import {collectActiveModifiers, prepareModifierResolver} from '../../src/modifiers/modifier-core.js';

const modifier = (id: string, operation: CombatModifier['operation'], value: number): CombatModifier =>
  ({id, source: 'setting', sourceInstanceId: id, target: 'criticalChance', operation, value, enabled: true, conditions: []});

it('pins Flat then Percent then percentage points and stable contribution order across permutations', () => {
  const mods = [modifier('flat', 'add_flat', .1), modifier('percent', 'add_percent', .5), modifier('points', 'add_percentage_points', .2)];
  const forward = prepareModifierResolver(mods)(.1, 'criticalChance');
  expect(forward.value).toBeCloseTo(.5);
  expect(prepareModifierResolver([...mods].reverse())(.1, 'criticalChance')).toEqual(forward);
  expect(prepareModifierResolver([...mods, mods[0]!])(.1, 'criticalChance')).toEqual(forward);
});

it('rejects conflicting source identity, preserves distinct instances and requires explicit passive ownership', () => {
  const a = modifier('same', 'add_flat', .1);
  expect(() => prepareModifierResolver([a, {...a, value: .2}])).toThrow('Conflicting Modifier');
  expect(prepareModifierResolver([a, {...a, sourceInstanceId: 'other'}])(0, 'criticalChance').value).toBe(.2);
  const passive = {...a, source: 'passive' as const};
  expect(collectActiveModifiers([passive])).toEqual([]);
  expect(collectActiveModifiers([passive], {passives: new Set(['same'])})).toEqual([passive]);
  expect(collectActiveModifiers([{...passive, enabled: false}], {passives: new Set(['same'])})).toEqual([]);
});

it('rejects unsupported contributions and nonfinite calculated results', () => {
  const a = modifier('bad', 'add_flat', .1);
  expect(() => prepareModifierResolver([{...a, conditions: ['unimplemented']}])).toThrow('Conditional');
  expect(() => prepareModifierResolver([{...a, value: NaN}])).toThrow('value');
  expect(() => prepareModifierResolver([])(Infinity, 'str')).toThrow('Nonfinite');
});
