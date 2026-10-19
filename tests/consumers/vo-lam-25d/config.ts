import type {PreparedStatCalculationInput, NumericalModifier} from '@rpg/core/kernel';
export type Attribute = 'sức_mạnh' | 'sinh_khí' | 'nội_lực';
export type Stat = 'ngoại_công' | 'nội_công' | 'sinh_lực' | 'mana' | 'phòng_ngự';
export type Source = 'trang_bị' | 'luyện_công';
export function configuration() {
  const rule = (base: number, attribute: Attribute, coefficient: number) => ({default: base, enabled: true, bounds: {}, training: 0, scaling: [{attribute, coefficient, enabled: true}]});
  const input: PreparedStatCalculationInput<Attribute, Stat, Source> = {
    attributeOrder: ['sức_mạnh', 'sinh_khí', 'nội_lực'], statOrder: ['ngoại_công', 'nội_công', 'sinh_lực', 'mana', 'phòng_ngự'],
    attributeBases: {sức_mạnh: 12, sinh_khí: 20, nội_lực: 16}, attributeBaselines: {sức_mạnh: 0, sinh_khí: 0, nội_lực: 0},
    attributeRules: {sức_mạnh: {default: 0, enabled: true, bounds: {}}, sinh_khí: {default: 0, enabled: true, bounds: {}}, nội_lực: {default: 0, enabled: true, bounds: {}}},
    baseStats: {}, flatContributions: {ngoại_công: 6, nội_công: 4}, rules: {
      ngoại_công: {...rule(10, 'sức_mạnh', 2), training: 6}, nội_công: {...rule(8, 'nội_lực', 3), training: 4},
      sinh_lực: rule(100, 'sinh_khí', 10), mana: rule(0, 'nội_lực', 5), phòng_ngự: rule(10, 'sinh_khí', 1),
    },
  };
  const modifiers: NumericalModifier<Attribute | Stat, Source>[] = [
    {identity: {source: 'trang_bị', sourceInstanceId: 'kiếm', id: 'ngoại'}, target: 'ngoại_công', operation: 'add_flat', value: 10, enabled: true},
    {identity: {source: 'trang_bị', sourceInstanceId: 'phù', id: 'nội'}, target: 'nội_công', operation: 'add_percent', value: .25, enabled: true},
  ];
  return {input, modifiers};
}
export const probability = {enabled: true, bounds: {min: 0, max: 1}};
export const resourceRule = {minimum: 0, currentAboveMaximum: 'allow', allowIncreaseFromMinimum: true} as const;
