import {expect,it} from 'vitest';
import {EffectLifecycle} from '../../src/shared/game/effect-lifecycle.js';
import {defineEffect,type EffectModifier} from '../../src/shared/game/effect-system.js';
import {prepareModifierResolver} from '../../src/shared/game/modifier-core.js';
import {fixture} from './fixtures/skill-core.js';

export const modifier=(target:string,value:number,operation:EffectModifier['operation']='add_flat',id=target):EffectModifier=>({id,target,value,operation,enabled:true,conditions:[]});
function apply(f:ReturnType<typeof fixture>,owner:EffectLifecycle,modifiers:EffectModifier[],serial=1,target='actor0'){
 return owner.apply({effectId:'test',sourceEntityId:'actor0',targetEntityId:target,allowedTargetRelations:['self','enemy']},
  {effectId:'test',durationMs:100,stackingPolicy:'stack',maxStacks:10,modifiers},{combat:f.context.combat,now:owner.now},serial);
}
it('validates the existing modifier operations, filters, identities and signed values',()=>{
 const definition={effectId:'test',durationMs:100,modifiers:[modifier('str',-5),modifier('attackSpeed',.2,'add_percent')]};
 expect(defineEffect(definition).success).toBe(true);
 for(const patch of [{operation:'flat'},{target:'fake'},{value:NaN},{source:'buff'},{conditions:['hidden']},{target:'FireResistance'}])
  expect(defineEffect({...definition,modifiers:[{...modifier('str',1),...patch}]}).success).toBe(false);
 expect(defineEffect({...definition,modifiers:[modifier('str',1),modifier('str',1)]}).success).toBe(false);
 expect(defineEffect({...definition,modifiers:[modifier('damage_bonus',-.15,'add_percentage_points')]}).success).toBe(true);
});
it('snapshots deeply immutable payloads, retains distinct instances and merges equipment without changing bases',()=>{
 const f=fixture(),owner=new EffectLifecycle(),before=structuredClone(f.entities),payload=[modifier('str',2,'add_flat','first'),modifier('str',2,'add_flat','second')];
 expect(apply(f,owner,payload).success).toBe(true);payload[0]!.value=100;
 expect(apply(f,owner,payload)).toEqual({success:false,reason:'apply_identity_conflict'});
 expect(apply(f,owner,[modifier('str',3)],2).success).toBe(true);
 const effects=owner.modifiers('actor0');expect(effects.map(m=>m.value)).toEqual([2,2,3]);
 expect(new Set(effects.map(m=>JSON.stringify([m.sourceInstanceId,m.id]))).size).toBe(3);
 expect(()=>{(effects[0]!.conditions as unknown[]).push('x');}).toThrow();
 const equip={...modifier('str',10),source:'equipment' as const,sourceInstanceId:'item'};
 for(let i=0;i<3;i++)expect(prepareModifierResolver([equip,...effects])(0,'str').value).toBe(17);
 equip.value=20;expect(prepareModifierResolver([equip,...owner.modifiers('actor0')])(0,'str').value).toBe(27);
 expect(f.entities).toEqual(before);
 f.entities[0]!.currentHp=0;owner.advance(50,f.context.combat);expect(owner.modifiers('actor0')).toEqual([]);
});
it('source defeat retains target payload; remove, expiry and dispose remove only active contributions',()=>{
 const f=fixture(),owner=new EffectLifecycle();apply(f,owner,[modifier('armor',10)],1,'actor1');apply(f,owner,[modifier('armor',20)],2,'actor1');
 f.entities[0]!.currentHp=0;owner.advance(50,f.context.combat);expect(owner.modifiers('actor1')).toHaveLength(2);
 owner.remove(owner.instances()[0]!.effectInstanceId,50);expect(owner.modifiers('actor1').map(m=>m.value)).toEqual([20]);
 owner.advance(100,f.context.combat);expect(owner.modifiers('actor1')).toEqual([]);
 apply(f,owner,[modifier('armor',10)],3,'actor1');owner.dispose(100);owner.dispose(100);expect(owner.modifiers('actor1')).toEqual([]);
});
