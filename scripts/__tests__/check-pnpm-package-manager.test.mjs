#!/usr/bin/env node
/**
 * Regression tests for scripts/check-pnpm-package-manager.mjs and the Codex
 * hardware pnpm shim. The guard must fail fast before a non-pinned global pnpm
 * can normalize the lockfile.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = resolve(REPO_ROOT, 'scripts', 'check-pnpm-package-manager.mjs');
const HARDWARE_PATH_SCRIPT = resolve(REPO_ROOT, 'scripts', 'codex-hardware-path.ps1');

let testsRun = 0;
let testsFailed = 0;

console.log('check-pnpm-package-manager.test.mjs');

{
  const root = setup('pnpm@9.15.9');
  try {
    const result = run(root, {
      npm_config_user_agent: 'pnpm/9.15.9 node/v24.15.0 win32 x64',
    });
    assertEq(result.code, 0, 'matching active pnpm passes');
    assertMatch(result.out, /active pnpm 9\.15\.9 matches packageManager/u, 'prints matching pnpm');
  } finally {
    cleanup(root);
  }
}

{
  const root = setup('pnpm@9.15.9');
  try {
    const result = run(root, {
      npm_config_user_agent: 'pnpm/11.7.0 node/v24.15.0 win32 x64',
    });
    assertEq(result.code, 1, 'mismatched active pnpm fails');
    assertMatch(
      result.out,
      /active pnpm 11\.7\.0 does not match packageManager pnpm@9\.15\.9/u,
      'names mismatch'
    );
    assertMatch(result.out, /corepack pnpm/u, 'suggests Corepack pnpm');
  } finally {
    cleanup(root);
  }
}

{
  const root = setup('pnpm@9.15.9');
  try {
    const result = run(root, { npm_config_user_agent: '' });
    assertEq(result.code, 0, 'no lifecycle user agent can pass without probes');
    assertMatch(
      result.out,
      /lifecycle enforcement was not applicable/u,
      'documents no active user agent'
    );
  } finally {
    cleanup(root);
  }
}

{
  const root = setup('pnpm@9.15.9');
  const bin = setupBin({ corepack: '9.15.9', pnpm: '9.15.9' });
  try {
    const result = run(
      root,
      {
        npm_config_user_agent: '',
      },
      { skipProbes: false, pathPrepend: bin }
    );
    assertEq(result.code, 0, 'matching Corepack and bare pnpm probes pass');
    assertMatch(
      result.out,
      /corepack pnpm 9\.15\.9 matches packageManager/u,
      'names matching Corepack'
    );
    assertMatch(result.out, /bare pnpm 9\.15\.9 also matches/u, 'names matching bare pnpm');
  } finally {
    cleanup(root);
    cleanup(bin);
  }
}

{
  const root = setup('pnpm@9.15.9');
  const bin = setupBin({ corepack: '9.15.9', pnpm: '11.7.0' });
  try {
    const result = run(
      root,
      {
        npm_config_user_agent: 'pnpm/9.15.9 node/v24.15.0 win32 x64',
      },
      { skipProbes: false, pathPrepend: bin }
    );
    assertEq(result.code, 1, 'mismatched bare pnpm probe fails');
    assertMatch(
      result.out,
      /bare pnpm resolves 11\.7\.0, expected 9\.15\.9/u,
      'names bad bare pnpm'
    );
    assertMatch(result.out, /plain `pnpm` delegates through Corepack/u, 'explains shim repair');
  } finally {
    cleanup(root);
    cleanup(bin);
  }
}

{
  const script = readFileSync(HARDWARE_PATH_SCRIPT, 'utf8');
  assertMatch(
    script,
    /call "\$CorepackCmd" pnpm %\*/u,
    'Windows pnpm shim delegates through Corepack'
  );
  assertMatch(
    script,
    /exec "\$CorepackCmdSh" pnpm "`\$@"/u,
    'POSIX pnpm shim delegates through Corepack'
  );
  assertNotMatch(script, /\$PnpmCmd/u, 'shim no longer delegates to global pnpm');
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);

function setup(packageManager) {
  const root = mkdtempSync(join(tmpdir(), 'pnpm-package-manager-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager }, null, 2));
  return root;
}

function setupBin(versions) {
  const bin = mkdtempSync(join(tmpdir(), 'pnpm-package-manager-bin-'));
  writeFileSync(join(bin, 'corepack.cmd'), `@echo off\r\necho ${versions.corepack}\r\n`);
  writeFileSync(join(bin, 'pnpm.cmd'), `@echo off\r\necho ${versions.pnpm}\r\n`);

  writeFileSync(join(bin, 'corepack'), `#!/usr/bin/env sh\necho "${versions.corepack}"\n`);
  writeFileSync(join(bin, 'pnpm'), `#!/usr/bin/env sh\necho "${versions.pnpm}"\n`);
  chmodSync(join(bin, 'corepack'), 0o755);
  chmodSync(join(bin, 'pnpm'), 0o755);

  return bin;
}

function run(root, env, options = {}) {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const childEnv = {
    ...process.env,
    ...env,
  };
  if (options.skipProbes !== false) {
    childEnv.HOLOSCRIPT_PNPM_GUARD_SKIP_PROBES = '1';
  } else {
    delete childEnv.HOLOSCRIPT_PNPM_GUARD_SKIP_PROBES;
  }
  if (options.pathPrepend) {
    childEnv[pathKey] = `${options.pathPrepend}${delimiter}${childEnv[pathKey] || ''}`;
  }

  const result = spawnSync(process.execPath, [SCRIPT, '--root', root], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: childEnv,
  });
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

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

function assertNotMatch(text, pattern, name) {
  testsRun += 1;
  if (!pattern.test(text)) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: unexpected ${pattern} found in:\n${text}`);
  }
}
