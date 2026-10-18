// Inputs/observation only; expected calculations are captured from a05439ec.
import {encode} from './stat-parity-scenarios.mjs';

export function observeStatMutations(stats, modifiers, contracts) {
  const outcomes = [];
  const modifier = {id: 'armor-flat', target: 'armor', operation: 'add_flat', value: .25,
    enabled: true, source: 'equipment', sourceInstanceId: 'armor-flat', conditions: []};
  function record(name, run) {
    const trace = [], error = new TypeError('original callback error');
    try { outcomes.push({name, result: encode(run(trace, error)), trace: encode(trace)}); }
    catch (caught) {outcomes.push({name, error: {name: caught.name, message: caught.message, sameCallbackError: caught === error}, trace: encode(trace)});}
  }
  for (const name of ['resolver-min', 'resolver-max', 'resolver-enabled', 'transform-min', 'transform-max', 'transform-enabled',
    'nan-transform', 'infinity-transform', 'disabled-transform', 'resolver-throws', 'transform-throws', 'precision-reclamp', 'stable']) {
    record(`scalar:${name}`, (trace, error) => {
      const rule = {min: 0, max: 100, enabled: name !== 'disabled-transform'};
      const prepared = modifiers.prepareModifierResolver([modifier]);
      return stats.calculateEffectiveStat(3.123456, 'armor', (base, id) => {
        trace.push(['resolve', id, base]);
        if (name === 'resolver-min') rule.min = 5;
        if (name === 'resolver-max') rule.max = 2;
        if (name === 'resolver-enabled') rule.enabled = false;
        if (name === 'resolver-throws') throw error;
        return prepared(base, id);
      }, rule, value => {
        trace.push(['transform', value]);
        if (name === 'transform-min') rule.min = 7;
        if (name === 'transform-max') rule.max = 1;
        if (name === 'transform-enabled') rule.enabled = false;
        if (name === 'transform-throws') throw error;
        if (name === 'precision-reclamp') rule.max = 1.23456;
        if (name === 'nan-transform') {rule.min = 2; return NaN;}
        if (name === 'infinity-transform' || name === 'disabled-transform') {rule.max = 9; return Infinity;}
        return value;
      }, 4);
    });
  }
  for (const name of ['next-attribute-min', 'next-attribute-max', 'replace-next-attribute', 'current-attribute-captured',
    'next-attribute-base', 'attribute-derived-min', 'attribute-derived-scaling', 'attribute-derived-disabled-scaling',
    'replace-derived', 'derived-fallback', 'next-derived-min', 'next-derived-max', 'next-derived-scaling',
    'next-derived-default', 'next-derived-base-extras', 'next-derived-baseline', 'future-elemental-policy',
    'future-dodge', 'current-derived-captured', 'current-elemental-captured', 'current-dodge-captured',
    'transform-next-derived', 'resolver-throws', 'transform-throws', 'stable']) {
    record(`character:${name}`, (trace, error) => {
      const config = structuredClone(contracts.DEFAULT_CORE_STATS);
      config.version = 1;
      const bases = {str: 12, dex: 13, int: 14, vit: 15}, baseline = {str: 10, dex: 10, int: 10, vit: 10};
      const extras = {armor: .123456};
      if (name === 'future-elemental-policy' || name === 'current-elemental-captured') bases.MetalResistance = 7;
      if (name === 'current-dodge-captured') config.defense = {types: {dodgeChance: {min: .1, max: .2, enabled: true}}};
      const prepared = modifiers.prepareModifierResolver([modifier]);
      function mutate(id) {
        if (id === 'str') {
          if (name === 'next-attribute-min') config.attributes.dex.min = 25;
          if (name === 'next-attribute-max') config.attributes.dex.max = 3;
          if (name === 'replace-next-attribute') config.attributes.dex = {...config.attributes.dex, min: 30};
          if (name === 'current-attribute-captured') {config.attributes.str.min = 99; bases.str = 100;}
          if (name === 'next-attribute-base') bases.dex = 20;
          if (name === 'attribute-derived-min') config.stats.armor.min = 88;
          if (name === 'attribute-derived-scaling') config.stats.armor.scaling.str = 7;
          if (name === 'attribute-derived-disabled-scaling') {config.stats.armor.scaling.str = Infinity; config.stats.armor.scalingEnabled = {str: false};}
          if (name === 'replace-derived') config.stats.armor = {...config.stats.armor, min: 77};
          if (name === 'derived-fallback') delete config.stats.armor;
        }
        if (id === 'maxHp') {
          if (name === 'next-derived-min') config.stats.maxMana.min = 99;
          if (name === 'next-derived-max') config.stats.maxMana.max = 2;
          if (name === 'next-derived-scaling') config.stats.maxMana.scaling.str = 11;
          if (name === 'next-derived-default') config.stats.maxMana.default = 77;
          if (name === 'next-derived-base-extras') {bases.maxMana = 111; extras.maxMana = 3;}
          if (name === 'next-derived-baseline') baseline.int = 0;
          if (name === 'future-elemental-policy') config.version = 2;
          if (name === 'future-dodge') config.defense = {types: {dodgeChance: {min: .3, max: .4, enabled: false}}};
          if (name === 'current-derived-captured') {config.stats.maxHp.min = 999; config.stats.maxHp.max = 0; config.stats.maxHp.default = 777; config.stats.maxHp.scaling.str = 999; bases.maxHp = 500; extras.maxHp = 6;}
        }
        if (id === 'MetalResistance' && name === 'current-elemental-captured') config.version = 2;
        if (id === 'dodgeChance' && name === 'current-dodge-captured') Object.assign(config.defense.types.dodgeChance, {min: .9, max: 1, enabled: false});
      }
      return stats.resolveCharacterStats(bases, config, (base, id) => {
        trace.push(['resolve', id, base]);
        mutate(id);
        if (name === 'resolver-throws' && id === 'dex') throw error;
        return prepared(base, id);
      }, baseline, extras, (id, value) => {
        trace.push(['transform', id, value]);
        if (name === 'transform-next-derived' && id === 'maxHp') config.stats.maxMana.min = 98;
        if (name === 'current-derived-captured' && id === 'maxHp') config.stats.maxHp.min = 1000;
        if (name === 'transform-throws' && id === 'maxMana') throw error;
        return value;
      });
    });
  }
  return outcomes;
}
