#!/usr/bin/env node
/**
 * Build/install/run the native Android ARCore depth-frame probe.
 *
 * Generated Android projects and receipts live under .scratch. The tracked
 * template proves exactly which native APIs the workflow exercises.
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

export const VERSION = '0.1.0';
export const FRAME_RECEIPT_VERSION = 'holomap-android-arcore-depth-frame/v1';
export const REPLAY_RECEIPT_VERSION = 'holomap-android-arcore-depth-replay/v1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TEMPLATE_DIR = join(__dirname, 'android-arcore-depth-probe-template');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

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
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (['generate', 'run', 'replay', 'self-test', 'help'].includes(arg)) args.command = arg;
    else if (arg === '--self-test') args.command = 'self-test';
    else if (arg === '--project') args.project = argv[++i];
    else if (arg === '--receipt') args.receipt = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--date') args.date = argv[++i];
    else if (arg === '--adb') args.adb = argv[++i];
    else if (arg === '--gradle') args.gradle = argv[++i];
    else if (arg === '--java-home') args.javaHome = argv[++i];
    else if (arg === '--android-home') args.androidHome = argv[++i];
    else if (arg === '--wait-sec') args.waitSec = Number.parseFloat(argv[++i]);
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
  node scripts/android-arcore-depth-apk-runner.mjs --self-test

Defaults expect scratch toolchain paths:
  .scratch/android-native-toolchain/jdk21/jdk-21.0.11+10
  .scratch/android-native-toolchain/android-sdk
  .scratch/android-native-toolchain/gradle/gradle-9.5.1/bin/gradle.bat

The APK writes a native frame receipt from Frame.acquireDepthImage16Bits().
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
  const spawnBin = batchOnWindows ? process.env.ComSpec ?? 'cmd.exe' : bin;
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
    : join(tc, 'gradle', 'gradle-9.5.1', 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle');
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
    if (!Array.isArray(receipt.cameraTransformColumnMajor4x4) || receipt.cameraTransformColumnMajor4x4.length !== 16) {
      errors.push('camera transform missing');
    }
    if (!receipt.intrinsics?.fx || !receipt.intrinsics?.fy) errors.push('camera intrinsics missing');
  }
  if (receipt.status === 'blocked' && !receipt.blockedReason) {
    errors.push('blocked receipt missing blockedReason');
  }
  return errors;
}

export function frameReceiptToArCoreBundleInput(receipt) {
  const errors = validateFrameReceipt(receipt);
  if (errors.length > 0) throw new Error(`Invalid ARCore depth frame receipt: ${errors.join('; ')}`);
  if (receipt.status !== 'pass') throw new Error(`Cannot replay blocked receipt: ${receipt.blockedReason}`);

  const sample = receipt.sample;
  const sx = sample.width / receipt.intrinsics.imageWidth;
  const sy = sample.height / receipt.intrinsics.imageHeight;
  return {
    bundleId:
      's23-arcore-depth-' +
      createHash('sha256').update(JSON.stringify(receipt.hashes ?? sample.depthMillimeters.slice(0, 64))).digest('hex').slice(0, 12),
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
  if (errors.length > 0) throw new Error(`Generated invalid mobile sensor bundle: ${errors.join('; ')}`);
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
  const result = runCommand(adb, ['exec-out', 'run-as', 'com.holoscript.depthprobe', 'cat', 'files/holomap-arcore-depth-frame.json'], {
    encoding: 'buffer',
    timeoutMs: 20000,
    maxBuffer: 1024 * 1024 * 4,
  });
  if (!result.ok) {
    throw new Error(`pull receipt failed: ${result.error ?? result.stderr}`);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, result.stdout);
  return outPath;
}

async function runHardware(args) {
  const toolchain = defaultToolchain(args);
  requireFile(toolchain.gradle, 'Gradle');
  requireFile(toolchain.adb, 'ADB');
  requireFile(join(toolchain.javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'), 'Java');

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
  const replay = await replayFrameReceipt(framePath, join(outDir, 'native-depth-holomap-replay.json'));
  return { framePath, replayPath: replay.out, replay: replay.receipt.replay };
}

function runSelfTest() {
  const main = readFileSync(join(TEMPLATE_DIR, 'app', 'src', 'main', 'java', 'com', 'holoscript', 'depthprobe', 'MainActivity.java'), 'utf8');
  const manifest = readFileSync(join(TEMPLATE_DIR, 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  const gradle = readFileSync(join(TEMPLATE_DIR, 'app', 'build.gradle'), 'utf8');
  if (!main.includes('Frame.acquireDepthImage16Bits()')) throw new Error('template missing depth frame API');
  if (!main.includes('Config.DepthMode.AUTOMATIC')) throw new Error('template missing depth mode config');
  if (!main.includes('acquireCameraImage()')) throw new Error('template missing camera image acquisition');
  if (!manifest.includes('android.permission.CAMERA')) throw new Error('template missing camera permission');
  if (!gradle.includes('com.google.ar:core:1.54.0')) throw new Error('template missing ARCore dependency');

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
    process.stdout.write(`android-arcore-depth-apk-runner self-test PASS ${JSON.stringify(result)}\n`);
    return;
  }
  if (args.command === 'generate') {
    const project = generateProject(args.project);
    process.stdout.write(`${JSON.stringify({ ok: true, project: rel(project) }, null, 2)}\n`);
    return;
  }
  if (args.command === 'replay') {
    if (!args.receipt) throw new Error('replay requires --receipt');
    const out = args.out ?? join('.scratch', 'android-arcore-depth', args.date, 'native-depth-holomap-replay.json');
    const result = await replayFrameReceipt(abs(args.receipt), abs(out));
    process.stdout.write(`${JSON.stringify({ ok: true, out: rel(result.out), replay: result.receipt.replay }, null, 2)}\n`);
    return;
  }
  if (args.command === 'run') {
    const result = await runHardware(args);
    process.stdout.write(`${JSON.stringify({ ok: true, framePath: rel(result.framePath), replayPath: rel(result.replayPath), replay: result.replay }, null, 2)}\n`);
    return;
  }
  throw new Error(`Unknown command: ${args.command}`);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('android-arcore-depth-apk-runner.mjs')) {
  main().catch((error) => {
    process.stderr.write(`android-arcore-depth-apk-runner FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
