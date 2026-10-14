import type {MeleeHitbox} from '../data/mechanic-contracts.js';
import type {MapPoint,Walkability} from './grid-geometry.js';
import {canTraverse} from './grid-geometry.js';
export interface HitboxTarget {id:string;position:MapPoint;hp:number}
export function hitboxFrame(origin:MapPoint,facing:MapPoint,m:MeleeHitbox){
 const n=Math.hypot(facing.x,facing.y),d=n>1e-9?{x:facing.x/n,y:facing.y/n}:{x:1,y:0};
 return {direction:d,center:{x:origin.x+d.x*m.offset,y:origin.y+d.y*m.offset}};
}
export function insideMeleeHitbox(m:MeleeHitbox,origin:MapPoint,facing:MapPoint,p:MapPoint):boolean {
 const {direction:d,center:c}=hitboxFrame(origin,facing,m),x=p.x-c.x,y=p.y-c.y;
 const forward=x*d.x+y*d.y,side=-x*d.y+y*d.x,epsilon=1e-7;
 if(m.shape==='rectangle')return forward>=-epsilon&&forward<=m.length+epsilon&&Math.abs(side)<=m.width/2+epsilon;
 if(Math.hypot(x,y)>m.radius+epsilon)return false;
 return m.shape==='circle'||Math.hypot(x,y)<=epsilon||forward/Math.hypot(x,y)>=Math.cos(m.angle*Math.PI/360)-epsilon;
}
// Analytic point contacts, deterministic input order, one contact per entity ID.
// Wall visibility shares navigation collision rather than renderer geometry.
export function detectMeleeHitbox(m:MeleeHitbox|undefined,origin:MapPoint,facing:MapPoint,targets:readonly HitboxTarget[],grid?:Walkability):string[]{
 if(!m?.enabled)return [];
 const seen=new Set<string>();
 return targets.filter(t=>t.hp>0&&!seen.has(t.id)&&insideMeleeHitbox(m,origin,facing,t.position)&&(!grid||canTraverse(grid,origin,t.position))&&(seen.add(t.id),true)).map(t=>t.id);
}
// Diagnostic only: polygon samples never decide collision.
export function meleeHitboxOutline(m:MeleeHitbox,origin:MapPoint,facing:MapPoint):MapPoint[]{
 const {direction:d,center:c}=hitboxFrame(origin,facing,m),angle=Math.atan2(d.y,d.x);
 const local=(f:number,s:number)=>({x:c.x+d.x*f-d.y*s,y:c.y+d.y*f+d.x*s});
 if(m.shape==='rectangle')return [local(0,-m.width/2),local(m.length,-m.width/2),local(m.length,m.width/2),local(0,m.width/2)];
 const arc=m.shape==='circle'?Math.PI*2:m.angle*Math.PI/180;
 const points=Array.from({length:49},(_,i)=>({x:c.x+Math.cos(angle-arc/2+arc*i/48)*m.radius,y:c.y+Math.sin(angle-arc/2+arc*i/48)*m.radius}));
 return m.shape==='circle'?points:[c,...points];
}
export function debugMeleeHitbox(m:MeleeHitbox|undefined,input:unknown){
 const v=input as {origin:MapPoint;direction:MapPoint;targets:HitboxTarget[]};
 const point=(p:MapPoint)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 if(!v||!point(v.origin)||!point(v.direction)||Math.hypot(v.direction.x,v.direction.y)<1e-9||!Array.isArray(v.targets)||v.targets.length>2000
  ||v.targets.some(t=>!t||typeof t.id!=='string'||t.id.length>100||!point(t.position)||!Number.isFinite(t.hp)||t.hp<0))throw Error('Hitbox debug requires finite origin/direction and targets [{id,position,hp}], max2000');
 return {enabled:!!m?.enabled,origin:v.origin,direction:v.direction,targets:v.targets,hits:detectMeleeHitbox(m,v.origin,v.direction,v.targets),outline:m?meleeHitboxOutline(m,v.origin,v.direction):[],collision:'Geometry preview only; live engine also checks shared map walls and gameplay target eligibility'};
}
