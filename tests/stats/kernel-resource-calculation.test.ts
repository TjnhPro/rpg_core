import {expect,it} from 'vitest';
import {calculateResourceTransition as transition,normalizeResource,calculateResourceRegeneration as regen} from '../../src/kernel/index.js';
import {kernelResourceExamples} from '../fixtures/kernel-resources-consumer.js';
const rule={minimum:0,currentAboveMaximum:'reject' as const,allowIncreaseFromMinimum:true};
it('runs independent Text RPG, Vo Lam and ARPG numerical consumers',()=>{
 const r=kernelResourceExamples();expect(r.textDamage).toEqual({resource:'health',before:120,after:100,applied:10,reachedMinimum:false});
 expect(r.textHeal.after).toBe(0);expect(r.hp).toEqual({resource:'sinhLuc',before:undefined,after:120,initialized:true});
 expect(r.mp.after).toBe(0);expect(r.manaGain.after).toBe(20);expect(r.voLam.after).toBe(1.5);expect(r.arpg.after).toBe(Number.MAX_VALUE);expect(r.arpg.applied).toBe(Number.MAX_VALUE/2);expect(r.arpgRegen.after).toBe(16);
});
it('documents signed applied for allowed above-max increase',()=>expect(transition({resource:'x',current:120,maximum:100,amount:10,operation:'increase',rule:{...rule,currentAboveMaximum:'allow'}})).toEqual({resource:'x',before:120,after:100,applied:-20,reachedMinimum:false}));
it('rejects above-max current before reading amount',()=>expect(()=>transition({resource:'x',current:120,maximum:100,get amount():never{throw 1;},operation:'increase',rule})).toThrow('Current resource exceeds maximum'));
it('supports nonzero minima and records a transition only once',()=>{
 expect(transition({resource:'x',current:15,maximum:100,amount:20,operation:'decrease',rule:{...rule,minimum:10}})).toEqual({resource:'x',before:15,after:10,applied:5,reachedMinimum:true});
 expect(transition({resource:'x',current:10,maximum:100,amount:20,operation:'increase',rule:{...rule,minimum:10,allowIncreaseFromMinimum:false}}).after).toBe(10);
 expect(transition({resource:'x',current:10,maximum:100,amount:0,operation:'decrease',rule:{...rule,minimum:10}}).reachedMinimum).toBe(false);
});
it.each([0,-0,-5,120,undefined])('normalizes current %s without a resource-name policy',current=>{
 const r=normalizeResource({resource:'任意',...(current===undefined?{}:{current}),minimum:0,maximum:100});expect(r.initialized).toBe(current===undefined);expect(r.after).toBe(current===undefined?100:current>100?100:0);
});
it('reads normalization maximum before the conditional fallback',()=>{
 const trace:string[]=[];let reads=0;const r=normalizeResource({resource:'x',minimum:0,get maximum(){trace.push('max');return ++reads===1?20:10;}});expect(r.after).toBe(10);expect(trace).toEqual(['max','max']);
});
it('skips every numerical regen-only input when ineligible',()=>{
 const fail=():never=>{throw Error('skipped');};const r=regen({resource:'x',current:5,eligible:false,get minimum(){return fail();},get maximum(){return fail();},get ratePerSecond(){return fail();},get elapsedSeconds(){return fail();},get precision(){return fail();}});
 expect(r).toEqual({resource:'x',before:5,after:5,applied:0,reachedMinimum:false});
});
it('retains regen getter order and propagates thrown objects by identity',()=>{
 const trace:string[]=[];const input={resource:'x',current:1,minimum:0,eligible:true,get maximum(){trace.push('max');return 10;},get ratePerSecond(){trace.push('rate');return 2;},get elapsedSeconds(){trace.push('time');return .5;},get precision(){trace.push('precision');return {decimalPlaces:12};}};
 expect(regen(input).after).toBe(2);expect(trace).toEqual(['max','rate','time','precision']);
 const error={};Object.defineProperty(input,'ratePerSecond',{get(){throw error;}});let caught:unknown;try{regen(input);}catch(e){caught=e;}expect(caught).toBe(error);
});
it('preserves living fractions, toFixed rounding and overflow capping',()=>{
 const input={resource:'x',current:1e-14,minimum:0,maximum:10,ratePerSecond:0,elapsedSeconds:1,eligible:true,precision:{decimalPlaces:12}};
 expect(regen(input).after).toBe(1e-14);expect(regen({...input,current:.1,ratePerSecond:.2}).after).toBe(.3);
 expect(regen({...input,current:Number.MAX_VALUE/2,maximum:Number.MAX_VALUE,ratePerSecond:Number.MAX_VALUE,elapsedSeconds:Number.MAX_VALUE}).after).toBe(Number.MAX_VALUE);
 expect(()=>regen({...input,precision:{decimalPlaces:101}})).toThrow(RangeError);
});
