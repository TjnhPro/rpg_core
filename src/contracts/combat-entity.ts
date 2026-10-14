import type {CharacterBaseStats} from './stat-contracts.js';


/** Pure session-local data view, never an alternative saved/authoritative state. */
export interface CombatEntity {
 entityId:string;
 entityType:'player'|'monster';
 level:number;
 factionId:string;
 targetTags:('boss'|'elite')[];
 baseStats:CharacterBaseStats;
 currentHp:number;
 currentMp:number;
}

export type CombatEntityIdentity=Pick<CombatEntity,'entityId'|'entityType'|'level'|'targetTags'>;
