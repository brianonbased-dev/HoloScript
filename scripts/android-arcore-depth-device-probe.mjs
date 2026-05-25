#!/usr/bin/env node
/**
 * Android ARCore Depth Device Probe
 *
 * ADB-native HoloMap hardware-readiness workflow for Android phones. This does
 * not open a browser and does not claim depth frames until a native ARCore APK
 * runs Frame.acquireDepthImage16Bits() on-device.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chainReceipt, hashValue, sha256Text, stageReceipt, withHash } from './holoshell/chain/receipts.mjs';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'holomap-android-arcore-depth-device-probe/v1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const STATUS_VALUES = new Set(['pass', 'blocked', 'fail']);

function parseArgs(argv) {
  const args = {
    command: 'probe',
    adb: undefined,
    serial: undefined,
    out: undefined,
    date: DEFAULT_DATE,
    now: undefined,
    json: false,
    selfTest: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === 'probe') args.command = 'probe';
    else if (arg === 'self-test' || arg === '--self-test') args.command = 'self-test';
    else if (arg === 'help' || arg === '--help' || arg === '-h') args.command = 'help';
    else if (arg === '--adb') args.adb = argv[++i];
    else if (arg === '--serial') args.serial = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--date') args.date = argv[++i];
    else if (arg === '--now') args.now = argv[++i];
    else if (arg === '--json') args.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  process.stdout.write(`Android ARCore Depth Device Probe ${VERSION}

Usage:
  node scripts/android-arcore-depth-device-probe.mjs [probe] [--adb path] [--serial adbSerial] [--json]
  node scripts/android-arcore-depth-device-probe.mjs --self-test

What it proves:
  - USB ADB sees an authorized Android device.
  - ARCore is installed.
  - Camera and motion features are present.
  - Camera2 depth metadata is visible through dumpsys media.camera.

Honest scope:
  - This is an ADB-native hardware-readiness receipt.
  - It does not run an ARCore Session and does not acquire depth frames.
  - Depth-frame proof requires a native ARCore APK calling Frame.acquireDepthImage16Bits().
`);
}

function nowIso(args) {
  const value = args.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid ISO timestamp: ${value}`);
  return value;
}

function defaultOutput(date) {
  return join('.scratch', 'android-arcore-depth', date, 'device-probe-receipt.json');
}

function writeJson(path, value) {
  const absolute = isAbsolute(path) ? path : resolve(REPO_ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolute;
}

function firstNonEmptyLine(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function commandLine(bin, args) {
  return [bin, ...args].join(' ');
}

function runCommand(bin, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(bin, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 15000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
    windowsHide: true,
  });

  return {
    command: commandLine(bin, args),
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message,
    durationMs: Date.now() - started,
    ok: !result.error && result.status === 0,
  };
}

function lookupPathCommand(command) {
  const lookup = process.platform === 'win32' ? ['where.exe', [command]] : ['which', [command]];
  const result = runCommand(lookup[0], lookup[1], { timeoutMs: 5000, maxBuffer: 1024 * 64 });
  if (!result.ok) return undefined;
  return firstNonEmptyLine(result.stdout);
}

function adbCandidates() {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [
    process.env.ADB,
    join(REPO_ROOT, '.scratch', 'android-platform-tools', 'extracted', 'platform-tools', exe),
    process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, 'platform-tools', exe) : undefined,
    process.env.ANDROID_SDK_ROOT ? join(process.env.ANDROID_SDK_ROOT, 'platform-tools', exe) : undefined,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exe) : undefined,
    lookupPathCommand(process.platform === 'win32' ? 'adb.exe' : 'adb'),
    lookupPathCommand('adb'),
  ];
  return candidates.filter(Boolean);
}

function resolveAdbPath(args) {
  const candidates = args.adb ? [args.adb] : adbCandidates();
  for (const candidate of candidates) {
    const absolute = isAbsolute(candidate) ? candidate : resolve(REPO_ROOT, candidate);
    if (existsSync(absolute)) return absolute;
    if (!candidate.includes('\\') && !candidate.includes('/') && lookupPathCommand(candidate)) return candidate;
  }
  return undefined;
}

export function parseAdbDevices(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith('list of devices'))
    .map((line) => {
      const parts = line.split(/\s+/);
      const serial = parts.shift();
      const status = parts.shift() ?? 'unknown';
      const details = {};
      for (const token of parts) {
        const index = token.indexOf(':');
        if (index > 0) details[token.slice(0, index)] = token.slice(index + 1);
      }
      return {
        serial,
        status,
        product: details.product,
        model: details.model,
        device: details.device,
        transportId: details.transport_id,
      };
    });
}

function redactAdbDevice(device) {
  if (!device) return undefined;
  return {
    serialHash: `sha256:${sha256Text(device.serial ?? '')}`,
    serialSuffix: device.serial ? device.serial.slice(-4) : undefined,
    status: device.status,
    product: device.product,
    model: device.model,
    device: device.device,
    transportId: device.transportId,
  };
}

function selectDevice(devices, requestedSerial) {
  if (requestedSerial) {
    return devices.find((device) => device.serial === requestedSerial) ?? {
      serial: requestedSerial,
      status: 'missing',
    };
  }
  return devices.find((device) => device.status === 'device') ?? devices[0];
}

function runAdb(adbPath, args, options = {}) {
  return runCommand(adbPath, args, {
    timeoutMs: options.timeoutMs ?? 20000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 16,
  });
}

function runAdbForDevice(adbPath, serial, args, options = {}) {
  return runAdb(adbPath, ['-s', serial, ...args], options);
}

function trimOutput(result) {
  return String(result?.stdout ?? '').trim();
}

export function parseArCorePackage(packageListText, packageDumpText) {
  const packageList = String(packageListText ?? '');
  const packageDump = String(packageDumpText ?? '');
  const installed =
    /\bpackage:com\.google\.ar\.core\b/.test(packageList) ||
    /Package \[com\.google\.ar\.core\]/.test(packageDump) ||
    /\bcom\.google\.ar\.core\b/.test(packageDump);
  const versionName = packageDump.match(/\bversionName=([^\s]+)/)?.[1];
  const versionCode = packageDump.match(/\bversionCode=(\d+)/)?.[1];
  const targetSdk = packageDump.match(/\btargetSdk=(\d+)/)?.[1];
  const lastUpdateTime = packageDump.match(/\blastUpdateTime=([^\n\r]+)/)?.[1]?.trim();
  return {
    installed,
    versionName,
    versionCode: versionCode ? Number.parseInt(versionCode, 10) : undefined,
    targetSdk: targetSdk ? Number.parseInt(targetSdk, 10) : undefined,
    lastUpdateTime,
  };
}

export function parseFeatureList(text) {
  const features = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^feature:/, ''))
    .filter((line) => line.startsWith('android.hardware.') || line.startsWith('android.software.'));
  const set = new Set(features);
  const relevant = features.filter((feature) =>
    feature.includes('camera') ||
    feature.includes('sensor') ||
    feature.includes('vulkan') ||
    feature.includes('opengles')
  );
  return {
    selected: [...new Set(relevant)].sort(),
    hasCamera: set.has('android.hardware.camera') || set.has('android.hardware.camera.any'),
    hasBackOrAnyCamera: set.has('android.hardware.camera') || set.has('android.hardware.camera.any'),
    hasAutofocus: set.has('android.hardware.camera.autofocus'),
    hasRaw: set.has('android.hardware.camera.raw') || set.has('android.hardware.camera.capability.raw'),
    hasManualSensor: set.has('android.hardware.camera.capability.manual_sensor'),
    hasGyroscope: set.has('android.hardware.sensor.gyroscope'),
    hasAccelerometer: set.has('android.hardware.sensor.accelerometer'),
    hasCompass: set.has('android.hardware.sensor.compass'),
    hasVulkan: [...set].some((feature) => feature.includes('vulkan')),
  };
}

export function parseResolveActivity(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const componentLine = lines.find((line) => /^[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+$/.test(line));
  if (componentLine) return componentLine;

  const activityName = lines.find((line) => line.startsWith('name='))?.slice('name='.length);
  const packageName = lines.find((line) => line.startsWith('packageName='))?.slice('packageName='.length);
  if (activityName && packageName) {
    if (activityName.startsWith(`${packageName}.`)) {
      return `${packageName}/.${activityName.slice(packageName.length + 1)}`;
    }
    return `${packageName}/${activityName}`;
  }

  return undefined;
}

export function parseCameraDump(text) {
  const dump = String(text ?? '');
  const depthMetadataKeys = [...new Set(dump.match(/android\.depth\.[A-Za-z0-9._]+/g) ?? [])].sort();
  const capabilityNames = [
    'BACKWARD_COMPATIBLE',
    'CONSTRAINED_HIGH_SPEED_VIDEO',
    'RAW',
    'YUV_REPROCESSING',
    'PRIVATE_REPROCESSING',
    'READ_SENSOR_SETTINGS',
    'MANUAL_SENSOR',
    'BURST_CAPTURE',
    'MANUAL_POST_PROCESSING',
    'STREAM_USE_CASE',
    'DYNAMIC_RANGE_TEN_BIT',
    'LOGICAL_MULTI_CAMERA',
  ];
  const capabilities = capabilityNames.filter((capability) => new RegExp(`\\b${capability}\\b`).test(dump));
  return {
    dumpHash: hashValue(dump),
    backCameraPresent: /Facing:\s*Back/i.test(dump) || /LENS_FACING_BACK/.test(dump),
    frontCameraPresent: /Facing:\s*Front/i.test(dump) || /LENS_FACING_FRONT/.test(dump),
    depthMetadataPresent: depthMetadataKeys.length > 0,
    depthStreamConfigurationPresent: depthMetadataKeys.some((key) => key.includes('availableDepthStreamConfigurations')),
    depthMetadataKeys,
    capabilities,
    logicalMultiCamera: capabilities.includes('LOGICAL_MULTI_CAMERA'),
    manualSensor: capabilities.includes('MANUAL_SENSOR'),
    raw: capabilities.includes('RAW'),
  };
}

function commandAvailability(command, args = ['--version']) {
  const result = runCommand(command, args, { timeoutMs: 5000, maxBuffer: 1024 * 256 });
  const versionText = `${result.stdout}\n${result.stderr}`.trim();
  return {
    available: result.ok,
    status: result.status,
    error: result.error,
    versionLine: firstNonEmptyLine(versionText),
  };
}

function localAndroidToolchainProbe() {
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
  const java = commandAvailability('java', ['-version']);
  const gradle = commandAvailability('gradle', ['--version']);
  const kotlinc = commandAvailability('kotlinc', ['-version']);
  const androidHomePresent = Boolean(process.env.ANDROID_HOME);
  const androidSdkRootPresent = Boolean(process.env.ANDROID_SDK_ROOT);
  const gradleWrapperPresent = existsSync(resolve(REPO_ROOT, gradlew));
  const sdkConfigured = androidHomePresent || androidSdkRootPresent;
  return {
    java,
    gradle,
    kotlinc,
    env: {
      ANDROID_HOME: androidHomePresent,
      ANDROID_SDK_ROOT: androidSdkRootPresent,
    },
    gradleWrapperPresent,
    apkBuildReady: java.available && sdkConfigured && (gradle.available || gradleWrapperPresent),
    blockedReason: java.available && sdkConfigured && (gradle.available || gradleWrapperPresent)
      ? undefined
      : 'android-build-toolchain-missing',
  };
}

function buildStages(receiptBase) {
  const deviceStage = stageReceipt({
    name: 'adb.device',
    input: {
      adbAvailable: receiptBase.adb.available,
      requestedSerial: receiptBase.requestedSerial ? 'provided' : undefined,
    },
    output: {
      selectedDevice: receiptBase.device,
      deviceCount: receiptBase.adb.devices.length,
    },
    metrics: {
      authorizedDeviceCount: receiptBase.adb.devices.filter((device) => device.status === 'device').length,
    },
    honestScope: 'USB ADB enumeration only. Raw ADB serials are hashed in the receipt.',
  });
  const arCoreStage = stageReceipt({
    name: 'android.arcore-package',
    input: {
      package: 'com.google.ar.core',
    },
    output: receiptBase.arCore,
    honestScope: 'Package presence and version metadata only. This does not start an ARCore Session.',
  });
  const cameraStage = stageReceipt({
    name: 'android.camera2-depth-metadata',
    output: {
      features: receiptBase.androidFeatures,
      camera: receiptBase.camera,
      activities: receiptBase.activities,
    },
    honestScope: 'Camera2 and Android intent metadata from ADB. This does not acquire image or depth frames.',
  });
  const toolchainStage = stageReceipt({
    name: 'local.android-build-toolchain',
    output: receiptBase.localToolchain,
    honestScope: 'Host-side APK build readiness check. Missing tools block the next native depth-frame proof, not this hardware-readiness probe.',
  });
  const runtimeStage = stageReceipt({
    name: 'arcore.depth-frame-acquisition',
    output: receiptBase.runtimeDepthCapture,
    honestScope: receiptBase.runtimeDepthCapture.honestScope,
  });
  const stages = [deviceStage, arCoreStage, cameraStage, toolchainStage, runtimeStage];
  return {
    receipt: chainReceipt({
      name: 'holomap-android-arcore-depth-device-probe',
      stages,
      metrics: {
        status: receiptBase.status,
        hardwareReady: receiptBase.hardwareReady,
        apkBuildReady: receiptBase.localToolchain.apkBuildReady,
      },
      honestScope:
        'Ordered ADB-native readiness chain for HoloMap Android depth ingest. Runtime depth frames require the native APK step.',
    }),
    stages,
  };
}

export function buildAndroidArCoreDepthProbeReceipt(input) {
  const at = input.generatedAt ?? new Date().toISOString();
  const adbDevices = parseAdbDevices(input.adbDevicesText);
  const selectedRaw = input.selectedSerial
    ? selectDevice(adbDevices, input.selectedSerial)
    : selectDevice(adbDevices, undefined);
  const selected = redactAdbDevice(selectedRaw);
  const properties = input.properties ?? {};
  const arCore = parseArCorePackage(input.arCorePackageListText, input.arCorePackageDumpText);
  const androidFeatures = parseFeatureList(input.featureListText);
  const camera = parseCameraDump(input.cameraDumpText);
  const activities = {
    imageCapture: parseResolveActivity(input.imageCaptureActivityText),
    videoCapture: parseResolveActivity(input.videoCaptureActivityText),
  };
  const localToolchain = input.localToolchain ?? {
    apkBuildReady: false,
    blockedReason: 'android-build-toolchain-missing',
  };

  const blockers = [];
  const failures = [];
  if (!input.adbAvailable) blockers.push('adb-not-found');
  if (!selectedRaw) blockers.push('adb-device-not-found');
  if (selectedRaw && selectedRaw.status !== 'device') blockers.push(`adb-device-${selectedRaw.status}`);
  if (!arCore.installed) failures.push('arcore-package-missing');
  if (!androidFeatures.hasCamera) failures.push('android-camera-feature-missing');
  if (!androidFeatures.hasGyroscope) failures.push('android-gyroscope-feature-missing');
  if (!androidFeatures.hasAccelerometer) failures.push('android-accelerometer-feature-missing');
  if (!camera.backCameraPresent) blockers.push('camera2-back-camera-not-observed');
  if (!camera.depthMetadataPresent) blockers.push('camera2-depth-metadata-not-observed');

  const status = failures.length > 0 ? 'fail' : blockers.length > 0 ? 'blocked' : 'pass';
  const runtimeDepthCapture = {
    status: 'blocked',
    blockedReason: localToolchain.apkBuildReady
      ? 'native-arcore-depth-test-apk-not-built-or-installed'
      : 'android-build-toolchain-missing',
    requiredApi: 'Frame.acquireDepthImage16Bits()',
    requiredTransport: 'native Android ARCore APK over USB ADB',
    honestScope:
      'This probe does not run an ARCore Session and does not acquire depth frames. It only proves the connected-device prerequisites for the native APK test.',
  };

  const evidenceHashes = {
    adbDevices: hashValue(input.adbDevicesText ?? ''),
    arCorePackageList: hashValue(input.arCorePackageListText ?? ''),
    arCorePackageDump: hashValue(input.arCorePackageDumpText ?? ''),
    featureList: hashValue(input.featureListText ?? ''),
    cameraDump: hashValue(input.cameraDumpText ?? ''),
    imageCaptureActivity: hashValue(input.imageCaptureActivityText ?? ''),
    videoCaptureActivity: hashValue(input.videoCaptureActivityText ?? ''),
  };

  const receiptBase = {
    id: `android-arcore-depth-probe-${sha256Text(`${at}:${selected?.serialHash ?? 'no-device'}`).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    adapterVersion: VERSION,
    generatedAt: at,
    status,
    hardwareReady: status === 'pass',
    blockers,
    failures,
    adb: {
      available: Boolean(input.adbAvailable),
      pathHint: input.adbPath ? 'provided-or-discovered' : undefined,
      devices: adbDevices.map(redactAdbDevice),
    },
    requestedSerial: input.selectedSerial ? 'provided' : undefined,
    device: {
      ...selected,
      manufacturer: properties.manufacturer,
      model: properties.model ?? selected?.model,
      productDevice: properties.device ?? selected?.device,
      androidRelease: properties.androidRelease,
      androidSdk: properties.androidSdk ? Number.parseInt(properties.androidSdk, 10) : undefined,
      fingerprintHash: properties.fingerprint ? `sha256:${sha256Text(properties.fingerprint)}` : undefined,
    },
    arCore,
    androidFeatures,
    camera,
    activities,
    localToolchain,
    runtimeDepthCapture,
    evidenceHashes,
    summary: status === 'pass'
      ? 'Connected Android device is ADB-authorized with ARCore, camera/motion features, and Camera2 depth metadata visible. Native ARCore depth-frame capture is still a separate APK proof.'
      : failures.length > 0
        ? `Connected Android depth readiness failed: ${failures.join(', ')}.`
        : `Android depth readiness blocked: ${blockers.join(', ')}.`,
    verificationCommands: [
      {
        command: 'pnpm holomap:android-arcore-device-probe',
        description: 'Run the ADB-native Android ARCore depth readiness probe.',
      },
      {
        command: 'pnpm holomap:android-arcore-device-probe-test',
        description: 'Run parser and receipt validation tests for the probe.',
      },
    ],
  };

  return withHash({
    ...receiptBase,
    chain: buildStages(receiptBase),
  });
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') return ['receipt must be an object'];
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (!STATUS_VALUES.has(receipt.status)) errors.push(`status unsupported: ${receipt.status}`);
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  if (!receipt.chain?.receipt?.hash?.startsWith('sha256:')) errors.push('chain receipt hash missing');
  if (!Array.isArray(receipt.chain?.stages) || receipt.chain.stages.length < 1) errors.push('chain stages missing');
  if (receipt.status === 'pass') {
    if (!receipt.device?.model) errors.push('pass receipt missing device model');
    if (!receipt.arCore?.installed) errors.push('pass receipt missing ARCore installation');
    if (!receipt.androidFeatures?.hasCamera) errors.push('pass receipt missing Android camera feature');
    if (!receipt.androidFeatures?.hasGyroscope) errors.push('pass receipt missing gyroscope feature');
    if (!receipt.androidFeatures?.hasAccelerometer) errors.push('pass receipt missing accelerometer feature');
    if (!receipt.camera?.backCameraPresent) errors.push('pass receipt missing back camera metadata');
    if (!receipt.camera?.depthMetadataPresent) errors.push('pass receipt missing Camera2 depth metadata');
    if (receipt.runtimeDepthCapture?.status !== 'blocked') {
      errors.push('readiness probe must not claim ARCore depth frames were acquired');
    }
    if (!String(receipt.runtimeDepthCapture?.honestScope ?? '').includes('does not acquire depth frames')) {
      errors.push('runtimeDepthCapture honest scope must state no depth frames were acquired');
    }
  }
  if (receipt.status === 'blocked' && (!Array.isArray(receipt.blockers) || receipt.blockers.length < 1)) {
    errors.push('blocked receipt missing blockers');
  }
  if (receipt.status === 'fail' && (!Array.isArray(receipt.failures) || receipt.failures.length < 1)) {
    errors.push('fail receipt missing failures');
  }
  return errors;
}

async function collectProbe(args) {
  const generatedAt = nowIso(args);
  const adbPath = resolveAdbPath(args);
  const localToolchain = localAndroidToolchainProbe();

  if (!adbPath) {
    return buildAndroidArCoreDepthProbeReceipt({
      generatedAt,
      adbAvailable: false,
      adbPath,
      selectedSerial: args.serial,
      adbDevicesText: '',
      localToolchain,
    });
  }

  const adbDevices = runAdb(adbPath, ['devices', '-l']);
  const parsedDevices = parseAdbDevices(adbDevices.stdout);
  const selected = selectDevice(parsedDevices, args.serial);
  if (!selected || selected.status !== 'device') {
    return buildAndroidArCoreDepthProbeReceipt({
      generatedAt,
      adbAvailable: true,
      adbPath,
      selectedSerial: args.serial,
      adbDevicesText: adbDevices.stdout,
      localToolchain,
    });
  }

  const prop = (name) => trimOutput(runAdbForDevice(adbPath, selected.serial, ['shell', 'getprop', name]));
  const packageList = runAdbForDevice(adbPath, selected.serial, ['shell', 'pm', 'list', 'packages', 'com.google.ar.core']);
  const packageDump = runAdbForDevice(adbPath, selected.serial, ['shell', 'dumpsys', 'package', 'com.google.ar.core'], {
    maxBuffer: 1024 * 1024 * 8,
  });
  const featureList = runAdbForDevice(adbPath, selected.serial, ['shell', 'pm', 'list', 'features'], {
    maxBuffer: 1024 * 1024 * 8,
  });
  const imageActivity = runAdbForDevice(
    adbPath,
    selected.serial,
    ['shell', 'cmd', 'package', 'resolve-activity', '-a', 'android.media.action.IMAGE_CAPTURE'],
    { maxBuffer: 1024 * 1024 }
  );
  const videoActivity = runAdbForDevice(
    adbPath,
    selected.serial,
    ['shell', 'cmd', 'package', 'resolve-activity', '-a', 'android.media.action.VIDEO_CAPTURE'],
    { maxBuffer: 1024 * 1024 }
  );
  const cameraDump = runAdbForDevice(adbPath, selected.serial, ['shell', 'dumpsys', 'media.camera'], {
    timeoutMs: 30000,
    maxBuffer: 1024 * 1024 * 64,
  });

  return buildAndroidArCoreDepthProbeReceipt({
    generatedAt,
    adbAvailable: true,
    adbPath,
    selectedSerial: selected.serial,
    adbDevicesText: adbDevices.stdout,
    properties: {
      manufacturer: prop('ro.product.manufacturer'),
      model: prop('ro.product.model'),
      device: prop('ro.product.device'),
      androidRelease: prop('ro.build.version.release'),
      androidSdk: prop('ro.build.version.sdk'),
      fingerprint: prop('ro.build.fingerprint'),
    },
    arCorePackageListText: packageList.stdout,
    arCorePackageDumpText: packageDump.stdout,
    featureListText: featureList.stdout,
    imageCaptureActivityText: imageActivity.stdout,
    videoCaptureActivityText: videoActivity.stdout,
    cameraDumpText: cameraDump.stdout,
    localToolchain,
  });
}

export function selfTest() {
  const adbDevicesText = `List of devices attached
R5CW20QRNMK device product:dm3qsqw model:SM_S918U device:dm3q transport_id:1
`;
  const featureListText = `feature:android.hardware.camera
feature:android.hardware.camera.any
feature:android.hardware.camera.autofocus
feature:android.hardware.camera.capability.manual_sensor
feature:android.hardware.camera.capability.raw
feature:android.hardware.sensor.accelerometer
feature:android.hardware.sensor.gyroscope
feature:android.hardware.sensor.compass
feature:android.hardware.vulkan.level
`;
  const packageListText = 'package:com.google.ar.core\n';
  const packageDumpText = `Package [com.google.ar.core] (abc):
  versionCode=260890093 minSdk=24 targetSdk=36
  versionName=1.54.260890093
  lastUpdateTime=2026-04-25 18:39:14
`;
  const cameraDumpText = `Camera ID: 0
  Facing: Back
  Orientation: 90
  Available capabilities:
    BACKWARD_COMPATIBLE RAW READ_SENSOR_SETTINGS MANUAL_SENSOR LOGICAL_MULTI_CAMERA
  android.depth.availableDepthStreamConfigurations (d0001): int32[] [1144402265 320 240 0]
  android.depth.availableDepthMinFrameDurations (d0002): int64[] [1144402265 320 240 33333333]
  android.depth.maxDepthSamples (d0004): int32 32
`;
  const receipt = buildAndroidArCoreDepthProbeReceipt({
    generatedAt: '2026-05-25T00:00:00.000Z',
    adbAvailable: true,
    selectedSerial: 'R5CW20QRNMK',
    adbDevicesText,
    properties: {
      manufacturer: 'samsung',
      model: 'SM-S918U',
      device: 'dm3q',
      androidRelease: '16',
      androidSdk: '36',
      fingerprint: 'samsung/dm3qsqw/dm3q:16/test:user/release-keys',
    },
    arCorePackageListText: packageListText,
    arCorePackageDumpText: packageDumpText,
    featureListText,
    imageCaptureActivityText: 'com.sec.android.app.camera/.Camera\n',
    videoCaptureActivityText: 'com.sec.android.app.camera/.Camcorder\n',
    cameraDumpText,
    localToolchain: {
      java: { available: false },
      gradle: { available: false },
      kotlinc: { available: false },
      env: { ANDROID_HOME: false, ANDROID_SDK_ROOT: false },
      gradleWrapperPresent: false,
      apkBuildReady: false,
      blockedReason: 'android-build-toolchain-missing',
    },
  });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(`self-test pass receipt failed validation: ${errors.join('; ')}`);
  if (receipt.status !== 'pass') throw new Error(`expected pass receipt, got ${receipt.status}`);
  if (!receipt.camera.depthMetadataKeys.includes('android.depth.maxDepthSamples')) {
    throw new Error('depth metadata key was not parsed');
  }

  const noDepth = buildAndroidArCoreDepthProbeReceipt({
    generatedAt: '2026-05-25T00:00:00.000Z',
    adbAvailable: true,
    selectedSerial: 'R5CW20QRNMK',
    adbDevicesText,
    properties: { model: 'SM-S918U', androidSdk: '36' },
    arCorePackageListText: packageListText,
    arCorePackageDumpText: packageDumpText,
    featureListText,
    cameraDumpText: 'Camera ID: 0\n  Facing: Back\n  Available capabilities: BACKWARD_COMPATIBLE RAW MANUAL_SENSOR\n',
    localToolchain: { apkBuildReady: false, blockedReason: 'android-build-toolchain-missing' },
  });
  if (noDepth.status !== 'blocked') throw new Error(`expected missing depth metadata to block, got ${noDepth.status}`);
  if (!noDepth.blockers.includes('camera2-depth-metadata-not-observed')) {
    throw new Error('missing depth metadata blocker was not recorded');
  }

  const overclaim = {
    ...receipt,
    runtimeDepthCapture: {
      ...receipt.runtimeDepthCapture,
      status: 'pass',
    },
  };
  if (!validateReceipt(overclaim).includes('readiness probe must not claim ARCore depth frames were acquired')) {
    throw new Error('depth-frame overclaim was not rejected');
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
    process.stdout.write(`android-arcore-depth-device-probe self-test PASS ${receipt.hash}\n`);
    return;
  }

  const receipt = await collectProbe(args);
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(`Invalid receipt: ${errors.join('; ')}`);
  const out = writeJson(args.out ?? defaultOutput(args.date), receipt);
  const summary = {
    ok: true,
    receiptPath: out,
    status: receipt.status,
    hardwareReady: receipt.hardwareReady,
    device: {
      manufacturer: receipt.device.manufacturer,
      model: receipt.device.model,
      androidRelease: receipt.device.androidRelease,
      androidSdk: receipt.device.androidSdk,
      adbStatus: receipt.device.status,
    },
    arCore: receipt.arCore,
    camera: {
      backCameraPresent: receipt.camera.backCameraPresent,
      depthMetadataPresent: receipt.camera.depthMetadataPresent,
      depthMetadataKeys: receipt.camera.depthMetadataKeys,
      capabilities: receipt.camera.capabilities,
    },
    localToolchain: {
      apkBuildReady: receipt.localToolchain.apkBuildReady,
      blockedReason: receipt.localToolchain.blockedReason,
    },
    runtimeDepthCapture: receipt.runtimeDepthCapture,
    blockers: receipt.blockers,
    failures: receipt.failures,
  };
  process.stdout.write(args.json ? `${JSON.stringify(summary, null, 2)}\n` : `${summary.status} ${out}\n`);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('android-arcore-depth-device-probe.mjs')) {
  main().catch((error) => {
    process.stderr.write(`android-arcore-depth-device-probe FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
