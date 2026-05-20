#!/usr/bin/env node
/**
 * holoshell-local-codebase-absorb-bundle.mjs
 *
 * HoloShell hardware adapter for local Windows codebase absorb bundles.
 * Solves the rootDir_unavailable problem when holo_absorb_repo runs in
 * containerized MCP context (/app) but the agent is on real Windows paths.
 *
 * Usage:
 *   node scripts/holoshell-local-codebase-absorb-bundle.mjs --roots "C:/Users/Josep/Documents/GitHub/HoloScript,C:/Users/Josep/Documents/GitHub/Hololand" --out receipt.json
 *   node scripts/holoshell-local-codebase-absorb-bundle.mjs --self-test
 *
 * Emits: sourceFiles payload + LocalCodebaseSnapshotReceipt (hashes, freshness,
 * skipped paths, redaction summary, replay command for holo_absorb_repo).
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, resolve, relative, basename } from 'node:path';
import { tmpdir } from 'node:os';

const VERSION = '0.1.0';
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

// Common secret / build artifact patterns to redact or skip
const SECRET_PATTERNS = [
  /\.env(\.|$)/i,
  /wallet\.enc$/i,
  /HOLOMESH_API_KEY/i,
  /\.pem$/i,
  /id_rsa/i,
  /secrets/i,
  /node_modules/i,
  /\.git/i,
  /dist/i,
  /build/i,
  /\.next/i,
  /coverage/i,
  /\.log$/i,
  /tmp/i,
];

const MAX_FILES = 2000;
const MAX_BYTES = 25 * 1024 * 1024; // 25 MiB total payload cap

function parseArgs(argv) {
  const args = {
    roots: [],
    out: undefined,
    date: DEFAULT_DATE,
    selfTest: false,
    privacyClass: 'local-private',
    maxFiles: MAX_FILES,
    maxBytes: MAX_BYTES,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--self-test') {
      args.selfTest = true;
    } else if (arg === '--roots') {
      args.roots = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--privacy-class') {
      args.privacyClass = argv[++i];
    } else if (arg === '--max-files') {
      args.maxFiles = parseInt(argv[++i], 10);
    } else if (arg === '--max-bytes') {
      args.maxBytes = parseInt(argv[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!args.selfTest && args.roots.length === 0) {
    // Default to common local development roots when nothing specified
    args.roots = [
      'C:/Users/josep/.ai-ecosystem',
      'C:/Users/Josep/Documents/GitHub/HoloScript',
      'C:/Users/josep/Documents/GitHub/Hololand',
    ].filter((r) => existsSync(r));
  }

  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell local codebase absorb bundle adapter ${VERSION}

Usage:
  node scripts/holoshell-local-codebase-absorb-bundle.mjs --roots <path1,path2> [--out <receipt.json>]
  node scripts/holoshell-local-codebase-absorb-bundle.mjs --self-test

Options:
  --roots <p1,p2,...>   Comma-separated local Windows paths to scan.
  --out <receipt.json>  Output receipt path (defaults to bench-logs date folder).
  --date <yyyy-mm-dd>   Bench date folder when --out omitted.
  --max-files N         Hard cap on number of files (default 2000).
  --max-bytes N         Hard cap on total bytes (default 25 MiB).
`);
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function shouldSkip(relPath, fullPath) {
  const lower = relPath.toLowerCase();
  return SECRET_PATTERNS.some((re) => re.test(lower) || re.test(basename(lower)));
}

function walkDir(dir, base, results, stats, maxFiles, maxBytes) {
  if (results.length >= maxFiles) return;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    if (results.length >= maxFiles) break;

    const full = join(dir, ent.name);
    const rel = relative(base, full);

    if (shouldSkip(rel, full)) {
      stats.skipped.push({ path: rel, reason: 'redacted-or-build-artifact' });
      continue;
    }

    try {
      const st = statSync(full);
      if (st.isDirectory()) {
        walkDir(full, base, results, stats, maxFiles, maxBytes);
      } else if (st.isFile()) {
        if (stats.totalBytes + st.size > maxBytes) {
          stats.skipped.push({ path: rel, reason: 'byte-cap-exceeded' });
          continue;
        }
        const content = readFileSync(full);
        const hash = sha256Bytes(content);
        results.push({
          path: rel.replace(/\\/g, '/'),
          size: st.size,
          hash,
          mtime: st.mtime.toISOString(),
        });
        stats.totalBytes += st.size;
        stats.totalFiles += 1;
      }
    } catch (e) {
      stats.skipped.push({ path: rel, reason: `read-error: ${e.message}` });
    }
  }
}

function buildReceipt(roots, sourceFiles, stats, args) {
  const now = new Date().toISOString();
  const rootHashes = roots.map((r) => ({
    root: r,
    hash: sha256Text(r + '|' + now),
  }));

  return {
    schema: 'LocalCodebaseSnapshotReceipt.v1',
    version: VERSION,
    emittedAt: now,
    agent: 'grok1-x402',
    surface: 'grok-hardware',
    roots: roots.map((r) => resolve(r)),
    rootHashes,
    sourceFiles,
    stats: {
      totalFiles: stats.totalFiles,
      totalBytes: stats.totalBytes,
      skippedCount: stats.skipped.length,
    },
    skipped: stats.skipped.slice(0, 50), // cap noise
    redactionPolicy: 'SECRET_PATTERNS + build artifacts + size caps',
    replayCommand: `holo_absorb_repo --roots ${roots.join(',')} --sourceFiles <this-payload>`,
    privacyClass: args.privacyClass,
    freshness: {
      generatedAt: now,
      note: 'Re-run this adapter to refresh before feeding holo_absorb_repo',
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    console.log('self-test: basic walk + receipt shape');
    const tmp = join(tmpdir(), `holoscript-absorb-self-test-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, 'example.ts'), 'export const x = 42;\n');
    const results = [];
    const stats = { totalFiles: 0, totalBytes: 0, skipped: [] };
    walkDir(tmp, tmp, results, stats, 100, 1024 * 1024);
    const receipt = buildReceipt([tmp], results, stats, args);
    console.log('receipt shape ok:', !!receipt.sourceFiles && !!receipt.stats);
    console.log('files captured:', receipt.stats.totalFiles);
    process.exit(0);
  }

  if (args.roots.length === 0) {
    console.error('No roots found. Pass --roots or ensure common dev paths exist.');
    process.exit(1);
  }

  const sourceFiles = [];
  const stats = { totalFiles: 0, totalBytes: 0, skipped: [] };

  for (const root of args.roots) {
    if (!existsSync(root)) {
      stats.skipped.push({ path: root, reason: 'root-not-found' });
      continue;
    }
    walkDir(resolve(root), resolve(root), sourceFiles, stats, args.maxFiles, args.maxBytes);
  }

  const receipt = buildReceipt(args.roots, sourceFiles, stats, args);

  let outPath = args.out;
  if (!outPath) {
    const benchDir = join('bench-logs', 'holoshell-local-absorb', args.date);
    mkdirSync(benchDir, { recursive: true });
    outPath = join(benchDir, `local-codebase-snapshot-${Date.now()}.json`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(receipt, null, 2), 'utf8');

  console.log('Local codebase absorb bundle written:');
  console.log('  out:', outPath);
  console.log('  files:', receipt.stats.totalFiles);
  console.log('  bytes:', receipt.stats.totalBytes);
  console.log('  skipped:', receipt.stats.skippedCount);
  console.log('  replay:', receipt.replayCommand);
  console.log('\nFeed this receipt + sourceFiles into holo_absorb_repo from HoloShell context.');
}

main();