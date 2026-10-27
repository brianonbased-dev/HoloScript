#!/usr/bin/env node
/**
 * Regression test for scripts/holo-ci/cd-railway.mjs registryCredentials gate.
 *
 * The deploy script must fail closed before `railway up` when latest deployment
 * metadata contains plaintext registryCredentials.password. The script's
 * --self-test fixture exercises that collector without a Railway token or network.
 *
 * It also covers assertStudioReplicaShipGate: studio must not deploy unless the studio replica
 * ship gate passes (spawn is injected; nothing real is run), and resolvePnpmEntry: the gate runs
 * `process.execPath <pnpm .cjs entry>` with no shell, never the pnpm .cmd shim.
 *
 * Run: node scripts/__tests__/cd-railway-secret-gate.test.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STUDIO_SHIP_GATE_SCRIPT,
  assertStudioReplicaShipGate,
  resolvePnpmEntry,
} from '../holo-ci/cd-railway.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'holo-ci', 'cd-railway.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertMatch(text, pattern, name) {
  testsRun += 1;
  if (pattern.test(text)) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: ${pattern} not found in output:\n${text}`);
  }
}

console.log('cd-railway-secret-gate.test.mjs');

{
  const result = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      RAILWAY_TOKEN: '',
      RAILWAY_API_TOKEN: '',
    },
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assertEq(result.status, 0, '--self-test exits 0 without Railway credentials');
  assertMatch(
    output,
    /registryCredentials gate self-test passed/,
    'self-test exercises registryCredentials gate'
  );
}

// --- assertStudioReplicaShipGate -------------------------------------------------------------

function assertThrowsRefusing(fn, pattern, name) {
  testsRun += 1;
  try {
    fn();
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected a throw, none happened`);
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/^REFUSING DEPLOY/.test(msg) && pattern.test(msg)) {
      console.log(`  PASS ${name}`);
    } else {
      testsFailed += 1;
      console.error(`  FAIL ${name}: wrong error: ${msg}`);
    }
  }
}

function makeSpawn(result) {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return result;
  };
  return { spawn, calls };
}

const FAKE_ENTRY = join(tmpdir(), 'fake-pnpm', 'pnpm.cjs');
const fakeEntry = () => ({ entry: FAKE_ENTRY, source: 'test' });

const STUDIO = { name: 'studio', id: 'studio-id' };
const MCP = { name: 'mcp-server', id: 'mcp-id' };

// Temp repo roots hold only a fake packages/studio/package.json; each dir is created here and
// removed here, by exact path.
const tmpRoots = [];
function fakeRepo(scripts) {
  const root = mkdtempSync(join(tmpdir(), 'cd-railway-ship-gate-'));
  tmpRoots.push(root);
  if (scripts) {
    mkdirSync(join(root, 'packages', 'studio'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'studio', 'package.json'),
      JSON.stringify({ name: '@holoscript/studio', scripts })
    );
  }
  return root;
}
const withShip = () => fakeRepo({ [STUDIO_SHIP_GATE_SCRIPT]: 'tsx check --require-env' });

try {
  {
    const root = withShip();
    const { spawn, calls } = makeSpawn({ status: 1 });
    assertThrowsRefusing(
      () =>
        assertStudioReplicaShipGate([STUDIO], { spawn, repoRoot: root, resolveEntry: fakeEntry }),
      /exit 1/,
      'ship gate refuses studio deploy on exit 1'
    );
    assertEq(calls.length, 1, 'ship gate ran the check once');
    assertEq(
      calls[0].cmd,
      process.execPath,
      'ship gate runs node (process.execPath), not a pnpm shim'
    );
    assertEq(
      calls[0].args[0],
      FAKE_ENTRY,
      'ship gate passes pnpm JS entry as the first node argument'
    );
    assertEq(
      calls[0].args.slice(1).join(' '),
      '--filter @holoscript/studio run desktop-signin:replicas:check:ship',
      'ship gate runs the studio :ship script'
    );
    assertEq(calls[0].opts.shell === true, false, 'ship gate never sets shell: true');
    assertEq(calls[0].opts.shell, false, 'ship gate spawns without a shell');
  }
  {
    const root = withShip();
    const { spawn } = makeSpawn({ status: null, error: new Error('spawn pnpm ENOENT') });
    assertThrowsRefusing(
      () =>
        assertStudioReplicaShipGate([STUDIO], { spawn, repoRoot: root, resolveEntry: fakeEntry }),
      /spawn error.*ENOENT/,
      'ship gate refuses studio deploy on spawn error'
    );
  }
  {
    const root = withShip();
    const { spawn } = makeSpawn({ status: null, signal: 'SIGKILL' });
    assertThrowsRefusing(
      () =>
        assertStudioReplicaShipGate([STUDIO], { spawn, repoRoot: root, resolveEntry: fakeEntry }),
      /signal SIGKILL/,
      'ship gate refuses studio deploy when the check is killed by a signal'
    );
  }
  {
    const root = withShip();
    const { spawn, calls } = makeSpawn({ status: 0 });
    assertEq(
      assertStudioReplicaShipGate([MCP, STUDIO], {
        spawn,
        repoRoot: root,
        resolveEntry: fakeEntry,
      }),
      true,
      'ship gate allows studio deploy on exit 0'
    );
    assertEq(calls.length, 1, 'ship gate ran once when studio is one of several targets');
  }
  {
    const { spawn, calls } = makeSpawn({ status: 1 });
    assertEq(
      assertStudioReplicaShipGate([MCP], {
        spawn,
        repoRoot: fakeRepo(null),
        resolveEntry: fakeEntry,
      }),
      false,
      'ship gate is skipped when studio is not targeted'
    );
    assertEq(calls.length, 0, 'ship gate does not spawn when studio is not targeted');
  }
  {
    // Fail closed while the :ship script has not landed (sign-in PR not on main yet).
    const { spawn, calls } = makeSpawn({ status: 0 });
    assertThrowsRefusing(
      () =>
        assertStudioReplicaShipGate([STUDIO], {
          spawn,
          repoRoot: fakeRepo({ build: 'next build' }),
          resolveEntry: fakeEntry,
        }),
      /no "desktop-signin:replicas:check:ship" script/,
      'ship gate refuses studio deploy when the :ship script is absent'
    );
    assertThrowsRefusing(
      () =>
        assertStudioReplicaShipGate([STUDIO], {
          spawn,
          repoRoot: fakeRepo(null),
          resolveEntry: fakeEntry,
        }),
      /no "desktop-signin:replicas:check:ship" script/,
      'ship gate refuses studio deploy when package.json is unreadable'
    );
    assertEq(calls.length, 0, 'ship gate does not spawn when the :ship script is absent');
  }

  // --- resolvePnpmEntry: no real filesystem for pnpm, everything injected -------------------
  {
    const pnpmCjs = join(tmpdir(), 'pnpm-home', 'bin', 'pnpm.cjs');
    const exists = (p) => p === pnpmCjs;
    const r = resolvePnpmEntry({ env: { npm_execpath: pnpmCjs }, exists });
    assertEq(r.entry, pnpmCjs, 'resolver uses npm_execpath when it points at pnpm.cjs');
    assertEq(r.source, 'npm_execpath', 'resolver reports npm_execpath as the source');
  }
  {
    // A .cmd shim is never used; with no corepack pin available the resolver refuses.
    const cmdShim = join(tmpdir(), 'pnpm-home', 'pnpm.cmd');
    assertThrowsRefusing(
      () =>
        resolvePnpmEntry({
          env: { npm_execpath: cmdShim },
          exists: () => true,
          readText: () => '{}',
        }),
      /not a pnpm \.cjs\/\.js file/,
      'resolver refuses a pnpm .cmd shim as the entry'
    );
    assertThrowsRefusing(
      () =>
        resolvePnpmEntry({
          env: { npm_execpath: join(tmpdir(), 'npm-cli.js') },
          exists: () => true,
          readText: () => '{}',
        }),
      /not a pnpm \.cjs\/\.js file/,
      'resolver refuses a non-pnpm npm_execpath (npm-cli.js)'
    );
  }
  {
    const missing = join(tmpdir(), 'pnpm-home', 'gone', 'pnpm.cjs');
    assertThrowsRefusing(
      () =>
        resolvePnpmEntry({
          env: { npm_execpath: missing },
          exists: () => false,
          readText: () => JSON.stringify({ packageManager: 'pnpm@9.15.9' }),
          platform: 'win32',
          home: join(tmpdir(), 'home'),
        }),
      /does not exist.*corepack has no pnpm@9\.15\.9/,
      'resolver refuses when the pnpm entry is missing everywhere'
    );
    assertThrowsRefusing(
      () => resolvePnpmEntry({ env: {}, exists: () => true, readText: () => '{}' }),
      /no readable "packageManager"/,
      'resolver refuses when there is no npm_execpath and no packageManager pin'
    );
    assertThrowsRefusing(
      () => resolvePnpmEntry({ env: {}, exists: () => true, readText: () => 'not json' }),
      /no readable "packageManager"/,
      'resolver refuses when package.json is unreadable'
    );
  }
  {
    // Fallback: corepack's pnpm for the pinned version, even when npm_execpath is a .cmd shim.
    const corepackRoot = join(tmpdir(), 'corepack-home');
    const expected = join(corepackRoot, 'v1', 'pnpm', '9.15.9', 'bin', 'pnpm.cjs');
    const r = resolvePnpmEntry({
      env: { npm_execpath: join(tmpdir(), 'pnpm.cmd'), COREPACK_HOME: corepackRoot },
      exists: (p) => p === expected,
      readText: () => JSON.stringify({ packageManager: 'pnpm@9.15.9+sha512.abc' }),
    });
    assertEq(r.entry, expected, 'resolver falls back to corepack pnpm at the pinned version');
    assertEq(extname(r.entry), '.cjs', 'corepack fallback is a .cjs file, not a shim');
    const win = resolvePnpmEntry({
      env: { LOCALAPPDATA: join(tmpdir(), 'lad') },
      platform: 'win32',
      exists: () => true,
      readText: () => JSON.stringify({ packageManager: 'pnpm@9.15.9' }),
    });
    assertEq(
      win.entry,
      join(tmpdir(), 'lad', 'node', 'corepack', 'v1', 'pnpm', '9.15.9', 'bin', 'pnpm.cjs'),
      'corepack fallback uses the LOCALAPPDATA cache on win32'
    );
  }
  {
    // End to end through the gate with the real resolver on a temp repo: the gate spawns
    // process.execPath with the resolved .cjs, and shell is never true.
    const root = withShip();
    const entryDir = mkdtempSync(join(tmpdir(), 'cd-railway-pnpm-'));
    tmpRoots.push(entryDir);
    const entry = join(entryDir, 'pnpm.cjs');
    writeFileSync(entry, '// fake pnpm entry');
    const prev = process.env.npm_execpath;
    process.env.npm_execpath = entry;
    try {
      const { spawn, calls } = makeSpawn({ status: 0 });
      assertEq(
        assertStudioReplicaShipGate([STUDIO], { spawn, repoRoot: root }),
        true,
        'gate passes through the real resolver with npm_execpath set'
      );
      assertEq(calls[0].cmd, process.execPath, 'real resolver path spawns process.execPath');
      assertEq(calls[0].args[0], entry, 'real resolver path passes the resolved pnpm.cjs');
      assertEq(calls[0].opts.shell, false, 'real resolver path spawns without a shell');
    } finally {
      if (prev === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = prev;
    }
  }
  {
    // Unresolvable pnpm refuses before anything is spawned, with the clear message.
    const root = withShip();
    const { spawn, calls } = makeSpawn({ status: 0 });
    assertThrowsRefusing(
      () =>
        assertStudioReplicaShipGate([STUDIO], {
          spawn,
          repoRoot: root,
          resolveEntry: () => resolvePnpmEntry({ env: {}, repoRoot: root, exists: () => false }),
        }),
      /cannot locate pnpm's JS entry/,
      'gate refuses with a clear message when pnpm cannot be resolved'
    );
    assertEq(calls.length, 0, 'gate does not spawn when pnpm cannot be resolved');
  }
} finally {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`\nFAIL ${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}
console.log(`\nPASS ${testsRun} assertions`);
