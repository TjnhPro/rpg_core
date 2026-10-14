import type { FactionRelation,TargetContext } from '../game/combat-state.js';


export interface TargetingRule {targetMode:TargetContext['mode'];allowedRelations:FactionRelation[];requiresLivingTarget:boolean}

export interface TargetingSettings {
 playerFaction:string;monsterFaction:string;monsterFactions:Record<string,string>;
 relations:{source:string;target:string;relation:'ally'|'enemy'}[];
 actions:Record<string,TargetingRule>;
}

export function validTargetingRule(v:unknown):v is TargetingRule {
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const r=v as TargetingRule;
 return Object.keys(r).sort().join()==='allowedRelations,requiresLivingTarget,targetMode'
  &&['self','entity','ground'].includes(r.targetMode)&&typeof r.requiresLivingTarget==='boolean'
  &&Array.isArray(r.allowedRelations)&&r.allowedRelations.length>0&&new Set(r.allowedRelations).size===r.allowedRelations.length
  &&r.allowedRelations.every(x=>['self','ally','enemy'].includes(x));
}
