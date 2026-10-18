import type {SkillMechanics, DamageDelivery, MapPoint, CombatEntity, DamageDefinition, DamageContext, TargetContext} from '../../src/contracts/index.js';
import type {SkillMechanics as MechanicSkill} from '../../src/mechanics/index.js';
import type {MapPoint as SpatialPoint} from '../../src/spatial/index.js';
import type * as Kernel from '../../src/kernel/index.js';
import {calculateDamageB0} from '../../src/kernel/index.js';

type Equal<A,B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
export type Assertions = [
  Assert<Equal<SkillMechanics, MechanicSkill>>,
  Assert<Equal<MapPoint, SpatialPoint>>,
  Assert<Equal<DamageDelivery, 'direct_hit'|'melee_hitbox'|'projectile'|'instant_aoe'|'timed_aoe_sequence'|'dot'>>,
  Assert<Equal<CombatEntity['entityType'], 'player'|'monster'>>,
  Assert<Equal<NonNullable<DamageDefinition['mechanics']>, SkillMechanics>>,
  Assert<Equal<NonNullable<DamageContext['defender']>['mechanic'], DamageDelivery>>,
  Assert<Equal<Extract<TargetContext,{mode:'ground'}>['position'], MapPoint>>,
  Assert<Equal<Extract<TargetContext,{mode:'self'}>, {mode:'self';casterId:string}>>,
];
export const optionalMechanics: SkillMechanics = {};
export const point: MapPoint = {x: 1, y: 2};
// @ts-expect-error Gameplay contract remains outside the Kernel public surface.
export type NoMechanics = Kernel.SkillMechanics;
// @ts-expect-error Gameplay delivery remains outside the Kernel public surface.
export type NoDelivery = Kernel.DamageDelivery;
// @ts-expect-error Spatial contract remains outside the Kernel public surface.
export type NoPoint = Kernel.MapPoint;
// @ts-expect-error Entity contract remains outside the Kernel public surface.
export type NoEntity = Kernel.CombatEntity;

// Compile-only guards; structural TypeScript types do not imply closed objects.
function numericalOnly(entity: CombatEntity, snapshot: Kernel.NumericalOffenseSnapshot) {
  // @ts-expect-error A gameplay entity does not satisfy prepared numerical input.
  calculateDamageB0(entity);
  // @ts-expect-error Snapshot contract remains readonly at the TypeScript boundary.
  snapshot.criticalChance = 1;
  // @ts-expect-error Delivery geometry is not a numerical snapshot field.
  const offense: Kernel.NumericalOffenseSnapshot = {sources: {}, flatContributions: [], bonuses: [], criticalChance: 0, criticalBonus: 0, position: {x: 0, y: 0}};
  void offense;
}
void numericalOnly;
