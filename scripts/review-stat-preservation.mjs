// Produces review artifacts only. NEVER updates the authoritative baseline.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {behaviorFingerprint} from './behavior-fingerprint.mjs';

const revision = 'a05439ec504b759df48d3345eea199fecf08083f';
const baselineText = readFileSync('docs/behavior-baseline.json', 'utf8');
assert.equal(baselineText, execFileSync('git', ['show', `${revision}:docs/behavior-baseline.json`], {encoding: 'utf8'}), 'Authoritative baseline must remain untouched');
const baseline = JSON.parse(baselineText);
const index = baseline.modules.findIndex(e => e.originalFile === 'src/shared/game/stat-calculation.ts');
assert(index >= 0);
const beforeEntry = baseline.modules[index];
const legacy = 'src/stats/stat-calculation.ts', kernel = 'src/kernel/stats/stat-calculation.ts';
function functions(source) {
  const ast = ts.createSourceFile('stats.ts', source, ts.ScriptTarget.Latest, true);
  return Object.fromEntries(ast.statements.filter(ts.isFunctionDeclaration).map(n => [n.name.text, behaviorFingerprint(n.getText(ast))[0]]));
}
const before = functions(execFileSync('git', ['show', `${revision}:${legacy}`], {encoding: 'utf8'}));
const after = functions(readFileSync(legacy, 'utf8')), added = functions(readFileSync(kernel, 'utf8'));
assert.equal(after.updateCurrentResources, before.updateCurrentResources);
for (const entry of baseline.modules) {
  if (entry === beforeEntry) continue;
  assert.deepEqual(entry.currentFiles.flatMap(f => behaviorFingerprint(readFileSync(f, 'utf8'))).sort(), entry.declarations, `Unrelated preservation entry changed: ${entry.originalFile}`);
}
assert.equal(readFileSync('src/modifiers/modifier-core.ts', 'utf8').replaceAll('\r\n', '\n'), execFileSync('git', ['show', `${revision}:src/modifiers/modifier-core.ts`], {encoding: 'utf8'}).replaceAll('\r\n', '\n'));
const declarations = [legacy, kernel].flatMap(f => behaviorFingerprint(readFileSync(f, 'utf8'))).sort();
const amendment = {
  checkpoint: 'v2.0.3', baseCommit: revision,
  authority: 'PENDING Developer approval of exact preservation delta; docs/v2/2.0.3-attribute-stat-extraction.md',
  declarations: [
    ...['cooldownDurationMs', 'calculateEffectiveStat', 'resolveCharacterStats'].map(name => ({name, before: before[name], after: after[name]})),
    ...Object.entries(added).map(([name, after]) => ({name, after})),
  ],
};
const prefix = `/modules/${index}`;
const patch = [
  {op: 'test', path: prefix, value: beforeEntry},
  {op: 'replace', path: `${prefix}/currentFiles`, value: [legacy, kernel]},
  {op: 'replace', path: `${prefix}/declarations`, value: declarations},
  {op: 'add', path: `${prefix}/approvedChange`, value: amendment},
];
const review = {status: 'PENDING_PRESERVATION_APPROVAL', revision, baselineSha256: createHash('sha256').update(baselineText).digest('hex'), moduleIndex: index, before, after, kernel: added, unrelatedModulesUnchanged: 26, modifierSourceUnchanged: true, resourceDeclarationUnchanged: true, proposedDeclarations: declarations.length};
writeFileSync('docs/v2/2.0.3-preservation-proposal.json', JSON.stringify(patch, null, 2) + '\n');
writeFileSync('docs/v2/2.0.3-preservation-fingerprints.json', JSON.stringify(review, null, 2) + '\n');
console.log(JSON.stringify(review, null, 2));
