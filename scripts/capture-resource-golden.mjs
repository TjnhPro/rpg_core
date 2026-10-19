// Manual accepted-source capture; run before production edits only.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {observeResources} from '../tests/fixtures/resource-parity-scenarios.mjs';
const revision='7b43bc5046ada04ce600ad714bfa34172dc5e160';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),revision);
execFileSync('git',['diff','--exit-code',revision,'--','src','docs/behavior-baseline.json']);
const files=execFileSync('git',['ls-tree','-r','--name-only',revision,'src'],{encoding:'utf8'}).trim().split('\n').filter(f=>f.endsWith('.ts'));
const sources={};for(const file of files){const blob=execFileSync('git',['show',`${revision}:${file}`]);assert.equal(readFileSync(file,'utf8').replaceAll('\r\n','\n'),blob.toString().replaceAll('\r\n','\n'));sources[file]=createHash('sha256').update(blob).digest('hex');}
// Dependencies must also be built from the accepted tree before transpiling facades.
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json']);
async function accepted(file){const source=execFileSync('git',['show',`${revision}:${file}`],{encoding:'utf8'});let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;js=js.replace(/from ['"]([^'"]+)['"]/g,(_,spec)=>`from '${new URL(spec,new URL('../'+file.replace(/^src\//,'dist/').replace(/\.ts$/,'.js'),import.meta.url)).href}'`);return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));}
const api={...await accepted('src/combat/combat-entity.ts'),...await accepted('src/stats/stat-calculation.ts')};
const scenarios=observeResources(api);
writeFileSync('tests/fixtures/resource-parity-golden.json',JSON.stringify({revision,sources,scenarios},null,2)+'\n');
console.log(JSON.stringify({revision,sourceFiles:files.length,scenarios:scenarios.length,errors:scenarios.filter(s=>s.error).length,originalThrownObjects:scenarios.filter(s=>s.error?.original===true).length}));
