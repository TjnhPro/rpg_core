import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as defense from '../../src/damage/defense-engine.js';
import * as damage from '../../src/damage/damage-core.js';
import {DEFAULT_DEFENSE_SETTINGS,type DefenseContext} from '../../src/contracts/defense-settings.js';
// @ts-expect-error Observation-only JavaScript harness.
import {observeDefense,context,snapshot} from '../fixtures/defense-parity-scenarios.mjs';
// @ts-expect-error Existing observation-only input builders.
import {damageInput} from '../fixtures/damage-parity-scenarios.mjs';
const golden=JSON.parse(readFileSync(new URL('../fixtures/defense-parity-golden.json',import.meta.url),'utf8'));
const observed=observeDefense({...defense,...damage},DEFAULT_DEFENSE_SETTINGS);
describe('accepted v2.0.5 Critical/Defense oracle',()=>{
 it('pins accepted source graph, scenario order and expected error coverage',()=>{
  expect(golden.revision).toBe('65334063e7ceac788ff2f73122694a158a10c5a8');
  for(const [file,hash] of Object.entries(golden.sources))expect(createHash('sha256').update(execFileSync('git',['show',`${golden.revision}:${file}`])).digest('hex')).toBe(hash);
  expect(Object.keys(golden.sources)).toHaveLength(85);expect(golden.scenarios).toHaveLength(150);
  expect(golden.scenarios.filter((s:{error?:unknown})=>s.error)).toHaveLength(25);
  expect(observed.map((s:{name:string})=>s.name)).toEqual(golden.scenarios.map((s:{name:string})=>s.name));
 });
 for(const [index,scenario] of golden.scenarios.entries())it(`${index}: ${scenario.name}`,()=>expect(observed[index]).toStrictEqual(scenario));
 it('preserves callback receivers and two reads of the Critical property',()=>{
  const c=context(),s=snapshot(DEFAULT_DEFENSE_SETTINGS),trace:unknown[]=[];
  defense.resolveDefenseHit(c,s,function(this:unknown){trace.push(this);return 1;});expect(trace).toEqual([undefined]);
  const input=damageInput();let gets=0,receiver:unknown;
  Object.defineProperty(input,'roll',{get(){gets++;return function(this:unknown){receiver=this;return 0;};}});
  damage.calculateDamage(input);expect(gets).toBe(2);expect(receiver).toBe(input);
 });
 it('keeps original context, mutable missing diagnostics and independent results',()=>{
  const c=context() as DefenseContext,s=snapshot(DEFAULT_DEFENSE_SETTINGS);s.settings.types.armorReduction.coefficients={};
  const a=defense.mitigateDefense(100,c,s),b=defense.mitigateDefense(100,c,s);
  expect(a.context).toBe(c);expect(a.mitigation.missing).not.toBe(b.mitigation.missing);
  a.mitigation.missing.push('caller');expect(b.mitigation.missing).toEqual(['baseK','levelPenalty']);
 });
 it.each(['dodge','critical','baseK','levelPenalty','version','revision'])('propagates the original thrown object at %s',point=>{
  const c=context(),s=snapshot(DEFAULT_DEFENSE_SETTINGS),input=damageInput(),error={point},fail=()=>{throw error;};
  let caught:unknown;try{
   if(point==='dodge')defense.resolveDefenseHit(c,s,fail);
   else if(point==='critical'){input.roll=fail;damage.calculateDamage(input);}
   else {Object.defineProperty(point==='version'?s.settings:point==='revision'?s:s.settings.types.armorReduction.coefficients,point,{get:fail});defense.mitigateDefense(100,c,s);}
  }catch(e){caught=e;}expect(caught).toBe(error);
 });
});
