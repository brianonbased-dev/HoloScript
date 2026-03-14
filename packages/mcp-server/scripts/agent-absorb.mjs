/**
 * agent-absorb.mjs — Agent-mode HoloScript codebase absorption (JSON output)
 *
 * Absorbs key packages and emits graph JSON for programmatic search.
 * Results written to temp/*.graph.json — queryable with jq or any JSON tool.
 *
 * Usage:
 *   node packages/mcp-server/scripts/agent-absorb.mjs
 *   node packages/mcp-server/scripts/agent-absorb.mjs | jq .results
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../');
const OUT_DIR = path.join(REPO_ROOT, 'temp');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const { CodebaseScanner, CodebaseGraph, HoloEmitter } = await import('@holoscript/core/codebase');

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stderr.write(msg + '\n'); }

async function absorb(label, rootDir, depth = 'medium') {
  log(`\n[absorb] ${label} → ${rootDir}`);

  const scanner = new CodebaseScanner();
  const scanResult = await scanner.scan({ rootDir, languages: ['typescript'], maxFiles: 3000 });

  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scanResult);
  const stats = graph.getStats();

  log(`  files:${stats.totalFiles} symbols:${stats.totalSymbols} loc:${stats.totalLoc} calls:${stats.totalCalls}`);

  // ── JSON graph (machine-searchable) ────────────────────────────────────────
  const graphJson = graph.serialize();
  const graphOutFile = path.join(OUT_DIR, `${label}.graph.json`);
  fs.writeFileSync(graphOutFile, graphJson, 'utf-8');

  // ── Agent .holo manifest (human+AI readable) ────────────────────────────────
  let packageMeta;
  try {
    const pkgPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      packageMeta = { name: pkg.name, version: pkg.version, description: pkg.description, scripts: pkg.scripts };
    }
  } catch { /* optional */ }

  let gitInfo;
  try {
    const { execSync } = await import('child_process');
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT, stdio: ['pipe','pipe','pipe'] }).toString().trim();
    const hash = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, stdio: ['pipe','pipe','pipe'] }).toString().trim();
    gitInfo = `${branch}@${hash}`;
  } catch { /* optional */ }

  const emitter = new HoloEmitter();
  const holoSource = emitter.emit(graph, {
    name: label,
    forAgent: true,
    depth,
    packageMeta,
    gitInfo,
    absorbedAt: new Date().toISOString(),
  });
  const holoOutFile = path.join(OUT_DIR, `${label}-agent.holo`);
  fs.writeFileSync(holoOutFile, holoSource, 'utf-8');

  // ── Programmatic JSON queries on the graph ──────────────────────────────────
  const communities = graph.detectCommunities();
  const communityList = Array.from(communities.entries()).map(([name, files]) => ({
    name,
    fileCount: files.length,
    files: files.slice(0, 5), // first 5 files as sample
  }));

  // Top files by in-degree (most imported = architectural hotspots)
  const filePaths = graph.getFilePaths();
  const hotspots = filePaths
    .map(fp => ({ file: fp, importedBy: graph.getImportedBy(fp).length, symbols: graph.getSymbolsInFile(fp).length }))
    .filter(x => x.importedBy > 0)
    .sort((a, b) => b.importedBy - a.importedBy)
    .slice(0, 15);

  // All public symbols (search index)
  const allSymbols = graph.getAllSymbols();
  const publicSymbols = allSymbols
    .filter(s => s.visibility === 'public')
    .map(s => ({ name: s.owner ? `${s.owner}.${s.name}` : s.name, type: s.type, file: s.filePath, line: s.line, loc: s.loc ?? 0 }))
    .sort((a, b) => b.loc - a.loc); // largest symbols first

  const result = {
    label,
    rootDir,
    absorbedAt: new Date().toISOString(),
    gitInfo,
    stats,
    communities: communityList,
    hotspots,
    publicSymbols,
    outputs: {
      graphJson: graphOutFile,
      agentHolo: holoOutFile,
    },
  };

  // Write structured query result as JSON
  const queryOutFile = path.join(OUT_DIR, `${label}-query.json`);
  fs.writeFileSync(queryOutFile, JSON.stringify(result, null, 2), 'utf-8');
  log(`  [ok] ${queryOutFile} (${(JSON.stringify(result).length / 1024).toFixed(1)} KB)`);
  log(`  [ok] ${graphOutFile} (${(graphJson.length / 1024).toFixed(1)} KB)`);
  log(`  [ok] ${holoOutFile} (${(holoSource.length / 1024).toFixed(1)} KB)`);

  return result;
}

// ── Run absorptions ──────────────────────────────────────────────────────────

const absorptions = [
  ['snn-webgpu',          path.join(REPO_ROOT, 'packages/snn-webgpu'),       'deep'],
  ['holoscript-studio',   path.join(REPO_ROOT, 'packages/studio/src'),        'medium'],
  ['holoscript-mcp',      path.join(REPO_ROOT, 'packages/mcp-server/src'),    'deep'],
];

const results = [];
for (const [label, rootDir, depth] of absorptions) {
  results.push(await absorb(label, rootDir, depth));
}

// ── Final JSON report to stdout (pipe-friendly) ───────────────────────────────

const report = {
  absorbedAt: new Date().toISOString(),
  packages: results.map(r => ({
    label: r.label,
    stats: r.stats,
    topCommunities: r.communities.slice(0, 5).map(c => ({ name: c.name, fileCount: c.fileCount })),
    topHotspots: r.hotspots.slice(0, 5),
    largestSymbols: r.publicSymbols.slice(0, 10).map(s => `${s.name} (${s.type}, ${s.loc} LOC)`),
    outputs: r.outputs,
  })),
};

console.log(JSON.stringify(report, null, 2));
