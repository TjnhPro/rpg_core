import {expect,it} from 'vitest';
import {applyEntityDamage,validateCombatEntity,type CombatEntity} from '../../src/combat/combat-entity.js';

it('portable entity contract and exactly-once HP transition use the same generic rule',()=>{
 const e:CombatEntity={entityId:'monster',entityType:'monster',level:1,factionId:'hostile',targetTags:[],baseStats:{str:0,dex:0,int:0,vit:0},currentHp:5,currentMp:0};
 expect(validateCombatEntity(e)).toEqual([]);
 const hit=applyEntityDamage(e.currentHp,10,10);expect(hit.defeated).toBe(true);expect(hit.after).toBe(0);
 expect(applyEntityDamage(hit.after,10,10).defeated).toBe(false);
});
