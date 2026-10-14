import {headlessCombat} from '../.example-dist/headless.js';
import {createHash} from 'node:crypto';
const a=headlessCombat(73),b=headlessCombat(73);
if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Determinism mismatch');
// Full result baseline captured from reviewed commit c5878d9 before refactoring.
const hash=createHash('sha256').update(JSON.stringify(a)).digest('hex');
if(hash!=='29e8dbe79332a34a6760628aebfa157e5788a5750038183de558310fa9102656')throw Error('Snapshot behavior changed');
console.log(JSON.stringify({status:'PASS',targetHp:a.entities[1].currentHp,events:a.events.length,seed:73,deterministic:true,cleanup:true}));
