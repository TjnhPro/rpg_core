// Manual accepted-revision capture. Tests read the oracle, never an old calculator.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {observeDamage} from '../tests/fixtures/damage-parity-scenarios.mjs';
import {DEFAULT_DEFENSE_SETTINGS} from '../dist/contracts/defense-settings.js';
const revision='7443ff8e897ce61a4216d5386ec7e72310d352c3';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),revision);
// Only calculateDamage is loaded from its accepted Git blob. All runtime
// dependencies must remain accepted source and be rebuilt before capture.
execFileSync('git',['diff','--exit-code',revision,'--','src/contracts','src/combat','src/damage/defense-engine.ts','src/modifiers','src/kernel/modifiers','src/kernel/contracts/modifiers.ts','src/kernel/contracts/modifier-resolution.ts','docs/behavior-baseline.json']);
const file='src/damage/damage-core.ts',source=execFileSync('git',['show',`${revision}:${file}`],{encoding:'utf8'});
let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
js=js.replace(/from ['"]([^'"]+)['"]/g,(_,spec)=>`from '${new URL(spec,new URL('../dist/damage/damage-core.js',import.meta.url)).href}'`);
const api=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const scenarios=observeDamage(api,DEFAULT_DEFENSE_SETTINGS);
writeFileSync('tests/fixtures/damage-parity-golden.json',JSON.stringify({revision,sources:{[file]:createHash('sha256').update(source).digest('hex')},scenarios},null,2)+'\n');
console.log(JSON.stringify({revision,scenarios:scenarios.length,errors:scenarios.filter(s=>s.error).length}));
