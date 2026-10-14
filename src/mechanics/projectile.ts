import type {ProjectileConfig} from '../contracts/mechanic-contracts.js';
import type {MapPoint,Walkability} from '../spatial/grid-geometry.js';
import {canTraverse} from '../spatial/grid-geometry.js';
export interface ProjectileTarget {id:string;position:MapPoint;hp:number}
export interface ProjectileBody {position:MapPoint;direction:MapPoint;travelled:number;remainingMs:number;hitTargets:string[]}
export function nextProjectileBodyBoundary<B extends ProjectileBody & {config:ProjectileConfig}>(bullets:readonly B[],horizon:number,targets:(bullet:B)=>readonly ProjectileTarget[],grid:Walkability):number {
 let next=Infinity;
 for(const b of bullets){
  const time=Math.min(horizon,b.remainingMs,Math.max(0,b.config.maxRange-b.travelled)/b.config.speed*1000);
  const preview=moveProjectile({...b,position:{...b.position},hitTargets:[...b.hitTargets]},b.config,time,targets(b),grid);
  if(preview.hits[0])next=Math.min(next,time*preview.hits[0].fraction);
  if(preview.expired)next=Math.min(next,time);
 }
 return next;
}
/** Shared chronological delivery kernel. Actor/stat acquisition stays with callers. */
export function tickProjectileBodies<B extends ProjectileBody & {config:ProjectileConfig}>(runtime:{bullets:B[]},ms:number,targets:(bullet:B)=>readonly ProjectileTarget[],grid:Walkability,onHit:(bullet:B,target:string,elapsedMs:number)=>void,active:()=>boolean=()=>true):void {
 let remaining=Math.max(0,ms),elapsed=0;
 do{
  let step=remaining;
  for(const b of runtime.bullets){
   const time=Math.min(remaining,b.remainingMs,Math.max(0,b.config.maxRange-b.travelled)/b.config.speed*1000);
   const preview=moveProjectile({...b,position:{...b.position},hitTargets:[...b.hitTargets]},b.config,time,targets(b),grid);
   if(preview.hits[0])step=Math.min(step,time*preview.hits[0].fraction);
   if(preview.expired)step=Math.min(step,time);
  }
  elapsed+=step;
  const remainingBullets=runtime.bullets.filter(b=>{
   if(!active())return false;
   const result=moveProjectile(b,b.config,step,targets(b),grid);
   for(const hit of result.hits){if(!active())break;onHit(b,hit.id,elapsed);}
   return !result.expired;
  });
  if(!active())return;
  runtime.bullets=remainingBullets;remaining-=step;
 }while(remaining>1e-6&&runtime.bullets.length);
}
export function projectileDirections(direction:MapPoint,angles:readonly number[]):MapPoint[]{
 const angle=Math.atan2(direction.y,direction.x);
 return angles.map(a=>({x:Math.cos(angle+a*Math.PI/180),y:Math.sin(angle+a*Math.PI/180)}));
}
// Swept circle vs target point: earliest entry, not closest-point ordering.
export function segmentContact(start:MapPoint,end:MapPoint,target:MapPoint,radius:number):number|null {
 const x=start.x-target.x,y=start.y-target.y,dx=end.x-start.x,dy=end.y-start.y;
 const c=x*x+y*y-radius*radius;if(c<=1e-9)return 0;
 const a=dx*dx+dy*dy;if(a<=1e-12)return null;
 const b=x*dx+y*dy,disc=b*b-a*c;if(disc<0)return null;
 const t=(-b-Math.sqrt(disc))/a;return t>=-1e-9&&t<=1+1e-9?Math.max(0,Math.min(1,t)):null;
}
export function moveProjectile(body:ProjectileBody,config:ProjectileConfig,ms:number,targets:readonly ProjectileTarget[],grid?:Walkability){
 const start={...body.position},time=Math.min(ms,body.remainingMs,Math.max(0,config.maxRange-body.travelled)/config.speed*1000);
 const distance=config.speed*Math.max(0,time)/1000,end={x:start.x+body.direction.x*distance,y:start.y+body.direction.y*distance};
 const seen=new Set(body.hitTargets),contacts=targets.flatMap(t=>{
  if(t.hp<=0||seen.has(t.id))return [];
  const fraction=segmentContact(start,end,t.position,config.collisionRadius);
  if(fraction===null)return [];
  const point={x:start.x+(end.x-start.x)*fraction,y:start.y+(end.y-start.y)*fraction};
  return grid&&!canTraverse(grid,start,point)?[]:[{id:t.id,fraction,point}];
 }).sort((a,b)=>a.fraction-b.fraction||(a.id<b.id?-1:a.id>b.id?1:0));
 const hits=contacts.filter(c=>!seen.has(c.id)&&(seen.add(c.id),true));
 if(config.hitBehavior==='stop_on_hit')hits.splice(1);
 const last=config.hitBehavior==='stop_on_hit'?hits[0]:undefined;
 body.position=last?last.point:end;body.travelled+=distance*(last?.fraction??1);body.remainingMs=Math.max(0,body.remainingMs-time);
 body.hitTargets.push(...hits.map(c=>c.id));
 return {hits,expired:!!last||body.remainingMs<=1e-6||body.travelled>=config.maxRange-1e-6||!!grid&&!canTraverse(grid,start,end)};
}
export function debugProjectile(config:ProjectileConfig|undefined,input:unknown){
 const v=input as {origin:MapPoint;direction:MapPoint;targets:ProjectileTarget[];elapsedMs:number};
 const point=(p:MapPoint)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 if(!v||!point(v.origin)||!point(v.direction)||Math.hypot(v.direction.x,v.direction.y)<1e-9||!Number.isFinite(v.elapsedMs)||v.elapsedMs<0||v.elapsedMs>60000||!Array.isArray(v.targets)||v.targets.length>2000||v.targets.some(t=>!t||typeof t.id!=='string'||!point(t.position)||!Number.isFinite(t.hp)))throw Error('Projectile debug requires finite origin/direction/elapsedMs and targets [{id,position,hp}], max2000');
 return {enabled:!!config?.enabled,bullets:config?.enabled?projectileDirections(v.direction,config.spreadAngles).map(direction=>{
  const body:ProjectileBody={position:{x:v.origin.x+direction.x*config.spawnOffset,y:v.origin.y+direction.y*config.spawnOffset},direction,travelled:0,remainingMs:config.lifetime,hitTargets:[]};
  return {body,...moveProjectile(body,config,v.elapsedMs,v.targets)};
 }):[],collision:'Swept geometry preview; runtime also checks map walls, generation and target eligibility'};
}
