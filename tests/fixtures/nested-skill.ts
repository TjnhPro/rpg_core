import {fixture,projectile,damage,timed} from './skill-core.js';
import {DEFAULT_INSTANT_AOE} from '../../src/contracts/mechanic-contracts.js';
import {pinSkillInstanceDefinition,pinSkillTriggerBundle,inspectSkillInstance,type SkillInstanceView,type SkillTriggerResult,type SkillTriggerLink,type SkillGameplayEffect} from '../../src/skills/index.js';

export function nestedFixture(options:{links?:number;delay?:number;rootLifetime?:number;childLifetime?:number;rootEffects?:SkillGameplayEffect[];childEffects?:SkillGameplayEffect[];ringCount?:number;session?:string}={}){
 const f=fixture(options.rootEffects??[projectile()],0,true,options.session??'nested');
 const bDamage={...damage(),rank:2,definition:{...damage().definition,base:20,perRank:.5}};
 const cDamage={...damage(),rank:3,definition:{...damage().definition,base:30,perRank:.5}};
 const root=pinSkillInstanceDefinition(f.definition,'v1',options.rootLifetime);
 const b=pinSkillInstanceDefinition({...f.definition,skillId:'explosion',targetMode:'ground',effects:options.childEffects??[{type:'instant_aoe',damage:bDamage,config:{...DEFAULT_INSTANT_AOE,radius:10,origin:'ground'}}]},'B-v2',options.childLifetime??100);
 const emitter=timed() as Extract<SkillGameplayEffect,{type:'timed_object'}>;
 const c=pinSkillInstanceDefinition({...f.definition,skillId:'ring',targetMode:'ground',effects:[{...emitter,config:{...emitter.config,bulletCount:options.ringCount??4},projectile:{...emitter.projectile,damage:cDamage}}]},'C-v3');
 const links:SkillTriggerLink[]=Array.from({length:options.links??1},(_,i)=>({linkId:'impact'+i,sourceSkillId:'test',childSkillId:'explosion',trigger:'OnImpact',delayMs:options.delay??0,maxOccurrences:128}));
 links.push({linkId:'expiry',sourceSkillId:'explosion',childSkillId:'ring',trigger:'OnExpire',delayMs:0,maxOccurrences:1});
 const bundle=pinSkillTriggerBundle({version:'nested-v1',rootSkillId:'test',definitions:[root,b,c],links});
 const results:SkillTriggerResult[]=[],observations:SkillInstanceView[]=[];
 const observe=(r:SkillTriggerResult)=>{results.push(r);if(r.receipt){const child=inspectSkillInstance(f.runtime,r.receipt.receiptId);if(child)observations.push(child);}};
 Object.assign(f.executionEnv,{...(options.rootLifetime===undefined?{}:{skillInstanceLifetimeMs:options.rootLifetime}),triggers:{bundle,executeChildren:true,observe}});
 return {...f,root,b,c,bundle,results,observations,observe,accepted:()=>results.filter(r=>r.status==='accepted')};
}
