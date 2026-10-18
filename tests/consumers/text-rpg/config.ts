import type {PreparedStatCalculationInput, NumericalModifier} from '@rpg/core/kernel';
export type Attribute = 'strength' | 'wisdom' | 'vitality';
export type Stat = 'attackPower' | 'magicPower' | 'maxHp' | 'maxMp';
export type Source = 'training' | 'gear';
export function configuration() {
  const rule = (base: number, attribute: Attribute, coefficient: number) => ({default: base, enabled: true, bounds: {}, training: 0, scaling: [{attribute, coefficient, enabled: true}]});
  const input: PreparedStatCalculationInput<Attribute, Stat, Source> = {
    attributeOrder: ['strength', 'wisdom', 'vitality'], statOrder: ['attackPower', 'magicPower', 'maxHp', 'maxMp'],
    attributeBases: {strength: 10, wisdom: 8, vitality: 12}, attributeBaselines: {strength: 0, wisdom: 0, vitality: 0},
    attributeRules: {strength: {default: 0, enabled: true, bounds: {}}, wisdom: {default: 0, enabled: true, bounds: {}}, vitality: {default: 0, enabled: true, bounds: {}}},
    baseStats: {}, flatContributions: {attackPower: 3}, rules: {
      attackPower: {...rule(10, 'strength', 2), training: 3, bounds: {max: 48.25}, precision: {decimalPlaces: 1}},
      magicPower: rule(4, 'wisdom', 3), maxHp: rule(40, 'vitality', 5), maxMp: rule(4, 'wisdom', 2),
    },
  };
  const modifiers: NumericalModifier<Attribute | Stat, Source>[] = [
    {identity: {source: 'gear', sourceInstanceId: 'sword', id: 'flat'}, target: 'attackPower', operation: 'add_flat', value: 5, enabled: true},
    {identity: {source: 'gear', sourceInstanceId: 'sword', id: 'percent'}, target: 'attackPower', operation: 'add_percent', value: .25, enabled: true},
    {identity: {source: 'training', sourceInstanceId: 'lesson', id: 'points'}, target: 'attackPower', operation: 'add_percentage_points', value: 1, enabled: true},
  ];
  return {input, modifiers};
}
export const probability = {enabled: true, bounds: {min: 0, max: 1}};
export const resourceRule = {minimum: 0, currentAboveMaximum: 'allow', allowIncreaseFromMinimum: false} as const;
