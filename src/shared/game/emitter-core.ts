import type {ProjectileConfig,TimedObjectConfig} from '../data/mechanic-contracts.js';

export function emitterProjectileConfig(config:ProjectileConfig,t:TimedObjectConfig):ProjectileConfig {
 return {...config,bulletCount:t.bulletCount,spreadAngles:Array.from({length:t.bulletCount},(_,i)=>i*360/t.bulletCount+t.angleOffset).map(a=>((a%360)+360)%360)};
}

export function tickEmitterRuntime<O extends {remainingMs:number}>(runtime:{objects:O[]},ms:number,onEmit:(object:O)=>void,active:()=>boolean=()=>true):void {
 for(const o of runtime.objects)o.remainingMs=Math.max(0,o.remainingMs-ms);
 for(const o of [...runtime.objects]){
  if(o.remainingMs>1e-6)continue;
  runtime.objects=runtime.objects.filter(n=>n!==o);onEmit(o);if(!active())break;
 }
}
