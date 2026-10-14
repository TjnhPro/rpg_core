import {readFileSync} from 'node:fs';
const files:Record<string,string>={
  "skill-effects": "src/skills/skill-effects.ts",
  "combat-entity": "src/combat/combat-entity.ts",
  "combat-state": "src/combat/combat-state.ts",
  "damage-core": "src/damage/damage-core.ts",
  "defense-engine": "src/damage/defense-engine.ts",
  "stat-calculation": "src/stats/stat-calculation.ts",
  "modifier-core": "src/modifiers/modifier-core.ts",
  "skill-engine": "src/skills/skill-engine.ts",
  "skill-execution": "src/skills/skill-execution.ts",
  "skill-effect-integration": "src/skills/skill-effect-integration.ts",
  "effect-system": "src/effects/effect-system.ts",
  "effect-lifecycle": "src/effects/effect-lifecycle.ts",
  "dot-core": "src/effects/dot-core.ts",
  "aoe-sequence-core": "src/mechanics/aoe-sequence-core.ts",
  "emitter-core": "src/mechanics/emitter-core.ts",
  "instant-aoe": "src/mechanics/instant-aoe.ts",
  "melee-hitbox": "src/mechanics/melee-hitbox.ts",
  "projectile": "src/mechanics/projectile.ts",
  "grid-geometry": "src/spatial/grid-geometry.ts",
  "range": "src/spatial/range.ts"
};
export function readCoreSource(name:string):string {
 const file=files[name];if(!file)throw Error('Unknown Core module: '+name);return readFileSync(file,'utf8');
}
