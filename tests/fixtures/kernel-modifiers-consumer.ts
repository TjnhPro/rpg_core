import {prepareNumericalModifiers, selectCanonicalModifiers, matchesAnyTag, calculateStats} from '../../src/kernel/index.js';
import type {NumericalModifier, ModifierResult, ModifierAdapter, PreparedModifierResult} from '../../src/kernel/index.js';

export function kernelModifiersConsumer() {
  // Text RPG: custom luck key and menu-owned sources, no combat/Skill types.
  const text: NumericalModifier<'luck', 'menu'>[] = [
    {identity: {source: 'menu', sourceInstanceId: 'choice', id: 'flat'}, target: 'luck', operation: 'add_flat', value: 2, enabled: true},
    {identity: {source: 'menu', sourceInstanceId: 'choice', id: 'percent'}, target: 'luck', operation: 'add_percent', value: .5, enabled: true},
  ];
  const textResolver = prepareNumericalModifiers(text);
  const textResult: ModifierResult<'luck', 'menu'> = textResolver(4, 'luck');
  if (textResult.value !== 9 || textResult.contributions[0] !== text[0]) throw Error('Text RPG modifier mismatch');

  // Vo Lam-style: caller-owned source instance, attribute then derived stat.
  const voLam: NumericalModifier<'noiLuc' | 'sucManh', 'monPhai'>[] = [
    {identity: {source: 'monPhai', sourceInstanceId: 'vo-dang', id: 'noi-cong'}, target: 'noiLuc', operation: 'add_flat', value: 3, enabled: true},
  ];
  const selected = selectCanonicalModifiers(voLam, {alwaysActive: new Set(), activeInstances: new Map([['monPhai', new Set(['vo-dang'])]])});
  const stats = calculateStats({attributeOrder: ['noiLuc'], statOrder: ['sucManh'], attributeBases: {noiLuc: 5}, attributeBaselines: {noiLuc: 0},
    attributeRules: {noiLuc: {default: 0, enabled: true, bounds: {}}}, baseStats: {}, flatContributions: {},
    rules: {sucManh: {default: 1, training: 0, enabled: true, bounds: {}, scaling: [{attribute: 'noiLuc', coefficient: 2, enabled: true}]}},
  }, prepareNumericalModifiers(selected));
  if (stats.attributes.noiLuc !== 8 || stats.values.sucManh !== 17) throw Error('Vo Lam modifier/stat seam mismatch');

  // ARPG: opaque custom tags/payload and sources, same canonical resolver.
  const payload = (id: string, amount: number, tags: string[]) => ({id, amount, tags});
  type Payload = ReturnType<typeof payload>;
  const adapter: ModifierAdapter<Payload, 'bonus'> = {
    identity: m => ({id: m.id, source: 'sigil', sourceInstanceId: 'custom-instance'}),
    target: () => 'bonus', enabled: m => matchesAnyTag(m.tags, ['astral', 'echo']),
    operation: () => 'add_percentage_points', value: m => m.amount,
    equivalent: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  };
  const a = payload('a', .1, ['astral']), z = payload('z', .2, ['echo']);
  const arpgResolver = prepareNumericalModifiers([z, payload('inactive', 10, ['missing']), a], adapter);
  const arpg: PreparedModifierResult<Payload, 'bonus'> = arpgResolver(0, 'bonus');
  if (arpg.value !== .30000000000000004 || arpg.contributions[0] !== a || arpg.contributions[1] !== z) throw Error('ARPG modifier mismatch');
  return {text: textResult.value, voLam: stats.values.sucManh, arpg: arpg.value};
}

// Compile-only preservation of existing generic defaults and independent closure.
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const defaultCompatible: Same<ModifierResult, ModifierResult<string, string>> = true;
void defaultCompatible;
function negativeContracts() {
  const resolve = prepareNumericalModifiers<'luck', 'menu'>([]);
  // @ts-expect-error Target keys stay narrow.
  resolve(0, 'strength');
  // @ts-expect-error Arbitrary payloads require an adapter, not a schema cast.
  prepareNumericalModifiers([{amount: 1}]);
  const result = resolve(0, 'luck');
  // @ts-expect-error Default v2.0.2 contribution readonly contract is preserved.
  result.contributions.push({});
  // @ts-expect-error No new modifier operation is introduced.
  const operation: NumericalModifier['operation'] = 'multiply';
  void operation;
}
void negativeContracts;
