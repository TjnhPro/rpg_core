import {calculateResourceTransition} from '@rpg/core/kernel';
import {observeLegacyIsolation} from './legacy-isolation-scenarios.js';
// Same observations after packing/installing. No private package imports and no
// alternate simulation; the copied helpers drive the installed public runtime.
export function legacyIsolationConsumer(){
 const transition=calculateResourceTransition({resource:'mp',current:0,amount:5,maximum:100,operation:'increase',rule:{minimum:0,currentAboveMaximum:'reject',allowIncreaseFromMinimum:true}});
 if(transition.after!==5)throw Error('Installed Kernel resource delegation unavailable');
 return observeLegacyIsolation();
}
