import {DEFAULT_MELEE_HITBOX,type InstantAOE} from '../contracts/mechanic-contracts.js';
import type {MapPoint,Walkability} from '../spatial/grid-geometry.js';
import {detectMeleeHitbox,debugMeleeHitbox,type HitboxTarget} from './melee-hitbox.js';
// Auto-play ground placement uses the current selected target point, never
// renderer coordinates. All origins are copied once at successful cast.
export function lockAOEPosition(m:InstantAOE,caster:MapPoint,target:MapPoint,ground:MapPoint=target):MapPoint{
 const p=m.origin==='caster'?caster:m.origin==='target'?target:ground;return {x:p.x,y:p.y};
}
export function detectInstantAOE(m:InstantAOE|undefined,center:MapPoint,targets:readonly HitboxTarget[],grid?:Walkability):string[]{
 if(!m?.enabled)return [];
 return detectMeleeHitbox({...DEFAULT_MELEE_HITBOX,shape:'circle',radius:m.radius,offset:0},center,{x:1,y:0},targets,grid).slice(0,m.maxTargets);
}
export function debugInstantAOE(m:InstantAOE|undefined,input:unknown){
 const v=input as {origin:MapPoint;target:MapPoint;ground?:MapPoint;targets:HitboxTarget[]};
 const point=(p:MapPoint|undefined)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 if(!v||!point(v.origin)||!point(v.target)||v.ground!==undefined&&!point(v.ground))throw Error('AOE preview needs finite origin/target/ground points');
 const center=m?lockAOEPosition(m,v.origin,v.target,v.ground):v.origin;
 const result=debugMeleeHitbox(m&&{...DEFAULT_MELEE_HITBOX,enabled:m.enabled,shape:'circle',radius:m.radius}, {...v,origin:center,direction:{x:1,y:0}});
 return {...result,center,hits:detectInstantAOE(m,center,v.targets),hitTiming:m?.hitTiming,damageComponent:m?.damageComponent};
}
