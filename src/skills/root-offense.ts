import {snapshotActorOffense,type ActorOffenseInput,type ActorOffenseSnapshot} from '../damage/damage-core.js';
import type {DamageSnapshot} from '../damage/damage-core.js';
import type {CombatEntity} from '../combat/combat-entity.js';
import {validateSkillDamageComponent,type SkillDamageComponent} from './skill-effects.js';
import type {SkillEffectRuntime} from './skill-effect-integration.js';
import type {SkillExecutionSnapshot} from './skill-execution.js';

export interface RootOffensiveSnapshot {
 readonly actionInstanceId:string; readonly casterId:string;
 readonly capturedAt:number; readonly configVersion:string;
 readonly offense:ActorOffenseSnapshot;
}
export interface SkillRootOffenseCapture {
 readonly runtime:SkillEffectRuntime;
 capture(caster:CombatEntity,configVersion:string):ActorOffenseInput;
}
// Trust records, not a global offense cache. Weak session/execution keys retain
// no ended roots; deliveries/callers own their snapshot references.
const activated=new WeakSet<SkillExecutionSnapshot>();
export function activateRootOffense(snapshot:SkillExecutionSnapshot):void {if(snapshot.rootOffense)activated.add(snapshot);}
export function validateRootActivation(runtime:SkillEffectRuntime,snapshot:SkillExecutionSnapshot):boolean {return validateRootOffense(runtime,snapshot)&&(!snapshot.rootOffense||activated.has(snapshot));}
const sessions=new WeakMap<SkillEffectRuntime,WeakSet<SkillExecutionSnapshot>>();
export function initializeRootOffense(runtime:SkillEffectRuntime):void {sessions.set(runtime,new WeakSet());}
export function clearRootOffense(runtime:SkillEffectRuntime):void {if(sessions.has(runtime))sessions.set(runtime,new WeakSet());}
export function prepareRootOffense(binding:SkillRootOffenseCapture,caster:CombatEntity,version:string,now:number,serial:number):RootOffensiveSnapshot {
 if(!binding.runtime.active||!sessions.has(binding.runtime)||binding.runtime.now!==now)throw Error('invalid_root_offense');
 const offense=snapshotActorOffense(binding.capture(caster,version));
 if(!binding.runtime.active||binding.runtime.now!==now)throw Error('invalid_root_offense');
 if(offense.attacker.entityId!==caster.entityId||offense.attacker.entityType!==caster.entityType||offense.attacker.level!==caster.level)throw Error('invalid_root_offense');
 return Object.freeze({actionInstanceId:`${caster.entityId}#${serial}`,casterId:caster.entityId,capturedAt:now,configVersion:version,offense});
}
export function bindRootOffense(runtime:SkillEffectRuntime,snapshot:SkillExecutionSnapshot):void {sessions.get(runtime)!.add(snapshot);}
export function validateRootOffense(runtime:SkillEffectRuntime,snapshot:SkillExecutionSnapshot):boolean {
 const session=sessions.get(runtime),root=snapshot.rootOffense;
 if(!session)return root===undefined;
 return runtime.active&&session.has(snapshot)&&!!root&&root.actionInstanceId===snapshot.actionInstanceId
  &&root.casterId===snapshot.casterId&&root.configVersion===snapshot.configVersion&&root.capturedAt===snapshot.startedAt;
}
/** Derive a component snapshot from the exact Core-bound execution in its owning
 * live session. B/C-like components are not child Skill execution. */
export function rootDamageSnapshot(runtime:SkillEffectRuntime,snapshot:SkillExecutionSnapshot,component:SkillDamageComponent):DamageSnapshot {
 if(!runtime.active||!sessions.has(runtime)||!validateRootOffense(runtime,snapshot)||validateSkillDamageComponent(component).length)throw Error('invalid_root_offense');
 return {...snapshot.rootOffense!.offense,definition:component.definition,rank:component.rank} as DamageSnapshot;
}

/** Public detached copy; internal delivery shares immutable S0/pinned definitions. */
export function deriveSkillRootDamage(runtime:SkillEffectRuntime,snapshot:SkillExecutionSnapshot,component:SkillDamageComponent):DamageSnapshot {
 return structuredClone(rootDamageSnapshot(runtime,snapshot,component));
}
