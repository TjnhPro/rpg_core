import type {CalculationSnapshot,NumericalOffenseSnapshot} from '../contracts/snapshots.js';
import {cloneSnapshotData,freezeSnapshotData} from './snapshot-data.js';

// Closed snapshot shapes only. Descriptor inspection never evaluates accessors.
// The active path rejects cycles, not shared references in independent branches.
type Check=(value:unknown,active:Set<object>)=>boolean;
const number:Check=v=>typeof v==='number';
const string:Check=v=>typeof v==='string';
const boolean:Check=v=>typeof v==='boolean';
const optional=(check:Check):Check=>(v,a)=>v===undefined||check(v,a);
function fields(value:unknown,required:Record<string,Check>,extras:Record<string,Check>,active:Set<object>):boolean {
 if(!value||typeof value!=='object'||Array.isArray(value)||active.has(value))return false;
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)return false;
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 if(Object.keys(required).some(k=>!Object.hasOwn(descriptors,k)))return false;
 active.add(value);
 try {
  return keys.every(k=>{
   if(typeof k!=='string')return false;
   const d=descriptors[k]!,check=Object.hasOwn(required,k)?required[k]:Object.hasOwn(extras,k)?extras[k]:undefined;
   return !!check&&d.enumerable===true&&Object.hasOwn(d,'value')&&check(d.value,active);
  });
 }finally{active.delete(value);}
}
const numbers:Check=(value,active)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||active.has(value))return false;
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)return false;
 return Reflect.ownKeys(value).every(k=>{
  const d=Object.getOwnPropertyDescriptor(value,k)!;
  return typeof k==='string'&&d.enumerable===true&&Object.hasOwn(d,'value')&&typeof d.value==='number';
 });
};
const list=(check:Check):Check=>(value,active)=>{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||active.has(value))return false;
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(value);
 if(keys.length!==value.length+1)return false;
 active.add(value);
 try {
  for(let i=0;i<value.length;i++){
   const d=descriptors[String(i)];
   if(!d||!d.enumerable||!Object.hasOwn(d,'value')||!check(d.value,active))return false;
  }
  return true;
 }finally{active.delete(value);}
};
const contribution:Check=(v,a)=>fields(v,{id:string,value:number},{},a);
const bonus:Check=(v,a)=>fields(v,{id:string,source:string,eligible:boolean,reason:string,value:number,contributions:list(contribution)},{},a);
const bounds:Check=(v,a)=>fields(v,{},{min:optional(number),max:optional(number)},a);
const precision:Check=(v,a)=>fields(v,{decimalPlaces:number},{},a);
const scaling:Check=(v,a)=>fields(v,{attribute:string,coefficient:number,enabled:boolean},{},a);
const rule:Check=(v,a)=>fields(v,{default:number,bounds,enabled:boolean,training:number,scaling:list(scaling)},{precision:optional(precision)},a);
const rules:Check=(v,a)=>{
 if(!v||typeof v!=='object'||Array.isArray(v)||a.has(v))return false;
 const prototype=Object.getPrototypeOf(v);
 if(prototype!==Object.prototype&&prototype!==null)return false;
 a.add(v);
 try{return Reflect.ownKeys(v).every(k=>{const d=Object.getOwnPropertyDescriptor(v,k)!;return typeof k==='string'&&d.enumerable===true&&Object.hasOwn(d,'value')&&rule(d.value,a);});}
 finally{a.delete(v);}
};
const identity:Check=(v,a)=>fields(v,{source:string,sourceInstanceId:string,id:string},{},a);
const operation:Check=v=>v==='add_flat'||v==='add_percent'||v==='add_percentage_points';
const modifier:Check=(v,a)=>fields(v,{identity,target:string,operation,value:number,enabled:boolean},{},a);
const context:Check=(v,a)=>fields(v,{},{damageType:optional(string),tags:optional(list(string)),ownerId:optional(string),revision:optional(string)},a);

/** Capture closed numerical data in one native clone, then freeze every nested
 * record/array. No gameplay trust, callbacks, RNG, clocks or hidden lookups.
 * Aliases inside the graph survive; caller aliases do not. Numbers are copied
 * without finite/range normalization. Unsupported shapes throw TypeError. */
export function captureNumericalOffenseSnapshot<Source extends string=string,Bonus extends string=string>(input:NumericalOffenseSnapshot<Source,Bonus>):NumericalOffenseSnapshot<Source,Bonus> {
 if(!fields(input,{sources:numbers,flatContributions:list(contribution),bonuses:list(bonus),criticalChance:number,criticalBonus:number},{},new Set()))throw new TypeError('Invalid numerical offense snapshot');
 const copy=cloneSnapshotData(input);freezeSnapshotData(copy);return copy;
}

/** Closed data capture, not a calculation or gameplay context/session capture.
 * Input accessors, cycles, unknown fields and non-data containers are rejected.
 * Native copy/freeze failures propagate; the caller's input is never frozen. */
export function captureCalculationSnapshot<A extends string=string,S extends string=string,Source extends string=string,DamageType extends string=string,Tag extends string=string>(input:CalculationSnapshot<A,S,Source,DamageType,Tag>):CalculationSnapshot<A,S,Source,DamageType,Tag> {
 if(!fields(input,{attributes:numbers,stats:numbers,statRules:rules,modifiers:list(modifier),context},{},new Set()))throw new TypeError('Invalid calculation snapshot');
 const copy=cloneSnapshotData(input);freezeSnapshotData(copy);return copy;
}
