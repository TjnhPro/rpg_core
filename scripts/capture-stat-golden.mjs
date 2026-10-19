// Manual pre-extraction capture only; never run by production or parity tests.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {observeStats} from '../tests/fixtures/stat-parity-scenarios.mjs';
const revision = 'a05439ec504b759df48d3345eea199fecf08083f';
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), revision);
execFileSync('git', ['diff', '--exit-code', revision, '--', 'src']);
// Run npm run build at the pinned revision before invoking this capture script.
const stats = await import('../dist/stats/stat-calculation.js');
const modifiers = await import('../dist/modifiers/modifier-core.js');
const contracts = await import('../dist/contracts/stat-contracts.js');
const scenarios = observeStats(stats, modifiers, contracts);
writeFileSync(new URL('../tests/fixtures/stat-parity-golden.json', import.meta.url), JSON.stringify({revision, scenarios}, null, 2) + '\n');
console.log(JSON.stringify({revision, scenarios: scenarios.length}));
