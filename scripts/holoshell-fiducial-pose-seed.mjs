#!/usr/bin/env node
/**
 * HoloShell fiducial pose seed.
 *
 * Consumes a target-in-frame receipt with a planar board homography and derives
 * an honest camera-from-board pose seed from pinhole intrinsics. This is not
 * camera calibration, distortion recovery, or OpenCV solvePnP.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTargetInFrame } from './holoshell-target-in-frame-analyzer.mjs';
import { generateFiducialBoard } from './holoshell-fiducial-board.mjs';
import {
  chainReceipt,
  sha256Bytes,
  sha256Text,
  stageReceipt,
  withHash,
} from './holoshell/chain/receipts.mjs';

export const RECEIPT_VERSION = 'holoshell-fiducial-pose-seed/v1';
const VERSION = '0.1.0';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

function rel(path) {
  return relative(REPO_ROOT, resolve(path)).replaceAll('\\', '/');
}

function defaultOutput(date) {
  return join('.scratch', 'holoshell-fiducial-pose-seed', date, 'fiducial-pose-seed-receipt.json');
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

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    targetInFrame: undefined,
    out: undefined,
    fovDeg: 60,
    fx: undefined,
    fy: undefined,
    cx: undefined,
    cy: undefined,
    maxRms: 4,
    selfTest: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--date') args.date = argv[++i];
    else if (arg === '--target-in-frame') args.targetInFrame = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--fov-deg') args.fovDeg = parseNumber(argv[++i], '--fov-deg');
    else if (arg === '--fx') args.fx = parseNumber(argv[++i], '--fx');
    else if (arg === '--fy') args.fy = parseNumber(argv[++i], '--fy');
    else if (arg === '--cx') args.cx = parseNumber(argv[++i], '--cx');
    else if (arg === '--cy') args.cy = parseNumber(argv[++i], '--cy');
    else if (arg === '--max-rms') args.maxRms = parseNumber(argv[++i], '--max-rms');
    else if (arg === '--self-test' || arg === 'self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.help || args.selfTest) return args;
  if (!args.targetInFrame) throw new Error('--target-in-frame is required');
  if (!(args.fovDeg > 5 && args.fovDeg < 175))
    throw new Error('--fov-deg must be between 5 and 175');
  if (!(args.maxRms >= 0)) throw new Error('--max-rms must be non-negative');
  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Fiducial Pose Seed ${VERSION}

Usage:
  node scripts/holoshell-fiducial-pose-seed.mjs --target-in-frame target-in-frame-receipt.json [--out receipt.json]
  node scripts/holoshell-fiducial-pose-seed.mjs --target-in-frame receipt.json --fov-deg 60
  node scripts/holoshell-fiducial-pose-seed.mjs --target-in-frame receipt.json --fx 554 --fy 554 --cx 320 --cy 180
  node scripts/holoshell-fiducial-pose-seed.mjs --self-test

Notes:
  - Consumes the planar board homography from holoshell-target-in-frame.
  - Derives a camera-from-board pose seed using a pinhole intrinsics model.
  - Coordinates are target PNG pixels; there is no metric scale without printed-board dimensions.
  - Does not claim camera calibration, lens distortion recovery, or OpenCV solvePnP.
`);
}

function matMul3(a, b) {
  return a.map((row) =>
    b[0].map((_, col) => row.reduce((sum, value, index) => sum + value * b[index][col], 0))
  );
}

function vecNorm(v) {
  return Math.sqrt(v.reduce((sum, value) => sum + value * value, 0));
}

function vecScale(v, scale) {
  return v.map((value) => value * scale);
}

function vecDot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function vecSub(a, b) {
  return a.map((value, index) => value - b[index]);
}

function vecCross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function vecNormalize(v) {
  const norm = vecNorm(v);
  if (norm < 1e-12) return undefined;
  return vecScale(v, 1 / norm);
}

function column(matrix, index) {
  return [matrix[0][index], matrix[1][index], matrix[2][index]];
}

function roundVector(v, digits = 6) {
  return v.map((value) => round(value, digits));
}

function roundMatrix(matrix, digits = 6) {
  return matrix.map((row) => roundVector(row, digits));
}

function intrinsicMatrix(intrinsics) {
  return [
    [intrinsics.fx, 0, intrinsics.cx],
    [0, intrinsics.fy, intrinsics.cy],
    [0, 0, 1],
  ];
}

function inverseIntrinsicMatrix(intrinsics) {
  return [
    [1 / intrinsics.fx, 0, -intrinsics.cx / intrinsics.fx],
    [0, 1 / intrinsics.fy, -intrinsics.cy / intrinsics.fy],
    [0, 0, 1],
  ];
}

function intrinsicsFromReceipt(receipt, options = {}) {
  const width = Number(receipt?.frame?.width);
  const height = Number(receipt?.frame?.height);
  if (!(width > 0) || !(height > 0))
    throw new Error('target-in-frame receipt frame dimensions missing');
  const hasExplicitFocal = Number.isFinite(options.fx) && Number.isFinite(options.fy);
  const fovDeg = Number.isFinite(options.fovDeg) ? options.fovDeg : 60;
  const focalFromFov = width / 2 / Math.tan((fovDeg * Math.PI) / 360);
  const fx = hasExplicitFocal ? options.fx : focalFromFov;
  const fy = hasExplicitFocal ? options.fy : focalFromFov;
  const cx = Number.isFinite(options.cx) ? options.cx : width / 2;
  const cy = Number.isFinite(options.cy) ? options.cy : height / 2;
  return {
    width,
    height,
    fx: round(fx),
    fy: round(fy),
    cx: round(cx),
    cy: round(cy),
    fovDeg: hasExplicitFocal ? undefined : round(fovDeg),
    source: hasExplicitFocal ? 'explicit-pinhole-intrinsics' : 'estimated-fov-pinhole',
    calibrated: false,
    calibrationReady: false,
    distortionCoefficientsKnown: false,
    honestScope: hasExplicitFocal
      ? 'Explicit pinhole intrinsics were supplied to seed planar pose. This still does not prove lens distortion calibration.'
      : 'Pinhole focal length estimated from frame width and field-of-view. This is an anchor seed, not camera calibration.',
  };
}

function decomposeHomography(matrix, intrinsics) {
  const kInv = inverseIntrinsicMatrix(intrinsics);
  const b = matMul3(kInv, matrix);
  const b1 = column(b, 0);
  const b2 = column(b, 1);
  const b3 = column(b, 2);
  const n1 = vecNorm(b1);
  const n2 = vecNorm(b2);
  if (n1 < 1e-12 || n2 < 1e-12) return undefined;
  let scale = 2 / (n1 + n2);
  let r1Raw = vecScale(b1, scale);
  let r2Raw = vecScale(b2, scale);
  let translation = vecScale(b3, scale);
  if (translation[2] < 0) {
    scale *= -1;
    r1Raw = vecScale(r1Raw, -1);
    r2Raw = vecScale(r2Raw, -1);
    translation = vecScale(translation, -1);
  }
  const r1 = vecNormalize(r1Raw);
  if (!r1) return undefined;
  const r2Projected = vecSub(r2Raw, vecScale(r1, vecDot(r2Raw, r1)));
  const r2 = vecNormalize(r2Projected);
  if (!r2) return undefined;
  const r3 = vecNormalize(vecCross(r1, r2));
  if (!r3) return undefined;
  return {
    scale,
    basis: [r1Raw, r2Raw, translation],
    rotationMatrix: [
      [r1[0], r2[0], r3[0]],
      [r1[1], r2[1], r3[1]],
      [r1[2], r2[2], r3[2]],
    ],
    translation,
    planeNormalCamera: r3,
  };
}

function projectPoint(intrinsics, pose, point) {
  const x = point.x;
  const y = point.y;
  const r = pose.rotationMatrix;
  const t = pose.translation;
  const camera = [
    r[0][0] * x + r[0][1] * y + t[0],
    r[1][0] * x + r[1][1] * y + t[1],
    r[2][0] * x + r[2][1] * y + t[2],
  ];
  if (Math.abs(camera[2]) < 1e-12) return undefined;
  return {
    x: intrinsics.fx * (camera[0] / camera[2]) + intrinsics.cx,
    y: intrinsics.fy * (camera[1] / camera[2]) + intrinsics.cy,
    z: camera[2],
  };
}

function homographyResidualPoints(boardPose) {
  return (boardPose?.reprojection?.residuals ?? [])
    .filter((point) => point?.source && point?.observed)
    .map((point) => ({
      markerId: point.markerId,
      cornerIndex: point.cornerIndex,
      source: point.source,
      observed: point.observed,
    }));
}

function reprojectionFromPose(intrinsics, pose, points) {
  const residuals = points.map((point) => {
    const projected = projectPoint(intrinsics, pose, point.source);
    const dx = projected ? projected.x - point.observed.x : Infinity;
    const dy = projected ? projected.y - point.observed.y : Infinity;
    const error = Math.sqrt(dx * dx + dy * dy);
    return {
      markerId: point.markerId,
      cornerIndex: point.cornerIndex,
      source: point.source,
      projected: projected
        ? { x: round(projected.x, 3), y: round(projected.y, 3), z: round(projected.z, 6) }
        : undefined,
      observed: point.observed,
      error: round(error, 6),
    };
  });
  const finiteErrors = residuals
    .map((point) => point.error)
    .filter((error) => Number.isFinite(error));
  const rmsPixels = Math.sqrt(
    finiteErrors.reduce((sum, error) => sum + error * error, 0) / Math.max(1, finiteErrors.length)
  );
  const maxPixels = finiteErrors.length > 0 ? Math.max(...finiteErrors) : Infinity;
  return {
    rmsPixels: round(rmsPixels),
    maxPixels: round(maxPixels),
    residuals,
  };
}

function blockedReceipt({ targetInFrameReceipt, targetInFramePath, intrinsics, blockers, out }) {
  const stage = stageReceipt({
    name: 'fiducial.seed-planar-pose',
    input: {
      targetInFramePath: targetInFramePath ? rel(targetInFramePath) : undefined,
      targetInFrameHash: targetInFrameReceipt?.hash,
      intrinsics,
    },
    output: {
      status: 'blocked',
      poseSeedReady: false,
      blockers,
    },
    metrics: {
      blockerCount: blockers.length,
    },
    honestScope:
      'Pose seed stage ran fail-closed because homography, correspondences, or intrinsics were insufficient.',
  });
  const chain = {
    receipt: chainReceipt({
      name: 'holoshell-fiducial-pose-seed',
      stages: [stage],
      metrics: {
        solverStatus: 'blocked',
        blockerCount: blockers.length,
      },
      honestScope:
        'Single-stage planar pose seed. Blocked receipts are expected when the target is not in the camera frame.',
    }),
    stages: [stage],
  };
  const receipt = withHash({
    id: `holoshell-fiducial-pose-seed-blocked-${sha256Text(`${targetInFrameReceipt?.hash ?? 'missing'}:${blockers.join(',')}`).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    solverVersion: VERSION,
    status: 'blocked',
    action: 'seed-fiducial-board-pose-from-planar-homography',
    generatedAt: new Date().toISOString(),
    targetInFrame: summarizeTargetInFrame(targetInFrameReceipt, targetInFramePath),
    intrinsics,
    poseSeed: {
      status: 'blocked',
      poseSeedReady: false,
      calibrationReady: false,
      solvePnPReady: false,
      metricScaleReady: false,
      blockers,
    },
    honestScope:
      'Blocked pose-seed receipt. It preserves why HoloMap anchoring cannot advance from this camera frame yet.',
    chain,
    outputPath: out ? rel(out) : undefined,
  });
  return receipt;
}

function summarizeTargetInFrame(receipt, path) {
  return {
    path: path ? rel(path) : undefined,
    fileHash: path ? fileHash(path) : undefined,
    receiptHash: receipt?.hash,
    frame: receipt?.frame,
    target: {
      profile: receipt?.target?.profile,
      dictionary: receipt?.target?.dictionary,
      markerCount: receipt?.target?.markerCount,
    },
    detectionStatus: receipt?.detection?.status,
    recoveredMarkerCount: receipt?.detection?.recoveredMarkerCount,
    markerCornerCount: receipt?.detection?.markerCornerCount,
    boardHomographyStatus: receipt?.detection?.boardPose?.status,
    boardHomographyReady: receipt?.detection?.boardHomographyReady,
  };
}

export function estimateFiducialPoseSeed({
  targetInFrameReceipt,
  targetInFramePath,
  out,
  fovDeg,
  fx,
  fy,
  cx,
  cy,
  maxRms = 4,
} = {}) {
  const receipt =
    targetInFrameReceipt ?? (targetInFramePath ? readJson(targetInFramePath) : undefined);
  if (!receipt) throw new Error('--target-in-frame is required');
  const intrinsics = intrinsicsFromReceipt(receipt, { fovDeg, fx, fy, cx, cy });
  const boardPose = receipt.detection?.boardPose;
  const blockers = [];
  if (
    receipt.detection?.boardHomographyReady !== true ||
    boardPose?.status !== 'homography-estimated'
  ) {
    blockers.push('board-homography-unavailable');
  }
  if (!Array.isArray(boardPose?.matrix) || boardPose.matrix.length !== 3)
    blockers.push('homography-matrix-missing');
  const points = homographyResidualPoints(boardPose);
  if (points.length < 8) blockers.push('board-correspondences-missing');
  if (blockers.length > 0) {
    const blocked = blockedReceipt({
      targetInFrameReceipt: receipt,
      targetInFramePath,
      intrinsics,
      blockers,
      out,
    });
    const errors = validateReceipt(blocked);
    if (errors.length > 0)
      throw new Error(`Invalid fiducial pose seed receipt: ${errors.join('; ')}`);
    if (out) writeJson(out, blocked);
    return blocked;
  }
  const matrix = boardPose.matrix.map((row) => row.map(Number));
  const pose = decomposeHomography(matrix, intrinsics);
  if (!pose) {
    const blocked = blockedReceipt({
      targetInFrameReceipt: receipt,
      targetInFramePath,
      intrinsics,
      blockers: ['homography-decomposition-failed'],
      out,
    });
    const errors = validateReceipt(blocked);
    if (errors.length > 0)
      throw new Error(`Invalid fiducial pose seed receipt: ${errors.join('; ')}`);
    if (out) writeJson(out, blocked);
    return blocked;
  }
  const reprojection = reprojectionFromPose(intrinsics, pose, points);
  const reprojectionPass =
    Number.isFinite(reprojection.rmsPixels) && reprojection.rmsPixels <= maxRms;
  if (!reprojectionPass) {
    const blocked = blockedReceipt({
      targetInFrameReceipt: receipt,
      targetInFramePath,
      intrinsics,
      blockers: [`pose-reprojection-rms-above-threshold:${reprojection.rmsPixels}`],
      out,
    });
    const errors = validateReceipt(blocked);
    if (errors.length > 0)
      throw new Error(`Invalid fiducial pose seed receipt: ${errors.join('; ')}`);
    if (out) writeJson(out, blocked);
    return blocked;
  }
  const poseSeed = {
    status: 'pose-seed-estimated',
    model: 'planar-homography-decomposition-with-pinhole-intrinsics',
    coordinateSystem: 'target-png-pixel-plane',
    poseSeedReady: true,
    calibrationReady: false,
    solvePnPReady: false,
    metricScaleReady: false,
    distortionModel: 'none-assumed',
    homographyStatus: boardPose.status,
    basisScale: round(pose.scale, 9),
    cameraFromBoard: {
      rotationMatrix: roundMatrix(pose.rotationMatrix),
      translationTargetPixels: roundVector(pose.translation),
      planeNormalCamera: roundVector(pose.planeNormalCamera),
    },
    reprojection,
    honestScope:
      'Planar pose seed from board homography plus pinhole intrinsics. It can anchor a HoloMap board plane, but it is not lens calibration, distortion correction, metric scale, or OpenCV solvePnP.',
  };
  const stage = stageReceipt({
    name: 'fiducial.seed-planar-pose',
    input: {
      targetInFramePath: targetInFramePath ? rel(targetInFramePath) : undefined,
      targetInFrameHash: receipt.hash,
      intrinsics,
      maxRms,
    },
    output: {
      status: 'pose-seed-estimated',
      poseSeedReady: true,
      calibrationReady: false,
      reprojectionRms: poseSeed.reprojection.rmsPixels,
      reprojectionMax: poseSeed.reprojection.maxPixels,
      coordinateSystem: poseSeed.coordinateSystem,
    },
    metrics: {
      correspondenceCount: points.length,
      reprojectionRms: poseSeed.reprojection.rmsPixels,
      reprojectionMax: poseSeed.reprojection.maxPixels,
      translationZ: poseSeed.cameraFromBoard.translationTargetPixels[2],
    },
    honestScope:
      'Decomposes a planar homography into an anchor pose seed. Calibration remains false until calibrated intrinsics and distortion are provided.',
  });
  const chain = {
    receipt: chainReceipt({
      name: 'holoshell-fiducial-pose-seed',
      stages: [stage],
      metrics: {
        solverStatus: 'pass',
        poseSeedReady: true,
        calibrationReady: false,
        reprojectionRms: poseSeed.reprojection.rmsPixels,
      },
      honestScope:
        'Single-stage planar pose seed for HoloMap anchoring. It is intentionally separated from camera calibration.',
    }),
    stages: [stage],
  };
  const poseReceipt = withHash({
    id: `holoshell-fiducial-pose-seed-${sha256Text(`${receipt.hash}:${JSON.stringify(intrinsics)}`).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    solverVersion: VERSION,
    status: 'pass',
    action: 'seed-fiducial-board-pose-from-planar-homography',
    generatedAt: new Date().toISOString(),
    targetInFrame: summarizeTargetInFrame(receipt, targetInFramePath),
    intrinsics,
    poseSeed,
    honestScope:
      'Native HoloShell pose seed for HoloMap/HoloGram inspection. The receipt proves a planar anchor seed, not a calibrated camera.',
    chain,
    outputPath: out ? rel(out) : undefined,
  });
  const errors = validateReceipt(poseReceipt);
  if (errors.length > 0)
    throw new Error(`Invalid fiducial pose seed receipt: ${errors.join('; ')}`);
  if (out) writeJson(out, poseReceipt);
  return poseReceipt;
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt must be an object');
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (!['pass', 'blocked'].includes(receipt.status)) errors.push('status must be pass or blocked');
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  if (!receipt.targetInFrame?.receiptHash?.startsWith('sha256:'))
    errors.push('target-in-frame receipt hash missing');
  if (!(receipt.intrinsics?.width > 0) || !(receipt.intrinsics?.height > 0))
    errors.push('intrinsics dimensions missing');
  if (!(receipt.intrinsics?.fx > 0) || !(receipt.intrinsics?.fy > 0))
    errors.push('intrinsics focal length missing');
  if (receipt.intrinsics?.calibrationReady !== false)
    errors.push('intrinsics must not claim calibration readiness');
  if (receipt.poseSeed?.calibrationReady !== false)
    errors.push('pose seed must not claim camera calibration');
  if (receipt.poseSeed?.solvePnPReady !== false)
    errors.push('pose seed must not claim solvePnP readiness');
  if (receipt.status === 'pass') {
    if (receipt.poseSeed?.status !== 'pose-seed-estimated')
      errors.push('pose seed status mismatch');
    if (receipt.poseSeed?.poseSeedReady !== true) errors.push('poseSeedReady missing');
    if (!(receipt.poseSeed?.reprojection?.rmsPixels >= 0))
      errors.push('pose reprojection RMS missing');
    if (!Array.isArray(receipt.poseSeed?.cameraFromBoard?.rotationMatrix))
      errors.push('rotation matrix missing');
    if (!(receipt.poseSeed?.cameraFromBoard?.translationTargetPixels?.[2] > 0))
      errors.push('positive camera-depth translation missing');
  }
  if (receipt.status === 'blocked') {
    if (!Array.isArray(receipt.poseSeed?.blockers) || receipt.poseSeed.blockers.length === 0)
      errors.push('blocked receipt needs blockers');
    if (receipt.poseSeed?.poseSeedReady !== false)
      errors.push('blocked receipt must not be pose ready');
  }
  if (!receipt.chain?.receipt?.hash?.startsWith('sha256:'))
    errors.push('chain receipt hash missing');
  return errors;
}

async function writeSolidPng(path, width, height, rgb) {
  const sharp = (await import('sharp')).default;
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < data.length; i += 3) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
  }
  mkdirSync(dirname(resolve(REPO_ROOT, path)), { recursive: true });
  await sharp(data, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(resolve(REPO_ROOT, path));
}

export async function selfTest() {
  const dir = join('.scratch', 'holoshell-fiducial-pose-seed-self-test');
  const fiducialReceipt = await generateFiducialBoard({
    out: join(dir, 'fiducial-board-receipt.json'),
    png: join(dir, 'fiducial-board.png'),
    width: 640,
    height: 360,
  });
  const targetInFrame = await analyzeTargetInFrame({
    framePath: fiducialReceipt.target.pngPath,
    targetPath: fiducialReceipt.outputPath,
    out: join(dir, 'target-in-frame-receipt.json'),
  });
  const poseSeed = estimateFiducialPoseSeed({
    targetInFrameReceipt: targetInFrame,
    targetInFramePath: join(dir, 'target-in-frame-receipt.json'),
    out: join(dir, 'pose-seed-receipt.json'),
    fovDeg: 60,
  });
  if (poseSeed.status !== 'pass')
    throw new Error('self-test fiducial board should produce a pose seed');
  if (poseSeed.poseSeed.reprojection.rmsPixels > 1.5)
    throw new Error('self-test pose seed RMS should be low');
  await writeSolidPng(join(dir, 'blank.png'), 640, 360, [128, 128, 128]);
  const missing = await analyzeTargetInFrame({
    framePath: join(dir, 'blank.png'),
    targetPath: fiducialReceipt.outputPath,
    out: join(dir, 'missing-target-in-frame-receipt.json'),
  });
  const blocked = estimateFiducialPoseSeed({
    targetInFrameReceipt: missing,
    targetInFramePath: join(dir, 'missing-target-in-frame-receipt.json'),
    out: join(dir, 'blocked-pose-seed-receipt.json'),
  });
  if (blocked.status !== 'blocked') throw new Error('missing target should block pose seed');
  return { poseSeed, blocked, targetInFrame };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.selfTest) {
    const { poseSeed, blocked } = await selfTest();
    process.stdout.write(
      `holoshell-fiducial-pose-seed self-test PASS ${poseSeed.hash} ${blocked.hash}\n`
    );
    return;
  }
  const out = resolve(REPO_ROOT, args.out ?? defaultOutput(args.date));
  const receipt = estimateFiducialPoseSeed({
    targetInFramePath: args.targetInFrame,
    out,
    fovDeg: args.fovDeg,
    fx: args.fx,
    fy: args.fy,
    cx: args.cx,
    cy: args.cy,
    maxRms: args.maxRms,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        receiptPath: rel(out),
        status: receipt.status,
        poseSeedReady: receipt.poseSeed.poseSeedReady,
        calibrationReady: receipt.poseSeed.calibrationReady,
        reprojectionRms: receipt.poseSeed.reprojection?.rmsPixels,
        intrinsicsSource: receipt.intrinsics.source,
        blockers: receipt.poseSeed.blockers,
      },
      null,
      2
    )}\n`
  );
}

if (
  import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` ||
  process.argv[1]?.endsWith('holoshell-fiducial-pose-seed.mjs')
) {
  main().catch((error) => {
    process.stderr.write(`holoshell-fiducial-pose-seed FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
