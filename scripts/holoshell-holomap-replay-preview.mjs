#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HOLOSCRIPT_ROOT = path.resolve(REPO_ROOT, '..', 'HoloScript');
const SCHEMA_VERSION = 'hololand.holoshell.holomap-replay-preview.v0.1.0';
const DEFAULT_TMP_DIR = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT_NAME = 'holomap-replay-preview.json';
const DEFAULT_JS_OUTPUT_NAME = 'holomap-replay-preview.js';
const DEFAULT_SOURCE_ROOT = path.join(HOLOSCRIPT_ROOT, '.scratch', 'android-arcore-depth');
const REPLAY_FILE_NAME = 'native-depth-holomap-replay.json';
const FRAME_FILE_NAME = 'native-depth-frame.json';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    frame: '',
    replay: '',
    sourceRoot: DEFAULT_SOURCE_ROOT,
    tmpDir: DEFAULT_TMP_DIR,
    output: '',
    jsOutput: '',
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--frame') args.frame = argv[++index] || '';
    else if (arg === '--replay' || arg === '--source') args.replay = argv[++index] || '';
    else if (arg === '--source-root') args.sourceRoot = argv[++index] || args.sourceRoot;
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index] || args.tmpDir;
    else if (arg === '--output') args.output = argv[++index] || '';
    else if (arg === '--js-output') args.jsOutput = argv[++index] || '';
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.output) args.output = path.join(args.tmpDir, DEFAULT_OUTPUT_NAME);
  if (!args.jsOutput) args.jsOutput = path.join(args.tmpDir, DEFAULT_JS_OUTPUT_NAME);
  return args;
}

function printHelp() {
  console.log(`HoloShell HoloMap replay preview

Usage:
  node scripts/holoshell-holomap-replay-preview.mjs [options]
  pnpm holoshell:holomap-replay-preview -- [options]

Options:
  --frame <file>       Exact native-depth-frame.json receipt to read.
  --replay <file>      Exact native-depth-holomap-replay.json receipt to read.
  --source <file>      Alias for --replay.
  --source-root <dir>  Root containing dated ARCore depth runs.
                       Default: ${DEFAULT_SOURCE_ROOT}
  --tmp-dir <dir>      HoloShell local artifact directory. Default: ${DEFAULT_TMP_DIR}
  --output <file>      JSON output. Default: ${path.join(DEFAULT_TMP_DIR, DEFAULT_OUTPUT_NAME)}
  --js-output <file>   Browser bootstrap output. Default: ${path.join(DEFAULT_TMP_DIR, DEFAULT_JS_OUTPUT_NAME)}
  --json               Print generated preview receipt.
  --self-test          Build fixture receipts and assert privacy/shell invariants.
  -h, --help           Show this help.
`);
}

function resolveRepoPath(filePath) {
  if (!filePath) return '';
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(REPO_ROOT, filePath);
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function redactionPairs() {
  const pairs = [
    [REPO_ROOT, '[hololand-root]'],
    [HOLOSCRIPT_ROOT, '[holoscript-root]'],
    [process.env.USERPROFILE || process.env.HOME || '', '[user-home]'],
    [process.env.TEMP || process.env.TMP || '', '[temp]'],
  ];
  return pairs
    .filter(([target]) => target)
    .flatMap(([target, label]) => [
      [target, label],
      [normalizeSlashes(target), label],
    ]);
}

function redactText(value) {
  let out = String(value || '');
  for (const [target, label] of redactionPairs()) {
    out = out.split(target).join(label);
  }
  return out
    .replace(/(api[_-]?key|token|secret|password)=([^\s&]+)/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [redacted]');
}

function redactValue(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactValue(entry)]));
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, preview) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(preview, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_HOLOMAP_REPLAY_PREVIEW = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function sha256Text(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function shortHash(value) {
  return sha256Text(value).slice(0, 12);
}

function valueCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function firstArrayCount(...values) {
  const value = values.find((entry) => valueCount(entry) > 0);
  return valueCount(value);
}

function collectFiles(root, fileName, depth = 3) {
  const resolved = resolveRepoPath(root);
  if (!resolved || !existsSync(resolved)) return [];
  const files = [];
  const direct = path.join(resolved, fileName);
  if (existsSync(direct)) files.push(direct);
  if (depth <= 0) return files;

  for (const entry of readdirSync(resolved, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    files.push(...collectFiles(path.join(resolved, entry.name), fileName, depth - 1));
  }
  return files;
}

function latestFile(files) {
  return files
    .filter((filePath) => existsSync(filePath))
    .sort((left, right) => {
      const delta = statSync(right).mtimeMs - statSync(left).mtimeMs;
      return delta || right.localeCompare(left);
    })[0] || '';
}

function resolveReplayPath(args) {
  if (args.replay) return resolveRepoPath(args.replay);
  return latestFile(collectFiles(args.sourceRoot, REPLAY_FILE_NAME, 3));
}

function resolveFramePath(args, replayPath, replayReceipt) {
  if (args.frame) return resolveRepoPath(args.frame);

  const sourceReceipt = replayReceipt?.sourceReceipt || '';
  const candidates = [];
  if (sourceReceipt) {
    if (path.isAbsolute(sourceReceipt)) candidates.push(sourceReceipt);
    candidates.push(path.resolve(HOLOSCRIPT_ROOT, sourceReceipt));
    candidates.push(path.resolve(path.dirname(replayPath), sourceReceipt));
  }
  candidates.push(path.join(path.dirname(replayPath), FRAME_FILE_NAME));

  return candidates.find((candidate) => existsSync(candidate)) || '';
}

function publicPath(filePath) {
  if (!filePath) return '';
  return redactText(normalizeSlashes(path.resolve(filePath)));
}

function poseSummary(transform) {
  if (!Array.isArray(transform)) {
    return {
      hasCameraTransform: false,
      elementCount: 0,
      translationMeters: null,
    };
  }
  return {
    hasCameraTransform: true,
    elementCount: transform.length,
    translationMeters:
      transform.length >= 15
        ? {
            x: Number(transform[12].toFixed?.(6) ?? transform[12]),
            y: Number(transform[13].toFixed?.(6) ?? transform[13]),
            z: Number(transform[14].toFixed?.(6) ?? transform[14]),
          }
        : null,
  };
}

function frameSummary(frameReceipt = {}) {
  const sample = frameReceipt.sample || {};
  return {
    schemaVersion: frameReceipt.schemaVersion || '',
    status: frameReceipt.status || 'unknown',
    deviceModel: frameReceipt.deviceModel || '',
    manufacturer: frameReceipt.manufacturer || '',
    androidRelease: frameReceipt.androidRelease || '',
    androidSdk: frameReceipt.androidSdk ?? null,
    arcorePackage: frameReceipt.arcorePackage || '',
    frameAttempts: frameReceipt.frameAttempts ?? null,
    timestampNs: frameReceipt.timestampNs ?? null,
    sample: {
      width: sample.width ?? null,
      height: sample.height ?? null,
      rgbValueCount: valueCount(sample.rgb),
      depthMillimeterCount: valueCount(sample.depthMillimeters),
      confidenceValueCount: firstArrayCount(sample.confidence, sample.rawDepthConfidence),
      rgbHash: frameReceipt.hashes?.sampleRgbSha256 || '',
      depthHash: frameReceipt.hashes?.sampleDepthSha256 || '',
    },
    cameraImage: {
      width: frameReceipt.cameraImage?.width ?? null,
      height: frameReceipt.cameraImage?.height ?? null,
      format: frameReceipt.cameraImage?.format ?? null,
    },
    depthImage16Bits: {
      width: frameReceipt.depthImage16Bits?.width ?? null,
      height: frameReceipt.depthImage16Bits?.height ?? null,
      format: frameReceipt.depthImage16Bits?.format ?? null,
      planePixelStride: frameReceipt.depthImage16Bits?.planePixelStride ?? null,
      planeRowStride: frameReceipt.depthImage16Bits?.planeRowStride ?? null,
    },
    intrinsics: {
      imageWidth: frameReceipt.intrinsics?.imageWidth ?? null,
      imageHeight: frameReceipt.intrinsics?.imageHeight ?? null,
      fx: frameReceipt.intrinsics?.fx ?? null,
      fy: frameReceipt.intrinsics?.fy ?? null,
      cx: frameReceipt.intrinsics?.cx ?? null,
      cy: frameReceipt.intrinsics?.cy ?? null,
      source: frameReceipt.intrinsics?.source || '',
    },
    pose: poseSummary(frameReceipt.cameraTransformColumnMajor4x4),
    honestScope: frameReceipt.honestScope || '',
  };
}

function replaySummary(replayReceipt = {}) {
  const bundle = replayReceipt.bundle || {};
  const capture = bundle.capture || {};
  const frame = Array.isArray(bundle.frames) ? bundle.frames[0] || {} : {};
  const replay = replayReceipt.replay || {};
  return {
    schemaVersion: replayReceipt.schemaVersion || '',
    status: replayReceipt.status || 'unknown',
    sourceReceipt: redactText(replayReceipt.sourceReceipt || ''),
    bundle: {
      schemaVersion: bundle.schemaVersion || '',
      bundleId: bundle.bundleId || replay.source?.bundleId || '',
      frameCount: Array.isArray(bundle.frames) ? bundle.frames.length : replay.frameCount || 0,
      capture: {
        platform: capture.platform || replay.source?.platform || '',
        deviceModel: capture.deviceModel || '',
        coordinateSystem: capture.coordinateSystem || '',
        intrinsics: capture.intrinsics || {},
      },
      firstFrame: {
        index: frame.index ?? null,
        timestampMs: frame.timestampMs ?? null,
        width: frame.width ?? null,
        height: frame.height ?? null,
        stride: frame.stride ?? null,
        rgbValueCount: valueCount(frame.rgb),
        depthMillimeterCount: firstArrayCount(
          frame.depthMillimeters,
          frame.sceneDepth?.values,
          frame.sceneDepth
        ),
        confidenceValueCount: firstArrayCount(
          frame.confidence,
          frame.sceneDepthConfidence?.values,
          frame.sceneDepthConfidence
        ),
        pose: poseSummary(frame.cameraTransformColumnMajor4x4),
      },
    },
    replay: {
      source: {
        bundleId: replay.source?.bundleId || bundle.bundleId || '',
        platform: replay.source?.platform || capture.platform || '',
        frameCount: replay.source?.frameCount ?? replay.frameCount ?? 0,
        meshAnchorCount: replay.source?.meshAnchorCount ?? 0,
      },
      stepCount: replay.stepCount ?? 0,
      pointCount: replay.pointCount ?? 0,
      frameCount: replay.frameCount ?? 0,
      replayFingerprint: replay.replayFingerprint || '',
    },
    honestScope: replayReceipt.honestScope || '',
  };
}

function shellObjects(preview) {
  const summary = preview.summary;
  const frame = preview.frame;
  const replay = preview.replay;
  const status = summary.status === 'pass' ? 'complete' : 'blocked';
  const trustState = summary.status === 'pass' ? 'verified' : 'partial';
  const bundleId = summary.bundleId || 'unknown';
  const frameReceiptId = `receipt.s23-arcore-depth-frame.${shortHash(preview.source.frameHash)}`;
  const replayReceiptId = `receipt.s23-holomap-replay.${shortHash(summary.replayFingerprint || bundleId)}`;

  return [
    {
      id: 'room.s23-holomap-preview',
      objectKind: 'operating_world',
      displayName: 'S23 HoloMap Preview',
      sourceKind: 'holomap_replay',
      sourceRef: preview.source.replayPath,
      capabilityFamily: 'holomap_capture',
      trustState,
      permissionEnvelope: 'read_only',
      adapterPath: 'scripts/holoshell-holomap-replay-preview.mjs',
      visualForm: 'room',
      status,
      actorLaneId: 'codex-hardware',
      receiptTypes: [frame.schemaVersion, replay.schemaVersion].filter(Boolean),
      relationships: {
        deviceObject: 'device.s23-ultra',
        frameReceipt: frameReceiptId,
        replayReceipt: replayReceiptId,
        pointCloudPreview: 'preview.s23-holomap-point-cloud',
        productionGeospatialClaim: false,
      },
      privacyClass: 'local_private',
      replacementPath: 'promote_multi_frame_room_sweep',
      detail: `${summary.deviceModel || 'S23'} ${summary.capturePlatform || 'ARCore'} replay produced ${summary.pointCount} preview point(s) from ${summary.frameCount} frame(s).`,
    },
    {
      id: 'device.s23-ultra',
      objectKind: 'mobile_hardware',
      displayName: 'Joseph S23 Ultra',
      sourceKind: 'android_arcore',
      sourceRef: frame.schemaVersion,
      capabilityFamily: 'fleet_mobile_capture',
      trustState,
      permissionEnvelope: 'read_only',
      adapterPath: 'adb_arcore_depth_receipt',
      visualForm: 'machine',
      status,
      actorLaneId: 'codex-hardware',
      receiptTypes: [frame.schemaVersion].filter(Boolean),
      relationships: {
        fleetMember: true,
        captureRoom: 'room.s23-holomap-preview',
        frameReceipt: frameReceiptId,
      },
      privacyClass: 'local_private',
      replacementPath: 'preserve_engine',
      detail: `${frame.deviceModel || 'SM-S918U'} on Android ${frame.androidRelease || 'unknown'} captured ARCore depth with ${frame.frameAttempts ?? 'unknown'} frame attempt(s).`,
    },
    {
      id: frameReceiptId,
      objectKind: 'receipt',
      displayName: 'S23 ARCore Depth Frame',
      sourceKind: 'receipt',
      sourceRef: preview.source.framePath,
      capabilityFamily: 'holomap_capture',
      trustState,
      permissionEnvelope: 'read_only',
      adapterPath: 'HoloScript android-arcore-depth runner',
      visualForm: 'timeline_node',
      status,
      actorLaneId: 'codex-hardware',
      receiptTypes: [frame.schemaVersion].filter(Boolean),
      relationships: {
        deviceObject: 'device.s23-ultra',
        replayReceipt: replayReceiptId,
        rawPixelsIncluded: false,
        rawDepthIncluded: false,
      },
      privacyClass: 'local_private',
      replacementPath: 'preserve_engine',
      detail: `${frame.sample.width || '?'}x${frame.sample.height || '?'} sample, ${frame.depthImage16Bits.width || '?'}x${frame.depthImage16Bits.height || '?'} depth image, pose=${frame.pose.hasCameraTransform}.`,
    },
    {
      id: replayReceiptId,
      objectKind: 'receipt',
      displayName: 'HoloMap Replay Receipt',
      sourceKind: 'receipt',
      sourceRef: preview.source.replayPath,
      capabilityFamily: 'holomap_capture',
      trustState,
      permissionEnvelope: 'read_only',
      adapterPath: 'HoloMap mobile sensor replay',
      visualForm: 'timeline_node',
      status,
      actorLaneId: 'codex-hardware',
      receiptTypes: [replay.schemaVersion].filter(Boolean),
      relationships: {
        captureRoom: 'room.s23-holomap-preview',
        bundleId,
        replayFingerprint: summary.replayFingerprint,
      },
      privacyClass: 'local_private',
      replacementPath: 'promote_multi_frame_room_sweep',
      detail: `${summary.stepCount} replay step(s), ${summary.pointCount} preview point(s), fingerprint ${summary.replayFingerprint || 'unknown'}.`,
    },
    {
      id: 'preview.s23-holomap-point-cloud',
      objectKind: 'point_cloud_preview',
      displayName: 'S23 Point Cloud Preview',
      sourceKind: 'holomap_replay',
      sourceRef: replayReceiptId,
      capabilityFamily: 'holomap_capture',
      trustState,
      permissionEnvelope: 'read_only',
      adapterPath: 'HoloMap reconstruction preview',
      visualForm: 'captured_surface',
      status,
      actorLaneId: 'codex-hardware',
      receiptTypes: [replay.schemaVersion].filter(Boolean),
      relationships: {
        captureRoom: 'room.s23-holomap-preview',
        deviceObject: 'device.s23-ultra',
        productionReady: false,
      },
      privacyClass: 'local_private',
      replacementPath: 'promote_multi_frame_room_sweep',
      metrics: {
        pointCount: summary.pointCount,
        frameCount: summary.frameCount,
        meshAnchorCount: summary.meshAnchorCount,
      },
      detail: 'Single-frame HoloMap preview only; not yet a full room reconstruction or geospatial anchor.',
    },
    {
      id: 'policy.s23-holomap-preview-boundary',
      objectKind: 'policy',
      displayName: 'Preview Boundary',
      sourceKind: 'policy',
      sourceRef: 'apps/holoshell/docs/HOLOMAP_REPLAY_PREVIEW.md',
      capabilityFamily: 'holomap_capture',
      trustState: 'verified',
      permissionEnvelope: 'read_only',
      adapterPath: 'privacy_safe_receipt_projection',
      visualForm: 'glyph',
      status: 'complete',
      actorLaneId: 'codex-hardware',
      receiptTypes: [SCHEMA_VERSION],
      relationships: {
        rawPixelsIncluded: false,
        rawDepthIncluded: false,
        destructiveActionsTaken: false,
        productionGeospatialClaim: false,
      },
      privacyClass: 'local_private',
      replacementPath: 'preserve_engine',
      detail: 'HoloLand receives summary, hashes, counts, and relationships; raw RGB/depth arrays stay in local HoloScript receipts.',
    },
  ];
}

function createPreview({ frameReceipt, replayReceipt, framePath, replayPath }) {
  const frame = frameSummary(frameReceipt);
  const replay = replaySummary(replayReceipt);
  const status = frame.status === 'pass' && replay.status === 'pass' ? 'pass' : 'blocked';
  const summary = {
    status,
    deviceModel: frame.deviceModel || replay.bundle.capture.deviceModel || '',
    capturePlatform: replay.bundle.capture.platform || replay.replay.source.platform || 'android-arcore-depth',
    bundleId: replay.bundle.bundleId || replay.replay.source.bundleId || '',
    replayFingerprint: replay.replay.replayFingerprint || '',
    frameCount: replay.replay.frameCount || replay.replay.source.frameCount || replay.bundle.frameCount || 0,
    meshAnchorCount: replay.replay.source.meshAnchorCount || 0,
    stepCount: replay.replay.stepCount || 0,
    pointCount: replay.replay.pointCount || 0,
    sampleWidth: frame.sample.width || replay.bundle.firstFrame.width || null,
    sampleHeight: frame.sample.height || replay.bundle.firstFrame.height || null,
    depthWidth: frame.depthImage16Bits.width || null,
    depthHeight: frame.depthImage16Bits.height || null,
    hasPose: Boolean(frame.pose.hasCameraTransform || replay.bundle.firstFrame.pose.hasCameraTransform),
    rawPixelsIncluded: false,
    rawDepthIncluded: false,
    rawPoseMatrixIncluded: false,
    previewOnly: true,
    productionGeospatialClaim: false,
    shellObjectCount: 0,
    nextAction: 'Capture a multi-frame S23 sweep, promote stable anchors, then feed HoloLand a room-scale reconstruction receipt.',
  };

  const source = {
    framePath: publicPath(framePath),
    replayPath: publicPath(replayPath),
    frameHash: framePath && existsSync(framePath) ? `sha256:${sha256File(framePath)}` : '',
    replayHash: replayPath && existsSync(replayPath) ? `sha256:${sha256File(replayPath)}` : '',
    deviceClass: 'samsung-s23',
    pathPolicy: 'absolute_path_redacted_from_public_projection',
  };

  const preview = redactValue({
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    previewId: `s23-holomap-preview-${shortHash(`${source.frameHash}:${source.replayHash}`)}`,
    status,
    source,
    summary,
    preview: {
      sourceMutation: false,
      targetType: 'holomap-preview-room',
      promotionPath: 'multi_frame_room_sweep',
    },
    runtimeOutcome: {
      status: status === 'pass' ? 'previewed' : 'blocked',
      destructiveActionsTaken: false,
      mutationPerformed: false,
    },
    hololandTarget: {
      targetType: 'holomap-preview-room',
      shellObjectRoot: 'room.s23-holomap-preview',
      promotionTarget: 'room-scale-reconstruction',
    },
    frame,
    replay,
    privacy: {
      redacted: true,
      localOnly: true,
      rawGpsIncluded: false,
      rawMediaIncluded: false,
      rawPixelsIncluded: false,
      rawDepthIncluded: false,
      rawPoseMatrixIncluded: false,
      rawSecretsIncluded: false,
      sourcePathsRedacted: true,
      localPathLabels: ['[hololand-root]', '[holoscript-root]', '[user-home]', '[temp]'],
    },
    commands: {
      replay: `node scripts/holoshell-holomap-replay-preview.mjs --frame "${source.framePath || '<frame-receipt>'}" --replay "${source.replayPath || '<replay-receipt>'}"`,
      rollback:
        'Read-only projection; delete .tmp/holoshell/holomap-replay-preview.json and .tmp/holoshell/holomap-replay-preview.js to clear it.',
    },
    honestScope:
      'HoloLand shell preview of a HoloMap replay receipt. It proves local S23 ARCore depth capture reached HoloMap replay, not a production room-scale world map.',
  });

  preview.objects = shellObjects(preview);
  preview.summary.shellObjectCount = preview.objects.length;
  return preview;
}

function fixtureFrameReceipt() {
  return {
    schemaVersion: 'holomap-android-arcore-depth-frame/v1',
    status: 'pass',
    deviceModel: 'SM-S918U',
    manufacturer: 'samsung',
    androidRelease: '16',
    androidSdk: 36,
    arcorePackage: 'com.google.ar.core',
    frameAttempts: 12,
    timestampNs: 123456789,
    sample: {
      width: 64,
      height: 48,
      rgb: [101, 102, 103, 104],
      depthMillimeters: [420, 421, 422],
      confidence: [7, 8, 9],
    },
    cameraImage: { width: 640, height: 480, format: 35 },
    depthImage16Bits: {
      width: 160,
      height: 90,
      format: 48,
      planePixelStride: 2,
      planeRowStride: 320,
    },
    intrinsics: {
      imageWidth: 640,
      imageHeight: 480,
      fx: 415.7,
      fy: 415.7,
      cx: 320.7,
      cy: 238.4,
      source: 'arcore-camera-image-intrinsics',
    },
    cameraTransformColumnMajor4x4: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, 0.2, 0.3, 1],
    hashes: {
      sampleRgbSha256: 'sha256:fixture-rgb',
      sampleDepthSha256: 'sha256:fixture-depth',
    },
    honestScope: 'Fixture native ARCore frame.',
  };
}

function fixtureReplayReceipt() {
  return {
    schemaVersion: 'holomap-android-arcore-depth-replay/v1',
    status: 'pass',
    sourceReceipt: '.scratch/android-arcore-depth/fixture/native-depth-frame.json',
    bundle: {
      schemaVersion: 'holomap-mobile-sensor-bundle/v1',
      bundleId: 's23-arcore-depth-fixture',
      capture: {
        platform: 'android-arcore-depth',
        deviceModel: 'SM-S918U',
        coordinateSystem: 'arcore-right-handed-y-up',
        intrinsics: {
          width: 64,
          height: 48,
          fx: 41.57,
          fy: 41.57,
          cx: 32,
          cy: 24,
          source: 'fixture-scaled-intrinsics',
        },
      },
      frames: [
        {
          index: 0,
          timestampMs: 123456.789,
          width: 64,
          height: 48,
          stride: 3,
          rgb: [201, 202, 203, 204],
          depthMillimeters: [900, 901, 902],
          confidence: [1, 1, 1],
          cameraTransformColumnMajor4x4: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, 0.2, 0.3, 1],
        },
      ],
    },
    replay: {
      source: {
        bundleId: 's23-arcore-depth-fixture',
        platform: 'android-arcore-depth',
        frameCount: 1,
        meshAnchorCount: 0,
      },
      stepCount: 1,
      pointCount: 16,
      frameCount: 1,
      replayFingerprint: 'fixture-fingerprint',
    },
    honestScope: 'Fixture replay.',
  };
}

function assertSelfTest(preview) {
  const failures = [];
  if (preview.schemaVersion !== SCHEMA_VERSION) failures.push('schema version mismatch');
  if (preview.summary.status !== 'pass') failures.push('expected pass status');
  if (preview.summary.deviceModel !== 'SM-S918U') failures.push('expected S23 device model');
  if (preview.summary.pointCount !== 16) failures.push('expected 16 preview points');
  if (preview.summary.rawPixelsIncluded !== false) failures.push('raw pixel marker must be false');
  if (preview.summary.rawDepthIncluded !== false) failures.push('raw depth marker must be false');
  if (preview.privacy.rawPoseMatrixIncluded !== false) failures.push('raw pose matrix marker must be false');
  if (!preview.objects.some((object) => object.id === 'room.s23-holomap-preview')) {
    failures.push('expected HoloMap preview room shell object');
  }
  if (!preview.objects.some((object) => object.id === 'device.s23-ultra')) {
    failures.push('expected S23 device shell object');
  }
  if (!preview.objects.some((object) => object.objectKind === 'point_cloud_preview')) {
    failures.push('expected point cloud preview shell object');
  }
  const serialized = JSON.stringify(preview);
  if (serialized.includes('[101,102,103,104]')) failures.push('frame RGB array leaked');
  if (serialized.includes('[201,202,203,204]')) failures.push('replay RGB array leaked');
  if (serialized.includes('[900,901,902]')) failures.push('replay depth array leaked');
  if (serialized.includes('cameraTransformColumnMajor4x4')) failures.push('raw pose matrix key leaked');
  if (serialized.includes(normalizeSlashes(HOLOSCRIPT_ROOT))) failures.push('HoloScript absolute path leaked');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

function main() {
  const args = parseArgs();
  let framePath = '';
  let replayPath = '';
  let frameReceipt;
  let replayReceipt;

  if (args.selfTest) {
    framePath = path.join(HOLOSCRIPT_ROOT, '.scratch', 'android-arcore-depth', 'fixture', FRAME_FILE_NAME);
    replayPath = path.join(HOLOSCRIPT_ROOT, '.scratch', 'android-arcore-depth', 'fixture', REPLAY_FILE_NAME);
    frameReceipt = fixtureFrameReceipt();
    replayReceipt = fixtureReplayReceipt();
  } else {
    replayPath = resolveReplayPath(args);
    if (!replayPath) {
      throw new Error(`No ${REPLAY_FILE_NAME} found under ${resolveRepoPath(args.sourceRoot)}`);
    }
    replayReceipt = readJsonFile(replayPath);
    framePath = resolveFramePath(args, replayPath, replayReceipt);
    if (!framePath) throw new Error(`No ${FRAME_FILE_NAME} paired with replay ${replayPath}`);
    frameReceipt = readJsonFile(framePath);
  }

  const preview = createPreview({ frameReceipt, replayReceipt, framePath, replayPath });
  if (args.selfTest) assertSelfTest(preview);

  const output = writeJson(args.output, preview);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, preview);
  if (args.json) {
    console.log(JSON.stringify(preview, null, 2));
  } else {
    console.log(`HoloShell HoloMap replay preview: ${output}`);
    console.log(`HoloShell HoloMap replay bootstrap: ${jsOutput}`);
    console.log(`Status: ${preview.summary.status}`);
    console.log(`Device: ${preview.summary.deviceModel || 'unknown'}`);
    console.log(`Bundle: ${preview.summary.bundleId || 'unknown'}`);
    console.log(`Points: ${preview.summary.pointCount}`);
    console.log(`Raw pixels included: ${preview.summary.rawPixelsIncluded}`);
    console.log(`Raw depth included: ${preview.summary.rawDepthIncluded}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(`holoshell-holomap-replay-preview failed: ${error.message}`);
    process.exit(1);
  }
}

export { createPreview, fixtureFrameReceipt, fixtureReplayReceipt };
