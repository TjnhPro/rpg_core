// Release authorization is separate from the immutable architecture snapshot.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const accepted='e99d36e4345e14486ec40448ad8df872d3a44a57';
export const merge='cc7affbcc01decd1fda9ec4b0d7f9f55ba3fda87';
export const transitionPath='docs/releases/v2.0.0-transition.json';
const recordHash='4851192391dffb4acdfa3dce8220de4c4f663492aaaa2ec4c644591490f13153';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const hash=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024,stdio:'pipe'}).trim();
export const originalReleaseFile=file=>execFileSync('git',['show',`${accepted}:${file}`],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:'pipe'});
export function releaseState(){
 const changedFiles=[...new Set([...git(['diff','--name-only',accepted]).split('\n'),...git(['ls-files','--others','--exclude-standard']).split('\n')].filter(Boolean))].sort();
 const metadata=Object.fromEntries(['package.json','package-lock.json','VERSION'].map(f=>[f,readFileSync(f,'utf8')]));
 const original=Object.fromEntries(Object.keys(metadata).map(f=>[f,originalReleaseFile(f)]));
 return {record:JSON.parse(readFileSync(transitionPath,'utf8')),changedFiles,metadata,original};
}
export function validateReleaseState(state){
 const diagnostics=[],fail=(code,detail)=>diagnostics.push({code,detail});
 // Hash is pinned in reviewed tooling, not read from the mutable record itself.
 if(hash(state.record)!==recordHash)return {status:'FAIL',diagnostics:[{code:'RELEASE_AUTHORIZATION',detail:'Transition record differs from exact Developer-approved scope'}]};
 const allowed=[transitionPath,...Object.keys(state.record.metadata),...state.record.documentationFiles,...Object.keys(state.record.toolingChanges)];
 for(const file of state.changedFiles)if(!allowed.includes(file))fail('RELEASE_FILE',`Unapproved changed file: ${file}`);
 try{
  for(const file of ['package.json','package-lock.json']){
   const before=JSON.parse(state.original[file]),actual=JSON.parse(state.metadata[file]),expected=structuredClone(before);
   expected.version='2.0.0';if(file==='package-lock.json')expected.packages[''].version='2.0.0';
   if(before.version!=='1.0.0'||actual.version!=='2.0.0'||file==='package-lock.json'&&actual.packages[''].version!=='2.0.0')fail('RELEASE_VERSION',file);
   if(!equal(actual,expected))fail('RELEASE_METADATA',`${file}: only approved version fields may change`);
  }
  if(state.original.VERSION.trim()!=='v1.0-snapshot-20261013-b'||state.metadata.VERSION.replaceAll('\r\n','\n')!=='v2.0.0\n')fail('RELEASE_VERSION','Exact VERSION identifier');
 }catch(error){fail('RELEASE_METADATA',error.message);}
 return {status:diagnostics.length?'FAIL':'PASS',diagnostics};
}
export function requireRelease(){
 execFileSync('git',['merge-base','--is-ancestor',merge,'HEAD']);
 const state=releaseState(),result=validateReleaseState(state);
 if(result.status!=='PASS')throw Error(JSON.stringify(result));
 return state;
}
