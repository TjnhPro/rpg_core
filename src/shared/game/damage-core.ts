import type { CombatModifier } from '../data/combat-modifiers.js';
import { DAMAGE_SOURCES,type DamageContext,type DamageDefinition,type DamageSettings,type DamageSource } from '../data/damage-contracts.js';
import type { CombatEntityIdentity } from './combat-entity.js';
import { mitigateDefense,resolveDefenseHit,type DefenseConfigSnapshot } from './defense-engine.js';
import { damageBonusReason,prepareModifierResolver,resolveModifiers } from './modifier-core.js';


// Up to100 legacy damage settings plus256 Foundation registry entries.
export const MAX_DAMAGE_SNAPSHOT_MODIFIERS=356;


export function calculateDamage(input:{definition:DamageDefinition;sources:Record<DamageSource,number>;settings:DamageSettings;context:DamageContext;attacker?:CombatEntityIdentity;rank?:number;flat?:number;flatModifiers?:CombatModifier[];bonusModifiers?:CombatModifier[];options?:{id:string;value:number;source?:string}[];criticalChance:number;criticalBonus:number;roll:number|(()=>number);dodgeRoll?:number|(()=>number);armor?:number;defenseConfig?:DefenseConfigSnapshot|undefined}){
 // Runtime-owned identities and live defense, not client request fields.
 const entities=input.context.entities?{...input.context.entities,attacker:input.attacker??input.context.entities.attacker}:undefined;
 if(entities){
  input={...input,armor:entities.defenderStats.armor,context:{...input.context,target:entities.defender.targetTags.includes('boss')?'Boss':entities.defender.targetTags.includes('elite')?'Elite':'Normal',defender:{...input.context.defender,mechanic:input.context.defender?.mechanic??'direct_hit',source:{id:entities.attacker.entityId,level:entities.attacker.level},target:{id:entities.defender.entityId,level:entities.defender.level},dodgeChance:entities.defenderStats.dodgeChance,magicResistanceRating:entities.defenderStats.magicResistance}}};
 }
 const flatModifiers=input.flatModifiers??[];
 if(!Array.isArray(flatModifiers)||flatModifiers.length>256||flatModifiers.some(m=>!m||m.target!=='flat_damage'))throw Error('Invalid Flat Damage snapshot');
 const canonicalFlat=prepareModifierResolver(flatModifiers)(0,'flat_damage').contributions;
 const bonusModifiers=input.bonusModifiers??[];
 if(!Array.isArray(bonusModifiers)||bonusModifiers.length>256||bonusModifiers.some(m=>!m||m.target!=='damage_bonus'))throw Error('Invalid Damage Bonus snapshot');
 if(flatModifiers.length+bonusModifiers.length>256||input.settings.modifiers.length+bonusModifiers.length>MAX_DAMAGE_SNAPSHOT_MODIFIERS)throw Error('Damage snapshot exceeds registry budget');
 const canonicalBonus=prepareModifierResolver(bonusModifiers)(0,'damage_bonus').contributions;
 const event={damageType:input.context.type,eventTags:[...(input.context.eventTags??input.context.tags)],targetTags:entities?[...entities.defender.targetTags]:input.context.target==='Boss'?['boss']:input.context.target==='Elite'?['elite']:[],scope:input.context.defender?.mechanic==='dot'?'dot':'direct'};
 const defenseContext={source:input.context.defender?.source??{id:'unspecified-source'},target:input.context.defender?.target??{id:'unspecified-target'},damageType:input.context.type,tags:input.context.tags,mechanic:input.context.defender?.mechanic??'direct_hit' as const,armorRating:Math.max(0,input.armor??0),magicResistanceRating:input.context.defender?.magicResistanceRating??0};
 if(input.context.defender?.dodgeChance!==undefined)Object.assign(defenseContext,{dodgeChance:input.context.defender.dodgeChance});
 const hit=resolveDefenseHit(defenseContext,input.defenseConfig,input.dodgeRoll);
 if(!hit.hit){
  const defense={...mitigateDefense(0,defenseContext,input.defenseConfig),hit};
  return {entities,event,b0:{base:0,scaling:[] as {source:DamageSource;value:number}[],flat:0,flatModifiers:[] as CombatModifier[],raw:0},b1:{modifiers:[] as {id:string;source:string;reason:string;value:number;sources:{id:string;value:number;source?:string}[]}[],criticalBonus:0,totalBonus:0},critical:{chance:input.criticalChance,roll:null as number|null,isCritical:false},beforeDefense:0,defense,finalDamage:0};
 }
 const {definition:d,context:c}=input,rankFactor=1+d.perRank*Math.max(0,(input.rank??1)-1);
 const base=d.base*rankFactor,scaling=DAMAGE_SOURCES.map(id=>({source:id,value:input.sources[id]*d.scaling[id]*rankFactor}));
 const scope=c.defender?.mechanic==='dot'?'dot':'direct';
 const eligible=canonicalFlat.filter(m=>(m.damageType??'all')==='all'||m.damageType===c.type.toLowerCase()).filter(m=>(m.scope??'direct')==='all'||(m.scope??'direct')===scope);
 const resolvedFlat=resolveModifiers(0,'flat_damage',eligible);
 const flat=d.flat+(input.flat??0)+resolvedFlat.value,raw=base+scaling.reduce((sum,s)=>sum+s.value,0)+flat;
 const modifiers:{id:string;source:string;reason:string;value:number;sources:{id:string;value:number;source?:string}[]}[]=input.settings.modifiers.map(m=>{
  const targetLabels:string[]=entities?.defender.targetTags.length?entities.defender.targetTags.map(t=>t==='boss'?'Boss':'Elite'):[c.target];
  const reason=!m.enabled?'disabled':m.types.length&&!m.types.includes(c.type)?'damage type mismatch':m.tags.length&&!m.tags.some(t=>c.tags.includes(t))?'tag mismatch':m.targets.length&&!m.targets.some(t=>targetLabels.includes(t))?'target mismatch':m.statuses.length&&!m.statuses.every(t=>c.statuses.includes(t))?'target status mismatch':'eligible';
  const sources=m.source==='item'?(input.options??[]).filter(o=>o.id===m.option):[];
  const value=m.source==='item'?sources.reduce((n,o)=>n+o.value*m.value,0):m.value;
  return {id:m.id,source:m.source,reason:reason==='eligible'&&m.source==='item'&&!sources.length?'no equipped source':reason,value:reason==='eligible'?value:0,sources};
 });
 modifiers.push(...canonicalBonus.map(m=>{const reason=damageBonusReason(m,c);return {id:JSON.stringify([m.source,m.sourceInstanceId,m.id]),source:m.source,reason,value:reason==='eligible'?m.value:0,sources:[{id:m.id,value:m.value,source:m.sourceInstanceId}]};}));
 const criticalRoll=scope==='dot'?1:typeof input.roll==='function'?input.roll():input.roll;
 const chance=scope==='dot'?0:Math.max(0,Math.min(.85,input.criticalChance)),critical=criticalRoll<chance;
 const criticalBonus=critical?Math.max(0,input.criticalBonus):0,totalBonus=modifiers.reduce((sum,m)=>sum+m.value,0)+criticalBonus;
 const beforeDefense=Math.max(0,Math.max(0,raw)*(1+totalBonus)),defense={...mitigateDefense(beforeDefense,defenseContext,input.defenseConfig),hit},finalDamage=defense.finalDamage;
 return {entities,event,b0:{base,scaling,flat,flatModifiers:resolvedFlat.contributions,raw},b1:{modifiers,criticalBonus,totalBonus},critical:{chance,roll:criticalRoll as number|null,isCritical:critical},beforeDefense,defense,finalDamage};
}

// Shared offense adapter for any resolved actor. Equipment/options and base
// stat acquisition remain actor-owned; B0/B1/Defense never branch on actor type.
export function snapshotActorDamage(definition:DamageDefinition,sources:Record<DamageSource,number>,modifiers:CombatModifier[],settings:DamageSettings,criticalChance:number,criticalBonus:number){
 const flat=resolveModifiers(0,'damage.flat',modifiers).value;
 const tagModifiers=modifiers.filter(m=>m.target.startsWith('damage.tag.')).map(m=>({id:JSON.stringify([m.source,m.sourceInstanceId,m.id]),source:'setting' as const,option:'',value:m.value,enabled:true,types:[],tags:[m.target.slice(11) as typeof settings.modifiers[number]['tags'][number]],targets:[],statuses:[]}));
 return {definition,flat,flatModifiers:structuredClone(modifiers.filter(m=>m.target==='flat_damage')),bonusModifiers:structuredClone(modifiers.filter(m=>m.target==='damage_bonus')),sources,settings:{skills:{},modifiers:[...settings.modifiers,...tagModifiers]},criticalChance,criticalBonus};
}

export type DamageSnapshot=ReturnType<typeof snapshotActorDamage> & {rank:number;attacker:CombatEntityIdentity;defenseConfig:DefenseConfigSnapshot|undefined;options:{id:string;value:number;source?:string}[]};
