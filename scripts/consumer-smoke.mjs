import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {checkDeclarationClosure} from './check-architecture.mjs';

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
  assert(members.includes('dist/kernel/index.js') && members.includes('dist/kernel/index.d.ts'), 'Missing archived Kernel entrypoint');
  assert(!members.some(f => /^(src|tests|examples|node_modules|\.example-dist)\//.test(f)));
  const consumer = path.join(scratch, 'consumer');
  mkdirSync(consumer);
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({name: 'external-core-consumer', private: true, type: 'module'}));
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', archive, `typescript@${pkg.devDependencies.typescript}`], consumer);
  const kernelFixture = readFileSync(path.join(root, 'tests/fixtures/kernel-contracts.ts'), 'utf8');
  writeFileSync(path.join(consumer, 'kernel-contracts.ts'), kernelFixture.replace('../../src/kernel/index.js', '@rpg/core/kernel'));
  writeFileSync(path.join(consumer, 'kernel-stats.ts'), readFileSync(path.join(root, 'tests/fixtures/kernel-stats-consumer.ts'), 'utf8').replaceAll('../../src/kernel/index.js', '@rpg/core/kernel'));
  writeFileSync(path.join(consumer, 'kernel-modifiers.ts'), readFileSync(path.join(root, 'tests/fixtures/kernel-modifiers-consumer.ts'), 'utf8').replaceAll('../../src/kernel/index.js', '@rpg/core/kernel'));
  writeFileSync(path.join(consumer, 'kernel-damage.ts'), readFileSync(path.join(root, 'tests/fixtures/kernel-damage-consumer.ts'), 'utf8').replaceAll('../../src/kernel/index.js', '@rpg/core/kernel'));
  writeFileSync(path.join(consumer, 'kernel-defense.ts'), readFileSync(path.join(root, 'tests/fixtures/kernel-defense-consumer.ts'), 'utf8').replaceAll('../../src/kernel/index.js', '@rpg/core/kernel'));
  const installedEntry = path.join(consumer, 'node_modules/@rpg/core/dist/kernel/index.d.ts');
  const declarationProgram = ts.createProgram([installedEntry], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, types: [], skipLibCheck: false,
  });
  const installedClosure = checkDeclarationClosure(declarationProgram, installedEntry, path.dirname(installedEntry), 'installed');
  assert.equal(installedClosure.exports, 58);
  assert.equal(installedClosure.files.length, 14);
  const expectedSymbols = {'.': 243, './contracts': 102, './stats': 17, './modifiers': 8,
    './combat': 33, './damage': 27, './skills': 76, './effects': 34, './mechanics': 20, './spatial': 6, './kernel': 58};
  const installedEntries = Object.entries(pkg.exports).map(([name, entry]) =>
    [name, path.join(consumer, 'node_modules/@rpg/core', entry.types)]);
  const apiProgram = ts.createProgram(installedEntries.map(([, file]) => file), declarationProgram.getCompilerOptions());
  const apiChecker = apiProgram.getTypeChecker();
  for (const [name, file] of installedEntries) {
    const symbols = apiChecker.getExportsOfModule(apiChecker.getSymbolAtLocation(apiProgram.getSourceFile(file)));
    assert.equal(symbols.length, expectedSymbols[name], `Installed symbol count: ${name}`);
    const values = symbols.filter(symbol => {
      const target = symbol.flags & ts.SymbolFlags.Alias ? apiChecker.getAliasedSymbol(symbol) : symbol;
      return target.flags & ts.SymbolFlags.Value;
    });
    if (name === '.') assert.equal(values.length, 122, 'Root runtime values');
    if (name === './kernel') assert.equal(values.length, 12, 'Kernel stat/modifier/damage/defense runtime exports');
  }
  for (const file of installedClosure.files) {
    const member = path.relative(path.join(consumer, 'node_modules/@rpg/core'), file).replaceAll('\\', '/');
    assert(members.includes(member), `Missing reachable Kernel declaration: ${member}`);
  }
  console.log(JSON.stringify({status: 'KERNEL_DECLARATIONS_VERIFIED', exports: installedClosure.exports, declarationFiles: installedClosure.files.length}));
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
  writeFileSync(path.join(consumer, 'mana-on-hit.ts'), readFileSync(path.join(root, 'examples/mana-on-hit.ts'), 'utf8'));
  writeFileSync(path.join(consumer, 'explicit-restore.ts'), readFileSync(path.join(root, 'examples/explicit-restore.ts'), 'utf8'));
  writeFileSync(path.join(consumer, 'percent-recovery.ts'), readFileSync(path.join(root, 'examples/percent-recovery.ts'), 'utf8'));
  writeFileSync(path.join(consumer, 'recovery-acceptance.ts'), readFileSync(path.join(root, 'examples/recovery-acceptance.ts'), 'utf8'));
  // Repository-relative compatibility paths are deliberately not package exports.
  // Check their declarations and runtime identities in the installed archive too.
  const legacyImports = Object.keys(moduleMap).map((file, i) =>
    `import * as legacy${i} from './node_modules/@rpg/core/dist/${file.replace(/\.ts$/, '.js')}';`);
  writeFileSync(path.join(consumer, 'legacy.ts'), `${legacyImports.join('\n')}\nexport const legacyApis = [${legacyImports.map((_, i) => `legacy${i}`).join(',')}];\n`);
  writeFileSync(path.join(consumer, 'types.ts'), `
import * as kernel from '@rpg/core/kernel';
export const kernelNamespace: typeof kernel = kernel;
// @ts-expect-error Combined gameplay damage API remains Legacy-only
kernel.calculateDamage;
// @ts-expect-error Kernel internals are not package exports
import * as internalKernel from '@rpg/core/kernel/index.js';
import type {CombatEntity, PlayerStatsConfig, DamageContext, MapPoint} from '@rpg/core/contracts';
import {resolveCharacterStats} from '@rpg/core/stats';
import {executeSkill} from '@rpg/core/skills';
import type {SkillGameplayEffect} from '@rpg/core/skills';
export function flatAmount(effect:Extract<SkillGameplayEffect,{type:'heal'|'restore_mana'}>):number|undefined {
 // @ts-expect-error amount is intentionally widened and requires narrowing
 const assumedNumber:number=effect.amount;
 void assumedNumber;
 return typeof effect.amount==='number'?effect.amount:undefined;
}
export const numericRecovery:SkillGameplayEffect={type:'heal',target:'self',amount:25};
export const percentRecovery:SkillGameplayEffect={type:'restore_mana',target:'self',amount:{percentOfMax:.3}};
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
import * as kernel from '@rpg/core/kernel';
assert.deepEqual(Object.keys(kernel).sort(), ['calculateCooldownDurationMs', 'calculateCritical', 'calculateDamageB0', 'calculateDamageB1', 'calculateDamageBonusValue', 'calculateEffectiveValue', 'calculateHit', 'calculateMitigation', 'calculateStats', 'matchesAnyTag', 'prepareNumericalModifiers', 'selectCanonicalModifiers']);
import {kernelStatsConsumer} from './build/kernel-stats.js';
assert.equal(kernelStatsConsumer(), 10);
import {kernelModifiersConsumer} from './build/kernel-modifiers.js';
assert.deepEqual(kernelModifiersConsumer(), {text: 9, voLam: 17, arpg: .30000000000000004});
import {kernelDamageExamples} from './build/kernel-damage.js';
assert.deepEqual(kernelDamageExamples(), {text: 24, voLam: {b0:{base:15,scaling:[{source:'strength',value:1.5},{source:'weapon',value:12}],flat:6,raw:34.5},bonus:.5,b1:{criticalBonus:.25,totalBonus:.75,beforeDefense:60.375}}, arpg: {criticalBonus:.5,totalBonus:.8,beforeDefense:36}});
console.log(JSON.stringify({status:'KERNEL_DAMAGE_ESM_NODENEXT_VERIFIED',scenarios:3}));
import {kernelDefenseExamples} from './build/kernel-defense.js';
const defenseExamples=kernelDefenseExamples();
assert.deepEqual(defenseExamples.text, {ruleKey:'fixed-ward',status:'applied',missing:[],levelGap:null,levelScalingEnabled:false,effectiveK:20,rawReduction:1/3,reduction:.25,inputDamage:30,preventedDamage:7.5,finalDamage:22.5});
assert.deepEqual(defenseExamples.textCrit, {chance:.75,roll:.2,isCritical:true,bonus:.5,multiplier:1.5});
assert.equal(defenseExamples.textHit.hit,true);
assert.deepEqual(defenseExamples.voLam, {ruleKey:'hộ-thể',status:'applied',missing:[],levelGap:4,levelScalingEnabled:true,effectiveK:200,rawReduction:1/3,reduction:1/3,inputDamage:120,preventedDamage:39.999999999999986,finalDamage:80.00000000000001});
assert.deepEqual(defenseExamples.arpg.map(v=>[v.ruleKey,v.reduction,v.finalDamage,v.preventedDamage]), [['plate',.75,10,30],['aether',.5,20,20]]);
console.log(JSON.stringify({status:'KERNEL_DEFENSE_ESM_NODENEXT_VERIFIED',scenarios:3}));
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
import {manaOnHitExample} from './build/mana-on-hit.js';
import {explicitRestoreExample} from './build/explicit-restore.js';
import {percentRecoveryExample} from './build/percent-recovery.js';
import {recoveryAcceptanceExample} from './build/recovery-acceptance.js';
const recovery=recoveryAcceptanceExample();
assert.equal(recovery.hp,75);assert.equal(recovery.mp,58);assert.equal(recovery.targetHp,0);
assert.deepEqual(recovery.afterCost,[50,45,10]);assert.deepEqual(recovery.afterHit,[50,48,0]);
assert.deepEqual(recovery.triggers,['OnHit','OnKill']);assert.equal(recovery.sharedS0,true);
assert.equal(recovery.captures,1);assert.equal(recovery.rolls,1);assert.equal(recovery.actionSerial,1);assert.equal(recovery.cooldown,1000);assert.equal(recovery.replay,false);
assert.deepEqual(recovery.order,['damage-applied','entity-defeated','mana-gained','effect-hit','healing-applied','healing-applied','mana-gained']);
assert.deepEqual(recovery.events,[{type:'damage-applied',entityId:'target',atMs:0,before:10,after:0,appliedDamage:10,defeated:true},{type:'entity-defeated',entityId:'target',atMs:0},{type:'mana-gained',entityId:'source',atMs:0,before:45,after:48,appliedMana:3},{type:'healing-applied',entityId:'source',atMs:0,before:50,after:55,appliedHealing:5},{type:'healing-applied',entityId:'source',atMs:0,before:55,after:75,appliedHealing:20},{type:'mana-gained',entityId:'source',atMs:0,before:48,after:58,appliedMana:10}]);
console.log(JSON.stringify({status:'RECOVERY_ACCEPTANCE_VERIFIED',...recovery}));
const percent=percentRecoveryExample(),cappedPercent=percentRecoveryExample(true);
assert.deepEqual(percent,{hp:600,mp:240,events:[{type:'healing-applied',entityId:'source',atMs:0,before:400,after:600,appliedHealing:200},{type:'mana-gained',entityId:'source',atMs:0,before:90,after:240,appliedMana:150}],resources:[[600,90],[600,240]],recipients:['source'],captures:1,rolls:0,actionSerial:1,cooldown:1000,replay:false});
assert.deepEqual(cappedPercent,{hp:1000,mp:500,events:[{type:'healing-applied',entityId:'source',atMs:0,before:950,after:1000,appliedHealing:50},{type:'mana-gained',entityId:'source',atMs:0,before:440,after:500,appliedMana:60}],resources:[[1000,440],[1000,500]],recipients:['source'],captures:1,rolls:0,actionSerial:1,cooldown:1000,replay:false});
console.log(JSON.stringify({status:'PERCENT_RECOVERY_VERIFIED',percent,cappedPercent}));
const restore=explicitRestoreExample();
assert.deepEqual(restore,{hp:100,mp:55,events:[{type:'healing-applied',entityId:'source',atMs:0,before:80,after:100,appliedHealing:20},{type:'mana-gained',entityId:'source',atMs:0,before:35,after:55,appliedMana:20}],resources:[[100,35],[100,55]],recipients:['source'],captures:1,rolls:0,actionSerial:1,cooldown:1000,replay:false});
console.log(JSON.stringify({status:'EXPLICIT_RESTORE_VERIFIED',...restore}));
const manaOnHit=manaOnHitExample();
assert.deepEqual(manaOnHit,{primitive:{before:95,after:100,appliedMana:5},sourceHp:55,targetHp:80,appliedDamage:20,healing:[{type:'healing-applied',entityId:'source',atMs:0,before:50,after:55,appliedHealing:5}],mana:[{type:'mana-gained',entityId:'source',atMs:0,before:55,after:65,appliedMana:10}],captures:1,mp:65,actionSerial:1,replay:false});
console.log(JSON.stringify({status:'MANA_ON_HIT_VERIFIED',...manaOnHit}));
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
  if (domain !== 'kernel') for (const [name, value] of Object.entries(api)) assert.equal(value, core[name]);
}
const moduleMap = ${JSON.stringify(moduleMap)};
for (const [legacy, canonical] of Object.entries(moduleMap)) {
  const a = await import('./node_modules/@rpg/core/dist/' + legacy.replace(/\\.ts$/, '.js'));
  const b = await import('./node_modules/@rpg/core/' + canonical.replace(/^src\\//, 'dist/').replace(/\\.ts$/, '.js'));
  assert.deepEqual(a, b);
}
for (const internal of ['@rpg/core/skills/skill-execution.js', '@rpg/core/dist/index.js', '@rpg/core/shared/game/skill-execution.js', '@rpg/core/kernel/index.js', '@rpg/core/dist/kernel/index.js']) {
  await assert.rejects(import(internal), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
}
for (const helper of ['resourceSource', 'resourceRecipient', 'restoreMana', 'manaOnHit', 'lifesteal', 'skillHealingEntities', 'heal', 'isPinnedSkillTriggerBundle', 'observesSkillConditionalHit', 'observesSkillStackApply', 'captureSkillHit', 'captureSkillStackApply', 'skillStackCount', 'skillEffectWork', 'consumeStackEffect', 'registerTriggeredSkillChildren', 'childInstanceDamage', 'assembleRootDamage', 'admitSkillProjectiles', 'recordSkillProjectile', 'pendingSkillTriggerPayload', 'childDispatcher', 'initializeSkillTriggerSession', 'captureSkillExpiry', 'captureSkillImpact', 'drainSkillTriggers', 'bindRootSkillTriggers', 'trustSkillInstanceDefinition', 'initializeSkillInstances', 'bindRootSkillInstance', 'advanceSkillInstances', 'disposeSkillInstances', 'prepareRootOffense', 'bindRootOffense', 'rootDamageSnapshot', 'actorOffense', 'freezeGameplayData', 'random', 'damageBonusReason', 'tickProjectileBodies', 'debugProjectile']) assert(!(helper in core));
console.log(JSON.stringify({status: 'PASS', targetHp: a.entities[1].currentHp, deterministic: true, types: true, publicDomains: domains.length, legacyPaths: Object.keys(moduleMap).length, deepImportsBlocked: true, kernel: 'NUMERICAL_STATS_MODIFIERS_DAMAGE_ESM_AND_NODENEXT_VERIFIED'}));
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
