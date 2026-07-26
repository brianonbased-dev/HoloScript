import { access, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'pkg/holoscript_wasm.js',
  'pkg/holoscript_wasm.d.ts',
  'pkg/holoscript_wasm_bg.wasm',
  'pkg/package.json',
  'pkg/rebuild-receipt.json',
  'README.md',
  'LICENSE',
];

const missing = [];
const empty = [];

for (const relativePath of requiredFiles) {
  const absolutePath = resolve(root, relativePath);
  try {
    await access(absolutePath);
    const file = await stat(absolutePath);
    if (!file.isFile() || file.size === 0) {
      empty.push(relativePath);
    }
  } catch {
    missing.push(relativePath);
  }
}

if (missing.length > 0 || empty.length > 0) {
  if (missing.length > 0) {
    console.error(`Missing WASM package files: ${missing.join(', ')}`);
  }
  if (empty.length > 0) {
    console.error(`Invalid empty WASM package files: ${empty.join(', ')}`);
  }
  console.error('Run `pnpm --filter @holoscript/wasm run build` before packing or publishing.');
  process.exit(1);
}

if (process.env.npm_lifecycle_event !== 'prepack') {
  console.log('WASM package artifacts present.');
}
