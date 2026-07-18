#!/usr/bin/env node
/**
 * build-papers-status-manifest.mjs — generate the public paper-status manifest
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
 *   git add docs/public/papers-status.json \
 *     services/holoscript-net-v2/public/papers-status.json
 *   git commit -m "docs(papers): refresh status manifest"
 *
 * The public site build never touches ai-ecosystem; it reads the committed
 * manifest. Cross-repo coupling stays at refresh time only.
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
  })
);

const AI_ECO_ROOT = argMap['ai-eco'] || process.env.AI_ECO_ROOT || 'C:/Users/josep/.ai-ecosystem';

const REBUILDER = path.join(AI_ECO_ROOT, 'scripts', 'paper-audit-matrix-auto-rebuild.mjs');
const OUT_PATH = path.resolve(__dirname, '..', 'docs', 'public', 'papers-status.json');
const COMPAT_OUT_PATH = path.resolve(
  __dirname,
  '..',
  'services',
  'holoscript-net-v2',
  'public',
  'papers-status.json'
);
const EXPECTED_SCHEMA = 'paper-audit-matrix.v3';

function atomicWrite(targetPath, bytes) {
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  try {
    fs.writeFileSync(temporaryPath, bytes, { flag: 'wx' });
    fs.renameSync(temporaryPath, targetPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function main() {
  if (!fs.existsSync(REBUILDER)) {
    throw new Error(
      `rebuilder not found: ${REBUILDER}\n  pass --ai-eco=<path> or set AI_ECO_ROOT env`
    );
  }

  const buildPath = `${OUT_PATH}.${process.pid}.${Date.now()}.build`;
  let bytes;
  let data;

  try {
    console.error(`[papers-status] running ${path.relative(process.cwd(), REBUILDER)}`);
    const result = spawnSync(process.execPath, [REBUILDER, `--json-out=${buildPath}`], {
      cwd: AI_ECO_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (result.status !== 0) {
      throw new Error(`rebuilder exited with ${result.status}`);
    }

    if (!fs.existsSync(buildPath)) {
      throw new Error(`expected output not written: ${buildPath}`);
    }

    bytes = fs.readFileSync(buildPath);
    data = JSON.parse(bytes.toString('utf8'));
    if (data.schema !== EXPECTED_SCHEMA || !Array.isArray(data.papers)) {
      throw new Error(`refusing publish: expected ${EXPECTED_SCHEMA} with a papers array`);
    }
  } finally {
    if (fs.existsSync(buildPath)) fs.unlinkSync(buildPath);
  }

  // Publish the exact same validated bytes to the canonical artifact and the
  // tracked service compatibility URL. Each replacement is atomic.
  atomicWrite(OUT_PATH, bytes);
  atomicWrite(COMPAT_OUT_PATH, bytes);

  // Report the validated manifest that was just published.
  const totals = data.totals || { papers: 0, cellsByToken: {} };
  const t = totals.cellsByToken || {};
  console.error(
    `[papers-status] wrote ${path.relative(process.cwd(), OUT_PATH)} and ` +
      `${path.relative(process.cwd(), COMPAT_OUT_PATH)} ` +
      `(${totals.papers} papers, ${t['✅'] || 0} GREEN / ${t['⚠️'] || 0} AMBER / ${t['❌'] || 0} RED / ${t['➖'] || 0} N/A)`
  );
}

try {
  main();
} catch (error) {
  console.error(
    `[papers-status] ${(error instanceof Error ? error : new Error(String(error))).message}`
  );
  process.exitCode = 1;
}
