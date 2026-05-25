#!/usr/bin/env node
/**
 * HoloShell Target-In-Frame Analyzer
 *
 * Decodes the untouched camera control frame and checks whether the generated
 * geometric control target appears in those pixels. This is a visibility gate,
 * not a camera-pose or fiducial-id solver.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chainReceipt, sha256Bytes, sha256Text, stageReceipt, withHash } from './holoshell/chain/receipts.mjs';
import { generateTarget } from './holoshell-geometric-control-target.mjs';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'holoshell-target-in-frame/v1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

function rel(path) {
  return relative(REPO_ROOT, resolve(path)).replaceAll('\\', '/');
}

function defaultOutput(date) {
  return join('.scratch', 'holoshell-target-in-frame', date, 'target-in-frame-receipt.json');
}

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    workflow: undefined,
    frame: undefined,
    target: undefined,
    out: undefined,
    selfTest: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--date') args.date = argv[++i];
    else if (arg === '--workflow') args.workflow = argv[++i];
    else if (arg === '--frame') args.frame = argv[++i];
    else if (arg === '--target') args.target = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--self-test' || arg === 'self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Target-In-Frame Analyzer ${VERSION}

Usage:
  node scripts/holoshell-target-in-frame-analyzer.mjs --workflow low-camera-workflow.json [--out receipt.json]
  node scripts/holoshell-target-in-frame-analyzer.mjs --frame camera-frame.jpg --target geometric-control-target-receipt.json
  node scripts/holoshell-target-in-frame-analyzer.mjs --self-test

Notes:
  - Reads the untouched camera control frame, not preprocessed HoloMap pixels.
  - Detects target visibility with palette, contrast, and checker/fiducial signal heuristics.
  - Does not claim ArUco/AprilTag ids, camera intrinsics, solvePnP pose, or reprojection readiness.
`);
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

function resolveInputPath(path, baseDir = REPO_ROOT) {
  if (!path) return undefined;
  const absolute = resolve(path);
  if (existsSync(absolute)) return absolute;
  const repoRelative = resolve(REPO_ROOT, path);
  if (existsSync(repoRelative)) return repoRelative;
  const baseRelative = resolve(baseDir, path);
  if (existsSync(baseRelative)) return baseRelative;
  return repoRelative;
}

async function decodeImage(path) {
  const sharp = (await import('sharp')).default;
  const imagePath = resolveInputPath(path);
  if (!imagePath || !existsSync(imagePath)) throw new Error(`Image not found: ${path}`);
  const { data, info } = await sharp(imagePath)
    .rotate()
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels < 3) throw new Error(`Expected RGB image, got ${info.channels} channels`);
  return {
    path: imagePath,
    rgb: Buffer.from(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function uniquePaletteColor(palette, candidate) {
  if (!Array.isArray(candidate.rgb) || candidate.rgb.length < 3) return;
  if (candidate.rgb.every((channel) => channel < 40) || candidate.rgb.every((channel) => channel > 215)) return;
  const key = candidate.rgb.slice(0, 3).join(',');
  if (palette.some((entry) => entry.key === key)) return;
  palette.push({
    key,
    id: candidate.id,
    kind: candidate.kind,
    rgb: candidate.rgb.slice(0, 3).map((value) => Math.round(value)),
  });
}

function paletteFromTarget(targetReceipt) {
  const target = targetReceipt?.target ?? targetReceipt;
  const palette = [];
  for (const primitive of target?.primitives ?? []) {
    uniquePaletteColor(palette, { id: primitive.id, kind: primitive.kind, rgb: primitive.rgb ?? primitive.color });
  }
  for (const fiducial of target?.fiducials ?? []) {
    uniquePaletteColor(palette, { id: fiducial.id, kind: 'fiducial-accent', rgb: fiducial.accentRgb ?? fiducial.accent });
  }
  for (const axis of target?.axes ?? []) {
    uniquePaletteColor(palette, { id: axis.id, kind: 'axis', rgb: axis.color });
  }
  return palette;
}

function colorDistanceSq(r, g, b, color) {
  const dr = r - color[0];
  const dg = g - color[1];
  const db = b - color[2];
  return dr * dr + dg * dg + db * db;
}

function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function analyzePixels(decoded, palette) {
  const { rgb, width, height, channels } = decoded;
  const total = width * height;
  const lum = new Float32Array(total);
  const paletteCounts = new Map(palette.map((entry) => [entry.key, 0]));
  const bbox = { minX: width, minY: height, maxX: -1, maxY: -1 };
  let colorMatches = 0;
  let dark = 0;
  let light = 0;
  let sumLum = 0;
  let sumLumSq = 0;

  for (let index = 0; index < total; index += 1) {
    const offset = index * channels;
    const r = rgb[offset];
    const g = rgb[offset + 1];
    const b = rgb[offset + 2];
    const y = luminance(r, g, b);
    lum[index] = y;
    sumLum += y;
    sumLumSq += y * y;
    if (y < 0.18) dark += 1;
    if (y > 0.82) light += 1;

    const saturationSpread = Math.max(r, g, b) - Math.min(r, g, b);
    if (saturationSpread < 42) continue;
    let best;
    let bestDist = Infinity;
    for (const entry of palette) {
      const dist = colorDistanceSq(r, g, b, entry.rgb);
      if (dist < bestDist) {
        bestDist = dist;
        best = entry;
      }
    }
    if (best && bestDist <= 95 * 95) {
      colorMatches += 1;
      paletteCounts.set(best.key, (paletteCounts.get(best.key) ?? 0) + 1);
      const x = index % width;
      const yPos = Math.floor(index / width);
      bbox.minX = Math.min(bbox.minX, x);
      bbox.minY = Math.min(bbox.minY, yPos);
      bbox.maxX = Math.max(bbox.maxX, x);
      bbox.maxY = Math.max(bbox.maxY, yPos);
    }
  }

  let edgeSum = 0;
  let edgeCount = 0;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 160000)));
  for (let y = 0; y < height - step; y += step) {
    for (let x = 0; x < width - step; x += step) {
      const i = y * width + x;
      edgeSum += Math.abs(lum[i] - lum[i + step]);
      edgeSum += Math.abs(lum[i] - lum[i + step * width]);
      edgeCount += 2;
    }
  }

  const meanLum = sumLum / total;
  const variance = Math.max(0, sumLumSq / total - meanLum * meanLum);
  const colorCoverage = colorMatches / total;
  const paletteHits = palette
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      rgb: entry.rgb,
      pixels: paletteCounts.get(entry.key) ?? 0,
      ratio: round((paletteCounts.get(entry.key) ?? 0) / total),
    }))
    .filter((entry) => entry.pixels > Math.max(3, total * 0.00012))
    .sort((a, b) => b.pixels - a.pixels);

  const diversityScore = clamp01(paletteHits.length / Math.max(4, Math.min(6, palette.length)));
  const colorCoverageScore = clamp01(colorCoverage / 0.035);
  const contrastScore = clamp01(Math.sqrt(variance) / 0.22);
  const blackWhiteScore = clamp01(Math.min(dark / total, light / total) / 0.11);
  const edgeEnergy = edgeCount > 0 ? edgeSum / edgeCount : 0;
  const edgeScore = clamp01(edgeEnergy / 0.085);
  const score = clamp01(
    diversityScore * 0.34 +
      colorCoverageScore * 0.24 +
      blackWhiteScore * 0.2 +
      edgeScore * 0.14 +
      contrastScore * 0.08
  );
  const detected =
    score >= 0.64 &&
    paletteHits.length >= 4 &&
    colorCoverage >= 0.012 &&
    Math.min(dark / total, light / total) >= 0.045;
  const bounds =
    bbox.maxX >= bbox.minX
      ? {
          minX: bbox.minX,
          minY: bbox.minY,
          maxX: bbox.maxX,
          maxY: bbox.maxY,
          width: bbox.maxX - bbox.minX + 1,
          height: bbox.maxY - bbox.minY + 1,
        }
      : undefined;

  return {
    status: detected ? 'detected' : 'not-detected',
    detected,
    score: round(score),
    threshold: 0.64,
    paletteHitCount: paletteHits.length,
    paletteCoverage: round(colorCoverage),
    paletteHits,
    bounds,
    cornerCandidates:
      detected && bounds
        ? [
            { id: 'target-bounds-top-left', x: bounds.minX, y: bounds.minY },
            { id: 'target-bounds-top-right', x: bounds.maxX, y: bounds.minY },
            { id: 'target-bounds-bottom-right', x: bounds.maxX, y: bounds.maxY },
            { id: 'target-bounds-bottom-left', x: bounds.minX, y: bounds.maxY },
          ]
        : [],
    calibrationReady: false,
    metrics: {
      meanLuminance: round(meanLum),
      contrast: round(Math.sqrt(variance)),
      darkPixelRatio: round(dark / total),
      lightPixelRatio: round(light / total),
      edgeEnergy: round(edgeEnergy),
      diversityScore: round(diversityScore),
      colorCoverageScore: round(colorCoverageScore),
      blackWhiteScore: round(blackWhiteScore),
      edgeScore: round(edgeScore),
      contrastScore: round(contrastScore),
    },
    honestScope:
      'Heuristic visibility detection for the generated geometric chart. Bounds are coarse target-presence candidates, not ArUco/AprilTag ids or solvePnP-ready corners.',
  };
}

function workflowInputs(workflow) {
  const framePath = workflow?.control?.frame?.path ?? workflow?.sweep?.control?.frame?.path;
  const targetPath = workflow?.target?.path;
  const inlineTarget = workflow?.target ? { hash: workflow.target.receiptHash, target: workflow.target } : undefined;
  return { framePath, targetPath, inlineTarget };
}

export async function analyzeTargetInFrame({ workflowReceipt, workflowPath, framePath, targetReceipt, targetPath, out } = {}) {
  const workflow = workflowReceipt ?? (workflowPath ? readJson(workflowPath) : undefined);
  const workflowDerived = workflowInputs(workflow);
  const resolvedFramePath = framePath ?? workflowDerived.framePath;
  const resolvedTargetPath = targetPath ?? workflowDerived.targetPath;
  const resolvedTargetReceipt =
    targetReceipt ?? (resolvedTargetPath ? readJson(resolvedTargetPath) : workflowDerived.inlineTarget);
  if (!resolvedFramePath) throw new Error('--frame is required when --workflow does not provide a control frame');
  if (!resolvedTargetReceipt) throw new Error('--target is required when --workflow does not provide a target receipt');

  const decoded = await decodeImage(resolvedFramePath);
  const palette = paletteFromTarget(resolvedTargetReceipt);
  if (palette.length < 4) throw new Error('Target receipt does not provide enough colored palette entries');
  const detection = analyzePixels(decoded, palette);
  const frameAbsolute = resolveInputPath(resolvedFramePath);
  const targetAbsolute = resolvedTargetPath ? resolveInputPath(resolvedTargetPath) : undefined;
  const stage = stageReceipt({
    name: 'target.detect-in-control-frame',
    input: {
      workflowPath: workflowPath ? rel(workflowPath) : undefined,
      framePath: rel(frameAbsolute),
      targetPath: targetAbsolute ? rel(targetAbsolute) : undefined,
      frameHash: fileHash(frameAbsolute),
      targetHash: targetAbsolute ? fileHash(targetAbsolute) : resolvedTargetReceipt.hash,
    },
    output: {
      status: detection.status,
      score: detection.score,
      paletteHitCount: detection.paletteHitCount,
      paletteCoverage: detection.paletteCoverage,
      bounds: detection.bounds,
      cornerCandidateCount: detection.cornerCandidates.length,
    },
    metrics: detection.metrics,
    honestScope:
      'Reads only the untouched camera control frame and generated target receipt. This stage does not preprocess, reconstruct, or estimate camera pose.',
  });
  const chain = {
    receipt: chainReceipt({
      name: 'holoshell-target-in-frame',
      stages: [stage],
      metrics: {
        analyzerStatus: 'pass',
        detectionStatus: detection.status,
        score: detection.score,
      },
      honestScope:
        'Single-stage target visibility analyzer. Detection can fail without failing the analyzer itself.',
    }),
    stages: [stage],
  };
  const receipt = withHash({
    id: `holoshell-target-in-frame-${sha256Text(`${fileHash(frameAbsolute)}:${resolvedTargetReceipt.hash ?? ''}`).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    analyzerVersion: VERSION,
    status: 'pass',
    action: 'detect-generated-target-in-untouched-camera-control-frame',
    generatedAt: new Date().toISOString(),
    workflowPath: workflowPath ? rel(workflowPath) : undefined,
    frame: {
      path: rel(frameAbsolute),
      fileHash: fileHash(frameAbsolute),
      width: decoded.width,
      height: decoded.height,
      channels: decoded.channels,
    },
    target: {
      path: targetAbsolute ? rel(targetAbsolute) : undefined,
      receiptHash: resolvedTargetReceipt.hash,
      pngPath: resolvedTargetReceipt.target?.pngPath,
      pngHash: resolvedTargetReceipt.target?.pngHash,
      palette,
    },
    detection,
    honestScope:
      'Analyzes whether the generated control target is visible in the raw camera control frame. A pass receipt means the analyzer ran; detection.status says whether the target was found.',
    chain,
    outputPath: out ? rel(out) : undefined,
  });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(`Invalid target-in-frame receipt: ${errors.join('; ')}`);
  if (out) writeJson(out, receipt);
  return receipt;
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt must be an object');
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (receipt.status !== 'pass') errors.push('status must be pass');
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  if (!receipt.frame?.fileHash?.startsWith('sha256:')) errors.push('frame hash missing');
  if (!(receipt.frame?.width > 0) || !(receipt.frame?.height > 0)) errors.push('frame dimensions missing');
  if (!Array.isArray(receipt.target?.palette) || receipt.target.palette.length < 4) errors.push('target palette missing');
  if (!['detected', 'not-detected'].includes(receipt.detection?.status)) errors.push('detection status mismatch');
  if (!(receipt.detection?.score >= 0)) errors.push('detection score missing');
  if (!Array.isArray(receipt.detection?.cornerCandidates)) errors.push('corner candidates missing');
  if (receipt.detection?.status === 'detected' && receipt.detection.cornerCandidates.length < 4) {
    errors.push('detected target must provide bounds corner candidates');
  }
  if (receipt.detection?.calibrationReady !== false) errors.push('calibrationReady must be false for heuristic detector');
  if (!receipt.chain?.receipt?.hash?.startsWith('sha256:')) errors.push('chain receipt hash missing');
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
  await sharp(data, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9 }).toFile(resolve(REPO_ROOT, path));
}

export async function selfTest() {
  const dir = join('.scratch', 'holoshell-target-in-frame-self-test');
  const targetReceipt = await generateTarget({
    out: join(dir, 'target-receipt.json'),
    png: join(dir, 'target.png'),
    width: 640,
    height: 360,
  });
  const detected = await analyzeTargetInFrame({
    framePath: targetReceipt.target.pngPath,
    targetPath: targetReceipt.outputPath,
    out: join(dir, 'detected-receipt.json'),
  });
  if (detected.detection.status !== 'detected') throw new Error('self-test target PNG should be detected');
  await writeSolidPng(join(dir, 'blank.png'), 320, 240, [128, 128, 128]);
  const missing = await analyzeTargetInFrame({
    framePath: join(dir, 'blank.png'),
    targetPath: targetReceipt.outputPath,
    out: join(dir, 'missing-receipt.json'),
  });
  if (missing.detection.status !== 'not-detected') throw new Error('self-test blank image should not detect target');
  return { detected, missing };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.selfTest) {
    const { detected, missing } = await selfTest();
    process.stdout.write(`holoshell-target-in-frame self-test PASS ${detected.hash} ${missing.hash}\n`);
    return;
  }
  const workflowPath = args.workflow ? resolve(REPO_ROOT, args.workflow) : undefined;
  const outPath = resolve(REPO_ROOT, args.out ?? defaultOutput(args.date));
  const receipt = await analyzeTargetInFrame({
    workflowPath,
    framePath: args.frame,
    targetPath: args.target,
    out: outPath,
  });
  process.stdout.write(`${JSON.stringify({
    status: receipt.status,
    receiptPath: receipt.outputPath,
    detection: {
      status: receipt.detection.status,
      score: receipt.detection.score,
      paletteHitCount: receipt.detection.paletteHitCount,
      paletteCoverage: receipt.detection.paletteCoverage,
      bounds: receipt.detection.bounds,
      calibrationReady: receipt.detection.calibrationReady,
    },
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('holoshell-target-in-frame-analyzer.mjs')) {
  main().catch((error) => {
    process.stderr.write(`holoshell-target-in-frame FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
