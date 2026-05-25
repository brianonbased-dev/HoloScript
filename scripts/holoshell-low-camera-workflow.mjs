#!/usr/bin/env node
/**
 * HoloShell Low-Camera Workflow
 *
 * One native-camera command for the low-quality camera ratchet:
 *   1. generate a known camera control target
 *   2. capture once and fair-sweep all preprocess modes
 *   3. render the winning HoloGram bridge as a quilt preview
 *   4. emit a top-level chain receipt linking all receipts
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chainReceipt, sha256Bytes, sha256Text, stageReceipt, withHash } from './holoshell/chain/receipts.mjs';
import { buildTechnologyPlan } from './holoshell-reconstruction-tech-plan.mjs';
import { analyzeTargetInFrame } from './holoshell-target-in-frame-analyzer.mjs';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'holoshell-low-camera-workflow/v1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

function rel(path) {
  return relative(REPO_ROOT, resolve(path)).replaceAll('\\', '/');
}

function defaultOutput(date) {
  return join('.scratch', 'holoshell-low-camera-fixture', date, 'low-camera-workflow-receipt.json');
}

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    out: undefined,
    targetOut: undefined,
    targetPng: undefined,
    targetDetectionOut: undefined,
    sweepOut: undefined,
    renderOut: undefined,
    deviceIndex: 0,
    width: 96,
    height: 72,
    frames: 15,
    intervalMs: 200,
    durationSec: undefined,
    fps: undefined,
    tileGrid: 32,
    tileWidth: 160,
    tileHeight: 120,
    requireCapture: false,
    geometricTarget: true,
    targetProfile: 'fiducial-board',
    selfTest: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--date') args.date = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--target-out') args.targetOut = argv[++i];
    else if (arg === '--target-png') args.targetPng = argv[++i];
    else if (arg === '--target-detection-out') args.targetDetectionOut = argv[++i];
    else if (arg === '--sweep-out') args.sweepOut = argv[++i];
    else if (arg === '--render-out') args.renderOut = argv[++i];
    else if (arg === '--device-index') args.deviceIndex = Number.parseInt(argv[++i], 10);
    else if (arg === '--width') args.width = Number.parseInt(argv[++i], 10);
    else if (arg === '--height') args.height = Number.parseInt(argv[++i], 10);
    else if (arg === '--frames') args.frames = Number.parseInt(argv[++i], 10);
    else if (arg === '--interval-ms') args.intervalMs = Number.parseInt(argv[++i], 10);
    else if (arg === '--duration-sec') args.durationSec = Number.parseFloat(argv[++i]);
    else if (arg === '--fps') args.fps = Number.parseFloat(argv[++i]);
    else if (arg === '--tile-grid') args.tileGrid = Number.parseInt(argv[++i], 10);
    else if (arg === '--tile-width') args.tileWidth = Number.parseInt(argv[++i], 10);
    else if (arg === '--tile-height') args.tileHeight = Number.parseInt(argv[++i], 10);
    else if (arg === '--require-capture') args.requireCapture = true;
    else if (arg === '--geometric-target') args.geometricTarget = true;
    else if (arg === '--no-geometric-target') args.geometricTarget = false;
    else if (arg === '--control-target') args.geometricTarget = true;
    else if (arg === '--no-control-target') args.geometricTarget = false;
    else if (arg === '--target-profile') args.targetProfile = argv[++i];
    else if (arg === '--self-test' || arg === 'self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.help || args.selfTest) return args;
  if (!Number.isInteger(args.deviceIndex) || args.deviceIndex < 0) throw new Error('--device-index must be non-negative');
  if (!Number.isInteger(args.width) || args.width < 2 || args.width > 640) throw new Error('--width must be 2..640');
  if (!Number.isInteger(args.height) || args.height < 2 || args.height > 480) throw new Error('--height must be 2..480');
  if (!Number.isInteger(args.frames) || args.frames < 1 || args.frames > 120) throw new Error('--frames must be 1..120');
  if (!Number.isInteger(args.intervalMs) || args.intervalMs < 0 || args.intervalMs > 10000) {
    throw new Error('--interval-ms must be 0..10000');
  }
  if (args.durationSec !== undefined && (!Number.isFinite(args.durationSec) || args.durationSec <= 0 || args.durationSec > 60)) {
    throw new Error('--duration-sec must be > 0 and <= 60');
  }
  if (args.fps !== undefined && (!Number.isFinite(args.fps) || args.fps < 0.2 || args.fps > 5)) {
    throw new Error('--fps must be 0.2..5');
  }
  if (!Number.isInteger(args.tileGrid) || args.tileGrid < 1 || args.tileGrid > 32) throw new Error('--tile-grid must be 1..32');
  if (!Number.isInteger(args.tileWidth) || args.tileWidth < 16 || args.tileWidth > 1024) {
    throw new Error('--tile-width must be 16..1024');
  }
  if (!Number.isInteger(args.tileHeight) || args.tileHeight < 16 || args.tileHeight > 1024) {
    throw new Error('--tile-height must be 16..1024');
  }
  if (args.frames > 1 && args.intervalMs === 0) throw new Error('--interval-ms must be > 0 with multiple frames');
  if (!['fiducial-board', 'geometric-control-target'].includes(args.targetProfile)) {
    throw new Error('--target-profile must be fiducial-board or geometric-control-target');
  }
  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Low-Camera Workflow ${VERSION}

Usage:
  node scripts/holoshell-low-camera-workflow.mjs [--frames 15] [--interval-ms 200] [--require-capture]
  node scripts/holoshell-low-camera-workflow.mjs --target-profile fiducial-board
  node scripts/holoshell-low-camera-workflow.mjs --frames 2 --width 64 --height 48 --tile-width 80 --tile-height 60
  node scripts/holoshell-low-camera-workflow.mjs --self-test

Notes:
  - Uses the native WinRT camera sweep, not browser getUserMedia.
  - Generates a known fiducial/control target receipt before capture for calibration/control.
  - Keeps a plain camera JPEG control frame before preprocessing, HoloMap, or HoloGram rendering.
  - Replays one raw capture through every preprocess mode, renders the winning bridge, and links both receipts.
  - Writes .scratch/holoshell-low-camera-fixture/<date>/low-camera-workflow-receipt.json by default.
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

function summarizeControl(sweepReceipt) {
  const frames = Array.isArray(sweepReceipt.frames) ? sweepReceipt.frames : [];
  const controlFrames = frames
    .filter((frame) => frame.keptFramePath)
    .map((frame) => ({
      index: frame.index,
      source: 'windows-winrt-mediacapture-jpeg',
      path: frame.keptFramePath,
      jpegHash: frame.jpegHash,
      fileHash: fileHash(frame.keptFramePath),
      rawRgbHash: frame.rawRgbHash,
      rawQuality: frame.rawQuality,
      capturedAt: frame.capturedAt,
      honestScope:
        'Plain native camera JPEG copied before preprocessing, HoloMap reconstruction, geometry generation, or quilt rendering.',
    }));
  return {
    frame: controlFrames[0],
    frames: controlFrames,
    frameCount: controlFrames.length,
  };
}

function summarizeTarget(targetReceipt, targetReceiptPath) {
  if (!targetReceipt) return undefined;
  const markerCount = Array.isArray(targetReceipt.target?.markers) ? targetReceipt.target.markers.length : undefined;
  return {
    path: rel(targetReceiptPath),
    receiptHash: targetReceipt.hash,
    fileHash: fileHash(targetReceiptPath),
    profile: targetReceipt.target?.profile ?? targetReceipt.schemaVersion?.replace(/^holoshell-|\/v\d+$/g, ''),
    dictionary: targetReceipt.target?.dictionary,
    compatibility: targetReceipt.target?.compatibility,
    pngPath: targetReceipt.target?.pngPath,
    pngHash: targetReceipt.target?.pngHash,
    pngFileHash: targetReceipt.target?.pngPath ? fileHash(targetReceipt.target.pngPath) : undefined,
    width: targetReceipt.target?.width,
    height: targetReceipt.target?.height,
    checkerboard: targetReceipt.target?.checkerboard,
    markerGrid: targetReceipt.target?.markerGrid,
    markerCount,
    markerIds: targetReceipt.target?.markers?.map((marker) => marker.id),
    markers: targetReceipt.target?.markers,
    primitiveCount: Array.isArray(targetReceipt.target?.primitives) ? targetReceipt.target.primitives.length : undefined,
    fiducialCount: Array.isArray(targetReceipt.target?.fiducials) ? targetReceipt.target.fiducials.length : undefined,
    primitives: targetReceipt.target?.primitives,
    fiducials: targetReceipt.target?.fiducials,
    chainHash: targetReceipt.chain?.receipt?.hash,
    honestScope:
      'Known generated camera reference target. It does not prove the camera saw the target; the camera control frame remains the captured baseline.',
  };
}

function summarizeTargetDetection(targetDetectionReceipt, targetDetectionReceiptPath) {
  if (!targetDetectionReceipt) return undefined;
  return {
    path: rel(targetDetectionReceiptPath),
    receiptHash: targetDetectionReceipt.hash,
    fileHash: fileHash(targetDetectionReceiptPath),
    status: targetDetectionReceipt.status,
    frame: targetDetectionReceipt.frame,
    target: {
      path: targetDetectionReceipt.target?.path,
      receiptHash: targetDetectionReceipt.target?.receiptHash,
      profile: targetDetectionReceipt.target?.profile,
      dictionary: targetDetectionReceipt.target?.dictionary,
      pngPath: targetDetectionReceipt.target?.pngPath,
      pngHash: targetDetectionReceipt.target?.pngHash,
      markerCount: targetDetectionReceipt.target?.markerCount,
      paletteCount: Array.isArray(targetDetectionReceipt.target?.palette) ? targetDetectionReceipt.target.palette.length : undefined,
    },
    detection: targetDetectionReceipt.detection,
    chainHash: targetDetectionReceipt.chain?.receipt?.hash,
    honestScope:
      'Target visibility evidence from the untouched camera control frame. A pass receipt means the analyzer ran; detection.status says whether the target was found.',
  };
}

function runNodeScript(scriptPath, scriptArgs, { allowExitCodes = [0] } = {}) {
  const command = [rel(scriptPath), ...scriptArgs];
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
  });
  if (!allowExitCodes.includes(result.status ?? 1)) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    throw new Error(
      `${command.join(' ')} exited ${result.status ?? 'unknown'}${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ''}`
    );
  }
  return {
    command,
    exitCode: result.status ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function summarizeSweep(sweepReceipt, sweepReceiptPath) {
  const winner = sweepReceipt.sweep?.winner;
  const control = summarizeControl(sweepReceipt);
  return {
    path: rel(sweepReceiptPath),
    receiptHash: sweepReceipt.hash,
    fileHash: fileHash(sweepReceiptPath),
    status: sweepReceipt.status,
    winner,
    rawVideoHash: sweepReceipt.sweep?.rawVideoHash ?? sweepReceipt.capture?.rawVideoHash,
    pointCount: sweepReceipt.holomap?.pointCount,
    replayFingerprint: sweepReceipt.holomap?.replayFingerprint,
    bridgePath: sweepReceipt.hologramBridge?.artifactPath ?? winner?.hologramBridgeArtifactPath,
    control,
    chainHash: sweepReceipt.chain?.receipt?.hash,
    ranking: sweepReceipt.sweep?.ranking,
  };
}

function summarizeRender(renderReceipt, renderReceiptPath) {
  return {
    path: rel(renderReceiptPath),
    receiptHash: renderReceipt.hash,
    fileHash: fileHash(renderReceiptPath),
    status: renderReceipt.status,
    pointCount: renderReceipt.source?.pointCount,
    temporalMode: renderReceipt.source?.temporalMode,
    quiltPath: renderReceipt.quilt?.path,
    pngHash: renderReceipt.quilt?.pngHash,
    pngFileHash: renderReceipt.quilt?.path ? fileHash(renderReceipt.quilt.path) : undefined,
    quality: renderReceipt.quilt?.quality,
    views: renderReceipt.quilt?.views,
    width: renderReceipt.quilt?.width,
    height: renderReceipt.quilt?.height,
    chainHash: renderReceipt.chain?.receipt?.hash,
  };
}

export function buildWorkflowReceipt({
  args,
  targetReceipt,
  targetReceiptPath,
  sweepReceipt,
  sweepReceiptPath,
  renderReceipt,
  renderReceiptPath,
  targetDetectionReceipt,
  targetDetectionReceiptPath,
  commands,
}) {
  const target = summarizeTarget(targetReceipt, targetReceiptPath);
  const sweep = summarizeSweep(sweepReceipt, sweepReceiptPath);
  const render = renderReceipt ? summarizeRender(renderReceipt, renderReceiptPath) : undefined;
  const targetDetection = summarizeTargetDetection(targetDetectionReceipt, targetDetectionReceiptPath);
  const capturePlan = {
    deviceIndex: args.deviceIndex,
    width: args.width,
    height: args.height,
    frames: args.frames,
    intervalMs: args.intervalMs,
    durationSec: args.durationSec,
    fps: args.fps,
    tileGrid: args.tileGrid,
    geometricTarget: args.geometricTarget,
    targetProfile: args.targetProfile,
  };
  const renderPlan = {
    tileWidth: args.tileWidth,
    tileHeight: args.tileHeight,
  };
  const technologyPlan = buildTechnologyPlan({
    workflowReceipt: {
      status: sweep.status === 'pass' && render?.status === 'pass' ? 'pass' : sweep.status,
      capturePlan,
      renderPlan,
      target,
      targetDetection,
      sweep,
      control: sweep.control,
      render,
      quality: render?.quality,
    },
  });
  const targetStage = target
    ? stageReceipt({
        name: 'workflow.control-target',
        input: {
          command: commands.target?.command,
          targetReceiptPath: target.path,
          targetProfile: target.profile,
        },
        output: {
          profile: target.profile,
          dictionary: target.dictionary,
          pngPath: target.pngPath,
          pngHash: target.pngHash,
          width: target.width,
          height: target.height,
          markerCount: target.markerCount,
          primitiveCount: target.primitiveCount,
          fiducialCount: target.fiducialCount,
          receiptHash: target.receiptHash,
          fileHash: target.fileHash,
        },
        metrics: {
          exitCode: commands.target?.exitCode,
          checkerboardColumns: target.checkerboard?.columns,
          checkerboardRows: target.checkerboard?.rows,
        },
        honestScope:
          'Generates the known control target before camera capture. This is a calibration asset, not a captured image.',
      })
    : undefined;
  const sweepStage = stageReceipt({
    name: 'workflow.preprocess-sweep',
    input: {
      command: commands.sweep.command,
      sweepReceiptPath: sweep.path,
    },
    output: {
      status: sweep.status,
      winner: sweep.winner,
      rawVideoHash: sweep.rawVideoHash,
      pointCount: sweep.pointCount,
      bridgePath: sweep.bridgePath,
      control: sweep.control,
      receiptHash: sweep.receiptHash,
      fileHash: sweep.fileHash,
    },
    metrics: {
      exitCode: commands.sweep.exitCode,
      modeCount: Array.isArray(sweep.ranking) ? sweep.ranking.length : undefined,
      warningCount: sweep.winner?.warningCount,
    },
    honestScope:
      'Runs the native-camera fair preprocess sweep and records the winning HoloMap bridge. The sweep receipt carries per-mode evidence.',
  });
  const stages = targetStage ? [targetStage, sweepStage] : [sweepStage];
  if (targetDetection) {
    stages.push(stageReceipt({
      name: 'workflow.target-in-frame-analysis',
      input: {
        command: commands.targetDetection?.command,
        targetDetectionReceiptPath: targetDetection.path,
        controlFramePath: sweep.control?.frame?.path,
        targetReceiptPath: target?.path,
      },
      output: {
        status: targetDetection.status,
        detectionStatus: targetDetection.detection?.status,
        score: targetDetection.detection?.score,
        paletteHitCount: targetDetection.detection?.paletteHitCount,
        cornerCandidateCount: targetDetection.detection?.cornerCandidates?.length,
        recoveredMarkerCount: targetDetection.detection?.recoveredMarkerCount,
        markerCornerCount: targetDetection.detection?.markerCornerCount,
        poseSolveInputReady: targetDetection.detection?.poseSolveInputReady,
        receiptHash: targetDetection.receiptHash,
        fileHash: targetDetection.fileHash,
      },
      metrics: {
        exitCode: commands.targetDetection?.exitCode,
        score: targetDetection.detection?.score,
        paletteCoverage: targetDetection.detection?.paletteCoverage,
        recoveredMarkerCount: targetDetection.detection?.recoveredMarkerCount,
        markerCornerCount: targetDetection.detection?.markerCornerCount,
        poseSolveInputReady: targetDetection.detection?.poseSolveInputReady,
        calibrationReady: targetDetection.detection?.calibrationReady,
      },
      honestScope:
        'Checks whether the generated target is visible in the untouched control frame. This is not camera pose calibration.',
    }));
  }
  if (render) {
    stages.push(stageReceipt({
      name: 'workflow.render-winning-quilt',
      input: {
        command: commands.render?.command,
        bridgePath: sweep.bridgePath,
        renderReceiptPath: render.path,
      },
      output: {
        status: render.status,
        quiltPath: render.quiltPath,
        pngHash: render.pngHash,
        quality: render.quality,
        receiptHash: render.receiptHash,
        fileHash: render.fileHash,
      },
      metrics: {
        exitCode: commands.render?.exitCode,
        pointCount: render.pointCount,
        views: render.views,
        width: render.width,
        height: render.height,
        qualityScore: render.quality?.score,
        warningCount: render.quality?.warnings?.length,
      },
      honestScope:
        'Renders the winning HoloGram bridge into a deterministic quilt preview. This is not MV-HEVC export.',
    }));
  }
  const chain = {
    receipt: chainReceipt({
      name: 'holoshell-low-camera-workflow',
      stages,
      metrics: {
        status: sweep.status === 'pass' && render?.status === 'pass' ? 'pass' : sweep.status,
        geometricTarget: Boolean(target),
        targetProfile: target?.profile,
        targetDetectionStatus: targetDetection?.detection?.status,
        winningPreprocess: sweep.winner?.mode,
        pointCount: render?.pointCount ?? sweep.pointCount,
        rendered: Boolean(render),
        quiltQualityScore: render?.quality?.score,
        quiltQualityGrade: render?.quality?.grade,
      },
      honestScope:
        'Top-level workflow chain linking known control target, native camera sweep, and winning HoloGram quilt render receipts.',
    }),
    stages,
  };

  return withHash({
    id: `holoshell-low-camera-workflow-${sha256Text(`${sweep.receiptHash}:${render?.receiptHash ?? 'blocked'}`).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    workflowVersion: VERSION,
    status: sweep.status === 'pass' && render?.status === 'pass' ? 'pass' : sweep.status,
    action: 'direct-native-camera-holomap-hologram-low-camera-workflow',
    generatedAt: new Date().toISOString(),
    capturePlan: {
      ...capturePlan,
    },
    renderPlan,
    target,
    targetDetection,
    sweep,
    control: sweep.control,
    render,
    quality: render?.quality,
    technologyPlan,
    commands: {
      target: commands.target?.command,
      targetDetection: commands.targetDetection?.command,
      sweep: commands.sweep.command,
      render: commands.render?.command,
    },
    honestScope:
      'Hardware-native workflow evidence for inferior cameras. It records a known control target, keeps the untouched camera control frame, compares preprocessing fairly from one capture, then renders the winning HoloMap bridge.',
    chain,
    outputPath: rel(args.out ?? defaultOutput(args.date)),
  });
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt must be an object');
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (!['pass', 'blocked'].includes(receipt.status)) errors.push('status must be pass or blocked');
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  if (!receipt.sweep?.receiptHash?.startsWith('sha256:')) errors.push('sweep receipt hash missing');
  if (!receipt.sweep?.fileHash?.startsWith('sha256:')) errors.push('sweep file hash missing');
  if (receipt.status === 'pass') {
    const targetExpected = receipt.capturePlan?.geometricTarget !== false;
    if (targetExpected && !receipt.target?.receiptHash?.startsWith('sha256:')) errors.push('control target receipt hash missing');
    if (targetExpected && !receipt.target?.pngHash?.startsWith('sha256:')) errors.push('control target PNG hash missing');
    if (targetExpected && !receipt.target?.pngPath) errors.push('control target PNG path missing');
    if (targetExpected && !receipt.target?.pngFileHash?.startsWith('sha256:')) errors.push('control target PNG file hash missing');
    if (targetExpected && !receipt.target?.profile) errors.push('control target profile missing');
    if (receipt.capturePlan?.targetProfile === 'fiducial-board' && !(receipt.target?.markerCount >= 9)) {
      errors.push('fiducial board marker metadata missing');
    }
    if (targetExpected && !receipt.targetDetection?.receiptHash?.startsWith('sha256:')) {
      errors.push('target detection receipt hash missing');
    }
    if (targetExpected && !['detected', 'not-detected'].includes(receipt.targetDetection?.detection?.status)) {
      errors.push('target detection status missing');
    }
    if (targetExpected && receipt.targetDetection?.detection?.calibrationReady !== false) {
      errors.push('target detection must not claim calibration readiness');
    }
    if (!receipt.sweep?.winner?.mode) errors.push('winner missing');
    if (!receipt.sweep?.bridgePath) errors.push('winning bridge path missing');
    if (!receipt.control?.frame?.path) errors.push('camera control frame missing');
    if (!receipt.control?.frame?.fileHash?.startsWith('sha256:')) errors.push('camera control frame hash missing');
    if (!receipt.render?.receiptHash?.startsWith('sha256:')) errors.push('render receipt hash missing');
    if (!receipt.render?.pngHash?.startsWith('sha256:')) errors.push('quilt png hash missing');
    if (!receipt.render?.quiltPath) errors.push('quilt path missing');
    if (!(receipt.render?.quality?.score >= 0)) errors.push('quilt quality score missing');
    if (!Array.isArray(receipt.technologyPlan?.recommendations) || receipt.technologyPlan.recommendations.length < 6) {
      errors.push('technology recommendations missing');
    }
    if (!receipt.technologyPlan?.recommendedNow?.includes('fiducial-calibration')) {
      errors.push('fiducial calibration technology recommendation missing');
    }
  }
  if (!receipt.chain?.receipt?.hash?.startsWith('sha256:')) errors.push('chain receipt hash missing');
  if (!Array.isArray(receipt.chain?.stages) || receipt.chain.stages.length < 1) errors.push('chain stages missing');
  return errors;
}

export async function runWorkflow(args) {
  const outPath = resolve(REPO_ROOT, args.out ?? defaultOutput(args.date));
  const baseDir = dirname(outPath);
  const targetSlug = args.targetProfile === 'geometric-control-target' ? 'geometric-control-target' : 'fiducial-board';
  const targetOut = resolve(REPO_ROOT, args.targetOut ?? join(baseDir, `${targetSlug}-receipt.json`));
  const targetPng = resolve(REPO_ROOT, args.targetPng ?? join(baseDir, `${targetSlug}.png`));
  const targetDetectionOut = resolve(REPO_ROOT, args.targetDetectionOut ?? join(baseDir, 'target-in-frame-receipt.json'));
  const sweepOut = resolve(REPO_ROOT, args.sweepOut ?? join(baseDir, 'preprocess-sweep-workflow.json'));
  const renderOut = resolve(REPO_ROOT, args.renderOut ?? join(baseDir, 'workflow-winner-quilt.json'));
  mkdirSync(baseDir, { recursive: true });

  let targetCommand;
  let targetReceipt;
  if (args.geometricTarget) {
    const targetScript =
      args.targetProfile === 'geometric-control-target'
        ? 'scripts/holoshell-geometric-control-target.mjs'
        : 'scripts/holoshell-fiducial-board.mjs';
    targetCommand = runNodeScript(resolve(REPO_ROOT, targetScript), [
      '--out',
      rel(targetOut),
      '--png',
      rel(targetPng),
    ]);
    targetReceipt = readJson(targetOut);
  }

  const sweepArgs = [
    'sweep',
    '--out',
    rel(sweepOut),
    '--device-index',
    String(args.deviceIndex),
    '--width',
    String(args.width),
    '--height',
    String(args.height),
    '--frames',
    String(args.frames),
    '--interval-ms',
    String(args.intervalMs),
    '--tile-grid',
    String(args.tileGrid),
    '--keep-frame',
  ];
  if (args.durationSec !== undefined) sweepArgs.push('--duration-sec', String(args.durationSec));
  if (args.fps !== undefined) sweepArgs.push('--fps', String(args.fps));
  if (args.requireCapture) sweepArgs.push('--require-capture');
  const sweepCommand = runNodeScript(resolve(REPO_ROOT, 'scripts/holoshell-camera-scan-adapter.mjs'), sweepArgs, {
    allowExitCodes: args.requireCapture ? [0] : [0, 2],
  });
  const sweepReceipt = readJson(sweepOut);
  if (sweepReceipt.status !== 'pass') {
    const receipt = buildWorkflowReceipt({
      args: { ...args, out: outPath },
      targetReceipt,
      targetReceiptPath: args.geometricTarget ? targetOut : undefined,
      sweepReceipt,
      sweepReceiptPath: sweepOut,
      renderReceipt: undefined,
      renderReceiptPath: undefined,
      targetDetectionReceipt: undefined,
      targetDetectionReceiptPath: undefined,
      commands: { target: targetCommand, targetDetection: undefined, sweep: sweepCommand, render: undefined },
    });
    writeJson(outPath, receipt);
    return receipt;
  }

  const bridgePath = sweepReceipt.hologramBridge?.artifactPath ?? sweepReceipt.sweep?.winner?.hologramBridgeArtifactPath;
  if (!bridgePath) throw new Error('Sweep receipt did not name a winning HoloGram bridge');
  const controlFrame = summarizeControl(sweepReceipt).frame;
  let targetDetectionCommand;
  let targetDetectionReceipt;
  if (args.geometricTarget && targetReceipt && controlFrame?.path) {
    await analyzeTargetInFrame({
      framePath: controlFrame.path,
      targetPath: targetOut,
      out: targetDetectionOut,
    });
    targetDetectionCommand = {
      command: [
        'internal:analyzeTargetInFrame',
        '--frame',
        controlFrame.path,
        '--target',
        rel(targetOut),
        '--out',
        rel(targetDetectionOut),
      ],
      exitCode: 0,
    };
    targetDetectionReceipt = readJson(targetDetectionOut);
  }
  const renderArgs = [
    '--bridge',
    bridgePath,
    '--out',
    rel(renderOut),
    '--tile-width',
    String(args.tileWidth),
    '--tile-height',
    String(args.tileHeight),
  ];
  const renderCommand = runNodeScript(resolve(REPO_ROOT, 'scripts/holoshell-hologram-bridge-renderer.mjs'), renderArgs);
  const renderReceipt = readJson(renderOut);
  const receipt = buildWorkflowReceipt({
    args: { ...args, out: outPath },
    targetReceipt,
    targetReceiptPath: args.geometricTarget ? targetOut : undefined,
    sweepReceipt,
    sweepReceiptPath: sweepOut,
    renderReceipt,
    renderReceiptPath: renderOut,
    targetDetectionReceipt,
    targetDetectionReceiptPath: targetDetectionReceipt ? targetDetectionOut : undefined,
    commands: { target: targetCommand, targetDetection: targetDetectionCommand, sweep: sweepCommand, render: renderCommand },
  });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(`Invalid workflow receipt: ${errors.join('; ')}`);
  writeJson(outPath, receipt);
  return receipt;
}

export async function selfTest() {
  const dir = resolve(REPO_ROOT, '.scratch', 'holoshell-low-camera-workflow-self-test');
  mkdirSync(dir, { recursive: true });
  const targetPath = join(dir, 'target.json');
  const targetPngPath = join(dir, 'target.png');
  const targetDetectionPath = join(dir, 'target-detection.json');
  const sweepPath = join(dir, 'sweep.json');
  const quiltPath = join(dir, 'quilt.png');
  const renderPath = join(dir, 'render.json');
  writeFileSync(quiltPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  writeFileSync(targetPngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const targetReceipt = withHash({
    schemaVersion: 'holoshell-fiducial-board/v1',
    status: 'pass',
    target: {
      profile: 'fiducial-board',
      dictionary: 'holoshell-native-binary-7x7-v1',
      compatibility: { opencvAruco: false, aprilTag: false },
      pngPath: rel(targetPngPath),
      pngHash: fileHash(targetPngPath),
      width: 320,
      height: 240,
      markerGrid: { rows: 3, columns: 3, cells: 7, innerCells: 5 },
      markers: Array.from({ length: 9 }, (_, index) => ({
        id: `hs-${index + 1}`,
        numericId: index + 1,
        payload: Array.from({ length: 25 }, (__, bit) => (bit + index) % 2),
      })),
      primitives: [
        { id: 'cyan-center-axis', kind: 'axis', rgb: [0, 174, 204] },
        { id: 'magenta-center-axis', kind: 'axis', rgb: [210, 42, 214] },
      ],
      fiducials: [
        { id: 'top-left', accentRgb: [225, 32, 42] },
        { id: 'top-center', accentRgb: [0, 174, 204] },
        { id: 'top-right', accentRgb: [18, 170, 74] },
        { id: 'center-left', accentRgb: [255, 190, 42] },
        { id: 'center', accentRgb: [210, 42, 214] },
        { id: 'center-right', accentRgb: [38, 86, 225] },
        { id: 'bottom-left', accentRgb: [255, 120, 28] },
        { id: 'bottom-center', accentRgb: [0, 150, 120] },
        { id: 'bottom-right', accentRgb: [120, 70, 255] },
      ],
    },
    chain: { receipt: { hash: 'sha256:' + 'd'.repeat(64) } },
  });
  writeJson(targetPath, targetReceipt);
  const targetDetectionReceipt = withHash({
    schemaVersion: 'holoshell-target-in-frame/v1',
    status: 'pass',
    frame: {
      path: rel(quiltPath),
      fileHash: fileHash(quiltPath),
      width: 64,
      height: 48,
      channels: 3,
    },
    target: {
      path: rel(targetPath),
      receiptHash: targetReceipt.hash,
      profile: targetReceipt.target.profile,
      dictionary: targetReceipt.target.dictionary,
      pngPath: rel(targetPngPath),
      pngHash: fileHash(targetPngPath),
      markerCount: targetReceipt.target.markers.length,
      palette: [
        { id: 'red-square', kind: 'square', rgb: [225, 32, 42] },
        { id: 'green-circle', kind: 'circle', rgb: [18, 170, 74] },
        { id: 'blue-triangle', kind: 'triangle', rgb: [38, 86, 225] },
        { id: 'magenta-diamond', kind: 'diamond', rgb: [210, 42, 214] },
      ],
    },
    detection: {
      status: 'not-detected',
      detected: false,
      detectionMode: 'none',
      score: 0.12,
      threshold: 0.64,
      paletteHitCount: 0,
      paletteCoverage: 0,
      cornerCandidates: [],
      fiducialMarkers: [],
      recoveredMarkerCount: 0,
      markerCornerCount: 0,
      markerRecoveryStatus: 'markers-not-detected',
      poseSolveInputReady: false,
      calibrationReady: false,
    },
    chain: { receipt: { hash: 'sha256:' + 'e'.repeat(64) } },
  });
  writeJson(targetDetectionPath, targetDetectionReceipt);
  const sweepReceipt = withHash({
    schemaVersion: 'holoshell-camera-scan-receipt/v5',
    status: 'pass',
    sweep: {
      winner: { mode: 'raw', score: 0.9, warningCount: 0, hologramBridgeArtifactPath: 'scan.hologram-bridge.json' },
      ranking: [{ mode: 'raw', score: 0.9 }],
      rawVideoHash: 'holoshell-native-camera-raw:self-test',
    },
    holomap: { pointCount: 4, replayFingerprint: 'selftest' },
    hologramBridge: { artifactPath: 'scan.hologram-bridge.json' },
    frames: [
      {
        index: 0,
        keptFramePath: rel(quiltPath),
        jpegHash: fileHash(quiltPath),
        rawRgbHash: 'sha256:' + 'c'.repeat(64),
        rawQuality: { status: 'pass', score: 0.5 },
        capturedAt: '2026-05-24T00:00:00.000Z',
      },
    ],
    chain: { receipt: { hash: 'sha256:' + 'a'.repeat(64) } },
  });
  writeJson(sweepPath, sweepReceipt);
  const renderReceipt = withHash({
    schemaVersion: 'holoshell-hologram-bridge-renderer/v5',
    status: 'pass',
    source: { pointCount: 4, temporalMode: 'tracked' },
    quilt: {
      path: rel(quiltPath),
      pngHash: fileHash(quiltPath),
      views: 4,
      width: 64,
      height: 48,
      quality: { score: 0.4, grade: 'weak', warnings: ['low-foreground-coverage'] },
    },
    chain: { receipt: { hash: 'sha256:' + 'b'.repeat(64) } },
  });
  writeJson(renderPath, renderReceipt);
  const receipt = buildWorkflowReceipt({
    args: {
      date: '2026-05-24',
      out: join(dir, 'workflow.json'),
      deviceIndex: 0,
      width: 64,
      height: 48,
      frames: 2,
      intervalMs: 250,
      tileGrid: 32,
      geometricTarget: true,
      targetProfile: 'fiducial-board',
      tileWidth: 80,
      tileHeight: 60,
    },
    sweepReceipt,
    sweepReceiptPath: sweepPath,
    renderReceipt,
    renderReceiptPath: renderPath,
    targetReceipt,
    targetReceiptPath: targetPath,
    targetDetectionReceipt,
    targetDetectionReceiptPath: targetDetectionPath,
    commands: {
      target: { command: ['target', 'generate'], exitCode: 0 },
      targetDetection: { command: ['target', 'detect'], exitCode: 0 },
      sweep: { command: ['camera', 'sweep'], exitCode: 0 },
      render: { command: ['bridge', 'render'], exitCode: 0 },
    },
  });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return receipt;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.selfTest) {
    const receipt = await selfTest();
    process.stdout.write(`holoshell-low-camera-workflow self-test PASS ${receipt.hash}\n`);
    return;
  }
  const receipt = await runWorkflow(args);
  const outPath = resolve(REPO_ROOT, args.out ?? defaultOutput(args.date));
  process.stdout.write(`${JSON.stringify({
    receiptPath: rel(outPath),
    status: receipt.status,
    winner: receipt.sweep?.winner,
    technologyPlan: receipt.technologyPlan
      ? {
          recommendedNow: receipt.technologyPlan.recommendedNow,
          topRecommendation: receipt.technologyPlan.recommendations?.[0]?.id,
          nextActions: receipt.technologyPlan.nextActions?.map((action) => action.id),
        }
      : undefined,
    target: receipt.target
      ? {
          path: receipt.target.pngPath,
          pngHash: receipt.target.pngHash,
          width: receipt.target.width,
          height: receipt.target.height,
          profile: receipt.target.profile,
          dictionary: receipt.target.dictionary,
          markerCount: receipt.target.markerCount,
          primitiveCount: receipt.target.primitiveCount,
          fiducialCount: receipt.target.fiducialCount,
        }
      : undefined,
    targetDetection: receipt.targetDetection
      ? {
          status: receipt.targetDetection.detection?.status,
          detectionMode: receipt.targetDetection.detection?.detectionMode,
          score: receipt.targetDetection.detection?.score,
          paletteHitCount: receipt.targetDetection.detection?.paletteHitCount,
          recoveredMarkerCount: receipt.targetDetection.detection?.recoveredMarkerCount,
          markerCornerCount: receipt.targetDetection.detection?.markerCornerCount,
          poseSolveInputReady: receipt.targetDetection.detection?.poseSolveInputReady,
          calibrationReady: receipt.targetDetection.detection?.calibrationReady,
        }
      : undefined,
    control: receipt.control?.frame
      ? {
          path: receipt.control.frame.path,
          jpegHash: receipt.control.frame.jpegHash,
          rawQuality: receipt.control.frame.rawQuality,
        }
      : undefined,
    quilt: receipt.render
      ? {
          path: receipt.render.quiltPath,
          pngHash: receipt.render.pngHash,
          width: receipt.render.width,
          height: receipt.render.height,
          views: receipt.render.views,
          quality: receipt.render.quality,
        }
      : undefined,
  }, null, 2)}\n`);
  if (args.requireCapture && receipt.status !== 'pass') process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('holoshell-low-camera-workflow.mjs')) {
  main().catch((error) => {
    process.stderr.write(`holoshell-low-camera-workflow FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
