import {expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import * as stats from '../../src/stats/stat-calculation.js';
import * as modifiers from '../../src/modifiers/modifier-core.js';
import * as contracts from '../../src/contracts/stat-contracts.js';
// @ts-expect-error Capture observer deliberately uses JavaScript, like existing goldens.
import {observeStatMutations} from '../fixtures/stat-mutation-scenarios.mjs';

const golden = JSON.parse(readFileSync(new URL('../fixtures/stat-mutation-golden.json', import.meta.url), 'utf8'));
const actual: {name: string}[] = observeStatMutations(stats, modifiers, contracts);
it('pins mutation oracle to the pre-extraction revision and complete scenario list', () => {
  expect(golden.revision).toBe('a05439ec504b759df48d3345eea199fecf08083f');
  expect(actual.map(s => s.name)).toStrictEqual(golden.scenarios.map((s: {name: string}) => s.name));
});
it.each(actual.map((value, i) => [value.name, value, golden.scenarios[i]] as const))('%s: exact mutable-input observation parity', (_name, value, expected) => {
  expect(value).toStrictEqual(expected);
});

it('keeps callback result/contribution references and thrown resolver/transform objects during mutation', () => {
  const contribution = {id: 'one', source: 'equipment' as const, sourceInstanceId: 'one', target: 'armor', operation: 'add_flat' as const, value: 2, enabled: true, conditions: []};
  const prepared = modifiers.prepareModifierResolver([contribution]);
  const config = structuredClone(contracts.DEFAULT_CORE_STATS);
  const seen = new Map<string, ReturnType<typeof prepared>>();
  const result = stats.resolveCharacterStats({str: 10, dex: 10, int: 10, vit: 10}, config, (base, id) => {
    if (id === 'str') config.stats.armor.min = 5;
    const resolved = prepared(base, id); seen.set(id, resolved); return resolved;
  }, {str: 10, dex: 10, int: 10, vit: 10});
  for (const id of contracts.ATTRIBUTE_IDS) expect(result.core[id].resolved).toBe(seen.get(id));
  for (const id of contracts.STAT_IDS) expect(result.details[id].resolved).toBe(seen.get(id));
  expect(result.details.armor.resolved.contributions).toBe(seen.get('armor')!.contributions);
  expect(result.details.armor.resolved.contributions[0]).toBe(contribution);
  const error = new Error('same object');
  for (const phase of ['resolve', 'transform']) {
    const rule = {min: 0};
    let thrown: unknown;
    try { stats.calculateEffectiveStat(3, 'armor', (base, id) => {
      rule.min = 5; if (phase === 'resolve') throw error; return prepared(base, id);
    }, rule, () => {throw error;}); } catch (caught) { thrown = caught; }
    expect(thrown).toBe(error);
  }
});
