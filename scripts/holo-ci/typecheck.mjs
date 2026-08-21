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
import { classifyTypecheckResult } from './typecheck-classify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const TAG = '[typecheck]';
const CONCURRENCY = 6;

// Packages whose src MUST type-check clean (`tsc --noEmit -p <pkg>/tsconfig.json` passes today,
// 2026-07-12 sweep). A tsc error in ANY of these fails the gate.
const ENFORCED = [
  'absorb-service',
  'adapter-postgres',
  'agent-protocol',
  'aibrittney',
  'animation-presets',
  'auth',
  'benchmark',
  'cli',
  'compiler-wasm',
  'connector-appstore',
  'connector-core',
  'connector-github',
  'connector-moltbook',
  'connector-railway',
  'connector-upstash',
  'connector-vscode',
  'core',
  'core-types',
  'crdt',
  'crdt-spatial',
  'create-holoscript',
  'engine',
  'formatter',
  'graphql-api',
  'holo-runtime',
  'holo-vm',
  'holoembed',
  'hologram-worker',
  'hololand-platform',
  'holomap',
  'holomesh-web',
  'holoscript',
  'holoscript-agent',
  'holoscript-cdn',
  'framework',
  'linter',
  'llm-provider',
  'lsp',
  'marketplace-agentkit',
  'marketplace-api',
  'marketplace-web',
  'mcp-server',
  'mcp-server-adversarial',
  'memory',
  'mesh',
  'mvc-schema',
  'partner-sdk',
  'platform',
  'preview-component',
  'react-agent-sdk',
  'r3f-renderer',
  'registry',
  'runtime',
  'secrets-broker',
  'security-sandbox',
  'snn-webgpu',
  'spatial-index',
  'std',
  'studio',
  'studio-bridge',
  'studio-plugin-sdk',
  'studio-ui-graph',
  'tauri-app',
  'uaal',
  'ui',
  'video-tutorials',
  'visual',
  'visualizer-client',
  'vscode-extension',
  'xr-embodiment',
];

// Packages with KNOWN pre-existing tsc errors as of the 2026-07-12 sweep (value = error count then).
// Tracked, NOT blocking. Most are test-file or tsconfig-include issues (see the sweep triage / the
// follow-up board task). Fix a package to zero, then MOVE it from STAGED into ENFORCED.
const STAGED = {};

function packagesWithTsconfig() {
  const dir = path.join(ROOT, 'packages');
  return fs
    .readdirSync(dir)
    .filter((n) => fs.existsSync(path.join(dir, n, 'tsconfig.json')))
    .sort();
}

// task_1784197589328_gywp: distinguish "tsc RAN and found N diagnostics" from "tsc could not be
// invoked at all" (e.g. missing node_modules/typescript -> MODULE_NOT_FOUND, or any other
// tooling-level crash). Both cases previously fell through to the same `errors: 0` shape, which
// printed as "(0 errors)" — indistinguishable from a genuinely clean package and FAILED anyway,
// costing an agent ~40min of false debugging chasing a "type error" that never existed. A
// tooling failure is `code !== 0` with ZERO parseable `error TS\d+` diagnostics in the combined
// stdout+stderr — that combination means the check never ran, not that it ran clean.
function typecheck(pkg) {
  return new Promise((resolve) => {
    const cfg = path.join(ROOT, 'packages', pkg, 'tsconfig.json');
    if (!fs.existsSync(cfg)) {
      resolve({
        pkg,
        ok: false,
        errors: 0,
        missing: true,
        toolingFailure: false,
        out: `no tsconfig at ${cfg}`,
      });
      return;
    }
    let out = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      out += '\n[typecheck] tsc timed out after 180s and was killed.';
      child.kill();
    }, 180000);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(process.execPath, [TSC, '--noEmit', '-p', cfg], { cwd: ROOT });
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    // spawn-level failure (e.g. process.execPath itself unresolvable) — belt-and-suspenders;
    // the far more common real-world case (missing TSC file) surfaces as a non-zero `close`
    // below, because node runs, fails to resolve the module, and prints to stderr.
    child.on('error', (err) => {
      finish({
        pkg,
        ok: false,
        errors: 0,
        toolingFailure: true,
        out: `${out}\n${err?.stack || err}`.trim(),
      });
    });
    child.on('close', (code) => {
      // tsc exited non-zero but produced no parseable diagnostics -> it never actually ran
      // (MODULE_NOT_FOUND, crashed, killed) rather than ran-and-found-nothing. Classification
      // lives in ./typecheck-classify.mjs so it is unit-testable without running this gate.
      finish({ pkg, ...classifyTypecheckResult(code, out), out });
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
      const suffix = r.ok
        ? ''
        : r.toolingFailure
          ? ' (TOOLING ERROR — tsc did not run, see below)'
          : ` (${r.errors} error${r.errors === 1 ? '' : 's'})`;
      process.stdout.write(`${TAG} ${r.ok ? '✓' : r.toolingFailure ? '⚠' : '✗'} ${pkg}${suffix}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pkgs.length) }, worker));
  return results.sort((a, b) => a.pkg.localeCompare(b.pkg));
}

// Shared "tsc could not run" reporter — prints the raw tooling output verbatim (never claims
// "(0 errors)") plus the likely repair. Returns nothing; caller still exits non-zero.
function reportToolingFailures(toolingFailed) {
  console.error(
    `\n${TAG} ❌ TYPECHECK COULD NOT RUN (tooling error) — ${toolingFailed.length} package(s) failed to invoke tsc at all. This is NOT "0 errors"; the check never executed:`
  );
  for (const r of toolingFailed) {
    console.error(`\n${TAG} ── ${r.pkg} (tooling failure, not a type error) ──`);
    console.error(r.out.trim().split(/\r?\n/).slice(0, 20).join('\n'));
  }
  console.error(
    `\n${TAG} tsc itself failed to run (missing/broken node_modules/typescript, MODULE_NOT_FOUND, crash, or timeout) — it did not report zero errors, it never checked anything.`
  );
  console.error(
    `${TAG} Likely fix: pnpm install --force (recreates missing node_modules/.bin shims), then re-run.`
  );
}

/**
 * Is this failure just "nobody ran the build yet"?
 *
 * Returns the list of workspace packages that are genuinely missing a build, or null.
 * Deliberately checks the FILESYSTEM rather than trusting the error text: a TS2307 naming
 * `@holoscript/core` proves only that tsc could not resolve it, which is equally what a
 * genuine broken import looks like. A package that is built and still unresolvable is a
 * real defect and must keep its full, noisy report.
 */
export function unbuiltWorkspaceDiagnosis(typeFailed) {
  const missing = new Map();
  let ts2307 = 0;
  let total = 0;
  for (const r of typeFailed) {
    for (const line of String(r.out || '').split(/\r?\n/u)) {
      if (!/error TS\d+/u.test(line)) continue;
      total += 1;
      const m = line.match(/error TS2307: Cannot find module '(@holoscript\/[^'\/]+)/u);
      if (!m) continue;
      ts2307 += 1;
      const name = m[1].replace(/^@holoscript\//u, '');
      missing.set(name, (missing.get(name) || 0) + 1);
    }
  }
  if (!total || !missing.size) return null;

  // Keep only the ones we can SEE are unbuilt.
  const unbuilt = [];
  for (const name of missing.keys()) {
    const dir = path.join(ROOT, 'packages', name);
    if (!fs.existsSync(dir)) continue;              // not a workspace package; not our story
    if (fs.existsSync(path.join(dir, 'dist'))) continue;  // built, so this TS2307 is real
    unbuilt.push(name);
  }
  if (!unbuilt.length) return null;

  const explained = unbuilt.reduce((n, name) => n + (missing.get(name) || 0), 0);
  // Only take over the report when this genuinely IS the story. Below the halfway mark the
  // real errors are the majority and must not be hidden behind a build instruction.
  if (explained * 2 < total) return null;
  return { unbuilt: unbuilt.sort(), explained, total };
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
    console.log(
      `\nSTAGED (${Object.keys(STAGED).length}): ${Object.entries(STAGED)
        .map(([p, n]) => `${p}(${n})`)
        .join(', ')}`
    );
    console.log(`\nUNENROLLED (${unenrolled.length}): ${unenrolled.join(', ') || '(none)'}`);
    return;
  }

  if (only) {
    const r = await typecheck(only);
    if (r.toolingFailure) {
      reportToolingFailures([r]);
      process.exit(1);
    }
    console.log(r.out.trim() || `${TAG} ${only}: clean`);
    process.exit(r.ok ? 0 : 1);
  }

  if (argv.includes('--staged')) {
    console.log(`${TAG} current error counts for STAGED packages (non-blocking):`);
    const results = await runMany(Object.keys(STAGED));
    for (const r of results)
      console.log(
        `  ${r.pkg}: ${r.ok ? '0 (READY to promote to ENFORCED)' : `${r.errors} errors`}`
      );
    return;
  }

  // --changed: type-check only the ENFORCED packages that have STAGED changes (the pre-commit path —
  // fast: 0 packages when a commit touches no enforced src). Errors block the commit.
  if (argv.includes('--changed')) {
    let staged = '';
    try {
      staged = (await import('node:child_process')).execSync('git diff --cached --name-only', {
        cwd: ROOT,
        encoding: 'utf8',
      });
    } catch {
      console.log(`${TAG} (git unavailable — skipping changed-package typecheck)`);
      return;
    }
    const enforcedSet = new Set(ENFORCED);
    const changed = [
      ...new Set(
        staged
          .split(/\r?\n/)
          .map((f) => f.match(/^packages\/([^/]+)\//)?.[1])
          .filter((p) => p && enforcedSet.has(p))
      ),
    ];
    if (!changed.length) {
      console.log(`${TAG} ✓ no ENFORCED package has staged changes — nothing to type-check.`);
      return;
    }
    console.log(
      `${TAG} type-checking ${changed.length} changed ENFORCED package(s): ${changed.join(', ')}`
    );
    const results = await runMany(changed);
    const failed = results.filter((r) => !r.ok);
    const toolingFailed = failed.filter((r) => r.toolingFailure);
    const typeFailed = failed.filter((r) => !r.toolingFailure);
    if (toolingFailed.length) reportToolingFailures(toolingFailed);
    if (typeFailed.length) {
      const unbuilt = unbuiltWorkspaceDiagnosis(typeFailed);
      if (unbuilt) {
        console.error(
          `\n${TAG} ❌ FAIL — the workspace is not built, so tsc cannot see the internal packages.`
        );
        console.error(
          `${TAG} ${unbuilt.explained} of ${unbuilt.total} error(s) are "Cannot find module" against workspace package(s) that have no dist/ on disk:`
        );
        console.error(`${TAG}   ${unbuilt.unbuilt.join(', ')}`);
        console.error(
          `${TAG} These are not defects. Every package here publishes only dist/ paths, and nothing`
        );
        console.error(
          `${TAG} builds on install, so a fresh checkout cannot type-check until you run:`
        );
        console.error(`${TAG}   pnpm build`);
        console.error(
          `${TAG} (Verified against the filesystem, not guessed from the message: a package that IS`
        );
        console.error(
          `${TAG}  built and still unresolvable is a real error and is reported in full below.)`
        );
      } else {
        console.error(`\n${TAG} ❌ FAIL — type error(s) in staged ENFORCED package(s):`);
        for (const r of typeFailed)
          console.error(
            r.out
              .split(/\r?\n/)
              .filter((l) => /error TS\d+/.test(l))
              .slice(0, 12)
              .join('\n')
          );
      }
    }
    if (failed.length) process.exit(1);
    console.log(`${TAG} ✅ changed ENFORCED package(s) type-check clean.`);
    return;
  }

  // Default gate: ENFORCED must all pass. Also warn on unenrolled tsconfig packages.
  console.log(
    `${TAG} tsc --noEmit over ${ENFORCED.length} ENFORCED packages (${Object.keys(STAGED).length} staged, non-blocking)…`
  );
  const results = await runMany(ENFORCED);
  const failed = results.filter((r) => !r.ok);

  const all = new Set(packagesWithTsconfig());
  const enrolled = new Set([...ENFORCED, ...Object.keys(STAGED)]);
  const unenrolled = [...all].filter((p) => !enrolled.has(p));
  if (unenrolled.length) {
    console.warn(
      `\n${TAG} ⚠ ${unenrolled.length} tsconfig package(s) not enrolled in ENFORCED or STAGED — add them: ${unenrolled.join(', ')}`
    );
  }

  if (failed.length) {
    const toolingFailed = failed.filter((r) => r.toolingFailure);
    const typeFailed = failed.filter((r) => !r.toolingFailure);
    if (toolingFailed.length) reportToolingFailures(toolingFailed);
    if (typeFailed.length) {
      console.error(
        `\n${TAG} ❌ FAIL — ${typeFailed.length} ENFORCED package(s) have type errors:`
      );
      for (const r of typeFailed) {
        console.error(`\n${TAG} ── ${r.pkg} (${r.errors} error${r.errors === 1 ? '' : 's'}) ──`);
        console.error(
          r.out
            .split(/\r?\n/)
            .filter((l) => /error TS\d+/.test(l))
            .slice(0, 20)
            .join('\n')
        );
      }
      console.error(
        `\n${TAG} An ENFORCED package must type-check clean. Fix the errors above, or (only if the breakage is pre-existing and out of scope) move the package to STAGED with a tracking task.`
      );
    }
    process.exit(1);
  }

  console.log(`\n${TAG} ✅ All ${ENFORCED.length} ENFORCED packages type-check clean.`);
}

main().catch((e) => {
  console.error(`${TAG} gate crashed:`, e?.message || e);
  process.exit(2);
});
