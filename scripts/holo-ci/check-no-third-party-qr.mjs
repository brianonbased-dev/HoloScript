#!/usr/bin/env node
/**
 * check-no-third-party-qr.mjs — gate against routing QR-code generation through a
 * third-party hosted service (F.106/F.117: generate QR codes LOCALLY, never 3rd-party).
 *
 * Regression history: `api.qrserver.com` was hardcoded in
 * packages/core/src/traits/SocialTraits.ts and packages/mcp-server/src/renderer.ts,
 * leaking every published `.holo` share/scan URL to a third party via
 * `encodeURIComponent(sceneUrl)` in the query string. Fixed 2026-07-01 by switching
 * both call sites to local `qrcode` package generation (data: URI), matching the
 * existing local-generation reference in
 * packages/studio/src/components/QRCodeImage.tsx. This gate prevents a third
 * regression.
 *
 * Scope: scans `packages/*\/src/**` for literal third-party QR-service hostnames.
 * Explicitly excludes docs/archive/** (docs/archive/browser-templates/embed.html
 * carries the literal in dead reference HTML, not live code).
 *
 * Usage:
 *   node scripts/holo-ci/check-no-third-party-qr.mjs <file> [more files...]
 *   node scripts/holo-ci/check-no-third-party-qr.mjs --staged   scan git-staged files
 *   node scripts/holo-ci/check-no-third-party-qr.mjs --all      scan every src file
 *
 * Exit codes:
 *   0 — no third-party QR-service literal found
 *   1 — one or more violations found
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, relative, join, sep } from 'node:path';

const REPO = resolve(process.cwd());

// Known hosted QR-generation services. Add new offenders here as they're found.
const FORBIDDEN_HOSTS = ['api.qrserver.com', 'chart.googleapis.com/chart?cht=qr', 'qrickit.com'];

const HOST_RE = new RegExp(FORBIDDEN_HOSTS.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

function isExcludedPath(p) {
  const rel = relative(REPO, p).split(sep).join('/');
  return (
    /(^|\/)(node_modules|dist|\.git)(\/|$)/i.test(rel) ||
    /^docs\/archive\//i.test(rel) ||
    !/\/src\//.test(rel)
  );
}

// A negative-assertion test line (`expect(x).not.toContain('api.qrserver.com')`,
// `.not.toMatch(...)`) legitimately CARRIES the literal to assert its absence —
// that is the regression-guard pattern itself, not a violation. Skip lines matching
// this shape so the gate doesn't flag its own test coverage.
const NEGATIVE_ASSERTION_RE = /\.not\.(toContain|toMatch|toBe)\s*\(/;

function scanFile(p) {
  const violations = [];
  const text = readFileSync(p, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (NEGATIVE_ASSERTION_RE.test(line)) return;
    if (HOST_RE.test(line)) {
      violations.push({ line: i + 1, text: line.trim().slice(0, 160) });
    }
  });
  return violations;
}

function collectAllSrc() {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (/node_modules|\.git|dist/.test(full)) continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e)) out.push(full);
    }
  };
  const packagesDir = join(REPO, 'packages');
  if (existsSync(packagesDir)) {
    for (const pkg of readdirSync(packagesDir)) {
      walk(join(packagesDir, pkg, 'src'));
    }
  }
  return out;
}

function stagedFiles() {
  try {
    return execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f))
      .map((f) => resolve(REPO, f));
  } catch {
    return [];
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      [
        'check-no-third-party-qr — gate against hosted QR-code services (F.106/F.117: local only).',
        '',
        'Usage:',
        '  node scripts/holo-ci/check-no-third-party-qr.mjs <file> [...]   scan specific files',
        '  node scripts/holo-ci/check-no-third-party-qr.mjs --staged       scan git-staged files',
        '  node scripts/holo-ci/check-no-third-party-qr.mjs --all          scan every packages/*/src file',
        '',
        `Forbidden hosts: ${FORBIDDEN_HOSTS.join(', ')}`,
      ].join('\n')
    );
    return;
  }

  let files;
  if (args.includes('--all')) files = collectAllSrc();
  else if (args.includes('--staged')) files = stagedFiles();
  else files = args.map((a) => resolve(REPO, a));

  files = files.filter((f) => existsSync(f) && !isExcludedPath(f));

  if (!files.length) {
    console.log('check:no-third-party-qr — no source files to scan.');
    return;
  }

  const findings = [];
  for (const f of files) {
    for (const v of scanFile(f)) findings.push({ file: relative(REPO, f), ...v });
  }

  if (!findings.length) {
    console.log(`check:no-third-party-qr — OK (${files.length} file(s) clean).`);
    return;
  }

  console.error(`\n  ✗ check:no-third-party-qr — ${findings.length} third-party QR-service literal(s):\n`);
  for (const f of findings) {
    console.error(`    ${f.file}:${f.line}  ${f.text}`);
  }
  console.error(
    [
      '',
      '  QR codes must be generated LOCALLY (the `qrcode` npm package), never via a hosted',
      '  service — a hosted QR API leaks every scanned/shared URL to that third party',
      '  (F.106/F.117). See packages/studio/src/components/QRCodeImage.tsx or',
      '  packages/core/src/traits/SocialTraits.ts (generateQRCodeUrl) for the local pattern.',
      '',
    ].join('\n')
  );
  process.exit(1);
}

main();
