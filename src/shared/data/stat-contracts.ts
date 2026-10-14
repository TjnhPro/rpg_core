import type { DamageSettings } from './damage-contracts.js';
import type { DefenseSettings } from './defense-settings.js';
import type { CombatModifier } from './combat-modifiers.js';
import type { TargetingSettings } from './targeting-contracts.js';

export const ATTRIBUTE_IDS=['str','dex','int','vit'] as const;

export type CoreAttribute=typeof ATTRIBUTE_IDS[number];

export const STAT_IDS=['maxHp','maxMana','hpRegen','manaRegen','physicalAttack','magicAttack','attackSpeed','criticalChance','criticalDamage','armor','magicResistance','armorReduction','dodgeChance','MetalResistance','WoodResistance','WaterResistance','FireResistance','EarthResistance','movementSpeed','movementSpeedMultiplier','cooldownReduction'] as const;

export type PlayerStat=typeof STAT_IDS[number];

// Entity bases reuse the existing stat IDs. Missing derived fields mean unsupported,
// not Player defaults; runtime current resources never belong in this record.
export type CharacterBaseStats=Record<CoreAttribute,number>&Partial<Record<PlayerStat,number>>;

export interface StatRule {default:number;min:number;max?:number;scaling:Record<CoreAttribute,number>;scalingEnabled?:Record<CoreAttribute,boolean>;training:number}

export const DEFENSE_RATING_STATS=['armor','magicResistance'] as const;

export const RESOURCE_STATS=['maxHp','maxMana','hpRegen','manaRegen'] as const;

export const OPTIONAL_MAX_STATS=[...DEFENSE_RATING_STATS,...RESOURCE_STATS] as const;

export interface CoreAttributeRule {default:number;perLevel:number;reference:number;min?:number;max?:number}

export interface PlayerStatsConfig {version:1|2|3;targeting?:TargetingSettings;entityStatsVersion?:1;resourceRulesVersion?:1;modifierOperationsVersion?:2;modifiers?:CombatModifier[];damage?:DamageSettings;defense?:DefenseSettings;baseAttackIntervalMs:number;attributes:Record<CoreAttribute,CoreAttributeRule>;stats:Record<PlayerStat,StatRule>}

const rule=(value:number,min:number,max:number,scaling:Partial<Record<CoreAttribute,number>>={},training=0):StatRule=>({default:value,min,max,scaling:{str:0,dex:0,int:0,vit:0,...scaling},training});

// Compatibility defaults for supported stats; unimplemented mechanics stay reserved.
export const LEGACY_PLAYER_STATS:PlayerStatsConfig={version:1,baseAttackIntervalMs:1000,
 attributes:{str:{default:10,perLevel:2,reference:10},dex:{default:10,perLevel:1,reference:10},int:{default:10,perLevel:1,reference:10},vit:{default:10,perLevel:1,reference:10}},
 stats:{maxHp:rule(52,1,1000000,{str:1,vit:3},7),maxMana:rule(30,0,1000000,{int:2,vit:1}),hpRegen:rule(0,0,100000),manaRegen:rule(2,0,100000,{vit:.15}),
 physicalAttack:rule(7,0,1000000,{str:.6,dex:.3},1.75),magicAttack:rule(7,0,1000000),attackSpeed:rule(1,.1,3),criticalChance:rule(0,0,.85),criticalDamage:rule(1.5,1,10),
 armor:rule(0,0,1000000,{dex:.4}),magicResistance:rule(0,0,1000000),armorReduction:rule(0,0,.85),dodgeChance:rule(0,0,.85),
 MetalResistance:rule(0,0,.85),WoodResistance:rule(0,0,.85),WaterResistance:rule(0,0,.85),FireResistance:rule(0,0,.85),EarthResistance:rule(0,0,.85),
 movementSpeed:rule(260,1,520,{dex:1.3}),movementSpeedMultiplier:rule(1,0,2),cooldownReduction:rule(0,0,.85)}};

export const CORE_SCALING_MAPPING=[['str','armor'],['dex','attackSpeed'],['dex','criticalChance'],['dex','dodgeChance'],['int','maxMana'],['int','manaRegen'],['vit','maxHp'],['vit','hpRegen']] as const;

export function upgradePlayerStatsConfig(c:PlayerStatsConfig):PlayerStatsConfig {
 const next=structuredClone(c);if(next.version>=2)return next;
 next.version=2;
 for(const a of ATTRIBUTE_IDS)next.attributes[a].perLevel=0;
 for(const id of STAT_IDS){next.stats[id]??=structuredClone(LEGACY_PLAYER_STATS.stats[id]);next.stats[id].scalingEnabled={str:true,dex:true,int:true,vit:true};}
 // Keep attack/movement's legacy coefficients (Skill Damage is not redesigned).
 next.stats.armor.scaling={str:c.stats.armor.scaling.dex,dex:0,int:0,vit:0};
 next.stats.maxMana.scaling={str:0,dex:0,int:c.stats.maxMana.scaling.int,vit:0};
 next.stats.manaRegen.scaling={str:0,dex:0,int:c.stats.manaRegen.scaling.vit,vit:0};
 next.stats.maxHp.scaling={str:0,dex:0,int:0,vit:c.stats.maxHp.scaling.vit};
 next.stats.attackSpeed.scaling.dex=.01;
 next.stats.criticalChance.scaling.dex=.001;
 next.stats.dodgeChance.scaling.dex=.001;
 next.stats.hpRegen.scaling.vit=.1;
 return next;
}

export const V2_PLAYER_STATS=upgradePlayerStatsConfig(LEGACY_PLAYER_STATS);

export const ELEMENTAL_STATS=new Set<PlayerStat>(['MetalResistance','WoodResistance','WaterResistance','FireResistance','EarthResistance']);

export interface StatsSnapshot {revision:number;config:PlayerStatsConfig}

export const DEFAULT_CORE_STATS:PlayerStatsConfig={...structuredClone(V2_PLAYER_STATS),version:3,entityStatsVersion:1,resourceRulesVersion:1,modifierOperationsVersion:2,damage:{skills:{},modifiers:[]}};
DEFAULT_CORE_STATS.stats.criticalDamage.default-=1;
DEFAULT_CORE_STATS.stats.criticalDamage.min-=1;
DEFAULT_CORE_STATS.stats.criticalDamage.max=3;
DEFAULT_CORE_STATS.stats.cooldownReduction.max=.5;
for(const id of OPTIONAL_MAX_STATS)delete DEFAULT_CORE_STATS.stats[id].max;
