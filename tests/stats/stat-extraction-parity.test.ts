import {expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import * as stats from '../../src/stats/stat-calculation.js';
import * as modifiers from '../../src/modifiers/modifier-core.js';
import * as contracts from '../../src/contracts/stat-contracts.js';
// @ts-expect-error Shared capture inputs/observer is intentionally JavaScript.
import {observeStats} from '../fixtures/stat-parity-scenarios.mjs';

const golden = JSON.parse(readFileSync(new URL('../fixtures/stat-parity-golden.json', import.meta.url), 'utf8'));
const observed: {name: string}[] = observeStats(stats, modifiers, contracts);
it('uses pre-extraction outcomes, not an old runtime calculator', () => {
  expect(golden.revision).toBe('a05439ec504b759df48d3345eea199fecf08083f');
  expect(observed.map(s => s.name)).toEqual(golden.scenarios.map((s: {name: string}) => s.name));
});
it.each(observed.map((actual, i) => [actual.name, actual, golden.scenarios[i]] as const))('%s: exact nested numerical/error/trace parity', (_name, actual, expected) => {
  expect(actual).toStrictEqual(expected);
});

it('retains original resolver objects, contribution arrays/order/objects and callback errors', () => {
  const a = {id: 'a', source: 'equipment' as const, sourceInstanceId: 'a', target: 'armor', operation: 'add_flat' as const, value: 2, enabled: true, conditions: []};
  const b = {...a, id: 'b', sourceInstanceId: 'b', value: 3};
  const prepared = modifiers.prepareModifierResolver([b, a]);
  const seen = new Map<string, ReturnType<typeof prepared>>();
  const resolve = (base: number, target: string) => {const value = prepared(base, target); seen.set(target, value); return value;};
  const config = structuredClone(contracts.DEFAULT_CORE_STATS);
  const result = stats.resolveCharacterStats({str: 10, dex: 10, int: 10, vit: 10}, config, resolve, {str: 10, dex: 10, int: 10, vit: 10});
  for (const id of contracts.ATTRIBUTE_IDS) expect(result.core[id].resolved).toBe(seen.get(id));
  for (const id of contracts.STAT_IDS) expect(result.details[id].resolved).toBe(seen.get(id));
  expect(result.details.armor.resolved.contributions).toBe(seen.get('armor')!.contributions);
  expect(result.details.armor.resolved.contributions[0]).toBe(a);
  expect(result.details.armor.resolved.contributions[1]).toBe(b);
  const error = new Error('same caller object');
  try { stats.calculateEffectiveStat(1, 'armor', resolve, {min: 0}, () => {throw error;}); }
  catch (caught) { expect(caught).toBe(error); return; }
  throw Error('Expected original caller error');
});
