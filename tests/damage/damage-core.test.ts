import {expect,it} from 'vitest';
import {DEFAULT_DEFENSE_SETTINGS,validateDefenseSettings} from '../../src/contracts/defense-settings.js';
import {damageDefinition} from '../../src/contracts/damage-contracts.js';
import {calculateDamage} from '../../src/damage/damage-core.js';

it.each(['Physical','Magic'] as const)('portable %s damage uses B0/B1, live defense, Dodge and DoT rules',type=>{
 const settings=structuredClone(DEFAULT_DEFENSE_SETTINGS);
 settings.types.armorReduction.coefficients={baseK:100,levelPenalty:0};settings.types.magicReduction.coefficients={baseK:100,levelPenalty:0};
 expect(validateDefenseSettings(settings)).toEqual([]);
 const input={definition:{...damageDefinition(),base:100},sources:{str:0,dex:0,int:0,vit:0,physicalAttack:0,magicAttack:0},settings:{skills:{},modifiers:[]},
  context:{type,tags:[],target:'Normal' as const,statuses:[],defender:{source:{id:'a',level:1},target:{id:'b',level:1},mechanic:'direct_hit' as const,magicResistanceRating:100,dodgeChance:.5}},
  criticalChance:.5,criticalBonus:.5,roll:()=>{throw Error('Crit must not roll on Dodge');},dodgeRoll:0,armor:100,defenseConfig:{revision:1,settings}};
 expect(calculateDamage(input).finalDamage).toBe(0);
 expect(calculateDamage({...input,dodgeRoll:1,roll:0}).finalDamage).toBe(75);
 const dot=calculateDamage({...input,context:{...input.context,defender:{...input.context.defender,mechanic:'dot'}},roll:()=>{throw Error('No DoT Crit');},dodgeRoll:()=>{throw Error('No DoT Dodge');}});
 expect(dot.finalDamage).toBe(50);expect(dot.critical.isCritical).toBe(false);
});
