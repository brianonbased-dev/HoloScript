#!/usr/bin/env node
/**
 * HoloShell fiducial calibration receipt.
 *
 * Promotes a planar fiducial pose seed only when explicit pinhole intrinsics
 * and distortion provenance are supplied. This is a calibrated anchor receipt,
 * not a solvePnP implementation or a multi-image calibration solver.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  estimateFiducialPoseSeed,
  selfTest as poseSeedSelfTest,
} from './holoshell-fiducial-pose-seed.mjs';
import { chainReceipt, sha256Bytes, sha256Text, stageReceipt, withHash } from './holoshell/chain/receipts.mjs';

export const RECEIPT_VERSION = 'holoshell-fiducial-calibration/v1';
const VERSION = '0.1.0';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_RMS_GATE = 4;

function rel(path) {
  return relative(REPO_ROOT, resolve(path)).replaceAll('\\', '/');
}

function defaultOutput(date) {
  return join('.scratch', 'holoshell-fiducial-calibration', date, 'fiducial-calibration-receipt.json');
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8'));
}

function writeJson(path, value) {
  const absolute = resolve(REPO_ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolute;
}

function fileHash(path) {
  const absolute = resolve(REPO_ROOT, path);
  if (!existsSync(absolute)) return undefined;
  return `sha256:${sha256Bytes(readFileSync(absolute))}`;
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function parseNumber(value, name) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be finite`);
  return parsed;
}

function parseDistortion(value) {
  const parts = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number);
  if (![5, 8].includes(parts.length) || parts.some((part) => !Number.isFinite(part))) {
    throw new Error('--distortion must be 5 or 8 comma-separated finite numbers');
  }
  return parts.map((part) => round(part, 12));
}

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    poseSeed: undefined,
    out: undefined,
    calibrationSource: undefined,
    distortionCoefficients: undefined,
    assumeZeroDistortion: false,
    rmsGate: DEFAULT_RMS_GATE,
    selfTest: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--date') args.date = argv[++i];
    else if (arg === '--pose-seed') args.poseSeed = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--calibration-source') args.calibrationSource = argv[++i];
    else if (arg === '--distortion') args.distortionCoefficients = parseDistortion(argv[++i]);
    else if (arg === '--assume-zero-distortion') args.assumeZeroDistortion = true;
    else if (arg === '--rms-gate') args.rmsGate = parseNumber(argv[++i], '--rms-gate');
    else if (arg === '--self-test' || arg === 'self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.help || args.selfTest) return args;
  if (!args.poseSeed) throw new Error('--pose-seed is required');
  if (!(args.rmsGate >= 0)) throw new Error('--rms-gate must be non-negative');
  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Fiducial Calibration ${VERSION}

Usage:
  node scripts/holoshell-fiducial-calibration.mjs --pose-seed pose-seed.json --calibration-source "device profile" --assume-zero-distortion
  node scripts/holoshell-fiducial-calibration.mjs --pose-seed pose-seed.json --calibration-source "OpenCV run" --distortion k1,k2,p1,p2,k3
  node scripts/holoshell-fiducial-calibration.mjs --self-test

Notes:
  - Requires a pass fiducial pose seed produced with explicit pinhole intrinsics.
  - Requires distortion provenance: either explicit coefficients or declared zero distortion.
  - Emits cameraModelReady/calibratedAnchorReady only when the receipt can prove its inputs.
  - Does not run OpenCV solvePnP or estimate lens distortion from images.
`);
}

function summarizePoseSeed(receipt, path) {
  return {
    path: path ? rel(path) : undefined,
    fileHash: path ? fileHash(path) : undefined,
    receiptHash: receipt?.hash,
    status: receipt?.status,
    intrinsics: receipt?.intrinsics,
    poseSeedReady: receipt?.poseSeed?.poseSeedReady,
    calibrationReady: receipt?.poseSeed?.calibrationReady,
    reprojectionRms: receipt?.poseSeed?.reprojection?.rmsPixels,
    coordinateSystem: receipt?.poseSeed?.coordinateSystem,
  };
}

function declaredDistortion({ distortionCoefficients, assumeZeroDistortion, calibrationSource }) {
  if (Array.isArray(distortionCoefficients)) {
    return {
      model: distortionCoefficients.length === 8 ? 'opencv-radtan-k1-k2-p1-p2-k3-k4-k5-k6' : 'opencv-radtan-k1-k2-p1-p2-k3',
      coefficients: distortionCoefficients,
      known: true,
      declaredZero: distortionCoefficients.every((value) => value === 0),
      source: calibrationSource,
      honestScope:
        'Distortion coefficients were supplied explicitly. This receipt records provenance but does not independently solve distortion.',
    };
  }
  if (assumeZeroDistortion) {
    return {
      model: 'declared-zero-opencv-radtan-k1-k2-p1-p2-k3',
      coefficients: [0, 0, 0, 0, 0],
      known: true,
      declaredZero: true,
      source: calibrationSource,
      honestScope:
        'Zero distortion was explicitly declared by the operator or upstream profile. This is accepted as provenance, not estimated from images.',
    };
  }
  return undefined;
}

function collectBlockers({ poseSeedReceipt, calibrationSource, distortion, rmsGate }) {
  const blockers = [];
  if (!poseSeedReceipt) blockers.push('pose-seed-receipt-missing');
  if (poseSeedReceipt?.status !== 'pass' || poseSeedReceipt?.poseSeed?.poseSeedReady !== true) {
    blockers.push('pose-seed-unavailable');
  }
  if (poseSeedReceipt?.intrinsics?.source !== 'explicit-pinhole-intrinsics') {
    blockers.push('explicit-intrinsics-required');
  }
  if (!calibrationSource) blockers.push('calibration-source-required');
  if (!distortion) blockers.push('distortion-declaration-required');
  const rms = Number(poseSeedReceipt?.poseSeed?.reprojection?.rmsPixels);
  if (Number.isFinite(rms) && rms > rmsGate) blockers.push(`pose-seed-rms-above-gate:${round(rms)}`);
  return blockers;
}

function blockedReceipt({ poseSeedReceipt, poseSeedPath, calibrationSource, distortion, blockers, rmsGate, out }) {
  const stage = stageReceipt({
    name: 'fiducial.promote-calibrated-anchor',
    input: {
      poseSeedPath: poseSeedPath ? rel(poseSeedPath) : undefined,
      poseSeedHash: poseSeedReceipt?.hash,
      calibrationSource,
      distortion,
      rmsGate,
    },
    output: {
      status: 'blocked',
      calibrationReady: false,
      cameraModelReady: false,
      calibratedAnchorReady: false,
      blockers,
    },
    metrics: {
      blockerCount: blockers.length,
      poseSeedRms: poseSeedReceipt?.poseSeed?.reprojection?.rmsPixels,
    },
    honestScope:
      'Calibration promotion ran fail-closed because explicit intrinsics, distortion provenance, or a pass pose seed was missing.',
  });
  const chain = {
    receipt: chainReceipt({
      name: 'holoshell-fiducial-calibration',
      stages: [stage],
      metrics: {
        calibrationStatus: 'blocked',
        blockerCount: blockers.length,
      },
      honestScope:
        'Single-stage calibration promotion. Blocked receipts are expected until explicit camera parameters exist.',
    }),
    stages: [stage],
  };
  return withHash({
    id: `holoshell-fiducial-calibration-blocked-${sha256Text(`${poseSeedReceipt?.hash ?? 'missing'}:${blockers.join(',')}`).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    calibrationVersion: VERSION,
    status: 'blocked',
    action: 'promote-fiducial-pose-seed-with-explicit-camera-model',
    generatedAt: new Date().toISOString(),
    poseSeed: summarizePoseSeed(poseSeedReceipt, poseSeedPath),
    cameraModel: {
      intrinsics: poseSeedReceipt?.intrinsics,
      distortion,
      cameraModelReady: false,
    },
    calibration: {
      status: 'blocked',
      calibrationReady: false,
      cameraModelReady: false,
      calibratedAnchorReady: false,
      solvePnPReady: false,
      metricScaleReady: false,
      rmsGate,
      blockers,
    },
    honestScope:
      'Blocked fiducial calibration receipt. It preserves exactly why the pose seed cannot become a calibrated anchor yet.',
    chain,
    outputPath: out ? rel(out) : undefined,
  });
}

export function calibrateFiducialAnchor({
  poseSeedReceipt,
  poseSeedPath,
  out,
  calibrationSource,
  distortionCoefficients,
  assumeZeroDistortion = false,
  rmsGate = DEFAULT_RMS_GATE,
} = {}) {
  const receipt = poseSeedReceipt ?? (poseSeedPath ? readJson(poseSeedPath) : undefined);
  const distortion = declaredDistortion({ distortionCoefficients, assumeZeroDistortion, calibrationSource });
  const blockers = collectBlockers({ poseSeedReceipt: receipt, calibrationSource, distortion, rmsGate });
  if (blockers.length > 0) {
    const blocked = blockedReceipt({
      poseSeedReceipt: receipt,
      poseSeedPath,
      calibrationSource,
      distortion,
      blockers,
      rmsGate,
      out,
    });
    const errors = validateReceipt(blocked);
    if (errors.length > 0) throw new Error(`Invalid fiducial calibration receipt: ${errors.join('; ')}`);
    if (out) writeJson(out, blocked);
    return blocked;
  }

  const intrinsics = {
    ...receipt.intrinsics,
    calibrated: true,
    calibrationReady: true,
    distortionCoefficientsKnown: true,
    source: receipt.intrinsics.source,
    calibrationSource,
    honestScope:
      'Explicit pinhole intrinsics from the pose seed were paired with declared distortion provenance. This receipt does not estimate intrinsics from images.',
  };
  const cameraModel = {
    model: 'pinhole-plus-opencv-radtan-distortion',
    intrinsics,
    distortion,
    cameraModelReady: true,
    calibrationReady: true,
  };
  const calibration = {
    status: 'calibrated-anchor-ready',
    method: 'explicit-camera-model-plus-planar-pose-seed',
    calibrationReady: true,
    cameraModelReady: true,
    calibratedAnchorReady: true,
    solvePnPReady: false,
    metricScaleReady: receipt.poseSeed.metricScaleReady === true,
    coordinateSystem: receipt.poseSeed.coordinateSystem,
    rmsGate,
    reprojection: receipt.poseSeed.reprojection,
    cameraFromBoard: receipt.poseSeed.cameraFromBoard,
    honestScope:
      'Calibrated camera model plus planar board anchor. This is ready for HoloMap anchoring, but it is not a solvePnP run or metric-scale reconstruction unless metricScaleReady is true.',
  };
  const stage = stageReceipt({
    name: 'fiducial.promote-calibrated-anchor',
    input: {
      poseSeedPath: poseSeedPath ? rel(poseSeedPath) : undefined,
      poseSeedHash: receipt.hash,
      calibrationSource,
      distortion,
      rmsGate,
    },
    output: {
      status: calibration.status,
      calibrationReady: calibration.calibrationReady,
      cameraModelReady: calibration.cameraModelReady,
      calibratedAnchorReady: calibration.calibratedAnchorReady,
      reprojectionRms: calibration.reprojection?.rmsPixels,
      solvePnPReady: calibration.solvePnPReady,
      metricScaleReady: calibration.metricScaleReady,
    },
    metrics: {
      reprojectionRms: calibration.reprojection?.rmsPixels,
      reprojectionMax: calibration.reprojection?.maxPixels,
      distortionCoefficientCount: distortion.coefficients.length,
      metricScaleReady: calibration.metricScaleReady,
    },
    honestScope:
      'Promotes a planar pose seed only after explicit intrinsics and distortion provenance exist. It still does not run solvePnP.',
  });
  const chain = {
    receipt: chainReceipt({
      name: 'holoshell-fiducial-calibration',
      stages: [stage],
      metrics: {
        calibrationStatus: 'pass',
        calibrationReady: true,
        cameraModelReady: true,
        calibratedAnchorReady: true,
        reprojectionRms: calibration.reprojection?.rmsPixels,
      },
      honestScope:
        'Single-stage calibrated-anchor promotion for HoloMap. The receipt separates explicit camera model provenance from pose solving.',
    }),
    stages: [stage],
  };
  const calibrationReceipt = withHash({
    id: `holoshell-fiducial-calibration-${sha256Text(`${receipt.hash}:${calibrationSource}:${JSON.stringify(distortion.coefficients)}`).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    calibrationVersion: VERSION,
    status: 'pass',
    action: 'promote-fiducial-pose-seed-with-explicit-camera-model',
    generatedAt: new Date().toISOString(),
    poseSeed: summarizePoseSeed(receipt, poseSeedPath),
    cameraModel,
    calibration,
    honestScope:
      'Fiducial calibration receipt for HoloMap/HoloGram anchoring. It proves explicit camera model provenance plus planar anchor consistency; it does not solve lens distortion or solvePnP from images.',
    chain,
    outputPath: out ? rel(out) : undefined,
  });
  const errors = validateReceipt(calibrationReceipt);
  if (errors.length > 0) throw new Error(`Invalid fiducial calibration receipt: ${errors.join('; ')}`);
  if (out) writeJson(out, calibrationReceipt);
  return calibrationReceipt;
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt must be an object');
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (!['pass', 'blocked'].includes(receipt.status)) errors.push('status must be pass or blocked');
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  if (!receipt.poseSeed?.receiptHash?.startsWith('sha256:')) errors.push('pose seed receipt hash missing');
  if (receipt.cameraModel?.intrinsics?.calibrationReady === true && receipt.cameraModel?.intrinsics?.source !== 'explicit-pinhole-intrinsics') {
    errors.push('calibrated intrinsics must be explicit');
  }
  if (receipt.status === 'pass') {
    if (receipt.calibration?.status !== 'calibrated-anchor-ready') errors.push('calibration status mismatch');
    if (receipt.calibration?.calibrationReady !== true) errors.push('calibrationReady missing');
    if (receipt.calibration?.cameraModelReady !== true) errors.push('cameraModelReady missing');
    if (receipt.calibration?.calibratedAnchorReady !== true) errors.push('calibratedAnchorReady missing');
    if (receipt.calibration?.solvePnPReady !== false) errors.push('calibration must not claim solvePnP');
    if (receipt.cameraModel?.distortion?.known !== true) errors.push('distortion provenance missing');
    if (!Array.isArray(receipt.cameraModel?.distortion?.coefficients)) errors.push('distortion coefficients missing');
    if (!(receipt.calibration?.reprojection?.rmsPixels >= 0)) errors.push('calibration reprojection RMS missing');
    if (receipt.poseSeed?.intrinsics?.source !== 'explicit-pinhole-intrinsics') errors.push('pose seed explicit intrinsics missing');
  }
  if (receipt.status === 'blocked') {
    if (!Array.isArray(receipt.calibration?.blockers) || receipt.calibration.blockers.length === 0) {
      errors.push('blocked receipt needs blockers');
    }
    if (receipt.calibration?.calibrationReady !== false) errors.push('blocked receipt must not claim calibration');
  }
  if (!receipt.chain?.receipt?.hash?.startsWith('sha256:')) errors.push('chain receipt hash missing');
  return errors;
}

export async function selfTest() {
  const dir = join('.scratch', 'holoshell-fiducial-calibration-self-test');
  const { poseSeed: estimatedPoseSeed, targetInFrame } = await poseSeedSelfTest();
  const explicitPoseSeed = estimateFiducialPoseSeed({
    targetInFrameReceipt: targetInFrame,
    targetInFramePath: join('.scratch', 'holoshell-fiducial-pose-seed-self-test', 'target-in-frame-receipt.json'),
    out: join(dir, 'explicit-pose-seed-receipt.json'),
    fx: 500,
    fy: 505,
    cx: 320,
    cy: 180,
  });
  const calibrated = calibrateFiducialAnchor({
    poseSeedReceipt: explicitPoseSeed,
    poseSeedPath: join(dir, 'explicit-pose-seed-receipt.json'),
    out: join(dir, 'calibration-receipt.json'),
    calibrationSource: 'synthetic-self-test-pinhole',
    assumeZeroDistortion: true,
  });
  const blockedEstimated = calibrateFiducialAnchor({
    poseSeedReceipt: estimatedPoseSeed,
    out: join(dir, 'blocked-estimated-intrinsics-receipt.json'),
    calibrationSource: 'synthetic-self-test-pinhole',
    assumeZeroDistortion: true,
  });
  const blockedNoDistortion = calibrateFiducialAnchor({
    poseSeedReceipt: explicitPoseSeed,
    out: join(dir, 'blocked-no-distortion-receipt.json'),
    calibrationSource: 'synthetic-self-test-pinhole',
  });
  if (calibrated.status !== 'pass') throw new Error('explicit pose seed should calibrate');
  if (blockedEstimated.status !== 'blocked') throw new Error('estimated intrinsics should block calibration');
  if (blockedNoDistortion.status !== 'blocked') throw new Error('missing distortion should block calibration');
  return { calibrated, blockedEstimated, blockedNoDistortion, explicitPoseSeed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.selfTest) {
    const { calibrated, blockedEstimated, blockedNoDistortion } = await selfTest();
    process.stdout.write(
      `holoshell-fiducial-calibration self-test PASS ${calibrated.hash} ${blockedEstimated.hash} ${blockedNoDistortion.hash}\n`
    );
    return;
  }
  const out = resolve(REPO_ROOT, args.out ?? defaultOutput(args.date));
  const receipt = calibrateFiducialAnchor({
    poseSeedPath: args.poseSeed,
    out,
    calibrationSource: args.calibrationSource,
    distortionCoefficients: args.distortionCoefficients,
    assumeZeroDistortion: args.assumeZeroDistortion,
    rmsGate: args.rmsGate,
  });
  process.stdout.write(`${JSON.stringify({
    receiptPath: rel(out),
    status: receipt.status,
    calibrationReady: receipt.calibration.calibrationReady,
    cameraModelReady: receipt.calibration.cameraModelReady,
    calibratedAnchorReady: receipt.calibration.calibratedAnchorReady,
    solvePnPReady: receipt.calibration.solvePnPReady,
    reprojectionRms: receipt.calibration.reprojection?.rmsPixels,
    blockers: receipt.calibration.blockers,
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('holoshell-fiducial-calibration.mjs')) {
  main().catch((error) => {
    process.stderr.write(`holoshell-fiducial-calibration FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
