import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';

it('fingerprints LF/CRLF equally while preserving literal, formula and validation changes',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',[
  "import assert from 'node:assert/strict';",
  "import {behaviorFingerprint as fingerprint} from './scripts/behavior-fingerprint.mjs';",
  'const source="export function emit(id) {\\n if (!id) throw Error(\'invalid\');\\n return `id:${id}/bullet`;\\n}";',
  "assert.deepEqual(fingerprint(source),fingerprint(source.replace(/\\n/g,'\\r\\n')));",
  'const multiline="export const text = `a\\nb`;";',
  "assert.deepEqual(fingerprint(multiline),fingerprint(multiline.replace(/\\n/g,'\\r\\n')));",
  "for (const changed of [source.replace('/bullet','/other'),source.replace('!id','id'),source.replace('${id}','${id+1}')]) assert.notDeepEqual(fingerprint(source),fingerprint(changed));",
  'assert.notDeepEqual(fingerprint(String.raw`export const text = "\\r\\n";`),fingerprint(String.raw`export const text = "\\n";`));',
 ].join('\n')],{encoding:'utf8'});
 expect(result.error).toBeUndefined();
 expect(result.stdout+result.stderr).toBe('');
 expect(result.status).toBe(0);
});
