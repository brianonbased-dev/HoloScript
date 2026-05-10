#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const studioRoot = join(scriptDir, '..');
const srcRoot = join(studioRoot, 'src');
const appRoot = join(srcRoot, 'app');
const componentsRoot = join(srcRoot, 'components');
const hooksRoot = join(srcRoot, 'hooks');
const libRoot = join(srcRoot, 'lib');
const nextRoot = join(studioRoot, '.next');

const JSON_MODE = process.argv.includes('--json');
const VALID_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const TEST_FILE_PATTERN =
  /(?:^|[\\/])__(?:tests|mocks|fixtures)__[\\/]|(?:\.test|\.spec)\.[tj]sx?$/;
const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
]);

function walkFiles(root, predicate = () => true) {
  if (!existsSync(root)) return [];

  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) stack.push(join(current, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;
      const path = join(current, entry.name);
      if (predicate(path)) out.push(path);
    }
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function isSourceFile(path) {
  return VALID_SOURCE_EXTENSIONS.has(extname(path)) && !TEST_FILE_PATTERN.test(path);
}

function normalizePath(path) {
  return path.split(sep).join('/');
}

function routeFromAppFile(path) {
  const rel = normalizePath(relative(appRoot, path));
  const routePath = rel.replace(/\/(?:page|route)\.[tj]sx?$/, '');
  if (routePath === '') return '/';

  const segments = routePath
    .split('/')
    .filter((segment) => segment && !segment.startsWith('(') && !segment.startsWith('@'));
  return `/${segments.join('/')}`.replace(/\/+/g, '/');
}

function collectRoutes() {
  const pageFiles = walkFiles(
    appRoot,
    (path) =>
      isSourceFile(path) && /[\\/]page\.[tj]sx?$/.test(path) && !path.includes(`${sep}api${sep}`)
  );
  const apiRouteFiles = walkFiles(
    join(appRoot, 'api'),
    (path) => isSourceFile(path) && /[\\/]route\.[tj]s$/.test(path)
  );

  return {
    appPages: pageFiles.map((path) => ({
      route: routeFromAppFile(path),
      file: normalizePath(relative(studioRoot, path)),
    })),
    apiRoutes: apiRouteFiles.map((path) => ({
      route: routeFromAppFile(path),
      file: normalizePath(relative(studioRoot, path)),
    })),
  };
}

function countSourceFiles(root) {
  return walkFiles(root, isSourceFile).length;
}

function countPanelKeys() {
  const storePath = join(libRoot, 'stores', 'panelVisibilityStore.ts');
  if (!existsSync(storePath)) return null;

  const source = readFileSync(storePath, 'utf8');
  const match = source.match(/const PANEL_KEYS:\s*PanelKey\[\]\s*=\s*\[([\s\S]*?)\];/);
  if (!match) return null;

  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]).length;
}

function collectPanelMetrics() {
  return {
    panelKeys: countPanelKeys(),
    panelComponents: walkFiles(join(componentsRoot, 'panels'), isSourceFile).length,
  };
}

function bytesToKiB(bytes) {
  return Math.round((bytes / 1024) * 10) / 10;
}

function routeChunkName(path) {
  const rel = normalizePath(relative(join(nextRoot, 'static', 'chunks', 'app'), path));
  return rel.replace(/-[a-f0-9]{16,}\.js$/, '.js');
}

function collectBundleSignal() {
  const appChunksRoot = join(nextRoot, 'static', 'chunks', 'app');
  if (!existsSync(appChunksRoot)) {
    return {
      available: false,
      reason: 'Run pnpm --filter @holoscript/studio build to generate .next bundle artifacts.',
    };
  }

  const chunks = walkFiles(appChunksRoot, (path) => extname(path) === '.js').map((path) => ({
    routeChunk: routeChunkName(path),
    bytes: statSync(path).size,
  }));
  const totalAppClientJsBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
  const createRouteBytes = chunks
    .filter((chunk) => chunk.routeChunk.startsWith('create/'))
    .reduce((sum, chunk) => sum + chunk.bytes, 0);

  return {
    available: true,
    totalAppClientJsBytes,
    totalAppClientJsKiB: bytesToKiB(totalAppClientJsBytes),
    createRouteClientJsBytes: createRouteBytes,
    createRouteClientJsKiB: bytesToKiB(createRouteBytes),
    largestAppChunks: chunks
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 10)
      .map((chunk) => ({
        ...chunk,
        kib: bytesToKiB(chunk.bytes),
      })),
  };
}

function buildInventory() {
  const routes = collectRoutes();
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    package: '@holoscript/studio',
    roots: {
      studio: normalizePath(relative(process.cwd(), studioRoot)) || '.',
      source: normalizePath(relative(studioRoot, srcRoot)),
    },
    counts: {
      appPages: routes.appPages.length,
      apiRoutes: routes.apiRoutes.length,
      components: countSourceFiles(componentsRoot),
      hooks: countSourceFiles(hooksRoot),
      libModules: countSourceFiles(libRoot),
      ...collectPanelMetrics(),
    },
    topRouteBuckets: bucketRoutes(routes.appPages, 8),
    topApiBuckets: bucketRoutes(routes.apiRoutes, 8, '/api'),
    bundle: collectBundleSignal(),
  };
}

function bucketRoutes(routes, limit, ignoredRoot) {
  const buckets = new Map();
  for (const route of routes) {
    const parts = route.route.split('/').filter(Boolean);
    if (ignoredRoot && parts[0] === ignoredRoot.replace(/^\//, '')) parts.shift();
    const first = parts[0] || '/';
    buckets.set(first, (buckets.get(first) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => b.count - a.count || a.bucket.localeCompare(b.bucket))
    .slice(0, limit);
}

function printText(inventory) {
  const { counts, bundle } = inventory;
  console.log('HoloScript Studio inventory');
  console.log(`generatedAt: ${inventory.generatedAt}`);
  console.log('');
  console.log('Counts');
  console.log(`  app pages:        ${counts.appPages}`);
  console.log(`  api routes:       ${counts.apiRoutes}`);
  console.log(`  components:       ${counts.components}`);
  console.log(`  hooks:            ${counts.hooks}`);
  console.log(`  lib modules:      ${counts.libModules}`);
  console.log(`  panel keys:       ${counts.panelKeys ?? 'unknown'}`);
  console.log(`  panel components: ${counts.panelComponents}`);
  console.log('');
  console.log('Top page route buckets');
  for (const bucket of inventory.topRouteBuckets) {
    console.log(`  ${bucket.bucket}: ${bucket.count}`);
  }
  console.log('');
  console.log('Top API route buckets');
  for (const bucket of inventory.topApiBuckets) {
    console.log(`  ${bucket.bucket}: ${bucket.count}`);
  }
  console.log('');
  console.log('Bundle signal');
  if (!bundle.available) {
    console.log(`  unavailable: ${bundle.reason}`);
    return;
  }

  console.log(`  app client JS: ${bundle.totalAppClientJsKiB} KiB`);
  console.log(`  /create chunks: ${bundle.createRouteClientJsKiB} KiB`);
  console.log('  largest app chunks:');
  for (const chunk of bundle.largestAppChunks) {
    console.log(`    ${chunk.kib} KiB  ${chunk.routeChunk}`);
  }
}

const inventory = buildInventory();
if (JSON_MODE) console.log(JSON.stringify(inventory, null, 2));
else printText(inventory);
