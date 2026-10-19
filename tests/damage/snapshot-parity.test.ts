import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as damage from '../../src/damage/damage-core.js';
import {damageDefinition} from '../../src/contracts/damage-contracts.js';
// @ts-expect-error Observation-only JavaScript harness.
import {observeSnapshots} from '../fixtures/snapshot-parity-scenarios.mjs';
const golden=JSON.parse(readFileSync(new URL('../fixtures/snapshot-parity-golden.json',import.meta.url),'utf8'));
const observed=observeSnapshots({...damage,damageDefinition});
describe('accepted-source v2.0.7 snapshot oracle',()=>{
 it('pins accepted hashes and scenario inventory',()=>{
  expect(golden.revision).toBe('1b1183641858c4654f4dac22c338fb47e265b8de');
  expect(Object.keys(golden.sources)).toHaveLength(101);
  for(const [file,hash] of Object.entries(golden.sources))expect(createHash('sha256').update(execFileSync('git',['show',`${golden.revision}:${file}`])).digest('hex')).toBe(hash);
  expect(golden.scenarios).toHaveLength(151);
  expect(golden.scenarios.filter((s:{error?:unknown})=>s.error)).toHaveLength(56);
  expect(observed.map((s:{name:string})=>s.name)).toEqual(golden.scenarios.map((s:{name:string})=>s.name));
 });
 for(const [i,scenario] of golden.scenarios.entries())it(`${i}: ${scenario.name}`,()=>expect(observed[i]).toStrictEqual(scenario));
});
