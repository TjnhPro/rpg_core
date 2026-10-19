import {expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync} from 'node:fs';
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

it('accepts an empty Kernel and the actual Legacy tree, root barrel and historical forwarders', () => {
  function readTree(dir: string): Record<string, string> {
    return Object.assign({}, ...readdirSync(dir, {withFileTypes: true}).map(entry => {
      const file = `${dir}/${entry.name}`;
      return entry.isDirectory() ? readTree(file) : {[file]: readFileSync(file, 'utf8')};
    }));
  }
  expect(audit({'src/kernel/index.ts': 'export {};'}).status).toBe(0);
  const result = audit(readTree('src'), JSON.parse(readFileSync('docs/module-map.json', 'utf8')));
  expect(result.status, result.output).toBe(0);
});

it('accepts Kernel-only imports, type imports and re-exports from nested modules', () => {
  const result = audit({
    'src/kernel/index.ts': "export {value} from './internal/numbers.js'; export type {Scalar} from './internal/numbers.js';",
    'src/kernel/internal/numbers.ts': 'export const value = 1; export type Scalar = number;',
    'src/kernel/nested/use.ts': "import {value} from '../internal/numbers.js'; import type {Scalar} from '../internal/numbers.js'; export const result: Scalar = value;",
  });
  expect(result.status, result.output).toBe(0);
});

it.each(['stats', 'modifiers', 'damage', 'combat', 'effects', 'skills', 'mechanics', 'spatial'])(
  'permits %s to depend on Kernel without opening any other Legacy edge', domain => {
    const result = audit({
      'src/kernel/index.ts': 'export const numericInput = 1;',
      [`src/${domain}/adapter.ts`]: "import {numericInput} from '../kernel/index.js'; export const adapted = numericInput;",
    });
    expect(result.status, result.output).toBe(0);
  },
);

// Every target exists and is independently accepted by the same real checker.
// Run each syntax at the public barrel and below nested directories.
const kernelForbiddenEdges = [
  ['Damage runtime import', 'damage', "import {value} from 'TARGET';"],
  ['side-effect import', 'damage', "import 'TARGET';"],
  ['empty named import', 'damage', "import {} from 'TARGET';"],
  ['Stats type import', 'stats', "import type {Context} from 'TARGET';"],
  ['inline type import', 'stats', "import {type Context} from 'TARGET';"],
  ['Legacy Contracts import', 'contracts', "import type {Context} from 'TARGET';"],
  ['Skills import', 'skills', "import {value} from 'TARGET';"],
  ['Mechanics import', 'mechanics', "import {value} from 'TARGET';"],
  ['Spatial import', 'spatial', "import {value} from 'TARGET';"],
  ['Combat import', 'combat', "import {value} from 'TARGET';"],
  ['Effects import', 'effects', "import {value} from 'TARGET';"],
  ['wildcard re-export', 'skills', "export * from 'TARGET';"],
  ['named re-export', 'damage', "export {value} from 'TARGET';"],
  ['namespace re-export', 'skills', "export * as legacy from 'TARGET';"],
  ['type re-export', 'contracts', "export type {Context} from 'TARGET';"],
  ['inline type re-export', 'contracts', "export {type Context} from 'TARGET';"],
  ['import type expression', 'contracts', "export type Hidden = import('TARGET').Context;"],
  ['typeof import expression', 'damage', "export type Hidden = typeof import('TARGET');"],
  ['dynamic import', 'mechanics', "export const load = () => import('TARGET');"],
  ['require', 'mechanics', "export const load = () => require('TARGET');"],
  ['import-equals', 'skills', "import legacy = require('TARGET');"],
  ['type import-equals', 'contracts', "import type legacy = require('TARGET');"],
] as const;

for (const importer of ['src/kernel/index.ts', 'src/kernel/internal/deep/bridge.ts']) {
  it.each(kernelForbiddenEdges)(`rejects %s at ${importer}`, (_label, domain, source) => {
    const target = `src/${domain}/target.ts`;
    const targets = {[target]: 'export const value = 1; export type Context = number;'};
    const valid = audit(targets);
    expect(valid.status, valid.output).toBe(0);
    const spec = path.posix.relative(path.posix.dirname(importer), target).replace(/\.ts$/, '.js');
    const result = audit({...targets, [importer]: source.replace('TARGET', spec)});
    expect(result.status).not.toBeNull();
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(`${importer}: forbidden dependency ${target}`);
    expect(result.output).not.toContain('invalid/cross-repository import');
  });

  it(`rejects a root-barrel route to Legacy Contracts at ${importer}`, () => {
    const targets = {
      'src/index.ts': "export * from './contracts/target.js';",
      'src/contracts/target.ts': 'export type GameplayEntity = {skillId: string};',
    };
    expect(audit(targets).status).toBe(0);
    const spec = path.posix.relative(path.posix.dirname(importer), 'src/index.ts').replace(/\.ts$/, '.js');
    const result = audit({...targets, [importer]: `export * from '${spec}';`});
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(`${importer}: forbidden dependency src/index.ts`);
  });
}

it.each([
  "import 'node:fs';", "import 'some-package';", "export * from 'some-package';",
  "import type {External} from 'some-package';", "export type External = import('some-package').Value;",
  "export const load = () => import('node:fs');", "export const load = () => require('node:fs');",
  "import fs = require('node:fs');",
])('rejects external dependencies from nested Kernel: %s', source => {
  const result = audit({'src/kernel/internal/deep/external.ts': source});
  expect(result.status).not.toBe(0);
  expect(result.output).toContain('src/kernel/internal/deep/external.ts: external dependency');
});

it('rejects nonliteral loading, invalid paths and runtime cycles within Kernel', () => {
  const dynamic = audit({'src/kernel/index.ts': 'export const load = (name: string) => import(name);'});
  expect(dynamic.status).not.toBe(0); expect(dynamic.output).toContain('nonliteral dependency');
  const invalid = audit({'src/kernel/index.ts': "import './missing.js';"});
  expect(invalid.status).not.toBe(0); expect(invalid.output).toContain('invalid/cross-repository import');
  const cycle = audit({'src/kernel/a.ts': "import './b.js';", 'src/kernel/b.ts': "import './a.js';"});
  expect(cycle.status).not.toBe(0); expect(cycle.output).toContain('Runtime import cycle');
});

it('retains unknown-domain rejection, the Contracts policy and existing forbidden Legacy edges', () => {
  const unknown = audit({'src/unregistered/a.ts': 'export {};'});
  expect(unknown.status).not.toBe(0); expect(unknown.output).toContain('unknown domain');
  const contracts = audit({'src/contracts/a.ts': "import '../kernel/index.js';", 'src/kernel/index.ts': 'export {};'});
  expect(contracts.status).not.toBe(0); expect(contracts.output).toContain('forbidden dependency src/kernel/index.ts');
  const legacy = audit({'src/stats/a.ts': "import '../skills/b.js';", 'src/skills/b.ts': 'export {};'});
  expect(legacy.status).not.toBe(0); expect(legacy.output).toContain('forbidden dependency src/skills/b.ts');
});
