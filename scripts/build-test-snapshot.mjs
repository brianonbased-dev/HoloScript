#!/usr/bin/env node
/**
 * scripts/build-test-snapshot.mjs
 *
 * Parses captured vitest stdout from a /tmp dir and emits a single
 * docs/test-snapshot.json with pass/fail/total per package.
 *
 * Usage: node scripts/build-test-snapshot.mjs <log-dir> <out-path>
 *   <log-dir>   directory containing core.log, studio.log, snn.log
 *   <out-path>  e.g. docs/test-snapshot.json
 *
 * Closes ai-ecosystem board task task_1776987250351_ljyi (S.TST refresher).
 * Paired with ai-ecosystem hooks/sessionstart/s-tst-refresh.mjs.
 *
 * No external deps — pure node+fs.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const [logDir, outPath] = process.argv.slice(2);
if (!logDir || !outPath) {
  console.error('usage: build-test-snapshot.mjs <log-dir> <out-path>');
  process.exit(2);
}

/**
 * Vitest "Tests" summary line examples:
 *   Tests  493 failed | 45126 passed (45661)
 *   Tests  1 failed | 22 passed | 3 skipped (26)
 *   Tests  22 passed (22)
 *
 * Group order varies. Parse all "(\d+) (failed|passed|skipped|todo)" tokens
 * plus the trailing "(N)" total. Take the LAST such line in the log so a
 * shard boundary doesn't truncate the rollup.
 */
function parseVitestSummary(text) {
  const lines = text.split(/\r?\n/);
  // Match anywhere on the line; vitest prefixes with ANSI + "Tests".
  const summaryRe = /Tests?\s+(.*?)\((\d+)\)/;
  let last = null;
  for (const ln of lines) {
    // Strip ANSI escapes so the regex sees plain text.
    const clean = ln.replace(/\x1b\[[0-9;]*m/g, '');
    const m = clean.match(summaryRe);
    if (m) last = { body: m[1], total: Number(m[2]) };
  }
  if (!last) return null;
  const counts = { passed: 0, failed: 0, skipped: 0, todo: 0 };
  const tokenRe = /(\d+)\s+(passed|failed|skipped|todo)/g;
  let tm;
  while ((tm = tokenRe.exec(last.body)) !== null) {
    counts[tm[2]] = Number(tm[1]);
  }
  return { ...counts, total: last.total };
}

function readLog(name) {
  const p = resolve(logDir, name);
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

const packages = {
  core:       readLog('core.log'),
  studio:     readLog('studio.log'),
  snnWebgpu:  readLog('snn.log'),
};

const summary = {};
let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;
let totalAll = 0;

for (const [pkg, text] of Object.entries(packages)) {
  if (!text) {
    summary[pkg] = { status: 'missing-log' };
    continue;
  }
  const parsed = parseVitestSummary(text);
  if (!parsed) {
    summary[pkg] = { status: 'parse-failed' };
    continue;
  }
  summary[pkg] = { status: 'ok', ...parsed };
  totalPassed  += parsed.passed;
  totalFailed  += parsed.failed;
  totalSkipped += parsed.skipped;
  totalAll     += parsed.total;
}

const passRate = totalAll > 0 ? (totalPassed / totalAll) * 100 : 0;

const snapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  ci: {
    runId:  process.env.GH_RUN_ID  || null,
    runUrl: process.env.GH_RUN_URL || null,
  },
  totals: {
    passed:  totalPassed,
    failed:  totalFailed,
    skipped: totalSkipped,
    total:   totalAll,
    passRate: Number(passRate.toFixed(2)),
  },
  packages: summary,
  // The exact one-line shape MEMORY.md S.TST consumes. The reader hook
  // can either substitute the date+counts inline OR replace the whole
  // line with this string — easier to keep both producer and consumer
  // pinned to one canonical form.
  memoryLine:
    `S.TST: ${new Date().toISOString().slice(0, 10)} snapshot ` +
    `${totalPassed.toLocaleString()} pass / ${totalFailed} fail / ` +
    `${totalAll.toLocaleString()} (${passRate.toFixed(2)}%). ` +
    `Auto-refreshed by .github/workflows/test-snapshot.yml.`,
};

mkdirSync(dirname(resolve(outPath)), { recursive: true });
writeFileSync(resolve(outPath), JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');

console.log(`[snapshot] wrote ${outPath}`);
console.log(`[snapshot] totals: ${totalPassed} pass / ${totalFailed} fail / ${totalAll} (${passRate.toFixed(2)}%)`);
for (const [pkg, s] of Object.entries(summary)) {
  console.log(`[snapshot]   ${pkg}: ${JSON.stringify(s)}`);
}
