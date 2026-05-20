#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const script = join(repoRoot, 'scripts', 'robot-avatar-handoff-sim.mjs');
const tmpRoot = join(repoRoot, 'tmp', `robot-avatar-handoff-sim-${Date.now()}`);

let testsRun = 0;
let testsFailed = 0;

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  PASS ${name}`);
    return;
  }
  testsFailed += 1;
  console.error(`  FAIL ${name}`);
}

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
    return;
  }
  testsFailed += 1;
  console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

try {
  mkdirSync(tmpRoot, { recursive: true });
  const scenePath = join(tmpRoot, 'robot-avatar-test.holo');
  const thingPath = join(tmpRoot, 'robot-avatar-test.wot.json');
  const rowsPath = join(tmpRoot, 'rows.json');
  const receiptPath = join(tmpRoot, 'receipt.json');

  writeFileSync(
    scenePath,
    `composition "Robot Avatar Test" {
  object "RobotGripper" { geometry: "sphere" }
  object "AvatarHand" { geometry: "sphere" }
  object "Payload" { geometry: "cube" }
}
`,
  );

  writeFileSync(
    thingPath,
    `${JSON.stringify(
      {
        id: 'urn:test:ForceTorqueSensor',
        title: 'ForceTorqueSensor',
        properties: {
          action: { default: 'streamRobotReceipts' },
          observedProperty: { default: 'handoff_force_n' },
        },
        actions: {
          streamrobotreceipts: {
            forms: [{ href: 'http://localhost:8080/actions/streamrobotreceipts' }],
          },
        },
      },
      null,
      2,
    )}\n`,
  );

  const result = spawnSync(
    'node',
    [
      script,
      '--scene',
      scenePath,
      '--thing',
      thingPath,
      '--out',
      rowsPath,
      '--receipt-out',
      receiptPath,
      '--run-id',
      'robot-avatar-test',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assertEq(result.status, 0, 'sim exits 0');
  assertOk(existsSync(rowsPath), 'row output exists');
  assertOk(existsSync(receiptPath), 'receipt output exists');

  const rows = JSON.parse(readFileSync(rowsPath, 'utf8'));
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assertEq(rows.length, 3, 'three pipeline rows');
  assertEq(rows.filter((row) => row.status !== 'pass').length, 0, 'all rows pass');
  assertOk(rows.every((row) => row.signature_verified === true), 'row signatures verified');
  assertEq(receipt.replay.finalPayloadOwner, 'avatar', 'payload custody transfers to avatar');
  assertEq(receipt.scene.requiredObjectsPresent, true, 'scene contains required handoff objects');
  assertOk(receipt.receipts.robotReceipt.verified, 'robot receipt verifies');
  assertOk(receipt.receipts.avatarIkReceipt.verified, 'avatar IK receipt verifies');
  assertOk(receipt.receipts.payloadTransferReceipt.verified, 'payload transfer receipt verifies');
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
