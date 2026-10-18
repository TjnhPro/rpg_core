import type {PreparedStatCalculationInput, NumericalModifier} from '@rpg/core/kernel';
export type Attribute = 'might' | 'agility' | 'focus';
export type Stat = 'weaponPower' | 'elementalPower' | 'maxLife' | 'maxMana' | 'armorRating';
export type Source = 'weapon' | 'armor' | 'accessory' | 'buff';
export function configuration() {
  const rule = (base: number, attribute: Attribute, coefficient: number) => ({default: base, enabled: true, bounds: {}, training: 0, scaling: [{attribute, coefficient, enabled: true}]});
  const input: PreparedStatCalculationInput<Attribute, Stat, Source> = {
    attributeOrder: ['might', 'agility', 'focus'], statOrder: ['weaponPower', 'elementalPower', 'maxLife', 'maxMana', 'armorRating'],
    attributeBases: {might: 12, agility: 8, focus: 10}, attributeBaselines: {might: 0, agility: 0, focus: 0},
    attributeRules: {might: {default: 0, enabled: true, bounds: {}}, agility: {default: 0, enabled: true, bounds: {}}, focus: {default: 0, enabled: true, bounds: {}}},
    baseStats: {}, flatContributions: {}, rules: {weaponPower: rule(20, 'might', 2), elementalPower: rule(10, 'focus', 3), maxLife: rule(80, 'might', 10), maxMana: rule(10, 'focus', 5), armorRating: rule(10, 'agility', 5)},
  };
  const modifiers: NumericalModifier<Attribute | Stat, Source>[] = [
    {identity: {source: 'weapon', sourceInstanceId: 'axe', id: 'power'}, target: 'weaponPower', operation: 'add_flat', value: 6, enabled: true},
    {identity: {source: 'armor', sourceInstanceId: 'plate', id: 'power'}, target: 'weaponPower', operation: 'add_percent', value: .25, enabled: true},
    {identity: {source: 'accessory', sourceInstanceId: 'ring', id: 'power'}, target: 'weaponPower', operation: 'add_percentage_points', value: 2, enabled: true},
    {identity: {source: 'buff', sourceInstanceId: 'rage', id: 'power'}, target: 'weaponPower', operation: 'add_flat', value: 10, enabled: true},
  ];
  return {input, modifiers};
}
export const probability = {enabled: true, bounds: {min: 0, max: 1}};
export const resourceRule = {minimum: 0, currentAboveMaximum: 'allow', allowIncreaseFromMinimum: true} as const;
