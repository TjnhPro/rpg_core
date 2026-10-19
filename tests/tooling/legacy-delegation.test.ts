import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
// @ts-expect-error JS tooling intentionally has no shipped public declarations.
import {auditLegacyDelegation} from '../../scripts/audit-legacy-delegation.mjs';
// @ts-expect-error private JS fixture driver
import {cases as boundaryCases,withBoundaryTree,rejectCase} from '../fixtures/gameplay-boundary-audit.mjs';
import path from 'node:path';
const stats='src/stats/stat-calculation.ts';
// @ts-expect-error private finite fixture mapping
import {adversarialCases as cases} from '../fixtures/legacy-delegation-audit.mjs';
const read=(file:string)=>readFileSync(file,'utf8');

it('records 24 resolved Kernel calls, reviewed wrapper edges and authority locations',()=>{
 const r=auditLegacyDelegation();expect(r.types).toEqual([]);expect(r.diagnostics).toEqual([]);expect(r.status).toBe('PASS');expect(r.directSites).toBe(24);
});
for(const c of cases)it(`${c.name}: valid control, type-valid rejection, exact diagnostic`,()=>{
 const control=read(c.file),candidate=c.change(control);expect(candidate).not.toBe(control);
 const valid=auditLegacyDelegation({[c.file]:control});expect(valid.status).toBe('PASS');
 const invalid=auditLegacyDelegation({[c.file]:candidate});expect(invalid.types).toEqual([]);
 expect(invalid.status).toBe('FAIL');expect(invalid.diagnostics.some((d:{code:string})=>d.code===c.code)).toBe(true);
},20000);
it('accepts imported aliases and preserves checked transitive paths',()=>{
 const source=read(stats).replace('import {calculateEffectiveValue,calculateStats,calculateCooldownDurationMs}', 'import {calculateEffectiveValue,calculateStats,calculateCooldownDurationMs as durationAlias}').replace('return calculateCooldownDurationMs(', 'return durationAlias(');
 expect(source).not.toBe(read(stats));const r=auditLegacyDelegation({[stats]:source});expect(r.types).toEqual([]);expect(r.diagnostics).toEqual([]);
});
it('rejects a type-valid forbidden Kernel dependency through the existing closure checker',()=>{
 withBoundaryTree(path.resolve('src'),'source',(tree:unknown)=>{
  const result=rejectCase(tree,boundaryCases.find((c:{name:string})=>c.name==='direct MapPoint'));
  expect(result).toBeDefined();
 });
});
