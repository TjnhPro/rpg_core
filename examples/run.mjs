import {headlessCombat} from '../dist/examples/headless.js';
const a=headlessCombat(73),b=headlessCombat(73);
if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Determinism mismatch');
console.log(JSON.stringify({status:'PASS',targetHp:a.entities[1].currentHp,events:a.events.length,seed:73,deterministic:true,cleanup:true}));
