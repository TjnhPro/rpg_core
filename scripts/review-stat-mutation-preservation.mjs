// Review artifacts only. Never amend the authoritative preservation baseline.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {behaviorFingerprint} from './behavior-fingerprint.mjs';

const revision = 'd57feeee02691a4eee58eeeabfc410fde9317626';
const original = file => execFileSync('git', ['show', `${revision}:${file}`], {encoding: 'utf8'});
const baselineText = readFileSync('docs/behavior-baseline.json', 'utf8');
const baseline = JSON.parse(baselineText);
assert.deepEqual(baseline, JSON.parse(original('docs/behavior-baseline.json')), 'Baseline must remain unamended');
const index = baseline.modules.findIndex(e => e.originalFile === 'src/shared/game/stat-calculation.ts');
assert.equal(index, 12);
const entry = baseline.modules[index], file = 'src/stats/stat-calculation.ts';
function functions(source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return Object.fromEntries(ast.statements.filter(ts.isFunctionDeclaration).map(n => [n.name.text, behaviorFingerprint(n.getText(ast))[0]]));
}
const before = functions(original(file)), after = functions(readFileSync(file, 'utf8'));
assert.deepEqual(Object.keys(before), Object.keys(after));
assert.equal(before.cooldownDurationMs, after.cooldownDurationMs);
assert.equal(before.updateCurrentResources, after.updateCurrentResources);
execFileSync('git', ['diff', '--exit-code', revision, '--', 'src/kernel', 'src/modifiers', 'src/contracts', 'tests/fixtures/stat-parity-golden.json']);
for (const module of baseline.modules) if (module !== entry) {
  assert.deepEqual(module.currentFiles.flatMap(f => behaviorFingerprint(readFileSync(f, 'utf8'))).sort(), module.declarations);
}
const changed = ['calculateEffectiveStat', 'resolveCharacterStats'].map(name => ({name, before: before[name], after: after[name]}));
const declarations = entry.currentFiles.flatMap(f => behaviorFingerprint(readFileSync(f, 'utf8'))).sort();
const amendment = {checkpoint: 'v2.0.3-callback-parity', baseCommit: revision,
  authority: 'PENDING separate Developer preservation approval; docs/v2/2.0.3-callback-parity-patch.md', declarations: changed};
assert.equal(entry.approvedChange.patches, undefined);
const proposal = [
  {op: 'test', path: `/modules/${index}`, value: entry},
  {op: 'replace', path: `/modules/${index}/declarations`, value: declarations},
  {op: 'add', path: `/modules/${index}/approvedChange/patches`, value: [amendment]},
];
const review = {status: 'PENDING_PRESERVATION_APPROVAL', revision,
  baselineSha256: createHash('sha256').update(baselineText).digest('hex'), moduleIndex: index,
  changed, unchanged: {cooldownDurationMs: after.cooldownDurationMs, updateCurrentResources: after.updateCurrentResources},
  kernelSourceAndApiUnchanged: true, modifierSourceUnchanged: true, existingGoldenUnchanged: true,
  unrelatedModulesUnchanged: 26, proposedDeclarations: declarations};
writeFileSync('docs/v2/2.0.3-callback-preservation-proposal.json', JSON.stringify(proposal, null, 2) + '\n');
writeFileSync('docs/v2/2.0.3-callback-preservation-fingerprints.json', JSON.stringify(review, null, 2) + '\n');
console.log(JSON.stringify(review, null, 2));
