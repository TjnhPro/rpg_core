import {captureNumericalOffenseSnapshot, calculateDamageB0, calculateDamageB1, calculateMitigation, calculateResourceTransition, calculateStats, calculateCritical, prepareNumericalModifiers, matchesAnyTag, type NumericalModifier} from '../../src/kernel/index.js';

// These are caller labels and caller-owned objects, not gameplay dependencies.
export function numericalBoundaryConsumers() {
  const project = (label: string, source: string, power: number, coefficient: number, reduction: number) => {
    const caller = {player: {id: label}, projectile: {position: {x: 1, y: 2}}, magic: true};
    const snapshot = captureNumericalOffenseSnapshot({sources: {[source]: power}, flatContributions: [], bonuses: [], criticalChance: 0, criticalBonus: 0});
    const base = calculateDamageB0({base: 10, rank: 1, perRank: 0, sourceOrder: [source], sourceValue: key => snapshot.sources[key]!, coefficient: () => coefficient, resolveFlat: () => ({definition: 0, additional: 0, resolved: 0})});
    const damage = calculateDamageB1(base.raw, snapshot.bonuses, 0);
    const mitigation = calculateMitigation({ruleKey: label, damage: damage.beforeDefense, rating: 10, rule: {enabled: true, bounds: {min: reduction, max: reduction}, baseK: 100, levelPenalty: 0, levelScalingEnabled: false}});
    const resource = calculateResourceTransition({resource: 'MapPoint', current: 100, maximum: 100, amount: mitigation.finalDamage, operation: 'decrease', rule: {minimum: 0, currentAboveMaximum: 'allow', allowIncreaseFromMinimum: false}});
    return {label, raw: base.raw, final: mitigation.finalDamage, after: resource.after, callerId: caller.player.id};
  };
  // Text has no delivery, actor or spatial inputs: resolve an arbitrary stat first.
  const stats = calculateStats({attributeOrder: ['luck'], statOrder: ['power'], attributeBases: {luck: 10}, attributeBaselines: {luck: 0}, attributeRules: {luck: {default: 0, enabled: true, bounds: {}}}, baseStats: {}, flatContributions: {}, rules: {power: {default: 0, training: 0, enabled: true, bounds: {}, scaling: [{attribute: 'luck', coefficient: 2, enabled: true}]}}}, base => ({value: base}));
  const critical = calculateCritical({eligible: true, chance: 0, bonus: .5, rule: {enabled: true, bounds: {min: 0, max: 1}}, roll: () => 1});
  const text = project('Text RPG', 'player', stats.values.power, 2 + critical.bonus, .25);
  // Delivery/position stay caller-owned; only resolved numbers cross the boundary.
  const voLamDelivery = {kind: 'projectile', position: {x: 2, y: 3}, tags: ['nội-công']};
  const voLam = project('Võ Lâm', 'nội-lực', 30, matchesAnyTag(voLamDelivery.tags, ['nội-công']) ? voLamDelivery.position.y : 0, .2);
  const arpgPolicy = {kind: 'magic', position: {x: 1, y: 0}, tags: ['astral']};
  const modifiers: NumericalModifier<'projectile', 'sigil'>[] = [{identity: {id: 'power', source: 'sigil', sourceInstanceId: 'caller'}, target: 'projectile', operation: 'add_flat', value: 10, enabled: matchesAnyTag(arpgPolicy.tags, ['astral'])}];
  const arpg = project('ARPG', 'projectile', prepareNumericalModifiers(modifiers)(30, 'projectile').value, arpgPolicy.position.x / 2, 0);
  return [text, voLam, arpg];
}
