// Reviewed declaration identities, not identifier spelling or import presence.
const edge = (from, to) => `${from} -> ${to}`;
const stat = 'src/stats/stat-calculation.ts#', mod = 'src/modifiers/modifier-core.ts#', damage = 'src/damage/damage-core.ts#', defense = 'src/damage/defense-engine.ts#', combat = 'src/combat/combat-entity.ts#';
export const mapping = Object.fromEntries([
  [stat+'cooldownDurationMs','src/kernel/stats/stat-calculation.ts#calculateCooldownDurationMs',1],
  [stat+'calculateEffectiveStat','src/kernel/stats/stat-calculation.ts#calculateEffectiveValue',1],
  [stat+'resolveCharacterStats','src/kernel/stats/stat-calculation.ts#calculateStats',1],
  [stat+'updateCurrentResources','src/kernel/resources/resource-calculation.ts#normalizeResource',2],
  [stat+'updateCurrentResources','src/kernel/resources/resource-calculation.ts#calculateResourceRegeneration',2],
  [mod+'damageBonusReason','src/kernel/modifiers/modifier-resolution.ts#matchesAnyTag',2],
  [mod+'collectActiveModifiers','src/kernel/modifiers/modifier-resolution.ts#selectCanonicalModifiers',1],
  [mod+'prepareModifierResolver','src/kernel/modifiers/modifier-resolution.ts#prepareNumericalModifiers',1],
  ...['applyEntityDamage','applyEntityHealing','applyEntityManaGain'].map(n=>[combat+n,'src/kernel/resources/resource-calculation.ts#calculateResourceTransition',1]),
  [defense+'resolveDefenseHit','src/kernel/defense/defense-calculation.ts#calculateHit',1],
  [defense+'mitigateDefense','src/kernel/defense/defense-calculation.ts#calculateMitigation',1],
  ...['calculateDamageB0','calculateDamageBonusValue','calculateDamageB1'].map(n=>[damage+'calculateDamage','src/kernel/damage/damage-calculation.ts#'+n,1]),
  [damage+'calculateDamage','src/kernel/defense/defense-calculation.ts#calculateCritical',1],
  [damage+'actorOffense','src/kernel/snapshots/snapshot-data.ts#cloneSnapshotData',2],
  [damage+'snapshotActorOffense','src/kernel/snapshots/snapshot-data.ts#cloneSnapshotData',1],
  [damage+'snapshotActorOffense','src/kernel/snapshots/snapshot-data.ts#freezeSnapshotData',1],
].map(([from,to,n])=>[edge(from,to),n]));
export const wrappers = {
  [mod+'resolveModifiers']:[mod+'prepareModifierResolver'],
  'src/effects/dot-core.ts#dotDamage':[damage+'calculateDamage'],
  'src/skills/skill-engine.ts#startSkillAction':[stat+'cooldownDurationMs','src/combat/combat-state.ts#startCombatAction'],
  'src/skills/skill-effect-integration.ts#hit':[damage+'calculateDamage'],
  'src/skills/skill-effect-integration.ts#applyDamage':[combat+'applyEntityDamage'],
  'src/skills/skill-effect-integration.ts#heal':[combat+'applyEntityHealing'],
  'src/skills/skill-effect-integration.ts#restoreMana':[combat+'applyEntityManaGain'],
  'src/skills/skill-effect-integration.ts#lifesteal':[combat+'applyEntityHealing'],
  'src/skills/skill-effect-integration.ts#manaOnHit':[combat+'applyEntityManaGain'],
  'src/skills/root-offense.ts#prepareRootOffense':[damage+'snapshotActorOffense'],
};
export const trust = {
  'src/skills/root-offense.ts#prepareRootOffense':['src/skills/skill-execution.ts#executeSkill'],
  'src/skills/skill-instance.ts#registerTriggeredSkillChildren':['src/skills/skill-effect-integration.ts#admit'],
};
export const stateWrites = [
  'src/combat/combat-state.ts#startCombatAction -> src/contracts/combat-state.ts#actionSerial',
  'src/combat/combat-state.ts#startCombatAction -> src/contracts/combat-state.ts#activeAction',
  'src/skills/skill-engine.ts#startSkillAction -> src/contracts/combat-entity.ts#currentMp',
  'src/skills/skill-execution.ts#executeSkill -> src/skills/skill-execution.ts#skillExecution',
  ...['applyDamage','lifesteal','heal'].map(n=>'src/skills/skill-effect-integration.ts#'+n+' -> src/contracts/combat-entity.ts#currentHp'),
  ...['manaOnHit','restoreMana'].map(n=>'src/skills/skill-effect-integration.ts#'+n+' -> src/contracts/combat-entity.ts#currentMp'),
];
// statIds is a validation vocabulary, not runtime authority; explicitly allowed.
export const stores = [
  'src/combat/combat-entity.ts#statIds:Set',
  'src/skills/skill-execution.ts#healingEntities:WeakMap',
  'src/skills/root-offense.ts#activated:WeakSet',
  'src/skills/root-offense.ts#sessions:WeakMap',
  'src/skills/skill-instance.ts#instanceSessions:WeakMap',
  'src/skills/skill-instance.ts#executionInstances:WeakMap',
  ...['definitionTokens','bundles','sessions','receipts','deliveries'].map(n=>'src/skills/skill-trigger.ts#'+n+':WeakMap'),
];

// Virtual, type-valid source overrides; never written to production files.
const stats='src/stats/stat-calculation.ts', combatFile='src/combat/combat-entity.ts', engine='src/skills/skill-engine.ts';
export const adversarialCases=[
 {name:'unused import beside bypass',file:stats,change:(s)=>s.replace('return calculateCooldownDurationMs(baseMs,effectiveCdr);','return baseMs;'),code:'DELEGATION_SITE'},
 {name:'unrelated scalar delegate',file:stats,change:(s)=>s.replace('calculateCooldownDurationMs(baseMs,effectiveCdr)','Math.max(baseMs,effectiveCdr)'),code:'DELEGATION_SITE'},
 {name:'same spelled shadow symbol',file:stats,change:(s)=>s.replace('return calculateCooldownDurationMs(baseMs,effectiveCdr);','const calculateCooldownDurationMs=(a:number,b:number)=>a+b;return calculateCooldownDurationMs(baseMs,effectiveCdr);'),code:'DELEGATION_SITE'},
 {name:'missing transitive wrapper',file:engine,change:(s)=>s.replace('cooldownDurationMs(definition.cooldownMs,timing.effectiveCdr)','Math.max(definition.cooldownMs,timing.effectiveCdr)'),code:'WRAPPER_EDGE'},
 {name:'bypassed returned numerical resolver',file:'src/modifiers/modifier-core.ts',change:(s)=>s.replace('resolve(base,target);','({flat:0,percent:0,percentagePoints:0,totalFlat:base,value:base,contributions:[] as CombatModifier[]});'),code:'RESOLVER_CALLBACK'},
 {name:'wrong HP commit owner',file:combatFile,change:(s)=>s+'\nexport function wrongCommit(e:CombatEntity){e.currentHp=1;}\n',code:'STATE_WRITE_OWNER'},
 {name:'mirrored receipt queue',file:engine,change:(s)=>s+'\nconst mirroredReceiptQueue=new Map<string,unknown>();\n',code:'AUTHORITY_STORE'},
 {name:'unauthorized Root trust caller',file:engine,change:(s)=>s+"\nimport {prepareRootOffense as captureTrust} from './root-offense.js';\nfunction wrongTrust(...args:Parameters<typeof captureTrust>){return captureTrust(...args);}\n",code:'TRUST_OWNER'},
 {name:'unauthorized Child admission',file:engine,change:(s)=>s+"\nimport {registerTriggeredSkillChildren as admit} from './skill-instance.js';\nfunction wrongAdmission(...args:Parameters<typeof admit>){return admit(...args);}\n",code:'TRUST_OWNER'},
];
