import {expect, it} from 'vitest';
import ts from 'typescript';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
// @ts-expect-error Repository tooling is JavaScript; exercise its actual export.
import {checkDeclarationClosure} from '../../scripts/check-architecture.mjs';

function fixture(files: Record<string, string>, run: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), 'rpg-kernel-declarations-'));
  try {
    for (const [file, text] of Object.entries({'docs/module-map.json': '{}', ...files})) {
      const target = path.join(root, file);
      mkdirSync(path.dirname(target), {recursive: true});
      writeFileSync(target, text);
    }
    run(root);
  } finally { rmSync(root, {recursive: true, force: true}); }
}

const leaks = [
  ['Hit probability policy', "import type {Legacy} from 'TARGET'; export interface Public {readonly rule: {readonly bounds: Legacy}}"],
  ['Critical lazy roll result', "import type {Legacy} from 'TARGET'; export interface Public {readonly roll: number | (() => Legacy)}"],
  ['Mitigation numerical diagnostic', "import type {Legacy} from 'TARGET'; export interface Public {readonly effectiveK: Legacy | null}"],
  ['B0 flat callback result', "import type {Legacy} from 'TARGET'; export interface Public {readonly resolveFlat: () => Legacy}"],
  ['B0 source accessor', "import type {Legacy} from 'TARGET'; export interface Public {readonly sourceValue: (source: Legacy) => number}"],
  ['B0 result scaling', "import type {Legacy} from 'TARGET'; export interface Public {scaling: {source: Legacy; value: number}[]}"],
  ['modifier accessor payload', "import type {Legacy} from 'TARGET'; export interface Public<M = number> {readonly identity: (input: M) => Legacy}"],
  ['prepared contribution generic', "import type {Legacy} from 'TARGET'; export interface Public<M = Legacy> {readonly contributions: M[]}"],
  ['source membership payload', "import type {Legacy} from 'TARGET'; export interface Public {readonly instances: ReadonlyMap<string, ReadonlySet<Legacy>>}"],
  ['type import', "import type {Legacy} from 'TARGET'; export type Public = Legacy;"],
  ['type re-export', "export type {Legacy as Public} from 'TARGET';"],
  ['star forwarding', "export * from 'TARGET';"],
  ['indirect supporting alias', "import type {Legacy} from 'TARGET'; type Hidden = Legacy; export interface Public {value: Hidden}"],
  ['interface heritage', "import type {Legacy} from 'TARGET'; export interface Public extends Legacy {readonly extra?: number}"],
  ['generic constraint', "import type {Legacy} from 'TARGET'; export interface Public<T extends Legacy> {readonly value: T}"],
  ['unused generic default', "import type {Legacy} from 'TARGET'; export interface Public<T = Legacy> {readonly n: number}"],
  ['type query', "import {value} from 'TARGET'; export type Public = typeof value;"],
  ['import type expression', "export type Public = import('TARGET').Legacy;"],
  ['namespace query', "export type Public = typeof import('TARGET');"],
  ['namespace import', "import type * as legacy from 'TARGET'; export type Public = legacy.Legacy;"],
  ['mapped generic support', "import type {Legacy} from 'TARGET'; type Hidden<T> = {readonly [K in keyof T]: T[K]}; export type Public = Hidden<Legacy>;"],
] as const;

for (const phase of ['source', 'emitted'] as const) {
  const dir = phase === 'source' ? 'src' : 'dist';
  const ext = phase === 'source' ? '.ts' : '.d.ts';
  function check(root: string) {
    const entry = path.join(root, `${dir}/kernel/index${ext}`);
    const program = ts.createProgram([entry], {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [], strict: true,
      exactOptionalPropertyTypes: true, skipLibCheck: false, noEmit: true,
    });
    return checkDeclarationClosure(program, entry, path.join(root, `${dir}/kernel`), phase);
  }
  it(`${phase}: accepts internal recursive supports, constraints, defaults and standard library types`, () => {
    fixture({
      [`${dir}/kernel/index${ext}`]: "export type {Public} from './nested/input.js';",
      [`${dir}/kernel/nested/input${ext}`]: 'interface Node {readonly value: number; readonly next?: Node} export interface Public<T extends Node = Node> {readonly values: Readonly<Record<string, T>>}',
    }, root => {
      const result = check(root);
      expect(result.exports).toBe(1); expect(result.files).toHaveLength(2);
    });
  });
  for (const location of ['index', 'nested/deep/input']) {
    it.each(leaks)(`${phase}, ${location}: rejects %s through the actual declaration gate`, (_name, code) => {
      const target = `${dir}/contracts/legacy${ext}`;
      const importer = `${dir}/kernel/${location}${ext}`;
      const spec = path.posix.relative(path.posix.dirname(importer), target).replace(/(?:\.d)?\.ts$/, '.js');
      const base = {
        [`${dir}/kernel/index${ext}`]: location === 'index' ? 'export type Public = number;' : `export * from './${location}.js';`,
        ...(location === 'index' ? {} : {[importer]: 'export type Public = number;'}),
        [target]: 'export interface Legacy {readonly entityId: string} export declare const value: Legacy;',
      };
      fixture(base, root => expect(check(root).exports).toBe(1));
      fixture({...base, [importer]: code.replaceAll('TARGET', spec)}, root => {
        expect(() => check(root)).toThrow(`Kernel ${phase} declaration closure:`);
        try { check(root); } catch (error) {
          expect(String(error)).toContain('forbidden declaration');
          expect(String(error).replaceAll('\\', '/')).toContain(target);
          expect(String(error)).not.toContain('Cannot find module');
        }
      });
    }, 20_000);
  }
  it(`${phase}: rejects unresolved public references`, () => {
    fixture({[`${dir}/kernel/index${ext}`]: 'export interface Public {readonly value: MissingType}'}, root => {
      expect(() => check(root)).toThrow('Cannot find name');
    });
  });
  it(`${phase}: accepts Kernel-only accessor/result/source contracts`, () => {
    fixture({
      [`${dir}/kernel/index${ext}`]: "export type {Adapter, Result, Sources} from './nested/contracts.js';",
      [`${dir}/kernel/nested/contracts${ext}`]: 'export interface Adapter<M> {readonly identity: (input: M) => string} export interface Result<M = number> {readonly contributions: M[]} export interface Sources {readonly instances: ReadonlyMap<string, ReadonlySet<string>>}',
    }, root => {expect(check(root).exports).toBe(3); expect(check(root).files).toHaveLength(2);});
  });
  it(`${phase}: accepts generic B0 callback and mutable breakdown contracts`, () => {
    fixture({
      [`${dir}/kernel/index${ext}`]: "export type {Input, Result} from './nested/damage.js';",
      [`${dir}/kernel/nested/damage${ext}`]: 'export interface Input<S extends string = string> {readonly sourceOrder: readonly S[]; readonly sourceValue: (source:S) => number; readonly resolveFlat: () => {readonly definition:number;readonly additional:number;readonly resolved:number}} export interface Result<S extends string = string> {scaling: {source:S;value:number}[]; raw:number}',
    }, root => {expect(check(root).exports).toBe(2); expect(check(root).files).toHaveLength(2);});
  });
  it(`${phase}: accepts Kernel-only probability and generic rating declarations`, () => {
    fixture({
      [`${dir}/kernel/index${ext}`]: "export type {Input, Result} from './nested/defense.js';",
      [`${dir}/kernel/nested/defense${ext}`]: 'interface Rule {readonly enabled:boolean;readonly bounds:{readonly min?:number;readonly max?:number}} export interface Input<K extends string=string> {readonly ruleKey:K;readonly rule:Rule;readonly roll:number|(()=>number)} export interface Result<K extends string=string> {readonly ruleKey:K;readonly missing:readonly string[];readonly effectiveK:number|null}',
    }, root => {expect(check(root).exports).toBe(2);expect(check(root).files).toHaveLength(2);});
  });
}

it.each(['DamageContext','DefenseSettings','CombatEntity','SkillMechanics'])('rejects deep Defense %s aliases through the actual checker', name => {
  const base={
    'src/kernel/index.ts': "export type {Public} from './nested/deep/defense.js';",
    'src/kernel/nested/deep/defense.ts': 'export interface Public {readonly rule:number}',
    'src/kernel/support.ts': 'export type Hidden=number;',
    'src/contracts/legacy.ts': `export interface ${name} {readonly marker:number}`,
  };
  const cli=(root:string)=>spawnSync(process.execPath,[path.resolve('scripts/check-architecture.mjs'),root],{encoding:'utf8'});
  fixture(base,root=>{const r=cli(root);expect(r.status,r.stdout+r.stderr).toBe(0);expect(r.stdout).toContain('"emitted"');});
  fixture({...base,'src/kernel/nested/deep/defense.ts':"import type {Hidden} from '../../support.js';export interface Public {readonly rule:Hidden}",'src/kernel/support.ts':`export type {${name} as Hidden} from '../contracts/legacy.js';`},root=>{
    const r=cli(root);expect(r.status).not.toBe(0);expect(r.stdout+r.stderr).toContain('forbidden declaration');expect(r.stdout+r.stderr).not.toContain('Cannot find module');
  });
},20_000);

it.each(['Damage', 'Defense', 'Entity', 'Skill'])('rejects deep B0 %s leakage through a valid transitive alias', name => {
  fixture({
    'src/kernel/index.ts': "export type {Public} from './nested/deep/input.js';",
    'src/kernel/nested/deep/input.ts': "import type {Hidden} from '../../support.js'; export interface Public {readonly resolveFlat: () => Hidden}",
    'src/kernel/support.ts': `export type {${name} as Hidden} from '../contracts/legacy.js';`,
    'src/contracts/legacy.ts': `export interface ${name} {readonly marker:number}`,
  }, root => {
    const result = spawnSync(process.execPath, [path.resolve('scripts/check-architecture.mjs'), root], {encoding:'utf8'});
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('forbidden declaration');
    expect(result.stdout + result.stderr).not.toContain('Cannot find module');
  });
}, 20_000);

it.each(leaks)('CLI source/emit pipeline rejects %s for declaration boundary, with a valid existing target', (_name, code) => {
  const base = {
    'src/kernel/index.ts': "export * from './nested/deep/input.js';",
    'src/kernel/nested/deep/input.ts': 'export type Public = number;',
    'src/contracts/legacy.ts': 'export interface Legacy {readonly entityId: string} export declare const value: Legacy;',
  };
  function cli(root: string) {
    const result = spawnSync(process.execPath, [path.resolve('scripts/check-architecture.mjs'), root], {encoding: 'utf8'});
    if (result.error) throw result.error;
    return {status: result.status, output: result.stdout + result.stderr};
  }
  fixture(base, root => {
    const result = cli(root); expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('"emitted"');
  });
  fixture({...base, 'src/kernel/nested/deep/input.ts': code.replaceAll('TARGET', '../../../contracts/legacy.js')}, root => {
    const result = cli(root); expect(result.status).not.toBe(0);
    expect(result.output).toContain('Kernel source declaration closure:');
    expect(result.output).toContain('forbidden declaration');
    expect(result.output).not.toContain('Cannot find module');
  });
}, 20_000);
