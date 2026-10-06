#!/usr/bin/env node
/**
 * Build/install/run the native Android ARCore depth-frame probe.
 *
 * Generated Android projects and receipts live under .scratch. The tracked
 * template proves exactly which native APIs the workflow exercises.
 *
 * pull-sweep turns a phone room sweep (full-res JPEGs + sweep/manifest.json
 * written by the probe APK) into a HoloMap manifest, replay fingerprint, and
 * point count via createArCoreDepthMobileSensorBundle/replayMobileSensorBundle.
 */

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VERSION = '0.2.0';
export const FRAME_RECEIPT_VERSION = 'holomap-android-arcore-depth-frame/v1';
export const REPLAY_RECEIPT_VERSION = 'holomap-android-arcore-depth-replay/v1';
export const SWEEP_MANIFEST_VERSION = 'holomap-arcore-hq-sweep/v1';
export const SWEEP_REPLAY_RECEIPT_VERSION = 'holomap-android-arcore-sweep-replay/v1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TEMPLATE_DIR = join(__dirname, 'android-arcore-depth-probe-template');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
/** MainActivity writes sweeps to getExternalFilesDir(null): sweep/ is the latest, sweep_<epochMs>/ are archives. */
const DEVICE_APP_ID = 'com.holoscript.depthprobe';
const DEVICE_FILES_DIR = `/storage/emulated/0/Android/data/${DEVICE_APP_ID}/files`;

function parseArgs(argv) {
  const args = {
    command: 'help',
    project: join('.scratch', 'android-arcore-depth-apk'),
    receipt: undefined,
    out: undefined,
    date: DEFAULT_DATE,
    adb: undefined,
    gradle: undefined,
    javaHome: undefined,
    androidHome: undefined,
    waitSec: 10,
    json: false,
    deviceDir: DEVICE_FILES_DIR,
    sweepDir: undefined,
    serial: undefined,
    rgbWidth: 320,
    tileGrid: 8,
    maxFrames: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (['generate', 'run', 'replay', 'pull-sweep', 'self-test', 'help'].includes(arg)) {
      args.command = arg;
    } else if (arg === '--self-test') args.command = 'self-test';
    else if (arg === '--project') args.project = argv[++i];
    else if (arg === '--receipt') args.receipt = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--date') args.date = argv[++i];
    else if (arg === '--adb') args.adb = argv[++i];
    else if (arg === '--gradle') args.gradle = argv[++i];
    else if (arg === '--java-home') args.javaHome = argv[++i];
    else if (arg === '--android-home') args.androidHome = argv[++i];
    else if (arg === '--wait-sec') args.waitSec = Number.parseFloat(argv[++i]);
    else if (arg === '--device-dir') args.deviceDir = argv[++i];
    else if (arg === '--sweep-dir') args.sweepDir = argv[++i];
    else if (arg === '--serial') args.serial = argv[++i];
    else if (arg === '--rgb-width') args.rgbWidth = Number.parseInt(argv[++i], 10);
    else if (arg === '--tile-grid') args.tileGrid = Number.parseInt(argv[++i], 10);
    else if (arg === '--max-frames') args.maxFrames = Number.parseInt(argv[++i], 10);
    else if (arg === '--json') args.json = true;
    else if (arg === '-h' || arg === '--help') args.command = 'help';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  process.stdout.write(`Android ARCore Depth APK Runner ${VERSION}

Usage:
  node scripts/android-arcore-depth-apk-runner.mjs generate [--project .scratch/android-arcore-depth-apk]
  node scripts/android-arcore-depth-apk-runner.mjs run [--wait-sec 10] [--json]
  node scripts/android-arcore-depth-apk-runner.mjs replay --receipt path.json [--out replay.json]
  node scripts/android-arcore-depth-apk-runner.mjs pull-sweep [--serial R5CW20QRNMK] [--rgb-width 320]
      [--tile-grid 8] [--max-frames 0] [--sweep-dir local/dir] [--out receipt.json]
  node scripts/android-arcore-depth-apk-runner.mjs --self-test

Defaults expect scratch toolchain paths:
  .scratch/android-native-toolchain/jdk21/jdk-21.0.11+10
  .scratch/android-native-toolchain/android-sdk
  .scratch/android-native-toolchain/gradle/gradle-9.5.1/bin/gradle.bat

The APK writes a native frame receipt from Frame.acquireDepthImage16Bits().

pull-sweep pulls the newest on-device room sweep (${DEVICE_FILES_DIR}/sweep,
archives sweep_<epochMs>), decodes the full-res JPEGs to --rgb-width RGB via the
workspace sharp dependency, converts manifest+frames into ARCore mobile sensor
bundle input, and replays it through HoloMap into a receipt under .scratch/.
--sweep-dir skips the device and converts an already-pulled local sweep. adb is
resolved from --adb, the scratch android-sdk, .scratch/android-platform-tools,
then PATH.
`);
}

function abs(path) {
  return resolve(REPO_ROOT, path);
}

function rel(path) {
  return relative(REPO_ROOT, resolve(path)).replaceAll('\\', '/');
}

function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) copyTree(srcPath, dstPath);
    else copyFileSync(srcPath, dstPath);
  }
}

export function generateProject(projectPath = join('.scratch', 'android-arcore-depth-apk')) {
  const out = abs(projectPath);
  rmSync(out, { recursive: true, force: true });
  copyTree(TEMPLATE_DIR, out);
  return out;
}

function windowsCommandQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=+\\-]+$/.test(text)) return text;
  return `"${text.replace(/(["^&|<>])/g, '^$1')}"`;
}

function runCommand(bin, args, options = {}) {
  const batchOnWindows = process.platform === 'win32' && /\.(bat|cmd)$/i.test(bin);
  const spawnBin = batchOnWindows ? (process.env.ComSpec ?? 'cmd.exe') : bin;
  const spawnArgs = batchOnWindows
    ? ['/d', '/c', [windowsCommandQuote(bin), ...args.map(windowsCommandQuote)].join(' ')]
    : args;
  const result = spawnSync(spawnBin, spawnArgs, {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: options.encoding ?? 'utf8',
    timeout: options.timeoutMs ?? 120000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 32,
    windowsHide: true,
    env: options.env ?? process.env,
  });
  return {
    command: [bin, ...args].join(' '),
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message,
    ok: !result.error && result.status === 0,
  };
}

function commandFailure(result) {
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : result.stdout;
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
  return [
    `command: ${result.command}`,
    `status: ${result.status}`,
    result.error ? `error: ${result.error}` : '',
    stdout ? `stdout:\n${stdout}` : '',
    stderr ? `stderr:\n${stderr}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function defaultToolchain(args) {
  const tc = abs(join('.scratch', 'android-native-toolchain'));
  const javaHome = args.javaHome ? abs(args.javaHome) : join(tc, 'jdk21', 'jdk-21.0.11+10');
  const androidHome = args.androidHome ? abs(args.androidHome) : join(tc, 'android-sdk');
  const gradle = args.gradle
    ? abs(args.gradle)
    : join(
        tc,
        'gradle',
        'gradle-9.5.1',
        'bin',
        process.platform === 'win32' ? 'gradle.bat' : 'gradle'
      );
  const adb = args.adb
    ? abs(args.adb)
    : join(androidHome, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  return { javaHome, androidHome, gradle, adb };
}

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`${label} not found: ${path}`);
  }
}

function buildEnv(toolchain) {
  return {
    ...process.env,
    JAVA_HOME: toolchain.javaHome,
    ANDROID_HOME: toolchain.androidHome,
    ANDROID_SDK_ROOT: toolchain.androidHome,
    PATH: `${join(toolchain.javaHome, 'bin')};${join(toolchain.androidHome, 'platform-tools')};${process.env.PATH ?? ''}`,
  };
}

export function validateFrameReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') return ['receipt must be an object'];
  if (receipt.schemaVersion !== FRAME_RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (!['pass', 'blocked'].includes(receipt.status)) errors.push('status must be pass or blocked');
  if (receipt.status === 'pass') {
    const sample = receipt.sample;
    if (!sample) errors.push('pass receipt missing sample');
    if (!Number.isInteger(sample?.width) || !Number.isInteger(sample?.height)) {
      errors.push('sample dimensions must be integers');
    }
    const pixels = (sample?.width ?? 0) * (sample?.height ?? 0);
    if (!Array.isArray(sample?.rgb) || sample.rgb.length !== pixels * 3) {
      errors.push('sample rgb length invalid');
    }
    if (!Array.isArray(sample?.depthMillimeters) || sample.depthMillimeters.length !== pixels) {
      errors.push('sample depth length invalid');
    }
    if (!receipt.depthImage16Bits?.width || !receipt.depthImage16Bits?.height) {
      errors.push('depthImage16Bits dimensions missing');
    }
    if (
      !Array.isArray(receipt.cameraTransformColumnMajor4x4) ||
      receipt.cameraTransformColumnMajor4x4.length !== 16
    ) {
      errors.push('camera transform missing');
    }
    if (!receipt.intrinsics?.fx || !receipt.intrinsics?.fy)
      errors.push('camera intrinsics missing');
  }
  if (receipt.status === 'blocked' && !receipt.blockedReason) {
    errors.push('blocked receipt missing blockedReason');
  }
  return errors;
}

export function frameReceiptToArCoreBundleInput(receipt) {
  const errors = validateFrameReceipt(receipt);
  if (errors.length > 0)
    throw new Error(`Invalid ARCore depth frame receipt: ${errors.join('; ')}`);
  if (receipt.status !== 'pass')
    throw new Error(`Cannot replay blocked receipt: ${receipt.blockedReason}`);

  const sample = receipt.sample;
  const sx = sample.width / receipt.intrinsics.imageWidth;
  const sy = sample.height / receipt.intrinsics.imageHeight;
  return {
    bundleId:
      's23-arcore-depth-' +
      createHash('sha256')
        .update(JSON.stringify(receipt.hashes ?? sample.depthMillimeters.slice(0, 64)))
        .digest('hex')
        .slice(0, 12),
    deviceModel: receipt.deviceModel,
    intrinsics: {
      width: sample.width,
      height: sample.height,
      fx: receipt.intrinsics.fx * sx,
      fy: receipt.intrinsics.fy * sy,
      cx: receipt.intrinsics.cx * sx,
      cy: receipt.intrinsics.cy * sy,
      source: 'arcore-camera-image-intrinsics-scaled-to-sample',
    },
    frames: [
      {
        index: 0,
        timestampMs: receipt.timestampNs / 1_000_000,
        width: sample.width,
        height: sample.height,
        stride: sample.stride,
        rgb: sample.rgb,
        depthImage16Bits: {
          width: sample.width,
          height: sample.height,
          millimeters: sample.depthMillimeters,
        },
        rawDepthConfidenceImage: Array.isArray(sample.rawDepthConfidence)
          ? { width: sample.width, height: sample.height, values: sample.rawDepthConfidence }
          : undefined,
        cameraTransformColumnMajor4x4: receipt.cameraTransformColumnMajor4x4,
      },
    ],
  };
}

export async function replayFrameReceipt(receiptPath, outPath) {
  const text = readFileSync(receiptPath, 'utf8').replace(/^\uFEFF/, '');
  const frameReceipt = JSON.parse(text);
  const bundleInput = frameReceiptToArCoreBundleInput(frameReceipt);
  const {
    createArCoreDepthMobileSensorBundle,
    replayMobileSensorBundle,
    validateMobileSensorBundle,
  } = await import('../packages/core/dist/reconstruction/index.js');
  const bundle = createArCoreDepthMobileSensorBundle(bundleInput);
  const errors = validateMobileSensorBundle(bundle);
  if (errors.length > 0)
    throw new Error(`Generated invalid mobile sensor bundle: ${errors.join('; ')}`);
  const replay = await replayMobileSensorBundle(bundle, { pointBudget: 4096, minKeyframes: 1 });
  const receipt = {
    schemaVersion: REPLAY_RECEIPT_VERSION,
    status: 'pass',
    sourceReceipt: rel(receiptPath),
    bundle,
    replay: {
      source: replay.source,
      stepCount: replay.steps.length,
      pointCount: replay.manifest.pointCount,
      frameCount: replay.manifest.frameCount,
      replayFingerprint: replay.manifest.simulationContract.replayFingerprint,
      videoHash: replay.manifest.videoHash,
    },
    honestScope:
      'Replays the downsampled native ARCore RGB+luma/depth/pose sample through HoloMap mobile sensor ingest; this is not yet a full room sweep.',
  };
  const out = resolve(outPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { out, receipt };
}

function pullReceipt(adb, outPath) {
  const result = runCommand(
    adb,
    [
      'exec-out',
      'run-as',
      'com.holoscript.depthprobe',
      'cat',
      'files/holomap-arcore-depth-frame.json',
    ],
    {
      encoding: 'buffer',
      timeoutMs: 20000,
      maxBuffer: 1024 * 1024 * 4,
    }
  );
  if (!result.ok) {
    throw new Error(`pull receipt failed: ${result.error ?? result.stderr}`);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, result.stdout);
  return outPath;
}

export function validateSweepManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest must be an object'];
  if (manifest.schemaVersion !== SWEEP_MANIFEST_VERSION) errors.push('schemaVersion mismatch');
  if (!['pass', 'blocked'].includes(manifest.status)) errors.push('status must be pass or blocked');
  if (manifest.status === 'blocked' && !manifest.blockedReason) {
    errors.push('blocked manifest missing blockedReason');
  }
  if (manifest.status === 'pass') {
    const intrinsics = manifest.intrinsics;
    for (const key of ['imageWidth', 'imageHeight', 'fx', 'fy', 'cx', 'cy']) {
      if (!Number.isFinite(intrinsics?.[key]) || intrinsics[key] <= 0) {
        errors.push(`intrinsics.${key} must be positive finite`);
      }
    }
    if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) {
      errors.push('frames missing');
    } else {
      if (manifest.frameCount !== manifest.frames.length) {
        errors.push('frameCount does not match frames length');
      }
      manifest.frames.forEach((frame, i) => {
        const prefix = `frames[${i}]`;
        if (!Number.isInteger(frame?.index) || frame.index < 0) {
          errors.push(`${prefix}.index invalid`);
        }
        if (!Number.isFinite(frame?.timestampNs)) errors.push(`${prefix}.timestampNs invalid`);
        if (
          typeof frame?.jpeg !== 'string' ||
          frame.jpeg.length === 0 ||
          frame.jpeg.includes('..') ||
          frame.jpeg.includes(':') ||
          frame.jpeg.startsWith('/') ||
          frame.jpeg.startsWith('\\')
        ) {
          errors.push(`${prefix}.jpeg must be a sweep-relative path`);
        }
        if (
          !Number.isInteger(frame?.depthWidth) ||
          frame.depthWidth <= 0 ||
          !Number.isInteger(frame?.depthHeight) ||
          frame.depthHeight <= 0
        ) {
          errors.push(`${prefix}.depth dimensions invalid`);
        } else if (
          !Array.isArray(frame?.depthMillimeters) ||
          frame.depthMillimeters.length !== frame.depthWidth * frame.depthHeight
        ) {
          errors.push(`${prefix}.depthMillimeters length invalid`);
        }
        if (
          !Array.isArray(frame?.cameraTransformColumnMajor4x4) ||
          frame.cameraTransformColumnMajor4x4.length !== 16
        ) {
          errors.push(`${prefix}.cameraTransformColumnMajor4x4 invalid`);
        }
      });
    }
  }
  return errors;
}

/**
 * Pure converter: sweep manifest entries + already-decoded RGB planes into the
 * ArCoreDepthMobileSensorBundleInput shape createArCoreDepthMobileSensorBundle
 * expects. decodedFrames[i] = { width, height, rgb } aligned with the first
 * maxFrames (or all) manifest frames; JPEG decode stays in convertSweepDir.
 */
export function sweepManifestToArCoreBundleInput(manifest, decodedFrames, options = {}) {
  const errors = validateSweepManifest(manifest);
  if (errors.length > 0) throw new Error(`Invalid ARCore sweep manifest: ${errors.join('; ')}`);
  if (manifest.status !== 'pass') {
    throw new Error(`Cannot convert blocked sweep: ${manifest.blockedReason}`);
  }
  const maxFrames = options.maxFrames ?? 0;
  const used = maxFrames > 0 ? manifest.frames.slice(0, maxFrames) : manifest.frames;
  if (!Array.isArray(decodedFrames) || decodedFrames.length !== used.length) {
    throw new Error(`decodedFrames length must be ${used.length}`);
  }
  const first = decodedFrames[0];
  decodedFrames.forEach((decoded, i) => {
    if (
      !Number.isInteger(decoded?.width) ||
      decoded.width <= 0 ||
      !Number.isInteger(decoded?.height) ||
      decoded.height <= 0
    ) {
      throw new Error(`decodedFrames[${i}] dimensions invalid`);
    }
    if (decoded.width !== first.width || decoded.height !== first.height) {
      throw new Error(`decodedFrames[${i}] resolution differs from decodedFrames[0]`);
    }
    if ((decoded.rgb?.length ?? 0) !== decoded.width * decoded.height * 3) {
      throw new Error(
        `decodedFrames[${i}].rgb length must be ${decoded.width * decoded.height * 3}`
      );
    }
  });
  const sx = first.width / manifest.intrinsics.imageWidth;
  const sy = first.height / manifest.intrinsics.imageHeight;
  return {
    bundleId:
      'arcore-hq-sweep-' +
      createHash('sha256')
        .update(
          JSON.stringify({
            deviceModel: manifest.deviceModel,
            frames: used.map((frame) => [frame.index, frame.timestampNs]),
          })
        )
        .digest('hex')
        .slice(0, 12),
    deviceModel: manifest.deviceModel,
    intrinsics: {
      width: first.width,
      height: first.height,
      fx: manifest.intrinsics.fx * sx,
      fy: manifest.intrinsics.fy * sy,
      cx: manifest.intrinsics.cx * sx,
      cy: manifest.intrinsics.cy * sy,
      source: 'arcore-camera-image-intrinsics-scaled-to-sweep-rgb',
    },
    frames: used.map((frame, i) => ({
      index: frame.index,
      timestampMs: frame.timestampNs / 1_000_000,
      width: first.width,
      height: first.height,
      stride: 3,
      rgb: decodedFrames[i].rgb,
      depthImage16Bits: {
        width: frame.depthWidth,
        height: frame.depthHeight,
        millimeters: frame.depthMillimeters,
      },
      cameraTransformColumnMajor4x4: frame.cameraTransformColumnMajor4x4,
    })),
  };
}

/**
 * Decode a pulled sweep dir (manifest.json + frames/*.jpg) into bundle input.
 * JPEGs are downsampled to rgbWidth (aspect kept from the sweep intrinsics) so
 * a 120-frame full-res sweep stays memory-bounded; hashes keep the receipt
 * anchored to the exact bytes without embedding them.
 */
export async function convertSweepDir(sweepDir, options = {}) {
  const rgbWidth = options.rgbWidth ?? 320;
  const maxFrames = options.maxFrames ?? 0;
  const manifestPath = join(sweepDir, 'manifest.json');
  requireFile(manifestPath, 'Sweep manifest');
  const manifestText = readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
  const manifest = JSON.parse(manifestText);
  const errors = validateSweepManifest(manifest);
  if (errors.length > 0) throw new Error(`Invalid ARCore sweep manifest: ${errors.join('; ')}`);
  if (manifest.status !== 'pass') {
    throw new Error(`Cannot convert blocked sweep: ${manifest.blockedReason}`);
  }

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (error) {
    throw new Error(
      `pull-sweep needs the workspace sharp dependency for JPEG decode (${error.message})`
    );
  }

  const used = maxFrames > 0 ? manifest.frames.slice(0, maxFrames) : manifest.frames;
  const targetWidth = Math.max(2, Math.round(rgbWidth));
  const targetHeight = Math.max(
    2,
    Math.round((targetWidth * manifest.intrinsics.imageHeight) / manifest.intrinsics.imageWidth)
  );
  const decodedFrames = [];
  const frameJpegSha256 = [];
  for (const frame of used) {
    const jpegPath = join(sweepDir, frame.jpeg);
    requireFile(jpegPath, `Sweep frame ${frame.index} jpeg`);
    const bytes = readFileSync(jpegPath);
    const { data, info } = await sharp(bytes)
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 3) {
      throw new Error(`Sweep frame ${frame.index}: expected 3 raw channels, got ${info.channels}`);
    }
    decodedFrames.push({
      width: info.width,
      height: info.height,
      rgb: new Uint8Array(data.buffer, data.byteOffset, data.length),
    });
    frameJpegSha256.push({
      jpeg: frame.jpeg,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }

  return {
    manifest,
    manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
    usedFrames: used,
    bundleInput: sweepManifestToArCoreBundleInput(manifest, decodedFrames, { maxFrames }),
    frameJpegSha256,
    rgb: { width: targetWidth, height: targetHeight },
  };
}

function resolveAdbForPull(args) {
  if (args.adb) {
    const explicit = abs(args.adb);
    requireFile(explicit, 'ADB');
    return explicit;
  }
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [
    join(defaultToolchain(args).androidHome, 'platform-tools', exe),
    abs(join('.scratch', 'android-platform-tools', 'extracted', 'platform-tools', exe)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return exe;
}

function adbSerialArgs(serial) {
  return serial ? ['-s', serial] : [];
}

function listDeviceSweeps(adb, serial, deviceDir) {
  const root = runCommand(adb, [...adbSerialArgs(serial), 'shell', 'ls', '-1', deviceDir], {
    timeoutMs: 20000,
  });
  if (!root.ok) throw new Error(`adb ls ${deviceDir} failed:\n${commandFailure(root)}`);
  const names = root.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((name) => /^sweep(_\d+)?$/.test(name));
  const candidates = names.map((name) => {
    const dir = `${deviceDir}/${name}`;
    const entries = runCommand(adb, [...adbSerialArgs(serial), 'shell', 'ls', '-1', dir], {
      timeoutMs: 20000,
    });
    const listing = entries.ok ? entries.stdout.split(/\r?\n/).map((line) => line.trim()) : [];
    const hasManifest = listing.includes('manifest.json');
    let frameCount = 0;
    if (listing.includes('frames')) {
      const frames = runCommand(
        adb,
        [...adbSerialArgs(serial), 'shell', 'ls', '-1', `${dir}/frames`],
        { timeoutMs: 20000 }
      );
      if (frames.ok) {
        frameCount = frames.stdout
          .split(/\r?\n/)
          .filter((line) => line.trim().endsWith('.jpg')).length;
      }
    }
    return {
      name,
      hasManifest,
      frameCount,
      // MainActivity archives prior sweeps as sweep_<epochMs>; bare `sweep` is always the latest.
      newness: name === 'sweep' ? Number.POSITIVE_INFINITY : Number.parseInt(name.slice(6), 10),
    };
  });
  const best = candidates
    .filter((candidate) => candidate.hasManifest && candidate.frameCount > 0)
    .sort((a, b) => b.newness - a.newness)[0];
  const blockedReason = best
    ? undefined
    : 'no-usable-sweep: ' +
      (candidates.length === 0
        ? 'no sweep directories on device'
        : candidates
            .map(
              (candidate) =>
                `${candidate.name}(frames=${candidate.frameCount},manifest=${candidate.hasManifest ? 'present' : 'missing'})`
            )
            .join(', '));
  return {
    candidates: candidates.map(({ newness: _newness, ...rest }) => rest),
    best,
    blockedReason,
  };
}

function pullDeviceDir(adb, serial, remoteDir, localDir) {
  rmSync(localDir, { recursive: true, force: true });
  mkdirSync(dirname(localDir), { recursive: true });
  const result = runCommand(adb, [...adbSerialArgs(serial), 'pull', remoteDir, localDir], {
    timeoutMs: 600000,
    maxBuffer: 1024 * 1024 * 64,
  });
  if (!result.ok) throw new Error(`adb pull ${remoteDir} failed:\n${commandFailure(result)}`);
  requireFile(join(localDir, 'manifest.json'), 'Pulled sweep manifest');
  return localDir;
}

async function runPullSweep(args) {
  const dateDir = abs(join('.scratch', 'android-arcore-depth', args.date));
  const outPath = args.out ? abs(args.out) : join(dateDir, 'sweep-holomap-replay.json');
  let sweepDir;
  let device;
  if (args.sweepDir) {
    sweepDir = abs(args.sweepDir);
  } else {
    const adb = resolveAdbForPull(args);
    const listing = listDeviceSweeps(adb, args.serial, args.deviceDir);
    device = {
      serial: args.serial,
      filesDir: args.deviceDir,
      candidates: listing.candidates,
    };
    if (!listing.best) {
      const receipt = {
        schemaVersion: SWEEP_REPLAY_RECEIPT_VERSION,
        status: 'blocked',
        blockedReason: listing.blockedReason,
        device,
        honestScope:
          'The device has no sweep directory containing both frames/*.jpg and manifest.json; nothing was converted or replayed.',
      };
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
      return { ok: false, blockedReason: listing.blockedReason, receiptPath: outPath, device };
    }
    device.pulled = listing.best.name;
    sweepDir = pullDeviceDir(
      adb,
      args.serial,
      `${args.deviceDir}/${listing.best.name}`,
      join(dateDir, listing.best.name)
    );
  }

  const conversion = await convertSweepDir(sweepDir, {
    rgbWidth: args.rgbWidth,
    maxFrames: args.maxFrames,
  });
  const {
    createArCoreDepthMobileSensorBundle,
    replayMobileSensorBundle,
    validateMobileSensorBundle,
  } = await import('../packages/core/dist/reconstruction/index.js');
  const bundle = createArCoreDepthMobileSensorBundle(conversion.bundleInput);
  const bundleErrors = validateMobileSensorBundle(bundle);
  if (bundleErrors.length > 0) {
    throw new Error(`Generated invalid mobile sensor bundle: ${bundleErrors.join('; ')}`);
  }
  const replay = await replayMobileSensorBundle(bundle, { tileGrid: args.tileGrid });
  const manifest = conversion.manifest;
  const receipt = {
    schemaVersion: SWEEP_REPLAY_RECEIPT_VERSION,
    status: 'pass',
    sourceSweep: rel(sweepDir),
    device,
    sweep: {
      schemaVersion: manifest.schemaVersion,
      deviceModel: manifest.deviceModel,
      manifestSha256: conversion.manifestSha256,
      manifestFrameCount: manifest.frameCount,
      usedFrameCount: conversion.usedFrames.length,
      pathLengthM: manifest.pathLengthM,
      durationMs: manifest.durationMs,
      cameraImage: manifest.cameraImage,
    },
    conversion: {
      rgb: { ...conversion.rgb, decoder: 'sharp-jpeg-raw' },
      depth: {
        width: conversion.usedFrames[0].depthWidth,
        height: conversion.usedFrames[0].depthHeight,
      },
      tileGrid: args.tileGrid,
      frameJpegSha256: conversion.frameJpegSha256,
    },
    bundle: {
      bundleId: bundle.bundleId,
      platform: bundle.capture.platform,
      intrinsics: bundle.capture.intrinsics,
      frameCount: bundle.frames.length,
    },
    replay: {
      source: replay.source,
      stepCount: replay.steps.length,
      pointCount: replay.manifest.pointCount,
      frameCount: replay.manifest.frameCount,
      replayFingerprint: replay.manifest.simulationContract.replayFingerprint,
      videoHash: replay.manifest.videoHash,
    },
    honestScope: `Converts a posed multi-frame ARCore room sweep (full-res JPEGs downsampled to ${conversion.rgb.width}x${conversion.rgb.height} RGB + per-frame 16-bit depth and pose) into HoloMap mobile sensor ingest and replays it deterministically. JPEG bytes are referenced by sha256, not embedded; this is pose-anchored depth splatting, not 3DGS training.`,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { ok: true, receiptPath: outPath, sweepDir, replay: receipt.replay };
}

async function runHardware(args) {
  const toolchain = defaultToolchain(args);
  requireFile(toolchain.gradle, 'Gradle');
  requireFile(toolchain.adb, 'ADB');
  requireFile(
    join(toolchain.javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
    'Java'
  );

  const project = generateProject(args.project);
  const env = buildEnv(toolchain);
  const build = runCommand(toolchain.gradle, ['--no-daemon', ':app:assembleDebug'], {
    cwd: project,
    env,
    timeoutMs: 420000,
  });
  if (!build.ok) throw new Error(`Gradle build failed:\n${commandFailure(build)}`);

  const apk = join(project, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  requireFile(apk, 'Debug APK');
  for (const step of [
    ['install', '-r', '-d', apk],
    ['shell', 'pm', 'grant', 'com.holoscript.depthprobe', 'android.permission.CAMERA'],
    ['logcat', '-c'],
    ['shell', 'am', 'force-stop', 'com.holoscript.depthprobe'],
    ['shell', 'am', 'start', '-n', 'com.holoscript.depthprobe/.MainActivity'],
  ]) {
    const result = runCommand(toolchain.adb, step, { timeoutMs: 30000 });
    if (!result.ok) throw new Error(`ADB ${step.join(' ')} failed:\n${commandFailure(result)}`);
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(1, args.waitSec) * 1000);
  const outDir = abs(join('.scratch', 'android-arcore-depth', args.date));
  const framePath = args.out ? abs(args.out) : join(outDir, 'native-depth-frame.json');
  pullReceipt(toolchain.adb, framePath);
  const replay = await replayFrameReceipt(
    framePath,
    join(outDir, 'native-depth-holomap-replay.json')
  );
  return { framePath, replayPath: replay.out, replay: replay.receipt.replay };
}

function runSelfTest() {
  const main = readFileSync(
    join(
      TEMPLATE_DIR,
      'app',
      'src',
      'main',
      'java',
      'com',
      'holoscript',
      'depthprobe',
      'MainActivity.java'
    ),
    'utf8'
  );
  const manifest = readFileSync(
    join(TEMPLATE_DIR, 'app', 'src', 'main', 'AndroidManifest.xml'),
    'utf8'
  );
  const gradle = readFileSync(join(TEMPLATE_DIR, 'app', 'build.gradle'), 'utf8');
  // v3 sweep template invokes the API on a Frame instance: frame.acquireDepthImage16Bits()
  if (!main.includes('acquireDepthImage16Bits()'))
    throw new Error('template missing depth frame API');
  if (!main.includes('Config.DepthMode.AUTOMATIC'))
    throw new Error('template missing depth mode config');
  if (!main.includes('acquireCameraImage()'))
    throw new Error('template missing camera image acquisition');
  if (!manifest.includes('android.permission.CAMERA'))
    throw new Error('template missing camera permission');
  if (!gradle.includes('com.google.ar:core:1.54.0'))
    throw new Error('template missing ARCore dependency');
  if (!main.includes(SWEEP_MANIFEST_VERSION))
    throw new Error('template missing sweep manifest schema');
  if (!main.includes('getExternalFilesDir'))
    throw new Error('template missing external sweep dir (pull-sweep source path)');

  const fixture = {
    schemaVersion: FRAME_RECEIPT_VERSION,
    status: 'pass',
    deviceModel: 'SM-S918U',
    timestampNs: 123000000,
    sample: {
      width: 2,
      height: 2,
      stride: 3,
      rgb: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4],
      depthMillimeters: [500, 1000, 1500, 0],
      rawDepthConfidence: [255, 128, 64, 0],
    },
    depthImage16Bits: { width: 160, height: 90 },
    intrinsics: { imageWidth: 4, imageHeight: 4, fx: 4, fy: 4, cx: 2, cy: 2 },
    cameraTransformColumnMajor4x4: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, 0.2, 0.3, 1],
  };
  const errors = validateFrameReceipt(fixture);
  if (errors.length > 0) throw new Error(`fixture receipt failed validation: ${errors.join('; ')}`);
  const bundleInput = frameReceiptToArCoreBundleInput(fixture);
  if (bundleInput.frames[0].depthImage16Bits.millimeters[1] !== 1000) {
    throw new Error('depth millimeters were not preserved');
  }
  if (bundleInput.intrinsics.fx !== 2 || bundleInput.intrinsics.cx !== 1) {
    throw new Error('intrinsics were not scaled to the sample frame');
  }
  const overclaim = { ...fixture, sample: { ...fixture.sample, depthMillimeters: [500] } };
  if (!validateFrameReceipt(overclaim).includes('sample depth length invalid')) {
    throw new Error('invalid depth length was not rejected');
  }

  const sweepFixture = {
    schemaVersion: SWEEP_MANIFEST_VERSION,
    status: 'pass',
    deviceModel: 'SM-S918U',
    frameCount: 2,
    durationMs: 700,
    pathLengthM: 0.24,
    cameraImage: { width: 8, height: 4, format: 'jpeg' },
    intrinsics: { imageWidth: 8, imageHeight: 4, fx: 8, fy: 4, cx: 4, cy: 2 },
    frames: [0, 1].map((i) => ({
      index: i,
      timestampNs: 5_000_000 + i * 1_000_000,
      jpeg: `frames/frame_00${i}.jpg`,
      depthCoverage: 0.8,
      sharpness: 400,
      cameraTransformColumnMajor4x4: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.2 * i, 0, 0, 1],
      depthWidth: 2,
      depthHeight: 2,
      depthMillimeters: [600 + i, 900, 1200, 0],
    })),
  };
  if (validateSweepManifest(sweepFixture).length > 0) {
    throw new Error('sweep fixture failed validation');
  }
  const sweepDecoded = sweepFixture.frames.map(() => ({
    width: 4,
    height: 2,
    rgb: new Uint8Array(4 * 2 * 3).fill(7),
  }));
  const sweepBundleInput = sweepManifestToArCoreBundleInput(sweepFixture, sweepDecoded);
  if (sweepBundleInput.frames[1].depthImage16Bits.millimeters[0] !== 601) {
    throw new Error('sweep depth millimeters were not preserved');
  }
  if (sweepBundleInput.intrinsics.fx !== 4 || sweepBundleInput.intrinsics.cy !== 1) {
    throw new Error('sweep intrinsics were not scaled to the decoded rgb frame');
  }
  if (sweepBundleInput.frames[0].timestampMs !== 5) {
    throw new Error('sweep timestamps were not converted to milliseconds');
  }
  const sweepOverclaim = {
    ...sweepFixture,
    frames: [{ ...sweepFixture.frames[0], depthMillimeters: [600] }, sweepFixture.frames[1]],
  };
  if (
    !validateSweepManifest(sweepOverclaim).includes('frames[0].depthMillimeters length invalid')
  ) {
    throw new Error('invalid sweep depth length was not rejected');
  }
  return { ok: true, version: VERSION };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help') {
    printHelp();
    return;
  }
  if (args.command === 'self-test') {
    const result = runSelfTest();
    process.stdout.write(
      `android-arcore-depth-apk-runner self-test PASS ${JSON.stringify(result)}\n`
    );
    return;
  }
  if (args.command === 'generate') {
    const project = generateProject(args.project);
    process.stdout.write(`${JSON.stringify({ ok: true, project: rel(project) }, null, 2)}\n`);
    return;
  }
  if (args.command === 'replay') {
    if (!args.receipt) throw new Error('replay requires --receipt');
    const out =
      args.out ??
      join('.scratch', 'android-arcore-depth', args.date, 'native-depth-holomap-replay.json');
    const result = await replayFrameReceipt(abs(args.receipt), abs(out));
    process.stdout.write(
      `${JSON.stringify({ ok: true, out: rel(result.out), replay: result.receipt.replay }, null, 2)}\n`
    );
    return;
  }
  if (args.command === 'pull-sweep') {
    const result = await runPullSweep(args);
    if (!result.ok) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, status: 'blocked', blockedReason: result.blockedReason, receipt: rel(result.receiptPath), device: result.device }, null, 2)}\n`
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `${JSON.stringify({ ok: true, receipt: rel(result.receiptPath), sweep: rel(result.sweepDir), replay: result.replay }, null, 2)}\n`
    );
    return;
  }
  if (args.command === 'run') {
    const result = await runHardware(args);
    process.stdout.write(
      `${JSON.stringify({ ok: true, framePath: rel(result.framePath), replayPath: rel(result.replayPath), replay: result.replay }, null, 2)}\n`
    );
    return;
  }
  throw new Error(`Unknown command: ${args.command}`);
}

if (
  import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` ||
  process.argv[1]?.endsWith('android-arcore-depth-apk-runner.mjs')
) {
  main().catch((error) => {
    process.stderr.write(`android-arcore-depth-apk-runner FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
