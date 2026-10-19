// Review proposal only: never writes the authoritative preservation baseline.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import {behaviorFingerprint} from './behavior-fingerprint.mjs';

const revision = '7b43bc5046ada04ce600ad714bfa34172dc5e160';
const original = file => execFileSync('git', ['show', `${revision}:${file}`], {encoding: 'utf8'});
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), revision);
const baselineText = readFileSync('docs/behavior-baseline.json', 'utf8');
const baseline = JSON.parse(baselineText);
assert.deepEqual(baseline, JSON.parse(original('docs/behavior-baseline.json')), 'Preservation approval still pending');
assert.deepEqual(execFileSync('git',['diff','--name-only',revision,'--','src'],{encoding:'utf8'}).trim().split('\n').sort(),['src/combat/combat-entity.ts','src/kernel/index.ts','src/stats/stat-calculation.ts']);
execFileSync('git',['diff','--exit-code',revision,'--','docs/behavior-baseline.json','tests/fixtures']);
execFileSync('git', ['diff', '--exit-code', revision, '--', 'src/contracts', 'src/combat/combat-state.ts', 'src/modifiers', 'src/damage', 'src/effects', 'src/skills', 'src/kernel/contracts', 'src/kernel/stats', 'src/kernel/modifiers', 'src/kernel/damage', 'src/kernel/defense', 'package.json', 'package-lock.json', 'tests/fixtures/stat-parity-golden.json', 'tests/fixtures/stat-mutation-golden.json', 'tests/fixtures/modifier-parity-golden.json', 'tests/fixtures/damage-parity-golden.json', 'tests/fixtures/defense-parity-golden.json']);

// Emit declarations from accepted source using an isolated compiler host. No old
// engines are written to disk, imported by tests, or shipped alongside new code.
const root = process.cwd();
const acceptedFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', revision, 'src'], {encoding: 'utf8'}).trim().split('\n').filter(f => f.endsWith('.ts'));
const accepted = new Map(acceptedFiles.map(f => [path.resolve(f), original(f)]));
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const options = {...parsed.options, emitDeclarationOnly: true};
const host = ts.createCompilerHost(options), read = host.readFile, exists = host.fileExists;
host.readFile = file => accepted.get(path.resolve(file)) ?? read(file);
host.fileExists = file => path.resolve(file).startsWith(path.resolve('src') + path.sep) ? accepted.has(path.resolve(file)) : exists(file);
const prior = ts.createProgram([...accepted.keys()], options, host);
const diagnostics = ts.getPreEmitDiagnostics(prior);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => '\n',
}));
const declarations = new Map();
const emitted = prior.emit(undefined, (file, content) => declarations.set(path.resolve(file), content));
assert.equal(emitted.emitSkipped, false);
const mapping = JSON.parse(readFileSync('docs/module-map.json', 'utf8'));
for (const [file, canonical] of Object.entries(mapping)) {
  const target = `dist/${file.replace(/\.ts$/, '.js')}`;
  const relative = path.posix.relative(path.posix.dirname(target), canonical.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js'));
  declarations.set(path.resolve(target.replace(/\.js$/, '.d.ts')), `/** @deprecated Use @rpg/core public entrypoints. */\nexport * from '${relative}';\n`);
}
let unchangedDeclarations = 0;
for (const [file, content] of declarations) if (!file.startsWith(path.resolve('dist/kernel') + path.sep)) {
  assert.equal(readFileSync(file, 'utf8'), content, `Legacy declaration changed: ${file}`);
  unchangedDeclarations++;
}
assert.equal(unchangedDeclarations, 99);
const current = ts.createProgram(parsed.fileNames, parsed.options);
function symbols(program, file) {
  const checker = program.getTypeChecker(), source = program.getSourceFile(path.resolve(file));
  return checker.getExportsOfModule(checker.getSymbolAtLocation(source)).map(symbol => {
    const value = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    return {name: symbol.name, value: !!(value.flags & ts.SymbolFlags.Value)};
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8')), symbolSets = {};
assert.deepEqual(pkg, JSON.parse(original('package.json')));
for (const [key, entry] of Object.entries(pkg.exports)) {
  const file = entry.types.replace(/^\.\/dist\//, 'src/').replace(/\.d\.ts$/, '.ts');
  const before = symbols(prior, file), after = symbols(current, file);
  if (key !== './kernel') assert.deepEqual(after, before, key);
  else {
    assert.equal(after.length, 61); assert.equal(after.filter(s => s.value).length, 15);
    for (const symbol of before) assert(after.some(s => s.name === symbol.name && s.value === symbol.value));
  }
  symbolSets[key] = {symbols: after.length, values: after.filter(s => s.value).length};
}
const compatibility = {status: 'PASS', unchangedDeclarations, oldEntrypoints: 10, packageMetadataUnchanged: true, symbolSets};
compatibility.resourceDeclarationSha256={};
for(const f of ['combat/combat-entity','stats/stat-calculation']){
 const file=path.resolve(`dist/${f}.d.ts`);
 const before=createHash('sha256').update(declarations.get(file)).digest('hex'),after=createHash('sha256').update(readFileSync(file)).digest('hex');
 assert.equal(before,after);compatibility.resourceDeclarationSha256[f]={before,after};
}
const kernelFile='src/kernel/resources/resource-calculation.ts';
function named(source,file){const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);return ast.statements.filter(n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n)).map(n=>({name:n.name?.text??(ts.isVariableStatement(n)?n.declarationList.declarations.map(d=>d.name.getText(ast)).join(','):ts.SyntaxKind[n.kind]),hash:behaviorFingerprint(n.getText(ast))[0]}));}
const modules=[],proposal=[],simulated=structuredClone(baseline);
for(const index of [8,12]){
 const entry=baseline.modules[index],legacy=index===8?'src/combat/combat-entity.ts':'src/stats/stat-calculation.ts';
 assert.equal(entry.originalFile,index===8?'src/shared/game/combat-entity.ts':'src/shared/game/stat-calculation.ts');
 const before=named(original(legacy),legacy),after=named(readFileSync(legacy,'utf8'),legacy);
 const changed=before.filter(d=>after.some(a=>a.name===d.name&&a.hash!==d.hash));
 const removed=before.filter(d=>!after.some(a=>a.name===d.name));
 const added=after.filter(d=>!before.some(a=>a.name===d.name));
 assert.deepEqual(changed.map(d=>d.name),index===8?['applyEntityDamage','applyEntityHealing','applyEntityManaGain']:['updateCurrentResources']);
 assert.deepEqual(removed,[]);assert.deepEqual(added,[]);
 for(const d of before)if(!changed.includes(d))assert.deepEqual(after.find(a=>a.name===d.name),d);
 const currentFiles=[...entry.currentFiles,kernelFile],fingerprints=currentFiles.flatMap(f=>behaviorFingerprint(readFileSync(f,'utf8'))).sort();
 const kernel=named(readFileSync(kernelFile,'utf8'),kernelFile);assert.deepEqual(kernel.map(d=>d.name),['calculateResourceTransition','normalizeResource','calculateResourceRegeneration']);
 const approvedChange={checkpoint:'v2.0.7',baseCommit:revision,authority:'PENDING separate Developer preservation approval; docs/v2/2.0.7-resource-calculation-extraction.md',previousApprovedChange:entry.approvedChange,originalDeclarations:entry.declarations,legacyBefore:before,legacyAfter:after,kernel:{[kernelFile]:kernel}};
 const ops=[{op:'test',path:`/modules/${index}`,value:entry},{op:'replace',path:`/modules/${index}/currentFiles`,value:currentFiles},{op:'replace',path:`/modules/${index}/declarations`,value:fingerprints},{op:'replace',path:`/modules/${index}/approvedChange`,value:approvedChange}];
 proposal.push(...ops);assert.deepEqual(simulated.modules[index],ops[0].value);
 for(const op of ops.slice(1))simulated.modules[index][op.path.split('/').at(-1)]=op.value;
 modules.push({index,originalFile:entry.originalFile,before,after,changed:changed.map(d=>({name:d.name,before:d.hash,after:after.find(a=>a.name===d.name).hash})),removed,added:kernel,proposedCurrentFiles:currentFiles,proposedDeclarations:fingerprints,sourceFiles:Object.fromEntries(currentFiles.map(f=>[f,{beforeGitSha256:entry.currentFiles.includes(f)?createHash('sha256').update(original(f)).digest('hex'):null,sha256:createHash('sha256').update(readFileSync(f)).digest('hex'),gitNormalizedSha256:createHash('sha256').update(readFileSync(f,'utf8').replaceAll('\r\n','\n')).digest('hex')}])),approvalHistoryPreserved:JSON.stringify(approvedChange.previousApprovedChange)===JSON.stringify(entry.approvedChange)});
}
for(let i=0;i<baseline.modules.length;i++){
 if(![8,12].includes(i))assert.deepEqual(simulated.modules[i],baseline.modules[i]);
 assert.deepEqual(simulated.modules[i].currentFiles.flatMap(f=>behaviorFingerprint(readFileSync(f,'utf8'))).sort(),simulated.modules[i].declarations,simulated.modules[i].originalFile);
}
assert.equal(simulated.modules[8].approvedChange.previousApprovedChange.checkpoint,'v1.2.0');
assert.equal(simulated.modules[8].approvedChange.previousApprovedChange.followUpChanges[0].checkpoint,'v1.2.2');
assert.equal(simulated.modules[12].approvedChange.previousApprovedChange.checkpoint,'v2.0.3');
assert.equal(simulated.modules[12].approvedChange.previousApprovedChange.patches[0].checkpoint,'v2.0.3-callback-parity');
const golden=JSON.parse(readFileSync('tests/fixtures/resource-parity-golden.json','utf8'));
const review={status:'PENDING_PRESERVATION_APPROVAL',revision,baselineSha256:createHash('sha256').update(baselineText).digest('hex'),modules,unrelatedModulesUnchanged:25,compatibility,golden:{revision:golden.revision,sourceFiles:Object.keys(golden.sources).length,scenarios:golden.scenarios.length,errors:golden.scenarios.filter(s=>s.error).length,originalThrownObjects:golden.scenarios.filter(s=>s.error?.original).length}};
assert.equal(readFileSync('docs/behavior-baseline.json','utf8'),baselineText);
writeFileSync('docs/v2/2.0.7-resource-preservation-proposal.json',JSON.stringify(proposal,null,2)+'\n');
writeFileSync('docs/v2/2.0.7-resource-preservation-fingerprints.json',JSON.stringify(review,null,2)+'\n');
let diff=execFileSync('git',['diff','--no-ext-diff',revision,'--','src'],{encoding:'utf8'});
const newDiff=spawnSync('git',['diff','--no-ext-diff','--no-index','--','/dev/null',kernelFile],{encoding:'utf8'});assert.equal(newDiff.status,1,newDiff.stderr);diff+=newDiff.stdout;
writeFileSync('docs/v2/2.0.7-resource-source.diff',diff);
console.log(JSON.stringify({status:review.status,modules:modules.map(m=>({index:m.index,changed:m.changed,removed:m.removed,added:m.added})),unrelatedModulesUnchanged:25,compatibility,golden:review.golden},null,2));
