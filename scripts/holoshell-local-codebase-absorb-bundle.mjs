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
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, relative, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const VERSION = '0.1.0';
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

// Common secret / build artifact patterns to redact or skip
const SECRET_PATTERNS = [
  /(^|[/\\])\.bench-logs([/\\]|$)/i,
  /(^|[/\\])\.bench-logs-evidence([/\\]|$)/i,
  /(^|[/\\])\.holo-ci-last-workload$/i,
  /(^|[/\\])\.scratch([/\\]|$)/i,
  /(^|[/\\])\.tmp([/\\]|$)/i,
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
  /test-results/i,
  /temp_ts_morph/i,
  /(^|[/\\])target([/\\]|$)/i,
];

const MAX_FILES = 500;
const MAX_BYTES = 5 * 1024 * 1024; // Matches holo_absorb_repo sourceFiles cap
const TEXT_SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.cts',
  '.go',
  '.holo',
  '.hs',
  '.hsplus',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.mts',
  '.py',
  '.rs',
  '.scss',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

function parseArgs(argv) {
  const args = {
    roots: [],
    out: undefined,
    date: DEFAULT_DATE,
    selfTest: false,
    privacyClass: 'local-private',
    maxFiles: MAX_FILES,
    maxBytes: MAX_BYTES,
    changedFirst: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--self-test') {
      args.selfTest = true;
    } else if (arg === '--roots') {
      args.roots = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
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
    } else if (arg === '--changed-first') {
      args.changedFirst = true;
    } else if (arg === '--no-changed-first') {
      args.changedFirst = false;
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
  --max-files N         Hard cap on number of files (default 500).
  --max-bytes N         Hard cap on total source bytes (default 5 MiB).
  --changed-first       Prioritize git-status changed files first (default).
  --no-changed-first    Disable git-status prioritization for active repos.
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

function isTextSourcePath(relPath) {
  const lower = relPath.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 && TEXT_SOURCE_EXTENSIONS.has(lower.slice(dot));
}

function pushSourceFile(full, rel, results, stats, maxFiles, maxBytes, seen) {
  if (results.length >= maxFiles) return false;

  const normalizedRel = rel.replace(/\\/g, '/');
  if (seen.has(normalizedRel)) return false;

  if (shouldSkip(normalizedRel, full)) {
    stats.skipped.push({ path: normalizedRel, reason: 'redacted-or-build-artifact' });
    return false;
  }

  if (!isTextSourcePath(normalizedRel)) {
    stats.skipped.push({ path: normalizedRel, reason: 'unsupported-file-type' });
    return false;
  }

  let st;
  try {
    st = statSync(full);
  } catch (e) {
    stats.skipped.push({ path: normalizedRel, reason: `read-error: ${e.message}` });
    return false;
  }

  if (!st.isFile()) return false;
  if (stats.totalBytes + st.size > maxBytes) {
    stats.skipped.push({ path: normalizedRel, reason: 'byte-cap-exceeded' });
    return false;
  }

  try {
    const contentBytes = readFileSync(full);
    if (contentBytes.includes(0)) {
      stats.skipped.push({ path: normalizedRel, reason: 'binary-content' });
      return false;
    }

    const content = contentBytes.toString('utf8');
    results.push({
      path: normalizedRel,
      content,
      size: st.size,
      hash: sha256Bytes(contentBytes),
      mtime: st.mtime.toISOString(),
    });
    seen.add(normalizedRel);
    stats.totalBytes += st.size;
    stats.totalFiles += 1;
    return true;
  } catch (e) {
    stats.skipped.push({ path: normalizedRel, reason: `read-error: ${e.message}` });
    return false;
  }
}

function walkDir(dir, base, results, stats, maxFiles, maxBytes, seen) {
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
        if (shouldSkip(rel, full)) {
          stats.skipped.push({ path: rel, reason: 'redacted-or-build-artifact' });
          continue;
        }
        walkDir(full, base, results, stats, maxFiles, maxBytes, seen);
      } else if (st.isFile()) {
        pushSourceFile(full, rel, results, stats, maxFiles, maxBytes, seen);
      }
    } catch (e) {
      stats.skipped.push({ path: rel, reason: `read-error: ${e.message}` });
    }
  }
}

function getGitChangedPaths(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const rawPath = line.slice(3).trim();
        return rawPath.includes(' -> ') ? rawPath.split(' -> ').pop().trim() : rawPath;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function addGitChangedFiles(root, results, stats, maxFiles, maxBytes, seen) {
  const changedPaths = getGitChangedPaths(root);
  stats.changedCandidates += changedPaths.length;

  for (const rel of changedPaths) {
    if (results.length >= maxFiles) break;

    const full = join(root, rel);
    if (!existsSync(full)) {
      stats.skipped.push({ path: rel, reason: 'changed-path-missing' });
      continue;
    }
    if (pushSourceFile(full, rel, results, stats, maxFiles, maxBytes, seen)) {
      stats.changedIncluded += 1;
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
      changedFirst: args.changedFirst,
      changedCandidates: stats.changedCandidates,
      changedIncluded: stats.changedIncluded,
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
    const stats = {
      totalFiles: 0,
      totalBytes: 0,
      skipped: [],
      changedCandidates: 0,
      changedIncluded: 0,
    };
    walkDir(tmp, tmp, results, stats, 100, 1024 * 1024, new Set());
    const receipt = buildReceipt([tmp], results, stats, args);
    const toolPayloadOk = receipt.sourceFiles.every(
      (f) => typeof f.path === 'string' && typeof f.content === 'string'
    );
    const contentOk = receipt.sourceFiles[0]?.content === 'export const x = 42;\n';
    console.log('receipt shape ok:', !!receipt.sourceFiles && !!receipt.stats);
    console.log('tool payload ok:', toolPayloadOk && contentOk);
    console.log('files captured:', receipt.stats.totalFiles);
    if (!toolPayloadOk || !contentOk) process.exit(1);
    process.exit(0);
  }

  if (args.roots.length === 0) {
    console.error('No roots found. Pass --roots or ensure common dev paths exist.');
    process.exit(1);
  }

  const sourceFiles = [];
  const stats = {
    totalFiles: 0,
    totalBytes: 0,
    skipped: [],
    changedCandidates: 0,
    changedIncluded: 0,
  };
  const seen = new Set();

  for (const root of args.roots) {
    if (!existsSync(root)) {
      stats.skipped.push({ path: root, reason: 'root-not-found' });
      continue;
    }
    const resolvedRoot = resolve(root);
    if (args.changedFirst) {
      addGitChangedFiles(resolvedRoot, sourceFiles, stats, args.maxFiles, args.maxBytes, seen);
    }
    walkDir(resolvedRoot, resolvedRoot, sourceFiles, stats, args.maxFiles, args.maxBytes, seen);
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
  console.log(
    '  changed:',
    `${receipt.stats.changedIncluded}/${receipt.stats.changedCandidates}`,
    receipt.stats.changedFirst ? '(changed-first)' : '(walk-order)'
  );
  console.log('  replay:', receipt.replayCommand);
  console.log('\nFeed this receipt + sourceFiles into holo_absorb_repo from HoloShell context.');
}

main();
