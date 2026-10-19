import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import {checkDeclarationClosure} from '../../scripts/check-architecture.mjs';
export const families=[['SkillMechanics','mechanic-contracts'],['DamageDelivery','defense-settings'],['MapPoint','spatial'],['CombatEntity','combat-entity']];
export const cases=[
 ...families.map(([name,file])=>({name:'direct '+name,file,code:'export type Public = Legacy;',type:name})),
 {name:'DamageDefinition transitive mechanics',file:'damage-contracts',type:'DamageDefinition',code:'export type Public = NonNullable<Legacy["mechanics"]>;'},
 {name:'DamageContext transitive identity',file:'damage-contracts',type:'DamageContext',code:'export type Public = NonNullable<Legacy["entities"]>["attacker"];'},
 {name:'DamageContext transitive delivery',file:'damage-contracts',type:'DamageContext',code:'export type Public = NonNullable<Legacy["defender"]>["mechanic"];'},
 {name:'TargetContext transitive position',file:'combat-state',type:'TargetContext',code:'export type Public = Extract<Legacy,{mode:"ground"}>["position"];'},
 {name:'interface heritage',file:'combat-entity',type:'CombatEntity',code:'export interface Public extends Legacy {readonly extra?: number}'},
 {name:'generic constraint',file:'combat-entity',type:'CombatEntity',code:'export interface Public<T extends Legacy> {readonly value:T}'},
 {name:'unused generic default',file:'mechanic-contracts',type:'SkillMechanics',code:'export interface Public<T=Legacy> {readonly value:number}'},
 {name:'nested alias',file:'spatial',type:'MapPoint',code:'type Hidden=Legacy;export interface Public {readonly nested:{readonly value:Hidden}}'},
 {name:'mapped type',file:'combat-entity',type:'CombatEntity',code:'export type Public = {readonly [K in keyof Legacy]: Legacy[K]};'},
 {name:'conditional type',file:'defense-settings',type:'DamageDelivery',code:'export type Public<T> = T extends string ? Legacy : never;'},
 {name:'argument',file:'mechanic-contracts',type:'SkillMechanics',code:'export declare function Public(input:Legacy):number;'},
 {name:'return',file:'spatial',type:'MapPoint',code:'export declare function Public():Legacy;'},
 {name:'import type query',file:'combat-entity',type:'CombatEntity',query:true,code:'export type Public = import("../../../contracts/combat-entity.js").CombatEntity;'},
 {name:'typeof import query',file:'defense-settings',type:'DamageDelivery',query:true,code:'export type Public = typeof import("../../../contracts/defense-settings.js");'},
 {name:'intermediate re-export',file:'mechanic-contracts',type:'SkillMechanics',reexport:true,code:''},
];
export const positive='export type LocalScalar=number;export type LocalValues<K extends string>=Readonly<Record<K,LocalScalar>>;export interface Public<K extends string="projectile"|"magic"|"player"|"MapPoint"> {readonly values:LocalValues<K>;readonly nested?:Public<K>}';
// Copy real canonical contracts and their complete dependencies. No repository or
// installed package source is mutated. Every negative gets its own valid control.
export function withBoundaryTree(base,phase,run){
 const root=mkdtempSync(path.join(tmpdir(),'rpg-gameplay-boundary-'));
 const dir=phase==='source'?'src':'dist';
 try {cpSync(base,path.join(root,dir),{recursive:true});mkdirSync(path.join(root,'docs'));writeFileSync(path.join(root,'docs/module-map.json'), '{}');
 writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
 const ext=phase==='source'?'.ts':'.d.ts';
 const entry=path.join(root,dir,'kernel/index'+ext),input=path.join(root,dir,'kernel/nested/deep/input'+ext),support=path.join(root,dir,'kernel/boundary-support'+ext);
 mkdirSync(path.dirname(input),{recursive:true});
 writeFileSync(entry,'export * from "./nested/deep/input.js";');
 const set=code=>writeFileSync(input,code);
 const check=()=>{const program=ts.createProgram([entry],{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,exactOptionalPropertyTypes:true,types:[],skipLibCheck:false,noEmit:true});
 const diagnostics=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
 return checkDeclarationClosure(program,entry,path.join(root,dir,'kernel'),phase);};
 set(positive);run({root,dir,ext,entry,input,support,set,check,phase});
 }finally{rmSync(root,{recursive:true,force:true});}
}
export function rejectCase(tree,c){
 assert.equal(tree.check().exports,3,'valid control');
 const target=tree.dir+'/contracts/'+c.file+tree.ext;
 if(c.reexport){writeFileSync(tree.support,'export type {'+c.type+' as Hidden} from "../contracts/'+c.file+'.js";');tree.set('import type {Hidden} from "../../boundary-support.js"; export type Public=Hidden;');}
 else tree.set(c.query?c.code:'import type {'+c.type+' as Legacy} from "../../../contracts/'+c.file+'.js";'+c.code);
 let error;try{tree.check();}catch(e){error=e;}
 assert(error,'negative accepted: '+c.name);const message=String(error).replaceAll('\\','/');
 assert(message.includes('Kernel '+tree.phase+' declaration closure:'),message);
 assert(message.includes('forbidden declaration'),message);assert(message.includes(target),message);
 return {case:c.name,diagnostic:'forbidden declaration',target,message:message.replaceAll(tree.root.replaceAll('\\','/'),'<fixture>')};
}
