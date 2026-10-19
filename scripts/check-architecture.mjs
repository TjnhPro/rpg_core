import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {behaviorFingerprint} from './behavior-fingerprint.mjs';

const absolute = file => path.resolve(file).replaceAll('\\', '/');
const inside = (file, dir) => file.startsWith(`${dir}/`);

/** Shared by the CLI, installed archive gate and isolated adversarial fixtures.
 * Walk declarations and bound symbols, not formatted type strings: formatting
 * erases aliases, heritage and unused generic constraints/defaults. */
export function checkDeclarationClosure(program, entry, directory, phase = 'source') {
  const checker = program.getTypeChecker();
  const allowed = absolute(directory), source = program.getSourceFile(entry);
  assert(source, `Kernel ${phase} declaration closure: missing entry ${entry}`);
  const rootSymbol = checker.getSymbolAtLocation(source);
  assert(rootSymbol, `Kernel ${phase} declaration closure: entry must be a module`);
  const symbols = new Set(), nodes = new Set(), reached = new Set();
  function fail(trail, detail) {
    throw Error(`Kernel ${phase} declaration closure: ${trail.join(' -> ')}: ${detail}`);
  }
  function declaration(node, trail) {
    if (nodes.has(node)) return;
    nodes.add(node);
    const file = node.getSourceFile();
    if (program.isSourceFileDefaultLibrary(file)) return;
    const name = absolute(file.fileName);
    if (!inside(name, allowed)) fail(trail, `forbidden declaration ${name}`);
    reached.add(file);
    // Namespace symbols can own exported supporting types not reached through
    // identifiers in an export * declaration alone.
    if (ts.isSourceFile(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol) for (const exported of checker.getExportsOfModule(symbol)) visitSymbol(exported, trail);
      return;
    }
    function walk(child) {
      if (ts.isIdentifier(child) || ts.isQualifiedName(child) || ts.isImportTypeNode(child)) {
        const symbol = checker.getSymbolAtLocation(child);
        if (symbol) visitSymbol(symbol, trail);
      }
      // Import-type module arguments and namespace imports may resolve to a
      // module symbol at their string literal rather than at the type node.
      if (ts.isStringLiteralLike(child)) {
        const symbol = checker.getSymbolAtLocation(child);
        if (symbol) visitSymbol(symbol, trail);
      }
      ts.forEachChild(child, walk);
    }
    walk(node);
  }
  function visitSymbol(symbol, trail) {
    if (symbols.has(symbol)) return;
    symbols.add(symbol);
    const next = [...trail, symbol.getName()];
    for (const decl of symbol.getDeclarations() ?? []) declaration(decl, next);
    if (symbol.flags & ts.SymbolFlags.Alias) {
      const target = checker.getAliasedSymbol(symbol);
      if (!target || target === symbol || target.getName() === 'unknown') fail(next, 'unresolved alias');
      visitSymbol(target, next);
    }
    if (symbol.flags & ts.SymbolFlags.Module) {
      for (const exported of checker.getExportsOfModule(symbol)) visitSymbol(exported, next);
    }
  }
  const exported = checker.getExportsOfModule(rootSymbol);
  for (const symbol of exported) visitSymbol(symbol, [path.basename(entry)]);
  // Resolve ordinary invalid/unbound types fail-closed, after boundary traversal
  // so a valid Legacy target yields a boundary diagnostic, not an unrelated error.
  for (const file of reached) {
    const errors = [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)]
      .filter(d => d.category === ts.DiagnosticCategory.Error);
    if (errors.length) fail([file.fileName], ts.flattenDiagnosticMessageText(errors[0].messageText, '\n'));
  }
  return {exports: exported.length, files: [...reached].map(f => absolute(f.fileName)).sort()};
}

/** Real source and emitted declaration programs; emission is in memory so the
 * architecture command never depends on a stale dist directory. */
export function checkKernelDeclarations(root) {
  const entry = path.join(root, 'src/kernel/index.ts');
  if (!ts.sys.fileExists(entry)) return {status: 'NO_KERNEL_ENTRY'};
  const options = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true,
    exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true,
    types: [], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], skipLibCheck: false,
    declaration: true, emitDeclarationOnly: true,
    rootDir: path.join(root, 'src'), outDir: path.join(root, 'dist'),
  };
  const program = ts.createProgram([entry], options);
  const source = checkDeclarationClosure(program, entry, path.join(root, 'src/kernel'), 'source');
  const emitted = new Map();
  const emit = program.emit(undefined, (file, text) => emitted.set(absolute(file), text));
  assert(!emit.emitSkipped, 'Kernel declaration emission skipped');
  const host = ts.createCompilerHost(options);
  const read = host.readFile, exists = host.fileExists;
  host.readFile = file => emitted.get(absolute(file)) ?? read(file);
  host.fileExists = file => emitted.has(absolute(file)) || exists(file);
  const emittedDirs = new Set([...emitted.keys()].map(file => path.posix.dirname(file)));
  const directoryExists = host.directoryExists;
  host.directoryExists = dir => emittedDirs.has(absolute(dir)) || directoryExists?.(dir) || false;
  const declarationEntry = path.join(root, 'dist/kernel/index.d.ts');
  const declarations = ts.createProgram([declarationEntry], {...options, noEmit: true}, host);
  const compiled = checkDeclarationClosure(declarations, declarationEntry, path.join(root, 'dist/kernel'), 'emitted');
  return {status: 'PASS', source, emitted: compiled};
}

// Source-edge checks remain the original gate, independent of declaration closure.
function checkSourceArchitecture(root) {
// Optional root lets regression tests audit isolated malformed source trees.
const walk = dir => readdirSync(path.join(root, dir), {withFileTypes: true}).flatMap(e =>
  e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const sourceFiles = walk('src').filter(f => f.endsWith('.ts'));
const files = sourceFiles.filter(f => !f.startsWith('src/shared/'));
const moduleMap = JSON.parse(readFileSync(path.join(root, 'docs/module-map.json'), 'utf8'));
assert.deepEqual(sourceFiles.filter(f => f.startsWith('src/shared/')).sort(), Object.keys(moduleMap).sort(), 'Unregistered legacy source');
for (const [legacy, canonical] of Object.entries(moduleMap)) {
  const spec = path.posix.relative(path.posix.dirname(legacy), canonical).replace(/\.ts$/, '.js');
  assert.equal(readFileSync(path.join(root, legacy), 'utf8').trim(), `/** @deprecated Import from @rpg/core or a public domain entrypoint. */\nexport * from '${spec}';`, `${legacy}: must remain a forwarder`);
}
const graph = new Map(), runtime = new Map();
const implementations = new Map();
const allowed = {
  kernel: ['kernel'],
  contracts: ['contracts'], spatial: ['contracts', 'spatial'],
  modifiers: ['contracts', 'modifiers'], stats: ['contracts', 'stats', 'modifiers'],
  combat: ['contracts', 'combat', 'spatial'],
  damage: ['contracts', 'combat', 'damage', 'modifiers'],
  effects: ['contracts', 'effects', 'combat', 'modifiers', 'damage'],
  mechanics: ['contracts', 'mechanics', 'spatial'],
  skills: ['contracts', 'skills', 'combat', 'stats', 'effects', 'damage', 'mechanics', 'spatial'],
};
// Legacy consumers may delegate inward; Kernel never reaches Legacy contracts,
// implementations or the root barrel, including through type-only syntax.
for (const domain of ['stats', 'modifiers', 'damage', 'combat', 'effects', 'skills', 'mechanics', 'spatial']) {
  allowed[domain].push('kernel');
}
for (const file of files) {
  const source = readFileSync(path.join(root, file), 'utf8');
  const fingerprint = behaviorFingerprint(source);
  if (fingerprint.length) {
    const key = fingerprint.join(':');
    assert(!implementations.has(key), `${file}: duplicate canonical declarations from ${implementations.get(key)}`);
    implementations.set(key, file);
  }
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  assert(file === 'src/index.ts' || allowed[file.split('/')[1]], `${file}: unknown domain`);
  const edges = [], runtimeEdges = [];
  function dependency(spec, typeOnly) {
    assert(typeof spec === 'string', `${file}: nonliteral dependency`);
    assert(spec.startsWith('.'), `${file}: external dependency ${spec}`);
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)).replace(/\.js$/, '.ts');
    assert(files.includes(target), `${file}: invalid/cross-repository import ${spec}`);
    if (file !== 'src/index.ts') assert(allowed[file.split('/')[1]].includes(target.split('/')[1]), `${file}: forbidden dependency ${target}`);
    edges.push(target);
    if (!typeOnly) runtimeEdges.push(target);
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
      const bindings = clause?.namedBindings;
      const typeOnly = ts.isImportDeclaration(node)
        ? clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every(e => e.isTypeOnly))
        : node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every(e => e.isTypeOnly));
      dependency(node.moduleSpecifier.text, typeOnly);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      dependency(node.moduleReference.expression?.text, node.isTypeOnly);
    } else if (ts.isImportTypeNode(node)) {
      dependency(ts.isLiteralTypeNode(node.argument) ? node.argument.literal.text : undefined, true);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      dependency(node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : undefined, false);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  graph.set(file, [...new Set(edges)]);
  runtime.set(file, [...new Set(runtimeEdges)]);
}
function cycles(graph) {
  const visited = new Set(), stack = [], found = [];
  function visit(file) {
    if (stack.includes(file)) {found.push([...stack.slice(stack.indexOf(file)), file]); return;}
    if (visited.has(file)) return;
    stack.push(file);
    for (const next of graph.get(file) ?? []) visit(next);
    stack.pop(); visited.add(file);
  }
  for (const file of graph.keys()) visit(file);
  return found;
}
const runtimeCycles = cycles(runtime), typeCycles = cycles(graph);
assert.equal(runtimeCycles.length, 0, 'Runtime import cycle');
return {modules: files.length, runtimeCycles, typeCycles};
}

if (process.argv[1] && absolute(process.argv[1]) === absolute(fileURLToPath(import.meta.url))) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url));
  // Run both gates even when one fails: negative tests can prove declaration
  // closure itself rejected a leak rather than count source lint as coverage.
  const failures = [];
  let architecture, declarations;
  try { declarations = checkKernelDeclarations(root); } catch (error) { failures.push(error.message); }
  try { architecture = checkSourceArchitecture(root); } catch (error) { failures.push(error.message); }
  assert.equal(failures.length, 0, failures.join('\n'));
  console.log(JSON.stringify({status: 'PASS', ...architecture, declarations}, null, 2));
}
