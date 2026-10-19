// Explicit accepted-source supplemental capture, never invoked by tests/verify.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
const revision='436cc35a17389a54e05843ec8efbcfc5c1604295';
assert(process.argv.includes('--capture-reviewed-traces'),'Explicit --capture-reviewed-traces required');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),revision);
assert.equal(execFileSync('git',['diff',revision,'--','src','package.json','tsconfig.json'],{encoding:'utf8'}),'');
const sha=v=>createHash('sha256').update(v).digest('hex');
const scratch=mkdtempSync(path.join(tmpdir(),'rpg-multi-oracle-'));
const write=(file,data)=>{const target=path.join(scratch,file);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,data);};
const tsc=path.resolve('node_modules/typescript/bin/tsc');
try{
  const files=execFileSync('git',['ls-tree','-r','--name-only',revision,'src/kernel'],{encoding:'utf8'}).trim().split('\n');
  const sourceSha256={},fixtureSha256={};
  for(const file of files){const blob=execFileSync('git',['show',`${revision}:${file}`]);sourceSha256[file]=sha(blob);write('node_modules/@rpg/core/'+file,blob);}
  write('node_modules/@rpg/core/package.json',execFileSync('git',['show',`${revision}:package.json`]));
  const config=JSON.parse(execFileSync('git',['show',`${revision}:tsconfig.json`],{encoding:'utf8'}));
  config.include=['src/kernel'];config.compilerOptions.skipLibCheck=false;
  write('node_modules/@rpg/core/tsconfig.json',JSON.stringify(config));
  execFileSync(process.execPath,[tsc,'-p',path.join(scratch,'node_modules/@rpg/core/tsconfig.json')],{stdio:'pipe'});
  write('package.json','{"type":"module"}');
  const names=['text-rpg','vo-lam-25d','arpg'];
  for(const file of ['observations.ts',...names.flatMap(n=>[n+'/config.ts',n+'/scenarios.ts'])]){
    const bytes=readFileSync('tests/consumers/'+file);fixtureSha256[file]=sha(bytes);write('consumers/'+file,bytes);
  }
  write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,skipLibCheck:false,types:[],lib:['ES2022','DOM'],rootDir:'consumers',outDir:'run'},include:['consumers/**/*.ts']}));
  execFileSync(process.execPath,[tsc,'-p',path.join(scratch,'tsconfig.json')],{stdio:'pipe'});
  write('capture.mjs',`const names=${JSON.stringify(names)};const output={};for(const name of names){const api=await import('./run/'+name+'/scenarios.js');output[name]=api.ids.map(id=>api.runScenario(id));}console.log(JSON.stringify(output));`);
  const captured=JSON.parse(execFileSync(process.execPath,[path.join(scratch,'capture.mjs')],{encoding:'utf8'}));
  // First validate ALL hand anchors; do not partially write if any disagree.
  const artifacts=names.map(name=>{
    const file='tests/consumers/'+name+'/expected.json',expected=JSON.parse(readFileSync(file,'utf8'));
    assert.equal(expected.acceptedTraceProvenance,null,'Refuse to overwrite an existing oracle; explicit Developer review required');
    for(const row of captured[name])assert.deepEqual(row.anchors,expected.hand[row.id],`${name}/${row.id}: hand anchor disagreement; STOP and review`);
    return {file,value:{...expected,acceptedTraceProvenance:{revision,command:'node scripts/capture-multi-rpg-oracle.mjs --capture-reviewed-traces',sourceSha256,fixtureSha256},observations:Object.fromEntries(captured[name].map(row=>[row.id,row]))}};
  });
  for(const artifact of artifacts)writeFileSync(artifact.file,JSON.stringify(artifact.value,null,2)+'\n');
  console.log(JSON.stringify({revision,sourceFiles:files.length,scenarios:Object.values(captured).reduce((n,rows)=>n+rows.length,0),handAnchors:'ALL_MATCH',runtimeSource:'accepted Git blobs only'}));
}catch(error){if(error.stdout)console.error(String(error.stdout));if(error.stderr)console.error(String(error.stderr));throw error;}
finally{assert.equal(path.dirname(path.resolve(scratch)),path.resolve(tmpdir()));assert(path.basename(scratch).startsWith('rpg-multi-oracle-'));rmSync(scratch,{recursive:true,force:true});}
