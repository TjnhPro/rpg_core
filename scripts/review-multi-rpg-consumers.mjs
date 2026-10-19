// Read-only reviewer: stdout only, never modifies source/oracles/baselines.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const revision='436cc35a17389a54e05843ec8efbcfc5c1604295';
const sha=value=>createHash('sha256').update(value).digest('hex');
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const originalCache=new Map();
const original=file=>{
  if(!originalCache.has(file))originalCache.set(file,execFileSync('git',['show',`${revision}:${file}`],{maxBuffer:32*1024*1024}));
  return originalCache.get(file);
};
execFileSync('git',['merge-base','--is-ancestor',revision,'HEAD']);
const protectedPaths=['src','package.json','package-lock.json','tsconfig.json','tsconfig.tests.json','tsconfig.examples.json','vitest.config.ts','docs/behavior-baseline.json','scripts/check-architecture.mjs','scripts/check-preservation.mjs'];
assert.equal(git(['diff','--name-only',revision,'--',...protectedPaths]),'','Protected production/metadata/baseline delta');
assert.equal(git(['ls-files','--others','--exclude-standard','--','src']),'');
const oldTests=git(['ls-tree','-r','--name-only',revision,'tests']).split('\n');
assert.equal(git(['diff','--name-only',revision,'--',...oldTests]),'','Existing tests/goldens must remain unchanged');
const prior=JSON.parse(execFileSync(process.execPath,['scripts/review-legacy-isolation.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
assert.equal(prior.status,'PASS');assert.equal(prior.legacyDeclarationsByteIdentical,99);assert.equal(prior.preservationModulesUnchanged,27);
const names=['text-rpg','vo-lam-25d','arpg'];
// Review metadata is consumer-specific. Preserve the accepted numerical oracle
// files byte-for-byte, including their original capture metadata.
const handProvenance={
  'text-rpg':'Fixed hand-calculated Text RPG T1-T9 Gate A anchors: turn-based stats, attack/defend, resources, RNG, dynamic identifiers and numerical edge cases. Supplemental full traces come from accepted Git blobs only.',
  'vo-lam-25d':'Fixed hand-calculated Vo Lam V1-V10 Gate A anchors: distinct external/internal stats, damage sources, contact policy, cooldown/resource transitions and snapshot/equipment observations. Supplemental full traces come from accepted Git blobs only.',
  arpg:'Fixed hand-calculated ARPG A1-A13 Gate A anchors; snapshot A7 uses full typed stat graph with aliased rules, captured power 64.5 + might12 = 76.5. No candidate-derived expectations.',
};
const logIndex=process.argv.indexOf('--installed-log');
const logPath=logIndex<0?'.git/v2.0.11-installed.log':process.argv[logIndex+1];
const lines=readFileSync(logPath,'utf8').split(/\r?\n/);
const records=lines.filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
const installed=records.find(item=>item.status==='MULTI_RPG_CONSUMERS_PASS');
const complete=records.find(item=>item.status==='MULTI_RPG_VERIFICATION_COMPLETE');
assert(installed&&complete,'Complete successful installed run required; rerun npm run test:consumer with stdout saved');
assert.equal(complete.installerSha256,sha(readFileSync('scripts/consumer-smoke.mjs')),'Stale installer run');
assert.equal(complete.archiveSha256,installed.package.archiveSha256);
assert.equal(installed.revision,revision);assert.equal(installed.package.oneArtifact,true);
assert.equal(installed.package.integrityVerified,true);assert.equal(installed.package.installedIntegrityVerified,true);
assert.equal(installed.declarationClosure.exports,63);assert.equal(installed.declarationClosure.files.length,16);
assert.deepEqual(installed.runtimeExports,prior.kernelRuntimeExports);
for(const [file,hash] of Object.entries(installed.kernelFileSha256))assert.equal(sha(readFileSync(file)),hash,file);
const fixtureHashes={},oracleHashes={},consumerMatrix=[];
for(const name of names){
  const oracleFile=`tests/consumers/${name}/expected.json`;
  const oracle=JSON.parse(readFileSync(oracleFile,'utf8')),provenance=oracle.acceptedTraceProvenance;
  assert.equal(provenance.revision,revision);
  for(const [file,hash] of Object.entries(provenance.sourceSha256))assert.equal(sha(original(file)),hash,file);
  for(const [file,hash] of Object.entries(provenance.fixtureSha256)){
    const current=sha(readFileSync('tests/consumers/'+file));assert.equal(current,hash,file);assert.equal(installed.fixtureSha256[file],hash,file);fixtureHashes[file]=hash;
  }
  oracleHashes[name]=sha(readFileSync(oracleFile));assert.equal(installed.oracleSha256[name+'/expected.json'],oracleHashes[name]);
  const actual=installed.consumers.find(item=>item.name===name);assert(actual);assert.equal(actual.status,'PASS');
  assert.deepEqual(actual.scenarios.map(row=>row.id),Object.keys(oracle.hand));
  for(const row of actual.scenarios){
    assert.deepEqual(row.handAnchors,oracle.hand[row.id],row.id);
    assert.equal(row.resultSha256,sha(JSON.stringify(oracle.observations[row.id])),row.id);
    assert.deepEqual(row.trace,oracle.observations[row.id].trace,row.id);
  }
  const source=readFileSync(`tests/consumers/${name}/scenarios.ts`,'utf8');
  const ast=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true),imports=[];
  for(const statement of ast.statements)if(ts.isImportDeclaration(statement)){
    const spec=statement.moduleSpecifier.text;assert(['@rpg/core/kernel','./config.js','../observations.js'].includes(spec));
    if(spec==='@rpg/core/kernel')for(const item of statement.importClause.namedBindings.elements)imports.push(item.name.text);
  }
  consumerMatrix.push({name,scenarioCount:actual.scenarios.length,apis:imports.sort(),oracle:oracleFile,oracleSha256:oracleHashes[name],handProvenance:handProvenance[name],
    scenarios:actual.scenarios.map(row=>({id:row.id,status:row.status,expected:oracle.hand[row.id],actual:row.handAnchors,resultSha256:row.resultSha256,trace:row.trace,fullInputOutput:oracleFile+'#/observations/'+row.id}))});
}
assert.equal(consumerMatrix.reduce((sum,row)=>sum+row.scenarioCount,0),32);
const sourceFiles=git(['ls-tree','-r','--name-only',revision,'src']).split('\n');
const sourceSha256=Object.fromEntries(sourceFiles.map(file=>{
  const before=sha(original(file)),raw=readFileSync(file),normalized=sha(raw.toString().replaceAll('\r\n','\n'));assert.equal(normalized,before,file);
  return [file,{acceptedGit:before,currentLF:normalized,workingTreeBytes:sha(raw)}];
}));
const baseline=readFileSync('docs/behavior-baseline.json');assert.equal(sha(baseline.toString().replaceAll('\r\n','\n')),sha(original('docs/behavior-baseline.json')));
const oldGoldens=oldTests.filter(file=>file.endsWith('.json'));
const historicalGoldenHashes=Object.fromEntries(oldGoldens.map(file=>{const current=sha(readFileSync(file,'utf8').replaceAll('\r\n','\n'));assert.equal(current,sha(original(file)),file);return [file,current];}));
const allowed=[...names.flatMap(name=>['config.ts','scenarios.ts','expected.json'].map(file=>`tests/consumers/${name}/${file}`)),
  'tests/consumers/.gitattributes','tests/consumers/observations.ts','tests/consumers/multi-rpg-verification.test.ts','scripts/consumer-smoke.mjs','scripts/capture-multi-rpg-oracle.mjs','scripts/review-multi-rpg-consumers.mjs',
  'docs/v2/rpg-core-v2.0.11-implementation-plan.md','docs/v2/2.0.11-multi-rpg-consumer-verification.md','docs/v2/2.0.11-multi-rpg-consumer-evidence.json','docs/test-coverage.md'];
const changedFiles=[...new Set([...git(['diff','--name-only',revision]).split('\n'),...git(['ls-files','--others','--exclude-standard']).split('\n')].filter(Boolean))].sort();
for(const file of changedFiles)assert(allowed.includes(file),'Unapproved file: '+file);
const testLogs=[['.git/v2.0.11-targeted.log',49,1],['.git/v2.0.11-regression.log',942,21],['.git/v2.0.11-legacy-regression.log',69,1]];
const targetedTests=testLogs.map(([file,tests,files])=>{
  const content=readFileSync(file,'utf8').replace(/\x1b\[[0-9;]*m/g,'');
  assert(new RegExp('Tests\\s+'+tests+' passed').test(content),file);assert(new RegExp('Test Files\\s+'+files+' passed').test(content),file);
  return {file,tests,files,sha256:sha(readFileSync(file)),duration:content.match(/Duration\s+([^\r\n]+)/)?.[1]};
});
console.log(JSON.stringify({status:'PASS',gate:'GATE B APPROVED — FINAL IMPLEMENTATION REVIEW PENDING',revision,currentHead:git(['rev-parse','HEAD']),
  productionSourceDelta:[],packageMetadataDelta:[],preservationDelta:'ZERO PRESERVATION DELTA',approvalHistoryUnchanged:true,preservationModulesUnchanged:27,
  baselineSha256:sha(baseline),historicalGoldenHashes,existingTestsUnchanged:oldTests.length,
  symbolSets:prior.symbolSets,kernelSymbols:prior.kernelSymbols,kernelRuntimeExports:prior.kernelRuntimeExports,
  legacyDeclarationsByteIdentical:99,kernelDeclarationsByteIdentical:true,closure:prior.closure,sourceSha256,declarationSha256:prior.declarationSha256,moduleFingerprints:prior.moduleFingerprints,
  acceptedTraceProvenance:{revision,source:'Git blobs only',handAnchors:'Separate fixed Gate A vectors; compared before supplemental capture',fixtureHashes,oracleHashes},
  consumerMatrix,installed,installationCompletion:complete,targetedTests,targetedTotals:{tests:1060,files:23},changedFiles,
  limitations:['Finite deterministic fixtures, not complete games or commercial formula fidelity','API import/call inventory is static; numerical results and traces supply runtime evidence','Runtime optional undefined edge deliberately exceeds exactOptionalPropertyTypes construction rules; public types unchanged','Local Node24; exact-head remote Node22.13.0/24 CI is reported separately after push']},null,2));
