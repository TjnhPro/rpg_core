// Inputs and observations only; no modifier arithmetic or historical implementation.
import {encode as encodeScalar} from './stat-parity-scenarios.mjs';
function encode(value) {
  if (value === undefined) return {$undefined: true};
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, encode(v)]));
  return encodeScalar(value);
}
export const modifier = (id = 'a', overrides = {}) => ({id, source: 'setting', sourceInstanceId: id,
  target: 'str', operation: 'add_flat', value: 2, enabled: true, conditions: [], ...overrides});

export function observeModifiers(api, damage) {
  const scenarios = [];
  function record(name, run) {
    const trace = [];
    try { scenarios.push({name, result: encode(run(trace)), trace: encode(trace)}); }
    catch (error) { scenarios.push({name, error: {name: error.name, message: error.message}, trace: encode(trace)}); }
  }
  const resolve = (entries, base = 10, target = 'str') => api.resolveModifiers(base, target, entries);
  for (const [name, entries, base] of [
    ['empty', [], 10], ['flat', [modifier()], 10],
    ['percent', [modifier('p', {operation: 'add_percent', value: .2})], 10],
    ['points', [modifier('p', {target: 'criticalChance', operation: 'add_percentage_points', value: .1})], .1],
    ['mixed', [modifier('f', {target: 'armor', value: .1}), modifier('p', {target: 'armor', operation: 'add_percent', value: .2}), modifier('q', {target: 'armor', operation: 'add_percentage_points', value: .3})], .2],
    ['negative-zero', [modifier('n', {value: -2}), modifier('z', {value: -0})], -0],
    ['negative-percent', [modifier('n', {operation: 'add_percent', value: -2})], -3],
    ['accumulation', [modifier('z', {value: .1}), modifier('a', {value: .2}), modifier('b', {value: -.3})], .1],
    ['negative-damage-bonus', [modifier('n', {target: 'damage_bonus', operation: 'add_percentage_points', value: -.2})], 0],
    ['disabled-invalid', [modifier('d', {enabled: false, conditions: ['unsupported'], value: NaN})], 1],
    ['nan-base', [], NaN], ['infinity-base', [], Infinity],
    ['nonfinite-result', [modifier('p', {operation: 'add_percent', value: 1000000})], Number.MAX_VALUE],
  ]) record(`arithmetic:${name}`, () => resolve(entries, base, entries[0]?.target ?? 'str'));
  const mixed = [modifier('z'), modifier('A'), modifier('a'), modifier('é'), modifier('[x]')];
  for (const [name, entries] of [['forward', mixed], ['reverse', [...mixed].reverse()], ['rotated', [...mixed.slice(2), ...mixed.slice(0, 2)]]])
    record(`order:${name}`, () => resolve(entries));
  record('duplicate:identical-last', () => { const a = modifier(), b = {...a}; const r = resolve([a, b]); return {r, last: r.contributions[0] === b}; });
  record('duplicate:distinct-source-instance', () => resolve([modifier(), modifier('a', {sourceInstanceId: 'other'})]));
  for (const [field, value] of [['value', 3], ['conditions', ['x']], ['eventTags', ['basic']], ['targetTags', ['boss']], ['damageType', 'magic'], ['scope', 'dot']])
    record(`conflict:${field}`, () => { const a = modifier('a', {target: 'damage_bonus', operation: 'add_percentage_points'}); return resolve([a, {...a, [field]: value}]); });
  record('conflict:property-order', () => { const a = modifier(); return resolve([a, Object.fromEntries(Object.entries(a).reverse())]); });
  record('conflict:before-invalid-conditions', () => resolve([modifier('a', {conditions: ['x']}), modifier('a', {value: 3})]));
  record('conflict:disabled-first', () => resolve([modifier('a', {enabled: false, value: 9}), modifier()]));
  record('conflict:disabled-last', () => resolve([modifier(), modifier('a', {enabled: false, value: 9})]));
  for (const [name, overrides] of [
    ['conditions', {conditions: ['x']}], ['fields', {extra: true}], ['id', {id: ''}],
    ['source', {source: 'unknown'}], ['operation', {operation: 'multiply'}], ['value-nan', {value: NaN}],
    ['value-infinity', {value: Infinity}], ['target', {target: 'missing'}],
    ['points-target', {operation: 'add_percentage_points'}], ['negative-damage-flat', {target: 'damage.flat', value: -1}],
    ['damage-tag-operation', {target: 'damage.tag.Basic', operation: 'add_flat'}],
    ['invalid-event-tags', {target: 'damage_bonus', operation: 'add_percentage_points', eventTags: ['Unknown']}],
    ['multiple-errors', {source: 'unknown', value: NaN, conditions: ['x'], target: 'missing'}],
  ]) record(`invalid:${name}`, () => resolve([modifier('bad', overrides)]));
  record('budget:257', () => resolve(Array.from({length: 257}, (_, i) => modifier(String(i)))));
  record('budget:duplicates-before-validation', () => resolve(Array.from({length: 257}, () => modifier())));
  record('budget:disabled-before-validation', () => resolve(Array.from({length: 257}, (_, i) => modifier(String(i), {enabled: false}))));
  for (const source of ['setting', 'equipment', 'buff', 'passive']) for (const active of [false, true])
    record(`source:${source}:${active}`, () => api.collectActiveModifiers([modifier('a', {source})], active ? {equipment: new Set(['a']), buffs: new Set(['a']), passives: new Set(['a'])} : {}));
  record('source:inactive-conflict', () => api.collectActiveModifiers([modifier('a', {source: 'buff'}), modifier('a', {source: 'buff', value: 3})]));
  record('source:active-conflict', () => api.collectActiveModifiers([modifier('a', {source: 'buff'}), modifier('a', {source: 'buff', value: 3})], {buffs: new Set(['a'])}));
  record('source:duplicates-disabled-order', () => { const a = modifier('a', {source: 'buff'}), b = modifier('b', {source: 'equipment'}); return api.collectActiveModifiers([b, a, {...a}, modifier('d', {enabled: false})], {buffs: new Set(['a', 'a']), equipment: new Set(['b'])}); });
  record('source:empty', () => api.collectActiveModifiers([]));
  for (const [field, value] of [['id', 'changed'], ['source', 'buff'], ['sourceInstanceId', 'other'], ['enabled', false], ['target', 'dex'], ['operation', 'add_percent'], ['value', .3], ['conditions', ['later']]])
    record(`mutation:${field}`, () => { const m = modifier(); const prepared = api.prepareModifierResolver([m]); const before = prepared(10, 'str'); m[field] = value; const after = prepared(10, 'str'); return {before, after, sameArray: before.contributions === after.contributions, original: after.contributions[0] === m, absent: prepared(10, 'dex')}; });
  record('mutation:disabled-not-reselected', () => { const m = modifier('a', {enabled: false}); const p = api.prepareModifierResolver([m]); m.enabled = true; return p(1, 'str'); });
  record('mutation:array-alias', () => { const m = modifier(); const p = api.prepareModifierResolver([m]); const a = p(1, 'str'); a.contributions.push(modifier('inserted', {value: 3})); const b = p(1, 'str'); a.contributions.reverse(); const c = p(1, 'str'); a.contributions.splice(0, 1); return {a, b, c, d: p(1, 'str'), sameArray: a.contributions === b.contributions, freshResults: a !== b, missingArraysDistinct: p(1, 'dex').contributions !== p(1, 'dex').contributions}; });
  record('mutation:operation-value-read-order', trace => {
    const a = modifier('a'), b = modifier('b', {operation: 'add_percent', value: .5});
    const p = api.prepareModifierResolver([b, a]);
    for (const m of [a, b]) for (const field of ['operation', 'value']) { const value = m[field]; Object.defineProperty(m, field, {enumerable: true, get() {trace.push(`${m.id}:${field}`); return value;}}); }
    const r = p(10, 'str'); const diagnostics = r.contributions.map(m => m.id); return {...r, contributions: diagnostics};
  });
  record('mutation:value-mutates-later-operation', trace => {
    const a = modifier('a'), b = modifier('b', {operation: 'add_percent', value: .5}); const p = api.prepareModifierResolver([a, b]);
    Object.defineProperty(a, 'value', {enumerable: true, get() {trace.push('a:value'); b.operation = 'add_flat'; return 2;}});
    const r = p(10, 'str'); return {...r, contributions: r.contributions.map(m => ({id: m.id, operation: m.operation}))};
  });
  const context = () => ({type: 'Physical', tags: ['Basic', 'Direct'], target: 'Boss', statuses: []});
  const bonus = overrides => modifier('bonus', {target: 'damage_bonus', operation: 'add_percentage_points', value: .2, ...overrides});
  for (const [name, m, c, attackerOnly] of [
    ['eligible', bonus({}), context(), false], ['type', bonus({damageType: 'magic', scope: 'dot', eventTags: ['missing'], targetTags: ['elite']}), context(), false],
    ['scope', bonus({scope: 'dot', eventTags: ['missing'], targetTags: ['elite']}), context(), false],
    ['event', bonus({eventTags: ['magic'], targetTags: ['elite']}), context(), false],
    ['target', bonus({targetTags: ['elite']}), context(), false], ['attacker-only', bonus({targetTags: ['elite']}), context(), true],
    ['empty-filters', bonus({eventTags: [], targetTags: []}), context(), false],
    ['event-mixed-case', bonus({eventTags: ['basic']}), {...context(), eventTags: ['BaSiC']}, false],
    ['empty-event-overrides-fallback', bonus({eventTags: ['basic']}), {...context(), eventTags: []}, false],
    ['entity-target-empty', bonus({targetTags: ['boss']}), {...context(), entities: {defender: {targetTags: []}}}, false],
    ['dot', bonus({scope: 'dot'}), {...context(), defender: {mechanic: 'dot'}}, false],
  ]) record(`reason:${name}`, () => api.damageBonusReason(m, c, attackerOnly));
  for (const mode of ['type-short-circuit', 'scope-short-circuit', 'no-events', 'per-required-read', 'early-match', 'mismatch-target-unread', 'attacker-fallback-read'])
    record(`timing:${mode}`, trace => {
      const m = bonus({eventTags: ['magic', 'basic'], targetTags: ['boss']}); const c = context();
      let reads = 0;
      Object.defineProperty(c, 'eventTags', {get() {trace.push('eventTags'); reads++; return mode === 'per-required-read' ? (reads === 1 ? ['Other'] : ['Basic']) : ['Magic', 'Basic'];}});
      Object.defineProperty(c, 'target', {configurable: true, get() {trace.push('target'); return 'Boss';}});
      if (mode === 'type-short-circuit') m.damageType = 'magic';
      if (mode === 'scope-short-circuit') m.scope = 'dot';
      if (mode === 'no-events') m.eventTags = [];
      if (mode === 'early-match') m.eventTags = ['magic', 'basic'];
      if (mode === 'mismatch-target-unread') {m.eventTags = ['missing']; Object.defineProperty(c, 'target', {configurable: true, get() {throw Error('target must remain unread');}});}
      return api.damageBonusReason(m, c, mode === 'attacker-fallback-read');
    });
  for (const mechanic of ['direct_hit', 'dot']) record(`damage:${mechanic}`, trace => {
    const entries = [modifier('f', {target: 'flat_damage', value: 3, scope: 'all'}), bonus({scope: 'all', targetTags: ['boss']}), modifier('tag', {target: 'damage.tag.Basic', operation: 'add_percent', value: .1})];
    const snap = damage.snapshotActorDamage({base: 10, flat: 2, scaling: {str: 1, dex: 0, int: 0, vit: 0, physicalAttack: .5, magicAttack: 0}, perRank: .1}, {str: 2, dex: 0, int: 0, vit: 0, physicalAttack: 4, magicAttack: 0}, entries, {skills: {}, modifiers: []}, .5, .2);
    return {snapshot: snap, damage: damage.calculateDamage({...snap, rank: 2, context: {...context(), defender: {mechanic, source: {id: 'a'}, target: {id: 'b'}}}, roll: () => {trace.push('crit'); return 0;}})};
  });
  return scenarios;
}
