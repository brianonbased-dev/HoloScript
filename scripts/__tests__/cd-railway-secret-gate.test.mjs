#!/usr/bin/env node
/**
 * Regression test for scripts/holo-ci/cd-railway.mjs registryCredentials gate.
 *
 * The deploy script must fail closed before `railway up` when latest deployment
 * metadata contains plaintext registryCredentials.password. The script's
 * --self-test fixture exercises that collector without a Railway token or network.
 *
 * Run: node scripts/__tests__/cd-railway-secret-gate.test.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

if (testsFailed > 0) {
  console.error(`\nFAIL ${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}
console.log(`\nPASS ${testsRun} assertions`);
