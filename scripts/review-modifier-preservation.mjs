// Review proposal only: never writes the authoritative preservation baseline.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import {behaviorFingerprint} from './behavior-fingerprint.mjs';

const revision = '390c6e8c96f467903401d18b32a4e44184b5f94e';
const original = file => execFileSync('git', ['show', `${revision}:${file}`], {encoding: 'utf8'});
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), revision);
const baselineText = readFileSync('docs/behavior-baseline.json', 'utf8');
const baseline = JSON.parse(baselineText);
assert.deepEqual(baseline, JSON.parse(original('docs/behavior-baseline.json')), 'Preservation approval still pending');
execFileSync('git', ['diff', '--exit-code', revision, '--', 'src/contracts', 'src/stats', 'src/damage', 'src/effects', 'src/skills',
  'src/kernel/contracts/modifiers.ts', 'src/kernel/contracts/stats.ts', 'src/kernel/stats',
  'tests/fixtures/stat-parity-golden.json', 'tests/fixtures/stat-mutation-golden.json', 'package.json', 'package-lock.json']);

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
    assert.equal(after.length, 50); assert.equal(after.filter(s => s.value).length, 6);
    for (const symbol of before) assert(after.some(s => s.name === symbol.name && s.value === symbol.value));
  }
  symbolSets[key] = {symbols: after.length, values: after.filter(s => s.value).length};
}
const compatibility = {status: 'PASS', unchangedDeclarations, oldEntrypoints: 10, packageMetadataUnchanged: true, symbolSets};

const index = 13, entry = baseline.modules[index];
assert.equal(entry.originalFile, 'src/shared/game/modifier-core.ts');
assert.equal(entry.approvedChange, undefined);
for (const module of baseline.modules) if (module !== entry)
  assert.deepEqual(module.currentFiles.flatMap(f => behaviorFingerprint(readFileSync(f, 'utf8'))).sort(), module.declarations, module.originalFile);
const legacy = 'src/modifiers/modifier-core.ts';
const kernel = ['src/kernel/modifiers/modifier-resolution.ts', 'src/kernel/contracts/modifier-resolution.ts'];
const currentFiles = [legacy, ...kernel];
function named(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return ast.statements.filter(n => !ts.isImportDeclaration(n) && !ts.isExportDeclaration(n)).map(n => ({
    name: n.name?.text ?? (ts.isVariableStatement(n) ? n.declarationList.declarations.map(d => d.name.getText(ast)).join(',') : ts.SyntaxKind[n.kind]),
    hash: behaviorFingerprint(n.getText(ast))[0],
  }));
}
const before = named(original(legacy), legacy), after = named(readFileSync(legacy, 'utf8'), legacy);
for (const name of ['ActiveModifierSources', 'resolveModifiers'])
  assert.deepEqual(after.find(d => d.name === name), before.find(d => d.name === name));
const fingerprints = currentFiles.flatMap(f => behaviorFingerprint(readFileSync(f, 'utf8'))).sort();
const approvedChange = {checkpoint: 'v2.0.4', baseCommit: revision,
  authority: 'PENDING separate Developer preservation approval; docs/v2/2.0.4-modifier-resolver-extraction.md',
  originalDeclarations: entry.declarations, legacyBefore: before, legacyAfter: after,
  kernel: Object.fromEntries(kernel.map(f => [f, named(readFileSync(f, 'utf8'), f)]))};
const proposal = [
  {op: 'test', path: `/modules/${index}`, value: entry},
  {op: 'replace', path: `/modules/${index}/currentFiles`, value: currentFiles},
  {op: 'replace', path: `/modules/${index}/declarations`, value: fingerprints},
  {op: 'add', path: `/modules/${index}/approvedChange`, value: approvedChange},
];
const golden = JSON.parse(readFileSync('tests/fixtures/modifier-parity-golden.json', 'utf8'));
const review = {status: 'PENDING_PRESERVATION_APPROVAL', revision,
  baselineSha256: createHash('sha256').update(baselineText).digest('hex'), moduleIndex: index,
  before, after, kernel: approvedChange.kernel, proposedCurrentFiles: currentFiles, proposedDeclarations: fingerprints,
  unrelatedModulesUnchanged: 26, compatibility, golden: {revision: golden.revision, scenarios: golden.scenarios.length, errors: golden.scenarios.filter(s => s.error).length}};
writeFileSync('docs/v2/2.0.4-modifier-preservation-proposal.json', JSON.stringify(proposal, null, 2) + '\n');
writeFileSync('docs/v2/2.0.4-modifier-preservation-fingerprints.json', JSON.stringify(review, null, 2) + '\n');
let diff = execFileSync('git', ['diff', '--no-ext-diff', revision, '--', 'src'], {encoding: 'utf8'});
for (const file of kernel) {
  const result = spawnSync('git', ['diff', '--no-ext-diff', '--no-index', '--', '/dev/null', file], {encoding: 'utf8'});
  assert.equal(result.status, 1, result.stderr); diff += result.stdout;
}
writeFileSync('docs/v2/2.0.4-modifier-source.diff', diff);
console.log(JSON.stringify({status: review.status, moduleIndex: index, unrelatedModulesUnchanged: 26, compatibility, golden: review.golden}, null, 2));
