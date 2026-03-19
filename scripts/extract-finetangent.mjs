import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const text = fs.readFileSync(path.join(root, 'linuxdoom-1.10/tables.c'), 'utf8');

const m = text.match(/int finetangent\[4096\]\s*=\s*\{([\s\S]*?)\n\};/);
if (!m) throw new Error('finetangent block not found');
const nums = m[1].match(/-?\d+/g).map(Number);
if (nums.length !== 4096) throw new Error(`expected 4096, got ${nums.length}`);

const lines = [];
for (let j = 0; j < nums.length; j += 8) {
  lines.push('  ' + nums.slice(j, j + 8).join(','));
}

const out =
  '/**\n' +
  ' * Vanilla `finetangent[4096]` from linuxdoom-1.10/tables.c\n' +
  ' * Regenerate: `node scripts/extract-finetangent.mjs`\n' +
  ' */\n' +
  'export const FINETANGENT_LUT: readonly number[] = [\n' +
  lines.join(',\n') +
  '\n];\n';

fs.writeFileSync(path.join(root, 'src/core/finetangentLUT.ts'), out);
console.log('wrote src/core/finetangentLUT.ts', nums.length);
