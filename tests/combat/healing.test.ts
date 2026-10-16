import {expect,it} from 'vitest';
import {applyEntityHealing} from '../../src/combat/index.js';

it.each([
 [50,30,100,80,30],[90,30,100,100,10],[100,30,100,100,0],
 [0,30,100,0,0],[50,0,100,50,0],[.25,.125,1,.375,.125],
 [0,0,0,0,0],[1,Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE],
])('T1 healing %s + %s cap %s', (before,amount,max,after,appliedHealing)=>{
 expect(applyEntityHealing(before!,amount!,max!)).toEqual({before,after,appliedHealing});
});
it('T1 rejects invalid numbers and inconsistent bounds without normalizing HP',()=>{
 for(const invalid of [NaN,Infinity,-Infinity,-1])for(const index of [0,1,2]){
  const args:[number,number,number]=[50,30,100];args[index]=invalid;expect(()=>applyEntityHealing(...args)).toThrow();
 }
 expect(()=>applyEntityHealing(101,30,100)).toThrow();
 expect(()=>applyEntityHealing(1,0,0)).toThrow();
});
