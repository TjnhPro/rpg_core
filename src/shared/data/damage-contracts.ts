import type { CombatEntityIdentity } from '../game/combat-entity.js';
import type { DamageDelivery,DefenseActor } from './defense-settings.js';
import type { SkillMechanics } from './mechanic-contracts.js';


export const DAMAGE_SOURCES=['str','dex','int','vit','physicalAttack','magicAttack'] as const;

export const DAMAGE_TAGS=['Basic','Core','Buff','Ultimate','Melee','Ranged','AoE','Projectile','Direct','DoT','Physical','Magic','Cold','Lightning','Poison','Shadow','Burning','Bleeding'] as const;

export const DAMAGE_TARGETS=['Normal','Elite','Boss'] as const;

export const DAMAGE_STATUSES=['Poison','Burning','Slow','ArmorBreak','Stun'] as const;

export type DamageSource=typeof DAMAGE_SOURCES[number];

export interface DamageDefinition {base:number;flat:number;scaling:Record<DamageSource,number>;perRank:number;mechanics?:SkillMechanics}

export interface DamageContext {type:'Physical'|'Magic';tags:readonly string[];eventTags?:readonly string[];target:typeof DAMAGE_TARGETS[number];statuses:readonly string[];entities?:{attacker:CombatEntityIdentity;defender:CombatEntityIdentity;defenderStats:{armor:number;magicResistance:number;dodgeChance:number}};defender?:{source:DefenseActor;target:DefenseActor;mechanic:DamageDelivery;magicResistanceRating?:number;dodgeChance?:number}}

export interface DamageModifier {id:string;enabled:boolean;value:number;source:'setting'|'item';option:string;types:('Physical'|'Magic')[];tags:string[];targets:string[];statuses:string[]}

export interface DamageSettings {skills:Record<string,DamageDefinition>;modifiers:DamageModifier[]}

export const damageDefinition=(coefficient=0):DamageDefinition=>({base:0,flat:0,scaling:{str:0,dex:0,int:0,vit:0,physicalAttack:coefficient,magicAttack:0},perRank:0});
