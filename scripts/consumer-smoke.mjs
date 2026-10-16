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
  writeFileSync(path.join(consumer, 'root-snapshot.ts'), readFileSync(path.join(root, 'examples/root-snapshot.ts'), 'utf8'));
  writeFileSync(path.join(consumer, 'skill-instance.ts'), readFileSync(path.join(root, 'examples/skill-instance.ts'), 'utf8'));
  writeFileSync(path.join(consumer, 'skill-trigger.ts'), readFileSync(path.join(root, 'examples/skill-trigger.ts'), 'utf8'));
  writeFileSync(path.join(consumer, 'nested-composition.ts'), readFileSync(path.join(root, 'examples/nested-composition.ts'), 'utf8'));
  writeFileSync(path.join(consumer, 'stack-consumption.ts'), readFileSync(path.join(root, 'examples/stack-consumption.ts'), 'utf8'));
  writeFileSync(path.join(consumer, 'conditional-triggers.ts'), readFileSync(path.join(root, 'examples/conditional-triggers.ts'), 'utf8'));
  writeFileSync(path.join(consumer, 'skill-upgrades.ts'), readFileSync(path.join(root, 'examples/skill-upgrades.ts'), 'utf8'));
  writeFileSync(path.join(consumer, 'healing.ts'), readFileSync(path.join(root, 'examples/healing.ts'), 'utf8'));
  writeFileSync(path.join(consumer, 'lifesteal.ts'), readFileSync(path.join(root, 'examples/lifesteal.ts'), 'utf8'));
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
import {rootSnapshotExample} from './build/root-snapshot.js';
import {skillInstanceExample} from './build/skill-instance.js';
import {skillTriggerExample} from './build/skill-trigger.js';
import {nestedCompositionExample} from './build/nested-composition.js';
import {stackConsumptionExample} from './build/stack-consumption.js';
import {conditionalTriggersExample} from './build/conditional-triggers.js';
import {skillUpgradesExample} from './build/skill-upgrades.js';
import {healingExample} from './build/healing.js';
import {lifestealExample} from './build/lifesteal.js';
const lifesteal=lifestealExample();
assert.deepEqual(lifesteal,{sourceHp:55,targetHp:80,appliedDamage:20,healing:[{type:'healing-applied',entityId:'source',atMs:0,before:50,after:55,appliedHealing:5}],captures:1,mp:95,actionSerial:1,replay:false});
console.log(JSON.stringify({status:'LIFESTEAL_VERIFIED',...lifesteal}));
const healing=healingExample();
assert.deepEqual(healing,{primitive:{before:90,after:100,appliedHealing:10},targetHp:100,sourceHp:100,events:[{type:'healing-applied',entityId:'ally',atMs:0,before:90,after:100,appliedHealing:10},{type:'healing-applied',entityId:'source',atMs:100,before:50,after:100,appliedHealing:50}],captures:1,rolls:0,mp:95,actionSerial:1,cooldown:1000,children:1,sharedS0:true,duplicate:false});
console.log(JSON.stringify({status:'HEALING_VERIFIED',...healing}));
const upgrades=skillUpgradesExample();
assert.deepEqual(upgrades.old,{revision:'v1',projectiles:1,hp:980,captures:1,mp:95});
assert.deepEqual(upgrades.upgraded,{revision:'v2',projectiles:3,hp:940,captures:1,mp:95});
assert.deepEqual(upgrades.oldAgain,upgrades.old);
console.log(JSON.stringify({status:'UPGRADES_VERIFIED',...upgrades}));
const conditional=conditionalTriggersExample();
assert.deepEqual(conditional,{consumed:3,selected:['["source",1]','["source",2]','["source",3]'],remaining:0,damage:20,bonus:0,hp:980,captures:1,mp:95,rolls:1,children:1,sharedS0:true});
console.log(JSON.stringify({status:'CONDITIONAL_TRIGGERS_VERIFIED',...conditional}));
const stacks2=stackConsumptionExample(2),stacks3=stackConsumptionExample(3),stackChild=stackConsumptionExample(3,true);
assert.deepEqual(stacks2,{consumed:2,selected:['["source",1]','["source",2]'],remaining:1,damage:34,bonus:14,hp:966,captures:1,mp:95,rolls:1,children:0,sharedS0:true});
assert.deepEqual(stacks3,{consumed:3,selected:['["source",1]','["source",2]','["source",3]'],remaining:0,damage:41,bonus:21,hp:959,captures:1,mp:95,rolls:1,children:0,sharedS0:true});
assert.deepEqual(stackChild,{...stacks3,hp:939,rolls:2,children:1});
console.log(JSON.stringify({status:'STACK_CONSUMPTION_VERIFIED',stacks2,stacks3,stackChild}));
const nested=nestedCompositionExample();
assert.deepEqual(nested,{instances:3,sharedS0:true,bHits:1,cHits:4,radialDirections:4,targetHp:615,captures:1,mp:95,actionSerial:1,cooldownUnchanged:true,actionCompleted:true,intents:2});
console.log(JSON.stringify({status:'NESTED_SKILL_EXECUTION_VERIFIED',...nested}));
assert.deepEqual(skillTriggerExample(), {intents:1,status:'expired',executeAtMs:110,replay:true,forged:false,disposed:false,captures:1,mp:95});
assert.deepEqual(skillInstanceExample(), {root:'finished',child:'active',grandchild:'pending',sharedSnapshot:true,sharedPin:true,captures:1,mp:95});
assert.deepEqual(rootSnapshotExample(), {b:20,c:60,captures:1,mp:95,configVersion:'content-v1'});
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
for (const helper of ['lifesteal', 'skillHealingEntities', 'heal', 'isPinnedSkillTriggerBundle', 'observesSkillConditionalHit', 'observesSkillStackApply', 'captureSkillHit', 'captureSkillStackApply', 'skillStackCount', 'skillEffectWork', 'consumeStackEffect', 'registerTriggeredSkillChildren', 'childInstanceDamage', 'assembleRootDamage', 'admitSkillProjectiles', 'recordSkillProjectile', 'pendingSkillTriggerPayload', 'childDispatcher', 'initializeSkillTriggerSession', 'captureSkillExpiry', 'captureSkillImpact', 'drainSkillTriggers', 'bindRootSkillTriggers', 'trustSkillInstanceDefinition', 'initializeSkillInstances', 'bindRootSkillInstance', 'advanceSkillInstances', 'disposeSkillInstances', 'prepareRootOffense', 'bindRootOffense', 'rootDamageSnapshot', 'actorOffense', 'freezeGameplayData', 'random', 'damageBonusReason', 'tickProjectileBodies', 'debugProjectile']) assert(!(helper in core));
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
