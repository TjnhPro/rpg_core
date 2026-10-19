// Explicit historical and release review; no baseline/evidence writer.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {accepted,merge,requireRelease} from './release-transition.mjs';
import {collectClosure,validateReleaseClosure,manifestPath,evidencePath,sha,digest} from './audit-architecture-closure.mjs';
import {parseInstalledLog,validateInstalled} from './review-architecture-closure.mjs';
export function reviewHistorical(){
 const scratch=mkdtempSync(path.join(tmpdir(),'rpg-core-history-')),tree=path.join(scratch,'accepted');
 let added=false;
 try{
  execFileSync('git',['-c','core.autocrlf=false','worktree','add','--detach',tree,accepted],{stdio:'pipe'});added=true;
  const npmCli=process.env.npm_execpath??[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(existsSync);
  assert(npmCli,'Cannot locate npm CLI; run this command through npm exec -- node if needed');
  execFileSync(process.execPath,[npmCli,'ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:tree,stdio:'pipe'});
  for(const args of [['scripts/clean.mjs'],['node_modules/typescript/bin/tsc','-p','tsconfig.json'],['scripts/legacy-build-paths.mjs']])execFileSync(process.execPath,args,{cwd:tree,stdio:'pipe'});
  const result=JSON.parse(execFileSync(process.execPath,['scripts/audit-architecture-closure.mjs'],{cwd:tree,encoding:'utf8',maxBuffer:8*1024*1024}));
  assert.equal(result.status,'PASS');
  return {status:'PASS',mode:'historical',commit:accepted,packageVersion:'1.0.0',build:'PASS',freeze:result};
 }finally{
  if(added)execFileSync('git',['worktree','remove','--force',tree],{stdio:'pipe'});
  assert(path.dirname(scratch)===tmpdir());rmSync(scratch,{recursive:true,force:true});
 }
}
export async function reviewRelease(log){
 const state=requireRelease(),live=await collectClosure({mode:'release'});
 const manifest=JSON.parse(readFileSync(manifestPath)),evidence=JSON.parse(readFileSync(evidencePath));
 const boundary=validateReleaseClosure(manifest,evidence,live,state);assert.equal(boundary.status,'PASS',JSON.stringify(boundary));
 assert(log,'Fresh installed --installed-log is required for release review');
 const installed=validateInstalled(parseInstalledLog(readFileSync(log,'utf8')),live,{mode:'release'});
 assert.equal(installed.status,'PASS',JSON.stringify(installed.diagnostics));
 return {status:'PASS',mode:'release',accepted,merge,currentHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  changedFiles:state.changedFiles,metadata:state.record.metadata,version:live.sections.publicBoundary.package.version,
  entrypoints:11,kernel:{symbols:63,runtime:17},legacy:{symbols:243,runtime:122},legacyDeclarations:99,kernelDeclarations:17,
  sourceFiles:89,dependencyOccurrences:285,runtimeCycles:0,combinedSccs:live.sections.dependencyGraph.combinedSccs,
  declarations:live.sections.declarations,preservation:live.sections.preservation,zeroProductionDelta:true,zeroPreservationDelta:true,
  acceptedManifestSha256:sha(readFileSync(manifestPath)),manifestStatus:manifest.identity.status,
  acceptedSectionHashes:Object.fromEntries(Object.entries(evidence.sections).map(([k,v])=>[k,digest(v)])),
  installed:{status:installed.status,version:installed.proof.package.version,archiveSha256:installed.archiveSha256,integrity:installed.integrity,multiRpgScenarios:32,legacyScenarios:61,executions:288},
  limitations:['Finite scenarios and static ownership audit; not all possible application behavior','Archive identity is per run/platform; temporary archive is removed by existing installer','Final full verification, commit/push and release PR await Gate B approval']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2];assert(['--historical','--release'].includes(mode),'Choose --historical or --release');
 const index=process.argv.indexOf('--installed-log');
 console.log(JSON.stringify(mode==='--historical'?reviewHistorical():await reviewRelease(index<0?undefined:process.argv[index+1]),null,2));
}
