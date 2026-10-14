import {createHash} from 'node:crypto';
import ts from 'typescript';

// Compare every top-level declaration (including private helpers and contracts),
// ignoring only comments, whitespace and import/re-export paths. This detects
// accidental formula, literal, validation or signature changes during the move.
export function behaviorFingerprint(source) {
  const ast = ts.createSourceFile('core.ts', source, ts.ScriptTarget.Latest, true);
  return ast.statements.filter(node => !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)).map(node => {
    const text = node.getText(ast), scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
    const tokens = [];
    while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) tokens.push(scanner.getTokenText());
    return createHash('sha256').update(JSON.stringify(tokens)).digest('hex');
  }).sort();
}
