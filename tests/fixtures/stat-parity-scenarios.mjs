// Shared inputs and observations only. No numerical implementation or old engine.
export function encode(value) {
  if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) {
    return {$number: Object.is(value, -0) ? '-0' : String(value)};
  }
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  return value;
}

export function observeStats(stats, modifiers, contracts) {
  const observations = [];
  function record(name, run) {
    const trace = [];
    try { observations.push({name, result: encode(run(trace)), trace: encode(trace)}); }
    catch (error) { observations.push({name, error: {name: error.name, message: error.message}, trace: encode(trace)}); }
  }
  const mod = (id, target, operation, value) => ({id, target, operation, value, enabled: true,
    source: 'equipment', sourceInstanceId: id, conditions: []});
  const mixed = [mod('z', 'armor', 'add_flat', .1), mod('a', 'armor', 'add_flat', .2),
    mod('p', 'armor', 'add_percent', .3), mod('q', 'armor', 'add_percentage_points', .4)];
  const scalarCases = [
    ['base', 3, {min: 0}, undefined, 'identity', []],
    ['mixed', .3, {min: 0}, 4, 'identity', mixed],
    ['minimum', -12, {min: 2}, 4, 'identity', []],
    ['maximum', 12, {min: 0, max: 10}, 4, 'identity', []],
    ['precision', 1.234567, {min: 0}, 4, 'identity', []],
    ['reclamp', 1.23456, {min: 0, max: 1.23456}, 4, 'identity', []],
    ['disabled', 12, {min: 0, enabled: false}, 4, 'twice', mixed],
    ['disabled-native-precision', 12, {min: 0, enabled: false}, 101, 'identity', []],
    ['nan-transform', 1, {min: 0}, 4, 'nan', []],
    ['infinite-transform', 1, {min: 0}, 4, 'infinity', []],
    ['infinite-transform-cap', 1, {min: 0, max: 10}, 4, 'infinity', []],
    ['throw-transform', 1, {min: 0}, 4, 'throw', []],
    ['invalid-precision', 1, {min: 0}, 101, 'identity', []],
    ['nan-base', NaN, {min: 0}, 4, 'identity', []],
    ['infinite-base', Infinity, {min: 0}, 4, 'identity', []],
    ['negative-zero', -0, {min: -Infinity}, undefined, 'identity', []],
    ['duplicate', 1, {min: 0}, 4, 'identity', [...mixed, mixed[0]]],
    ['conflict', 1, {min: 0}, 4, 'identity', [mixed[0], {...mixed[0], value: 2}]],
  ];
  for (const [name, base, rule, precision, mode, entries] of scalarCases) record(`scalar:${name}`, trace => {
    const prepared = modifiers.prepareModifierResolver(entries);
    const resolve = (value, target) => {trace.push(['resolve', target, value]); return prepared(value, target);};
    const transform = value => {
      trace.push(['transform', value]);
      if (mode === 'throw') throw new TypeError('caller transform failed');
      return mode === 'nan' ? NaN : mode === 'infinity' ? Infinity : mode === 'twice' ? value * 2 : value;
    };
    return stats.calculateEffectiveStat(base, 'armor', resolve, rule, transform, precision);
  });
  for (const name of ['default', 'mixed-scaling', 'caps', 'disabled-scaling', 'fallback', 'dodge-override', 'dodge-disabled', 'version1', 'nan-transform', 'throw-transform', 'accumulation']) {
    record(`character:${name}`, trace => {
      const config = structuredClone(contracts.DEFAULT_CORE_STATS);
      const bases = {str: 10.1, dex: 20.2, int: 30.3, vit: 40.4};
      const baseline = {str: 10, dex: 10, int: 10, vit: 10};
      let entries = [];
      const extras = {armor: .123456, physicalAttack: 2.34567};
      if (name === 'mixed-scaling') entries = [...mixed, mod('str', 'str', 'add_flat', 10), mod('strp', 'str', 'add_percent', .5)];
      if (name === 'caps') {config.attributes.str.max = 5; config.stats.armor.max = .123456;}
      if (name === 'disabled-scaling') config.stats.maxHp.scalingEnabled = {str: false, dex: true, int: true, vit: false};
      if (name === 'fallback') delete config.stats.armor;
      if (name === 'dodge-override' || name === 'dodge-disabled') config.defense = {types: {dodgeChance: {min: .123456, max: .234567, enabled: name !== 'dodge-disabled'}}};
      if (name === 'version1') config.version = 1;
      if (name === 'accumulation') {
        Object.assign(bases, {str: 1e16, dex: 1, int: -1e16, vit: 1});
        Object.assign(baseline, {str: 0, dex: 0, int: 0, vit: 0});
        config.attributes.int.min = -Infinity;
        config.stats.armor.scaling = {str: 1, dex: 1, int: 1, vit: 1};
      }
      const prepared = modifiers.prepareModifierResolver(entries);
      return stats.resolveCharacterStats(bases, config, (base, id) => {trace.push(['resolve', id, base]); return prepared(base, id);}, baseline, extras, (id, value) => {
        trace.push(['transform', id, value]);
        if (name === 'nan-transform' && id === 'MetalResistance') return NaN;
        if (name === 'throw-transform' && id === 'physicalAttack') throw Error('character transform failed');
        return value;
      });
    });
  }
  for (const [base, cdr] of [[1000, .5], [0, 1], [-0, 0], [1.1, .3], [-1, 0], [1, -1], [1, 1.1], [NaN, 0], [1, Infinity]]) {
    record(`cooldown:${String(base)}:${String(cdr)}`, () => stats.cooldownDurationMs(base, cdr));
  }
  return observations;
}
