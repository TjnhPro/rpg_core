import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {behaviorFingerprint} from './behavior-fingerprint.mjs';

// Optional root lets regression tests audit isolated malformed source trees.
const root = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url));
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
console.log(JSON.stringify({status: 'PASS', modules: files.length, runtimeCycles, typeCycles}, null, 2));
