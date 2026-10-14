import type { DamageContext } from '../data/damage-contracts.js';
import type { DotConfig } from '../data/dot-contracts.js';
import { calculateDamage,type DamageSnapshot } from './damage-core.js';
import { damageBonusReason } from './modifier-core.js';

export interface DotStack<S extends string=string> {skillId:S;tags:string[];snapshot:DamageSnapshot}

export interface DotGroup<S extends string=string> {targetId:string;sourcePlayerId:string;effectId:DotConfig['effectId'];config:DotConfig;remainingMs:number;nextTickMs:number;stacks:DotStack<S>[]}

export interface DotRuntime<S extends string=string> {groups:DotGroup<S>[]}

/** Existing stack admission, generalized only at the actor/snapshot boundary. */
export function applyDotSnapshot<S extends string>(runtime:DotRuntime<S>,targetId:string,sourceId:string,skillId:S,config:DotConfig,snapshot:()=>DamageSnapshot):boolean {
 if(!config.enabled)return false;
 let group=runtime.groups.find(g=>g.targetId===targetId&&g.sourcePlayerId===sourceId&&g.effectId===config.effectId);
 if(group&&group.stacks.length>=group.config.maxStacks||!group&&runtime.groups.length>=6000)return false;
 const frozen=structuredClone(snapshot());
 const type=config.tags.includes('Magic')?'magic':'physical';
 frozen.flatModifiers=frozen.flatModifiers.filter(m=>((m.damageType??'all')==='all'||m.damageType===type)&&['dot','all'].includes(m.scope??'direct'));
 frozen.bonusModifiers=frozen.bonusModifiers.filter(m=>damageBonusReason(m,{type:type==='magic'?'Magic':'Physical',tags:config.tags,target:'Normal',statuses:[],defender:{source:{id:sourceId},target:{id:targetId},mechanic:'dot'}},true)==='eligible');
 if(!group){group={targetId,sourcePlayerId:sourceId,effectId:config.effectId,config:structuredClone(config),remainingMs:config.durationMs,nextTickMs:config.firstTickMs,stacks:[]};runtime.groups.push(group);}
 group.remainingMs=group.config.durationMs;
 group.stacks.push({skillId,tags:[...config.tags],snapshot:frozen});return true;
}

export function tickDotRuntime<S extends string>(runtime:DotRuntime<S>,ms:number,onTick:(group:DotGroup<S>)=>void,active:()=>boolean=()=>true){
 for(const g of runtime.groups){g.remainingMs=Math.max(0,g.remainingMs-ms);g.nextTickMs=Math.max(0,g.nextTickMs-ms);}
 for(const g of [...runtime.groups]){
  if(!runtime.groups.includes(g))continue;
  if(g.remainingMs<=1e-6){runtime.groups=runtime.groups.filter(n=>n!==g);continue;}
  if(g.nextTickMs>1e-6)continue;
  g.nextTickMs=g.config.tickIntervalMs;onTick(g);
  if(!active())break;
  g.stacks.shift();if(!g.stacks.length)runtime.groups=runtime.groups.filter(n=>n!==g);
 }
}

export function dotDamage(group:DotGroup<string>,context:DamageContext,armor:number){
 const breakdowns=group.stacks.map(s=>calculateDamage({...s.snapshot,context:{...context,type:s.tags.includes('Magic')?'Magic':'Physical',tags:s.tags,eventTags:s.tags,defender:{...context.defender,source:context.defender?.source??{id:group.sourcePlayerId},target:context.defender?.target??{id:group.targetId},mechanic:'dot'}},armor,criticalChance:0,criticalBonus:0,roll:1}));
 return {amount:breakdowns.reduce((n,b)=>n+b.finalDamage,0),breakdowns};
}
