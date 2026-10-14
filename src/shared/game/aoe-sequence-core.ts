import {DEFAULT_INSTANT_AOE,type TimedAOESequence} from '../data/mechanic-contracts.js';
import type {MapPoint} from './grid-geometry.js';

export function random(r:{rngSeed:number}){let n=r.rngSeed||1;n^=n<<13;n^=n>>>17;n^=n<<5;r.rngSeed=n>>>0;return r.rngSeed/4294967296;}

export function sequencePosition(config:TimedAOESequence,center:MapPoint,rng:{rngSeed:number}|(()=>number)):MapPoint {
 if(config.pattern==='fixed')return {...center};
 const roll=typeof rng==='function'?rng:()=>random(rng);
 const angle=roll()*Math.PI*2,distance=Math.sqrt(roll())*(config.areaRadius-config.aoeRadius);
 return {x:center.x+Math.cos(angle)*distance,y:center.y+Math.sin(angle)*distance};
}

/** Same boundary-partitioned scheduler for arbitrary actors; no stat policy. */
export function tickAOESequenceRuntime<S extends {center:MapPoint;nextStrike:number;remainingMs:number;config:TimedAOESequence}>(runtime:{sequences:S[]},ms:number,roll:()=>number,onStrike:(sequence:S,center:MapPoint,index:number)=>void,active:()=>boolean=()=>true){
 for(const s of runtime.sequences)s.remainingMs=Math.max(0,s.remainingMs-ms);
 for(const s of [...runtime.sequences]){
  if(s.remainingMs>1e-6)continue;
  const index=s.nextStrike,center=sequencePosition(s.config,s.center,roll);
  s.nextStrike++;s.remainingMs=s.config.intervalMs;
  if(s.nextStrike>=s.config.strikeCount)runtime.sequences=runtime.sequences.filter(n=>n!==s);
  onStrike(s,center,index);
  // A strike may finish the session; never dispatch remaining same-time strikes.
  if(!active())break;
 }
}

export const strikeAOE=(radius:number)=>({...DEFAULT_INSTANT_AOE,radius});
