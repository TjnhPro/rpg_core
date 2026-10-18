import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as combat from '../../src/combat/combat-entity.js';
import {updateCurrentResources} from '../../src/stats/stat-calculation.js';
// @ts-expect-error Observation-only JavaScript harness.
import {observeResources} from '../fixtures/resource-parity-scenarios.mjs';
const golden=JSON.parse(readFileSync(new URL('../fixtures/resource-parity-golden.json',import.meta.url),'utf8'));
const observed=observeResources({...combat,updateCurrentResources});
describe('accepted v2.0.6 resource oracle',()=>{
 it('pins source hashes, scenario order and error/identity coverage',()=>{
  expect(golden.revision).toBe('7b43bc5046ada04ce600ad714bfa34172dc5e160');
  for(const [file,hash] of Object.entries(golden.sources))expect(createHash('sha256').update(execFileSync('git',['show',`${golden.revision}:${file}`])).digest('hex')).toBe(hash);
  expect(Object.keys(golden.sources)).toHaveLength(86);expect(golden.scenarios).toHaveLength(223);
  expect(golden.scenarios.filter((s:{error?:unknown})=>s.error)).toHaveLength(97);
  expect(golden.scenarios.filter((s:{error?:{original:boolean}})=>s.error?.original)).toHaveLength(13);
  expect(observed.map((s:{name:string})=>s.name)).toEqual(golden.scenarios.map((s:{name:string})=>s.name));
 });
 for(const [index,scenario] of golden.scenarios.entries())it(`${index}: ${scenario.name}`,()=>expect(observed[index]).toStrictEqual(scenario));
 it('propagates the original thrown object, not a serialized replacement',()=>{
  const sentinel={},s={maxHp:20,maxMana:10,get hpRegen():number{throw sentinel;},manaRegen:3};
  let caught:unknown;try{updateCurrentResources(5,2,s,1000);}catch(e){caught=e;}expect(caught).toBe(sentinel);
 });
});
