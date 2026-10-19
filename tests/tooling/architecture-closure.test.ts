import {beforeAll,expect,it} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
// @ts-expect-error Private read-only JS tooling has no public declarations.
import {collectClosure,validateReleaseClosure,sha,digest,revision,evidencePath,manifestPath,stronglyConnected} from '../../scripts/audit-architecture-closure.mjs';
// @ts-expect-error Private reviewer, not a shipped API.
import {validateInstalled} from '../../scripts/review-architecture-closure.mjs';
// @ts-expect-error Existing private adversarial fixture definitions.
import {cases as gameplayCases} from '../fixtures/gameplay-boundary-audit.mjs';

type Data = Record<string,any>; // heterogeneous JSON evidence, not production contracts
let live:Data,evidence:Data,manifest:Data;
beforeAll(async()=>{
 live=await collectClosure({mode:'release'});evidence=JSON.parse(readFileSync(evidencePath,'utf8'));manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
},60000);
const check=(m=manifest,e=evidence,l=live)=>validateReleaseClosure(m,e,l);
it('validates the live source/emitted candidate without local installed logs',()=>{
 expect(check()).toEqual({status:'PASS',diagnostics:[]});
 expect(live.sections.dependencyGraph.files).toBe(89);expect(live.sections.dependencyGraph.occurrences).toBe(285);
 expect(live.sections.dependencyGraph.combinedSccs).toHaveLength(2);expect(live.sections.dependencyGraph.runtimeSccs).toEqual([]);
 expect(live.sections.publicBoundary.namespaceIdentity).toHaveLength(27);
 expect(live.sections.declarations.legacyFiles).toBe(99);expect(live.sections.preservation.records).toHaveLength(27);
 expect(live.sections.ownership.directSites).toBe(24);
});
const corruptions:[string,string,(m:Data,e:Data,l:Data)=>void][]=[
 ['wrong accepted revision','BASELINE_IDENTITY',m=>m.identity.acceptedStartingRevision='0'.repeat(40)],
 ['premature freeze activation','FREEZE_MANIFEST',m=>m.identity.status='FROZEN'],
 ['embedded containing commit','FREEZE_MANIFEST',m=>m.identity.finalCommit='0'.repeat(40)],
 ['missing schema section','FREEZE_MANIFEST',m=>delete m.sections.declarations],
 ['missing referenced inventory','FREEZE_MANIFEST',(_m,e)=>delete e.sections.oracles],
 ['corrupted reference digest','FREEZE_MANIFEST',m=>m.sections.oracles.sha256='0'.repeat(64)],
 ['redirected reference file','FREEZE_MANIFEST',m=>m.sections.oracles.file='../unreviewed.json'],
 ['wrong JSON pointer','FREEZE_MANIFEST',m=>m.sections.oracles.pointer='/unreviewed'],
 ['missing governance','FREEZE_MANIFEST',m=>delete m.governance.capability],
 ['weakened exact-head CI','FREEZE_MANIFEST',m=>m.verificationRequirements.ci.exactHead=false],
 ['removed package entrypoint','PUBLIC_SYMBOL',(_m,_e,l)=>delete l.sections.publicBoundary.package.exports['./stats']],
 ['same-count symbol substitution','PUBLIC_SYMBOL',(_m,_e,l)=>l.sections.publicBoundary.inventories['./stats'][0].name='unapproved'],
 ['type/value substitution','PUBLIC_SYMBOL',(_m,_e,l)=>l.sections.publicBoundary.inventories['./kernel'][0].value=true],
 ['changed symbol origin','PUBLIC_SYMBOL',(_m,_e,l)=>l.sections.publicBoundary.inventories['./kernel'][0].origin='src/skills/rogue.ts#Public'],
 ['changed emitted byte hash','DECLARATION_HASH',(_m,_e,l)=>l.sections.declarations.sha256['dist/index.d.ts']='0'.repeat(64)],
 ['omitted dependency edge','DEPENDENCY_GRAPH',(_m,_e,l)=>l.sections.dependencyGraph.graph.find((r:Data)=>r.edges.length).edges.pop()],
 ['reclassified runtime cycle','DEPENDENCY_GRAPH',(_m,_e,l)=>l.sections.dependencyGraph.runtimeSccs.push(['src/skills/skill-instance.ts','src/skills/skill-trigger.ts'])],
 ['changed canonical owner','CANONICAL_OWNER',(_m,_e,l)=>l.sections.ownership.canonicalPublicApis[0].origin='src/damage/rogue.ts#calculate'],
 ['missing direct delegate','CANONICAL_OWNER',(_m,_e,l)=>l.sections.ownership.direct.pop()],
 ['unauthorized runtime store','CANONICAL_OWNER',(_m,_e,l)=>l.sections.ownership.stores.push('src/skills/rogue.ts#queue:Map')],
 ['changed source hash','SOURCE_INTEGRITY',(_m,_e,l)=>l.sections.sourceIntegrity.sourceSha256['src/index.ts']='0'.repeat(64)],
 ['changed nested approval history','PRESERVATION_HISTORY',(_m,_e,l)=>l.sections.preservation.records[10].approvedChange.authority='self-approved'],
 ['changed preservation membership','PRESERVATION_HISTORY',(_m,_e,l)=>l.sections.preservation.records[10].currentFiles.pop()],
 ['changed accepted oracle','ACCEPTED_ORACLE',(_m,_e,l)=>l.sections.oracles['tests/fixtures/stat-parity-golden.json']='0'.repeat(64)],
 ['missing consumer scenario','CONSUMER_COVERAGE',(_m,_e,l)=>l.sections.consumers['text-rpg'].ids.pop()],
 ['duplicated Legacy observation','CONSUMER_COVERAGE',(_m,_e,l)=>l.sections.consumers.legacy.scenarios.push(l.sections.consumers.legacy.scenarios[0])],
];
for(const [name,code,change] of corruptions)it(name+': valid control and exact inventory rejection',()=>{
 expect(check().status).toBe('PASS');
 const m=structuredClone(manifest),e=structuredClone(evidence),l=structuredClone(live);change(m,e,l);
 const rejected=check(m,e,l);expect(rejected.status).toBe('FAIL');expect(rejected.diagnostics.some((d:Data)=>d.code===code)).toBe(true);
});
it('rejects simultaneous manifest/evidence rebaselining against the unchanged live candidate',()=>{
 const m=structuredClone(manifest),e=structuredClone(evidence);
 e.sections.publicBoundary.inventories['./stats'][0].name='substituted';m.sections.publicBoundary.sha256=digest(e.sections.publicBoundary);
 expect(check(m,e).diagnostics.some((d:Data)=>d.code==='PUBLIC_SYMBOL')).toBe(true);
});
it('classifies type SCCs separately and recognises runtime cycles including self loops',()=>{
 const graph=[{file:'a',edges:[{to:'b',kind:'type'}]},{file:'b',edges:[{to:'a',kind:'runtime'}]}];
 expect(stronglyConnected(graph)).toEqual([['a','b']]);expect(stronglyConnected(graph,true)).toEqual([]);
 graph[0]!.edges[0]!.kind='runtime';expect(stronglyConnected(graph,true)).toEqual([['a','b']]);
 expect(stronglyConnected([{file:'a',edges:[{to:'a',kind:'runtime'}]}],true)).toEqual([['a']]);
});

// Synthetic validator controls only. No installer, numerical execution, oracle
// capture or local log is needed in npm test; real installed evidence runs later.
function installedControl():Data[]{
 const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(dir+'/'+e.name):[dir+'/'+e.name]);
 const contentSha256=Object.fromEntries([...files('dist'),'README.md','VERSION','EXPORT-MANIFEST.json'].map(file=>[file,sha(readFileSync(file))]));
 const packageIdentity={name:'@rpg/core',version:'2.0.0',archiveSha256:'1'.repeat(64),integrity:'sha512-'+Buffer.alloc(64).toString('base64'),integrityVerified:true,installedIntegrityVerified:true,oneArtifact:true};
 const closure={exports:63,files:live.sections.publicBoundary.closure.emitted.files};
 const installerSha256=sha(readFileSync('scripts/consumer-smoke.mjs'));
 const names=['text-rpg','vo-lam-25d','arpg'];const fixtureSha256:Data={},oracleSha256:Data={};
 const consumers=names.map(name=>{
  const file=live.sections.consumers[name].file,oracle=JSON.parse(readFileSync(file,'utf8'));
  Object.assign(fixtureSha256,oracle.acceptedTraceProvenance.fixtureSha256);oracleSha256[name+'/expected.json']=sha(readFileSync(file));
  return {name,status:'PASS',scenarios:Object.keys(oracle.hand).map(id=>({id,status:'PASS',handAnchors:oracle.hand[id],resultSha256:sha(JSON.stringify(oracle.observations[id])),trace:oracle.observations[id].trace}))};
 });
 return [
  {status:'INSTALLED_ARCHITECTURE_CLOSURE_PASS',revision,package:packageIdentity,inventories:live.sections.publicBoundary.inventories,declarationSha256:live.sections.declarations.sha256,
   runtime:{publicNamespaces:live.sections.publicBoundary.runtimeNamespaces,historicalNamespaces:live.sections.publicBoundary.namespaceIdentity},closure,contentSha256,installerSha256,inventoryToolSha256:sha(readFileSync('scripts/audit-architecture-closure.mjs'))},
  {status:'MULTI_RPG_CONSUMERS_PASS',package:packageIdentity,declarationClosure:closure,runtimeExports:live.sections.publicBoundary.runtimeNamespaces['./kernel'],sameResolvedModule:true,
   isolation:{freshProcesses:3,forward:names,reverse:[...names].reverse(),repetitionsPerRun:3,mutationAndPolicyReset:'PASS',allComparisons:'PASS'},
   compilation:names.map(consumer=>({consumer,status:'PASS',options:{strict:true,skipLibCheck:false,module:'NodeNext',moduleResolution:'NodeNext'}})),consumers,fixtureSha256,oracleSha256},
  {status:'INSTALLED_LEGACY_ISOLATION_PASS',revision:live.sections.consumers.legacy.revision,scenarios:61,traceSha256:'2'.repeat(64),canonicalTraceSha256:digest(JSON.parse(readFileSync('tests/fixtures/legacy-isolation-golden.json','utf8')).scenarios)},
  {status:'MULTI_RPG_VERIFICATION_COMPLETE',installerSha256,archiveSha256:packageIdentity.archiveSha256},
  {status:'INSTALLED_GAMEPLAY_BOUNDARY_VERIFIED',controls:gameplayCases.length,rejected:gameplayCases.length,cases:gameplayCases.map((row:Data)=>({case:row.name,diagnostic:'forbidden declaration'}))},
 ];
}
const installedMutations:[string,(rows:Data[])=>void][]=[
 ['mixed artifact',r=>r[3]!.archiveSha256='2'.repeat(64)],
 ['missing completion',r=>r.splice(3,1)],
 ['duplicate success record',r=>r.push(r[0]!)],
 ['stale installer',r=>r[3]!.installerSha256='0'.repeat(64)],
 ['changed installed symbol origin',r=>r[0]!.inventories['./stats'][0].origin='src/rogue.ts#f'],
 ['missing installed declaration',r=>delete r[0]!.declarationSha256['dist/index.d.ts']],
 ['changed historical namespace',r=>r[0]!.runtime.historicalNamespaces.pop()],
 ['missing package implementation',r=>delete r[0]!.contentSha256['dist/kernel/index.js']],
 ['stale package content',r=>r[0]!.contentSha256['README.md']='0'.repeat(64)],
 ['broken consumer isolation',r=>r[1]!.isolation.allComparisons='FAIL'],
 ['numerical observation mismatch',r=>r[1]!.consumers[0].scenarios[0].resultSha256='0'.repeat(64)],
 ['missing installed Legacy scenario',r=>r[2]!.scenarios=60],
 ['changed installed Legacy trace',r=>r[2]!.canonicalTraceSha256='0'.repeat(64)],
 ['missing installed gameplay pair',r=>r[4]!.cases.pop()],
];
for(const [name,change] of installedMutations)it(name+': synthetic valid control and installed-evidence rejection',()=>{
 const control=installedControl();expect(validateInstalled(control,live,{mode:'release'}).status).toBe('PASS');
 const invalid=structuredClone(control);change(invalid);
 const rejected=validateInstalled(invalid,live,{mode:'release'});expect(rejected.status).toBe('FAIL');expect(rejected.diagnostics[0].code).toBe('INSTALLED_ARTIFACT');
},30000);

for(const [name,change,reason] of [
 ['installed release version mismatch',(rows:Data[])=>{rows[0]!.package.version='1.0.0';},'Installed package version mismatch'],
 ['installed artifact integrity mismatch',(rows:Data[])=>{rows[0]!.package={...rows[0]!.package,integrity:'sha512-'+Buffer.alloc(64,1).toString('base64')};},'Mixed installed artifacts'],
 ['installed integrity not verified',(rows:Data[])=>{rows[0]!.package.integrityVerified=false;},'integrityVerified'],
] as [string,(rows:Data[])=>void,string][])it(name+': exact intended rejection',()=>{
 const rows=installedControl();expect(validateInstalled(rows,live,{mode:'release'}).status).toBe('PASS');change(rows);
 const result=validateInstalled(rows,live,{mode:'release'});expect(result.status).toBe('FAIL');expect(result.diagnostics[0].detail).toContain(reason);
});
