#!/usr/bin/env node
/**
 * HoloShell Camera Scan Adapter
 *
 * Direct local-camera proof path for HoloMap. It uses OS-native camera access
 * instead of browser getUserMedia:
 *   Windows: WinRT MediaCapture via PowerShell, then raw RGB -> HoloMapRuntime.
 *
 * A blocked receipt is intentional evidence when the shell can enumerate a
 * camera but the OS denies capture permission.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createHoloMapRuntime,
} from '../packages/core/dist/reconstruction/index.js';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'holoshell-camera-scan-receipt/v1';
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_WIDTH = 96;
const DEFAULT_HEIGHT = 72;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    command: 'capture',
    out: undefined,
    date: DEFAULT_DATE,
    now: undefined,
    deviceIndex: 0,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    keepFrame: false,
    requireCapture: false,
    selfTest: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === 'capture' || arg === 'probe' || arg === 'list' || arg === 'self-test') args.command = arg;
    else if (arg === '--self-test') args.command = 'self-test';
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--date') args.date = argv[++i];
    else if (arg === '--now') args.now = argv[++i];
    else if (arg === '--device-index') args.deviceIndex = Number.parseInt(argv[++i], 10);
    else if (arg === '--width') args.width = Number.parseInt(argv[++i], 10);
    else if (arg === '--height') args.height = Number.parseInt(argv[++i], 10);
    else if (arg === '--keep-frame') args.keepFrame = true;
    else if (arg === '--require-capture') args.requireCapture = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') args.command = 'help';
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.deviceIndex) || args.deviceIndex < 0) {
    throw new Error('--device-index must be a non-negative integer');
  }
  if (!Number.isInteger(args.width) || args.width < 2 || args.width > 640) {
    throw new Error('--width must be an integer from 2 to 640');
  }
  if (!Number.isInteger(args.height) || args.height < 2 || args.height > 480) {
    throw new Error('--height must be an integer from 2 to 480');
  }
  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Camera Scan Adapter ${VERSION}

Usage:
  node scripts/holoshell-camera-scan-adapter.mjs list
  node scripts/holoshell-camera-scan-adapter.mjs capture [--require-capture] [--out receipt.json]
  node scripts/holoshell-camera-scan-adapter.mjs --self-test

Notes:
  - Uses Windows WinRT MediaCapture directly when running on Windows.
  - Does not use browser getUserMedia or fake-camera browser flags.
  - Emits a blocked receipt when OS camera permission denies the shell host.
`);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function hashValue(value) {
  return `sha256:${sha256Text(typeof value === 'string' ? value : JSON.stringify(canonical(value)))}`;
}

function withHash(receipt) {
  const base = { ...receipt, hashAlgorithm: 'sha256' };
  return { ...base, hash: hashValue(base) };
}

function nowIso(args) {
  const value = args.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid ISO timestamp: ${value}`);
  return value;
}

function defaultOutput(date) {
  return join('.bench-logs', 'holoshell-camera-scan', date, 'camera-scan-receipt.json');
}

function writeJson(path, value) {
  const absolute = resolve(REPO_ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolute;
}

function rel(path) {
  return relative(REPO_ROOT, resolve(path)).replaceAll('\\', '/');
}

function redactDevice(device) {
  return {
    name: device.name ?? 'unknown camera',
    idHash: device.id ? `sha256:${sha256Text(device.id)}` : undefined,
    isEnabled: device.isEnabled,
    kind: device.kind,
  };
}

function powershellJson(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8,
    }
  );
  const text = result.stdout.trim();
  if (!text) {
    return {
      status: 'failed',
      error: result.stderr.trim() || `PowerShell exited ${result.status}`,
      exitCode: result.status,
    };
  }
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  const jsonText = jsonStart >= 0 && jsonEnd > jsonStart ? text.slice(jsonStart, jsonEnd + 1) : text;
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    return {
      status: 'failed',
      error: `PowerShell returned non-JSON: ${error.message}`,
      stdout: text.slice(0, 1000),
      stderr: result.stderr.trim().slice(0, 1000),
      exitCode: result.status,
    };
  }
}

function psSingleQuoted(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function winrtScript({ mode, outputPath, deviceIndex }) {
  const outputPathLiteral = psSingleQuoted(resolve(outputPath));
  const modeLiteral = psSingleQuoted(mode);
  return `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [Windows.Devices.Enumeration.DeviceClass,Windows.Devices.Enumeration,ContentType=WindowsRuntime] > $null
  [Windows.Devices.Enumeration.DeviceInformation,Windows.Devices.Enumeration,ContentType=WindowsRuntime] > $null
  [Windows.Devices.Enumeration.DeviceInformationCollection,Windows.Devices.Enumeration,ContentType=WindowsRuntime] > $null
  [Windows.Media.Capture.MediaCapture,Windows.Media.Capture,ContentType=WindowsRuntime] > $null
  [Windows.Media.Capture.MediaCaptureInitializationSettings,Windows.Media.Capture,ContentType=WindowsRuntime] > $null
  [Windows.Media.Capture.StreamingCaptureMode,Windows.Media.Capture,ContentType=WindowsRuntime] > $null
  [Windows.Media.MediaProperties.ImageEncodingProperties,Windows.Media.MediaProperties,ContentType=WindowsRuntime] > $null
  [Windows.Storage.StorageFolder,Windows.Storage,ContentType=WindowsRuntime] > $null
  [Windows.Storage.CreationCollisionOption,Windows.Storage,ContentType=WindowsRuntime] > $null

  function AwaitGeneric($op, [Type]$type) {
    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
      Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 } |
      Select-Object -First 1
    $task = $method.MakeGenericMethod($type).Invoke($null, @($op))
    return $task.GetAwaiter().GetResult()
  }

  function AwaitAction($op) {
    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
      Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 } |
      Select-Object -First 1
    $task = $method.Invoke($null, @($op))
    return $task.GetAwaiter().GetResult()
  }

  $rawDevices = AwaitGeneric ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync([Windows.Devices.Enumeration.DeviceClass]::VideoCapture)) ([Windows.Devices.Enumeration.DeviceInformationCollection])
  $devices = @()
  foreach ($d in $rawDevices) {
    $devices += [pscustomobject]@{
      name = $d.Name
      id = $d.Id
      isEnabled = $d.IsEnabled
      kind = $d.Kind.ToString()
    }
  }

  if (${modeLiteral} -eq 'list') {
    [pscustomobject]@{ status = 'pass'; provider = 'windows-winrt-mediacapture'; devices = $devices } | ConvertTo-Json -Depth 8
    exit 0
  }
  if ($devices.Count -lt 1) {
    [pscustomobject]@{ status = 'blocked'; provider = 'windows-winrt-mediacapture'; blockedReason = 'no-camera-device'; devices = $devices } | ConvertTo-Json -Depth 8
    exit 0
  }
  if (${deviceIndex} -ge $devices.Count) {
    [pscustomobject]@{ status = 'blocked'; provider = 'windows-winrt-mediacapture'; blockedReason = 'camera-index-out-of-range'; requestedIndex = ${deviceIndex}; devices = $devices } | ConvertTo-Json -Depth 8
    exit 0
  }

  $device = $devices[${deviceIndex}]
  $outPath = ${outputPathLiteral}
  $outDir = Split-Path -Parent $outPath
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $folder = AwaitGeneric ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($outDir)) ([Windows.Storage.StorageFolder])
  $file = AwaitGeneric ($folder.CreateFileAsync((Split-Path -Leaf $outPath), [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])

  $settings = New-Object Windows.Media.Capture.MediaCaptureInitializationSettings
  $settings.VideoDeviceId = $device.id
  $settings.StreamingCaptureMode = [Windows.Media.Capture.StreamingCaptureMode]::Video
  $capture = New-Object Windows.Media.Capture.MediaCapture
  try {
    AwaitAction ($capture.InitializeAsync($settings))
    $props = [Windows.Media.MediaProperties.ImageEncodingProperties]::CreateJpeg()
    AwaitAction ($capture.CapturePhotoToStorageFileAsync($props, $file))
    $length = (Get-Item -LiteralPath $outPath).Length
    [pscustomobject]@{
      status = 'pass'
      provider = 'windows-winrt-mediacapture'
      device = $device
      framePath = $outPath
      frameBytes = $length
    } | ConvertTo-Json -Depth 8
  } catch {
    [pscustomobject]@{
      status = 'blocked'
      provider = 'windows-winrt-mediacapture'
      blockedReason = if ($_.Exception.HResult -eq -2147024891 -or $_.Exception.Message -match 'Access is denied') { 'windows-camera-permission-denied' } else { 'camera-capture-failed' }
      hresult = ('0x{0:x8}' -f ($_.Exception.HResult -band 0xffffffff))
      error = $_.Exception.Message
      device = $device
      devices = $devices
    } | ConvertTo-Json -Depth 8
  } finally {
    if ($capture -and $capture.Dispose) { $capture.Dispose() }
  }
} catch {
  [pscustomobject]@{
    status = 'failed'
    provider = 'windows-winrt-mediacapture'
    error = $_.Exception.Message
    hresult = ('0x{0:x8}' -f ($_.Exception.HResult -band 0xffffffff))
  } | ConvertTo-Json -Depth 8
}
`;
}

function captureViaWindowsWinRt(args, framePath) {
  if (process.platform !== 'win32') {
    return {
      status: 'blocked',
      provider: 'windows-winrt-mediacapture',
      blockedReason: 'unsupported-platform',
      error: `WinRT capture is only available on Windows; current platform=${process.platform}`,
    };
  }
  return powershellJson(winrtScript({
    mode: args.command === 'list' ? 'list' : 'capture',
    outputPath: framePath,
    deviceIndex: args.deviceIndex,
  }));
}

async function decodeImageToRgb(imagePath, width, height) {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(imagePath)
    .rotate()
    .resize(width, height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    rgb: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
    stride: 3,
  };
}

async function runHoloMap(frame, videoHash) {
  const runtime = createHoloMapRuntime();
  try {
    await runtime.init({
      inputResolution: { width: frame.width, height: frame.height },
      targetFPS: 5,
      maxSequenceLength: 30,
      seed: 0,
      modelHash: 'holoshell-native-camera-scan-v1',
      videoHash,
      cpuOffload: false,
      weightStrategy: 'distill',
      verticalProfile: 'indoor',
      allowCpuFallback: true,
    });
    const step = await runtime.step({
      index: 0,
      timestampMs: 0,
      rgb: frame.rgb,
      width: frame.width,
      height: frame.height,
      stride: frame.stride,
    });
    const manifest = await runtime.finalize();
    return {
      manifest,
      step: step
        ? {
            pointCount: step.points.positions.length / 3,
            anchorRevision: step.anchor.revision,
            poseConfidence: step.pose.confidence,
          }
        : undefined,
    };
  } finally {
    await runtime.dispose().catch(() => undefined);
  }
}

function blockedReceipt(args, at, capture, outputPath) {
  const devices = Array.isArray(capture.devices)
    ? capture.devices
    : capture.device
      ? [capture.device]
      : [];
  return withHash({
    id: `holoshell-camera-scan-${sha256Text(`${at}:${capture.blockedReason ?? capture.error ?? 'blocked'}`).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    adapterVersion: VERSION,
    status: 'blocked',
    capturedAt: at,
    provider: capture.provider ?? 'unknown',
    blockedReason: capture.blockedReason ?? 'camera-capture-blocked',
    error: capture.error,
    hresult: capture.hresult,
    devices: devices.map(redactDevice),
    selectedDeviceIndex: args.deviceIndex,
    action: 'direct-native-camera-holomap-scan',
    permissionGate: {
      subjectKind: 'device',
      scope: 'allowCamera',
      verificationMethod: 'device_permission_probe',
      nextAction:
        capture.blockedReason === 'windows-camera-permission-denied'
          ? 'Grant camera access to the shell host in Windows Settings > Privacy & security > Camera, then rerun pnpm holoshell:camera-scan -- --require-capture.'
          : 'Attach or enable a local hardware camera, then rerun the HoloShell camera scan adapter.',
    },
    outputPath: rel(outputPath),
  });
}

async function buildCaptureReceipt(args) {
  const at = nowIso(args);
  const outPath = resolve(REPO_ROOT, args.out ?? defaultOutput(args.date));
  const framePath = join(tmpdir(), `holoshell-camera-frame-${process.pid}-${Date.now()}.jpg`);

  const capture = captureViaWindowsWinRt(args, framePath);
  if (args.command === 'list') {
    return withHash({
      id: `holoshell-camera-inventory-${sha256Text(at).slice(0, 12)}`,
      schemaVersion: RECEIPT_VERSION,
      adapterVersion: VERSION,
      status: capture.status === 'pass' ? 'pass' : 'blocked',
      capturedAt: at,
      provider: capture.provider,
      devices: (capture.devices ?? []).map(redactDevice),
      deviceCount: Array.isArray(capture.devices) ? capture.devices.length : 0,
      action: 'direct-native-camera-inventory',
      outputPath: rel(outPath),
    });
  }

  if (capture.status !== 'pass') {
    return blockedReceipt(args, at, capture, outPath);
  }

  if (!existsSync(framePath) || statSync(framePath).size <= 0) {
    return blockedReceipt(
      args,
      at,
      {
        ...capture,
        status: 'blocked',
        blockedReason: 'camera-frame-empty',
        error: 'WinRT capture returned no image bytes.',
      },
      outPath
    );
  }

  const jpeg = readFileSync(framePath);
  const jpegHash = sha256Bytes(jpeg);
  const frame = await decodeImageToRgb(framePath, args.width, args.height);
  const frameHash = sha256Bytes(frame.rgb);
  const videoHash = `holoshell-native-camera:${sha256Text(`${jpegHash}:${frameHash}`)}`;
  const holoMap = await runHoloMap(frame, videoHash);

  const receipt = withHash({
    id: `holoshell-camera-scan-${holoMap.manifest.simulationContract.replayFingerprint.slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    adapterVersion: VERSION,
    status: 'pass',
    capturedAt: at,
    provider: capture.provider,
    selectedDeviceIndex: args.deviceIndex,
    device: redactDevice(capture.device ?? {}),
    action: 'direct-native-camera-holomap-scan',
    frame: {
      source: 'windows-winrt-mediacapture',
      jpegBytes: jpeg.byteLength,
      jpegHash: `sha256:${jpegHash}`,
      rgbWidth: frame.width,
      rgbHeight: frame.height,
      rgbStride: frame.stride,
      rgbHash: `sha256:${frameHash}`,
      keptFramePath: args.keepFrame ? rel(resolve(dirname(outPath), `camera-frame-${jpegHash.slice(0, 12)}.jpg`)) : undefined,
    },
    holomap: {
      displayName: holoMap.manifest.displayName,
      frameCount: holoMap.manifest.frameCount,
      pointCount: holoMap.manifest.pointCount,
      replayFingerprint: holoMap.manifest.simulationContract.replayFingerprint,
      step: holoMap.step,
      manifest: holoMap.manifest,
    },
    outputPath: rel(outPath),
  });

  if (args.keepFrame) {
    mkdirSync(dirname(outPath), { recursive: true });
    copyFileSync(framePath, resolve(dirname(outPath), `camera-frame-${jpegHash.slice(0, 12)}.jpg`));
  }
  rmSync(framePath, { force: true });
  return receipt;
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt must be an object');
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (!['pass', 'blocked'].includes(receipt.status)) errors.push('status must be pass or blocked');
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  if (receipt.status === 'pass' && receipt.action !== 'direct-native-camera-inventory') {
    if (!receipt.frame?.rgbHash?.startsWith('sha256:')) errors.push('pass receipt missing frame rgb hash');
    if (!receipt.holomap?.replayFingerprint) errors.push('pass receipt missing HoloMap replay fingerprint');
    if (!(receipt.holomap?.pointCount > 0)) errors.push('pass receipt missing point count');
  }
  if (receipt.status === 'blocked') {
    if (!receipt.blockedReason) errors.push('blocked receipt missing blockedReason');
    if (!receipt.permissionGate?.nextAction) errors.push('blocked receipt missing nextAction');
  }
  return errors;
}

export async function selfTest() {
  const blocked = blockedReceipt(
    { deviceIndex: 0 },
    '2026-05-24T00:00:00.000Z',
    {
      provider: 'windows-winrt-mediacapture',
      blockedReason: 'windows-camera-permission-denied',
      error: 'Access is denied.',
      devices: [{ name: 'Integrated Webcam', id: 'device-id', isEnabled: true, kind: 'DeviceInterface' }],
    },
    defaultOutput('2026-05-24')
  );
  const errors = validateReceipt(blocked);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return blocked;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help') {
    printHelp();
    return;
  }
  if (args.command === 'self-test') {
    const receipt = await selfTest();
    process.stdout.write(`holoshell-camera-scan-adapter self-test PASS ${receipt.hash}\n`);
    return;
  }

  const receipt = await buildCaptureReceipt(args);
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(`Invalid receipt: ${errors.join('; ')}`);
  const out = writeJson(args.out ?? defaultOutput(args.date), receipt);
  process.stdout.write(`${JSON.stringify({ receiptPath: rel(out), status: receipt.status, blockedReason: receipt.blockedReason, holomap: receipt.holomap }, null, 2)}\n`);
  if (args.requireCapture && receipt.status !== 'pass') {
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('holoshell-camera-scan-adapter.mjs')) {
  main().catch((error) => {
    process.stderr.write(`holoshell-camera-scan-adapter FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
