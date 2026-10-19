import {expect,it,vi} from 'vitest';
import {calculateHit,calculateCritical,calculateMitigation} from '../../src/kernel/index.js';
import {kernelDefenseExamples} from '../fixtures/kernel-defense-consumer.js';
const probability={enabled:true,bounds:{min:0,max:.85}};
it('executes independent Text RPG, Vo Lam and ARPG policies',()=>{
 const r=kernelDefenseExamples();expect(r.textHit.hit).toBe(true);expect(r.textCrit).toEqual({chance:.75,roll:.2,isCritical:true,bonus:.5,multiplier:1.5});
 expect(r.text).toEqual({ruleKey:'fixed-ward',status:'applied',missing:[],levelGap:null,levelScalingEnabled:false,effectiveK:20,rawReduction:1/3,reduction:.25,inputDamage:30,preventedDamage:7.5,finalDamage:22.5});
 expect(r.voLam).toEqual({ruleKey:'hộ-thể',status:'applied',missing:[],levelGap:4,levelScalingEnabled:true,effectiveK:200,rawReduction:1/3,reduction:1/3,inputDamage:120,preventedDamage:39.999999999999986,finalDamage:80.00000000000001});
 expect(r.arpg.map(v=>[v.ruleKey,v.reduction,v.finalDamage,v.preventedDamage])).toEqual([['plate',.75,10,30],['aether',.5,20,20]]);
});
it.each(['zero','disabled','ineligible','absent'])('does not even read a skipped Dodge roll: %s',mode=>{
 const result=calculateHit({eligible:mode!=='ineligible',...(mode==='absent'?{}:{dodgeChance:mode==='zero'?0:.5}),rule:{...probability,enabled:mode!=='disabled'},get roll():never{throw Error('unconsumed');}});
 expect(result.roll).toBeNull();expect(result.hit).toBe(true);
});
it.each([NaN,Infinity,-Infinity,-.1,1.1])('rejects consumed Dodge roll %s',roll=>expect(()=>calculateHit({eligible:true,dodgeChance:.5,rule:probability,roll})).toThrow('Dodge roll must be0..1'));
it('keeps strict Dodge/Critical thresholds',()=>{
 expect(calculateHit({eligible:true,dodgeChance:.5,rule:probability,roll:.5}).dodged).toBe(false);
 expect(calculateCritical({eligible:true,chance:.5,bonus:2,rule:probability,roll:.5}).isCritical).toBe(false);
});
it('draws eligible Critical at zero chance before reading chance; never reads unsuccessful bonus',()=>{
 const trace:string[]=[];const result=calculateCritical({eligible:true,rule:probability,roll:()=>{trace.push('roll');return 0;},get chance():number{trace.push('chance');return 0;},get bonus():never{throw Error('unselected');}});
 expect(trace).toEqual(['roll','chance']);expect(result).toEqual({chance:0,roll:0,isCritical:false,bonus:0,multiplier:1});
});
it.each(['disabled','ineligible'])('skips all Critical numerical reads when %s',mode=>{
 const r=calculateCritical({eligible:mode!=='ineligible',rule:{...probability,enabled:mode!=='disabled'},get roll():never{throw 1;},get chance():number{throw 2;},get bonus():never{throw 3;}});
 expect(r).toEqual({chance:0,roll:null,isCritical:false,bonus:0,multiplier:1});
});
it.each([NaN,Infinity,-Infinity,-1])('does not add Critical roll validation for %s',roll=>{
 const r=calculateCritical({eligible:true,chance:.5,bonus:.1,rule:probability,roll});expect(Object.is(r.roll,roll)).toBe(true);expect(r.isCritical).toBe(roll<.5);
});
it('uses selected bonus directly and exposes multiplier only as a diagnostic',()=>{
 const r=calculateCritical({eligible:true,chance:.5,bonus:.1,rule:probability,roll:0});expect(r.bonus).toBe(.1);expect(r.multiplier-1).not.toBe(r.bonus);
});
it('retains disabled/missing precedence, missing order and null diagnostics',()=>{
 expect(calculateMitigation({ruleKey:'x',damage:100,rating:0,rule:{enabled:false,bounds:{},levelScalingEnabled:true}})).toEqual({ruleKey:'x',status:'disabled',missing:['baseK','levelPenalty','source/target level'],levelGap:null,levelScalingEnabled:true,effectiveK:null,rawReduction:0,reduction:0,inputDamage:100,preventedDamage:0,finalDamage:100});
});
it('distinguishes absent generic bounds from explicit invalid forwarding getters',()=>{
 expect(calculateCritical({eligible:true,chance:2,bonus:0,rule:{enabled:true,bounds:{}},roll:1}).chance).toBe(2);
 expect(calculateHit({eligible:true,dodgeChance:.5,rule:{enabled:true,bounds:{get min(){return undefined!;}}},roll:NaN}).chance).toBeNaN();
});
it('preserves errors without subsequent reads',()=>{
 const error={},after=vi.fn();let caught:unknown;try{calculateCritical({eligible:true,rule:probability,roll:()=>{throw error;},get chance():number{after();return 1;},bonus:1});}catch(e){caught=e;}expect(caught).toBe(error);expect(after).not.toHaveBeenCalled();
});
