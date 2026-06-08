#!/usr/bin/env node
/**
 * scripts/holo-ci/security-audit.mjs
 *
 * Wrapper around `pnpm audit --prod --audit-level high` that supports a
 * structured ignore list for CVEs/GHSAs with no upstream fix.
 *
 * Usage:
 *   node scripts/holo-ci/security-audit.mjs [--audit-level=high] [--prod]
 *
 * Exit codes:
 *   0 — audit passed (zero unfixed high+ advisories)
 *   1 — audit failed (one or more unfixed high+ advisories)
 *
 * Ignored advisories (unfixable transitive deps — no patched version exists):
 *   GHSA-3gc7-fjrx-p6mg  bigint-buffer@1.1.5 — Buffer Overflow via toBigIntLE()
 *     Pulled by: @coinbase/agentkit > @solana/spl-token > @solana/buffer-layout-utils@0.2.0
 *     patched_versions: <0.0.0 (no npm fix; confirmed 2026-06-08 against npm registry)
 *     Accepted risk: marketplace packages only; not in core/mcp-server/studio auth paths.
 *     Re-evaluate when @solana/buffer-layout-utils cuts a release without bigint-buffer.
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

// GHSAs with no upstream fix available. Each entry must include a justification comment above.
const IGNORED_GHSAS = new Set([
  'GHSA-3gc7-fjrx-p6mg', // bigint-buffer — no patched version in npm registry
]);

const rawArgs = process.argv.slice(2);
const auditLevel = rawArgs.find((a) => a.startsWith('--audit-level='))?.split('=')[1] ?? 'high';
const prod = rawArgs.includes('--prod') ? ['--prod'] : [];
const jsonArgs = ['audit', '--json', `--audit-level=${auditLevel}`, ...prod];

function parseJsonFromText(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function runPnpmAuditJson() {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? process.env.ComSpec || 'cmd.exe' : 'pnpm';
    const args = isWin ? ['/d', '/s', '/c', ['pnpm', ...jsonArgs].join(' ')] : jsonArgs;

    const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on('error', (err) => resolve({ code: 1, stdout: '', stderr: err.message }));
  });
}

const result = await runPnpmAuditJson();
const auditJson = parseJsonFromText(result.stdout);

if (!auditJson) {
  console.error('[security-audit] Failed to parse pnpm audit JSON output.');
  console.error('[security-audit] stderr:', result.stderr.slice(0, 500));
  process.exit(1);
}

const advisories = auditJson?.advisories ?? {};
const allHigh = Object.values(advisories).filter((a) =>
  ['high', 'critical'].includes(String(a?.severity ?? '').toLowerCase())
);

const ignored = allHigh.filter((a) => {
  const ghsas = (a.github_advisories ?? []).concat(
    a.url ? [a.url.replace(/.*\/advisories\//, '')] : []
  );
  return ghsas.some((g) => IGNORED_GHSAS.has(g));
});

const unfixed = allHigh.filter((a) => !ignored.includes(a));

// Summary output
const meta = auditJson?.metadata?.vulnerabilities ?? {};
console.log(
  `[security-audit] pnpm audit results (audit-level=${auditLevel}, prod=${prod.length > 0})`
);
console.log(
  `  low=${meta.low ?? 0} moderate=${meta.moderate ?? 0} high=${meta.high ?? 0} critical=${meta.critical ?? 0}`
);

if (ignored.length > 0) {
  console.log(`[security-audit] Ignored (no upstream fix): ${ignored.length}`);
  for (const a of ignored) {
    const ghsa = (a.github_advisories ?? [a.url?.replace(/.*\/advisories\//, '')])[0] ?? a.id;
    console.log(`  - ${a.module_name}  ${ghsa}  ${a.title?.slice(0, 80)}`);
  }
}

if (unfixed.length > 0) {
  console.error(
    `[security-audit] FAIL: ${unfixed.length} high+ advisories without upstream fix or ignore entry:`
  );
  for (const a of unfixed) {
    const ghsa = (a.github_advisories ?? [a.url?.replace(/.*\/advisories\//, '')])[0] ?? a.id;
    console.error(
      `  - [${a.severity.toUpperCase()}] ${a.module_name}  ${ghsa}  ${a.title?.slice(0, 80)}`
    );
    console.error(`    patched_versions: ${a.patched_versions ?? 'none'}`);
  }
  process.exit(1);
}

console.log(`[security-audit] PASS — all high+ advisories resolved or acknowledged.`);
process.exit(0);
