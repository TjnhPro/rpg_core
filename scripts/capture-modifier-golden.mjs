// Manual pinned-source capture only; tests never execute historical engines.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {observeModifiers} from '../tests/fixtures/modifier-parity-scenarios.mjs';
const revision = '390c6e8c96f467903401d18b32a4e44184b5f94e';
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), revision);
// The two captured engines always come from git, never the rewritten modules.
// Their other runtime dependencies must still match the accepted revision.
execFileSync('git', ['diff', '--exit-code', revision, '--', 'src/contracts', 'src/damage', 'src/stats', 'src/effects', 'src/skills', 'docs/behavior-baseline.json']);
const files = ['src/modifiers/modifier-core.ts', 'src/damage/damage-core.ts'];
const sources = Object.fromEntries(files.map(file => [file, execFileSync('git', ['show', `${revision}:${file}`], {encoding: 'utf8'})]));
const load = async (file, overrides = {}) => {
  let js = ts.transpileModule(sources[file], {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022}}).outputText;
  js = js.replace(/from ['"]([^'"]+)['"]/g, (all, spec) => `from '${overrides[spec] ?? new URL(spec, new URL('../' + file.replace(/^src\//, 'dist/'), import.meta.url)).href}'`);
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
  return {url, api: await import(url)};
};
const modifiers = await load(files[0]);
const damage = await load(files[1], {'../modifiers/modifier-core.js': modifiers.url});
const scenarios = observeModifiers(modifiers.api, damage.api);
writeFileSync(new URL('../tests/fixtures/modifier-parity-golden.json', import.meta.url), JSON.stringify({revision,
  sources: Object.fromEntries(files.map(file => [file, createHash('sha256').update(sources[file]).digest('hex')])), scenarios}, null, 2) + '\n');
console.log(JSON.stringify({revision, scenarios: scenarios.length, errors: scenarios.filter(s => s.error).length}));
