#!/usr/bin/env node
/**
 * recreate-graph-cache.mjs
 *
 * Recreates the HoloScript graph cache for the full repo and verifies
 * the graph-status gate reports it as fresh.
 *
 * Usage: node scripts/recreate-graph-cache.mjs
 */

import { existsSync, readFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SCAN_TARGET = process.env.HOLOSCRIPT_SCAN_TARGET || REPO_ROOT;
const CACHE_DIR = join(homedir(), '.holoscript');
const CACHE_FILE = join(CACHE_DIR, 'graph-cache.json');
const EMBEDDINGS_FILE = join(CACHE_DIR, 'embeddings-cache.bin');
const ABSORB_ENTRY = join(REPO_ROOT, 'packages', 'absorb-service', 'dist', 'mcp', 'index.js');

function normalizePath(path) {
  return resolve(path).replaceAll('\\', '/').toLowerCase();
}

// Step 1: Backup / clear stale cache.
if (existsSync(CACHE_FILE)) {
  const backup = CACHE_FILE + '.backup.' + Date.now() + '.json';
  renameSync(CACHE_FILE, backup);
  console.log(`[1/4] Backed up stale cache to ${backup}`);
} else {
  console.log('[1/4] No existing cache to back up');
}

// Also clear embeddings cache since it will be rebuilt.
if (existsSync(EMBEDDINGS_FILE)) {
  const backup = EMBEDDINGS_FILE + '.backup.' + Date.now() + '.bin';
  renameSync(EMBEDDINGS_FILE, backup);
  console.log(`[1/4] Backed up stale embeddings to ${backup}`);
}

// Step 2: Load env and import handler.
console.log('[2/4] Loading environment and absorb handler...');

// Load .env into process.env.
const ENV_FILE = join(homedir(), '.ai-ecosystem', '.env');
if (existsSync(ENV_FILE)) {
  const envText = readFileSync(ENV_FILE, 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}

if (!existsSync(ABSORB_ENTRY)) {
  console.error(`FAIL: Absorb MCP entry not found: ${ABSORB_ENTRY}`);
  console.error('Run: pnpm --filter @holoscript/absorb-service run build');
  process.exit(1);
}

const { handleCodebaseTool } = await import(pathToFileURL(ABSORB_ENTRY).href);

// Step 3: Run absorb.
console.log(`[3/4] Running holo_absorb_repo on ${SCAN_TARGET} ...`);
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
  console.error('[3/4] Absorb FAILED:', result.error);
  if (result.diagnostics) {
    console.error('Diagnostics:', JSON.stringify(result.diagnostics, null, 2));
  }
  process.exit(1);
}

console.log(`[3/4] Absorb complete in ${absorbDuration}ms`);
console.log('      Stats:', JSON.stringify(result.stats, null, 2));

// Step 4: Verify graph-status gate.
console.log('[4/4] Verifying holo_graph_status gate...');

const status = await handleCodebaseTool('holo_graph_status', {});
console.log('Graph Status:', JSON.stringify(status, null, 2));

if (!status.diskCache?.exists) {
  console.error('FAIL: Disk cache does not exist after absorb');
  process.exit(1);
}

if (status.diskCache?.stale) {
  console.error('FAIL: Disk cache reported as stale after fresh absorb');
  process.exit(1);
}

if (normalizePath(status.diskCache?.rootDir ?? '') !== normalizePath(SCAN_TARGET)) {
  console.error(`FAIL: Cache rootDir mismatch: expected ${SCAN_TARGET}, got ${status.diskCache.rootDir}`);
  process.exit(1);
}

if (!status.inMemory) {
  console.error('FAIL: Graph not loaded in memory after absorb');
  process.exit(1);
}

console.log('\nGraph cache recreated and graph-status gate verified successfully.');
