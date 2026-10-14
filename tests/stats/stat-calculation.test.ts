import {expect,it} from 'vitest';
import {DEFAULT_CORE_STATS} from '../../src/contracts/stat-contracts.js';
import type {CombatModifier} from '../../src/contracts/combat-modifiers.js';
import {prepareModifierResolver,collectActiveModifiers} from '../../src/modifiers/modifier-core.js';
import {resolveCharacterStats,updateCurrentResources} from '../../src/stats/stat-calculation.js';

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

it('initializes undefined resources, clamps changed maxima and never regenerates a defeated actor',()=>{
 const stats={maxHp:20,maxMana:10,hpRegen:2,manaRegen:3};
 expect(updateCurrentResources(undefined,undefined,stats)).toEqual({currentHp:20,currentMp:10});
 expect(updateCurrentResources(30,15,stats)).toEqual({currentHp:20,currentMp:10});
 expect(updateCurrentResources(0,2,stats,1000)).toEqual({currentHp:0,currentMp:2});
 expect(updateCurrentResources(5,2,stats,1000,false)).toEqual({currentHp:5,currentMp:2});
 expect(updateCurrentResources(1e-14,1e-14,stats)).toEqual({currentHp:1e-14,currentMp:1e-14});
});

it('rejects nonfinite resources and invalid regeneration inputs before recalculation',()=>{
 const stats={maxHp:20,maxMana:10,hpRegen:2,manaRegen:3};
 for(const input of [{...stats,maxHp:-1},{...stats,manaRegen:Infinity}])expect(()=>updateCurrentResources(5,2,input)).toThrow('Invalid resource');
 expect(()=>updateCurrentResources(NaN,2,stats)).toThrow('Invalid resource');
 expect(()=>updateCurrentResources(5,2,stats,-1)).toThrow('Invalid resource');
});
