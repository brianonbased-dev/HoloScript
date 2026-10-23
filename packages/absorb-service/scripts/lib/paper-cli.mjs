// Shared CLI helpers for the A19 paper-ingest scripts. Local only.
import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
export const packageRoot = resolve(here, '..', '..');
export const repoRoot = resolve(packageRoot, '..', '..');

export async function loadPaper() {
  const p = resolve(packageRoot, 'dist', 'paper', 'index.js');
  if (!existsSync(p)) {
    throw new Error('dist/paper/index.js is missing. Run `pnpm --filter @holoscript/absorb-service build` first.');
  }
  return import(pathToFileURL(p).href);
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) out[k] = true;
      else { out[k] = v; i += 1; }
    } else out._.push(a);
  }
  return out;
}

/** HoloScript = this checkout; ai-ecosystem = --aieco or ../ai-ecosystem next to it. */
export function defaultRoots(args) {
  return {
    HoloScript: repoRoot,
    'ai-ecosystem': resolve(typeof args.aieco === 'string' ? args.aieco : resolve(repoRoot, '..', 'ai-ecosystem')),
  };
}

/** Resolve a CLI path against cwd, falling back to the ai-ecosystem root. */
export function resolveInput(p, roots) {
  const a = resolve(process.cwd(), p);
  if (existsSync(a)) return a;
  const b = resolve(roots['ai-ecosystem'], p);
  return existsSync(b) ? b : a;
}

export function gitCommit() {
  try { return execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; }
}

export function receipt(command, startedAt, result) {
  command = command.split(repoRoot + '/').join('').split(repoRoot + '\\').join('');
  return { command: `node ${command}`, gitCommit: gitCommit(), machine: hostname(), startedAt, finishedAt: new Date().toISOString(), result };
}

export function emit(obj, args) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

/** Rows closed by A19 receipts: 5/6 by replay, 7 by binding (spec b). */
export function extraEvidenceFrom(args) {
  if (typeof args['receipt-dir'] !== 'string') return undefined;
  const dir = args['receipt-dir'].replace(/\\/g, '/').replace(/\/$/, '');
  return { 5: [`${dir}/replay.json`], 6: [`${dir}/replay.json`], 7: [`${dir}/binding.txt`] };
}