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
const GRAPH_RAG_EMBEDDING_POLICY = Object.freeze({
  schemaVersion: 'holoscript.graphrag.embedding-policy.v1',
  kind: 'GraphRAGEmbeddingPolicy',
  provider: 'holoembed',
  acceptedAliases: ['structural'],
  externalProvidersAllowed: false,
  externalFallbacksAllowed: false,
  policy:
    'HoloScript GraphRAG uses HoloGraph plus HoloEmbed for every project. External embedding providers are disabled so mixed embedding spaces cannot enter shared GraphRAG caches.',
});

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
const MAX_FILE_BYTES = 512 * 1024; // Keep sourceFiles[*].content below hosted MCP arg-string gates.
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
    maxFileBytes: MAX_FILE_BYTES,
    changedFirst: true,
    chunkDir: undefined,
    chunkPrefix: 'local-codebase-sourcefiles',
    maxChunks: 8,
    postMcp: false,
    mcpUrl: 'https://mcp.holoscript.net',
    postLimit: undefined,
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
    } else if (arg === '--max-file-bytes') {
      args.maxFileBytes = parseInt(argv[++i], 10);
    } else if (arg === '--changed-first') {
      args.changedFirst = true;
    } else if (arg === '--no-changed-first') {
      args.changedFirst = false;
    } else if (arg === '--chunk-dir') {
      args.chunkDir = argv[++i];
    } else if (arg === '--chunk-prefix') {
      args.chunkPrefix = argv[++i];
    } else if (arg === '--max-chunks') {
      args.maxChunks = parseInt(argv[++i], 10);
    } else if (arg === '--post-mcp') {
      args.postMcp = true;
    } else if (arg === '--mcp-url') {
      args.mcpUrl = argv[++i];
    } else if (arg === '--post-limit') {
      args.postLimit = parseInt(argv[++i], 10);
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
  --max-file-bytes N    Hard cap per source file (default 512 KiB).
  --changed-first       Prioritize git-status changed files first (default).
  --no-changed-first    Disable git-status prioritization for active repos.
  --chunk-dir DIR       Emit multiple MCP-safe chunk receipts plus manifest.
  --chunk-prefix NAME   Prefix for chunk receipt filenames.
  --max-chunks N        Max chunk receipts to emit (default 8).
  --post-mcp            Post emitted receipt/chunks to hosted MCP.
  --mcp-url URL         MCP server base URL (default https://mcp.holoscript.net).
  --post-limit N        Max chunks to post when --post-mcp is used.
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

function pushSourceFile(full, rel, results, stats, maxFiles, maxBytes, maxFileBytes, seen) {
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
  if (st.size > maxFileBytes) {
    stats.skipped.push({
      path: normalizedRel,
      reason: 'file-byte-cap-exceeded',
      bytes: st.size,
      maxFileBytes,
    });
    return false;
  }
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

function walkDir(dir, base, results, stats, maxFiles, maxBytes, maxFileBytes, seen) {
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
        walkDir(full, base, results, stats, maxFiles, maxBytes, maxFileBytes, seen);
      } else if (st.isFile()) {
        pushSourceFile(full, rel, results, stats, maxFiles, maxBytes, maxFileBytes, seen);
      }
    } catch (e) {
      stats.skipped.push({ path: rel, reason: `read-error: ${e.message}` });
    }
  }
}

function getGitChangedPaths(root) {
  try {
    const repoRoot = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .replace(/\\/g, '/');
    const prefix = execFileSync('git', ['-C', root, 'rev-parse', '--show-prefix'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .replace(/\\/g, '/');
    const out = execFileSync('git', ['-C', repoRoot, 'status', '--porcelain', '--untracked-files=all'], {
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
      .map((p) => p.replace(/\\/g, '/'))
      .filter((p) => !prefix || p === prefix.replace(/\/$/, '') || p.startsWith(prefix))
      .map((p) => (prefix ? p.slice(prefix.length) : p))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function addGitChangedFiles(root, results, stats, maxFiles, maxBytes, maxFileBytes, seen) {
  const changedPaths = getGitChangedPaths(root);
  stats.changedCandidates += changedPaths.length;

  for (const rel of changedPaths) {
    if (results.length >= maxFiles) break;

    const full = join(root, rel);
    if (!existsSync(full)) {
      stats.skipped.push({ path: rel, reason: 'changed-path-missing' });
      continue;
    }
    if (pushSourceFile(full, rel, results, stats, maxFiles, maxBytes, maxFileBytes, seen)) {
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
    embeddingPolicy: GRAPH_RAG_EMBEDDING_POLICY,
    stats: {
      totalFiles: stats.totalFiles,
      totalBytes: stats.totalBytes,
      skippedCount: stats.skipped.length,
      changedFirst: args.changedFirst,
      changedCandidates: stats.changedCandidates,
      changedIncluded: stats.changedIncluded,
      maxFileBytes: args.maxFileBytes,
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

function sourceFileBytes(file) {
  return Buffer.byteLength(file.content, 'utf8');
}

function splitSourceFilesIntoChunks(sourceFiles, args) {
  const chunks = [];
  const oversized = [];
  let current = [];
  let currentBytes = 0;

  for (const file of sourceFiles) {
    const bytes = sourceFileBytes(file);
    if (bytes > args.maxFileBytes) {
      oversized.push({ path: file.path, bytes, maxFileBytes: args.maxFileBytes });
      continue;
    }
    if (bytes > args.maxBytes) {
      oversized.push({ path: file.path, bytes, maxBytes: args.maxBytes });
      continue;
    }

    const wouldOverflow =
      current.length >= args.maxFiles || (current.length > 0 && currentBytes + bytes > args.maxBytes);
    if (wouldOverflow) {
      chunks.push({ sourceFiles: current, bytes: currentBytes });
      current = [];
      currentBytes = 0;
      if (chunks.length >= args.maxChunks) break;
    }

    current.push(file);
    currentBytes += bytes;
  }

  if (current.length > 0 && chunks.length < args.maxChunks) {
    chunks.push({ sourceFiles: current, bytes: currentBytes });
  }

  return { chunks, oversized };
}

function buildChunkReceipt(baseReceipt, chunk, index, total, args) {
  return {
    ...baseReceipt,
    schema: 'LocalCodebaseSnapshotReceipt.v1',
    sourceFiles: chunk.sourceFiles,
    chunk: {
      index,
      total,
      files: chunk.sourceFiles.length,
      bytes: chunk.bytes,
      maxFiles: args.maxFiles,
      maxBytes: args.maxBytes,
      maxFileBytes: args.maxFileBytes,
    },
    stats: {
      ...baseReceipt.stats,
      totalFiles: chunk.sourceFiles.length,
      totalBytes: chunk.bytes,
      chunkIndex: index,
      chunkTotal: total,
    },
  };
}

function writeChunkReceipts(baseReceipt, args) {
  const chunkDir = resolve(args.chunkDir);
  mkdirSync(chunkDir, { recursive: true });

  const { chunks, oversized } = splitSourceFilesIntoChunks(baseReceipt.sourceFiles, args);
  const chunkFiles = [];
  const chunkReceipts = [];

  chunks.forEach((chunk, i) => {
    const index = i + 1;
    const name = `${args.chunkPrefix}-${String(index).padStart(3, '0')}.json`;
    const out = join(chunkDir, name);
    const receipt = buildChunkReceipt(baseReceipt, chunk, index, chunks.length, args);
    writeFileSync(out, JSON.stringify(receipt, null, 2), 'utf8');
    chunkFiles.push({
      index,
      path: out,
      files: chunk.sourceFiles.length,
      bytes: chunk.bytes,
    });
    chunkReceipts.push({ path: out, receipt });
  });

  const manifest = {
    ...baseReceipt,
    schema: 'LocalCodebaseSnapshotManifest.v1',
    sourceFiles: [],
    chunks: chunkFiles,
    oversized,
    stats: {
      ...baseReceipt.stats,
      emittedChunks: chunks.length,
      emittedChunkFiles: chunks.reduce((sum, c) => sum + c.sourceFiles.length, 0),
      emittedChunkBytes: chunks.reduce((sum, c) => sum + c.bytes, 0),
      oversizedCount: oversized.length,
    },
  };

  const manifestPath = join(chunkDir, `${args.chunkPrefix}-manifest.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return { manifestPath, manifest, chunkReceipts };
}

async function postJson(baseUrl, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Keep text snippet for diagnostics.
  }
  return { response, json, text };
}

async function getMcpAccessToken(args) {
  const baseUrl = args.mcpUrl.replace(/\/+$/, '');
  const registration = await postJson(baseUrl, '/oauth/register', {
    client_name: `holoshell-local-absorb-${Date.now()}`,
    redirect_uris: [],
    scope: 'tools:codebase',
    token_endpoint_auth_method: 'client_secret_post',
  });
  if (!registration.response.ok || !registration.json?.client_id) {
    throw new Error(
      `OAuth registration failed (${registration.response.status}): ${registration.text.slice(0, 300)}`
    );
  }

  const token = await postJson(baseUrl, '/oauth/token', {
    grant_type: 'client_credentials',
    client_id: registration.json.client_id,
    client_secret: registration.json.client_secret,
    scope: 'tools:codebase',
  });
  if (!token.response.ok || !token.json?.access_token) {
    throw new Error(`OAuth token failed (${token.response.status}): ${token.text.slice(0, 300)}`);
  }

  return { baseUrl, accessToken: token.json.access_token };
}

async function postReceiptToMcp(receipt, args, auth) {
  const started = Date.now();
  const response = await postJson(
    auth.baseUrl,
    '/mcp',
    {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'holo_absorb_repo',
        arguments: {
          sourceFiles: receipt.sourceFiles,
          force: false,
          outputFormat: 'stats',
          embeddingProvider: GRAPH_RAG_EMBEDDING_POLICY.provider,
          maxFiles: 10000,
        },
      },
    },
    { Authorization: `Bearer ${auth.accessToken}` }
  );

  const content = response.json?.result?.content?.[0]?.text;
  let parsed = null;
  try {
    parsed = content ? JSON.parse(content) : null;
  } catch {
    // Preserve null; JSON-RPC response is still recorded below.
  }

  return {
    ok: response.response.ok && !response.json?.error,
    httpStatus: response.response.status,
    durationMs: Date.now() - started,
    jsonrpcError: response.json?.error ?? null,
    result: parsed,
    textSnippet: parsed ? undefined : response.text.slice(0, 500),
  };
}

async function postReceiptsToMcp(receipts, args, resultsPath) {
  const auth = await getMcpAccessToken(args);
  const limit = Number.isFinite(args.postLimit) ? Math.min(args.postLimit, receipts.length) : receipts.length;
  const results = [];

  for (let i = 0; i < limit; i += 1) {
    const item = receipts[i];
    console.log(
      `Posting MCP chunk ${i + 1}/${limit}: ${item.receipt.sourceFiles.length} files, ${item.receipt.stats.totalBytes} bytes`
    );
    const result = await postReceiptToMcp(item.receipt, args, auth);
    results.push({
      path: item.path,
      chunk: item.receipt.chunk ?? null,
      ...result,
    });
    if (!result.ok) break;
  }

  writeFileSync(resultsPath, JSON.stringify({ emittedAt: new Date().toISOString(), results }, null, 2), 'utf8');
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    console.log('self-test: basic walk + receipt shape');
    const tmp = join(tmpdir(), `holoscript-absorb-self-test-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, 'example.ts'), 'export const x = 42;\n');
    writeFileSync(join(tmp, 'large.ts'), 'x'.repeat(1025));
    mkdirSync(join(tmp, 'nested'), { recursive: true });
    writeFileSync(join(tmp, 'nested', 'child.py'), 'def y():\n    return 42\n');
    const results = [];
    const stats = {
      totalFiles: 0,
      totalBytes: 0,
      skipped: [],
      changedCandidates: 0,
      changedIncluded: 0,
    };
    walkDir(tmp, tmp, results, stats, 100, 1024 * 1024, 1024, new Set());
    const receipt = buildReceipt([tmp], results, stats, args);
    const toolPayloadOk = receipt.sourceFiles.every(
      (f) => typeof f.path === 'string' && typeof f.content === 'string'
    );
    const contentOk = receipt.sourceFiles.some((f) => f.content === 'export const x = 42;\n');
    const recursionOk = receipt.sourceFiles.some((f) => f.path === 'nested/child.py');
    const capOk =
      receipt.sourceFiles.length === 2 && stats.skipped.some((s) => s.reason === 'file-byte-cap-exceeded');
    console.log('receipt shape ok:', !!receipt.sourceFiles && !!receipt.stats);
    console.log('embedding policy ok:', receipt.embeddingPolicy?.provider === 'holoembed');
    console.log('tool payload ok:', toolPayloadOk && contentOk);
    console.log('recursive walk ok:', recursionOk);
    console.log('per-file cap ok:', capOk);
    console.log('files captured:', receipt.stats.totalFiles);
    if (
      receipt.embeddingPolicy?.provider !== 'holoembed' ||
      !toolPayloadOk ||
      !contentOk ||
      !recursionOk ||
      !capOk
    )
      process.exit(1);
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
  const collectionMaxFiles = args.chunkDir ? args.maxFiles * args.maxChunks : args.maxFiles;
  const collectionMaxBytes = args.chunkDir ? args.maxBytes * args.maxChunks : args.maxBytes;

  for (const root of args.roots) {
    if (!existsSync(root)) {
      stats.skipped.push({ path: root, reason: 'root-not-found' });
      continue;
    }
    const resolvedRoot = resolve(root);
    if (args.changedFirst) {
      addGitChangedFiles(
        resolvedRoot,
        sourceFiles,
        stats,
        collectionMaxFiles,
        collectionMaxBytes,
        args.maxFileBytes,
        seen
      );
    }
    walkDir(
      resolvedRoot,
      resolvedRoot,
      sourceFiles,
      stats,
      collectionMaxFiles,
      collectionMaxBytes,
      args.maxFileBytes,
      seen
    );
  }

  const receipt = buildReceipt(args.roots, sourceFiles, stats, args);

  if (args.chunkDir) {
    const { manifestPath, manifest, chunkReceipts } = writeChunkReceipts(receipt, args);
    console.log('Local codebase absorb chunks written:');
    console.log('  manifest:', manifestPath);
    console.log('  chunks:', manifest.stats.emittedChunks);
    console.log('  files:', manifest.stats.emittedChunkFiles);
    console.log('  bytes:', manifest.stats.emittedChunkBytes);
    console.log('  skipped:', manifest.stats.skippedCount);
    console.log(
      '  changed:',
      `${manifest.stats.changedIncluded}/${manifest.stats.changedCandidates}`,
      manifest.stats.changedFirst ? '(changed-first)' : '(walk-order)'
    );
    if (manifest.stats.oversizedCount > 0) {
      console.log('  oversized:', manifest.stats.oversizedCount);
    }

    if (args.postMcp) {
      const postResultsPath = join(resolve(args.chunkDir), `${args.chunkPrefix}-post-results.json`);
      const results = await postReceiptsToMcp(chunkReceipts, args, postResultsPath);
      const okCount = results.filter((r) => r.ok).length;
      console.log('  posted:', `${okCount}/${results.length}`);
      console.log('  post-results:', postResultsPath);
      if (okCount !== results.length) process.exit(1);
    }

    process.exit(0);
  }

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

  if (args.postMcp) {
    const postResultsPath = `${outPath}.post-results.json`;
    const results = await postReceiptsToMcp([{ path: outPath, receipt }], args, postResultsPath);
    const okCount = results.filter((r) => r.ok).length;
    console.log('  posted:', `${okCount}/${results.length}`);
    console.log('  post-results:', postResultsPath);
    if (okCount !== results.length) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
