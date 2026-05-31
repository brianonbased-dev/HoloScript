#!/usr/bin/env node
/**
 * Cold-repro on-ramp gate — the RUNTIME falsifier.
 *
 * `audit-published-install-tree.mjs` proves the published dependency graph is
 * *installable* (no workspace: leaks, no phantom version pins). It does NOT
 * prove the package actually *imports and runs* once installed. Those are
 * different failure surfaces:
 *
 *   - install-tree audit  → catches EUNSUPPORTEDPROTOCOL / ETARGET (defects 1+2
 *     of board task task_1780123308264_6991, now fixed on @holoscript/core@latest)
 *   - THIS gate           → catches the ERR_MODULE_NOT_FOUND that fires when the
 *     public barrel eager-resolves an OPTIONAL peer (e.g. @holoscript/engine) so
 *     the README's documented first-use crashes for a fresh installer who has
 *     only run `npm install @holoscript/core`.
 *
 * This reproduces the zero-context external agent: a clean temp dir, a bare
 * install of ONLY the package under test (no optional peers, no dev tree), then
 * it executes the EXACT snippet the published README documents. If the README
 * on-ramp does not run, the public product is non-functional regardless of how
 * green the internal receipts are (W.667: internal validation green != external
 * reality).
 *
 * Modes:
 *   --published [spec]   pack/install from the npm registry (default
 *                        @holoscript/core@latest). Use as the post-publish gate.
 *   --local [pkgDir]     `npm pack` the local build (default packages/core) and
 *                        install the tarball. Use as the PRE-publish gate so a
 *                        broken on-ramp never ships. Requires a built dist/.
 *
 * The README contract under test (packages/core/README.md, verified 2026-05-31):
 *   import { HoloScriptPlusParser } from '@holoscript/core';
 *   const parser = new HoloScriptPlusParser();
 *   const result = parser.parse(source);
 *
 * Exit codes: 0 on-ramp runs, 1 on-ramp broken, 2 usage/setup error.
 *
 * Usage:
 *   node scripts/cold-repro-onramp.mjs --published
 *   node scripts/cold-repro-onramp.mjs --published @holoscript/core@7.0.0
 *   node scripts/cold-repro-onramp.mjs --local
 *   node scripts/cold-repro-onramp.mjs --local packages/core --json
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
import { join, resolve, isAbsolute, dirname, basename } from 'node:path';

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const LOCAL = args.includes('--local');
const PUBLISHED = args.includes('--published') || !LOCAL;
const positional = args.filter((a) => !a.startsWith('--'));

const PKG_NAME = '@holoscript/core';
const DEFAULT_SPEC = `${PKG_NAME}@latest`;

function log(...m) {
  if (!JSON_OUT) console.log(...m);
}
function fail(reason, detail) {
  if (JSON_OUT) {
    console.log(JSON.stringify({ ok: false, reason, detail }, null, 2));
  } else {
    console.error(`\n[cold-repro-onramp] FAIL — ${reason}`);
    if (detail) console.error(detail);
    console.error(
      '\n[cold-repro-onramp] The README on-ramp does not run from a clean install. ' +
        'The public product is non-functional from the documented path.'
    );
  }
  process.exit(1);
}

// On Windows, npm is npm.cmd and is not directly spawnable without a shell;
// resolve the platform-correct binary and run npm via shell so PATH applies.
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

// The exact README first-use snippet (ESM + CJS), kept in lockstep with
// packages/core/README.md. If the README entry symbol changes, change it here too.
const PROBE_ESM = `
import { HoloScriptPlusParser } from '${PKG_NAME}';
const parser = new HoloScriptPlusParser();
const result = parser.parse('orb#myOrb { position: [0, 0, 0] }');
if (!result) { console.error('PROBE_FAIL: parse returned falsy'); process.exit(3); }
console.log('PROBE_OK_ESM');
`;

const PROBE_CJS = `
const { HoloScriptPlusParser } = require('${PKG_NAME}');
const parser = new HoloScriptPlusParser();
const result = parser.parse('orb#myOrb { position: [0, 0, 0] }');
if (!result) { console.error('PROBE_FAIL: parse returned falsy'); process.exit(3); }
console.log('PROBE_OK_CJS');
`;

// `tar` is available on every supported platform: GNU tar on Linux/macOS,
// bsdtar (`tar.exe`, System32) on Windows 10 1803+. Both honor -xzf / -czf and
// the `package/` prefix npm uses. We shell out rather than vendoring a tar
// implementation so the gate stays dependency-free.
//
// IMPORTANT: GNU tar parses the `-f` archive argument as a remote `host:path`
// when it contains a colon before a slash, so an absolute Windows path like
// `C:\tmp\x.tgz` is misread as host `C` ("Cannot connect to C:"). bsdtar has no
// such behavior. To work under EITHER tar, callers pass the archive as a bare
// basename and set `cwd` to its directory — the `-C <dir>` operand is never
// subject to host:path parsing, so it may stay absolute.
function tar(tarArgs, opts = {}) {
  return execFileSync('tar', tarArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

// Mirror `pnpm publish`'s workspace→semver rewrite so a fresh installer sees the
// SAME specs the registry would. Without this, `npm pack` keeps `workspace:*` in
// the tarball's package.json and `npm install <tarball>` dies with
// EUNSUPPORTEDPROTOCOL before the barrel is ever imported — making `--local`
// useless as a pre-publish falsifier (board task task_1780207572551_ax8w).
function buildWorkspaceVersionMap(pkgDir) {
  // Walk up to the monorepo root (the dir holding pnpm-workspace.yaml).
  let root = pkgDir;
  while (root !== dirname(root) && !existsSync(join(root, 'pnpm-workspace.yaml'))) {
    root = dirname(root);
  }
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
      const pj = join(root, r, e.name, 'package.json');
      try {
        const j = JSON.parse(readFileSync(pj, 'utf8'));
        if (j.name && j.version) map.set(j.name, j.version);
      } catch {
        /* skip unreadable/partial manifests */
      }
    }
  }
  return map;
}

function resolveWorkspaceSpec(name, spec, versionMap) {
  // spec is e.g. "workspace:*" | "workspace:^" | "workspace:~" | "workspace:1.2.3"
  const rest = spec.slice('workspace:'.length);
  const version = versionMap.get(name);
  if (!version) {
    // Unknown internal pkg: it can only be an --omit'd optional/peer here (a
    // regular dep would already be in the map). Drop the unresolvable protocol
    // so npm can parse the manifest; the dep is omitted from the install set.
    return 'latest';
  }
  if (rest === '*' || rest === '') return version;
  if (rest === '^') return `^${version}`;
  if (rest === '~') return `~${version}`;
  return rest; // explicit range, e.g. workspace:>=1.0.0 — strip the prefix only
}

function rewriteWorkspaceSpecs(manifest, versionMap) {
  const fields = [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'devDependencies',
  ];
  let rewrites = 0;
  for (const field of fields) {
    const block = manifest[field];
    if (!block) continue;
    for (const [dep, spec] of Object.entries(block)) {
      if (typeof spec === 'string' && spec.startsWith('workspace:')) {
        block[dep] = resolveWorkspaceSpec(dep, spec, versionMap);
        rewrites += 1;
      }
    }
  }
  return rewrites;
}

function makeTarball(pkgDirArg) {
  const pkgDir = resolve(
    pkgDirArg || join(process.cwd(), 'packages', 'core')
  );
  if (!existsSync(join(pkgDir, 'package.json'))) {
    fail('setup-error', `no package.json at ${pkgDir}`);
  }
  if (!existsSync(join(pkgDir, 'dist'))) {
    fail(
      'setup-error',
      `no dist/ at ${pkgDir} — run \`pnpm --filter @holoscript/core build\` first ` +
        `(this gate tests the BUILT artifact, not source).`
    );
  }
  const out = mkdtempSync(join(tmpdir(), 'hs-pack-'));
  log(`[cold-repro-onramp] packing local build: ${pkgDir}`);
  run('npm', ['pack', '--pack-destination', out], { cwd: pkgDir });
  const tgz = readdirSync(out).find((f) => f.endsWith('.tgz'));
  if (!tgz) fail('setup-error', 'npm pack produced no tarball');
  const tgzPath = join(out, tgz);

  // Rewrite workspace: specs inside the packed tarball to simulate the publish
  // rewrite, so `npm install <tarball>` resolves deps from the registry exactly
  // as a fresh public installer would.
  const versionMap = buildWorkspaceVersionMap(pkgDir);
  const extractDir = mkdtempSync(join(tmpdir(), 'hs-unpack-'));
  const tgzDir = dirname(tgzPath);
  const tgzName = basename(tgzPath);
  try {
    // basename + cwd: keep the `-f` arg colon-free for GNU tar (see tar() note).
    tar(['-xzf', tgzName, '-C', extractDir], { cwd: tgzDir });
    const manifestPath = join(extractDir, 'package', 'package.json');
    if (!existsSync(manifestPath)) {
      fail('setup-error', 'packed tarball has no package/package.json');
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const rewrites = rewriteWorkspaceSpecs(manifest, versionMap);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    log(
      `[cold-repro-onramp] rewrote ${rewrites} workspace: spec(s) → registry versions ` +
        `(simulating the publish rewrite)`
    );
    // Repack in place over the original tarball name (basename + cwd, as above).
    rmSync(tgzPath, { force: true });
    tar(['-czf', tgzName, '-C', extractDir, 'package'], { cwd: tgzDir });
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      fail(
        'setup-error',
        'the `tar` binary was not found on PATH — required to rewrite workspace: ' +
          'specs in the packed tarball (Windows 10 1803+ ships tar.exe in System32).'
      );
    }
    throw e;
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
  return tgzPath;
}

function main() {
  const work = mkdtempSync(join(tmpdir(), 'hs-coldrepro-'));
  try {
    writeFileSync(
      join(work, 'package.json'),
      JSON.stringify({ name: 'cold-repro', private: true, type: 'module' }, null, 2)
    );

    let installTarget;
    let mode;
    if (LOCAL) {
      mode = 'local';
      const tgz = makeTarball(positional[0]);
      installTarget = isAbsolute(tgz) ? tgz : resolve(tgz);
    } else {
      mode = 'published';
      installTarget = positional[0] || DEFAULT_SPEC;
    }

    log(`[cold-repro-onramp] mode=${mode} target=${installTarget}`);
    log('[cold-repro-onramp] clean install (NO optional peers, NO dev tree)...');
    try {
      // --omit=optional / --omit=peer is the whole point: a fresh user who runs
      // `npm install @holoscript/core` does NOT get optional peers. If the barrel
      // needs one to merely import, this is where it breaks.
      run(
        'npm',
        [
          'install',
          installTarget,
          '--no-audit',
          '--no-fund',
          '--omit=optional',
          '--omit=peer',
          '--loglevel=error',
        ],
        { cwd: work }
      );
    } catch (e) {
      fail('install-failed', (e.stderr || e.stdout || e.message || '').slice(0, 2000));
    }

    const probes = [
      { name: 'esm', file: 'probe.mjs', body: PROBE_ESM, marker: 'PROBE_OK_ESM' },
      { name: 'cjs', file: 'probe.cjs', body: PROBE_CJS, marker: 'PROBE_OK_CJS' },
    ];
    const results = [];
    for (const p of probes) {
      const probePath = join(work, p.file);
      writeFileSync(probePath, p.body);
      try {
        const out = run('node', [probePath], { cwd: work });
        const passed = out.includes(p.marker);
        results.push({ probe: p.name, passed, output: out.trim() });
        log(`[cold-repro-onramp] ${p.name} probe: ${passed ? 'OK' : 'FAIL'}`);
        if (!passed) {
          fail('probe-bad-output', `${p.name} probe did not print ${p.marker}:\n${out}`);
        }
      } catch (e) {
        const detail = (e.stderr || e.stdout || e.message || '').slice(0, 2000);
        results.push({ probe: p.name, passed: false, output: detail });
        log(`[cold-repro-onramp] ${p.name} probe: FAIL`);
        fail('probe-crashed', `${p.name} probe crashed:\n${detail}`);
      }
    }

    if (JSON_OUT) {
      console.log(JSON.stringify({ ok: true, mode, target: installTarget, results }, null, 2));
    } else {
      console.log(
        `\n[cold-repro-onramp] OK — the README on-ramp imports and runs from a clean install (${mode}: ${installTarget}).`
      );
    }
    process.exit(0);
  } finally {
    try {
      rmSync(work, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

main();
