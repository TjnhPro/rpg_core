import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run through npm run test:consumer');
const scratch = mkdtempSync(path.join(tmpdir(), 'rpg-core-consumer-'));
assert(!path.relative(root, scratch).startsWith('src'), 'Consumer must be outside source');
assert(path.relative(root, scratch).startsWith('..') || path.isAbsolute(path.relative(root, scratch)), 'Consumer must be outside repository');
function npm(args, cwd = root) {
  return execFileSync(process.execPath, [npmCli, ...args], {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
}
try {
  // npm pack runs prepack, rebuilding the archive from the canonical source.
  const packed = JSON.parse(npm(['pack', '--json', '--silent', '--pack-destination', scratch]));
  // npm 12 returns a name-keyed object; npm 10/11 return an array.
  const artifact = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
  assert(artifact, 'npm pack did not produce an archive');
  const archive = path.join(scratch, artifact.filename);
  const members = artifact.files.map(f => f.path);
  const moduleMap = JSON.parse(readFileSync(path.join(root, 'docs/module-map.json'), 'utf8'));
  for (const legacy of Object.keys(moduleMap)) {
    for (const extension of ['.js', '.d.ts']) assert(members.includes(`dist/${legacy.replace(/\.ts$/, extension)}`), `Missing archived legacy path: ${legacy}${extension}`);
  }
  assert(members.includes('dist/index.js') && members.includes('dist/index.d.ts'));
  assert(!members.some(f => /^(src|tests|examples|node_modules|\.example-dist)\//.test(f)));
  const consumer = path.join(scratch, 'consumer');
  mkdirSync(consumer);
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({name: 'external-core-consumer', private: true, type: 'module'}));
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', archive, `typescript@${pkg.devDependencies.typescript}`], consumer);
  // Same real combat/skill example, copied as consumer-owned source. Every Core
  // import is a package import; no links, original paths or ambient Node types.
  const example = readFileSync(path.join(root, 'examples/headless.ts'), 'utf8');
  assert(!/from ['"]\./.test(example));
  writeFileSync(path.join(consumer, 'headless.ts'), example);
  // Repository-relative compatibility paths are deliberately not package exports.
  // Check their declarations and runtime identities in the installed archive too.
  const legacyImports = Object.keys(moduleMap).map((file, i) =>
    `import * as legacy${i} from './node_modules/@rpg/core/dist/${file.replace(/\.ts$/, '.js')}';`);
  writeFileSync(path.join(consumer, 'legacy.ts'), `${legacyImports.join('\n')}\nexport const legacyApis = [${legacyImports.map((_, i) => `legacy${i}`).join(',')}];\n`);
  writeFileSync(path.join(consumer, 'types.ts'), `
import type {CombatEntity, PlayerStatsConfig, DamageContext, MapPoint} from '@rpg/core/contracts';
import {resolveCharacterStats} from '@rpg/core/stats';
import {executeSkill} from '@rpg/core/skills';
import {EffectLifecycle} from '@rpg/core/effects';
import {calculateDamage} from '@rpg/core/damage';
import {validateCombatAction} from '@rpg/core/combat';
import {collectActiveModifiers} from '@rpg/core/modifiers';
import {detectMeleeHitbox} from '@rpg/core/mechanics';
import {canTraverse} from '@rpg/core/spatial';
export type IntegrationContracts = [CombatEntity, PlayerStatsConfig, DamageContext, MapPoint];
export const api = [resolveCharacterStats, executeSkill, EffectLifecycle, calculateDamage, validateCombatAction, collectActiveModifiers, detectMeleeHitbox, canTraverse];
// @ts-expect-error implementation deep imports are intentionally not exported
import {executeSkill as internal} from '@rpg/core/skills/skill-execution.js';
`);
  writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
    exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, skipLibCheck: false,
    types: [], lib: ['ES2022', 'DOM'], outDir: 'build',
  }, include: ['*.ts']}));
  execFileSync(process.execPath, [path.join(consumer, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], {cwd: consumer, stdio: 'pipe'});
  writeFileSync(path.join(consumer, 'run.mjs'), `
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as core from '@rpg/core';
import {headlessCombat} from './build/headless.js';
const a = headlessCombat(73), b = headlessCombat(73);
assert.deepEqual(a, b);
assert.equal(a.entities[1].currentHp, 70);
assert.equal(createHash('sha256').update(JSON.stringify(a)).digest('hex'), '29e8dbe79332a34a6760628aebfa157e5788a5750038183de558310fa9102656');
const domains = ${JSON.stringify(Object.keys(pkg.exports).filter(k => k !== '.').map(k => k.slice(2)))};
for (const domain of domains) {
  const api = await import('@rpg/core/' + domain);
  for (const [name, value] of Object.entries(api)) assert.equal(value, core[name]);
}
const moduleMap = ${JSON.stringify(moduleMap)};
for (const [legacy, canonical] of Object.entries(moduleMap)) {
  const a = await import('./node_modules/@rpg/core/dist/' + legacy.replace(/\\.ts$/, '.js'));
  const b = await import('./node_modules/@rpg/core/' + canonical.replace(/^src\\//, 'dist/').replace(/\\.ts$/, '.js'));
  assert.deepEqual(a, b);
}
for (const internal of ['@rpg/core/skills/skill-execution.js', '@rpg/core/dist/index.js', '@rpg/core/shared/game/skill-execution.js']) {
  await assert.rejects(import(internal), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
}
for (const helper of ['freezeGameplayData', 'random', 'damageBonusReason', 'tickProjectileBodies', 'debugProjectile']) assert(!(helper in core));
console.log(JSON.stringify({status: 'PASS', targetHp: a.entities[1].currentHp, deterministic: true, types: true, publicDomains: domains.length, legacyPaths: Object.keys(moduleMap).length, deepImportsBlocked: true}));
`);
  const result = execFileSync(process.execPath, ['run.mjs'], {cwd: consumer, encoding: 'utf8'});
  console.log(result.trim());
  console.log(`Archive installed into external temporary consumer: ${consumer}`);
} catch (error) {
  if (error.stdout) console.error(error.stdout.toString());
  if (error.stderr) console.error(error.stderr.toString());
  throw error;
} finally {
  // Only this invocation's mkdtemp directory; never a repository/source path.
  rmSync(scratch, {recursive: true, force: true});
}
