import {expect,it} from 'vitest';
import {applyEntityManaGain} from '../../src/combat/index.js';
it.each([
 [30,10,100,40,10],[95,10,100,100,5],[100,10,100,100,0],
 [0,10,100,10,10],[30,0,100,30,0],[.25,.125,1,.375,.125],
 [0,0,0,0,0],[1,Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE],
])('MH01 MP %s + %s cap %s',(before,amount,max,after,appliedMana)=>{
 expect(applyEntityManaGain(before!,amount!,max!)).toEqual({before,after,appliedMana});
});
it('MH01 rejects invalid MP/gain/cap and inconsistent bounds without normalization',()=>{
 for(const bad of [NaN,Infinity,-Infinity,-1])for(const index of [0,1,2]){const args:[number,number,number]=[30,10,100];args[index]=bad;expect(()=>applyEntityManaGain(...args)).toThrow();expect(args[index]).toBe(bad);}
 expect(()=>applyEntityManaGain(101,10,100)).toThrow();expect(()=>applyEntityManaGain(1,0,0)).toThrow();
});
