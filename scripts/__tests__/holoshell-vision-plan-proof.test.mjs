import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  buildVisionPlanProof,
  parseArgs,
  runSelfTest,
  VISION_PLAN_PROOF_SCHEMA,
} from '../holoshell-vision-plan-proof.mjs';

const NODE = process.execPath;
const SCRIPT = resolve('scripts/holoshell-vision-plan-proof.mjs');
const CREATED_AT = '2026-06-24T00:00:00.000Z';

// -- parseArgs --

assert.throws(() => parseArgs(['--screenshot', '--intent', 'test']),
  /target-app/, '--screenshot without --target-app must throw');

assert.throws(() => parseArgs([]),
  /intent/, 'no --intent must throw');

const parsedSelfTest = parseArgs(['--self-test']);
assert.ok(parsedSelfTest.selfTest);
assert.ok(parsedSelfTest.intent); // default intent injected

const parsedNormal = parseArgs(['--intent', 'click the Save button']);
assert.equal(parsedNormal.intent, 'click the Save button');
assert.equal(parsedNormal.screenshot, false);

// -- buildVisionPlanProof (synthetic image, self-test mode — no Ollama call) --

const proof = await buildVisionPlanProof({
  intent: 'Identify UI elements and suggest a click target.',
  selfTest: true,
  createdAt: CREATED_AT,
});

assert.equal(proof.schemaVersion, VISION_PLAN_PROOF_SCHEMA);
assert.ok(proof.proofId, 'proofId must be set');
assert.ok(proof.imageHash, 'imageHash must be set');
assert.equal(proof.imageSource.kind, 'synthetic_png_2x2');
assert.equal(proof.imageSource.founderScreenUntouched, true);
assert.equal(proof.safetyInvariants.founderScreenUntouched, true);
assert.equal(proof.safetyInvariants.executionPerformed, false);
assert.equal(proof.safetyInvariants.destructiveActionsTaken, false);
assert.equal(proof.safetyInvariants.desktopAutomationExecuted, false);
assert.equal(proof.ollamaCallAttempted, false, 'self-test must not call Ollama');
assert.equal(proof.receiptRequired, true);
assert.ok(proof.prompt.includes('Intent:'), 'prompt must embed intent');
assert.ok(proof.imageSizeBytes > 0, 'imageSizeBytes must be positive');

// -- stability: same inputs produce same proofId --
const proof2 = await buildVisionPlanProof({
  intent: 'Identify UI elements and suggest a click target.',
  selfTest: true,
  createdAt: CREATED_AT,
});
assert.equal(proof.proofId, proof2.proofId, 'proofId must be stable for same inputs');
assert.equal(proof.imageHash, proof2.imageHash, 'imageHash must be stable');

// -- different intent → different proofId --
const proof3 = await buildVisionPlanProof({
  intent: 'Open the file menu.',
  selfTest: true,
  createdAt: CREATED_AT,
});
assert.notEqual(proof.proofId, proof3.proofId, 'different intent must yield different proofId');

// -- runSelfTest --
const selfTestResult = await runSelfTest({ createdAt: CREATED_AT });
assert.equal(selfTestResult.schemaVersion, VISION_PLAN_PROOF_SCHEMA);
assert.equal(selfTestResult.imageSource.kind, 'synthetic_png_2x2');
assert.equal(selfTestResult.safetyInvariants.founderScreenUntouched, true);

// -- CLI --self-test --
const cliSelfTest = JSON.parse(execFileSync(NODE, [
  SCRIPT, '--self-test', '--json',
], { encoding: 'utf8' }));
assert.equal(cliSelfTest.schemaVersion, VISION_PLAN_PROOF_SCHEMA);
assert.equal(cliSelfTest.imageSource.kind, 'synthetic_png_2x2');
assert.equal(cliSelfTest.safetyInvariants.founderScreenUntouched, true);
assert.equal(cliSelfTest.safetyInvariants.executionPerformed, false);
assert.equal(cliSelfTest.safetyInvariants.destructiveActionsTaken, false);

console.log('holoshell-vision-plan-proof tests passed.');
