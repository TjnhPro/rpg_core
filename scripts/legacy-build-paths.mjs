import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mapping = JSON.parse(readFileSync(path.join(root, 'docs/module-map.json'), 'utf8'));
// Preserve the snapshot's documented dist/src/shared paths with generated
// forwarders, so existing repository-relative compiled imports keep working.
for (const [original, canonical] of Object.entries(mapping)) {
  const legacy = `dist/${original.replace(/\.ts$/, '.js')}`;
  const current = canonical.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js');
  const relative = path.posix.relative(path.posix.dirname(legacy), current);
  const content = `/** @deprecated Use @rpg/core public entrypoints. */\nexport * from '${relative}';\n`;
  mkdirSync(path.dirname(path.join(root, legacy)), {recursive: true});
  writeFileSync(path.join(root, legacy), content);
  writeFileSync(path.join(root, legacy.replace(/\.js$/, '.d.ts')), content);
}
