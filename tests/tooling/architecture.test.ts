import {expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

// Run the real checker against isolated adversarial trees; never mutate repository source.
function audit(files: Record<string, string>, map: Record<string, string> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'rpg-core-architecture-'));
  try {
    for (const [file, source] of Object.entries({'docs/module-map.json': JSON.stringify(map), ...files})) {
      const target = path.join(root, file); mkdirSync(path.dirname(target), {recursive: true}); writeFileSync(target, source);
    }
    const result = spawnSync(process.execPath, [path.resolve('scripts/check-architecture.mjs'), root], {encoding: 'utf8'});
    if (result.error) throw result.error;
    return {status: result.status, output: result.stdout + result.stderr};
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}

it('accepts type-only cycles but rejects runtime cycles, including empty named imports', () => {
  expect(audit({'src/contracts/a.ts': "import type {B} from './b.js'; export type A = B;",
    'src/contracts/b.ts': "import type {A} from './a.js'; export type B = A;"}).status).toBe(0);
  const runtime = audit({'src/contracts/a.ts': "import {} from './b.js';",
    'src/contracts/b.ts': "import {} from './a.js';"});
  expect(runtime.status).not.toBe(0); expect(runtime.output).toContain('Runtime import cycle');
});

it('checks forbidden edges in dynamic imports and type queries, not just top-level declarations', () => {
  for (const source of ["export const f = () => import('../skills/b.js');",
    "export type A = import('../skills/b.js').B;"]) {
    const result = audit({'src/stats/a.ts': source, 'src/skills/b.ts': 'export type B = number;'});
    expect(result.status).not.toBe(0); expect(result.output).toContain('forbidden dependency');
  }
});

it('rejects external and nonliteral module loading through every supported syntax', () => {
  for (const source of ["import 'node:fs';", "export const f = () => import('node:fs');",
    "import fs = require('node:fs');", "export const f = () => require('node:fs');"]) {
    const result = audit({'src/stats/a.ts': source});
    expect(result.status).not.toBe(0); expect(result.output).toContain('external dependency');
  }
  const result = audit({'src/stats/a.ts': 'export const f = (name: string) => import(name);'});
  expect(result.status).not.toBe(0); expect(result.output).toContain('nonliteral dependency');
});

it('rejects copied canonical implementations and unregistered legacy implementations', () => {
  const copy = audit({'src/stats/a.ts': 'export const calculate = () => 1;',
    'src/stats/b.ts': '// duplicate\nexport const calculate = () => 1;'});
  expect(copy.status).not.toBe(0); expect(copy.output).toContain('duplicate canonical');
  const rogue = audit({'src/shared/game/rogue.ts': 'export const calculate = () => 1;'});
  expect(rogue.status).not.toBe(0); expect(rogue.output).toContain('Unregistered legacy source');
});

it('requires registered legacy paths to contain only the canonical forwarder', () => {
  const map = {'src/shared/game/a.ts': 'src/stats/a.ts'};
  const result = audit({'src/stats/a.ts': 'export const a = 1;',
    'src/shared/game/a.ts': "export * from '../../stats/a.js'; export const other = 2;"}, map);
  expect(result.status).not.toBe(0); expect(result.output).toContain('must remain a forwarder');
});
