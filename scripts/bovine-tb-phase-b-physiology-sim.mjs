#!/usr/bin/env node
/**
 * Bovine-TB Phase B cow physiology simulation.
 *
 * Deterministic ODE/RK4 digital-twin harness for the Bovine-TB Grand Challenge
 * benchmark. This is a research simulation receipt only; it is not clinical or
 * veterinary decision support.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, hostname, platform, release } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chainReceipt,
  canonical,
  hashValue,
  sha256Text,
  stageReceipt,
  withHash,
} from './holoshell/chain/receipts.mjs';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'cael.bovine-tb.phase-b.cow-physiology/v1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_TASK_ID = 'task_1781757203428_t4ti';
const DEFAULT_HOLO_SOURCE = join(
  REPO_ROOT,
  'examples',
  'biomedical',
  'bovine-tb-phase-b-cow-physiology.holo'
);

export const DEFAULT_PARAMETERS = Object.freeze({
  days: 120,
  dtDays: 0.25,
  initialMBovisLoad: 0.36,
  carryingCapacity: 1,
  pathogenGrowthRate: 0.046,
  macrophageBaseline: 0.2,
  macrophageActivationRate: 0.34,
  macrophageDecayRate: 0.07,
  macrophageKillRate: 0.035,
  tCellBaseline: 0.07,
  tCellPrimingDelayDays: 14,
  tCellPrimingRate: 0.06,
  tCellDecayRate: 0.032,
  tCellKillRate: 0.052,
  ifnGammaProductionRate: 0.72,
  ifnGammaDecayRate: 0.34,
  il10ProductionRate: 0.31,
  il10DecayRate: 0.24,
  il10SuppressionRate: 0.08,
  wbcBaselineKPerUl: 7.8,
  wbcResponseRate: 2.15,
  wbcRecoveryRate: 0.16,
  antibodyProductionRate: 0.046,
  antibodyDecayRate: 0.012,
  vaccineDay: 21,
  candidateStartDay: 35,
  phaseACandidate: 'INH-InhA baseline inhibitor candidate',
  phaseACandidateBindingKcalMol: -5.1,
  phaseACandidateSource: '/mnt/nvme/holo/agent/shared/vt3-bovine-tb-receipt.json',
  candidateEffectSlope: 0.01,
  candidateMaxEffect: 0.08,
  tuberculinChallengeDay: 84,
  tuberculinSensitivityMm: 0.24,
  tuberculinResolutionRate: 0.36,
});

const STATUS_VALUES = new Set(['pass', 'fail']);

function parseArgs(argv) {
  const args = {
    command: 'run',
    out: undefined,
    date: DEFAULT_DATE,
    now: undefined,
    json: false,
    taskId: DEFAULT_TASK_ID,
    holoSource: DEFAULT_HOLO_SOURCE,
    signingKey: undefined,
    receipt: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === 'run') args.command = 'run';
    else if (arg === 'verify') args.command = 'verify';
    else if (arg === 'self-test' || arg === '--self-test') args.command = 'self-test';
    else if (arg === 'help' || arg === '--help' || arg === '-h') args.command = 'help';
    else if (arg === '--out') args.out = argv[++index];
    else if (arg === '--date') args.date = argv[++index];
    else if (arg === '--now') args.now = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--task-id') args.taskId = argv[++index];
    else if (arg === '--holo-source') args.holoSource = argv[++index];
    else if (arg === '--signing-key') args.signingKey = argv[++index];
    else if (arg === '--receipt') args.receipt = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  process.stdout.write(`Bovine-TB Phase B Cow Physiology Simulation ${VERSION}

Usage:
  node scripts/bovine-tb-phase-b-physiology-sim.mjs run [--out path] [--json]
  node scripts/bovine-tb-phase-b-physiology-sim.mjs verify --receipt path
  node scripts/bovine-tb-phase-b-physiology-sim.mjs --self-test

What it proves:
  - Deterministic RK4 time-series for M. bovis load, macrophages, T cells,
    WBC, IFN-gamma, IL-10, antibody titer, and tuberculin skin response.
  - Phase A inhibitor candidate parameters are included in the receipt.
  - The receipt hash is signed with Ed25519 and locally verifiable.

Honest scope:
  - Research benchmark simulation only.
  - Not clinical, veterinary, dosing, diagnostic, or safety advice.
`);
}

function nowIso(args) {
  const value = args.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid ISO timestamp: ${value}`);
  return value;
}

function round(value, digits = 6) {
  return Number.parseFloat(Number(value).toFixed(digits));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addVectors(a, b, scale = 1) {
  return a.map((value, index) => value + b[index] * scale);
}

function candidateEffectAt(day, parameters) {
  if (day < parameters.candidateStartDay) return 0;
  const phaseAEffect = Math.min(
    parameters.candidateMaxEffect,
    Math.abs(parameters.phaseACandidateBindingKcalMol) * parameters.candidateEffectSlope
  );
  return phaseAEffect * (1 - Math.exp(-(day - parameters.candidateStartDay) / 7));
}

function vaccineStimulusAt(day, parameters) {
  if (day < parameters.vaccineDay) return 0;
  return Math.exp(-(day - parameters.vaccineDay) / 30);
}

function tuberculinStimulusAt(day, parameters) {
  if (day < parameters.tuberculinChallengeDay || day > parameters.tuberculinChallengeDay + 10) {
    return 0;
  }
  return Math.exp(-(day - parameters.tuberculinChallengeDay) / 3);
}

function derivatives(day, state, parameters) {
  const [load, macrophages, tCells, ifnGamma, il10, wbc, antibody, tuberculinMm] = state;
  const infectionSignal = load / (load + 0.08);
  const tCellDelay = 1 / (1 + Math.exp(-(day - parameters.tCellPrimingDelayDays) / 3));
  const vaccineStimulus = vaccineStimulusAt(day, parameters);
  const tuberculinStimulus = tuberculinStimulusAt(day, parameters);
  const candidateEffect = candidateEffectAt(day, parameters);

  const dLoad =
    parameters.pathogenGrowthRate * load * (1 - load / parameters.carryingCapacity) -
    parameters.macrophageKillRate * macrophages * load -
    parameters.tCellKillRate * tCells * load -
    candidateEffect * load;
  const dMacrophages =
    parameters.macrophageActivationRate * infectionSignal +
    0.04 * vaccineStimulus -
    parameters.macrophageDecayRate * (macrophages - parameters.macrophageBaseline) -
    parameters.il10SuppressionRate * il10 * macrophages;
  const dTCells =
    parameters.tCellPrimingRate * infectionSignal * tCellDelay +
    0.025 * vaccineStimulus -
    parameters.tCellDecayRate * (tCells - parameters.tCellBaseline);
  const dIfnGamma =
    parameters.ifnGammaProductionRate * tCells * infectionSignal -
    parameters.ifnGammaDecayRate * ifnGamma;
  const dIl10 =
    parameters.il10ProductionRate * (macrophages + load) * infectionSignal -
    parameters.il10DecayRate * il10;
  const dWbc =
    parameters.wbcRecoveryRate * (parameters.wbcBaselineKPerUl - wbc) +
    parameters.wbcResponseRate * infectionSignal +
    0.25 * tuberculinStimulus;
  const dAntibody =
    parameters.antibodyProductionRate * vaccineStimulus +
    0.01 * infectionSignal -
    parameters.antibodyDecayRate * antibody;
  const dTuberculin =
    parameters.tuberculinSensitivityMm * tuberculinStimulus * (tCells + ifnGamma) * (1 + load) -
    parameters.tuberculinResolutionRate * tuberculinMm;

  return [dLoad, dMacrophages, dTCells, dIfnGamma, dIl10, dWbc, dAntibody, dTuberculin];
}

function rk4Step(day, state, dt, parameters) {
  const k1 = derivatives(day, state, parameters);
  const k2 = derivatives(day + dt / 2, addVectors(state, k1, dt / 2), parameters);
  const k3 = derivatives(day + dt / 2, addVectors(state, k2, dt / 2), parameters);
  const k4 = derivatives(day + dt, addVectors(state, k3, dt), parameters);
  return state.map((value, index) =>
    clamp(value + (dt / 6) * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]), 0, 1000)
  );
}

function sample(day, state, parameters) {
  return {
    day: round(day, 2),
    mBovisLoad: round(state[0]),
    macrophageIndex: round(state[1]),
    tCellIndex: round(state[2]),
    ifnGamma: round(state[3]),
    il10: round(state[4]),
    wbcKPerUl: round(state[5]),
    antibodyTiterIndex: round(state[6]),
    tuberculinMm: round(state[7]),
    candidateEffect: round(candidateEffectAt(day, parameters)),
  };
}

function peakBy(series, key) {
  return series.reduce((best, point) => (point[key] > best[key] ? point : best), series[0]);
}

function rangeBy(series, key) {
  const values = series.map((point) => point[key]);
  return { min: round(Math.min(...values)), max: round(Math.max(...values)) };
}

function sampleAtDay(series, day) {
  return (
    series.find((point) => point.day === day) ??
    series.reduce((best, point) =>
      Math.abs(point.day - day) < Math.abs(best.day - day) ? point : best
    )
  );
}

export function simulateBovineTbPhysiology(inputParameters = {}) {
  const parameters = { ...DEFAULT_PARAMETERS, ...inputParameters };
  if (parameters.days <= 0) throw new Error('days must be positive');
  if (parameters.dtDays <= 0) throw new Error('dtDays must be positive');
  if (parameters.days / parameters.dtDays > 5000) throw new Error('simulation step cap exceeded');

  let state = [
    parameters.initialMBovisLoad,
    parameters.macrophageBaseline,
    parameters.tCellBaseline,
    0.04,
    0.03,
    parameters.wbcBaselineKPerUl + 0.25,
    0.02,
    0,
  ];
  const series = [sample(0, state, parameters)];
  const steps = Math.round(parameters.days / parameters.dtDays);
  let nextDailySample = 1;

  for (let step = 1; step <= steps; step += 1) {
    const day = round((step - 1) * parameters.dtDays, 6);
    state = rk4Step(day, state, parameters.dtDays, parameters);
    const currentDay = round(step * parameters.dtDays, 6);
    if (currentDay + 1e-9 >= nextDailySample || step === steps) {
      series.push(sample(nextDailySample, state, parameters));
      nextDailySample += 1;
    }
  }

  const initial = series[0];
  const final = series.at(-1);
  const peakLoad = peakBy(series, 'mBovisLoad');
  const peakIfnGamma = peakBy(series, 'ifnGamma');
  const peakIl10 = peakBy(series, 'il10');
  const peakTuberculin = peakBy(series, 'tuberculinMm');
  const wbcRange = rangeBy(series, 'wbcKPerUl');
  const tuberculin72h = sampleAtDay(series, parameters.tuberculinChallengeDay + 3);

  const summary = {
    solver: 'fixed-step-rk4',
    equivalentReference: 'scipy.integrate.solve_ivp with fixed max_step=dtDays',
    stateVariables: [
      'mBovisLoad',
      'macrophageIndex',
      'tCellIndex',
      'ifnGamma',
      'il10',
      'wbcKPerUl',
      'antibodyTiterIndex',
      'tuberculinMm',
    ],
    sampleCount: series.length,
    initialMBovisLoad: initial.mBovisLoad,
    peakMBovisLoad: peakLoad.mBovisLoad,
    finalMBovisLoad: final.mBovisLoad,
    loadChangePct: round(((final.mBovisLoad - initial.mBovisLoad) / initial.mBovisLoad) * 100, 3),
    peakIfnGamma: { day: peakIfnGamma.day, value: peakIfnGamma.ifnGamma },
    peakIl10: { day: peakIl10.day, value: peakIl10.il10 },
    wbcKPerUlRange: wbcRange,
    peakTuberculinMm: { day: peakTuberculin.day, value: peakTuberculin.tuberculinMm },
    tuberculin72hMm: tuberculin72h.tuberculinMm,
    finalAntibodyTiterIndex: final.antibodyTiterIndex,
    finalCandidateEffect: final.candidateEffect,
  };

  const gate = {
    finiteNonNegativeSeries: series.every((point) =>
      Object.entries(point).every(
        ([key, value]) => key === 'day' || (Number.isFinite(value) && value >= 0)
      )
    ),
    candidateSuppressesLoadBelowPeak: final.mBovisLoad < peakLoad.mBovisLoad,
    immuneResponseObserved: peakIfnGamma.ifnGamma > 0.12 && peakIl10.il10 > 0.12,
    bloodPanelDynamic: wbcRange.max - wbcRange.min > 1,
    tuberculinTimelineObserved: tuberculin72h.tuberculinMm > 0.05,
  };

  return {
    parameters: canonical(parameters),
    timeSeries: series,
    summary,
    gate,
  };
}

function buildStages(receiptBase) {
  const stages = [
    stageReceipt({
      name: 'phase-a.inhibitor-candidate-ingest',
      input: {
        source: receiptBase.parameters.phaseACandidateSource,
        candidate: receiptBase.parameters.phaseACandidate,
      },
      output: {
        bindingKcalMol: receiptBase.parameters.phaseACandidateBindingKcalMol,
        finalCandidateEffect: receiptBase.summary.finalCandidateEffect,
      },
      honestScope:
        'Consumes the Phase A inhibitor candidate as a benchmark parameter; this stage does not perform docking.',
    }),
    stageReceipt({
      name: 'physiology.ode-rk4-time-series',
      input: {
        days: receiptBase.parameters.days,
        dtDays: receiptBase.parameters.dtDays,
      },
      output: {
        sampleCount: receiptBase.summary.sampleCount,
        timeSeriesHash: receiptBase.evidenceHashes.timeSeries,
      },
      metrics: {
        initialMBovisLoad: receiptBase.summary.initialMBovisLoad,
        finalMBovisLoad: receiptBase.summary.finalMBovisLoad,
        loadChangePct: receiptBase.summary.loadChangePct,
      },
      honestScope:
        'Deterministic fixed-step RK4 benchmark only; parameters are illustrative and not calibrated to animal records.',
    }),
    stageReceipt({
      name: 'blood-panel.markers',
      output: {
        wbcKPerUlRange: receiptBase.summary.wbcKPerUlRange,
        peakIfnGamma: receiptBase.summary.peakIfnGamma,
        peakIl10: receiptBase.summary.peakIl10,
      },
      honestScope:
        'Synthetic blood chemistry marker trajectory for benchmark validation, not diagnostic interpretation.',
    }),
    stageReceipt({
      name: 'tuberculin.skin-test-timeline',
      input: {
        tuberculinChallengeDay: receiptBase.parameters.tuberculinChallengeDay,
      },
      output: {
        peakTuberculinMm: receiptBase.summary.peakTuberculinMm,
        tuberculin72hMm: receiptBase.summary.tuberculin72hMm,
      },
      honestScope:
        'Synthetic skin-response timeline used to prove the state machine emits a longitudinal diagnostic marker.',
    }),
  ];

  return {
    receipt: chainReceipt({
      name: 'bovine-tb-phase-b-cow-physiology',
      stages,
      metrics: {
        status: receiptBase.status,
        sampleCount: receiptBase.summary.sampleCount,
        signed: true,
      },
      honestScope:
        'CAEL-style ordered receipt chain for a local/Jetson deterministic cow physiology simulation.',
    }),
    stages,
  };
}

function signingKeyPairFromPem(path) {
  const absolute = isAbsolute(path) ? path : resolve(REPO_ROOT, path);
  const privateKey = createPrivateKey(readFileSync(absolute, 'utf8'));
  return {
    privateKey,
    publicKey: createPublicKey(privateKey),
    keySource: 'provided-ed25519-pem',
  };
}

function createSigningKeyPair(signingKeyPath) {
  if (signingKeyPath) return signingKeyPairFromPem(signingKeyPath);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicKey, keySource: 'ephemeral-run-ed25519' };
}

function signReceiptHash(hash, keyPair) {
  return cryptoSign(null, Buffer.from(hash, 'utf8'), keyPair.privateKey).toString('base64url');
}

function corruptSignatureValue(value) {
  return `${value[0] === 'A' ? 'B' : 'A'}${value.slice(1)}`;
}

function unsignedPart(receipt) {
  const { hash, signature, ...rest } = receipt;
  return rest;
}

export function signReceipt(receipt, keyPair) {
  const hashed = withHash(receipt);
  return {
    ...hashed,
    signature: {
      algorithm: 'Ed25519',
      keySource: keyPair.keySource,
      payload: 'receipt.hash',
      publicKeyJwk: keyPair.publicKey.export({ format: 'jwk' }),
      value: signReceiptHash(hashed.hash, keyPair),
    },
  };
}

export function buildBovineTbPhaseBReceipt(input = {}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const simulation = simulateBovineTbPhysiology(input.parameters);
  const failedGates = Object.entries(simulation.gate)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  const holoSource =
    input.holoSource && existsSync(input.holoSource)
      ? readFileSync(input.holoSource, 'utf8')
      : undefined;
  const receiptBase = {
    id: `cael-bovine-tb-phase-b-${sha256Text(
      `${generatedAt}:${input.taskId ?? DEFAULT_TASK_ID}:${hashValue(simulation.parameters)}`
    ).slice(0, 16)}`,
    schemaVersion: RECEIPT_VERSION,
    adapterVersion: VERSION,
    generatedAt,
    taskId: input.taskId ?? DEFAULT_TASK_ID,
    status: failedGates.length === 0 ? 'pass' : 'fail',
    failedGates,
    simulationOnlyNotClinical: true,
    runner: {
      node: process.version,
      platform: platform(),
      release: release(),
      arch: arch(),
      hostname: hostname(),
    },
    parameters: simulation.parameters,
    summary: simulation.summary,
    gate: simulation.gate,
    timeSeries: simulation.timeSeries,
    evidenceHashes: {
      parameters: hashValue(simulation.parameters),
      timeSeries: hashValue(simulation.timeSeries),
      holoSource: holoSource ? hashValue(holoSource) : undefined,
    },
    verificationCommands: [
      {
        command: 'node scripts/bovine-tb-phase-b-physiology-sim.mjs --self-test',
        description: 'Run deterministic model, receipt, hash, and signature checks.',
      },
      {
        command:
          'node scripts/bovine-tb-phase-b-physiology-sim.mjs verify --receipt <receipt.json>',
        description: 'Verify a generated CAEL receipt hash and Ed25519 signature.',
      },
    ],
    honestScope:
      'Research benchmark physiology twin. Not calibrated clinical/veterinary guidance, not dosing guidance, and not a diagnosis.',
  };

  const chainedBase = {
    ...receiptBase,
    chain: buildStages(receiptBase),
  };

  return signReceipt(chainedBase, createSigningKeyPair(input.signingKeyPath));
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') return ['receipt must be an object'];
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (!STATUS_VALUES.has(receipt.status)) errors.push(`status unsupported: ${receipt.status}`);
  if (receipt.simulationOnlyNotClinical !== true)
    errors.push('simulationOnlyNotClinical must be true');
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  else if (hashValue(unsignedPart(receipt)) !== receipt.hash) errors.push('hash mismatch');
  if (!receipt.signature?.value) errors.push('signature missing');
  else {
    try {
      const publicKey = createPublicKey({ key: receipt.signature.publicKeyJwk, format: 'jwk' });
      const verified = cryptoVerify(
        null,
        Buffer.from(receipt.hash, 'utf8'),
        publicKey,
        Buffer.from(receipt.signature.value, 'base64url')
      );
      if (!verified) errors.push('signature invalid');
    } catch (error) {
      errors.push(`signature verification failed: ${error.message}`);
    }
  }
  if (!receipt.chain?.receipt?.hash?.startsWith('sha256:')) errors.push('chain hash missing');
  if (!Array.isArray(receipt.chain?.stages) || receipt.chain.stages.length !== 4)
    errors.push('chain stages missing');
  if (!Array.isArray(receipt.timeSeries) || receipt.timeSeries.length < 2)
    errors.push('timeSeries missing');
  if (receipt.summary?.sampleCount !== receipt.timeSeries?.length)
    errors.push('sampleCount mismatch');
  if (receipt.status === 'pass' && receipt.failedGates?.length) {
    errors.push('pass receipt cannot contain failed gates');
  }
  if (receipt.status === 'fail' && !receipt.failedGates?.length) {
    errors.push('fail receipt missing failed gates');
  }
  return errors;
}

function defaultOutput(date) {
  return join('.scratch', 'bovine-tb-phase-b', date, 'cow-physiology-cael-receipt.json');
}

function writeJson(path, value) {
  const absolute = isAbsolute(path) ? path : resolve(REPO_ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolute;
}

function readJson(path) {
  const absolute = isAbsolute(path) ? path : resolve(REPO_ROOT, path);
  return JSON.parse(readFileSync(absolute, 'utf8'));
}

export function selfTest() {
  const receipt = buildBovineTbPhaseBReceipt({
    generatedAt: '2026-06-21T00:00:00.000Z',
    taskId: DEFAULT_TASK_ID,
    holoSource: existsSync(DEFAULT_HOLO_SOURCE) ? DEFAULT_HOLO_SOURCE : undefined,
  });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(`self-test receipt invalid: ${errors.join('; ')}`);
  if (receipt.status !== 'pass') throw new Error(`expected pass receipt, got ${receipt.status}`);
  if (receipt.summary.finalMBovisLoad >= receipt.summary.peakMBovisLoad) {
    throw new Error('candidate did not suppress M. bovis load below peak');
  }
  if (receipt.summary.wbcKPerUlRange.max <= receipt.summary.wbcKPerUlRange.min) {
    throw new Error('WBC range did not move');
  }
  if (receipt.summary.tuberculin72hMm <= 0.05) {
    throw new Error('tuberculin 72h response was not observed');
  }

  const tampered = {
    ...receipt,
    summary: {
      ...receipt.summary,
      finalMBovisLoad: receipt.summary.finalMBovisLoad + 1,
    },
  };
  if (!validateReceipt(tampered).includes('hash mismatch')) {
    throw new Error('tampered summary did not fail hash verification');
  }

  const signatureTampered = {
    ...receipt,
    signature: {
      ...receipt.signature,
      value: corruptSignatureValue(receipt.signature.value),
    },
  };
  if (!validateReceipt(signatureTampered).some((error) => error.includes('signature'))) {
    throw new Error('tampered signature did not fail signature verification');
  }

  return receipt;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help') {
    printHelp();
    return;
  }
  if (args.command === 'self-test') {
    const receipt = selfTest();
    process.stdout.write(`bovine-tb-phase-b-physiology self-test PASS ${receipt.hash}\n`);
    return;
  }
  if (args.command === 'verify') {
    if (!args.receipt) throw new Error('verify requires --receipt path');
    const receipt = readJson(args.receipt);
    const errors = validateReceipt(receipt);
    if (errors.length > 0) throw new Error(`receipt invalid: ${errors.join('; ')}`);
    process.stdout.write(`bovine-tb-phase-b-physiology verify PASS ${receipt.hash}\n`);
    return;
  }

  const generatedAt = nowIso(args);
  const holoSource = args.holoSource
    ? isAbsolute(args.holoSource)
      ? args.holoSource
      : resolve(REPO_ROOT, args.holoSource)
    : undefined;
  const receipt = buildBovineTbPhaseBReceipt({
    generatedAt,
    taskId: args.taskId,
    holoSource,
    signingKeyPath: args.signingKey,
  });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(`Invalid receipt: ${errors.join('; ')}`);
  const out = writeJson(args.out ?? defaultOutput(args.date), receipt);
  const summary = {
    ok: true,
    receiptPath: out,
    status: receipt.status,
    hash: receipt.hash,
    signature: {
      algorithm: receipt.signature.algorithm,
      keySource: receipt.signature.keySource,
    },
    sampleCount: receipt.summary.sampleCount,
    finalMBovisLoad: receipt.summary.finalMBovisLoad,
    peakIfnGamma: receipt.summary.peakIfnGamma,
    peakIl10: receipt.summary.peakIl10,
    wbcKPerUlRange: receipt.summary.wbcKPerUlRange,
    tuberculin72hMm: receipt.summary.tuberculin72hMm,
  };
  process.stdout.write(
    args.json ? `${JSON.stringify(summary, null, 2)}\n` : `pass ${out} ${receipt.hash}\n`
  );
}

if (
  import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` ||
  process.argv[1]?.endsWith('bovine-tb-phase-b-physiology-sim.mjs')
) {
  main().catch((error) => {
    process.stderr.write(`bovine-tb-phase-b-physiology FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
