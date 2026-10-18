import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as text from './text-rpg/scenarios.js';
import * as voLam from './vo-lam-25d/scenarios.js';
import * as arpg from './arpg/scenarios.js';
import {encode} from './observations.js';
const revision='436cc35a17389a54e05843ec8efbcfc5c1604295';
const consumers={'text-rpg':text,'vo-lam-25d':voLam,arpg};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const expected=(name:string)=>JSON.parse(readFileSync(`tests/consumers/${name}/expected.json`,'utf8'));
const run=(name:keyof typeof consumers)=>consumers[name].ids.map(id=>consumers[name].runScenario(id));
function compare(name:keyof typeof consumers){
  const oracle=expected(name),rows=run(name);
  for(const row of rows){expect(row.anchors).toStrictEqual(oracle.hand[row.id]);expect(row).toStrictEqual(oracle.observations[row.id]);expect(JSON.stringify(row)).toBe(JSON.stringify(oracle.observations[row.id]));}
  return rows;
}
let scratch:string;
beforeAll(()=>{
  // Compile caller fixtures only. Fresh Node processes resolve built public package
  // self-references; the installed test separately proves external portability.
  scratch=mkdtempSync(path.resolve('.git/rpg-multi-test-'));
  writeFileSync(path.join(scratch,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,skipLibCheck:false,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,types:[],lib:['ES2022','DOM'],rootDir:path.resolve('tests/consumers'),outDir:path.join(scratch,'run')},files:['observations.ts',...Object.keys(consumers).flatMap(n=>[n+'/config.ts',n+'/scenarios.ts'])].map(f=>path.resolve('tests/consumers',f))}));
  execFileSync(process.execPath,[path.resolve('node_modules/typescript/bin/tsc'),'-p',path.join(scratch,'tsconfig.json')],{stdio:'pipe'});
  writeFileSync(path.join(scratch,'fresh.mjs'),`const name=process.argv[2];const api=await import('./run/'+name+'/scenarios.js');console.log(JSON.stringify(api.ids.map(id=>api.runScenario(id))));`);
},30000);
afterAll(()=>{
  if(scratch){expect(path.dirname(scratch)).toBe(path.resolve('.git'));expect(path.basename(scratch).startsWith('rpg-multi-test-')).toBe(true);rmSync(scratch,{recursive:true,force:true});}
});
for(const [name,api] of Object.entries(consumers))describe(name,()=>{
  for(const id of api.ids)it(id+' complete accepted trace and independent fixed anchors',()=>{
    const actual=api.runScenario(id),oracle=expected(name);expect(actual.anchors).toStrictEqual(oracle.hand[id]);expect(actual).toStrictEqual(oracle.observations[id]);expect(JSON.stringify(actual)).toBe(JSON.stringify(oracle.observations[id]));
  });
  it('repeats identically without shared state',()=>expect(run(name as keyof typeof consumers)).toStrictEqual(compare(name as keyof typeof consumers)));
  it('resets independently after mutation and policy toggle scenarios',()=>{
    const before=run(name as keyof typeof consumers);
    text.runScenario('T9');voLam.runScenario('V8');voLam.runScenario('V10');arpg.runScenario('A3');arpg.runScenario('A7');arpg.runScenario('A8');
    expect(run(name as keyof typeof consumers)).toStrictEqual(before);
  });
  it('matches a fresh native ESM process',()=>{
    const fresh=execFileSync(process.execPath,[path.join(scratch,'fresh.mjs'),name],{encoding:'utf8',maxBuffer:16*1024*1024});expect(JSON.parse(fresh)).toStrictEqual(compare(name as keyof typeof consumers));
  });
  it('pins accepted-source oracle and every caller fixture hash',()=>{
    const oracle=expected(name);expect(oracle.acceptedTraceProvenance.revision).toBe(revision);expect(Object.keys(oracle.observations)).toStrictEqual([...api.ids]);
    for(const [file,hash] of Object.entries(oracle.acceptedTraceProvenance.sourceSha256))expect(sha(execFileSync('git',['show',`${revision}:${file}`]))).toBe(hash);
    for(const [file,hash] of Object.entries(oracle.acceptedTraceProvenance.fixtureSha256))expect(sha(readFileSync('tests/consumers/'+file))).toBe(hash);
  });
});
it('same-process forward order has independent fixed results',()=>{for(const name of ['text-rpg','vo-lam-25d','arpg'] as const)compare(name);});
it('same-process reverse order has independent fixed results',()=>{for(const name of ['arpg','vo-lam-25d','text-rpg'] as const)compare(name);});
it('fixture imports contain no Legacy, private source or other-consumer dependency',()=>{
  for(const name of Object.keys(consumers))for(const file of ['config.ts','scenarios.ts']){
    const source=readFileSync(`tests/consumers/${name}/${file}`,'utf8');
    for(const match of source.matchAll(/from\s*['"]([^'"]+)['"]/g))expect(['@rpg/core/kernel','./config.js','../observations.js']).toContain(match[1]);
    expect(source).not.toMatch(/\b(?:require|import)\s*\(/);
  }
});
it('retains exactly 32 named scenarios and all seventeen runtime API imports',()=>{
  expect(Object.values(consumers).flatMap(api=>[...api.ids])).toHaveLength(32);
  const source=Object.keys(consumers).map(n=>readFileSync(`tests/consumers/${n}/scenarios.ts`,'utf8')).join('\n');
  const declaration=readFileSync('src/kernel/index.ts','utf8');
  const names=[...declaration.matchAll(/^export \{([^}]+)\}/gm)].flatMap(m=>m[1]!.split(',').map(n=>n.trim()));expect(names).toHaveLength(17);
  for(const name of names)expect(source).toMatch(new RegExp('\\b'+name+'\\s*(?:<[^;]+?>)?\\('));
});
it('observation encoding preserves special scalars and ordered keys',()=>{
  expect(encode([undefined,NaN,Infinity,-0])).toStrictEqual([{$number:'undefined'},{$number:'NaN'},{$number:'Infinity'},{$number:'-0'}]);
  expect(Object.keys(encode({['__proto__']:1,z:2,a:3}) as object)).toStrictEqual(['__proto__','z','a']);
});
