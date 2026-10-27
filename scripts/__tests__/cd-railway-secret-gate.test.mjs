#!/usr/bin/env node
/**
 * Regression test for scripts/holo-ci/cd-railway.mjs registryCredentials gate.
 *
 * The deploy script must fail closed before `railway up` when latest deployment
 * metadata contains plaintext registryCredentials.password. The script's
 * --self-test fixture exercises that collector without a Railway token or network.
 *
 * It also covers assertStudioReplicaShipGate: studio must not deploy unless the studio replica
 * ship gate passes (spawn is injected; nothing real is run).
 *
 * Run: node scripts/__tests__/cd-railway-secret-gate.test.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUDIO_SHIP_GATE_SCRIPT, assertStudioReplicaShipGate } from '../holo-ci/cd-railway.mjs';

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
      () => assertStudioReplicaShipGate([STUDIO], { spawn, repoRoot: root }),
      /exit 1/,
      'ship gate refuses studio deploy on exit 1'
    );
    assertEq(calls.length, 1, 'ship gate ran the check once');
    assertEq(calls[0].cmd, 'pnpm', 'ship gate runs pnpm');
    assertEq(
      calls[0].args.join(' '),
      '--filter @holoscript/studio run desktop-signin:replicas:check:ship',
      'ship gate runs the studio :ship script'
    );
    assertEq(calls[0].opts.shell, false, 'ship gate spawns without a shell');
  }
  {
    const root = withShip();
    const { spawn } = makeSpawn({ status: null, error: new Error('spawn pnpm ENOENT') });
    assertThrowsRefusing(
      () => assertStudioReplicaShipGate([STUDIO], { spawn, repoRoot: root }),
      /spawn error.*ENOENT/,
      'ship gate refuses studio deploy on spawn error'
    );
  }
  {
    const root = withShip();
    const { spawn } = makeSpawn({ status: null, signal: 'SIGKILL' });
    assertThrowsRefusing(
      () => assertStudioReplicaShipGate([STUDIO], { spawn, repoRoot: root }),
      /signal SIGKILL/,
      'ship gate refuses studio deploy when the check is killed by a signal'
    );
  }
  {
    const root = withShip();
    const { spawn, calls } = makeSpawn({ status: 0 });
    assertEq(
      assertStudioReplicaShipGate([MCP, STUDIO], { spawn, repoRoot: root }),
      true,
      'ship gate allows studio deploy on exit 0'
    );
    assertEq(calls.length, 1, 'ship gate ran once when studio is one of several targets');
  }
  {
    const { spawn, calls } = makeSpawn({ status: 1 });
    assertEq(
      assertStudioReplicaShipGate([MCP], { spawn, repoRoot: fakeRepo(null) }),
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
        }),
      /no "desktop-signin:replicas:check:ship" script/,
      'ship gate refuses studio deploy when the :ship script is absent'
    );
    assertThrowsRefusing(
      () => assertStudioReplicaShipGate([STUDIO], { spawn, repoRoot: fakeRepo(null) }),
      /no "desktop-signin:replicas:check:ship" script/,
      'ship gate refuses studio deploy when package.json is unreadable'
    );
    assertEq(calls.length, 0, 'ship gate does not spawn when the :ship script is absent');
  }
} finally {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`\nFAIL ${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}
console.log(`\nPASS ${testsRun} assertions`);
