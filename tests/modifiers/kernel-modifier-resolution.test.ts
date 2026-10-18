import {expect, it} from 'vitest';
import {prepareNumericalModifiers, selectCanonicalModifiers, matchesAnyTag} from '../../src/kernel/index.js';
import type {NumericalModifier, ModifierAdapter} from '../../src/kernel/index.js';
import {kernelModifiersConsumer} from '../fixtures/kernel-modifiers-consumer.js';

const m = (id: string, value = 2): NumericalModifier => ({identity: {source: 'custom', sourceInstanceId: 'one', id}, target: '__proto__', operation: 'add_flat', value, enabled: true});
it('runs three independent consumers through the canonical prepared resolver', () => {
  expect(kernelModifiersConsumer()).toEqual({text: 9, voLam: 17, arpg: .30000000000000004});
});
it('matches exactly, lazily, in required/available order without mutation', () => {
  const trace: string[] = [], required = ['b', 'a'], available = ['A', 'B', 'C'];
  expect(matchesAnyTag(required, available)).toBe(false);
  expect(matchesAnyTag(required, available, tag => {trace.push(tag); return tag.toLowerCase();})).toBe(true);
  expect(trace).toEqual(['A', 'B']);
  expect(matchesAnyTag([], available, () => {throw Error('must not run');})).toBe(false);
  expect(matchesAnyTag(['a'], [])).toBe(false);
  expect(required).toEqual(['b', 'a']); expect(available).toEqual(['A', 'B', 'C']);
});
it('uses opaque source membership before enabled dedup and preserves original winner', () => {
  const a = m('a'), last = {...a}, inactive = {...m('a', 9), identity: {...a.identity, sourceInstanceId: 'other'}};
  const selected = selectCanonicalModifiers([inactive, a, last], {alwaysActive: new Set(), activeInstances: new Map([['custom', new Set(['one'])]])});
  expect(selected).toHaveLength(1); expect(selected[0]).toBe(last);
  expect(selectCanonicalModifiers([a], {alwaysActive: new Set(), activeInstances: new Map()})).toEqual([]);
  expect(selectCanonicalModifiers([a], {alwaysActive: new Set(['custom']), activeInstances: new Map()})[0]).toBe(a);
});
it('rejects actual conflicting numerical payloads and nonfinite final results', () => {
  expect(() => prepareNumericalModifiers([m('a'), m('a', 3)])).toThrow('Conflicting Modifier instance');
  expect(() => prepareNumericalModifiers([])(Infinity, 'x')).toThrow('Nonfinite Modifier result');
  expect(prepareNumericalModifiers([m('a')])(1, '__proto__').value).toBe(3);
});
it('keeps full custom payload equivalence, validation once, grouping timing and original errors', () => {
  type Item = {id: string; target: string; amount: number; label: string};
  const error = new Error('caller policy'); const trace: string[] = [];
  const adapter: ModifierAdapter<Item> = {identity: x => ({source: 's', sourceInstanceId: 'i', id: x.id}), enabled: () => true,
    target: x => {trace.push('target'); return x.target;}, operation: () => 'add_flat', value: x => x.amount,
    equivalent: (a, b) => JSON.stringify(a) === JSON.stringify(b)};
  const a: Item = {id: 'a', target: 'old', amount: 2, label: 'full payload'};
  expect(() => prepareNumericalModifiers([a, {...a, label: 'changed'}], adapter)).toThrow('Conflicting Modifier instance');
  const p = prepareNumericalModifiers([a], adapter, selected => {trace.push('validate'); expect(selected[0]).toBe(a); a.target = 'new';});
  expect(trace).toEqual(['validate', 'target', 'target']);
  expect(p(1, 'new').contributions[0]).toBe(a); expect(p(1, 'old').value).toBe(1);
  p(1, 'new'); expect(trace).toHaveLength(3);
  try {prepareNumericalModifiers([a], adapter, () => {throw error;});} catch (caught) {expect(caught).toBe(error); return;}
  throw Error('Expected validation error');
});
