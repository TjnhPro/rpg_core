import { validateDots,type DotConfig } from './dot-contracts.js';
export interface MeleeHitbox {
 enabled:boolean;
 trigger:'OnHit';
 shape:'circle'|'cone'|'rectangle';
 radius:number; width:number; length:number; angle:number; offset:number;
 // Action-clock milliseconds from cast; Attack Speed scales this clock.
 hitTimingMs:number;
}
export interface ProjectileConfig {
 enabled:boolean;trigger:'OnCast';speed:number;maxRange:number;lifetime:number;
 collisionRadius:number;spawnOffset:number;direction:'target'|'facing';
 hitBehavior:'stop_on_hit'|'pierce';bulletCount:number;spreadAngles:number[];
 // Action-clock milliseconds; flight uses elapsed simulation time, not AS.
 spawnTimingMs:number;
}
export const DEFAULT_PROJECTILE:ProjectileConfig={enabled:true,trigger:'OnCast',speed:500,maxRange:600,lifetime:2000,collisionRadius:16,spawnOffset:20,direction:'target',hitBehavior:'stop_on_hit',bulletCount:1,spreadAngles:[0],spawnTimingMs:300};
export interface TimedObjectConfig {
 enabled:boolean;trigger:'on_timer';action:'spawn_projectiles';delayMs:number;
 bulletCount:number;angleOffset:number;projectileRef:string;pattern:'radial_360';
 placement:'self'|'target';placeTimingMs:number;
}
export const DEFAULT_TIMED_OBJECT:TimedObjectConfig={enabled:true,trigger:'on_timer',action:'spawn_projectiles',delayMs:1000,bulletCount:8,angleOffset:0,projectileRef:'component',pattern:'radial_360',placement:'self',placeTimingMs:300};
export interface InstantAOE {enabled:boolean;trigger:'OnHit';origin:'caster'|'target'|'ground';shape:'circle';radius:number;hitTiming:number;damageComponent:string;maxTargets?:number}
export const DEFAULT_INSTANT_AOE:InstantAOE={enabled:true,trigger:'OnHit',origin:'target',shape:'circle',radius:120,hitTiming:300,damageComponent:'component'};
export interface TimedAOESequence {
 enabled:boolean;trigger:'OnCast';strikeCount:number;firstDelayMs:number;intervalMs:number;
 pattern:'fixed'|'random_in_area';areaRadius:number;aoeRadius:number;damageComponent:string;
}
export const DEFAULT_TIMED_AOE_SEQUENCE:TimedAOESequence={enabled:true,trigger:'OnCast',strikeCount:3,firstDelayMs:300,intervalMs:500,pattern:'fixed',areaRadius:160,aoeRadius:120,damageComponent:'component'};
export interface AOECast extends MeleeCast {center:{x:number;y:number}}
export function validAOECast(v:unknown,m:InstantAOE|undefined):v is AOECast {
 if(!v||typeof v!=='object'||!m?.enabled)return false;
 const c=v as AOECast,{center,...cast}=c;
 return Object.keys(c).length===6&&!!center&&Object.keys(center).sort().join()==='x,y'&&Number.isFinite(center.x)&&Number.isFinite(center.y)
  &&validMeleeCast(cast,{...DEFAULT_MELEE_HITBOX,hitTimingMs:m.hitTiming});
}
export interface SkillMechanics {melee_hitbox?:MeleeHitbox;projectile?:ProjectileConfig;timed_object?:TimedObjectConfig;instant_aoe?:InstantAOE;timed_aoe_sequence?:TimedAOESequence;dot?:DotConfig[]}
export interface MeleeCast {skillId:string;remainingMs:number;totalMs:number;direction:{x:number;y:number};primaryIndex:number}
export function validMeleeCast(v:unknown,m:MeleeHitbox|undefined):v is MeleeCast {
 if(!v||typeof v!=='object'||Array.isArray(v)||!m?.enabled)return false;
 const c=v as MeleeCast;
 return Object.keys(c).sort().join()===['skillId','remainingMs','totalMs','direction','primaryIndex'].sort().join()
  &&typeof c.skillId==='string'&&Number.isFinite(c.remainingMs)&&c.remainingMs>=0&&c.remainingMs<=m.hitTimingMs
  &&c.totalMs===m.hitTimingMs&&Number.isInteger(c.primaryIndex)&&c.primaryIndex>=0
  &&!!c.direction&&Object.keys(c.direction).sort().join()==='x,y'
  &&Number.isFinite(c.direction.x)&&Number.isFinite(c.direction.y)&&Math.abs(Math.hypot(c.direction.x,c.direction.y)-1)<1e-6;
}
export const DEFAULT_MELEE_HITBOX:MeleeHitbox={enabled:true,trigger:'OnHit',shape:'cone',radius:105,width:100,length:105,angle:100,offset:0,hitTimingMs:300};
export function projectileCastConfig(m:SkillMechanics|undefined){return m?.timed_object?{enabled:m.timed_object.enabled,spawnTimingMs:m.timed_object.placeTimingMs}:m?.projectile;}
export function validProjectileCast(v:unknown,p:Pick<ProjectileConfig,'enabled'|'spawnTimingMs'>|undefined):v is MeleeCast {
 return validMeleeCast(v,p&&{...DEFAULT_MELEE_HITBOX,enabled:p.enabled,hitTimingMs:p.spawnTimingMs});
}
export function validateSkillMechanics(input:unknown):string[]{
 if(input&&typeof input==='object'&&!Array.isArray(input)&&Object.hasOwn(input,'dot')){
  const {dot,...delivery}=input as SkillMechanics;
  return [...validateDots(dot),...validateSkillMechanics(delivery)];
 }
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 if(!obj(input)||Object.keys(input).some(k=>!['melee_hitbox','projectile','timed_object','instant_aoe','timed_aoe_sequence'].includes(k)))return ['Unsupported skill mechanic'];
 if(Object.hasOwn(input,'timed_aoe_sequence')){
  const s=input.timed_aoe_sequence as TimedAOESequence;
  if(!obj(s)||Object.keys(s).sort().join()!==Object.keys(DEFAULT_TIMED_AOE_SEQUENCE).sort().join())return ['Invalid timed_aoe_sequence fields'];
  if(Object.keys(input).length!==1)return ['Only one delivery mechanic per skill'];
  if(typeof s.enabled!=='boolean'||s.trigger!=='OnCast'||!['fixed','random_in_area'].includes(s.pattern)||typeof s.damageComponent!=='string')return ['Invalid timed_aoe_sequence trigger/pattern/component'];
  if(!Number.isInteger(s.strikeCount)||s.strikeCount<1||s.strikeCount>64||!Number.isFinite(s.firstDelayMs)||s.firstDelayMs<0||!Number.isFinite(s.intervalMs)||s.intervalMs<0||s.strikeCount>1&&s.intervalMs<=0||s.firstDelayMs+(s.strikeCount-1)*s.intervalMs>60000)return ['Invalid timed_aoe_sequence count/timing (1..64 strikes, <=60s)'];
  if(!Number.isFinite(s.areaRadius)||s.areaRadius<=0||s.areaRadius>1000000||!Number.isFinite(s.aoeRadius)||s.aoeRadius<=0||s.aoeRadius>1000000||s.pattern==='random_in_area'&&s.aoeRadius>s.areaRadius)return ['Invalid timed_aoe_sequence radius'];
  return [];
 }
 if(Object.hasOwn(input,'instant_aoe')){
  const a=input.instant_aoe as InstantAOE;
  if(!obj(a)||Object.keys(a).sort().join()!==[...Object.keys(DEFAULT_INSTANT_AOE),...(Object.hasOwn(a,'maxTargets')?['maxTargets']:[])].sort().join())return ['Invalid instant_aoe fields'];
  if(Object.keys(input).length!==1)return ['Only one delivery mechanic per skill'];
  if(typeof a.enabled!=='boolean'||a.trigger!=='OnHit'||a.shape!=='circle'||!['caster','target','ground'].includes(a.origin)||typeof a.damageComponent!=='string')return ['Invalid instant_aoe origin/shape/trigger/component'];
  if(!Number.isFinite(a.radius)||a.radius<=0||a.radius>1000000||!Number.isFinite(a.hitTiming)||a.hitTiming<0||a.hitTiming>10000||a.maxTargets!==undefined&&(!Number.isInteger(a.maxTargets)||a.maxTargets<1||a.maxTargets>2000))return ['Invalid instant_aoe radius/timing/maxTargets'];
  return [];
 }
 if(Object.hasOwn(input,'timed_object')){
  const t=input.timed_object as TimedObjectConfig,errors:string[]=[];
  if(!obj(t)||Object.keys(t).sort().join()!==Object.keys(DEFAULT_TIMED_OBJECT).sort().join())return ['Invalid timed_object fields'];
  if(typeof t.enabled!=='boolean'||t.trigger!=='on_timer'||t.action!=='spawn_projectiles'||t.pattern!=='radial_360'||!['self','target'].includes(t.placement)||typeof t.projectileRef!=='string')errors.push('Invalid timed_object trigger/action/pattern/placement/reference');
  if(!Number.isFinite(t.delayMs)||t.delayMs<0||t.delayMs>60000||!Number.isFinite(t.placeTimingMs)||t.placeTimingMs<0||t.placeTimingMs>10000||!Number.isFinite(t.angleOffset)||Math.abs(t.angleOffset)>360||!Number.isInteger(t.bulletCount)||t.bulletCount<1||t.bulletCount>32)errors.push('Invalid timed_object delay/timing/count/angle');
  if(Object.hasOwn(input,'projectile'))errors.push(...validateProjectile(input.projectile));
  if(Object.hasOwn(input,'melee_hitbox'))errors.push('Only one delivery mechanic per skill');
  return errors;
 }
 if(Object.hasOwn(input,'projectile')){
  const errors=validateProjectile(input.projectile);
  if(Object.hasOwn(input,'melee_hitbox'))errors.push('Only one delivery mechanic per skill');
  return errors;
 }
 if(input.melee_hitbox===undefined)return Object.hasOwn(input,'melee_hitbox')?['Invalid melee_hitbox']:[];
 const m=input.melee_hitbox;
 if(!obj(m)||Object.keys(m).sort().join()!==['enabled','trigger','shape','radius','width','length','angle','offset','hitTimingMs'].sort().join())return ['Invalid melee_hitbox fields'];
 if(typeof m.enabled!=='boolean'||m.trigger!=='OnHit'||!['circle','cone','rectangle'].includes(String(m.shape)))return ['Invalid melee_hitbox enabled/trigger/shape'];
 for(const k of ['radius','width','length','angle','offset','hitTimingMs'])if(typeof m[k]!=='number'||!Number.isFinite(m[k])||m[k]<0||m[k]>1000000)return ['Invalid melee_hitbox '+k];
 if((m.shape==='circle'||m.shape==='cone')&&Number(m.radius)<=0||m.shape==='rectangle'&&(Number(m.width)<=0||Number(m.length)<=0)||m.shape==='cone'&&(Number(m.angle)<=0||Number(m.angle)>360)||Number(m.hitTimingMs)>10000)return ['Invalid melee_hitbox dimensions/timing'];
 return [];
}
export function validateProjectile(input:unknown):string[]{
 if(!input||typeof input!=='object'||Array.isArray(input))return ['Invalid projectile'];
 const p=input as ProjectileConfig;
 if(Object.keys(p).sort().join()!==Object.keys(DEFAULT_PROJECTILE).sort().join())return ['Invalid projectile fields'];
 if(typeof p.enabled!=='boolean'||p.trigger!=='OnCast'||!['target','facing'].includes(p.direction)||!['stop_on_hit','pierce'].includes(p.hitBehavior))return ['Invalid projectile enabled/trigger/direction/hitBehavior'];
 for(const k of ['speed','maxRange','lifetime','collisionRadius','spawnOffset','spawnTimingMs'] as const)if(!Number.isFinite(p[k])||p[k]<0||p[k]>1000000)return ['Invalid projectile '+k];
 if(p.speed<=0||p.maxRange<=0||p.lifetime<=0||p.lifetime>60000||p.spawnTimingMs>10000||p.spawnOffset>p.maxRange)return ['Invalid projectile range/speed/lifetime/timing'];
 if(!Number.isInteger(p.bulletCount)||p.bulletCount<1||p.bulletCount>32||!Array.isArray(p.spreadAngles)||p.spreadAngles.length!==p.bulletCount||p.spreadAngles.some(a=>!Number.isFinite(a)||Math.abs(a)>360))return ['Projectile requires 1..32 bullets and one finite spread angle per bullet'];
 return [];
}
