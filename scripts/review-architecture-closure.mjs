// Read-only Gate B/C review. No manifest writer, installer, golden capture or repair.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectClosure,validateFreeze,sha,digest,revision,evidencePath,manifestPath,protectedDiff} from './audit-architecture-closure.mjs';
import {requireRelease} from './release-transition.mjs';
import {cases as gameplayCases} from '../tests/fixtures/gameplay-boundary-audit.mjs';

export function parseInstalledLog(text){return text.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));}
export function validateInstalled(records,live,{mode='historical'}={}){
 const diagnostics=[];
 try{
  const one=status=>{const rows=records.filter(row=>row.status===status);assert.equal(rows.length,1,`Exactly one ${status} record required`);return rows[0];};
  const proof=one('INSTALLED_ARCHITECTURE_CLOSURE_PASS'),multi=one('MULTI_RPG_CONSUMERS_PASS'),legacy=one('INSTALLED_LEGACY_ISOLATION_PASS'),complete=one('MULTI_RPG_VERIFICATION_COMPLETE');
  const gameplayBoundary=one('INSTALLED_GAMEPLAY_BOUNDARY_VERIFIED');
  assert.equal(gameplayBoundary.controls,gameplayCases.length);assert.equal(gameplayBoundary.rejected,gameplayCases.length);
  assert.deepEqual(gameplayBoundary.cases.map(row=>({case:row.case,diagnostic:row.diagnostic})),gameplayCases.map(row=>({case:row.name,diagnostic:'forbidden declaration'})),'Installed gameplay fixture identities/diagnostics');
  assert.equal(proof.revision,revision,'Installed revision');
  const installerHash=sha(readFileSync('scripts/consumer-smoke.mjs'));
  assert.equal(complete.installerSha256,installerHash,'Stale installer completion');assert.equal(proof.installerSha256,installerHash,'Stale installer proof');
  assert.equal(proof.inventoryToolSha256,sha(readFileSync('scripts/audit-architecture-closure.mjs')),'Stale inventory tool');
  assert.deepEqual(proof.package,multi.package,'Mixed installed artifacts');
  assert.match(proof.package.archiveSha256,/^[0-9a-f]{64}$/);assert.match(proof.package.integrity,/^sha512-[A-Za-z0-9+/]+=*$/);
  assert.equal(complete.archiveSha256,proof.package.archiveSha256);
  for(const flag of ['integrityVerified','installedIntegrityVerified','oneArtifact'])assert.equal(proof.package[flag],true,flag);
  assert.equal(proof.package.name,'@rpg/core');
  assert(['historical','release'].includes(mode),'Explicit installed mode');
  if(mode==='release')requireRelease();
  const version=mode==='release'?'2.0.0':'1.0.0';
  assert.equal(live.sections.publicBoundary.package.version,version,'Candidate approved package version');
  assert.equal(proof.package.version,version,'Installed package version mismatch');
  assert.deepEqual(proof.inventories,live.sections.publicBoundary.inventories,'Installed complete public inventories');
  assert.deepEqual(proof.declarationSha256,live.sections.declarations.sha256,'Installed complete declaration hashes');
  assert.deepEqual(proof.runtime.publicNamespaces,live.sections.publicBoundary.runtimeNamespaces,'Installed runtime values');
  assert.deepEqual(proof.runtime.historicalNamespaces,live.sections.publicBoundary.namespaceIdentity,'27 installed forwarder identities');
  assert.equal(proof.closure.exports,63);assert.deepEqual(proof.closure.files,live.sections.publicBoundary.closure.emitted.files,'Installed declaration closure');
  assert.deepEqual(multi.declarationClosure,proof.closure);
  assert.deepEqual(multi.runtimeExports,proof.runtime.publicNamespaces['./kernel']);
  const content=proof.contentSha256;assert(content&&Object.keys(content).length>0,'Installed artifact content hashes missing');
  for(const [file,hash] of Object.entries(content))assert.equal(sha(readFileSync(file)),hash,`Stale installed content: ${file}`);
  // Every declaration and JS implementation must be in the bound candidate artifact.
  for(const file of Object.keys(live.sections.declarations.sha256))assert.equal(content[file],proof.declarationSha256[file],file);
  for(const row of live.sections.dependencyGraph.graph){const file=row.file.startsWith('src/shared/')?`dist/${row.file.replace(/\.ts$/,'.js')}`:row.file.replace(/^src\//,'dist/').replace(/\.ts$/,'.js');assert(content[file],`Missing installed implementation ${file}`);}
  for(const file of ['README.md','VERSION','EXPORT-MANIFEST.json'])assert(content[file],`Missing package member ${file}`);
  assert.equal(multi.sameResolvedModule,true);assert.equal(multi.isolation.freshProcesses,3);
  assert.deepEqual(multi.isolation.forward,['text-rpg','vo-lam-25d','arpg']);assert.deepEqual(multi.isolation.reverse,['arpg','vo-lam-25d','text-rpg']);
  assert.equal(multi.isolation.repetitionsPerRun,3);assert.equal(multi.isolation.mutationAndPolicyReset,'PASS');assert.equal(multi.isolation.allComparisons,'PASS');
  assert.equal(multi.compilation.length,3);for(const row of multi.compilation){assert.equal(row.status,'PASS');assert.equal(row.options.strict,true);assert.equal(row.options.skipLibCheck,false);assert.equal(row.options.module,'NodeNext');assert.equal(row.options.moduleResolution,'NodeNext');}
  const ids=[];
  assert.equal(multi.consumers.length,3);
  for(const name of ['text-rpg','vo-lam-25d','arpg']){
   const expected=live.sections.consumers[name],oracle=JSON.parse(readFileSync(expected.file,'utf8'));
   const candidates=multi.consumers.filter(row=>row.name===name);assert.equal(candidates.length,1,name);const consumer=candidates[0];assert.equal(consumer.status,'PASS');
   assert.deepEqual(consumer.scenarios.map(row=>row.id),expected.ids,name);
   assert.equal(multi.oracleSha256[`${name}/expected.json`],sha(readFileSync(expected.file)),name);
   for(const [file,hash] of Object.entries(oracle.acceptedTraceProvenance.fixtureSha256)){
    assert.equal(sha(readFileSync('tests/consumers/'+file)),hash,file);assert.equal(multi.fixtureSha256[file],hash,file);
   }
   for(const [file,hash] of Object.entries(oracle.acceptedTraceProvenance.sourceSha256))assert.equal(sha(execFileSync('git',['show',`${oracle.acceptedTraceProvenance.revision}:${file}`])),hash,file);
   for(const row of consumer.scenarios){ids.push(row.id);assert.equal(row.status,'PASS');assert.deepEqual(row.handAnchors,oracle.hand[row.id],row.id);assert.equal(row.resultSha256,sha(JSON.stringify(oracle.observations[row.id])),row.id);assert.deepEqual(row.trace,oracle.observations[row.id].trace,row.id);}
  }
  assert.equal(ids.length,32);assert.equal(new Set(ids).size,32);
  assert.equal(legacy.revision,live.sections.consumers.legacy.revision);assert.equal(legacy.scenarios,61);
  assert.match(legacy.traceSha256,/^[0-9a-f]{64}$/,'Raw installed Legacy trace hash');
  const legacyOracle=JSON.parse(readFileSync('tests/fixtures/legacy-isolation-golden.json','utf8'));
  assert.equal(legacy.canonicalTraceSha256,digest(legacyOracle.scenarios),'Canonical installed Legacy trace');
  return {status:'PASS',diagnostics:[],archiveSha256:proof.package.archiveSha256,integrity:proof.package.integrity,legacyScenarios:61,multiRpgScenarios:32,installedScenarioExecutions:288,
   proof,multi,legacy,gameplayBoundary,completion:complete};
 }catch(error){diagnostics.push({code:'INSTALLED_ARTIFACT',detail:error.message});return {status:'FAIL',diagnostics};}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const started=performance.now(),live=await collectClosure();
 const evidence=JSON.parse(readFileSync(evidencePath)),manifest=JSON.parse(readFileSync(manifestPath));
 const freeze=validateFreeze(manifest,evidence,live);assert.equal(freeze.status,'PASS',JSON.stringify(freeze.diagnostics));
 const index=process.argv.indexOf('--installed-log'),log=index<0?'.git/v2.0.12-installed.log':process.argv[index+1];
 const installed=validateInstalled(parseInstalledLog(readFileSync(log,'utf8')),live);assert.equal(installed.status,'PASS',JSON.stringify(installed.diagnostics));
 assert.equal(evidence.installed?.status,'PASS','Durable installed evidence required');
 assert.equal(digest(evidence.installed.proof),digest(installed.proof),'Durable installed proof differs from fresh log');
 console.log(JSON.stringify({status:'PASS',gate:'BLOCKED — FINAL ARCHITECTURE / PRESERVATION REVIEW',revision,
  currentHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),changedFiles:protectedDiff().changedFiles,
  protectedDelta:[],preservation:'ZERO NEW PRESERVATION DELTA',sourceFiles:89,dependencyOccurrences:285,combinedSccs:live.sections.dependencyGraph.combinedSccs,runtimeSccs:[],
  entrypoints:11,legacyDeclarations:99,legacyNamespaces:27,delegationSites:24,kernel:{symbols:63,runtime:17},legacy:{symbols:243,runtime:122},
  installed:{status:installed.status,archiveSha256:installed.archiveSha256,integrity:installed.integrity,multiRpgScenarios:32,legacyScenarios:61,scenarioExecutions:288},
  manifestSha256:sha(readFileSync(manifestPath)),manifestStatus:manifest.identity.status,
  sectionSha256:Object.fromEntries(Object.entries(live.sections).map(([key,value])=>[key,digest(value)])),milliseconds:performance.now()-started,
  limitations:['Finite reviewed static calls/stores/writes; runtime traces supplement dynamic callbacks','Installer attestations bind verified bytes; archive is removed by existing harness cleanup','Archive identity is per run, not a cross-platform byte identity claim','Gate C full verification and exact-head CI remain unauthorized/pending']},null,2));
}
