#!/usr/bin/env node
/**
 * Regression tests for HoloKey -> Railway deploy-plane bridge.
 *
 * Run: node scripts/__tests__/holokey-railway-sync.test.mjs
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRailwayBootstrapSyncPlan,
  registryCredentialPasswordFinding,
} from '../lib/holokey-railway-bridge.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'holokey-railway-sync.mjs');

let testsRun = 0;
let testsFailed = 0;

function assert(condition, name, detail = '') {
  testsRun += 1;
  if (condition) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
}

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      RAILWAY_TOKEN: '',
      RAILWAY_API_TOKEN: '',
      DATABASE_URL: '',
      HOLOKEY_DATABASE_URL: '',
    },
  });
}

console.log('holokey-railway-sync.test.mjs');

{
  const result = run(['--self-test']);
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assert(result.status === 0, '--self-test exits 0', output);
  assert(/self-test passed/.test(output), '--self-test reports pass', output);
  assert(!output.includes('boot-token-super-secret'), '--self-test does not leak token', output);
}

{
  const result = run(['--json', '--service', 'mcp-server']);
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assert(result.status === 0, 'plan exits 0 without Railway credentials', output);
  const parsed = JSON.parse(result.stdout);
  assert(parsed.secretValuesIncluded === false, 'plan declares no secret values');
  assert(parsed.count === 1, 'plan filters to one service');
  assert(
    parsed.plan[0].ownerId === 'infra://service/098119b1-7832-4788-9ab2-3ced6c1cd2ab',
    'plan owner matches Railway service id',
    parsed.plan[0].ownerId
  );
  assert(
    parsed.plan[0].railwayVariableName === 'HOLOKEY_SERVICE_IDENTITY_TOKEN',
    'plan uses the single bootstrap variable'
  );
}

{
  const plan = buildRailwayBootstrapSyncPlan([
    {
      name: 'studio',
      serviceId: '55a18466-6702-4497-ad22-5856f4f196f3',
      projectId: '45da3535-e14d-4022-a57e-1e5a96ee48d0',
      environmentId: '9cccd9a6-12e3-483f-b382-dba1efbb229d',
    },
  ]);
  assert(
    plan[0].holokeyRef === 'vault:HOLOKEY_SERVICE_IDENTITY_TOKEN',
    'plan resolves from HoloKey'
  );
  assert(
    plan[0].railwayReference === '${HOLOKEY_SERVICE_IDENTITY_TOKEN}',
    'plan exposes env reference'
  );
}

{
  assert(
    registryCredentialPasswordFinding(
      { username: 'x-access-token', password: '${{shared.REGISTRY_TOKEN}}' },
      'HoloScript/mcp-server'
    ) === null,
    'registryCredentials allow Railway shared reference'
  );
  assert(
    registryCredentialPasswordFinding(
      { username: 'x-access-token', password: '{"sealed":"railway-managed"}' },
      'HoloScript/mcp-server'
    ) === null,
    'registryCredentials allow sealed value'
  );
  const finding = registryCredentialPasswordFinding(
    { username: 'x-access-token', password: 'plain-password' },
    'HoloScript/mcp-server'
  );
  assert(
    finding?.scope === 'HoloScript/mcp-server',
    'registryCredentials reject plaintext password'
  );
  assert(
    !JSON.stringify(finding).includes('plain-password'),
    'registryCredentials finding redacts plaintext'
  );
}

if (testsFailed > 0) {
  console.error(`\nFAIL ${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}

console.log(`\nPASS ${testsRun} assertions`);
