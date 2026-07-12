import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = resolve(root, 'package.json');
const source = resolve(root, 'types', 'index.d.ts');
const target = resolve(root, 'dist', 'index.d.ts');
const sizingSource = resolve(root, 'types', 'server-sizing.d.ts');
const sizingTarget = resolve(root, 'dist', 'server-sizing.d.ts');
const serviceSource = resolve(root, 'types', 'service.d.ts');
const serviceTarget = resolve(root, 'dist', 'service.d.ts');
const checkOnly = process.argv.includes('--check');

const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const packageTypes = pkg.types;
const exportTypes = pkg.exports?.['.']?.types;
const sizingExportTypes = pkg.exports?.['./server-sizing']?.types;
const serviceExportTypes = pkg.exports?.['./service']?.types;

if (packageTypes !== './dist/index.d.ts') {
  throw new Error(`package.json types must be ./dist/index.d.ts, found ${String(packageTypes)}`);
}

if (exportTypes !== './dist/index.d.ts') {
  throw new Error(
    `package.json exports["."].types must be ./dist/index.d.ts, found ${String(exportTypes)}`
  );
}

if (sizingExportTypes !== './dist/server-sizing.d.ts') {
  throw new Error(
    `package.json exports["./server-sizing"].types must be ./dist/server-sizing.d.ts, found ${String(
      sizingExportTypes
    )}`
  );
}

if (serviceExportTypes !== './dist/service.d.ts') {
  throw new Error(
    `package.json exports["./service"].types must be ./dist/service.d.ts, found ${String(
      serviceExportTypes
    )}`
  );
}

if (!existsSync(source)) {
  throw new Error(`Missing public type source: ${source}`);
}

if (!existsSync(sizingSource)) {
  throw new Error(`Missing public type source: ${sizingSource}`);
}

if (!existsSync(serviceSource)) {
  throw new Error(`Missing public type source: ${serviceSource}`);
}

if (checkOnly) {
  if (!existsSync(target)) {
    throw new Error(`Missing generated public type artifact: ${target}`);
  }
  if (!existsSync(sizingTarget)) {
    throw new Error(`Missing generated public type artifact: ${sizingTarget}`);
  }
  if (!existsSync(serviceTarget)) {
    throw new Error(`Missing generated public type artifact: ${serviceTarget}`);
  }
  const sourceText = readFileSync(source, 'utf8');
  const targetText = readFileSync(target, 'utf8');
  const sizingSourceText = readFileSync(sizingSource, 'utf8');
  const sizingTargetText = readFileSync(sizingTarget, 'utf8');
  const serviceSourceText = readFileSync(serviceSource, 'utf8');
  const serviceTargetText = readFileSync(serviceTarget, 'utf8');
  if (sourceText !== targetText) {
    throw new Error(
      'Generated public type artifact is stale; run npm run build in packages/mcp-server.'
    );
  }
  if (sizingSourceText !== sizingTargetText) {
    throw new Error(
      'Generated server-sizing type artifact is stale; run npm run build in packages/mcp-server.'
    );
  }
  if (serviceSourceText !== serviceTargetText) {
    throw new Error(
      'Generated service type artifact is stale; run npm run build in packages/mcp-server.'
    );
  }
  console.log('mcp-server public types are present and current');
} else {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  copyFileSync(sizingSource, sizingTarget);
  copyFileSync(serviceSource, serviceTarget);
  console.log(`synced public types: ${target}`);
  console.log(`synced server-sizing public types: ${sizingTarget}`);
  console.log(`synced service public types: ${serviceTarget}`);
}
