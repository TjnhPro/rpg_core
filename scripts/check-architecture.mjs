import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const walk = dir => readdirSync(path.join(root, dir), {withFileTypes: true}).flatMap(e =>
  e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const files = walk('src').filter(f => f.endsWith('.ts') && !f.startsWith('src/shared/'));
const graph = new Map(), runtime = new Map();
const allowed = {
  contracts: ['contracts'], spatial: ['contracts', 'spatial'],
  modifiers: ['contracts', 'modifiers'], stats: ['contracts', 'stats', 'modifiers'],
  combat: ['contracts', 'combat', 'spatial'],
  damage: ['contracts', 'combat', 'damage', 'modifiers'],
  effects: ['contracts', 'effects', 'combat', 'modifiers', 'damage'],
  mechanics: ['contracts', 'mechanics', 'spatial'],
  skills: ['contracts', 'skills', 'combat', 'stats', 'effects', 'damage', 'mechanics', 'spatial'],
};
for (const file of files) {
  const ast = ts.createSourceFile(file, readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const edges = [], runtimeEdges = [];
  for (const node of ast.statements) {
    if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
    const spec = node.moduleSpecifier.text;
    assert(spec.startsWith('.'), `${file}: external dependency ${spec}`);
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)).replace(/\.js$/, '.ts');
    assert(files.includes(target), `${file}: invalid/cross-repository import ${spec}`);
    if (file !== 'src/index.ts') assert(allowed[file.split('/')[1]].includes(target.split('/')[1]), `${file}: forbidden dependency ${target}`);
    const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
    const bindings = clause?.namedBindings;
    const typeOnly = ts.isImportDeclaration(node)
      ? clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.every(e => e.isTypeOnly))
      : node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.every(e => e.isTypeOnly));
    edges.push(target);
    if (!typeOnly) runtimeEdges.push(target);
  }
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
