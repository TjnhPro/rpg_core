// Manual capture from accepted Git blobs only. Never run during tests.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const revision='f5c22e2431075dc9b610359fdede99460aee850e';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),revision);
assert.equal(execFileSync('git',['diff',revision,'--','src'],{encoding:'utf8'}),'');
const sha=v=>createHash('sha256').update(v).digest('hex');
const harness=['tests/fixtures/legacy-isolation-scenarios.ts'];
const helpers=['tests/fixtures/skill-core.ts','tests/fixtures/skill-timeline.ts','tests/fixtures/nested-skill.ts'];
const sources={},scenarioSources={};
const scratch=mkdtempSync(path.join(tmpdir(),'rpg-legacy-isolation-oracle-'));
const write=(file,text)=>{mkdirSync(path.dirname(path.join(scratch,file)),{recursive:true});writeFileSync(path.join(scratch,file),text);};
try{
 const files=execFileSync('git',['ls-tree','-r','--name-only',revision,'src'],{encoding:'utf8'}).trim().split('\n').filter(f=>f.endsWith('.ts'));
 for(const file of [...files,...helpers]){const blob=execFileSync('git',['show',`${revision}:${file}`]);write(file,blob);sources[file]=sha(blob);}
 for(const file of harness){const blob=readFileSync(file,'utf8').replaceAll('\r\n','\n');write(file,blob);scenarioSources[file]=sha(blob);}
 write('package.json','{"type":"module"}');
 const config=JSON.parse(readFileSync('tsconfig.json','utf8'));
 config.compilerOptions={...config.compilerOptions,rootDir:'.',outDir:'build',declaration:false,types:[],paths:{'@rpg/core':['./src/index.ts'],'@rpg/core/*':['./src/*/index.ts']}};
 config.include=['src','tests/fixtures/*.ts'];
 write('tsconfig.json',JSON.stringify(config));
 execFileSync(process.execPath,[path.resolve('node_modules/typescript/bin/tsc'),'-p',path.join(scratch,'tsconfig.json')],{encoding:'utf8',stdio:'pipe'});
 const {observeLegacyIsolation}=await import(pathToFileURL(path.join(scratch,'build/tests/fixtures/legacy-isolation-scenarios.js')));
 const scenarios=observeLegacyIsolation();
 const artifact={revision,sources,scenarioSources,scenarios};
 const header=JSON.stringify({revision,sources,scenarioSources},null,2).slice(0,-2);
 const rows=scenarios.map(({name,summary,observation})=>'    {"name":'+JSON.stringify(name)+',"summary":'+JSON.stringify(summary)+',"observation":[\n'+observation.map(v=>'      '+JSON.stringify(v)).join(',\n')+'\n    ]}');
 writeFileSync('tests/fixtures/legacy-isolation-golden.json',header+',\n  "scenarios":[\n'+rows.join(',\n')+'\n  ]\n}\n');
 console.log(JSON.stringify({revision,sourceFiles:files.length,helpers:helpers.length,scenarios:scenarios.length,summaries:scenarios.map(({name,summary})=>({name,...summary}))},null,2));
}catch(e){if(e.stdout)console.error(String(e.stdout));if(e.stderr)console.error(String(e.stderr));throw e;}
finally{assert.equal(path.dirname(path.resolve(scratch)),path.resolve(tmpdir()));assert(path.basename(scratch).startsWith('rpg-legacy-isolation-oracle-'));rmSync(scratch,{recursive:true,force:true});}
