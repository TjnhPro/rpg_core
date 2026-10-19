import {beforeAll,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
// @ts-expect-error Private verification tooling has no public declarations.
import {releaseState,validateReleaseState} from '../../scripts/release-transition.mjs';
// @ts-expect-error Private verification tooling has no public declarations.
import {collectClosure,validateFreeze,validateReleaseClosure,evidencePath,manifestPath} from '../../scripts/audit-architecture-closure.mjs';
type Data=Record<string,any>; // heterogeneous private evidence, not public contracts
let state:Data,live:Data,evidence:Data,manifest:Data;
beforeAll(async()=>{
 state=releaseState();live=await collectClosure({mode:'release'});
 evidence=JSON.parse(readFileSync(evidencePath,'utf8'));manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
},60000);
it('historical 1.0.0 snapshot control retains all eight accepted section hashes',()=>{
 expect(validateFreeze(manifest,evidence,evidence)).toEqual({status:'PASS',diagnostics:[]});
 expect(evidence.sections.publicBoundary.package.version).toBe('1.0.0');
});
it('actual authorized 2.0.0 candidate passes the distinct release comparator',()=>{
 expect(validateReleaseState(state)).toEqual({status:'PASS',diagnostics:[]});
 expect(validateReleaseClosure(manifest,evidence,live,state)).toEqual({status:'PASS',diagnostics:[]});
 expect(validateFreeze(manifest,evidence,live).status).toBe('FAIL');
});
const metadataChange=(s:Data,file:string,change:(p:Data)=>void)=>{
 const p=JSON.parse(s.metadata[file]);change(p);s.metadata[file]=JSON.stringify(p);
};
const mutations:[string,string,(s:Data)=>void][]=[
 ['unauthorized version','RELEASE_VERSION',s=>metadataChange(s,'package.json',p=>p.version='2.0.1')],
 ['export modification','RELEASE_METADATA',s=>metadataChange(s,'package.json',p=>delete p.exports['./stats'])],
 ['dependency change','RELEASE_METADATA',s=>metadataChange(s,'package.json',p=>p.devDependencies.typescript='0.0.0')],
 ['lockfile dependency graph','RELEASE_METADATA',s=>metadataChange(s,'package-lock.json',p=>p.packages['node_modules/typescript'].version='0.0.0')],
 ['private removal','RELEASE_METADATA',s=>metadataChange(s,'package.json',p=>delete p.private)],
 ['unapproved extra file','RELEASE_FILE',s=>s.changedFiles.push('extra-unapproved.md')],
 ['production edit path','RELEASE_FILE',s=>s.changedFiles.push('src/kernel/index.ts')],
 ['tampered record','RELEASE_AUTHORIZATION',s=>s.record.approval.authority='self-approved'],
 ['relaxed allowlist','RELEASE_AUTHORIZATION',s=>s.record.documentationFiles.push('src/kernel/index.ts')],
 ['record authorizes itself','RELEASE_AUTHORIZATION',s=>s.record.toolingChanges['docs/releases/v2.0.0-transition.json']='any edits'],
];
for(const [name,code,change] of mutations)it(name+': valid control and intended rejection',()=>{
 expect(validateReleaseState(state).status).toBe('PASS');const candidate=structuredClone(state);change(candidate);
 const result=validateReleaseState(candidate);expect(result.status).toBe('FAIL');expect(result.diagnostics.some((d:Data)=>d.code===code)).toBe(true);
});
const boundaryMutations:[string,string,(l:Data)=>void][]=[
 ['symbol substitution','PUBLIC_SYMBOL',l=>l.sections.publicBoundary.inventories['./kernel'][0].name='rogue'],
 ['declaration bytes','DECLARATION_HASH',l=>l.sections.declarations.sha256['dist/index.d.ts']='0'.repeat(64)],
 ['production bytes','SOURCE_INTEGRITY',l=>l.sections.sourceIntegrity.sourceSha256['src/index.ts']='0'.repeat(64)],
 ['numerical oracle','ACCEPTED_ORACLE',l=>l.sections.oracles['tests/fixtures/stat-parity-golden.json']='0'.repeat(64)],
 ['approval history','PRESERVATION_HISTORY',l=>l.sections.preservation.records[10].approvedChange.authority='self-approved'],
];
for(const [name,code,change] of boundaryMutations)it(name+': release control and exact architecture rejection',()=>{
 expect(validateReleaseClosure(manifest,evidence,live,state).status).toBe('PASS');const candidate=structuredClone(live);change(candidate);
 const result=validateReleaseClosure(manifest,evidence,candidate,state);expect(result.status).toBe('FAIL');expect(result.diagnostics.some((d:Data)=>d.code===code)).toBe(true);
});
