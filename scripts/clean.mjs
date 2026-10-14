import {rmSync} from 'node:fs';
// Fixed generated directory inside this repository, never a caller-supplied path.
rmSync(new URL('../dist/', import.meta.url), {recursive: true, force: true});
