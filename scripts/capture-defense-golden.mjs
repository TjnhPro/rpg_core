// Manual pre-extraction capture. Never imports an extracted implementation.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {observeDefense} from '../tests/fixtures/defense-parity-scenarios.mjs';
const revision='65334063e7ceac788ff2f73122694a158a10c5a8';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),revision);
execFileSync('git',['diff','--exit-code',revision,'--','src','docs/behavior-baseline.json']);
const files=execFileSync('git',['ls-tree','-r','--name-only',revision,'src'],{encoding:'utf8'}).trim().split('\n').filter(f=>f.endsWith('.ts'));
const sources={};for(const file of files){const blob=execFileSync('git',['show',`${revision}:${file}`]);assert.equal(readFileSync(file,'utf8').replaceAll('\r\n','\n'),blob.toString('utf8').replaceAll('\r\n','\n'));sources[file]=createHash('sha256').update(blob).digest('hex');}
function accepted(file,overrides={}){const source=execFileSync('git',['show',`${revision}:${file}`],{encoding:'utf8'});let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;js=js.replace(/from ['"]([^'"]+)['"]/g,(_,spec)=>`from '${overrides[spec]??new URL(spec,new URL('../'+file.replace(/^src\//,'dist/').replace(/\.ts$/,'.js'),import.meta.url)).href}'`);return 'data:text/javascript;base64,'+Buffer.from(js).toString('base64');}
const defenseUrl=accepted('src/damage/defense-engine.ts');
const defense=await import(defenseUrl),damage=await import(accepted('src/damage/damage-core.ts',{'./defense-engine.js':defenseUrl}));
const {DEFAULT_DEFENSE_SETTINGS}=await import('../dist/contracts/defense-settings.js');
const scenarios=observeDefense({...defense,...damage},DEFAULT_DEFENSE_SETTINGS);
writeFileSync('tests/fixtures/defense-parity-golden.json',JSON.stringify({revision,sources,scenarios},null,2)+'\n');
console.log(JSON.stringify({revision,sourceFiles:files.length,scenarios:scenarios.length,errors:scenarios.filter(s=>s.error).length}));
