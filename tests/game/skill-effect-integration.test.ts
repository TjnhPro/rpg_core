import {readCoreSource} from './fixtures/source.js';
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {advanceSkillExecution,cancelSkillExecution,type SkillActivatedEvent} from '../../src/skills/skill-execution.js';
import {defineSkill} from '../../src/skills/skill-engine.js';
import {dispatchSkillEffects,advanceSkillEffects,clearSkillEffects} from '../../src/skills/skill-effect-integration.js';
import {DEFAULT_MELEE_HITBOX,DEFAULT_INSTANT_AOE} from '../../src/contracts/mechanic-contracts.js';
import {validateSkillEffects,type SkillGameplayEffect} from '../../src/skills/skill-effects.js';
import {fixture,damage,direct,projectile,sequence,timed,dot} from './fixtures/skill-core.js';
it('validates one/multiple ordered effects and rejects unsupported type/config/ref/visual fields before cost',()=>{
 for(const effects of [[direct()],[direct(),projectile(),timed(),sequence()],[]])expect(validateSkillEffects(effects)).toEqual([]);
 for(const effects of [[{type:'unknown'}],[{...projectile(),config:{}}],[{...direct(),icon:'fake'}],[{...sequence(),damage:{...damage(),id:'wrong'}}],[{...timed(),projectile:{config:{},damage:damage()}}],[{...direct(),onHit:[{...dot(),config:{...dot().config,canCrit:true}}]}]]){
  const f=fixture(effects as SkillGameplayEffect[]);expect(f.start().success).toBe(false);expect(f.entities[0]!.currentMp).toBe(100);expect(f.slot.activeAction).toBeUndefined();
 }
});
it('deep-pins nested damage/effects/config and one activation dispatches in array order once',()=>{
 const effects=[direct(),direct()],f=fixture(effects),event=f.activate();
 expect(f.entities[1]!.currentHp).toBe(960);expect(f.hits().map(h=>h.instanceId)).toEqual(['actor0#1/effect0','actor0#1/effect1']);
 (effects[0] as Extract<SkillGameplayEffect,{type:'direct_hit'}>).damage.definition.base=500;
 expect((event.snapshot.definition.effects![0] as ReturnType<typeof direct>).damage?.definition.base).toBe(10);
 expect(dispatchSkillEffects(f.runtime,event,f.env)).toBe(false);expect(f.entities[1]!.currentHp).toBe(960);expect(f.rolls().critCalls).toBe(2);
});
it('cancel before activation never creates effects; completion leaves projectiles active',()=>{
 const f=fixture([projectile()]);f.start();cancelSkillExecution(f.slot,20,'interrupted',f.actions);advanceSkillExecution(f.slot,f.context.combat,100,f.actions);expect(f.actions.some(e=>e.type==='skill-activated')).toBe(false);expect(f.runtime.bullets).toHaveLength(0);
 const g=fixture([projectile()]);g.activate();advanceSkillExecution(g.slot,g.context.combat,100,g.actions);expect(g.slot.activeAction).toBeUndefined();expect(g.runtime.bullets).toHaveLength(1);
});
it.each(['circle','cone','rectangle'] as const)('melee %s uses existing geometry, unique candidates and live hit stats',shape=>{
 const f=fixture([{type:'melee_hitbox',config:{...DEFAULT_MELEE_HITBOX,shape,radius:110,length:110,width:40},damage:damage()}]);
 f.start();f.entities[0]!.baseStats.physicalAttack=30;advanceSkillEffects(f.runtime,50,f.env);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);dispatchSkillEffects(f.runtime,f.actions[1] as SkillActivatedEvent,f.env);
 expect(f.entities[1]!.currentHp).toBe(960);expect(f.entities[2]!.currentHp).toBe(960);expect(f.entities[3]!.currentHp).toBe(1000);expect(f.hits().filter(h=>h.targetId==='actor1')).toHaveLength(1);
});
it('ground AOE locks position at cast, hits multiple enemies not allies and honors eligible cap',()=>{
 const f=fixture([{type:'instant_aoe',config:{...DEFAULT_INSTANT_AOE,origin:'ground',radius:60,damageComponent:'component'},damage:damage()}]);
 Object.assign(f.definition,{targetMode:'ground'});f.context.target={mode:'ground',casterId:'actor0',position:{x:100,y:50}};
 f.start();f.context.target.position.x=700;f.positions.actor0!.x=500;
 advanceSkillEffects(f.runtime,50,f.env);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);dispatchSkillEffects(f.runtime,f.actions[1] as SkillActivatedEvent,f.env);
 expect(f.entities.slice(1).map(e=>e.currentHp)).toEqual([980,980,1000]);
});
it.each(['stop_on_hit','pierce'] as const)('projectile %s keeps collision on Dodge; no on-hit DoT',behavior=>{
 const f=fixture([{...projectile(behavior),onHit:[dot()]}]);f.entities[1]!.baseStats.dodgeChance=.85;f.activate();advanceSkillEffects(f.runtime,1200,f.env);
 expect(f.entities[1]!.currentHp).toBe(1000);expect(f.hits()[0]!.breakdown.critical.roll).toBeNull();
 expect(f.runtime.dots.groups.some(g=>g.targetId==='actor1')).toBe(false);
 expect(f.entities[2]!.currentHp).toBe(behavior==='pierce'?960:1000);expect(f.rolls().critCalls).toBe(behavior==='pierce'?1:0);
});
it('projectile attacker snapshot survives gear change/death; defender armor is live at contact',()=>{
 const f=fixture([projectile()]);f.activate();f.entities[0]!.baseStats.physicalAttack=100;f.entities[0]!.currentHp=0;f.entities[1]!.baseStats.armor=100;
 advanceSkillExecution(f.slot,f.context.combat,100,f.actions);advanceSkillEffects(f.runtime,530,f.env);
 expect(f.entities[1]!.currentHp).toBe(990);expect(f.hits()[0]!.breakdown.b0.raw).toBe(20);expect(f.hits()[0]!.atMs).toBeCloseTo(530);
});
it('projectile revalidates faction and session generation at contact; no stale on-hit',()=>{
 const f=fixture([{...projectile('pierce'),onHit:[dot()]}]);f.activate();f.entities[1]!.factionId='player';f.entities[2]!.entityId='actor2-next-generation';advanceSkillEffects(f.runtime,2000,f.env);
 expect(f.hits()).toHaveLength(0);expect(f.runtime.dots.groups).toHaveLength(0);
});
it('timed object persists after caster defeat/completion and snapshots at emission not cast',()=>{
 const f=fixture([timed()]);f.activate();advanceSkillExecution(f.slot,f.context.combat,100,f.actions);f.entities[0]!.currentHp=0;f.entities[0]!.baseStats.physicalAttack=40;
 advanceSkillEffects(f.runtime,150,f.env);expect(f.runtime.objects).toHaveLength(0);expect(f.runtime.bullets).toHaveLength(1);
 f.entities[0]!.baseStats.physicalAttack=200;advanceSkillEffects(f.runtime,630,f.env);expect(f.entities[1]!.currentHp).toBe(950);expect(f.hits()[0]!.breakdown.b0.raw).toBe(50);
});
it('sequence uses exact strike boundaries, per-strike stats, independent hits and death survival',()=>{
 const f=fixture([sequence()]);f.activate();advanceSkillExecution(f.slot,f.context.combat,100,f.actions);
 advanceSkillEffects(f.runtime,150,f.env);f.entities[0]!.baseStats.physicalAttack=30;f.entities[0]!.currentHp=0;advanceSkillEffects(f.runtime,250,f.env);f.entities[0]!.baseStats.physicalAttack=50;advanceSkillEffects(f.runtime,350,f.env);
 expect(f.hits().map(h=>[h.atMs,h.breakdown.b0.raw])).toEqual([[150,20],[250,40],[350,60]]);expect(f.entities[1]!.currentHp).toBe(880);expect(f.runtime.sequences).toHaveLength(0);expect(f.rolls().critCalls).toBe(3);
});
it('random sequence remains within parent area and stable seeded processing for coarse/fine ticks',()=>{
 const run=(times:number[])=>{const s=sequence();if(s.type==='timed_aoe_sequence')Object.assign(s.config,{pattern:'random_in_area',areaRadius:20,aoeRadius:20});const f=fixture([s]);f.activate();for(const time of times)advanceSkillEffects(f.runtime,time,f.env);return {events:f.events,rolls:f.rolls(),hp:f.entities.map(e=>e.currentHp)};};
 expect(run([350])).toEqual(run([100,150,200,250,300,350]));expect(run([350]).rolls.positionCalls).toBe(6);
});
it('successful hits create independent stack snapshots; ticks sum/FIFO/expiry reuse existing Dot engine',()=>{
 const f=fixture([{...direct(),onHit:[dot()]}]);f.activate();advanceSkillExecution(f.slot,f.context.combat,100,f.actions);f.entities[0]!.baseStats.physicalAttack=30;
 f.start(100);advanceSkillEffects(f.runtime,150,f.env);advanceSkillExecution(f.slot,f.context.combat,150,f.actions);dispatchSkillEffects(f.runtime,f.actions.find((e):e is SkillActivatedEvent=>e.type==='skill-activated'&&e.actionInstanceId==='actor0#2')!,f.env);
 // First stack ticks at150 (20), then the new stack is applied at150 (40).
 expect(f.runtime.dots.groups[0]!.stacks).toHaveLength(1);f.entities[0]!.baseStats.physicalAttack=300;f.entities[1]!.baseStats.dodgeChance=.85;
 advanceSkillEffects(f.runtime,250,f.env);expect(f.hits().filter(h=>h.mechanic==='dot').map(h=>h.breakdown.b0.raw)).toEqual([20,40]);expect(f.runtime.dots.groups).toHaveLength(0);expect(f.rolls().dodgeCalls).toBe(0);
});
it('multiple on-hit stacks before first tick sum then consume FIFO; expiry wins at tick time',()=>{
 const f=fixture([{...direct(),onHit:[dot()]},{...direct(),onHit:[dot()]}]);f.activate();expect(f.runtime.dots.groups[0]!.stacks).toHaveLength(2);
 advanceSkillEffects(f.runtime,150,f.env);expect(f.hits().filter(h=>h.mechanic==='dot').map(h=>h.breakdown.finalDamage)).toEqual([20,20]);expect(f.runtime.dots.groups[0]!.stacks).toHaveLength(1);advanceSkillEffects(f.runtime,250,f.env);expect(f.runtime.dots.groups).toHaveLength(0);
 const g=fixture([{...direct(),onHit:[{...dot(),config:{...dot().config,durationMs:100}}]}]);g.activate();advanceSkillEffects(g.runtime,150,g.env);expect(g.hits().filter(h=>h.mechanic==='dot')).toHaveLength(0);
});
it('invalid/dodged direct hit does not apply DoT, spend refunds or trigger critical',()=>{
 const f=fixture([{...direct(),onHit:[dot()]}]);f.entities[1]!.baseStats.dodgeChance=.85;f.activate();expect(f.runtime.dots.groups).toHaveLength(0);expect(f.rolls().critCalls).toBe(0);expect(f.entities[0]!.currentMp).toBe(95);
 const g=fixture([{...direct(),onHit:[dot()]}]);g.start();g.entities[1]!.factionId='player';advanceSkillEffects(g.runtime,50,g.env);advanceSkillExecution(g.slot,g.context.combat,50,g.actions);dispatchSkillEffects(g.runtime,g.actions[1] as SkillActivatedEvent,g.env);expect(g.runtime.dots.groups).toHaveLength(0);expect(g.rolls().critCalls).toBe(0);
});
it.each([0,1,2])('actor %i uses identical Shared stats/damage/defense/HP pipeline (including Monster→Monster)',caster=>{
 const f=fixture([direct()],caster);if(caster===2){f.entities[1]!.factionId='hostile-other';f.context.target={mode:'entity',casterId:'actor2',targetId:'actor1'};}
 f.activate();expect(f.hits()).toHaveLength(1);expect(f.hits()[0]!.breakdown.b0.raw).toBe(20);expect(f.hits()[0]!.breakdown.entities!.attacker.entityId).toBe(`actor${caster}`);
});
it('two effects cannot subtract HP twice for one contact or emit defeat twice',()=>{
 const f=fixture([direct(),direct()]);f.entities[1]!.currentHp=10;f.activate();expect(f.entities[1]!.currentHp).toBe(0);expect(f.events.filter(e=>e.type==='entity-defeated')).toHaveLength(1);expect(f.events.filter(e=>e.type==='damage-applied')).toHaveLength(1);expect(f.hits()).toHaveLength(1);
});
it('session cleanup prevents delayed effects and mid-hit cleanup cannot resurrect bullets',()=>{
 const f=fixture([timed(),sequence(),projectile()]);f.activate();clearSkillEffects(f.runtime);advanceSkillEffects(f.runtime,10000,f.env);expect(f.entities[1]!.currentHp).toBe(1000);expect(f.runtime.bullets).toHaveLength(0);expect(f.runtime.objects).toHaveLength(0);expect(f.runtime.sequences).toHaveLength(0);expect(f.runtime.lastActivation.size).toBe(0);
 const g=fixture([projectile('pierce')]);g.activate();const emit=g.env.emit;g.env.emit=e=>{emit(e);if(e.type==='damage-applied')clearSkillEffects(g.runtime);};advanceSkillEffects(g.runtime,1200,g.env);expect(g.runtime.bullets).toHaveLength(0);expect(g.entities[2]!.currentHp).toBe(1000);
});
it('effects use explicit target filter overrides, not damage tags',()=>{
 const f=fixture([{...direct(),allowedTargetRelations:['ally'],damage:{...damage(),tags:['AoE']}}]);f.context.target={mode:'entity',casterId:'actor0',targetId:'actor1'};f.start();f.entities[1]!.factionId='player';advanceSkillEffects(f.runtime,50,f.env);advanceSkillExecution(f.slot,f.context.combat,50,f.actions);dispatchSkillEffects(f.runtime,f.actions[1] as SkillActivatedEvent,f.env);
 expect(f.hits()).toHaveLength(1);expect(f.runtime.bullets).toHaveLength(0);expect(f.runtime.sequences).toHaveLength(0);
});
it('session cleanup during spread creation cannot create later bullets',()=>{
 const effect=projectile();if(effect.type!=='projectile')throw Error('fixture');
 effect.config.bulletCount=3;effect.config.spreadAngles=[-10,0,10];
 const f=fixture([effect]);const emit=f.env.emit;
 f.env.emit=e=>{emit(e);if(e.type==='effect-created')clearSkillEffects(f.runtime);};
 f.activate();expect(f.events.filter(e=>e.type==='effect-created')).toHaveLength(1);
 expect(f.runtime.bullets).toHaveLength(0);advanceSkillEffects(f.runtime,5000,f.env);expect(f.hits()).toHaveLength(0);
});
it('Physical contact can apply independently snapshotted Magic DoT using live Magic defense',()=>{
 const d=dot();d.config.tags=['DoT','Burning','Magic'];d.damage.tags=[...d.config.tags];d.damage.damageType='Magic';
 const f=fixture([{...direct(),onHit:[d]}]);f.activate();f.entities[0]!.baseStats.physicalAttack=100;f.entities[1]!.baseStats.magicResistance=100;
 advanceSkillEffects(f.runtime,150,f.env);const tick=f.hits().find(h=>h.mechanic==='dot')!;
 expect(tick.breakdown.finalDamage).toBe(10);expect(tick.breakdown.critical.isCritical).toBe(false);expect(f.rolls().critCalls).toBe(1);expect(f.entities[1]!.currentHp).toBe(970);
});
it('activation must be applied at its actual boundary, never historical present-state resolution',()=>{
 const f=fixture();f.start();advanceSkillExecution(f.slot,f.context.combat,50,f.actions);expect(()=>dispatchSkillEffects(f.runtime,f.actions[1] as SkillActivatedEvent,f.env)).toThrow('boundary');expect(f.entities[1]!.currentHp).toBe(1000);
});
it('Core has no rendering/network/Idle state dependency and Combat Core has no reverse Skill import',()=>{
 const source=readFileSync('src/skills/skill-effect-integration.ts','utf8');expect(source).not.toMatch(/Date\.now|Math\.random|fetch\(|GameState|assetUrl|window\.|document\.|three/);
 for(const name of ['combat-state','combat-entity','damage-core','defense-engine'])expect(readCoreSource(name)).not.toMatch(/from ['"].*skill-(effect|execution|engine)/);
 expect(defineSkill(fixture().definition).success).toBe(true);
});
