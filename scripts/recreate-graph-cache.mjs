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
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

function normalizePath(inputPath) {
  return resolve(inputPath).replaceAll('\\', '/').toLowerCase();
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

async function main() {
  console.log('[1/5] Loading environment...');

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
