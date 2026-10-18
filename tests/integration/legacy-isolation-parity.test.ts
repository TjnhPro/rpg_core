import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {observeLegacyIsolation,encodeObservation,type IsolationObservation} from '../fixtures/legacy-isolation-scenarios.js';
import {nestedFixture} from '../fixtures/nested-skill.js';
import {damage} from '../fixtures/skill-core.js';
import {advanceSkillEffects,deriveSkillRootDamage,inspectSkillInstance} from '../../src/skills/index.js';
const golden=JSON.parse(readFileSync(new URL('../fixtures/legacy-isolation-golden.json',import.meta.url),'utf8'));
const actual=observeLegacyIsolation();
it('keeps the original 59 complete expected observations unchanged',()=>{
 expect(createHash('sha256').update(JSON.stringify(golden.scenarios.slice(0,59))).digest('hex')).toBe('02dd2bb3985ed6cd42651f176f75706edd85d7de51b605ca677f8a795cbd117b');
});
it('observes positive Position RNG, exact strike centers and full fine/coarse parity',()=>{
 const fine=actual.find(s=>s.name==='random-in-area-step-1')!,coarse=actual.find(s=>s.name==='random-in-area-step-1000')!;
 expect(fine.observation).toStrictEqual(coarse.observation);expect(fine.summary).toStrictEqual(coarse.summary);
 expect(fine.summary.rolls).toEqual({critCalls:3,dodgeCalls:0,positionCalls:6});
 expect(fine.summary.hp).toEqual([1000,1000,940,1000]);expect(fine.summary.mp).toEqual([95,100,100,100]);
 const entries=fine.observation as {label:string;value:unknown}[];
 expect(entries.filter(e=>['positionRoll','criticalRoll','dodgeRoll'].includes(e.label)).map(e=>e.label)).toEqual(Array(3).fill(['positionRoll','positionRoll','criticalRoll']).flat());
 expect(entries.filter(e=>e.label==='positionRoll').map(e=>e.value)).toEqual(Array(6).fill(encodeObservation({receiver:false})));
 expect(entries.filter(e=>e.label==='positionRoll-result').map(e=>e.value)).toEqual([0.007376669906079769,0.9356674966402352,0.4893254810012877,0.8946488266810775,0.37920520221814513,0.43668476631864905]);
 expect(entries.filter(e=>e.label==='strike-position').map(e=>e.value)).toEqual([
  {x:139.6626026936374,y:50.448172789149986,atMs:150},
  {x:120.56267842490882,y:50.63391178915239,atMs:250},
  {x:125.20547054379898,y:54.54763278261181,atMs:350},
 ].map(encodeObservation));
 expect(entries.filter(e=>e.label==='geometry-call-count').map(e=>e.value)).toEqual([12]);
 expect(entries.filter(e=>e.label==='notify-before').map(e=>(e.value as {entries:[string,unknown][]}).entries.find(([k])=>k==='type')![1])).toEqual(['effect-created',...Array(3).fill(['damage-applied','effect-hit']).flat()]);
});
it('uses accepted Git source and locks the observation harness/helpers',()=>{
 expect(golden.revision).toBe('f5c22e2431075dc9b610359fdede99460aee850e');
 for(const [file,hash] of Object.entries(golden.sources)){
  expect(createHash('sha256').update(readFileSync(file,'utf8').replaceAll('\r\n','\n')).digest('hex'),file).toBe(hash);
 }
 for(const [file,hash] of Object.entries(golden.scenarioSources))expect(createHash('sha256').update(readFileSync(file,'utf8').replaceAll('\r\n','\n')).digest('hex'),file).toBe(hash);
 expect(actual.map(s=>s.name)).toEqual(golden.scenarios.map((s:IsolationObservation)=>s.name));
});
for(const [index,expected] of (golden.scenarios as IsolationObservation[]).entries())it(`accepted full trace: ${expected.name}`,()=>{
 expect(actual[index]).toStrictEqual(expected);
 expect(actual[index]!.summary.errors).toBe(expected.name==='direct-error'?1:0);
});
it('observes lazy Dodge before Critical and no Critical draw after a dodge',()=>{
 const entries=(name:string)=>(actual.find(s=>s.name===name)!.observation as {label:string;value:unknown}[]);
 expect(entries('direct-critical').filter(e=>e.label==='dodgeRoll'||e.label==='criticalRoll').map(e=>e.label)).toEqual(['dodgeRoll','criticalRoll']);
 expect(entries('direct-dodge').filter(e=>e.label==='criticalRoll')).toEqual([]);
 expect(entries('direct-error').find(e=>e.label==='thrown-object-identity')?.value).toBe(true);
 expect(entries('direct-getters').some(e=>e.label==='getter-physicalAttack')).toBe(true);
 for(const name of ['dot-step-1','dot-step-1000'])expect(actual.find(s=>s.name===name)!.summary.rolls).toEqual({critCalls:1,dodgeCalls:0,positionCalls:0});
});
it('preserves same-boundary replay and authenticated receipt/session/disposal outcomes',()=>{
 for(const scenario of actual.filter(s=>s.name.startsWith('trigger-'))){
  const entries=scenario.observation as {label:string;value:unknown}[];
  expect(entries.find(e=>e.label==='once-only')?.value).toBe(true);
  expect(entries.some(e=>e.label==='receipt-forged')).toBe(true);
  expect(entries.some(e=>e.label==='receipt-cross-session')).toBe(true);
  expect(entries.some(e=>e.label==='receipt-disposed')).toBe(true);
 }
 const rejected=actual.find(s=>s.name==='atomic-stack-children-33')!;
 expect(rejected.summary.hp).toEqual([1000,1000,1000,1000]);expect(rejected.summary.hits).toBe(0);
 expect(actual.find(s=>s.name==='atomic-stack-children-1')!.summary.hp[1]).toBe(980);
});
it('keeps the live Root S0 reference across admitted Children and detaches public projections',()=>{
 const f=nestedFixture();f.activate();const snapshot=f.slot.skillExecution!.snapshot,root=snapshot.rootOffense!;
 const first=deriveSkillRootDamage(f.runtime,snapshot,damage()),second=deriveSkillRootDamage(f.runtime,snapshot,damage());
 expect(first).toEqual(second);expect(first).not.toBe(second);expect(first.sources).not.toBe(second.sources);expect(first.sources).not.toBe(root.offense.sources);
 advanceSkillEffects(f.runtime,1800,f.env);expect(f.accepted().length).toBeGreaterThan(1);
 expect(f.observations.length).toBeGreaterThan(1);for(const child of f.observations)expect(child.rootOffense).toBe(root);
 expect(f.captures()).toBe(1);expect(Object.isFrozen(root.offense.sources)).toBe(true);
});
it('observes exact budget frontiers without partially admitting failed batches',()=>{
 const summary=(name:string)=>actual.find(s=>s.name===name)!.summary;
 expect(summary('depth-8-and-reject-9').childrenObserved).toBe(8);
 expect(summary('live-child-limit-32').childrenObserved).toBe(32);
 expect(summary('live-child-limit-33').childrenObserved).toBe(0);
 expect(summary('projectile-family-limit-256').budgetDimensions).toContain('maxProjectilesPerRoot');
 expect(summary('delayed-queue-256-across-roots').childrenObserved).toBe(256);
 expect(summary('delayed-queue-256-across-roots').budgetDimensions).toContain('maxQueuedPerBoundary');
 expect(summary('intent-family-limit-128').childrenObserved).toBe(128);
 expect(summary('intent-family-limit-128').budgetDimensions).toContain('maxIntentsPerRoot');
 expect(summary('atomic-work-512-extra-191').childrenObserved).toBe(32);
 expect(summary('atomic-work-512-extra-192').childrenObserved).toBe(0);
 expect(summary('atomic-work-512-extra-192').budgetDimensions).toContain('maxWorkPerBoundary');
 expect(summary('atomic-work-512-extra-192').rolls.critCalls).toBe(0);
 expect(summary('child-invalid-sibling').childrenObserved).toBe(0);
});
it('encodes undefined, IEEE values, key order and graph aliases without ambiguity',()=>{
 const shared={a:NaN,b:Infinity,c:-Infinity,d:-0,e:undefined};
 const encoded=encodeObservation({z:shared,a:shared});
 expect(encoded).toEqual({kind:'object',id:0,entries:[['z',{kind:'object',id:1,entries:[['a',{kind:'number',value:'NaN'}],['b',{kind:'number',value:'Infinity'}],['c',{kind:'number',value:'-Infinity'}],['d',{kind:'number',value:'-0'}],['e',{kind:'undefined'}]]}],['a',{ref:1}]]});
});
