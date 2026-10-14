export const MODIFIER_SOURCES=['setting','equipment','buff','passive'] as const;
export const MODIFIER_OPERATIONS=['add_flat','add_percent','add_percentage_points'] as const;
export const DERIVED_MODIFIER_OPERATIONS={attackSpeed:['add_flat','add_percent'],movementSpeedMultiplier:['add_flat','add_percent'],criticalChance:['add_percentage_points'],criticalDamage:['add_percentage_points'],dodgeChance:['add_percentage_points'],cooldownReduction:['add_percentage_points']} as const;
export interface CombatModifier {
 id:string;source:typeof MODIFIER_SOURCES[number];sourceInstanceId:string;
 target:string;operation:typeof MODIFIER_OPERATIONS[number];value:number;enabled:boolean;
 conditions:readonly unknown[];
 damageType?:'all'|'physical'|'magic';scope?:'direct'|'dot'|'all';
 eventTags?:string[];targetTags?:('boss'|'elite')[];
}
export const RATE_TARGETS=['attackSpeed','criticalChance','criticalDamage','armorReduction','dodgeChance','cooldownReduction'] as const;
export const MODIFIER_DAMAGE_TAGS=['Basic','Core','Buff','Ultimate','Melee','Ranged','AoE','Projectile','Direct','DoT','Physical','Magic','Cold','Lightning','Poison','Shadow','Burning','Bleeding'] as const;
export const DAMAGE_BONUS_EVENT_TAGS=MODIFIER_DAMAGE_TAGS.map(t=>t.toLowerCase());
export function validateCombatModifiers(input:unknown,statTargets:readonly string[],strictDerived=true):string[]{
 if(!Array.isArray(input)||input.length>256)return ['Modifiers require an array of at most256 entries'];
 const errors:string[]=[],ids=new Set<string>();
 for(const m of input){
  const fields=['id','source','sourceInstanceId','target','operation','value','enabled','conditions'];
  if(['flat_damage','damage_bonus'].includes(m?.target)){if(Object.hasOwn(m,'damageType'))fields.push('damageType');if(Object.hasOwn(m,'scope'))fields.push('scope');}
  if(m?.target==='damage_bonus')for(const field of ['eventTags','targetTags'])if(Object.hasOwn(m,field))fields.push(field);
  if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).sort().join()!==fields.sort().join()){errors.push('Invalid Modifier fields');continue;}
  const key=JSON.stringify([m.source,m.sourceInstanceId,m.id]);
  if(![m.id,m.sourceInstanceId].every(v=>typeof v==='string'&&v.length>0&&v.length<=128)||ids.has(key))errors.push('Invalid/duplicate Modifier instance');ids.add(key);
  if(!MODIFIER_SOURCES.includes(m.source)||!MODIFIER_OPERATIONS.includes(m.operation)||typeof m.enabled!=='boolean'||typeof m.value!=='number'||!Number.isFinite(m.value)||Math.abs(m.value)>1000000)errors.push(m.id+': invalid source/operation/value');
  if(!Array.isArray(m.conditions)||m.conditions.length)errors.push(m.id+': Conditional Modifiers are unsupported');
  const damageTag=typeof m.target==='string'&&m.target.startsWith('damage.tag.')?m.target.slice(11):null;
  if(!statTargets.includes(m.target)&&!['damage.flat','flat_damage','damage_bonus'].includes(m.target)&&!(damageTag&&MODIFIER_DAMAGE_TAGS.includes(damageTag as typeof MODIFIER_DAMAGE_TAGS[number])))errors.push(m.id+': unsupported target');
  if(m.target==='flat_damage'&&(m.operation!=='add_flat'||Object.hasOwn(m,'damageType')&&!['all','physical','magic'].includes(m.damageType)||Object.hasOwn(m,'scope')&&!['direct','dot','all'].includes(m.scope)))errors.push(m.id+': invalid Flat Damage operation/type/scope');
  if(m.target==='damage_bonus'){
   if(m.operation!=='add_percentage_points'||Object.hasOwn(m,'damageType')&&!['all','physical','magic'].includes(m.damageType)||Object.hasOwn(m,'scope')&&!['direct','dot','all'].includes(m.scope))errors.push(m.id+': invalid Damage Bonus operation/type/scope');
   for(const [field,tags] of [['eventTags',DAMAGE_BONUS_EVENT_TAGS],['targetTags',['boss','elite']]] as const)if(Object.hasOwn(m,field)&&(!Array.isArray(m[field])||m[field].some((t:unknown)=>typeof t!=='string'||!(tags as readonly string[]).includes(t))||new Set(m[field]).size!==m[field].length))errors.push(m.id+': invalid '+field);
  }
  if(m.operation==='add_percentage_points'&&m.target!=='damage_bonus'&&!RATE_TARGETS.includes(m.target as typeof RATE_TARGETS[number]))errors.push(m.id+': percentage points require a supported rate stat');
  if(strictDerived&&Object.hasOwn(DERIVED_MODIFIER_OPERATIONS,m.target)&&!(DERIVED_MODIFIER_OPERATIONS[m.target as keyof typeof DERIVED_MODIFIER_OPERATIONS] as readonly string[]).includes(m.operation))errors.push(m.id+': invalid Derived Stat operation');
  if(m.target==='damage.flat'&&m.operation!=='add_flat'||damageTag&&m.operation!=='add_percent')errors.push(m.id+': invalid damage operation');
  // No negative damage bonuses or new damage penalty semantics in Foundation.
  if(typeof m.target==='string'&&m.target.startsWith('damage.')&&m.value<0)errors.push(m.id+': damage bonus must be nonnegative');
 }
 return errors;
}
