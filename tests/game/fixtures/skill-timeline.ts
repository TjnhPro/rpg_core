import type {fixture} from './skill-core.js';
import {advanceSkillExecution,cancelSkillExecution,type SkillExecutionEvent,type SkillExecutionSlot} from '../../../src/shared/game/skill-execution.js';
import {advanceSkillEffects,dispatchSkillEffects,nextSkillEffectBoundary,type SkillEffectEvent} from '../../../src/shared/game/skill-effect-integration.js';

// Test-only driver of real simulation boundaries, shared by Core integration gates.
export function timeline(f:ReturnType<typeof fixture>,additional:readonly {casterId:string;slot:SkillExecutionSlot;actions:SkillExecutionEvent[]}[]=[],beforeStep?:(from:number,to:number)=>void){
 const events:(SkillExecutionEvent|SkillEffectEvent)[]=[];
 // References to existing actor slots, not additional action/resource truth.
 const actors=[{casterId:f.context.casterId,slot:f.slot,actions:f.actions},...additional].sort((a,b)=>a.casterId<b.casterId?-1:a.casterId>b.casterId?1:0);
 const cursors=new Map(actors.map(a=>[a.casterId,0]));
 const emit=f.env.emit;f.env.emit=e=>{emit(e);events.push(e);if(e.type==='entity-defeated'){const actor=actors.find(a=>a.casterId===e.entityId);if(actor)cancelSkillExecution(actor.slot,e.atMs,'defeated',actor.actions);}};
 const drain=()=>{for(const actor of actors){let cursor=cursors.get(actor.casterId)!;while(cursor<actor.actions.length){const e=actor.actions[cursor++]!;events.push(e);if(e.type==='skill-activated')dispatchSkillEffects(f.runtime,e,f.env);}cursors.set(actor.casterId,cursor);}};
 const start=()=>{const result=f.start(f.runtime.now);drain();return result;};
 const advance=(now:number)=>{
  if(!f.runtime.active){for(const a of actors)advanceSkillExecution(a.slot,f.context.combat,now,a.actions);drain();return;}
  let steps=0;
  do{
   if(++steps>1000)throw Error('Test timeline failed to reach its boundary');
   const activation=Math.min(...actors.map(a=>a.slot.skillExecution&&!a.slot.skillExecution.activated?a.slot.skillExecution.snapshot.activationTime:Infinity));
   const completion=Math.min(...actors.map(a=>a.slot.activeAction?a.slot.activeAction.startedAt+a.slot.activeAction.durationMs:Infinity));
   const at=Math.min(now,activation,completion,f.runtime.now+nextSkillEffectBoundary(f.runtime,f.env,now-f.runtime.now));
   beforeStep?.(f.runtime.now,at);advanceSkillEffects(f.runtime,at,f.env);
   for(const a of actors){advanceSkillExecution(a.slot,f.context.combat,at,a.actions);drain();}
  }while(f.runtime.now<now);
 };
 return {events,start,advance,flush:drain};
}
