// Read-only finite symbol/owner audit. Dynamic callback execution is NOT inferred.
import ts from 'typescript';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mapping, wrappers, trust, stateWrites, stores} from '../tests/fixtures/legacy-delegation-audit.mjs';

export function auditLegacyDelegation(overrides = {}) {
  const root = process.cwd(), config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const host = ts.createCompilerHost(parsed.options), read = host.readFile;
  const replacements = new Map(Object.entries(overrides).map(([f, text]) => [path.resolve(f), text]));
  host.readFile = file => replacements.get(path.resolve(file)) ?? read(file);
  const program = ts.createProgram(parsed.fileNames, parsed.options, host), checker = program.getTypeChecker();
  const relative = file => path.relative(root, file).replaceAll('\\', '/');
  const identity = symbol => {
    while (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    return declaration ? `${relative(declaration.getSourceFile().fileName)}#${symbol.name}` : undefined;
  };
  const owner = node => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
      if (ts.isVariableDeclaration(p) && p.initializer && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))) return p.name.getText();
      if (ts.isMethodDeclaration(p)) return p.name.getText();
    }
    return '<module>';
  };
  const calls = [], writes = [], allocations = [], callbackSeams = [];
  for (const source of program.getSourceFiles()) {
    const file = relative(source.fileName);
    if (!file.startsWith('src/') || file.startsWith('src/kernel/') || file.startsWith('src/shared/')) continue;
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
        const producer=identity(checker.getSymbolAtLocation(node.initializer.expression));
        if (producer==='src/kernel/modifiers/modifier-resolution.ts#prepareNumericalModifiers') {
          const binding=checker.getSymbolAtLocation(node.name);let invocations=0;
          const walk=n=>{if(ts.isCallExpression(n)&&checker.getSymbolAtLocation(n.expression)===binding)invocations++;ts.forEachChild(n,walk);};walk(source);
          callbackSeams.push({owner:`${file}#${owner(node)}`,producer,invocations});
        }
      }
      if (ts.isCallExpression(node)) {
        const target = identity(checker.getSymbolAtLocation(node.expression));
        if (target?.startsWith('src/')) calls.push({from: `${file}#${owner(node)}`, to: target, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1});
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && ts.isPropertyAccessExpression(node.left)) {
        const target = identity(checker.getSymbolAtLocation(node.left.name));
        if (target && /#(currentHp|currentMp|actionSerial|activeAction|skillExecution)$/.test(target)) writes.push(`${file}#${owner(node)} -> ${target}`);
      }
      // Module-scope authority stores only. Local geometry/dedup Maps/Sets are legitimate.
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isNewExpression(node.initializer) && node.parent.parent.parent === source && /^(WeakMap|WeakSet|Map|Set)$/.test(node.initializer.expression.getText(source)) && /src\/(skills|effects|combat)\//.test(file)) allocations.push(`${file}#${node.name.getText(source)}:${node.initializer.expression.getText(source)}`);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const diagnostics = [];
  const count = edges => {
    const counts = {};
    for (const {from, to} of edges) {const key = `${from} -> ${to}`; counts[key] = (counts[key] ?? 0) + 1;}
    return counts;
  };
  function compare(expected, actual, code) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) if ((expected[key] ?? 0) !== (actual[key] ?? 0)) diagnostics.push({code, edge: key, expected: expected[key] ?? 0, actual: actual[key] ?? 0});
  }
  const direct = calls.filter(c => c.to.startsWith('src/kernel/'));
  compare(mapping, count(direct), 'DELEGATION_SITE');
  if(callbackSeams.length!==1 || callbackSeams[0]?.owner!=='src/modifiers/modifier-core.ts#prepareModifierResolver' || callbackSeams[0]?.invocations!==1)diagnostics.push({code:'RESOLVER_CALLBACK',seams:callbackSeams});
  for (const [from, targets] of Object.entries(wrappers)) for (const to of targets) if (!calls.some(c => c.from === from && c.to === to)) diagnostics.push({code: 'WRAPPER_EDGE', edge: `${from} -> ${to}`});
  for (const [to, allowed] of Object.entries(trust)) for (const c of calls.filter(c => c.to === to)) if (!allowed.includes(c.from)) diagnostics.push({code: 'TRUST_OWNER', edge: `${c.from} -> ${to}`});
  const frequencies = items => count(items.map(key => {const [from, to = ''] = key.split(' -> '); return {from, to};}));
  compare(frequencies(stateWrites), frequencies(writes), 'STATE_WRITE_OWNER');
  compare(frequencies(stores), frequencies(allocations), 'AUTHORITY_STORE');
  const types = ts.getPreEmitDiagnostics(program).map(d => ({code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n')}));
  return {status: diagnostics.length || types.length ? 'FAIL' : 'PASS', directSites: direct.length, direct, callbackSeams, wrapperEdges: wrappers, trust, writes, stores: allocations, diagnostics, types,
    limitations: ['Finite reviewed calls/stores/writes; not semantic equivalence detection.', 'Returned resolver callbacks and caller adapters require runtime evidence.']};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditLegacyDelegation(); console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}
