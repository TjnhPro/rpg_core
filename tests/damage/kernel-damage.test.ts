import {expect, it} from 'vitest';
import {calculateDamageB0, calculateDamageB1, calculateDamageBonusValue} from '../../src/kernel/index.js';
import {kernelDamageConsumer, kernelDamageExamples} from '../fixtures/kernel-damage-consumer.js';

it('supports consumer-owned identifiers and the canonical numerical modifier resolver', () => {
  expect(kernelDamageConsumer()).toStrictEqual({
    b0:{base:15,scaling:[{source:'strength',value:1.5},{source:'weapon',value:12}],flat:6,raw:34.5},
    bonus:.5,b1:{criticalBonus:.25,totalBonus:.75,beforeDefense:60.375},
  });
});
it('asserts independent Text RPG, Vo Lam and ARPG numerical fixtures', () => {
  expect(kernelDamageExamples()).toEqual({text:24,voLam:kernelDamageConsumer(),arpg:{criticalBonus:.5,totalBonus:.8,beforeDefense:36}});
});
it('reads scaling products in order, then resolves flat exactly once and reads flat terms late', () => {
  const trace: string[] = []; let flat = 0;
  const result = calculateDamageB0({
    get perRank(){trace.push('perRank'); return .5;}, get rank(){trace.push('rank');return 2;}, get base(){trace.push('base');return 10;},
    sourceOrder:['a','b'], sourceValue:s=>{trace.push(s);return 2;}, coefficient:s=>{trace.push(`${s}.coefficient`);flat++;return 3;},
    resolveFlat:()=>{trace.push('resolveFlat');return {get definition(){trace.push('definition');return flat;},get additional(){trace.push('additional');return 1;},get resolved(){trace.push('resolved');return 2;}};},
  });
  expect(trace).toEqual(['perRank','rank','base','a','a.coefficient','b','b.coefficient','resolveFlat','definition','additional','resolved']);
  expect(result).toEqual({base:15,scaling:[{source:'a',value:9},{source:'b',value:9}],flat:5,raw:38});
});
it('preserves item multiplication and coefficient timing rather than multiplying the sum', () => {
  const trace: string[]=[];let coefficient=.1;
  expect(calculateDamageBonusValue([2,3], n=>{trace.push(`value:${n}`);coefficient+=.1;return n;},()=>{trace.push('coefficient');return coefficient;})).toBe(1.3000000000000003);
  expect(trace).toEqual(['value:2','coefficient','value:3','coefficient']);
  expect(calculateDamageBonusValue([],()=>{throw 1;},()=>{throw 2;})).toBe(0);
});
it('retains accumulation order and the two B1 clamps without sanitizing NaN or Infinity', () => {
  expect(calculateDamageB1(10,[{value:1e16},{value:1},{value:-1e16}],.5)).toEqual({criticalBonus:.5,totalBonus:.5,beforeDefense:15});
  expect(calculateDamageB1(-10,[{value:-2}],0).beforeDefense).toBe(0);
  expect(calculateDamageB1(Infinity,[{value:-1}],0).beforeDefense).toBeNaN();
  expect(calculateDamageB1(NaN,[],0).beforeDefense).toBeNaN();
  expect(calculateDamageB1(10,[],Infinity).beforeDefense).toBe(Infinity);
});
it('propagates callback errors without catching or reading later inputs', () => {
  const error={reason:'caller'}; const trace:string[]=[];
  let caught:unknown;
  try {calculateDamageB0({base:1,perRank:0,rank:1,sourceOrder:['x'],sourceValue:()=>{throw error;},coefficient:()=>{trace.push('coefficient');return 1;},resolveFlat:()=>{trace.push('flat');return {definition:0,additional:0,resolved:0};}});} catch(e){caught=e;}
  expect(caught).toBe(error);
  expect(trace).toEqual([]);
});
it.each([NaN, Infinity, -Infinity, -0])('does not sanitize a B0 base of %s', base => {
  const result=calculateDamageB0({base,perRank:0,rank:1,sourceOrder:[],sourceValue:()=>{throw 1;},coefficient:()=>{throw 2;},resolveFlat:()=>({definition:0,additional:0,resolved:0})});
  expect(Object.is(result.base,base)).toBe(true);
  expect(Object.is(result.raw,base + 0 + 0)).toBe(true);
});
