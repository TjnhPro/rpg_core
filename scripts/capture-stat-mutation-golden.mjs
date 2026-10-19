// Manual capture only: loads exact original source in memory, never in tests or production.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {observeStatMutations} from '../tests/fixtures/stat-mutation-scenarios.mjs';
const revision = 'a05439ec504b759df48d3345eea199fecf08083f';
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), 'd57feeee02691a4eee58eeeabfc410fde9317626');
execFileSync('git', ['diff', '--exit-code', revision, '--', 'src/contracts', 'src/modifiers']);
const source = execFileSync('git', ['show', `${revision}:src/stats/stat-calculation.ts`], {encoding: 'utf8'});
const js = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022}}).outputText
  .replaceAll('../contracts/stat-contracts.js', new URL('../dist/contracts/stat-contracts.js', import.meta.url).href);
const stats = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const modifiers = await import('../dist/modifiers/modifier-core.js');
const contracts = await import('../dist/contracts/stat-contracts.js');
const scenarios = observeStatMutations(stats, modifiers, contracts);
writeFileSync(new URL('../tests/fixtures/stat-mutation-golden.json', import.meta.url), JSON.stringify({revision,
  sourceSha256: createHash('sha256').update(source).digest('hex'), scenarios}, null, 2) + '\n');
console.log(JSON.stringify({revision, scenarios: scenarios.length}));
