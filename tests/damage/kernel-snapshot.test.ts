import {afterEach,describe,expect,it,vi} from 'vitest';
import {captureCalculationSnapshot,captureNumericalOffenseSnapshot,type CalculationSnapshot,type NumericalOffenseSnapshot} from '../../src/kernel/index.js';
const offense=()=>({sources:{strength:10,magic:4},flatContributions:[{id:'flat',value:2}],bonuses:[{id:'bonus',source:'item',eligible:true,reason:'caller',value:.2,contributions:[{id:'a',value:.2}]}],criticalChance:.2,criticalBonus:.5});
const calculation=()=>({attributes:{strength:10},stats:{health:100},statRules:{health:{default:100,bounds:{min:0,max:Infinity},enabled:true,precision:{decimalPlaces:4},training:0,scaling:[{attribute:'strength',coefficient:2,enabled:true}]}},modifiers:[{identity:{source:'item',sourceInstanceId:'i',id:'m'},target:'health',operation:'add_flat' as const,value:5,enabled:true}],context:{damageType:'arcane',tags:['spell'],ownerId:'descriptive',revision:'r1'}});
function frozenGraph(v:unknown,seen=new Set<object>()):void {if(v&&typeof v==='object'&&!seen.has(v)){seen.add(v);expect(Object.isFrozen(v)).toBe(true);Object.values(v).forEach(x=>frozenGraph(x,seen));}}
afterEach(()=>vi.restoreAllMocks());
it('detaches and freezes all offense branches without freezing caller input',()=>{
 const i=offense(),s=captureNumericalOffenseSnapshot(i),again=captureNumericalOffenseSnapshot(i);
 expect(s).toStrictEqual(i);expect(s).not.toBe(i);expect(s).not.toBe(again);frozenGraph(s);
 i.sources.strength=99;i.flatContributions[0]!.value=99;i.bonuses[0]!.contributions[0]!.value=99;
 expect(s.sources.strength).toBe(10);expect(s.flatContributions[0]!.value).toBe(2);expect(s.bonuses[0]!.contributions[0]!.value).toBe(.2);
 expect(()=>{(s.sources as Record<string,number>).strength=99;}).toThrow(TypeError);
});
it('detaches all rules, identities and context; never infers trust from labels',()=>{
 const i=calculation(),s=captureCalculationSnapshot(i);frozenGraph(s);
 i.context.tags.push('later');i.statRules.health.scaling[0]!.coefficient=9;i.statRules.health.bounds.min=50;i.modifiers[0]!.identity.id='other';i.attributes.strength=99;
 expect(s.context.tags).toEqual(['spell']);expect(s.statRules.health!.scaling[0]!.coefficient).toBe(2);expect(s.statRules.health!.bounds.min).toBe(0);expect(s.modifiers[0]!.identity.id).toBe('m');expect(s.attributes.strength).toBe(10);
 expect(()=>{(s.context.tags as string[]).push('x');}).toThrow(TypeError);
});
it('preserves shared reference topology across independent valid branches',()=>{
 const i=offense();i.bonuses[0]!.contributions=i.flatContributions;
 const s=captureNumericalOffenseSnapshot(i);expect(s.bonuses[0]!.contributions).toBe(s.flatContributions);expect(s.flatContributions).not.toBe(i.flatContributions);
 const c=calculation();c.stats=c.attributes as unknown as typeof c.stats;
 const t=captureCalculationSnapshot(c);expect(t.attributes).toBe(t.stats);expect(t.attributes).not.toBe(c.attributes);
});
it('preserves special numbers, explicit undefined, key order and dynamic keys',()=>{
 const values=Object.assign(Object.create(null),{'sức mạnh':NaN,constructor:Infinity});Object.defineProperty(values,'__proto__',{value:-0,enumerable:true});
 const s=captureNumericalOffenseSnapshot({...offense(),sources:values,criticalChance:-Infinity});
 expect(Object.keys(s.sources)).toEqual(Object.keys(values));expect(Number.isNaN(s.sources['sức mạnh'])).toBe(true);expect(Object.is(s.sources.__proto__,-0)).toBe(true);expect(s.sources.constructor).toBe(Infinity);expect(s.criticalChance).toBe(-Infinity);
 const c=captureCalculationSnapshot({...calculation(),context:{revision:undefined,tags:undefined},statRules:{health:{...calculation().statRules.health,precision:undefined}}} as unknown as CalculationSnapshot);
 expect(Object.keys(c.context)).toEqual(['revision','tags']);expect(Object.hasOwn(c.statRules.health!,'precision')).toBe(true);expect(c.context.revision).toBeUndefined();
});
it('clones the entire valid graph exactly once, then freezes children first',()=>{
 const clone=vi.spyOn(globalThis,'structuredClone'),freeze=vi.spyOn(Object,'freeze');const s=captureCalculationSnapshot(calculation());
 expect(clone).toHaveBeenCalledTimes(1);expect(freeze.mock.calls.at(-1)?.[0]).toBe(s);frozenGraph(s);
});
it('propagates native clone and freeze thrown objects without touching input',()=>{
 const sentinel={},i=offense();vi.spyOn(globalThis,'structuredClone').mockImplementation(()=>{throw sentinel;});
 try{captureNumericalOffenseSnapshot(i);expect.fail();}catch(e){expect(e).toBe(sentinel);}expect(Object.isFrozen(i)).toBe(false);
 vi.restoreAllMocks();vi.spyOn(Object,'freeze').mockImplementation(()=>{throw sentinel;});
 try{captureNumericalOffenseSnapshot(i);expect.fail();}catch(e){expect(e).toBe(sentinel);}expect(Object.isFrozen(i.sources)).toBe(false);
});
const badValues=[null,undefined,1,'x',()=>0,new Date(),new Map(),new Set(),new Uint8Array(2),Object.create({}),[],Symbol('x')];
describe.each([['offense',offense,captureNumericalOffenseSnapshot],['calculation',calculation,captureCalculationSnapshot]] as const)('%s closed schema',(_label,make,capture)=>{
 const run=(v:unknown)=>(capture as (x:never)=>unknown)(v as never);
 it.each(badValues)('rejects wrong root/container %s',bad=>expect(()=>run(bad)).toThrow(TypeError));
 it('rejects callbacks, runtime state and unknown fields',()=>{
  for(const key of ['roll','criticalRoll','randomSeed','session','entity','extra'])expect(()=>run({...make(),[key]:()=>0})).toThrow(TypeError);
 });
 it('rejects missing, nonenumerable, symbol and inherited fields',()=>{
  const i=make(),key=Object.keys(i)[0]!;
  const missing={...i};delete (missing as Record<string,unknown>)[key];expect(()=>run(missing)).toThrow(TypeError);
  const hidden={...i};Object.defineProperty(hidden,key,{value:(i as unknown as Record<string,unknown>)[key],enumerable:false});expect(()=>run(hidden)).toThrow(TypeError);
  expect(()=>run({...i,[Symbol('hidden')]:1})).toThrow(TypeError);expect(()=>run(Object.create(i))).toThrow(TypeError);
 });
 it('rejects accessors without invoking them and propagates proxy errors',()=>{
  const i=make(),getter=vi.fn(()=>1);Object.defineProperty(i,Object.keys(i)[0]!,{get:getter,enumerable:true});expect(()=>run(i)).toThrow(TypeError);expect(getter).not.toHaveBeenCalled();
  const sentinel={};try{run(new Proxy(make(),{ownKeys(){throw sentinel;}}));expect.fail();}catch(e){expect(e).toBe(sentinel);}
 });
});
it('rejects nested unknown/accessor containers, sparse/extended arrays and cycles',()=>{
 for(const bad of [new Date(),{id:'x',value:1,session:{}},{get id(){throw Error('must not run');},value:1}])expect(()=>captureNumericalOffenseSnapshot({...offense(),flatContributions:[bad]} as never)).toThrow(TypeError);
 const sparse=Array(1);expect(()=>captureNumericalOffenseSnapshot({...offense(),flatContributions:sparse})).toThrow(TypeError);
 const extended=Object.assign([],{extra:1});expect(()=>captureNumericalOffenseSnapshot({...offense(),flatContributions:extended})).toThrow(TypeError);
 const i=calculation();(i.statRules.health as unknown as Record<string,unknown>).scaling=[i.statRules.health];expect(()=>captureCalculationSnapshot(i)).toThrow(TypeError);
 const o=offense();(o.sources as unknown as Record<string,unknown>).strength=o;expect(()=>captureNumericalOffenseSnapshot(o)).toThrow(TypeError);
});
it('does not accept RNG in nested context or rules',()=>{
 expect(()=>captureCalculationSnapshot({...calculation(),context:{...calculation().context,roll:()=>0}} as never)).toThrow(TypeError);
 expect(()=>captureCalculationSnapshot({...calculation(),statRules:{health:{...calculation().statRules.health,transform:()=>0}}} as never)).toThrow(TypeError);
});
// Compile-time contracts remain the existing three interfaces.
const inferOffense:NumericalOffenseSnapshot<'strength'|'magic'>=captureNumericalOffenseSnapshot(offense());
const inferCalculation:CalculationSnapshot<'strength','health','item','arcane','spell'>=captureCalculationSnapshot<'strength','health','item','arcane','spell'>(calculation() as CalculationSnapshot<'strength','health','item','arcane','spell'>);
void inferOffense;void inferCalculation;
