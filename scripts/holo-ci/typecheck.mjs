#!/usr/bin/env node
/**
 * typecheck.mjs — repo-wide TypeScript RATCHET gate (task_1783800522896).
 *
 * WHY: the only tsc-based required gate was studio-typecheck.mjs (packages/studio ONLY).
 * safe-commit's TypeScript step is `⚠ skipped (CI handles this)`, and vitest transpiles via esbuild
 * (which STRIPS types, never type-checks). Net: a full-package src type error compiled green under
 * every required gate and shipped — e.g. a TS2416 in @holoscript/holoscript-agent's
 * uaal-mesh-transport.ts sat green for 11 days (task_1783728276711_a14w). Each package's own
 * tsconfig.json DOES catch it when tsc runs directly; nothing ran it.
 *
 * This gate runs `tsc --noEmit -p <pkg>/tsconfig.json` over the ENFORCED set and FAILS (exit 1) on
 * any error. It is a RATCHET, not a green-everything bar:
 *   - ENFORCED — packages that type-check clean today. A NEW error here fails the gate.
 *   - STAGED   — packages with KNOWN pre-existing errors (2026-07-12 sweep). Tracked here, NOT
 *                blocking. Fix a staged package, then MOVE it into ENFORCED (that is the ratchet).
 *   - A tsconfig package in NEITHER list is a newly-added package that must be enrolled → warned.
 *
 * Usage:
 *   node scripts/holo-ci/typecheck.mjs                 # gate: check every ENFORCED package (CI)
 *   node scripts/holo-ci/typecheck.mjs --package cli   # check one package (any, incl. staged)
 *   node scripts/holo-ci/typecheck.mjs --staged        # report current error counts for STAGED
 *   node scripts/holo-ci/typecheck.mjs --list          # print ENFORCED / STAGED / unenrolled
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const TAG = '[typecheck]';
const CONCURRENCY = 6;

// Packages whose src MUST type-check clean (`tsc --noEmit -p <pkg>/tsconfig.json` passes today,
// 2026-07-12 sweep). A tsc error in ANY of these fails the gate.
const ENFORCED = [
  'absorb-service', 'adapter-postgres', 'agent-protocol', 'aibrittney', 'animation-presets',
  'auth', 'benchmark', 'compiler-wasm', 'connector-appstore', 'connector-core', 'connector-github',
  'connector-moltbook', 'connector-railway', 'connector-upstash', 'connector-vscode', 'core',
  'core-types', 'crdt', 'crdt-spatial', 'create-holoscript', 'engine', 'formatter',
  'graphql-api', 'holo-runtime', 'holo-vm', 'holoembed', 'hologram-worker',
  'hololand-platform', 'holomap', 'holomesh-web', 'holoscript', 'holoscript-agent',
  'holoscript-cdn', 'framework', 'linter', 'llm-provider', 'lsp', 'marketplace-agentkit',
  'marketplace-api', 'marketplace-web', 'mcp-server', 'mcp-server-adversarial', 'memory', 'mesh',
  'mvc-schema', 'partner-sdk', 'platform', 'preview-component', 'react-agent-sdk',
  'registry', 'secrets-broker', 'security-sandbox', 'snn-webgpu', 'spatial-index',
  'std', 'studio', 'studio-bridge', 'studio-plugin-sdk', 'studio-ui-graph',
  'tauri-app', 'uaal', 'ui', 'video-tutorials', 'visual', 'visualizer-client',
  'vscode-extension',
  'xr-embodiment',
];

// Packages with KNOWN pre-existing tsc errors as of the 2026-07-12 sweep (value = error count then).
// Tracked, NOT blocking. Most are test-file or tsconfig-include issues (see the sweep triage / the
// follow-up board task). Fix a package to zero, then MOVE it from STAGED into ENFORCED.
const STAGED = {
  cli: 42,
  'r3f-renderer': 73,
  runtime: 7,
};

function packagesWithTsconfig() {
  const dir = path.join(ROOT, 'packages');
  return fs
    .readdirSync(dir)
    .filter((n) => fs.existsSync(path.join(dir, n, 'tsconfig.json')))
    .sort();
}

function typecheck(pkg) {
  return new Promise((resolve) => {
    const cfg = path.join(ROOT, 'packages', pkg, 'tsconfig.json');
    if (!fs.existsSync(cfg)) {
      resolve({ pkg, ok: false, errors: 0, missing: true, out: `no tsconfig at ${cfg}` });
      return;
    }
    const child = spawn(process.execPath, [TSC, '--noEmit', '-p', cfg], { cwd: ROOT });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => child.kill(), 180000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const errors = (out.match(/error TS\d+/g) || []).length;
      resolve({ pkg, ok: code === 0, errors, out });
    });
  });
}

async function runMany(pkgs) {
  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < pkgs.length) {
      const pkg = pkgs[i++];
      const r = await typecheck(pkg);
      results.push(r);
      process.stdout.write(`${TAG} ${r.ok ? '✓' : '✗'} ${pkg}${r.ok ? '' : ` (${r.errors} error${r.errors === 1 ? '' : 's'})`}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pkgs.length) }, worker));
  return results.sort((a, b) => a.pkg.localeCompare(b.pkg));
}

async function main() {
  const argv = process.argv.slice(2);
  const onlyIdx = argv.indexOf('--package');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;

  if (argv.includes('--list')) {
    const all = new Set(packagesWithTsconfig());
    const enrolled = new Set([...ENFORCED, ...Object.keys(STAGED)]);
    const unenrolled = [...all].filter((p) => !enrolled.has(p));
    console.log(`ENFORCED (${ENFORCED.length}): ${ENFORCED.join(', ')}`);
    console.log(`\nSTAGED (${Object.keys(STAGED).length}): ${Object.entries(STAGED).map(([p, n]) => `${p}(${n})`).join(', ')}`);
    console.log(`\nUNENROLLED (${unenrolled.length}): ${unenrolled.join(', ') || '(none)'}`);
    return;
  }

  if (only) {
    const r = await typecheck(only);
    console.log(r.out.trim() || `${TAG} ${only}: clean`);
    process.exit(r.ok ? 0 : 1);
  }

  if (argv.includes('--staged')) {
    console.log(`${TAG} current error counts for STAGED packages (non-blocking):`);
    const results = await runMany(Object.keys(STAGED));
    for (const r of results) console.log(`  ${r.pkg}: ${r.ok ? '0 (READY to promote to ENFORCED)' : `${r.errors} errors`}`);
    return;
  }

  // --changed: type-check only the ENFORCED packages that have STAGED changes (the pre-commit path —
  // fast: 0 packages when a commit touches no enforced src). Errors block the commit.
  if (argv.includes('--changed')) {
    let staged = '';
    try {
      staged = (await import('node:child_process')).execSync('git diff --cached --name-only', { cwd: ROOT, encoding: 'utf8' });
    } catch {
      console.log(`${TAG} (git unavailable — skipping changed-package typecheck)`);
      return;
    }
    const enforcedSet = new Set(ENFORCED);
    const changed = [...new Set(
      staged.split(/\r?\n/)
        .map((f) => f.match(/^packages\/([^/]+)\//)?.[1])
        .filter((p) => p && enforcedSet.has(p))
    )];
    if (!changed.length) {
      console.log(`${TAG} ✓ no ENFORCED package has staged changes — nothing to type-check.`);
      return;
    }
    console.log(`${TAG} type-checking ${changed.length} changed ENFORCED package(s): ${changed.join(', ')}`);
    const results = await runMany(changed);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      console.error(`\n${TAG} ❌ FAIL — type error(s) in staged ENFORCED package(s):`);
      for (const r of failed) console.error(r.out.split(/\r?\n/).filter((l) => /error TS\d+/.test(l)).slice(0, 12).join('\n'));
      process.exit(1);
    }
    console.log(`${TAG} ✅ changed ENFORCED package(s) type-check clean.`);
    return;
  }

  // Default gate: ENFORCED must all pass. Also warn on unenrolled tsconfig packages.
  console.log(`${TAG} tsc --noEmit over ${ENFORCED.length} ENFORCED packages (${Object.keys(STAGED).length} staged, non-blocking)…`);
  const results = await runMany(ENFORCED);
  const failed = results.filter((r) => !r.ok);

  const all = new Set(packagesWithTsconfig());
  const enrolled = new Set([...ENFORCED, ...Object.keys(STAGED)]);
  const unenrolled = [...all].filter((p) => !enrolled.has(p));
  if (unenrolled.length) {
    console.warn(`\n${TAG} ⚠ ${unenrolled.length} tsconfig package(s) not enrolled in ENFORCED or STAGED — add them: ${unenrolled.join(', ')}`);
  }

  if (failed.length) {
    console.error(`\n${TAG} ❌ FAIL — ${failed.length} ENFORCED package(s) have type errors:`);
    for (const r of failed) {
      console.error(`\n${TAG} ── ${r.pkg} (${r.errors} error${r.errors === 1 ? '' : 's'}) ──`);
      console.error(r.out.split(/\r?\n/).filter((l) => /error TS\d+/.test(l)).slice(0, 20).join('\n'));
    }
    console.error(`\n${TAG} An ENFORCED package must type-check clean. Fix the errors above, or (only if the breakage is pre-existing and out of scope) move the package to STAGED with a tracking task.`);
    process.exit(1);
  }

  console.log(`\n${TAG} ✅ All ${ENFORCED.length} ENFORCED packages type-check clean.`);
}

main().catch((e) => {
  console.error(`${TAG} gate crashed:`, e?.message || e);
  process.exit(2);
});
