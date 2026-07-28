#!/usr/bin/env node
/**
 * audit-native-parseability.mjs - BLAST language-integrity audit.
 *
 * check-native-coverage.mjs (the D.104 gate) counts .hsplus/.holo/.hs files by
 * extension only. This script quantifies the real gap: of the files that D.104
 * counts as native, how many are really valid through the same guard used by
 * corpus rows and eval gates?
 *
 * BLAST 2/3: each row uses assertReallyValid(), so "parse clean" means:
 *   - errors.length === 0, regardless of raw success flags;
 *   - verdict agrees with and without one trailing newline;
 *   - source-declared semantic nodes are not silently lost from the AST where
 *     a cheap node-count check is feasible.
 *
 * Usage:
 *   node scripts/holo-ci/audit-native-parseability.mjs
 *   node scripts/holo-ci/audit-native-parseability.mjs --json
 *   node scripts/holo-ci/audit-native-parseability.mjs --samples 10
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkReallyValid } from '../lang-audit/assert-really-valid.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_ROOT = path.join(REPO_ROOT, 'packages'); // matches check-native-coverage.mjs scope
const NATIVE_EXT = new Set(['.hsplus', '.holo', '.hs']);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.tmp-g4',
  'out',
  '.bench-logs',
  'target',
]);

function walk(dir, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), onFile);
    } else if (entry.isFile()) {
      onFile(path.join(dir, entry.name));
    }
  }
}

function bucket() {
  return { pass: 0, fail: 0, threw: 0, sampleErrors: [] };
}

function recordFail(b, file, detail, maxSamples) {
  b.fail++;
  if (b.sampleErrors.length < maxSamples) {
    b.sampleErrors.push({ file: path.relative(REPO_ROOT, file), detail });
  }
}

function recordThrow(b, file, detail, maxSamples) {
  b.threw++;
  if (b.sampleErrors.length < maxSamples) {
    b.sampleErrors.push({ file: path.relative(REPO_ROOT, file), detail: `THREW: ${detail}` });
  }
}

function formatGuardDetail(result) {
  const codes = result.diagnostics.map((d) => d.code).join(', ') || 'unknown';
  const firstParserErrors = result.primary.errors
    .map((error) => error.message ?? String(error))
    .slice(0, 2)
    .join(' | ');
  const extra =
    firstParserErrors ||
    `sourceNodes=${result.sourceNodeCount.count} astNodes=${result.astNodeCount}`;
  return `${codes}: ${extra}`;
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const samplesIdx = args.indexOf('--samples');
  const maxSamples = samplesIdx >= 0 ? Number(args[samplesIdx + 1]) || 5 : 5;

  const results = { '.hsplus': bucket(), '.hs': bucket(), '.holo': bucket() };
  const files = { '.hsplus': [], '.hs': [], '.holo': [] };
  const guardErrorCounts = {};
  // Advisory trait prop-schema (enum/type) findings. SEPARATE from the guard verdict —
  // report-only, never gates. `.holo`-only in practice; other formats yield [].
  const semanticCounts = { total: 0, filesWithFindings: 0, byCode: {}, unavailable: {} };

  walk(SCAN_ROOT, (abs) => {
    const ext = path.extname(abs);
    if (NATIVE_EXT.has(ext)) files[ext].push(abs);
  });

  for (const ext of ['.hsplus', '.hs', '.holo']) {
    const b = results[ext];
    for (const abs of files[ext]) {
      let src;
      try {
        src = fs.readFileSync(abs, 'utf8');
      } catch (err) {
        recordThrow(b, abs, String(err), maxSamples);
        continue;
      }

      let guarded;
      try {
        guarded = await checkReallyValid(src, ext);
      } catch (err) {
        recordThrow(b, abs, String(err).slice(0, 200), maxSamples);
        continue;
      }

      // Tally advisory semantic findings independently of the pass/fail verdict:
      // a file can be really-valid (ok) yet still carry prop-schema advisories.
      if (Array.isArray(guarded.semanticDiagnostics) && guarded.semanticDiagnostics.length > 0) {
        semanticCounts.filesWithFindings++;
        for (const d of guarded.semanticDiagnostics) {
          semanticCounts.total++;
          semanticCounts.byCode[d.code] = (semanticCounts.byCode[d.code] ?? 0) + 1;
        }
      }
      if (guarded.semanticDiagnosticsUnavailable) {
        const reason = guarded.semanticDiagnosticsUnavailable;
        semanticCounts.unavailable[reason] = (semanticCounts.unavailable[reason] ?? 0) + 1;
      }

      if (guarded.ok) {
        b.pass++;
      } else {
        for (const diagnostic of guarded.diagnostics) {
          guardErrorCounts[diagnostic.code] = (guardErrorCounts[diagnostic.code] ?? 0) + 1;
        }
        recordFail(b, abs, formatGuardDetail(guarded).slice(0, 250), maxSamples);
      }
    }
  }

  const totalCounted = Object.values(files).reduce((s, arr) => s + arr.length, 0);
  const totalPass = Object.values(results).reduce((s, b) => s + (b.pass || 0), 0);
  const totalFail = Object.values(results).reduce((s, b) => s + (b.fail || 0) + (b.threw || 0), 0);
  const parseablePct = totalCounted === 0 ? 0 : (totalPass / totalCounted) * 100;

  const report = {
    generatedAtIso: new Date().toISOString(),
    scanRoot: path.relative(REPO_ROOT, SCAN_ROOT),
    guard: {
      name: 'assertReallyValid',
      rules: ['errors.length===0', 'trailing-newline-invariance', 'node-count-fidelity'],
      errorCounts: guardErrorCounts,
    },
    counts: {
      '.hsplus': { extensionTotal: files['.hsplus'].length, ...results['.hsplus'] },
      '.hs': { extensionTotal: files['.hs'].length, ...results['.hs'] },
      '.holo': { extensionTotal: files['.holo'].length, ...results['.holo'] },
    },
    summary: {
      totalCountedByD104: totalCounted,
      totalActuallyParseable: totalPass,
      totalFailingOrThrowing: totalFail,
      realParseablePct: Number(parseablePct.toFixed(2)),
    },
    // Advisory only — reported so drift is visible, never used to gate this audit.
    semantic: {
      name: 'confabulation-prop-schema',
      note: 'Advisory trait enum/type findings; ignored by the really-valid verdict.',
      total: semanticCounts.total,
      filesWithFindings: semanticCounts.filesWithFindings,
      byCode: semanticCounts.byCode,
      unavailable: semanticCounts.unavailable,
    },
  };

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  console.log(`native-parseability audit (guarded) - ${report.generatedAtIso}`);
  console.log(`guard: ${report.guard.name} (${report.guard.rules.join(', ')})`);
  console.log('');
  for (const ext of ['.hsplus', '.hs', '.holo']) {
    const c = report.counts[ext];
    const total = c.extensionTotal;
    const pct = total === 0 ? 0 : ((c.pass / total) * 100).toFixed(2);
    console.log(
      `${ext}: ${c.pass}/${total} really valid (${pct}%) - fail=${c.fail} threw=${c.threw}`
    );
    for (const s of c.sampleErrors) {
      console.log(`    ${s.file}: ${s.detail}`);
    }
  }
  console.log('');
  console.log(
    `D.104 counts ${report.summary.totalCountedByD104} files as "native" by extension. ` +
      `Only ${report.summary.totalActuallyParseable} (${report.summary.realParseablePct}%) are really valid.`
  );
  console.log(`Guard rejection codes: ${JSON.stringify(report.guard.errorCounts)}`);
  const sem = report.semantic;
  const unavailableSuffix = Object.keys(sem.unavailable).length
    ? ` | unavailable: ${JSON.stringify(sem.unavailable)}`
    : '';
  console.log(
    `Semantic prop-schema advisories (report-only, not gated): ${sem.total} finding(s) across ` +
      `${sem.filesWithFindings} file(s). By code: ${JSON.stringify(sem.byCode)}${unavailableSuffix}`
  );
}

main();
