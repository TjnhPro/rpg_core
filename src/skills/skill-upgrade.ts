import {pinSkillInstanceDefinition,type SkillInstanceDefinition} from './skill-instance.js';
import {isPinnedSkillTriggerBundle,pinSkillTriggerBundle,type SkillTriggerBundle,type SkillTriggerLink} from './skill-trigger.js';
import type {SkillGameplayEffect} from './skill-effects.js';
import type {SkillEngineDefinition} from './skill-engine.js';

interface UpgradeBase {readonly upgradeId:string;readonly skillId:string}
interface EffectTarget {readonly effectIndex:number;readonly expectedComponentId:string}
/** Ordered, trusted content selections. Indices always address the base revision. */
export type SkillUpgrade = UpgradeBase & (
 | (EffectTarget & {readonly type:'projectile_pattern';readonly expectedType:'projectile';readonly bulletCount:number;readonly spreadAngles:readonly number[]})
 | (EffectTarget & {readonly type:'timed_radial_count';readonly expectedType:'timed_object';readonly bulletCount:number})
 | (EffectTarget & {readonly type:'instant_aoe_radius';readonly expectedType:'instant_aoe';readonly radius:number})
 | {readonly type:'append_modifier';readonly effect:Extract<SkillGameplayEffect,{type:'modifier_effect'}>}
 | {readonly type:'append_child';readonly definition:SkillInstanceDefinition;readonly link:SkillTriggerLink}
);
export type SkillUpgradeResult =
 | {readonly success:true;readonly resolved:SkillTriggerBundle;readonly appliedUpgradeIds:readonly string[];readonly errors:readonly []}
 | {readonly success:false;readonly errors:readonly string[]};
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.trim()===v;
const closed=(v:object,keys:readonly string[])=>Object.keys(v).every(k=>keys.includes(k));

/** Pure all-or-nothing resolution; never reads an entity or changes a live cast.
 * Canonical pinning validates definitions, mechanics and the complete resulting DAG.
 */
export function resolveSkillUpgrades(bundle:SkillTriggerBundle,upgrades:readonly SkillUpgrade[],expectedRevision:string,newRevision:string):SkillUpgradeResult {
 const reject=(message:string):SkillUpgradeResult=>Object.freeze({success:false,errors:Object.freeze([message])});
 if(!isPinnedSkillTriggerBundle(bundle))return reject('invalid_base_bundle');
 if(!id(expectedRevision)||bundle.version!==expectedRevision)return reject('stale_revision');
 if(!id(newRevision)||newRevision===expectedRevision)return reject('invalid_new_revision');
 if(!Array.isArray(upgrades))return reject('invalid_upgrades');
 const base=new Map(bundle.definitions.map(p=>[p.definition.skillId,p]));
 const changed=new Map<string,SkillEngineDefinition>(),added:SkillInstanceDefinition[]=[],links=[...bundle.links];
 const ids=new Set<string>(),writes=new Set<string>();
 try {
  for(const u of upgrades){
   if(!u||!id(u.upgradeId)||ids.has(u.upgradeId))return reject('invalid_or_duplicate_upgrade_id');
   ids.add(u.upgradeId);
   const pin=base.get(u.skillId);if(!pin)return reject('unknown_skill');
   const common=['upgradeId','skillId','type'];
   const definition=changed.get(u.skillId)??structuredClone(pin.definition) as SkillEngineDefinition;
   const effects=[...(definition.effects??[])];
   if(u.type==='append_child'){
    if(!closed(u,[...common,'definition','link'])||!u.definition||!u.link||u.link.sourceSkillId!==u.skillId||u.link.childSkillId!==u.definition.definition.skillId)return reject('invalid_child_identity');
    added.push(u.definition);links.push(u.link);continue;
   }
   if(u.type==='append_modifier'){
    if(!closed(u,[...common,'effect'])||u.effect?.type!=='modifier_effect')return reject('invalid_modifier');
    effects.push(structuredClone(u.effect));
   }else if(u.type==='projectile_pattern'||u.type==='timed_radial_count'||u.type==='instant_aoe_radius'){
    const keys=[...common,'effectIndex','expectedType','expectedComponentId',...(u.type==='projectile_pattern'?['bulletCount','spreadAngles']:u.type==='timed_radial_count'?['bulletCount']:['radius'])];
    if(!closed(u,keys)||!Number.isSafeInteger(u.effectIndex)||u.effectIndex<0)return reject('invalid_effect_target');
    const original=pin.definition.effects?.[u.effectIndex];
    const expected=u.type==='projectile_pattern'?'projectile':u.type==='timed_radial_count'?'timed_object':'instant_aoe';
    if(!original||u.expectedType!==expected||original.type!==expected)return reject('effect_type_mismatch');
    const component=original.type==='timed_object'?original.projectile.damage:'damage' in original?original.damage:undefined;
    if(!id(u.expectedComponentId)||component?.id!==u.expectedComponentId)return reject('component_mismatch');
    const key=JSON.stringify([u.skillId,u.effectIndex,expected]);
    if(writes.has(key))return reject('semantic_write_conflict');writes.add(key);
    const effect=effects[u.effectIndex]!;
    if(u.type==='projectile_pattern'&&effect.type==='projectile')effects[u.effectIndex]={...effect,config:{...effect.config,bulletCount:u.bulletCount,spreadAngles:[...u.spreadAngles]}};
    else if(u.type==='timed_radial_count'&&effect.type==='timed_object')effects[u.effectIndex]={...effect,config:{...effect.config,bulletCount:u.bulletCount}};
    else if(u.type==='instant_aoe_radius'&&effect.type==='instant_aoe')effects[u.effectIndex]={...effect,config:{...effect.config,radius:u.radius}};
   }else return reject('unsupported_upgrade');
   changed.set(u.skillId,{...definition,effects});
  }
  const definitions=bundle.definitions.map(pin=>{
   const definition=changed.get(pin.definition.skillId);
   return definition||pin.definition.skillId===bundle.rootSkillId
    ?pinSkillInstanceDefinition(definition??pin.definition as SkillEngineDefinition,pin.definition.skillId===bundle.rootSkillId?newRevision:pin.configVersion,pin.lifetimeMs):pin;
  });
  const resolved=pinSkillTriggerBundle({version:newRevision,rootSkillId:bundle.rootSkillId,definitions:[...definitions,...added],links});
  return Object.freeze({success:true,resolved,appliedUpgradeIds:Object.freeze([...ids]),errors:Object.freeze([]) as readonly []});
 }catch{return reject('invalid_resulting_bundle');}
}
