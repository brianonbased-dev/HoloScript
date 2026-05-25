#!/usr/bin/env node
/**
 * Pure Node tests for scripts/android-arcore-depth-device-probe.mjs.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  buildAndroidArCoreDepthProbeReceipt,
  parseAdbDevices,
  parseCameraDump,
  parseFeatureList,
  parseResolveActivity,
  selfTest,
  validateReceipt,
} from '../android-arcore-depth-device-probe.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'android-arcore-depth-device-probe.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertOk(value, name) {
  testsRun += 1;
  if (value) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

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

console.log('Test 1: ADB device parser keeps S23 hardware facts');
const devices = parseAdbDevices(adbDevicesText);
assertEq(devices.length, 1, 'one device parsed');
assertEq(devices[0].status, 'device', 'authorized device status parsed');
assertEq(devices[0].model, 'SM_S918U', 'device model parsed');
assertEq(devices[0].device, 'dm3q', 'device codename parsed');

console.log('Test 2: feature and Camera2 parsers find capture prerequisites');
const features = parseFeatureList(featureListText);
assertEq(features.hasCamera, true, 'camera feature present');
assertEq(features.hasGyroscope, true, 'gyroscope feature present');
assertEq(features.hasAccelerometer, true, 'accelerometer feature present');
const camera = parseCameraDump(cameraDumpText);
assertEq(camera.backCameraPresent, true, 'back camera present');
assertEq(camera.depthMetadataPresent, true, 'depth metadata present');
assertOk(camera.capabilities.includes('MANUAL_SENSOR'), 'manual sensor capability parsed');
assertOk(camera.depthMetadataKeys.includes('android.depth.maxDepthSamples'), 'depth sample metadata parsed');
const samsungActivity = parseResolveActivity(`ActivityInfo:
  name=com.sec.android.app.camera.Camera
  packageName=com.sec.android.app.camera
  sharedLibraryFiles=[/system/framework/secimaging.jar]
`);
assertEq(samsungActivity, 'com.sec.android.app.camera/.Camera', 'verbose Samsung activity parsed');

console.log('Test 3: pass receipt is hardware readiness, not depth-frame capture');
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
assertEq(receipt.schemaVersion, RECEIPT_VERSION, 'schema version');
assertEq(receipt.status, 'pass', 'readiness status pass');
assertEq(receipt.hardwareReady, true, 'hardware readiness true');
assertEq(receipt.runtimeDepthCapture.status, 'blocked', 'runtime depth capture stays blocked');
assertEq(validateReceipt(receipt).length, 0, 'pass receipt validates');
assertOk(receipt.chain.receipt.hash.startsWith('sha256:'), 'chain hash present');

console.log('Test 4: negative controls block or fail readiness');
const missingDepth = buildAndroidArCoreDepthProbeReceipt({
  ...receipt,
  adbAvailable: true,
  selectedSerial: 'R5CW20QRNMK',
  adbDevicesText,
  arCorePackageListText: packageListText,
  arCorePackageDumpText: packageDumpText,
  featureListText,
  cameraDumpText: 'Camera ID: 0\n  Facing: Back\n  Available capabilities: RAW MANUAL_SENSOR\n',
  localToolchain: receipt.localToolchain,
});
assertEq(missingDepth.status, 'blocked', 'missing depth metadata blocks');
assertOk(missingDepth.blockers.includes('camera2-depth-metadata-not-observed'), 'missing depth blocker recorded');

const missingArCore = buildAndroidArCoreDepthProbeReceipt({
  ...receipt,
  adbAvailable: true,
  selectedSerial: 'R5CW20QRNMK',
  adbDevicesText,
  arCorePackageListText: '',
  arCorePackageDumpText: '',
  featureListText,
  cameraDumpText,
  localToolchain: receipt.localToolchain,
});
assertEq(missingArCore.status, 'fail', 'missing ARCore fails');
assertOk(missingArCore.failures.includes('arcore-package-missing'), 'missing ARCore failure recorded');

console.log('Test 5: overclaiming acquired depth frames is rejected');
const overclaim = {
  ...receipt,
  runtimeDepthCapture: {
    ...receipt.runtimeDepthCapture,
    status: 'pass',
  },
};
assertOk(
  validateReceipt(overclaim).includes('readiness probe must not claim ARCore depth frames were acquired'),
  'depth-frame overclaim rejected'
);

console.log('Test 6: CLI self-test runs without hardware');
const selfTestReceipt = selfTest();
assertEq(selfTestReceipt.status, 'pass', 'exported self-test status pass');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI self-test names pass');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
