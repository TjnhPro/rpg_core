import {expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as modifiers from '../../src/modifiers/modifier-core.js';
import * as damage from '../../src/damage/damage-core.js';
import type {CombatModifier} from '../../src/contracts/combat-modifiers.js';
// @ts-expect-error Shared input/observer is deliberately JavaScript, not an engine.
import {observeModifiers} from '../fixtures/modifier-parity-scenarios.mjs';

const golden = JSON.parse(readFileSync(new URL('../fixtures/modifier-parity-golden.json', import.meta.url), 'utf8'));
const observed: {name: string}[] = observeModifiers(modifiers, damage);
it('pins accepted original sources and the complete scenario inventory', () => {
  expect(golden.revision).toBe('390c6e8c96f467903401d18b32a4e44184b5f94e');
  for (const [file, hash] of Object.entries(golden.sources)) {
    const source = execFileSync('git', ['show', `${golden.revision}:${file}`], {encoding: 'utf8'});
    expect(createHash('sha256').update(source).digest('hex')).toBe(hash);
  }
  expect(observed.map(s => s.name)).toStrictEqual(golden.scenarios.map((s: {name: string}) => s.name));
});
it.each(observed.map((actual, i) => [actual.name, actual, golden.scenarios[i]] as const))('%s: exact nested result/error/trace parity', (_name, actual, expected) => {
  expect(actual).toStrictEqual(expected);
});

it('keeps original last duplicates, mutable present arrays, fresh absent arrays and exact result shape', () => {
  const first: CombatModifier = {id: 'a', source: 'setting', sourceInstanceId: 's', target: 'str', operation: 'add_flat', value: 2, enabled: true, conditions: []};
  const last = {...first};
  const p = modifiers.prepareModifierResolver([first, last]);
  const a = p(1, 'str'), b = p(2, 'str');
  expect(a.contributions[0]).toBe(last);
  expect(a.contributions).toBe(b.contributions);
  expect(a).not.toBe(b);
  expect(Object.keys(a)).toEqual(['base', 'flat', 'percent', 'percentagePoints', 'totalFlat', 'value', 'contributions']);
  expect(p(1, 'dex').contributions).not.toBe(p(1, 'dex').contributions);
  a.contributions.push({...first, id: 'inserted', value: 3});
  expect(p(1, 'str').value).toBe(6);
  a.contributions.splice(0, 1);
  expect(p(1, 'str').value).toBe(4);
  expect(modifiers.collectActiveModifiers([first, last])[0]).toBe(last);
});

it('propagates original accessor errors at resolve and lazy context errors at matching', () => {
  const error = new Error('original accessor error');
  const m: CombatModifier = {id: 'a', source: 'setting', sourceInstanceId: 's', target: 'str', operation: 'add_flat', value: 2, enabled: true, conditions: []};
  const p = modifiers.prepareModifierResolver([m]);
  Object.defineProperty(m, 'value', {get() {throw error;}});
  expect(() => p(1, 'str')).toThrow(error);
  try { p(1, 'str'); } catch (caught) {expect(caught).toBe(error);}
  const context = {type: 'Physical' as const, tags: [], target: 'Boss' as const, statuses: [], get eventTags(): string[] {throw error;}};
  const bonus: CombatModifier = {id: 'bonus', source: 'setting', sourceInstanceId: 's', enabled: true, conditions: [], value: 1, target: 'damage_bonus', operation: 'add_percentage_points', eventTags: ['basic']};
  try { modifiers.damageBonusReason(bonus, context); } catch (caught) {expect(caught).toBe(error); return;}
  throw Error('Expected original context error');
});
