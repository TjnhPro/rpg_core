import { DAMAGE_TAGS } from './damage-contracts.js';
export const DOT_EFFECTS=['Poison','Burning','Bleeding'] as const;
export interface DotConfig {
 effectId:typeof DOT_EFFECTS[number];enabled:boolean;trigger:'on_hit';maxStacks:number;
 durationMs:number;tickIntervalMs:number;firstTickMs:number;stackMode:'consume_on_tick';
 consumeOrder:'FIFO';canCrit:false;damageComponent:string;tags:string[];
}
export const DEFAULT_DOT:DotConfig={effectId:'Poison',enabled:true,trigger:'on_hit',maxStacks:10,durationMs:5000,tickIntervalMs:1000,firstTickMs:1000,stackMode:'consume_on_tick',consumeOrder:'FIFO',canCrit:false,damageComponent:'component',tags:['DoT','Poison']};
export function validateDots(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>3)return ['dot requires at most3 effect declarations'];
 const seen=new Set<string>(),errors:string[]=[];
 for(const c of value as DotConfig[]){
  if(!c||typeof c!=='object'||Object.keys(c).sort().join()!==Object.keys(DEFAULT_DOT).sort().join()){errors.push('Invalid dot fields');continue;}
  if(!DOT_EFFECTS.includes(c.effectId)||seen.has(c.effectId)||typeof c.enabled!=='boolean'||c.trigger!=='on_hit'||c.stackMode!=='consume_on_tick'||c.consumeOrder!=='FIFO'||c.canCrit!==false||typeof c.damageComponent!=='string')errors.push('Invalid dot effect/trigger/stack mode/Crit');seen.add(c.effectId);
  if(!Number.isInteger(c.maxStacks)||c.maxStacks<1||c.maxStacks>64||!Number.isFinite(c.durationMs)||c.durationMs<=0||c.durationMs>60000||!Number.isFinite(c.tickIntervalMs)||c.tickIntervalMs<50||c.tickIntervalMs>60000||!Number.isFinite(c.firstTickMs)||c.firstTickMs<50||c.firstTickMs>c.durationMs)errors.push('Invalid dot duration/interval/stacks');
  if(!Array.isArray(c.tags)||!c.tags.includes('DoT')||c.tags.includes('Direct')||c.tags.some(t=>!DAMAGE_TAGS.includes(t as never))||new Set(c.tags).size!==c.tags.length)errors.push('Invalid dot damage tags');
 }
 return errors;
}
