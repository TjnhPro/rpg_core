// Manual accepted-source capture; refuses production edits.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {observeSnapshots} from '../tests/fixtures/snapshot-parity-scenarios.mjs';
const revision='1b1183641858c4654f4dac22c338fb47e265b8de';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),revision);
// Always execute isolated Git blobs, never the working-tree implementation.
const scratch=mkdtempSync(path.join(tmpdir(),'rpg-snapshot-oracle-'));
try {
const files=execFileSync('git',['ls-tree','-r','--name-only',revision,'src','examples'],{encoding:'utf8'}).trim().split('\n').filter(f=>f.endsWith('.ts'));
const sources={};for(const f of files){const blob=execFileSync('git',['show',`${revision}:${f}`]);mkdirSync(path.dirname(path.join(scratch,f)),{recursive:true});writeFileSync(path.join(scratch,f),blob);sources[f]=createHash('sha256').update(blob).digest('hex');}
for(const f of ['package.json','tsconfig.json','tsconfig.examples.json'])writeFileSync(path.join(scratch,f),execFileSync('git',['show',`${revision}:${f}`]));
const compiler=path.resolve('node_modules/typescript/bin/tsc');
execFileSync(process.execPath,[compiler,'-p',path.join(scratch,'tsconfig.json')]);
execFileSync(process.execPath,[compiler,'-p',path.join(scratch,'tsconfig.examples.json')]);
const api={...await import(pathToFileURL(path.join(scratch,'dist/damage/damage-core.js'))),...await import(pathToFileURL(path.join(scratch,'dist/contracts/damage-contracts.js')))};
const integration={};
for(const [file,fn] of [['root-snapshot','rootSnapshotExample'],['skill-instance','skillInstanceExample'],['skill-trigger','skillTriggerExample'],['nested-composition','nestedCompositionExample'],['stack-consumption','stackConsumptionExample'],['conditional-triggers','conditionalTriggersExample'],['recovery-acceptance','recoveryAcceptanceExample']])integration[file]=(await import(pathToFileURL(path.join(scratch,`.example-dist/${file}.js`))))[fn]();
const scenarios=observeSnapshots(api);
writeFileSync('tests/fixtures/snapshot-parity-golden.json',JSON.stringify({revision,sources,scenarios,integration},null,2)+'\n');
console.log(JSON.stringify({revision,sourceFiles:files.length,scenarios:scenarios.length,errors:scenarios.filter(s=>s.error).length,integration:Object.keys(integration).length}));

}finally{rmSync(scratch,{recursive:true,force:true});}
