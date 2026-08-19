#!/usr/bin/env node
/* global console, process */

// Executed negative control for gate-truth audit finding A1/3.12
// (research/2026-07-27_model-village-gate-truth-audit.md): the audit proved
// that before the fix in source/proofs/model-village-phase0b-behavior.hsplus,
// calling freeze_run then contribute_water still mutated world state - the
// emergency-stop guard existed only in the unexecuted production policy
// (source/domains/agents/model-village-experiment.hsplus:886), never in the
// bounded behavior the bridge actually executes.
//
// This test runs the SAME executed behavior source through the same
// cli.runHeadlessExperimentSources entrypoint scripts/model-village-canonical-
// lifecycle.mjs:809 uses (not the higher-level scripts/model-village-phase0b-
// runtime.mjs tracer, which hardcodes contribute_water's expected outcome in
// signedActionFromPlan and cannot express a denied contribute_water at all -
// itself an instance of the audit's C1 finding, open-outcome receipts don't
// exist). freeze_run then contribute_water, and requires a receipted denial
// with zero world mutation, proven by an unchanged public-state hash across
// the action - not merely an `allowed:false` field a future regression could
// silently stop checking.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');

function resolveHoloScriptCliPath(root) {
  const candidate = process.env.HOLOSCRIPT_ROOT
    ? path.resolve(process.env.HOLOSCRIPT_ROOT)
    : path.resolve(root, '..', 'HoloScript');
  const cliPath = path.join(candidate, 'packages', 'cli', 'dist', 'index.js');
  if (!existsSync(cliPath)) {
    throw new Error(
      `HoloScript CLI build is unavailable at ${candidate}; `
      + 'set HOLOSCRIPT_ROOT to the built HoloScript repository',
    );
  }
  return cliPath;
}

const cli = await import(pathToFileURL(resolveHoloScriptCliPath(repoRoot)).href);
assert.equal(
  typeof cli.runHeadlessExperimentSources,
  'function',
  'HoloScript CLI is missing runHeadlessExperimentSources',
);

const worldSource = readFileSync(
  path.join(repoRoot, 'source/proofs/model-village-phase0b-world.holo'),
  'utf8',
);
const behaviorSource = readFileSync(
  path.join(repoRoot, 'source/proofs/model-village-phase0b-behavior.hsplus'),
  'utf8',
);

const plan = [
  {
    clock: { endTick: 1, startTick: 0, step: 1 },
    expected: {
      actionCount: 2,
      finalPublicState: {
        acceptedActionCount: 0,
        emergencyStopState: 'triggered',
        phase: 'frozen',
        publicWaterUnits: 2,
      },
      observationCount: 0,
      scheduleCount: 2,
    },
    kind: 'manifest',
    publicStateKeys: ['acceptedActionCount', 'emergencyStopState', 'phase', 'publicWaterUnits'],
    runId: 'mv-phase0b-negctrl-001',
    schema: 'holoscript.headless-experiment-plan.v1',
    seed: 'mv-phase0b-negctrl-seed-001',
  },
  {
    args: { reason: 'operator_emergency_stop' },
    authorization: {
      decisionReceiptId: 'mv-phase0b-negctrl-stop-decision-01',
      nonce: 'mv-phase0b-negctrl-stop-auth-01',
      safetyReceiptId: 'mv-phase0b-negctrl-stop-safety-01',
      sequence: 0,
      turnOpportunityId: 'mv-phase0b-negctrl-stop-turn-01',
    },
    entrypoint: 'freeze_run',
    kind: 'action',
    order: 0,
    phase: 'emergency_stop',
    scheduleEntryId: 'mv-phase0b-negctrl-stop-01',
    targetIds: ['EmergencyStop'],
    tick: 0,
  },
  {
    args: {
      capturedResponseHash: 'a'.repeat(64),
      challengeManifestHash: 'b'.repeat(64),
      metricSpecHash: 'c'.repeat(64),
      parsedProposal: 'contribute_water:commons_cistern:1',
      residentId: 'resident-01',
    },
    authorization: {
      decisionReceiptId: 'mv-phase0b-negctrl-decision-01',
      nonce: 'mv-phase0b-negctrl-auth-01',
      safetyReceiptId: 'mv-phase0b-negctrl-safety-01',
      sequence: 1,
      turnOpportunityId: 'mv-phase0b-negctrl-turn-01',
    },
    entrypoint: 'contribute_water',
    kind: 'action',
    order: 1,
    phase: 'action_admission',
    scheduleEntryId: 'mv-phase0b-negctrl-action-01',
    targetIds: ['VillageCommons'],
    tick: 1,
  },
];

const planSource = `export function main(): string { return '${JSON.stringify(plan).replaceAll("'", "\\'")}' }\n`;

const run = await cli.runHeadlessExperimentSources({
  behaviorSource,
  planSource,
  worldSource,
  observer: 'off',
});

assert.equal(run.execution.actionLedger.length, 2, 'expected two executed actions');

const [stopEntry, attemptEntry] = run.execution.actionLedger;

assert.equal(stopEntry.payload.entrypoint, 'freeze_run');
assert.equal(stopEntry.payload.allowed, true);
assert.equal(stopEntry.payload.result.worldMutationAllowed, false);

assert.equal(attemptEntry.payload.entrypoint, 'contribute_water');
assert.equal(
  attemptEntry.payload.allowed,
  false,
  'contribute_water must be denied once the run is frozen',
);
assert.equal(attemptEntry.payload.outcome, 'blocked_emergency_stop_triggered');

// The load-bearing assertion: not just "allowed:false" (a field a future
// regression could stop checking) but that the ACTION PRODUCED ZERO WORLD
// MUTATION - the pre- and post-action public-state hashes are identical.
assert.equal(
  attemptEntry.payload.stateChanged,
  false,
  'a denied contribute_water must not change public state',
);
assert.equal(
  attemptEntry.payload.prePublicStateHash,
  attemptEntry.payload.postPublicStateHash,
  'a denied contribute_water must leave the public-state hash unchanged',
);

const finalPublicState = run.execution.publicStateSnapshots.at(-1)?.payload?.publicState;
assert.deepEqual(finalPublicState, {
  acceptedActionCount: 0,
  emergencyStopState: 'triggered',
  phase: 'frozen',
  publicWaterUnits: 2,
});

console.log('emergency-stop negative control: freeze_run then contribute_water denied, zero world mutation, hash-verified');
