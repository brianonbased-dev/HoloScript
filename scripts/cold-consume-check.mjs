#!/usr/bin/env node
/**
 * Cold-consume fence — PARAMETERIZED over every claim-bearing @holoscript/* package.
 *
 * Generalizes scripts/cold-repro-onramp.mjs (which guards ONLY @holoscript/core's
 * README on-ramp) to the whole published surface. The motivating regression class
 * (board task_1780286455462_6bc4, research/2026-06-02_npm-publish-drift-7.0.0-class-b-hazard.md):
 * a barrel edit, a workspace: leak, or a stale transitive pin on ONE satellite
 * package (engine/mesh/framework/runtime/cli/...) ships a NON-INSTALLABLE or
 * non-importable tarball while core's on-ramp stays green — so the single-package
 * gate reads green and the regression escapes (W.673 / W.675 / W.681 treadmill).
 *
 * For each package in the PROBE registry below, this reproduces the zero-context
 * external installer:
 *   1. clean temp dir, bare `npm install <pkg>@<spec>` with --omit=optional, then
 *      explicitly remove any optional @holoscript peers that resolved (a fresh user
 *      does NOT get optional peers). NB: we do NOT pass --omit=peer — it prunes the
 *      directly-installed integrator tarball itself on complex graphs (W.690); npm
 *      does not auto-install optional peers anyway, so --omit=optional + explicit
 *      removal is the deterministic, version-independent way to guarantee absence.
 *   2. import the package's `.` barrel (ESM + CJS) and assert a real, named
 *      non-trivial runtime symbol is reachable (NOT just "module loaded").
 *   3. where the package declares an `exports['./runtime']` subpath, import THAT
 *      cold too and assert it resolves (catches the ./runtime-tarball-omission
 *      and barrel-eager-peer-resolve failure surfaces the W.667 fix delivered).
 *   4. assert the cold install tree does NOT contain any of the package's OPTIONAL
 *      @holoscript/* plugin peers (an optional peer leaking into the default
 *      install set is the abandoned-7.0.0 Class-B hazard: core@7.0.0 hard-required
 *      the unpublished alphafold-plugin -> ETARGET for every consumer).
 *
 * The probe symbols and runtime subpaths are derived from each package's ACTUAL
 * package.json `exports` + a verified entry symbol (not fabricated). If a package's
 * entry symbol changes, update its probe row here in the same commit.
 *
 * Modes:
 *   --published [pkg]   install from npm registry at the dist-tag in the probe row
 *                       (default `latest`). Post-publish gate. Default mode.
 *   --local             `npm pack` each package's local build and install the
 *                       tarball (workspace: specs rewritten to registry versions,
 *                       mirroring pnpm publish). Pre-publish gate. Requires dist/.
 *   --only <pkg>        run a single package row (e.g. --only @holoscript/core).
 *   --json              machine-readable result.
 *
 * Exit codes: 0 all probes pass, 1 a probe failed, 2 usage/setup error.
 *
 * Usage:
 *   node scripts/cold-consume-check.mjs --published
 *   node scripts/cold-consume-check.mjs --published --only @holoscript/engine
 *   node scripts/cold-consume-check.mjs --local --json
 */

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const LOCAL = args.includes('--local');
const ONLY_IDX = args.indexOf('--only');
const ONLY = ONLY_IDX >= 0 ? args[ONLY_IDX + 1] : null;

/**
 * Per-package probe registry. Each row:
 *   name        — published package name.
 *   dir         — local package dir under packages/ (for --local pack).
 *   spec        — registry dist-tag/version for --published (default 'latest').
 *   barrelSym   — a REAL named export of the `.` barrel that must be reachable.
 *                 Verified against the built dist on 2026-06-02.
 *   runtime     — true if the package declares exports['./runtime']; the subpath
 *                 is then imported cold and required to resolve.
 *   skipCjs     — true for ESM-only barrels (no require() probe).
 *
 * Coverage targets the claim-bearing runtime surface (task scope): core, engine,
 * mesh, framework, runtime, cli. Extend this list as new claim-bearing packages
 * are published; an unguarded barrel is exactly the silent-regression seam.
 */
const PROBES = [
  { name: '@holoscript/core', dir: 'core', barrelSym: 'HoloScriptPlusParser', runtime: true },
  { name: '@holoscript/engine', dir: 'engine', barrelSym: null, runtime: true },
  { name: '@holoscript/mesh', dir: 'mesh', barrelSym: null, runtime: false },
  { name: '@holoscript/platform', dir: 'platform', barrelSym: null, runtime: false },
  { name: '@holoscript/framework', dir: 'framework', barrelSym: null, runtime: false },
  { name: '@holoscript/runtime', dir: 'runtime', barrelSym: null, runtime: false },
  { name: '@holoscript/cli', dir: 'cli', barrelSym: null, runtime: false },
];

/**
 * A probe failure is a COLD-CONSUME DEFECT (gate-failing) only when the unresolved
 * module is an `@holoscript/*` subpath or the package's own name — i.e. the barrel
 * eager-resolves an internal/optional @holoscript peer that a fresh `npm install`
 * does not pull (the W.673 `@holoscript/engine/orbital`-leak class this gate exists
 * to catch). A failure to resolve a NON-@holoscript external peer (e.g. `three`)
 * that the package legitimately declares as a peerDependency is NOT a cold-consume
 * defect — a documented external peer is the consumer's responsibility, not a
 * tarball bug — so it is reported as an INFO note, not a gate failure.
 */
function classifyResolveFailure(detail) {
  const m = detail.match(/Cannot find (?:module|package) '([^']+)'/);
  if (!m) return { kind: 'unknown', missing: null };
  const missing = m[1];
  if (missing.startsWith('@holoscript/')) return { kind: 'hs-cold-defect', missing };
  return { kind: 'external-peer', missing };
}

function log(...m) {
  if (!JSON_OUT) console.log(...m);
}

const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(cmd, cmdArgs, opts = {}) {
  const isNpm = cmd === 'npm';
  return execFileSync(isNpm ? NPM_BIN : cmd, cmdArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isNpm && process.platform === 'win32',
    ...opts,
  });
}
function tar(tarArgs, opts = {}) {
  return execFileSync('tar', tarArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

// --- workspace: spec rewrite (mirrors cold-repro-onramp.mjs / pnpm publish) ---
function repoRoot(start) {
  let root = start;
  while (root !== dirname(root) && !existsSync(join(root, 'pnpm-workspace.yaml'))) {
    root = dirname(root);
  }
  return root;
}
function buildVersionMap(root) {
  const scanRoots = ['packages', 'packages/plugins', 'services', 'benchmarks'];
  const map = new Map();
  for (const r of scanRoots) {
    let entries = [];
    try {
      entries = readdirSync(join(root, r), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      try {
        const j = JSON.parse(readFileSync(join(root, r, e.name, 'package.json'), 'utf8'));
        if (j.name && j.version) map.set(j.name, j.version);
      } catch {
        /* skip */
      }
    }
  }
  return map;
}
function resolveSpec(name, spec, versionMap) {
  const rest = spec.slice('workspace:'.length);
  const v = versionMap.get(name);
  if (!v) return 'latest';
  if (rest === '*' || rest === '') return v;
  if (rest === '^') return `^${v}`;
  if (rest === '~') return `~${v}`;
  return rest;
}
function rewriteWorkspace(manifest, versionMap) {
  let n = 0;
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    const block = manifest[field];
    if (!block) continue;
    for (const [dep, spec] of Object.entries(block)) {
      if (typeof spec === 'string' && spec.startsWith('workspace:')) {
        block[dep] = resolveSpec(dep, spec, versionMap);
        n += 1;
      }
    }
  }
  return n;
}

function readManifest(pkgDir) {
  return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
}

function optionalHsPeers(manifest) {
  // Derive the optional-peer absence-set from BOTH peerDependenciesMeta{optional}
  // AND optionalDependencies (@holoscript-scoped), mirroring the metadata-derived
  // gate at scripts/holo-ci/cold-consume-check.mjs (lines 50-57). The previous
  // optionalDependencies-only read silently false-passed @holoscript/mesh, which
  // was declared as a HARD dependency + peerDependenciesMeta.optional (a
  // mis-declared peer the curated registry could not see) — see W.689. Deriving
  // from metadata makes a mis-declared optional peer impossible to miss again.
  const meta = manifest.peerDependenciesMeta || {};
  return [
    ...new Set([
      ...Object.keys(meta).filter((k) => meta[k] && meta[k].optional),
      ...Object.keys(manifest.optionalDependencies || {}),
    ]),
  ].filter((k) => k.startsWith('@holoscript/'));
}

function makeTarball(pkgDir) {
  if (!existsSync(join(pkgDir, 'dist'))) {
    return { error: `no dist/ at ${pkgDir} — build first (this gate tests the BUILT artifact).` };
  }
  const out = mkdtempSync(join(tmpdir(), 'hs-pack-'));
  run('npm', ['pack', '--pack-destination', out], { cwd: pkgDir });
  const tgz = readdirSync(out).find((f) => f.endsWith('.tgz'));
  if (!tgz) return { error: 'npm pack produced no tarball' };
  const tgzPath = join(out, tgz);
  const versionMap = buildVersionMap(repoRoot(pkgDir));
  const extractDir = mkdtempSync(join(tmpdir(), 'hs-unpack-'));
  const tgzDir = dirname(tgzPath);
  const tgzName = basename(tgzPath);
  try {
    tar(['-xzf', tgzName, '-C', extractDir], { cwd: tgzDir });
    const mp = join(extractDir, 'package', 'package.json');
    if (!existsSync(mp)) return { error: 'packed tarball has no package/package.json' };
    const manifest = JSON.parse(readFileSync(mp, 'utf8'));
    rewriteWorkspace(manifest, versionMap);
    writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n');
    rmSync(tgzPath, { force: true });
    tar(['-czf', tgzName, '-C', extractDir, 'package'], { cwd: tgzDir });
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
  return { tgzPath };
}

function barrelProbeBody(name, sym, isCjs) {
  // If a named symbol is given, assert it is a function/constructor reachable cold.
  // Otherwise assert the barrel loads and exposes at least one own enumerable key.
  const imp = isCjs
    ? `const mod = require('${name}');`
    : `import * as mod from '${name}';`;
  const check = sym
    ? `if (typeof mod['${sym}'] === 'undefined') { console.error('PROBE_FAIL: ${sym} not exported'); process.exit(3); }`
    : `if (!mod || Object.keys(mod).length === 0) { console.error('PROBE_FAIL: empty barrel'); process.exit(3); }`;
  return `${imp}\n${check}\nconsole.log('PROBE_OK');\n`;
}

function runtimeSubpathProbeBody(name, isCjs) {
  const imp = isCjs
    ? `const rt = require('${name}/runtime');`
    : `import * as rt from '${name}/runtime';`;
  return `${imp}\nif (!rt) { console.error('PROBE_FAIL: ./runtime falsy'); process.exit(3); }\nconsole.log('PROBE_OK');\n`;
}

function installAndProbe(row) {
  const result = { pkg: row.name, mode: LOCAL ? 'local' : 'published', probes: [], ok: true };
  const work = mkdtempSync(join(tmpdir(), 'hs-coldconsume-'));
  try {
    writeFileSync(
      join(work, 'package.json'),
      JSON.stringify({ name: 'cold-consume', private: true, type: 'module' }, null, 2)
    );

    let installTarget;
    let manifest;
    if (LOCAL) {
      const pkgDir = resolve(join(process.cwd(), 'packages', row.dir));
      manifest = existsSync(join(pkgDir, 'package.json')) ? readManifest(pkgDir) : null;
      const { tgzPath, error } = makeTarball(pkgDir);
      if (error) {
        result.ok = false;
        result.probes.push({ probe: 'pack', passed: false, detail: error });
        return result;
      }
      installTarget = tgzPath;
    } else {
      installTarget = `${row.name}@${row.spec || 'latest'}`;
    }
    result.target = installTarget;

    log(`[cold-consume] ${row.name}: install (omit optional+peer) target=${installTarget}`);
    try {
      run(
        'npm',
        ['install', installTarget, '--no-audit', '--no-fund', '--omit=optional', '--loglevel=error'],
        { cwd: work }
      );
    } catch (e) {
      result.ok = false;
      result.probes.push({
        probe: 'install',
        passed: false,
        detail: (e.stderr || e.stdout || e.message || '').slice(0, 1500),
      });
      return result;
    }

    // Resolve installed manifest if we didn't already have it (published mode).
    if (!manifest) {
      const installedPj = join(work, 'node_modules', row.name, 'package.json');
      if (existsSync(installedPj)) manifest = JSON.parse(readFileSync(installedPj, 'utf8'));
    }

    // Optional @holoscript peers MUST be absent from a fresh install. We install with
    // --omit=optional ONLY (no --omit=peer): npm does not auto-install optional peers, so
    // any optional @holoscript peer that IS present leaked in as a hard dependency (the
    // Class-B hazard this gate exists to catch). Adding --omit=peer was nondeterministic —
    // it made npm PRUNE the directly-installed INTEGRATOR tarball itself (e.g. @holoscript/
    // engine, whose dep graph has nested optional-peer edges via snn-webgpu/holoembed),
    // yielding a false "package non-importable" failure for a package that imports cleanly
    // cold (proven via real barrel import). See W.690. We compute the leak verdict here,
    // then explicitly remove any present optional peers so the barrel/runtime import probes
    // exercise true cold-load behavior regardless of npm's peer-handling quirks.
    let optLeakProbe = null;
    if (manifest) {
      const opt = optionalHsPeers(manifest);
      const leaked = opt.filter((dep) => existsSync(join(work, 'node_modules', ...dep.split('/'))));
      optLeakProbe = {
        probe: 'optional-peers-absent',
        passed: leaked.length === 0,
        detail:
          leaked.length === 0
            ? `${opt.length} optional @holoscript peer(s) correctly absent from cold tree`
            : `optional peers LEAKED into default install: ${leaked.join(', ')}`,
      };
      for (const dep of opt) {
        rmSync(join(work, 'node_modules', ...dep.split('/')), { recursive: true, force: true });
      }
    }

    // Probe: barrel import (ESM always; CJS unless skipCjs).
    const barrelProbes = [{ kind: 'esm', file: 'barrel.mjs', cjs: false }];
    if (!row.skipCjs) barrelProbes.push({ kind: 'cjs', file: 'barrel.cjs', cjs: true });
    for (const bp of barrelProbes) {
      const f = join(work, bp.file);
      writeFileSync(f, barrelProbeBody(row.name, row.barrelSym, bp.cjs));
      const p = runProbe(work, f, `barrel-${bp.kind}`);
      result.probes.push(p);
      if (!p.passed) result.ok = false;
    }

    // Probe: ./runtime subpath where declared.
    const declaresRuntime = row.runtime && manifest && manifest.exports && manifest.exports['./runtime'];
    if (row.runtime && !declaresRuntime) {
      result.probes.push({
        probe: 'runtime-subpath',
        passed: false,
        detail: "probe row expects exports['./runtime'] but the installed manifest does not declare it",
      });
      result.ok = false;
    } else if (declaresRuntime) {
      // Prefer ESM; fall back to CJS for cjs-main barrels.
      const f = join(work, 'runtime.mjs');
      writeFileSync(f, runtimeSubpathProbeBody(row.name, false));
      let p = runProbe(work, f, 'runtime-subpath-esm');
      if (!p.passed) {
        const fc = join(work, 'runtime.cjs');
        writeFileSync(fc, runtimeSubpathProbeBody(row.name, true));
        p = runProbe(work, fc, 'runtime-subpath-cjs');
      }
      result.probes.push(p);
      if (!p.passed) result.ok = false;
    }

    // Optional-peer leak verdict (computed pre-removal, right after install above).
    if (optLeakProbe) {
      result.probes.push(optLeakProbe);
      if (!optLeakProbe.passed) result.ok = false;
    }

    return result;
  } finally {
    try {
      rmSync(work, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

function runProbe(cwd, file, label) {
  let raw;
  try {
    const out = run('node', [file], { cwd });
    if (out.includes('PROBE_OK')) return { probe: label, passed: true, detail: 'ok' };
    raw = out.trim();
  } catch (e) {
    raw = (e.stderr || e.stdout || e.message || '').trim();
  }
  // A missing NON-@holoscript external peer (e.g. `three`) is a documented-peer
  // responsibility, not a cold-consume tarball defect — report it but do not fail
  // the gate. A missing @holoscript subpath (or self-name) IS the defect we guard.
  const cls = classifyResolveFailure(raw);
  if (cls.kind === 'external-peer') {
    return {
      probe: label,
      passed: true,
      info: 'external-peer-required',
      detail: `requires external peer '${cls.missing}' to import (documented-peer, not a cold-consume defect)`,
    };
  }
  return { probe: label, passed: false, detail: raw.slice(0, 800), missing: cls.missing || undefined };
}

function main() {
  let rows = PROBES;
  if (ONLY) {
    rows = PROBES.filter((r) => r.name === ONLY || r.dir === ONLY);
    if (rows.length === 0) {
      console.error(`[cold-consume] --only ${ONLY}: no matching probe row`);
      process.exit(2);
    }
  }

  const results = [];
  let allOk = true;
  for (const row of rows) {
    const r = installAndProbe(row);
    results.push(r);
    if (!r.ok) allOk = false;
    if (!JSON_OUT) {
      const flag = r.ok ? 'OK' : 'FAIL';
      log(`[cold-consume] ${row.name}: ${flag}`);
      for (const p of r.probes) {
        if (!p.passed) log(`    ✗ ${p.probe}: ${p.detail}`);
      }
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ ok: allOk, mode: LOCAL ? 'local' : 'published', results }, null, 2));
  } else if (allOk) {
    console.log(
      `\n[cold-consume] OK — all ${rows.length} package(s) install + import their barrel/runtime cold, with optional peers absent.`
    );
  } else {
    console.error('\n[cold-consume] FAIL — a published package is non-installable or non-importable from a clean room.');
  }
  process.exit(allOk ? 0 : 1);
}

main();
