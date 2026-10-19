// Read-only review evidence: stdout only; no baseline or artifact writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import {behaviorFingerprint} from './behavior-fingerprint.mjs';
import {checkKernelDeclarations} from './check-architecture.mjs';
const revision='58b53ca1727002c3a31273f23cc0b484c40ef1f0';
const original=file=>execFileSync('git',['show',`${revision}:${file}`],{encoding:'utf8'});
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
execFileSync('git',['merge-base','--is-ancestor',revision,'HEAD']);
const protectedPaths=['src','package.json','package-lock.json','docs/behavior-baseline.json','scripts/check-architecture.mjs'];
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
console.log(JSON.stringify({status:'PASS',revision,productionSourceDelta:[],packageMetadataDelta:[],preservationModulesUnchanged:27,approvalHistoryUnchanged:true,baselineSha256:sha(baselineText),acceptedGoldenFilesUnchanged:goldens.length,legacyDeclarationsByteIdentical:unchangedDeclarations,kernelDeclarationsByteIdentical:true,symbolSets,closure,kernelSymbols:symbols(current,'src/kernel/index.ts'),changedFiles:git(['status','--short','--untracked-files=all']).split('\n')},null,2));
