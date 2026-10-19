// Read-only inventory and candidate validation. Dependency policy stays in check-architecture.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import {checkKernelDeclarations} from './check-architecture.mjs';
import {behaviorFingerprint} from './behavior-fingerprint.mjs';
import {auditLegacyDelegation} from './audit-legacy-delegation.mjs';

export const revision='994a2fc8d7d01d8200e6377bb65436b7228b3a4e';
export const evidencePath='docs/v2/2.0.12-architecture-closure-evidence.json';
export const manifestPath='docs/v2/2.0.12-architecture-freeze.json';
export const allowedFiles=[
 'docs/v2/rpg-core-v2.0.12-implementation-plan.md','docs/v2/2.0.12-architecture-closure.md',evidencePath,manifestPath,
 'scripts/audit-architecture-closure.mjs','scripts/review-architecture-closure.mjs','tests/tooling/architecture-closure.test.ts',
 'scripts/consumer-smoke.mjs','AGENTS.md','docs/ARCHITECTURE.md','docs/test-coverage.md','README.md',
].sort();
export const sha=value=>createHash('sha256').update(value).digest('hex');
const lf=value=>value.toString().replaceAll('\r\n','\n');
export function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
 return value;
}
export const digest=value=>sha(JSON.stringify(stable(value))??'undefined');
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const original=file=>execFileSync('git',['show',`${revision}:${file}`],{maxBuffer:32*1024*1024});
const relative=file=>path.relative(process.cwd(),file).replaceAll('\\','/');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
export function protectedDiff(){
 const changed=[...new Set([...git(['diff','--name-only',revision]).split('\n'),...git(['ls-files','--others','--exclude-standard']).split('\n')].filter(Boolean))].sort();
 return {changedFiles:changed,unauthorized:changed.filter(file=>!allowedFiles.includes(file))};
}
// Normalise source/declaration location only, never the symbol's name or flags.
export function publicInventory(program,entry,root=process.cwd()){
 const checker=program.getTypeChecker(),source=program.getSourceFile(path.resolve(entry));
 assert(source,`Missing public module ${entry}`);
 return checker.getExportsOfModule(checker.getSymbolAtLocation(source)).map(symbol=>{
  const target=symbol.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(symbol):symbol;
  const decl=target.valueDeclaration??target.declarations?.[0];assert(decl,`Unresolved public symbol ${symbol.name}`);
  let owner=path.relative(root,decl.getSourceFile().fileName).replaceAll('\\','/');
  owner=owner.replace(/^dist\/src\//,'src/').replace(/^dist\//,'src/').replace(/\.d\.ts$/,'.ts');
  return {name:symbol.name,value:!!(target.flags&ts.SymbolFlags.Value),type:!!(target.flags&ts.SymbolFlags.Type),origin:`${owner}#${target.name}`};
 }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
}
export function stronglyConnected(graph,runtime=false){
 let next=0;const ids=new Map(),low=new Map(),stack=[],active=new Set(),result=[];
 const edges=new Map(graph.map(row=>[row.file,row.edges.filter(e=>!runtime||e.kind==='runtime').map(e=>e.to)]));
 function visit(file){
  ids.set(file,next);low.set(file,next++);stack.push(file);active.add(file);
  for(const to of edges.get(file)??[]){if(!ids.has(to)){visit(to);low.set(file,Math.min(low.get(file),low.get(to)));}else if(active.has(to))low.set(file,Math.min(low.get(file),ids.get(to)));}
  if(low.get(file)===ids.get(file)){
   const members=[];let to;do{to=stack.pop();active.delete(to);members.push(to);}while(to!==file);
   if(members.length>1||(edges.get(file)??[]).includes(file))result.push(members.sort());
  }
 }
 for(const file of edges.keys())if(!ids.has(file))visit(file);
 return result.sort((a,b)=>a[0]<b[0]?-1:1);
}
function dependencyGraph(program,options){
 return program.getSourceFiles().filter(file=>relative(file.fileName).startsWith('src/')).map(file=>{
  const edges=[];
  function dependency(spec,typeOnly,syntax){
   assert.equal(typeof spec,'string',`Unresolved graph dependency ${file.fileName}`);
   const resolved=ts.resolveModuleName(spec,file.fileName,options,ts.sys).resolvedModule;
   assert(resolved,`Unresolved graph target ${spec}`);
   edges.push({to:relative(resolved.resolvedFileName),kind:typeOnly?'type':'runtime',syntax});
  }
  function visit(node){
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier){
    const clause=ts.isImportDeclaration(node)?node.importClause:undefined,bindings=clause?.namedBindings;
    const typeOnly=ts.isImportDeclaration(node)?clause?.isTypeOnly||(!clause?.name&&bindings&&ts.isNamedImports(bindings)&&bindings.elements.length>0&&bindings.elements.every(e=>e.isTypeOnly)):
     node.isTypeOnly||(node.exportClause&&ts.isNamedExports(node.exportClause)&&node.exportClause.elements.length>0&&node.exportClause.elements.every(e=>e.isTypeOnly));
    dependency(node.moduleSpecifier.text,typeOnly,ts.isImportDeclaration(node)?'import':'export');
   }else if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference))dependency(node.moduleReference.expression?.text,node.isTypeOnly,'import-equals');
   else if(ts.isImportTypeNode(node))dependency(ts.isLiteralTypeNode(node.argument)?node.argument.literal.text:undefined,true,'import-type');
   else if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require'))dependency(node.arguments.length===1&&ts.isStringLiteralLike(node.arguments[0])?node.arguments[0].text:undefined,false,'dynamic');
   ts.forEachChild(node,visit);
  }visit(file);return {file:relative(file.fileName),edges};
 }).sort((a,b)=>a.file<b.file?-1:1);
}
export async function collectClosure(){
 const started=performance.now();
 execFileSync('git',['merge-base','--is-ancestor',revision,'HEAD']);
 const delta=protectedDiff();assert.deepEqual(delta.unauthorized,[],'Unapproved candidate file delta');
 const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);assert(!config.error);
 const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,process.cwd());
 const program=ts.createProgram(parsed.fileNames,{...parsed.options,newLine:ts.NewLineKind.LineFeed});
 assert.equal(ts.getPreEmitDiagnostics(program).length,0,'Current source must typecheck');
 const graph=dependencyGraph(program,parsed.options);
 const sourceFiles=git(['ls-tree','-r','--name-only',revision,'src']).split('\n');
 assert.deepEqual(graph.map(row=>row.file).sort(),sourceFiles.sort(),'Accepted source file inventory');
 const sourceSha256={},rawSourceSha256={};
 for(const file of sourceFiles){sourceSha256[file]=sha(lf(readFileSync(file)));rawSourceSha256[file]=sha(readFileSync(file));assert.equal(sourceSha256[file],sha(original(file)),file);}
 const protectedFiles=['package.json','package-lock.json','tsconfig.json','tsconfig.tests.json','tsconfig.examples.json','vitest.config.ts','docs/behavior-baseline.json','docs/module-map.json','EXPORT-MANIFEST.json','scripts/check-architecture.mjs','scripts/check-preservation.mjs'];
 const protectedSha256=Object.fromEntries(protectedFiles.map(file=>{const hash=sha(lf(readFileSync(file)));assert.equal(hash,sha(original(file)),file);return [file,hash];}));
 // Actual source gate stays independent: reporting must not substitute its own policy.
 const architecture=JSON.parse(execFileSync(process.execPath,['scripts/check-architecture.mjs'],{encoding:'utf8',maxBuffer:8*1024*1024}));
 const closure=checkKernelDeclarations(process.cwd());
 const normalClosure=value=>({exports:value.exports,files:value.files.map(relative).sort()});
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 const emittedEntries=Object.values(pkg.exports).map(e=>path.resolve(e.types));
 const declarationsProgram=ts.createProgram(emittedEntries,{...parsed.options,rootDir:undefined,types:[],skipLibCheck:false});
 assert.equal(ts.getPreEmitDiagnostics(declarationsProgram).length,0,'Emitted declarations must typecheck');
 const inventories={},runtimeNamespaces={},namespaceIdentity=[];
 const root=await import(pathToFileURL(path.resolve(pkg.exports['.'].import)));
 for(const [name,entry] of Object.entries(pkg.exports)){
  const source=entry.types.replace(/^\.\/dist\//,'src/').replace(/\.d\.ts$/,'.ts');
  inventories[name]=publicInventory(program,source);
  assert.deepEqual(publicInventory(declarationsProgram,entry.types),inventories[name],`Source/emitted public inventory ${name}`);
  const api=await import(pathToFileURL(path.resolve(entry.import)));
  runtimeNamespaces[name]=Object.keys(api).sort();
  assert.deepEqual(runtimeNamespaces[name],inventories[name].filter(s=>s.value).map(s=>s.name).sort(),name);
  if(name!=='.'&&name!=='./kernel')for(const [symbol,value] of Object.entries(api))assert.equal(value,root[symbol],`${name}#${symbol} runtime identity`);
 }
 const declarations={};
 const emit=program.emit(undefined,(file,content)=>{if(file.endsWith('.d.ts'))declarations[relative(file)]=sha(content);},undefined,true);
 assert.equal(emit.emitSkipped,false);
 const mapping=JSON.parse(readFileSync('docs/module-map.json','utf8'));
 for(const [legacy,canonical] of Object.entries(mapping)){
  const target=`dist/${legacy.replace(/\.ts$/,'.d.ts')}`;
  const to=path.posix.relative(path.posix.dirname(target),canonical.replace(/^src\//,'dist/').replace(/\.ts$/,'.js'));
  declarations[target]=sha(`/** @deprecated Use @rpg/core public entrypoints. */\nexport * from '${to}';\n`);
  const prior=await import(pathToFileURL(path.resolve(`dist/${legacy.replace(/\.ts$/,'.js')}`)));
  const current=await import(pathToFileURL(path.resolve(canonical.replace(/^src\//,'dist/').replace(/\.ts$/,'.js'))));
  assert.deepEqual(prior,current,legacy);for(const name of Object.keys(prior))assert.equal(prior[name],current[name],legacy+'#'+name);
  namespaceIdentity.push({legacy,canonical,exports:Object.keys(prior).sort(),status:'PASS'});
 }
 const actualDeclarations=walk('dist').filter(file=>file.endsWith('.d.ts')).sort();
 assert.deepEqual(actualDeclarations,Object.keys(declarations).sort(),'Complete emitted declaration file inventory');
 for(const [file,hash] of Object.entries(declarations))assert.equal(sha(readFileSync(file)),hash,`Exact declaration bytes ${file}`);
 assert.equal(actualDeclarations.filter(f=>!f.startsWith('dist/kernel/')).length,99);
 const baseline=JSON.parse(readFileSync('docs/behavior-baseline.json','utf8'));
 assert.equal(baseline.modules.length,27);
 const records=baseline.modules.map((item,index)=>{
  const fingerprints=item.currentFiles.flatMap(file=>behaviorFingerprint(readFileSync(file,'utf8'))).sort();assert.deepEqual(fingerprints,item.declarations,item.originalFile);
  return {index,...item,completeRecordSha256:sha(JSON.stringify(item))};
 });
 const ownership=auditLegacyDelegation();assert.equal(ownership.status,'PASS');assert.equal(ownership.directSites,24);
 const oracles={};
 const existingTests=git(['ls-tree','-r','--name-only',revision,'tests']).split('\n');
 const testSha256={},rawConsumerSha256={};
 for(const file of existingTests){
  const raw=readFileSync(file),before=original(file),hash=sha(lf(raw));
  assert.equal(hash,sha(lf(before)),file);testSha256[file]=hash;if(file.endsWith('.json'))oracles[file]=hash;
  if(file.startsWith('tests/consumers/')){assert.equal(sha(raw),sha(before),`Exact consumer provenance bytes ${file}`);rawConsumerSha256[file]=sha(raw);}
 }
 const consumers={};
 for(const name of ['text-rpg','vo-lam-25d','arpg']){
  const file=`tests/consumers/${name}/expected.json`,oracle=JSON.parse(readFileSync(file,'utf8'));
  consumers[name]={file,ids:Object.keys(oracle.hand),handSha256:digest(oracle.hand),observationSha256:digest(oracle.observations),provenance:oracle.acceptedTraceProvenance};
 }
 const legacyOracle=JSON.parse(readFileSync('tests/fixtures/legacy-isolation-golden.json','utf8'));
 consumers.legacy={revision:legacyOracle.revision,scenarios:legacyOracle.scenarios.map(s=>({name:s.name,summary:s.summary})),traceSha256:sha(JSON.stringify(legacyOracle.scenarios))};
 const canonicalGraph=graph.filter(row=>!row.file.startsWith('src/shared/'));
 const combinedSccs=stronglyConnected(canonicalGraph),runtimeSccs=stronglyConnected(canonicalGraph,true);
 assert.equal(runtimeSccs.length,0);assert.equal(combinedSccs.length,2);
 const sections={
  dependencyGraph:{files:graph.length,occurrences:graph.reduce((sum,row)=>sum+row.edges.length,0),graph,combinedSccs,runtimeSccs,typeCyclePaths:architecture.typeCycles,domainEdges:[...new Set(canonicalGraph.flatMap(row=>row.edges.map(e=>`${row.file.split('/')[1]} -> ${e.to.split('/')[1]}`)))].sort(),policyAuthority:'scripts/check-architecture.mjs'},
  publicBoundary:{package:{name:pkg.name,version:pkg.version,exports:pkg.exports},inventories,runtimeNamespaces,namespaceIdentity,closure:{source:normalClosure(closure.source),emitted:normalClosure(closure.emitted)}},
  declarations:{legacyFiles:99,kernelFiles:actualDeclarations.length-99,sha256:declarations,byteComparison:'PASS'},
  sourceIntegrity:{sourceSha256,protectedSha256,existingTestSha256:testSha256,rawConsumerSha256},
  ownership:{...ownership,canonicalPublicApis:inventories['./kernel'].filter(s=>s.value),applicationOwns:['content','policies','clock/RNG provision','orchestration','assets','networking','persistence'],gameplayArithmeticRetained:['lifesteal/percentage requests','MP cost','rank policy','projectile/AOE geometry','queue budgets']},
  preservation:{authority:'docs/behavior-baseline.json',sha256:protectedSha256['docs/behavior-baseline.json'],reviewedCommit:baseline.reviewedCommit,records,outcome:'ZERO NEW PRESERVATION DELTA'},
  oracles,consumers,
 };
 return {status:'PASS',revision,sections,observations:{node:process.version,milliseconds:performance.now()-started,rawSourceSha256,changedFiles:delta.changedFiles},limitations:ownership.limitations};
}
const sectionCodes={dependencyGraph:'DEPENDENCY_GRAPH',publicBoundary:'PUBLIC_SYMBOL',declarations:'DECLARATION_HASH',sourceIntegrity:'SOURCE_INTEGRITY',ownership:'CANONICAL_OWNER',preservation:'PRESERVATION_HISTORY',oracles:'ACCEPTED_ORACLE',consumers:'CONSUMER_COVERAGE'};
export function validateFreeze(manifest,evidence,live){
 const diagnostics=[],fail=(code,detail)=>diagnostics.push({code,detail});
 const exactKeys=(value,keys)=>value&&Object.keys(value).sort().join()===keys.sort().join();
 if(!exactKeys(manifest,['schemaVersion','identity','activation','governance','verificationRequirements','sections'])||!exactKeys(manifest?.identity,['status','architecture','milestone','package','acceptedStartingRevision']))fail('FREEZE_MANIFEST','Unknown or missing schema/identity keys');
 if(!manifest||manifest.schemaVersion!==1||manifest.identity?.status!=='PROPOSED'||manifest.identity?.architecture!=='v2.0'||manifest.identity?.milestone!=='v2.0.12'||manifest.identity?.package!=='@rpg/core@1.0.0'||manifest.identity?.finalCommit!==undefined)fail('FREEZE_MANIFEST','Invalid schema/identity/status or embedded final commit');
 if(manifest?.identity?.acceptedStartingRevision!==revision||evidence?.revision!==revision||live?.revision!==revision)fail('BASELINE_IDENTITY','Accepted starting revision mismatch');
 if(evidence?.schemaVersion!==1||evidence?.status!=='PASS'||live?.status!=='PASS')fail('FREEZE_MANIFEST','Missing successful evidence');
 if(manifest?.activation!=='Explicit final Developer RPG_CORE_V2_ARCHITECTURE_ACCEPTED record after Gate B, Gate C and exact-head PR/push CI')fail('FREEZE_MANIFEST','Unauthorized activation rule');
 if(digest(manifest?.governance)!==digest(governance))fail('FREEZE_MANIFEST','Missing approved change governance');
 if(digest(manifest?.verificationRequirements)!==digest(verificationRequirements))fail('FREEZE_MANIFEST','Missing verification/CI requirements');
 if(!manifest?.sections||Object.keys(manifest.sections).sort().join()!==Object.keys(sectionCodes).sort().join())fail('FREEZE_MANIFEST','Missing or unknown inventory sections');
 for(const [name,code] of Object.entries(sectionCodes)){
  const ref=manifest?.sections?.[name],expected=evidence?.sections?.[name],actual=live?.sections?.[name];
  if(!exactKeys(ref,['file','pointer','sha256'])||ref?.file!==evidencePath||ref?.pointer!==`/sections/${name}`||!expected||ref?.sha256!==digest(expected))fail('FREEZE_MANIFEST',`Missing/corrupted reference ${name}`);
  if(!actual||!expected||digest(actual)!==digest(expected))fail(code,`Current inventory differs: ${name}`);
 }
 return {status:diagnostics.length?'FAIL':'PASS',diagnostics};
}
export const governance={compatible:'Retain boundaries; approved plan when applicable; relevant regression and compatibility evidence',capability:'CORE_CAPABILITY_GAP; audit APIs; propose one owner/contract/semantics and compatibility/preservation impact; STOP for Developer approval',breaking:'ARCHITECTURE_CHANGE_REQUEST; motivation, boundaries, alternatives, consumer impact, migration, verification, rollback; STOP for Developer approval',baseline:'Never edit a manifest or preservation record merely to accept unapproved code'};
export const verificationRequirements={architecture:'Existing checker and source/emitted/installed closure',preservation:'27 exact records/history and namespace identities; 99 Legacy declarations',delegation:'24 reviewed direct sites plus wrappers and callback/runtime evidence',consumers:'32 Multi-RPG / 61 Legacy scenarios; one installed artifact per run; strict NodeNext/native ESM',finalVerification:'npm run verify only after Gate B approval',ci:{events:['pull_request','push'],nodes:['22.13.0','24'],exactHead:true,requiredStatus:'SUCCESS'},freeze:'Final Developer acceptance required; agent cannot activate'};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const live=await collectClosure();
 if(process.argv.includes('--inventory'))console.log(JSON.stringify(stable(live),null,2));
 else{
  const result=validateFreeze(JSON.parse(readFileSync(manifestPath)),JSON.parse(readFileSync(evidencePath)),live);
  console.log(JSON.stringify({...result,revision,sourceFiles:live.sections.dependencyGraph.files,occurrences:live.sections.dependencyGraph.occurrences,combinedSccs:live.sections.dependencyGraph.combinedSccs,runtimeSccs:live.sections.dependencyGraph.runtimeSccs,milliseconds:live.observations.milliseconds},null,2));
  if(result.status!=='PASS')process.exitCode=1;
 }
}
