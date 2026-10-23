/**
 * fsLoaders - Node-side file loading for paper ingest, claim links and replay
 * (A19). Local filesystem only: no network, no Railway, no cloud.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CodebaseGraph } from '../CodebaseGraph';
import { PaperAdapter } from '../adapters/PaperAdapter';
import { PaperTexAdapter } from '../adapters/PaperTexAdapter';
import { ingestPaperClaims, paperIdFromPath, type PaperIngestResult } from './claimIngest';
import type { ScannedFile, ScanResult } from '../types';

/** Map ledger path prefixes (`HoloScript/`, `ai-ecosystem/`) to local checkouts. */
export type RepoRoots = Record<string, string>;

export function resolveRepoPath(repoPath: string, roots: RepoRoots): string | null {
  const norm = repoPath.replace(/\\/g, '/');
  const [head, ...rest] = norm.split('/');
  if (roots[head]) return resolve(roots[head], ...rest);
  return null;
}

export function gitHead(dir: string): string | null {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function loadPaperClaims(opts: {
  ledgerPath: string;
  texPath?: string;
  roots: RepoRoots;
  extraEvidence?: Record<number, string[]>;
  paperId?: string;
}): PaperIngestResult {
  const ledgerText = readFileSync(opts.ledgerPath, 'utf8');
  const tex = opts.texPath && existsSync(opts.texPath) ? { path: opts.texPath, text: readFileSync(opts.texPath, 'utf8') } : undefined;
  return ingestPaperClaims({
    paperId: opts.paperId ?? paperIdFromPath(opts.texPath ?? opts.ledgerPath),
    ledger: { path: displayPath(opts.ledgerPath, opts.roots), text: ledgerText },
    tex: tex ? { path: displayPath(tex.path, opts.roots), text: tex.text } : undefined,
    gitCommit: opts.roots.HoloScript ? gitHead(opts.roots.HoloScript) : null,
    extraEvidence: opts.extraEvidence,
    readFile: (repoPath) => {
      const abs = resolveRepoPath(repoPath, opts.roots);
      if (!abs || !existsSync(abs) || !statSync(abs).isFile()) return { exists: false };
      return { exists: true, content: readFileSync(abs) };
    },
  });
}

/** Repo-relative display path (`HoloScript/...`) so receipts do not leak machine paths. */
export function displayPath(abs: string, roots: RepoRoots): string {
  const a = resolve(abs);
  for (const [name, root] of Object.entries(roots)) {
    const r = resolve(root);
    if (a === r || a.startsWith(r + sep)) return [name, relative(r, a)].join('/').replace(/\\/g, '/');
  }
  return a.replace(/\\/g, '/');
}

function walk(dir: string, exts: string[], out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.toLowerCase().endsWith(e))) out.push(p);
  }
}

/** Build a CodebaseGraph of .md/.tex docs under the given dirs (paths relative to `base`). */
export async function buildDocGraph(dirsOrFiles: string[], base: string): Promise<{ graph: CodebaseGraph; scan: ScanResult }> {
  const md = new PaperAdapter();
  const tex = new PaperTexAdapter();
  const paths: string[] = [];
  for (const d of dirsOrFiles) {
    if (statSync(d).isDirectory()) walk(d, ['.md', '.tex'], paths);
    else paths.push(d);
  }
  const files: ScannedFile[] = [];
  for (const abs of [...new Set(paths)].sort()) {
    const rel = relative(base, abs).replace(/\\/g, '/');
    const src = readFileSync(abs, 'utf8');
    const adapter = abs.toLowerCase().endsWith('.tex') ? tex : md;
    const tree = await adapter.parse(src, rel);
    const symbols = adapter.extractSymbols(tree, rel);
    const imports = adapter.extractImports(tree, rel).map((imp) => {
      const target = resolve(abs, '..', imp.toModule);
      return { ...imp, resolvedPath: existsSync(target) ? relative(base, target).replace(/\\/g, '/') : undefined };
    });
    files.push({ path: rel, language: adapter.language, symbols, imports, calls: [], loc: src.split('\n').length, sizeBytes: Buffer.byteLength(src) });
  }
  const scan: ScanResult = {
    rootDir: '.',
    rootDirs: ['.'],
    files,
    stats: {
      totalFiles: files.length,
      filesByLanguage: files.reduce<Record<string, number>>((a, f) => ((a[f.language] = (a[f.language] ?? 0) + 1), a), {}),
      totalSymbols: files.reduce((n, f) => n + f.symbols.length, 0),
      symbolsByType: {},
      totalImports: files.reduce((n, f) => n + f.imports.length, 0),
      totalCalls: 0,
      totalLoc: files.reduce((n, f) => n + f.loc, 0),
      durationMs: 0,
      errors: [],
    },
  };
  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scan);
  return { graph, scan };
}