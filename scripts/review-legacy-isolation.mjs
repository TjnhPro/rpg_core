// Read-only review evidence: stdout only; no baseline or artifact writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import {behaviorFingerprint} from './behavior-fingerprint.mjs';
import {checkKernelDeclarations} from './check-architecture.mjs';
import {adversarialCases} from '../tests/fixtures/legacy-delegation-audit.mjs';
import {cases as boundaryCases,withBoundaryTree,rejectCase} from '../tests/fixtures/gameplay-boundary-audit.mjs';
import {auditLegacyDelegation} from './audit-legacy-delegation.mjs';
import {pathToFileURL} from 'node:url';
const revision='f5c22e2431075dc9b610359fdede99460aee850e';
const original=file=>execFileSync('git',['show',`${revision}:${file}`],{encoding:'utf8'});
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
execFileSync('git',['merge-base','--is-ancestor',revision,'HEAD']);
const protectedPaths=['src','package.json','package-lock.json','docs/behavior-baseline.json','scripts/check-architecture.mjs','scripts/check-preservation.mjs','tsconfig.json','tsconfig.tests.json'];
assert.equal(git(['diff','--name-only',revision,'--',...protectedPaths]),'');
assert.equal(git(['ls-files','--others','--exclude-standard','--','src']), '');
const goldens=git(['ls-tree','-r','--name-only',revision,'tests/fixtures']).split('\n').filter(f=>f.endsWith('.json'));
assert.equal(git(['diff','--name-only',revision,'--',...goldens]),'');
const baselineText=readFileSync('docs/behavior-baseline.json','utf8');
assert.deepEqual(JSON.parse(baselineText),JSON.parse(original('docs/behavior-baseline.json')));
const baseline=JSON.parse(baselineText);
assert.equal(baseline.modules.length,27);
for(const item of baseline.modules) assert.deepEqual(item.currentFiles.flatMap(f=>behaviorFingerprint(readFileSync(f,'utf8'))).sort(),item.declarations,item.originalFile);
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
  assert.deepEqual(after, before, key);
  if (key === './kernel') {
    assert.equal(after.length, 63); assert.equal(after.filter(s => s.value).length, 17);
  }
  symbolSets[key] = {symbols: after.length, values: after.filter(s => s.value).length};
}

// Compare every emitted Kernel declaration byte-for-byte as well.
for(const [file,content] of declarations) if(file.startsWith(path.resolve('dist/kernel')+path.sep)) assert.equal(readFileSync(file,'utf8'),content,file);
const sha=text=>createHash('sha256').update(text).digest('hex');
const closure=checkKernelDeclarations(root);
const lf=text=>text.replaceAll('\r\n','\n');
const sourceSha256=Object.fromEntries(acceptedFiles.map(file=>{
 const expected=sha(original(file)),working=readFileSync(file,'utf8');
 assert.equal(sha(lf(working)),expected,file);
 return [file,{acceptedGit:expected,currentLF:sha(lf(working)),workingTreeBytes:sha(readFileSync(file))}];
}));
const golden=JSON.parse(readFileSync('tests/fixtures/legacy-isolation-golden.json','utf8'));
assert.equal(golden.revision,revision);
for(const [file,hash] of Object.entries(golden.sources)) {
 assert.equal(sha(original(file)),hash,file);
 assert.equal(sha(lf(readFileSync(file,'utf8'))),hash,file);
}
for(const [file,hash] of Object.entries(golden.scenarioSources)) assert.equal(sha(lf(readFileSync(file,'utf8'))),hash,file);
const moduleFingerprints=baseline.modules.map((item,index)=>({index,originalFile:item.originalFile,currentFiles:item.currentFiles,declarations:item.declarations,approvalProvenanceSha256:sha(JSON.stringify(item))}));
const declarationSha256=Object.fromEntries([...declarations].map(([file,content])=>[path.relative(root,file).replaceAll('\\','/'),sha(content)]));
const delegation=auditLegacyDelegation();assert.equal(delegation.status,'PASS');
const delegationFixtures=adversarialCases.map(c=>{
 const source=readFileSync(c.file,'utf8'),candidate=c.change(source);assert.notEqual(source,candidate,c.name);
 const control=auditLegacyDelegation({[c.file]:source});assert.equal(control.status,'PASS',c.name);
 const rejected=auditLegacyDelegation({[c.file]:candidate});assert.deepEqual(rejected.types,[],c.name);
 assert(rejected.diagnostics.some(d=>d.code===c.code),c.name);
 return {name:c.name,control:'PASS',typescriptDiagnostics:0,expected:c.code,diagnostics:rejected.diagnostics};
});
withBoundaryTree(path.resolve('src'),'source',tree=>delegationFixtures.push({control:'PASS',typescriptDiagnostics:0,...rejectCase(tree,boundaryCases.find(c=>c.name==='direct MapPoint'))}));
const kernelRuntimeExports=Object.keys(await import(pathToFileURL(path.resolve('dist/kernel/index.js')))).sort();
assert.equal(kernelRuntimeExports.length,17);
const original59Sha256=sha(JSON.stringify(golden.scenarios.slice(0,59)));
assert.equal(original59Sha256,'02dd2bb3985ed6cd42651f176f75706edd85d7de51b605ca677f8a795cbd117b');
const positionScenarios=golden.scenarios.filter(s=>s.name.startsWith('random-in-area-step-'));
assert.equal(positionScenarios.length,2);
assert.deepEqual(positionScenarios[0].observation,positionScenarios[1].observation);
for(const s of positionScenarios)assert.equal(s.summary.rolls.positionCalls,6);
const positionRng={fineCoarseFullTraceEqual:true,original59Sha256,scenarios:positionScenarios.map(s=>({name:s.name,rolls:s.summary.rolls,callbackOrder:s.observation.filter(e=>['positionRoll','criticalRoll','dodgeRoll'].includes(e.label)).map(e=>e.label),observations:s.observation.filter(e=>['positionRoll','positionRoll-result','strike-position','geometry-call-count'].includes(e.label))}))};
const evidence={status:'PASS',revision,productionSourceDelta:[],packageMetadataDelta:[],preservationModulesUnchanged:27,approvalHistoryUnchanged:true,baselineSha256:sha(baselineText),baselineGitSha256:sha(original('docs/behavior-baseline.json')),acceptedGoldenFilesUnchanged:goldens.length,acceptedGoldenHashes:Object.fromEntries(goldens.map(file=>[file,sha(original(file))])),legacyDeclarationsByteIdentical:unchangedDeclarations,kernelDeclarationsByteIdentical:true,symbolSets,closure,kernelSymbols:symbols(current,'src/kernel/index.ts'),kernelRuntimeExports,sourceSha256,declarationSha256,moduleFingerprints,delegation,delegationFixtures,oracle:{revision,goldenFileSha256:sha(readFileSync('tests/fixtures/legacy-isolation-golden.json')),positionRng,acceptedSourceFiles:Object.keys(golden.sources).length,hashEncoding:'UTF-8 with LF, matching Git blobs; separate raw working-tree hashes are recorded',scenarioSources:golden.scenarioSources,scenarios:golden.scenarios.length,traceSha256:sha(JSON.stringify(golden.scenarios)),matrix:golden.scenarios.map(({name,summary})=>({name,...summary}))},changedFiles:git(['status','--short','--untracked-files=all']).split('\n')};
console.log(JSON.stringify(evidence,null,2));
