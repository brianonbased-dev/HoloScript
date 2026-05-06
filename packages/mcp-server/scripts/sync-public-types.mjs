import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = resolve(root, 'package.json');
const source = resolve(root, 'types', 'index.d.ts');
const target = resolve(root, 'dist', 'index.d.ts');
const checkOnly = process.argv.includes('--check');

const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const packageTypes = pkg.types;
const exportTypes = pkg.exports?.['.']?.types;

if (packageTypes !== './dist/index.d.ts') {
  throw new Error(`package.json types must be ./dist/index.d.ts, found ${String(packageTypes)}`);
}

if (exportTypes !== './dist/index.d.ts') {
  throw new Error(`package.json exports["."].types must be ./dist/index.d.ts, found ${String(exportTypes)}`);
}

if (!existsSync(source)) {
  throw new Error(`Missing public type source: ${source}`);
}

if (checkOnly) {
  if (!existsSync(target)) {
    throw new Error(`Missing generated public type artifact: ${target}`);
  }
  const sourceText = readFileSync(source, 'utf8');
  const targetText = readFileSync(target, 'utf8');
  if (sourceText !== targetText) {
    throw new Error('Generated public type artifact is stale; run npm run build in packages/mcp-server.');
  }
  console.log('mcp-server public types are present and current');
} else {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log(`synced public types: ${target}`);
}
