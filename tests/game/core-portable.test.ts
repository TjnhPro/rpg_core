import {expect,it} from 'vitest';
import {DEFAULT_CORE_STATS} from '../../src/contracts/stat-contracts.js';
import {DEFAULT_DEFENSE_SETTINGS,validateDefenseSettings} from '../../src/contracts/defense-settings.js';
import {damageDefinition} from '../../src/contracts/damage-contracts.js';
import type {CombatModifier} from '../../src/contracts/combat-modifiers.js';
import {prepareModifierResolver,collectActiveModifiers} from '../../src/modifiers/modifier-core.js';
import {resolveCharacterStats,updateCurrentResources} from '../../src/stats/stat-calculation.js';
import {calculateDamage} from '../../src/damage/damage-core.js';
import {applyEntityDamage,validateCombatEntity,type CombatEntity} from '../../src/combat/combat-entity.js';

it('portable stats use one Flat → Percent → Core scaling pass, source dedup and caps',()=>{
 const config=structuredClone(DEFAULT_CORE_STATS);
 const mods:CombatModifier[]=[{id:'strength',source:'equipment',sourceInstanceId:'a',target:'str',operation:'add_flat',value:10,enabled:true,conditions:[]},
  {id:'strength',source:'equipment',sourceInstanceId:'b',target:'str',operation:'add_percent',value:.5,enabled:true,conditions:[]}];
 const live=collectActiveModifiers([...mods,mods[0]!],{equipment:new Set(['a','b'])});
 const stats=resolveCharacterStats({str:10,dex:10,int:10,vit:10},config,prepareModifierResolver(live),{str:10,dex:10,int:10,vit:10});
 expect(stats.attributes.str).toBe(30);expect(stats.values.armor).toBe(8);
 expect(collectActiveModifiers(mods,{equipment:new Set(['a'])})).toHaveLength(1);
 config.attributes.str.max=25;
 expect(resolveCharacterStats({str:10,dex:10,int:10,vit:10},config,prepareModifierResolver(live),{str:10,dex:10,int:10,vit:10}).attributes.str).toBe(25);
 expect(updateCurrentResources(12,2,{maxHp:20,maxMana:10,hpRegen:2,manaRegen:3},1000)).toEqual({currentHp:14,currentMp:5});
});

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

it('portable entity contract and exactly-once HP transition use the same generic rule',()=>{
 const e:CombatEntity={entityId:'monster',entityType:'monster',level:1,factionId:'hostile',targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:5,currentMp:0};
 expect(validateCombatEntity(e)).toEqual([]);
 const hit=applyEntityDamage(e.currentHp,10,10);expect(hit.defeated).toBe(true);expect(hit.after).toBe(0);
 expect(applyEntityDamage(hit.after,10,10).defeated).toBe(false);
});
