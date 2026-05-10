#!/usr/bin/env node
/**
 * recreate-graph-cache.mjs
 *
 * Recreates the HoloScript graph cache in a staging directory, verifies the
 * graph-status gate, then installs graph + embeddings into the live cache.
 *
 * Environment:
 *   HOLOSCRIPT_SCAN_TARGET - directory to scan (default: repo root)
 *   HOLOSCRIPT_CACHE_DIR - live cache directory (default: ~/.holoscript)
 *   HOLOSCRIPT_REBUILD_CACHE_DIR - optional staging cache directory
 *
 * Usage:
 *   node scripts/recreate-graph-cache.mjs
 *   HOLOSCRIPT_SCAN_TARGET=packages/core/src node scripts/recreate-graph-cache.mjs
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { freemem, homedir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import v8 from 'node:v8';

loadEnv();

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SCAN_TARGET = process.env.HOLOSCRIPT_SCAN_TARGET || REPO_ROOT;
const LIVE_CACHE_DIR = process.env.HOLOSCRIPT_CACHE_DIR || join(homedir(), '.holoscript');
const CACHE_FILE = join(LIVE_CACHE_DIR, 'graph-cache.json');
const EMBEDDINGS_FILE = join(LIVE_CACHE_DIR, 'embeddings-cache.bin');
const ABSORB_ENTRY = join(REPO_ROOT, 'packages', 'absorb-service', 'dist', 'mcp', 'index.js');
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REBUILD_ID = `${Date.now()}-${process.pid}`;
const STAGING_CACHE_DIR =
  process.env.HOLOSCRIPT_REBUILD_CACHE_DIR || join(LIVE_CACHE_DIR, `.rebuild-${REBUILD_ID}`);
const STAGING_CACHE_FILE = join(STAGING_CACHE_DIR, 'graph-cache.json');
const STAGING_EMBEDDINGS_FILE = join(STAGING_CACHE_DIR, 'embeddings-cache.bin');
const IS_SHARD_CHILD = process.env.HOLOSCRIPT_ABSORB_SHARD_CHILD === '1';
const SHARDING_ENABLED = process.env.HOLOSCRIPT_ABSORB_SHARDS !== '0';
const SHARD_ROOT_DIR = join(LIVE_CACHE_DIR, 'graph-shards');
const SHARD_PROGRESS_FILE = join(SHARD_ROOT_DIR, 'progress.json');
const SHARD_MANIFEST_FILE = join(SHARD_ROOT_DIR, 'manifest.json');
const SHARD_HEAP_MB =
  Number(process.env.HOLOSCRIPT_ABSORB_SHARD_HEAP_MB) ||
  Math.min(6144, Math.max(2048, Math.floor(totalmem() / 1024 / 1024 / 4)));
const MIN_FREE_MEMORY_MB = Number(process.env.HOLOSCRIPT_ABSORB_MIN_FREE_MB) || 1024;

function normalizePath(inputPath) {
  return resolve(inputPath).replaceAll('\\', '/').toLowerCase();
}

function isSubpath(childPath, parentPath) {
  const child = normalizePath(childPath);
  const parent = normalizePath(parentPath);
  return child === parent || child.startsWith(`${parent}/`);
}

function assertSafeCacheSubpath(childPath, label) {
  if (!isSubpath(childPath, LIVE_CACHE_DIR)) {
    throw new Error(`${label} must stay under live cache dir ${LIVE_CACHE_DIR}: ${childPath}`);
  }
}

function loadEnv() {
  const envFile = join(homedir(), '.ai-ecosystem', '.env');
  if (!existsSync(envFile)) return;

  const envText = readFileSync(envFile, 'utf8');
  for (const line of envText.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

function readCacheEnvelope(cacheFile) {
  try {
    if (!existsSync(cacheFile)) return null;
    const envelope = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (envelope.version !== 1 && envelope.version !== 2) return null;
    return envelope;
  } catch {
    return null;
  }
}

function isFreshForTarget(envelope) {
  if (!envelope) return false;
  const ageMs = Date.now() - Number(envelope.timestamp ?? 0);
  return (
    ageMs >= 0 &&
    ageMs < CACHE_MAX_AGE_MS &&
    normalizePath(envelope.rootDir ?? '') === normalizePath(SCAN_TARGET)
  );
}

function fileSize(filePath) {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function sanitizeShardName(relativePath) {
  return relativePath
    .replaceAll('\\', '/')
    .replace(/[^A-Za-z0-9._/-]/g, '_')
    .replaceAll('/', '__');
}

function discoverShardRoots() {
  const shards = [];
  const addChildren = (parentName) => {
    const parent = join(REPO_ROOT, parentName);
    if (!existsSync(parent)) return;

    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (
        entry.name.startsWith('.') ||
        ['node_modules', 'dist', 'build', 'out'].includes(entry.name)
      ) {
        continue;
      }

      const rootDir = join(parent, entry.name);
      const hasProjectShape =
        existsSync(join(rootDir, 'package.json')) || existsSync(join(rootDir, 'src'));
      if (!hasProjectShape) continue;

      const relativePath = `${parentName}/${entry.name}`;
      const name = sanitizeShardName(relativePath);
      shards.push({
        name,
        relativePath,
        rootDir,
        cacheDir: join(SHARD_ROOT_DIR, name),
      });
    }
  };

  addChildren('packages');
  addChildren('services');
  addChildren('apps');

  for (const relativePath of ['scripts', 'examples', 'compositions']) {
    const rootDir = join(REPO_ROOT, relativePath);
    if (existsSync(rootDir)) {
      const name = sanitizeShardName(relativePath);
      shards.push({ name, relativePath, rootDir, cacheDir: join(SHARD_ROOT_DIR, name) });
    }
  }

  return shards;
}

function assertHeapHeadroom(label) {
  const heap = v8.getHeapStatistics();
  const heapRatio = heap.used_heap_size / heap.heap_size_limit;
  const freeMb = freemem() / 1024 / 1024;

  if (heapRatio > 0.8) {
    throw new Error(
      `${label}: parent heap guard tripped (${Math.round(heapRatio * 100)}% of ${Math.round(
        heap.heap_size_limit / 1024 / 1024
      )}MB)`
    );
  }

  if (freeMb < MIN_FREE_MEMORY_MB) {
    throw new Error(
      `${label}: system memory guard tripped (${Math.round(freeMb)}MB free, need ${MIN_FREE_MEMORY_MB}MB)`
    );
  }
}

function mergeNodeOptionsWithHeap(nodeOptions, heapMb) {
  const withoutOldSpace = (nodeOptions || '')
    .split(/\s+/)
    .filter((part) => part && !part.startsWith('--max-old-space-size='));
  withoutOldSpace.push(`--max-old-space-size=${heapMb}`);
  return withoutOldSpace.join(' ');
}

async function loadHandler() {
  if (!existsSync(ABSORB_ENTRY)) {
    throw new Error(
      `Absorb MCP entry not found: ${ABSORB_ENTRY}\nRun: pnpm --filter @holoscript/absorb-service run build`
    );
  }

  return import(pathToFileURL(ABSORB_ENTRY).href);
}

function copyIntoPlaceAtomically(source, target) {
  const tempTarget = `${target}.install-${REBUILD_ID}.tmp`;
  rmSync(tempTarget, { force: true });
  copyFileSync(source, tempTarget);
  renameSync(tempTarget, target);
}

function restoreBackups(files) {
  for (const file of files) {
    try {
      rmSync(file.live, { force: true });
      if (existsSync(file.backup)) {
        renameSync(file.backup, file.live);
        console.error(`Restored ${file.label} from ${file.backup}`);
      }
    } catch (err) {
      console.error(`Restore failed for ${file.label}: ${(err && err.message) || String(err)}`);
    }
  }
}

function installVerifiedCache() {
  const files = [
    {
      label: 'graph cache',
      staged: STAGING_CACHE_FILE,
      live: CACHE_FILE,
      backup: `${CACHE_FILE}.backup.${REBUILD_ID}.json`,
    },
    {
      label: 'embeddings cache',
      staged: STAGING_EMBEDDINGS_FILE,
      live: EMBEDDINGS_FILE,
      backup: `${EMBEDDINGS_FILE}.backup.${REBUILD_ID}.bin`,
    },
  ];

  for (const file of files) {
    if (fileSize(file.staged) <= 0) {
      throw new Error(`Verified ${file.label} is missing or empty: ${file.staged}`);
    }
  }

  mkdirSync(LIVE_CACHE_DIR, { recursive: true });
  const backedUp = [];

  try {
    for (const file of files) {
      if (existsSync(file.live)) {
        renameSync(file.live, file.backup);
        backedUp.push(file);
        console.log(`Backed up live ${file.label} to ${file.backup}`);
      }
    }

    for (const file of files) {
      copyIntoPlaceAtomically(file.staged, file.live);
      console.log(`Installed verified ${file.label} to ${file.live}`);
    }
  } catch (err) {
    console.error('Install failed; restoring previous live cache artifacts...');
    restoreBackups(files);
    throw err;
  }

  return backedUp.map((file) => file.backup);
}

function assertHealthyStatus(postStatus) {
  const postCache = postStatus.diskCache || {};

  if (!postCache.exists) {
    throw new Error('Disk cache does not exist after staged absorb');
  }

  if (postCache.stale) {
    throw new Error('Disk cache reported as stale after staged absorb');
  }

  if (normalizePath(postCache.rootDir ?? '') !== normalizePath(SCAN_TARGET)) {
    throw new Error(`Cache rootDir mismatch: expected ${SCAN_TARGET}, got ${postCache.rootDir}`);
  }

  if (!postStatus.inMemory) {
    throw new Error('Graph not loaded in memory after staged absorb');
  }

  if (!postStatus.graphRAGReady) {
    throw new Error('GraphRAG is not ready after staged absorb');
  }

  if (fileSize(STAGING_CACHE_FILE) <= 0) {
    throw new Error(`Staged graph cache missing or empty: ${STAGING_CACHE_FILE}`);
  }

  if (fileSize(STAGING_EMBEDDINGS_FILE) <= 0) {
    throw new Error(`Staged embeddings cache missing or empty: ${STAGING_EMBEDDINGS_FILE}`);
  }
}

async function runShardedRebuild() {
  console.log('[1/4] Discovering package/rootDir shards...');
  mkdirSync(SHARD_ROOT_DIR, { recursive: true });

  const shards = discoverShardRoots();
  if (shards.length === 0) {
    throw new Error(`No shard roots found under ${REPO_ROOT}`);
  }

  const progress = readJsonFile(SHARD_PROGRESS_FILE, {
    version: 1,
    rootDir: REPO_ROOT,
    startedAt: new Date().toISOString(),
    shards: {},
  });
  progress.version = 1;
  progress.rootDir = REPO_ROOT;
  progress.updatedAt = new Date().toISOString();
  progress.shards ??= {};

  const forceShards = process.env.HOLOSCRIPT_ABSORB_SHARD_FORCE === '1';
  console.log(
    `[2/4] Rebuilding ${shards.length} shards with ${SHARD_HEAP_MB}MB child heap cap (${forceShards ? 'force' : 'resume'} mode)...`
  );

  for (let index = 0; index < shards.length; index++) {
    const shard = shards[index];
    const cacheFile = join(shard.cacheDir, 'graph-cache.json');
    const embeddingsFile = join(shard.cacheDir, 'embeddings-cache.bin');
    const prior = progress.shards[shard.name];
    const alreadyDone =
      !forceShards &&
      prior?.status === 'done' &&
      fileSize(cacheFile) > 0 &&
      fileSize(embeddingsFile) > 0;

    if (alreadyDone) {
      console.log(`[skip ${index + 1}/${shards.length}] ${shard.relativePath}`);
      continue;
    }

    assertHeapHeadroom(`before shard ${shard.relativePath}`);
    progress.shards[shard.name] = {
      relativePath: shard.relativePath,
      rootDir: shard.rootDir,
      cacheDir: shard.cacheDir,
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    progress.updatedAt = new Date().toISOString();
    writeJsonFile(SHARD_PROGRESS_FILE, progress);

    console.log(`[run ${index + 1}/${shards.length}] ${shard.relativePath}`);
    const startedAt = Date.now();
    const childEnv = {
      ...process.env,
      HOLOSCRIPT_ABSORB_SHARD_CHILD: '1',
      HOLOSCRIPT_ABSORB_SHARDS: '0',
      HOLOSCRIPT_CACHE_DIR: shard.cacheDir,
      HOLOSCRIPT_REBUILD_CACHE_DIR: join(shard.cacheDir, `.rebuild-${REBUILD_ID}`),
      HOLOSCRIPT_SCAN_TARGET: shard.rootDir,
      NODE_OPTIONS: mergeNodeOptionsWithHeap(process.env.NODE_OPTIONS, SHARD_HEAP_MB),
    };

    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: REPO_ROOT,
      env: childEnv,
      stdio: 'inherit',
      windowsHide: true,
    });

    const durationMs = Date.now() - startedAt;
    if (child.status !== 0) {
      progress.shards[shard.name] = {
        ...progress.shards[shard.name],
        status: 'failed',
        durationMs,
        exitCode: child.status,
        failedAt: new Date().toISOString(),
      };
      progress.updatedAt = new Date().toISOString();
      writeJsonFile(SHARD_PROGRESS_FILE, progress);
      throw new Error(`Shard ${shard.relativePath} failed with exit code ${child.status}`);
    }

    const envelope = readCacheEnvelope(cacheFile);
    progress.shards[shard.name] = {
      ...progress.shards[shard.name],
      status: 'done',
      durationMs,
      completedAt: new Date().toISOString(),
      stats: envelope?.stats ?? null,
      cacheBytes: fileSize(cacheFile),
      embeddingsBytes: fileSize(embeddingsFile),
    };
    progress.updatedAt = new Date().toISOString();
    writeJsonFile(SHARD_PROGRESS_FILE, progress);
  }

  console.log('[3/4] Writing shard manifest...');
  const manifest = {
    version: 1,
    rootDir: REPO_ROOT,
    scanTarget: SCAN_TARGET,
    createdAt: new Date().toISOString(),
    shardHeapMb: SHARD_HEAP_MB,
    shards: shards.map((shard) => {
      const state = progress.shards[shard.name] ?? {};
      return {
        name: shard.name,
        relativePath: shard.relativePath,
        rootDir: shard.rootDir,
        cacheDir: shard.cacheDir,
        status: state.status ?? 'unknown',
        stats: state.stats ?? null,
        cacheBytes: state.cacheBytes ?? fileSize(join(shard.cacheDir, 'graph-cache.json')),
        embeddingsBytes:
          state.embeddingsBytes ?? fileSize(join(shard.cacheDir, 'embeddings-cache.bin')),
      };
    }),
  };
  writeJsonFile(SHARD_MANIFEST_FILE, manifest);

  console.log('[4/4] Sharded graph cache rebuild complete.');
  console.log(`Manifest: ${SHARD_MANIFEST_FILE}`);
  console.log(`Progress: ${SHARD_PROGRESS_FILE}`);
}

async function main() {
  console.log('[1/5] Loading environment...');

  if (
    !IS_SHARD_CHILD &&
    SHARDING_ENABLED &&
    normalizePath(SCAN_TARGET) === normalizePath(REPO_ROOT)
  ) {
    await runShardedRebuild();
    return;
  }

  const liveEnvelope = readCacheEnvelope(CACHE_FILE);
  if (isFreshForTarget(liveEnvelope) && fileSize(EMBEDDINGS_FILE) > 0) {
    console.log('[2/5] Live cache already fresh; verifying graph-status gate...');
    process.env.HOLOSCRIPT_CACHE_DIR = LIVE_CACHE_DIR;
    const { handleCodebaseTool } = await loadHandler();
    const preStatus = await handleCodebaseTool('holo_graph_status', {});
    console.log('Graph Status:', JSON.stringify(preStatus, null, 2));
    console.log('\nGraph cache verified and graph-status gate healthy.');
    return;
  }

  console.log('[2/5] Cache stale or missing; preparing isolated rebuild cache...');
  assertSafeCacheSubpath(STAGING_CACHE_DIR, 'staging cache dir');
  rmSync(STAGING_CACHE_DIR, { recursive: true, force: true });
  mkdirSync(STAGING_CACHE_DIR, { recursive: true });
  process.env.HOLOSCRIPT_CACHE_DIR = STAGING_CACHE_DIR;
  console.log(`Staging cache: ${STAGING_CACHE_DIR}`);

  const { handleCodebaseTool } = await loadHandler();

  console.log(`[3/5] Running holo_absorb_repo on ${SCAN_TARGET} ...`);
  console.log('      (This may take 3-10 minutes)');

  const absorbStart = Date.now();
  const result = await handleCodebaseTool('holo_absorb_repo', {
    rootDir: SCAN_TARGET,
    force: true,
    outputFormat: 'stats',
    includeBuildArtifacts: false,
    embeddingProvider: 'openai',
  });
  const absorbDuration = Date.now() - absorbStart;

  if (result.error) {
    const detail = result.diagnostics
      ? `\nDiagnostics: ${JSON.stringify(result.diagnostics, null, 2)}`
      : '';
    throw new Error(`Absorb failed: ${result.error}${detail}`);
  }

  console.log(`[3/5] Absorb complete in ${absorbDuration}ms`);
  console.log('Stats:', JSON.stringify(result.stats, null, 2));

  console.log('[4/5] Verifying staged graph-status gate and embeddings...');
  const postStatus = await handleCodebaseTool('holo_graph_status', {});
  console.log('Graph Status:', JSON.stringify(postStatus, null, 2));
  assertHealthyStatus(postStatus);

  console.log('[5/5] Installing verified graph cache into live cache directory...');
  const backupPaths = installVerifiedCache();
  rmSync(STAGING_CACHE_DIR, { recursive: true, force: true });

  if (backupPaths.length > 0) {
    console.log('Previous cache backups retained:');
    for (const backupPath of backupPaths) console.log(`  ${backupPath}`);
  }

  console.log('\nGraph cache recreated, verified, and installed successfully.');
}

main().catch((err) => {
  console.error(`FAIL: ${(err && err.stack) || String(err)}`);
  if (existsSync(STAGING_CACHE_DIR)) {
    console.error(`Staging cache retained for inspection: ${STAGING_CACHE_DIR}`);
  }
  process.exit(1);
});
