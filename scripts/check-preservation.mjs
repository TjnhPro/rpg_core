import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {behaviorFingerprint} from './behavior-fingerprint.mjs';

const root = new URL('../', import.meta.url);
const baseline = JSON.parse(readFileSync(new URL('docs/behavior-baseline.json', root), 'utf8'));
for (const entry of baseline.modules) {
  const current = entry.currentFiles.flatMap(file => behaviorFingerprint(readFileSync(new URL(file, root), 'utf8'))).sort();
  assert.deepEqual(current, entry.declarations, `Declaration changed relative to ${baseline.reviewedCommit}: ${entry.originalFile}`);
  const source = readFileSync(new URL(entry.originalFile, root), 'utf8');
  const expected = path.posix.relative(path.posix.dirname(entry.originalFile), entry.currentFiles[0]).replace(/\.ts$/, '.js');
  assert.equal(source.trim(), `/** @deprecated Import from @rpg/core or a public domain entrypoint. */\nexport * from '${expected}';`);
  const canonical = await import(new URL(entry.currentFiles[0].replace(/^src\//, 'dist/').replace(/\.ts$/, '.js'), root));
  const legacy = await import(new URL(`dist/${entry.originalFile.replace(/\.ts$/, '.js')}`, root));
  assert.deepEqual(legacy, canonical, `Legacy compiled import changed: ${entry.originalFile}`);
}
console.log(JSON.stringify({status: 'PASS', reviewedCommit: baseline.reviewedCommit, modules: baseline.modules.length, declarationsUnchanged: true}));
