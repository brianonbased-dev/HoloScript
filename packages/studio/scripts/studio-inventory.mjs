#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
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
const SNAPSHOT_MODE = process.argv.includes('--snapshot');
const CHECK_INDEX = process.argv.indexOf('--check');
const CHECK_PATH = CHECK_INDEX >= 0 ? process.argv[CHECK_INDEX + 1] : null;
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
  if (match) return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]).length;

  const registryPath = join(libRoot, 'studio', 'viewRegistry.ts');
  if (!existsSync(registryPath)) return null;

  const registrySource = readFileSync(registryPath, 'utf8');
  const titlesMatch = registrySource.match(/const VIEW_TITLES\s*=\s*\{([\s\S]*?)\}\s*as const;/);
  if (!titlesMatch) return null;

  return [...titlesMatch[1].matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)].length;
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

function toSnapshot(inventory) {
  return {
    package: inventory.package,
    counts: inventory.counts,
    topRouteBuckets: inventory.topRouteBuckets,
    topApiBuckets: inventory.topApiBuckets,
  };
}

function collectSnapshotDiffs(expected, actual, path = 'snapshot') {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return [`${path}: expected ${formatValue(expected)}, got ${formatValue(actual)}`];
    }

    const diffs = [];
    if (expected.length !== actual.length) {
      diffs.push(`${path}.length: expected ${expected.length}, got ${actual.length}`);
    }

    const max = Math.max(expected.length, actual.length);
    for (let i = 0; i < max; i += 1) {
      diffs.push(...collectSnapshotDiffs(expected[i], actual[i], `${path}[${i}]`));
    }
    return diffs;
  }

  if (isPlainObject(expected) || isPlainObject(actual)) {
    if (!isPlainObject(expected) || !isPlainObject(actual)) {
      return [`${path}: expected ${formatValue(expected)}, got ${formatValue(actual)}`];
    }

    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    return keys.flatMap((key) => {
      if (!(key in expected)) return [`${path}.${key}: unexpected ${formatValue(actual[key])}`];
      if (!(key in actual)) return [`${path}.${key}: missing, expected ${formatValue(expected[key])}`];
      return collectSnapshotDiffs(expected[key], actual[key], `${path}.${key}`);
    });
  }

  if (expected !== actual) {
    return [`${path}: expected ${formatValue(expected)}, got ${formatValue(actual)}`];
  }

  return [];
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatValue(value) {
  return JSON.stringify(value);
}

function runSnapshotCheck(checkPath, inventory) {
  if (!checkPath || checkPath.startsWith('--')) {
    console.error('[studio-inventory] --check requires a snapshot path.');
    process.exit(2);
  }

  const resolvedPath = resolve(process.cwd(), checkPath);
  const expected = JSON.parse(readFileSync(resolvedPath, 'utf8'));
  const actual = toSnapshot(inventory);
  const diffs = collectSnapshotDiffs(expected, actual);

  if (diffs.length === 0) {
    console.log(`[studio-inventory] snapshot matches ${normalizePath(relative(process.cwd(), resolvedPath))}`);
    return;
  }

  console.error(`[studio-inventory] snapshot drift detected in ${normalizePath(relative(process.cwd(), resolvedPath))}`);
  for (const diff of diffs.slice(0, 30)) console.error(`  - ${diff}`);
  if (diffs.length > 30) console.error(`  ... ${diffs.length - 30} more differences`);
  console.error('');
  console.error('Refresh intentionally with:');
  console.error('  node packages/studio/scripts/studio-inventory.mjs --snapshot > packages/studio/docs/STUDIO_INVENTORY_SNAPSHOT.json');
  console.error('');
  console.error('Current snapshot:');
  console.error(JSON.stringify(actual, null, 2));
  process.exit(1);
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
if (CHECK_INDEX >= 0) runSnapshotCheck(CHECK_PATH, inventory);
else if (SNAPSHOT_MODE) console.log(JSON.stringify(toSnapshot(inventory), null, 2));
else if (JSON_MODE) console.log(JSON.stringify(inventory, null, 2));
else printText(inventory);
