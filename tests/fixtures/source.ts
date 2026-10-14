import {readFileSync} from 'node:fs';
import path from 'node:path';

// Reuse the reviewed compatibility map instead of maintaining a second registry.
const mapping = JSON.parse(readFileSync('docs/module-map.json', 'utf8')) as Record<string, string>;
const files = Object.fromEntries(Object.values(mapping).map(file => [path.posix.basename(file, '.ts'), file]));
export function readCoreSource(name:string):string {
 const file=files[name];if(!file)throw Error('Unknown Core module: '+name);return readFileSync(file,'utf8');
}
