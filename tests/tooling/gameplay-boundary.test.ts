import {expect,it} from 'vitest';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
// @ts-expect-error JavaScript evidence helper exercises the existing checker.
import {cases,families,withBoundaryTree,rejectCase} from '../fixtures/gameplay-boundary-audit.mjs';
for(const phase of ['source','emitted'])it.each(cases as {name:string}[])(phase+': real contract $name',c=>{
 withBoundaryTree(path.resolve(phase==='source'?'src':'dist'),phase,(tree:any)=>expect(rejectCase(tree,c).diagnostic).toBe('forbidden declaration'));
},30_000);
it.each(families as [string,string][])('CLI rejects actual %s from a deep Kernel module',(name,file)=>{
 withBoundaryTree(path.resolve('src'),'source',(tree:any)=>{
  // Source CLI also validates historical forwarders; use the real module map.
  writeFileSync(path.join(tree.root,'docs/module-map.json'),requireMap());
  const cli=()=>spawnSync(process.execPath,[path.resolve('scripts/check-architecture.mjs'),tree.root],{encoding:'utf8'});
  const valid=cli();expect(valid.status,valid.stdout+valid.stderr).toBe(0);
  tree.set('import type {'+name+'} from "../../../contracts/'+file+'.js"; export type Public='+name+';');
  const bad=cli(),output=bad.stdout+bad.stderr;expect(bad.status).not.toBe(0);expect(output).toContain('forbidden dependency src/contracts/'+file+'.ts');expect(output).toContain('forbidden declaration');expect(output).not.toContain('Cannot find module');
 });
},30_000);
import {readFileSync} from 'node:fs';
function requireMap(){return readFileSync('docs/module-map.json','utf8');}

it.each([
 ['Skills','skills/skill-engine','validateSkillDefinition'],
 ['Mechanics','mechanics/melee-hitbox','detectMeleeHitbox'],
 ['Spatial','spatial/range','distance'],
])('CLI rejects actual runtime %s import with a valid target',(_domain,file,name)=>{
 withBoundaryTree(path.resolve('src'),'source',(tree:any)=>{
  writeFileSync(path.join(tree.root,'docs/module-map.json'),requireMap());
  const cli=()=>spawnSync(process.execPath,[path.resolve('scripts/check-architecture.mjs'),tree.root],{encoding:'utf8'});
  const valid=cli();expect(valid.status,valid.stdout+valid.stderr).toBe(0);
  tree.set('export {'+name+' as Public} from "../../../'+file+'.js";');
  const bad=cli(),output=bad.stdout+bad.stderr;
  expect(bad.status).not.toBe(0);
  expect(output).toContain('forbidden dependency src/'+file+'.ts');
  expect(output).not.toContain('Cannot find module');
 });
},30_000);
