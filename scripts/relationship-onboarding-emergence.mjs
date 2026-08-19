#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.relationship-onboarding-emergence.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_OUTPUT = path.join('.tmp', 'relationship-onboarding-emergence', 'latest.json');
const SOURCE_ANCHORS = {
  contract: 'source/domains/emergence/relationship-onboarding-emergence.hsplus',
  stageSurface: 'source/layers/vr/frontier/shard-0/relationship-onboarding-stage-surface.holo',
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    output: DEFAULT_OUTPUT,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.output = argv[++index] || DEFAULT_OUTPUT;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') {
      args.selfTest = true;
      args.output = path.join('.tmp', 'relationship-onboarding-emergence', 'self-test.json');
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Relationship onboarding emergence receipt

Usage:
  node scripts/relationship-onboarding-emergence.mjs --self-test
  node scripts/relationship-onboarding-emergence.mjs --json

Options:
  --output <path>  Receipt output path. Defaults to ${DEFAULT_OUTPUT}
  --json           Print the receipt JSON.
  --self-test      Run fixture assertions.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function atomicWrite(filePath, text) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.${process.pid}.${Date.now().toString(36)}.${crypto
    .randomBytes(4)
    .toString('hex')}.tmp`;
  writeFileSync(tempPath, text, 'utf8');
  renameSync(tempPath, resolved);
  return resolved;
}

function writeJson(filePath, data) {
  return atomicWrite(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function computeLearningProgress({ lossBefore, lossAfter }) {
  return Math.max(0, lossBefore - lossAfter);
}

export function computeEmergenceCredit({ learningProgress, qualifyingReceiptVerified }) {
  return qualifyingReceiptVerified ? Math.max(0, learningProgress) : 0;
}

export function computeThresholdProgress(previousThresholdProgress, emergenceCredit) {
  return Math.max(
    clamp01(previousThresholdProgress),
    clamp01(previousThresholdProgress + Math.max(0, emergenceCredit))
  );
}

export function chooseEmergenceStage({ thresholdProgress, custody }) {
  if (custody?.downloadable && custody?.custodyScore === 1 && custody?.exportFidelity >= 0.95) {
    return 'S3_MANIFESTED_DOWNLOADABLE';
  }
  if (thresholdProgress >= 0.75) return 'S2_THRESHOLD';
  if (thresholdProgress > 0) return 'S1_LEARNING';
  return 'S0_DORMANT';
}

export function buildFamilyStageSurface({ thresholdProgress, stage }) {
  return {
    economyVisible: false,
    displayMetric: 'threshold_progress',
    displayNumber: thresholdProgress,
    copyLane: 'your_soul_learned_this_week',
    stage,
    custodyPromptVisible: stage === 'S3_MANIFESTED_DOWNLOADABLE',
  };
}

export function buildCreatorSurface() {
  return {
    economyVisible: true,
    earningsStatus: 'ACCRUED',
    founderGatedPayout: true,
  };
}

function sortedNumbers(values) {
  return values
    .filter((value) => Number.isFinite(value))
    .slice()
    .sort((a, b) => a - b);
}

export function kolmogorovSmirnovDistance(aValues, bValues) {
  const a = sortedNumbers(aValues);
  const b = sortedNumbers(bValues);
  if (a.length === 0 || b.length === 0) return 1;
  const support = Array.from(new Set([...a, ...b])).sort((x, y) => x - y);
  let i = 0;
  let j = 0;
  let distance = 0;
  for (const value of support) {
    while (i < a.length && a[i] <= value) i += 1;
    while (j < b.length && b[j] <= value) j += 1;
    distance = Math.max(distance, Math.abs(i / a.length - j / b.length));
  }
  return distance;
}

export function runCompulsiveUseFalsifier({
  hololandSessionMinutes,
  extractiveGameSessionMinutes,
  similarityThreshold = 0.12,
}) {
  const ksDistance = kolmogorovSmirnovDistance(
    hololandSessionMinutes,
    extractiveGameSessionMinutes
  );
  return {
    claim: 'non_extractive_by_construction',
    metric: 'session_length_distribution_similarity',
    ksDistance,
    similarityThreshold,
    falsified: ksDistance <= similarityThreshold,
  };
}

export function buildEmergenceCreditReceipt(input) {
  const learningProgress = computeLearningProgress(input.heldOut);
  const emergenceCredit = computeEmergenceCredit({
    learningProgress,
    qualifyingReceiptVerified: input.qualifyingReceipt.verified,
  });
  const thresholdProgress = computeThresholdProgress(
    input.previousThresholdProgress,
    emergenceCredit
  );
  const stage = chooseEmergenceStage({ thresholdProgress, custody: input.custody });
  const compulsiveUse = runCompulsiveUseFalsifier(input.compulsiveUseFalsifier);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: input.generatedAt || new Date().toISOString(),
    sourceAnchors: SOURCE_ANCHORS,
    receiptId: input.receiptId,
    interactionId: input.interactionId,
    familyId: input.familyId,
    soulId: input.soulId,
    fieldCheckpoint: {
      checkpointId: input.heldOut.frozenCheckpointId,
      frozenBeforeInteraction: input.heldOut.frozenBeforeInteraction === true,
      heldOutSliceId: input.heldOut.heldOutSliceId,
      futureInteractionWindow: input.heldOut.futureInteractionWindow,
      provenanceIndependent: input.heldOut.provenanceIndependent === true,
    },
    qualifyingReceipt: input.qualifyingReceipt,
    measurements: {
      learningProgress,
      emergenceCredit,
      thresholdProgress,
    },
    stage,
    familySurface: buildFamilyStageSurface({ thresholdProgress, stage }),
    creatorSurface: buildCreatorSurface(),
    custody: input.custody,
    compulsiveUseFalsifier: compulsiveUse,
    summary: {
      creditIsHeldOutLearningProgress: true,
      spamOrNoiseCreditZero: learningProgress === 0,
      familyEconomyHidden: true,
      creatorEconomyVisible: true,
      nonExtractionFalsified: compulsiveUse.falsified,
    },
  };
}

function fixtureInput() {
  return {
    generatedAt: '2026-06-21T00:00:00.000Z',
    receiptId: 'roe-fixture',
    interactionId: 'interaction-001',
    familyId: 'family-ash-001',
    soulId: 'soul-ashenmoor-001',
    previousThresholdProgress: 0.62,
    heldOut: {
      frozenCheckpointId: 'field-checkpoint-before-interaction',
      frozenBeforeInteraction: true,
      lossBefore: 0.72,
      lossAfter: 0.5,
      heldOutSliceId: 'future-week-1',
      futureInteractionWindow: '2026-W26',
      provenanceIndependent: true,
    },
    qualifyingReceipt: {
      receiptId: 'simcontract-receipt-001',
      receiptHash: 'sha-test',
      verified: true,
      simulationContractRef: 'SimulationContract:relationship-onboarding',
    },
    custody: {
      downloadable: false,
      exportFidelity: 0,
      custodyScore: 0,
    },
    compulsiveUseFalsifier: {
      hololandSessionMinutes: [8, 11, 13, 14, 17, 20],
      extractiveGameSessionMinutes: [42, 45, 48, 51, 55, 61],
      similarityThreshold: 0.12,
    },
  };
}

function assertSourceAnchors() {
  for (const sourcePath of Object.values(SOURCE_ANCHORS)) {
    const resolved = resolveRepoPath(sourcePath);
    assert.equal(existsSync(resolved), true, `${sourcePath} should exist`);
    const text = readFileSync(resolved, 'utf8');
    assert.match(text, /economy_visible:\s*false|family_surface_economy_visible/);
  }
}

function runSelfTest(args) {
  assertSourceAnchors();
  const receipt = buildEmergenceCreditReceipt(fixtureInput());
  writeJson(args.output, receipt);

  assert.equal(receipt.schemaVersion, SCHEMA_VERSION);
  assert.equal(receipt.measurements.learningProgress, 0.21999999999999997);
  assert.equal(receipt.measurements.emergenceCredit, receipt.measurements.learningProgress);
  assert.equal(receipt.measurements.thresholdProgress, 0.84);
  assert.equal(receipt.stage, 'S2_THRESHOLD');
  assert.equal(receipt.familySurface.economyVisible, false);
  assert.equal(receipt.creatorSurface.economyVisible, true);
  assert.equal(receipt.compulsiveUseFalsifier.falsified, false);

  const spam = buildEmergenceCreditReceipt({
    ...fixtureInput(),
    heldOut: { ...fixtureInput().heldOut, lossBefore: 0.5, lossAfter: 0.7 },
  });
  assert.equal(spam.measurements.learningProgress, 0);
  assert.equal(spam.measurements.emergenceCredit, 0);

  const compulsiveMatch = runCompulsiveUseFalsifier({
    hololandSessionMinutes: [40, 44, 48, 52, 60],
    extractiveGameSessionMinutes: [41, 45, 49, 53, 59],
    similarityThreshold: 0.21,
  });
  assert.equal(compulsiveMatch.falsified, true);

  return receipt;
}

function main() {
  const args = parseArgs();
  const receipt = args.selfTest ? runSelfTest(args) : buildEmergenceCreditReceipt(fixtureInput());
  if (!args.selfTest) writeJson(args.output, receipt);
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else console.log(`Relationship onboarding emergence: ${receipt.stage}; credit=${receipt.measurements.emergenceCredit.toFixed(3)}`);
}

try {
  main();
} catch (error) {
  console.error(`relationship-onboarding-emergence failed: ${error.message}`);
  process.exit(1);
}
