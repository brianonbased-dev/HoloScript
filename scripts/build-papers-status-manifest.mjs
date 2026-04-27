#!/usr/bin/env node
/**
 * build-papers-status-manifest.mjs — generate docs/public/papers-status.json
 *
 * Companion to scripts/build-provenance-manifest.mjs (parallel pattern).
 *
 * Pulls the structured paper-audit-matrix JSON from the sibling ai-ecosystem
 * repo by invoking its `paper-audit-matrix-auto-rebuild.mjs --json-out=...`
 * mode. The rebuilder is the SSOT — disk-grounded structural grep of every
 * paper .tex on the program. F.030 + W.103 cure: the matrix goes stale within
 * hours of being hand-edited, so the script regenerates from disk every time
 * we refresh.
 *
 * Refresh cadence: manual. Re-run after every paper-touching commit on
 * ai-ecosystem (or whenever the audit matrix moves):
 *   node scripts/build-papers-status-manifest.mjs
 *   git add docs/public/papers-status.json
 *   git commit -m "docs(papers): refresh status manifest"
 *
 * The site build (docs/.vitepress/) never touches ai-ecosystem; it reads the
 * committed manifest. Cross-repo coupling stays at refresh time only.
 *
 * Override the ai-ecosystem clone path with --ai-eco=<path> or AI_ECO_ROOT.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const argMap = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const AI_ECO_ROOT =
  argMap['ai-eco'] ||
  process.env.AI_ECO_ROOT ||
  'C:/Users/josep/.ai-ecosystem';

const REBUILDER = path.join(AI_ECO_ROOT, 'scripts', 'paper-audit-matrix-auto-rebuild.mjs');
const OUT_PATH = path.resolve(__dirname, '..', 'docs', 'public', 'papers-status.json');

function main() {
  if (!fs.existsSync(REBUILDER)) {
    console.error(`[papers-status] rebuilder not found: ${REBUILDER}`);
    console.error('  pass --ai-eco=<path> or set AI_ECO_ROOT env');
    process.exit(1);
  }

  console.error(`[papers-status] running ${path.relative(process.cwd(), REBUILDER)}`);
  const result = spawnSync(process.execPath, [REBUILDER, `--json-out=${OUT_PATH}`], {
    cwd: AI_ECO_ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    console.error(`[papers-status] rebuilder exited with ${result.status}`);
    process.exit(result.status || 1);
  }

  if (!fs.existsSync(OUT_PATH)) {
    console.error(`[papers-status] expected output not written: ${OUT_PATH}`);
    process.exit(1);
  }

  // Sanity-load + report
  const data = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  const totals = data.totals || { papers: 0, cellsByToken: {} };
  const t = totals.cellsByToken || {};
  console.error(
    `[papers-status] wrote ${path.relative(process.cwd(), OUT_PATH)} ` +
      `(${totals.papers} papers, ${t['✅'] || 0} GREEN / ${t['⚠️'] || 0} AMBER / ${t['❌'] || 0} RED / ${t['➖'] || 0} N/A)`,
  );
}

main();
