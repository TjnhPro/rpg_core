import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=(file:string)=>readFileSync(new URL(`../../src/${file}`,import.meta.url),'utf8');
it('keeps rating and final/prevented damage arithmetic out of Legacy Defense',()=>{
 const source=read('damage/defense-engine.ts'),ast=ts.createSourceFile('defense.ts',source,ts.ScriptTarget.Latest,true);
 const forbidden: string[]=[];
 function visit(node:ts.Node){
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='ratingReduction')forbidden.push('ratingReduction');
  if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.AsteriskToken,ts.SyntaxKind.SlashToken,ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind))forbidden.push(node.getText(ast));
  if(ts.isPropertyAccessExpression(node)&&node.expression.getText(ast)==='Math')forbidden.push(node.getText(ast));
  ts.forEachChild(node,visit);
 }visit(ast);expect(forbidden).toEqual([]);
 expect(source).toContain('calculateHit(');expect(source).toContain('calculateMitigation(');expect(source).toContain('preventedDamage:result.preventedDamage');
});
it('delegates Critical once and retains the canonical B0/B1 pipeline',()=>{
 const source=read('damage/damage-core.ts');expect(source.match(/calculateCritical\(/g)).toHaveLength(1);
 expect(source).not.toMatch(/Math\.min\(\.85/);expect(source).toContain('calculateDamageB0(');expect(source).toContain('calculateDamageB1(raw,modifiers,criticalBonus)');
});
