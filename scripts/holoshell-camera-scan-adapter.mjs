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

export const VERSION = '0.4.0';
export const RECEIPT_VERSION = 'holoshell-camera-scan-receipt/v4';
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_WIDTH = 96;
const DEFAULT_HEIGHT = 72;
const DEFAULT_FRAMES = 1;
const DEFAULT_INTERVAL_MS = 250;
const DEFAULT_SESSION_FPS = 5;
const DEFAULT_TILE_GRID = 8;
const MAX_TILE_GRID = 16;
const MAX_FRAMES = 120;

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
    frames: DEFAULT_FRAMES,
    intervalMs: DEFAULT_INTERVAL_MS,
    durationSec: undefined,
    fps: undefined,
    tileGrid: DEFAULT_TILE_GRID,
    keepFrame: false,
    requireCapture: false,
    selfTest: false,
  };
  let framesProvided = false;
  let intervalProvided = false;

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
    else if (arg === '--frames') {
      args.frames = Number.parseInt(argv[++i], 10);
      framesProvided = true;
    }
    else if (arg === '--interval-ms') {
      args.intervalMs = Number.parseInt(argv[++i], 10);
      intervalProvided = true;
    }
    else if (arg === '--duration-sec') args.durationSec = Number.parseFloat(argv[++i]);
    else if (arg === '--fps') args.fps = Number.parseFloat(argv[++i]);
    else if (arg === '--tile-grid') args.tileGrid = Number.parseInt(argv[++i], 10);
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
  if (args.fps !== undefined && (!Number.isFinite(args.fps) || args.fps < 0.2 || args.fps > DEFAULT_SESSION_FPS)) {
    throw new Error(`--fps must be a number from 0.2 to ${DEFAULT_SESSION_FPS}`);
  }
  if (args.durationSec !== undefined && (!Number.isFinite(args.durationSec) || args.durationSec <= 0 || args.durationSec > 60)) {
    throw new Error('--duration-sec must be a number greater than 0 and at most 60');
  }
  if (!Number.isInteger(args.tileGrid) || args.tileGrid < 1 || args.tileGrid > MAX_TILE_GRID) {
    throw new Error(`--tile-grid must be an integer from 1 to ${MAX_TILE_GRID}`);
  }
  if (args.durationSec !== undefined) {
    const fps = args.fps ?? DEFAULT_SESSION_FPS;
    if (!intervalProvided) args.intervalMs = Math.round(1000 / fps);
    if (!framesProvided) args.frames = Math.max(1, Math.ceil(args.durationSec * fps));
  } else if (args.fps !== undefined && !intervalProvided) {
    args.intervalMs = Math.round(1000 / args.fps);
  }
  if (!Number.isInteger(args.frames) || args.frames < 1 || args.frames > MAX_FRAMES) {
    throw new Error(`--frames must be an integer from 1 to ${MAX_FRAMES}`);
  }
  if (!Number.isInteger(args.intervalMs) || args.intervalMs < 0 || args.intervalMs > 10000) {
    throw new Error('--interval-ms must be an integer from 0 to 10000');
  }
  if (args.frames > 1 && args.intervalMs === 0) {
    throw new Error('--interval-ms must be greater than 0 when capturing multiple frames');
  }
  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Camera Scan Adapter ${VERSION}

Usage:
  node scripts/holoshell-camera-scan-adapter.mjs list
  node scripts/holoshell-camera-scan-adapter.mjs capture [--frames 5] [--interval-ms 250] [--tile-grid 8] [--require-capture] [--out receipt.json]
  node scripts/holoshell-camera-scan-adapter.mjs capture --duration-sec 3 --fps 5 [--tile-grid 8] [--require-capture]
  node scripts/holoshell-camera-scan-adapter.mjs --self-test

Notes:
  - Uses Windows WinRT MediaCapture directly when running on Windows.
  - Does not use browser getUserMedia or fake-camera browser flags.
  - Emits HoloMap point-cloud assets and a HoloGram bridge artifact on pass.
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

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function capturePlan(args) {
  const fps = args.intervalMs > 0 ? 1000 / args.intervalMs : undefined;
  return {
    requestedFrameCount: args.frames,
    intervalMs: args.intervalMs,
    requestedDurationSec: args.durationSec,
    requestedFps: args.fps,
    tileGrid: args.tileGrid,
    effectiveFps: fps ? round(fps, 3) : undefined,
    expectedDurationMs: args.frames > 1 ? (args.frames - 1) * args.intervalMs : 0,
  };
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

function winrtScript({ mode, outputDir, framePrefix, frameCount, intervalMs, deviceIndex }) {
  const outputDirLiteral = psSingleQuoted(resolve(outputDir));
  const framePrefixLiteral = psSingleQuoted(framePrefix);
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
  $outDir = ${outputDirLiteral}
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $folder = AwaitGeneric ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($outDir)) ([Windows.Storage.StorageFolder])

  $settings = New-Object Windows.Media.Capture.MediaCaptureInitializationSettings
  $settings.VideoDeviceId = $device.id
  $settings.StreamingCaptureMode = [Windows.Media.Capture.StreamingCaptureMode]::Video
  $capture = New-Object Windows.Media.Capture.MediaCapture
  try {
    AwaitAction ($capture.InitializeAsync($settings))
    $props = [Windows.Media.MediaProperties.ImageEncodingProperties]::CreateJpeg()
    $frames = @()
    for ($i = 0; $i -lt ${frameCount}; $i++) {
      $leaf = ('{0}-{1:d3}.jpg' -f ${framePrefixLiteral}, $i)
      $outPath = Join-Path $outDir $leaf
      $file = AwaitGeneric ($folder.CreateFileAsync($leaf, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
      $capturedAtIso = [DateTimeOffset]::UtcNow.ToString('o')
      AwaitAction ($capture.CapturePhotoToStorageFileAsync($props, $file))
      $length = (Get-Item -LiteralPath $outPath).Length
      $frames += [pscustomobject]@{
        index = $i
        path = $outPath
        bytes = $length
        capturedAtIso = $capturedAtIso
      }
      if ($i -lt (${frameCount} - 1) -and ${intervalMs} -gt 0) {
        Start-Sleep -Milliseconds ${intervalMs}
      }
    }
    [pscustomobject]@{
      status = 'pass'
      provider = 'windows-winrt-mediacapture'
      device = $device
      frameCount = $frames.Count
      frames = $frames
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

function captureViaWindowsWinRt(args, frameDir) {
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
    outputDir: frameDir,
    framePrefix: `frame-${process.pid}`,
    frameCount: args.frames,
    intervalMs: args.intervalMs,
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

function analyzeFrameQuality(frame) {
  const pixels = frame.width * frame.height;
  if (pixels <= 0) {
    return {
      status: 'warn',
      score: 0,
      warnings: ['empty-frame'],
    };
  }

  const lum = new Float32Array(pixels);
  let sum = 0;
  let sumSq = 0;
  let dark = 0;
  let bright = 0;
  for (let i = 0; i < pixels; i += 1) {
    const p = i * frame.stride;
    const y = 0.2126 * (frame.rgb[p] ?? 0) + 0.7152 * (frame.rgb[p + 1] ?? 0) + 0.0722 * (frame.rgb[p + 2] ?? 0);
    lum[i] = y;
    sum += y;
    sumSq += y * y;
    if (y < 20) dark += 1;
    if (y > 235) bright += 1;
  }

  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const idx = y * frame.width + x;
      if (x + 1 < frame.width) {
        edgeSum += Math.abs((lum[idx] ?? 0) - (lum[idx + 1] ?? 0));
        edgeCount += 1;
      }
      if (y + 1 < frame.height) {
        edgeSum += Math.abs((lum[idx] ?? 0) - (lum[idx + frame.width] ?? 0));
        edgeCount += 1;
      }
    }
  }

  const mean = sum / pixels;
  const variance = Math.max(0, sumSq / pixels - mean * mean);
  const brightness = mean / 255;
  const contrast = Math.sqrt(variance) / 255;
  const edgeEnergy = edgeCount > 0 ? edgeSum / edgeCount / 255 : 0;
  const brightnessScore = Math.max(0, 1 - Math.abs(brightness - 0.45) / 0.45);
  const contrastScore = Math.min(1, contrast / 0.18);
  const edgeScore = Math.min(1, edgeEnergy / 0.08);
  const score = 0.4 * brightnessScore + 0.35 * contrastScore + 0.25 * edgeScore;
  const warnings = [];
  if (brightness < 0.08) warnings.push('underexposed');
  if (brightness > 0.92) warnings.push('overexposed');
  if (contrast < 0.025) warnings.push('low-contrast');
  if (edgeEnergy < 0.008) warnings.push('low-detail-or-blur');

  return {
    status: warnings.length > 0 ? 'warn' : 'pass',
    score: round(score, 4),
    brightness: round(brightness, 4),
    contrast: round(contrast, 4),
    edgeEnergy: round(edgeEnergy, 4),
    darkPixelRatio: round(dark / pixels, 4),
    brightPixelRatio: round(bright / pixels, 4),
    warnings,
  };
}

function average(values) {
  if (values.length < 1) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeQuality(frames) {
  const qualities = frames.map((frame) => frame.quality).filter(Boolean);
  const warnings = [...new Set(qualities.flatMap((quality) => quality.warnings ?? []))];
  return {
    status: warnings.length > 0 ? 'warn' : 'pass',
    averageScore: round(average(qualities.map((quality) => quality.score ?? 0)), 4),
    averageBrightness: round(average(qualities.map((quality) => quality.brightness ?? 0)), 4),
    averageContrast: round(average(qualities.map((quality) => quality.contrast ?? 0)), 4),
    averageEdgeEnergy: round(average(qualities.map((quality) => quality.edgeEnergy ?? 0)), 4),
    warnings,
  };
}

async function runHoloMap(frames, videoHash, intervalMs, tileGrid) {
  const runtime = createHoloMapRuntime();
  const firstFrame = frames[0];
  if (!firstFrame) throw new Error('runHoloMap requires at least one frame');
  const steps = [];
  const pointCloud = {
    positions: [],
    colors: [],
    confidence: [],
  };
  try {
    await runtime.init({
      inputResolution: { width: firstFrame.width, height: firstFrame.height },
      targetFPS: 5,
      maxSequenceLength: Math.max(30, frames.length),
      seed: 0,
      modelHash: 'holoshell-native-camera-scan-v2',
      videoHash,
      tileGrid,
      cpuOffload: false,
      weightStrategy: 'distill',
      verticalProfile: 'indoor',
      allowCpuFallback: true,
    });
    for (const frame of frames) {
      const timestampMs = frame.index * intervalMs;
      const step = await runtime.step({
        index: frame.index,
        timestampMs,
        rgb: frame.rgb,
        width: frame.width,
        height: frame.height,
        stride: frame.stride,
      });
      if (!step) {
        steps.push({
          frameIndex: frame.index,
          timestampMs,
          accepted: false,
          reason: 'target-fps-throttle',
        });
        continue;
      }

      for (const value of step.points.positions) pointCloud.positions.push(value);
      for (const value of step.points.colors) pointCloud.colors.push(value);
      for (const value of step.points.confidence) pointCloud.confidence.push(value);
      steps.push({
        frameIndex: frame.index,
        timestampMs,
        accepted: true,
        pointCount: step.points.positions.length / 3,
        anchorRevision: step.anchor.revision,
        poseConfidence: step.pose.confidence,
        posePosition: step.pose.position,
      });
    }
    const manifest = await runtime.finalize();
    return {
      manifest,
      steps,
      pointCloud,
      tileGrid,
    };
  } finally {
    await runtime.dispose().catch(() => undefined);
  }
}

function writePly(path, pointCloud) {
  const pointCount = Math.floor(pointCloud.positions.length / 3);
  const lines = [
    'ply',
    'format ascii 1.0',
    'comment generated by holoshell-camera-scan-adapter',
    `element vertex ${pointCount}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'property float confidence',
    'end_header',
  ];
  for (let i = 0; i < pointCount; i += 1) {
    const p = i * 3;
    const x = Number(pointCloud.positions[p] ?? 0).toFixed(7);
    const y = Number(pointCloud.positions[p + 1] ?? 0).toFixed(7);
    const z = Number(pointCloud.positions[p + 2] ?? 0).toFixed(7);
    const r = Math.max(0, Math.min(255, Math.round(pointCloud.colors[p] ?? 0)));
    const g = Math.max(0, Math.min(255, Math.round(pointCloud.colors[p + 1] ?? 0)));
    const b = Math.max(0, Math.min(255, Math.round(pointCloud.colors[p + 2] ?? 0)));
    const c = Number(pointCloud.confidence[i] ?? 0).toFixed(6);
    lines.push(`${x} ${y} ${z} ${r} ${g} ${b} ${c}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function buildHoloSource({ manifest, assets }) {
  return `composition "HoloShell Native Camera HoloMap Scan" {
  object "ScanData" {
    @point_cloud {
      count: ${manifest.pointCount}
      size: 0.02
      color_mode: "rgb"
      source: "${assets.ply}"
    }

    @hologram {
      source_type: "point_cloud"
      targets: ["quilt", "parallax", "mvhevc"]
      bridge: "${assets.hologramBridge}"
      replay_fingerprint: "${manifest.simulationContract.replayFingerprint}"
    }

    position: [0, 0, 0]
  }
}
`;
}

function buildHologramBridge({ manifest, assets, pointCloudHash, tileGrid }) {
  return {
    schemaVersion: 'hologram-bridge/holomap-pointcloud/v1',
    status: 'geometry-ready',
    source: {
      kind: 'holomap-pointcloud',
      replayFingerprint: manifest.simulationContract.replayFingerprint,
      pointCloudHash,
      pointCount: manifest.pointCount,
      frameCount: manifest.frameCount,
      tileGrid,
      bounds: manifest.bounds,
      assets,
    },
    targets: {
      quilt: {
        status: 'ready-for-render',
        views: 48,
        columns: 8,
        rows: 6,
        sourceAsset: 'ply',
      },
      parallax: {
        status: 'ready-for-encoder',
        sourceAsset: 'ply',
        sourceFrames: manifest.frameCount,
      },
      mvhevc: {
        status: 'metadata-ready',
        stereoPairs: 24,
        sourceAsset: 'ply',
      },
    },
    honestScope:
      'Native camera frames were reconstructed and exported as HoloMap geometry. Quilt, parallax WebM, and MV-HEVC pixel encoding are the next render step.',
    nextCommand: `pnpm holoshell:hologram-bridge-render -- --bridge ${assets.hologramBridge}`,
  };
}

function writeScanArtifacts({ outPath, holoMap }) {
  const outDir = dirname(outPath);
  const replay = holoMap.manifest.simulationContract.replayFingerprint.slice(0, 12);
  const base = `holoshell-scan-${replay}`;
  const plyPath = resolve(outDir, `${base}.ply`);
  const manifestPath = resolve(outDir, `${base}.manifest.json`);
  const holoPath = resolve(outDir, `${base}.holo`);
  const bridgePath = resolve(outDir, `${base}.hologram-bridge.json`);

  writePly(plyPath, holoMap.pointCloud);
  const pointCloudHash = `sha256:${sha256Bytes(readFileSync(plyPath))}`;

  const assets = {
    ply: rel(plyPath),
    manifest: rel(manifestPath),
    holo: rel(holoPath),
    hologramBridge: rel(bridgePath),
  };
  holoMap.manifest.assets = {
    ...holoMap.manifest.assets,
    points: assets.ply,
    holoshellManifest: assets.manifest,
    holo: assets.holo,
    hologramBridge: assets.hologramBridge,
  };
  writeJson(manifestPath, holoMap.manifest);
  const bridge = buildHologramBridge({ manifest: holoMap.manifest, assets, pointCloudHash, tileGrid: holoMap.tileGrid });
  writeJson(bridgePath, bridge);
  writeFileSync(holoPath, buildHoloSource({ manifest: holoMap.manifest, assets }), 'utf8');

  return { assets, bridge, pointCloudHash };
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
  const frameDir = join(tmpdir(), `holoshell-camera-scan-${process.pid}-${Date.now()}`);
  const plan = capturePlan(args);

  const capture = captureViaWindowsWinRt(args, frameDir);
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
    rmSync(frameDir, { recursive: true, force: true });
    return blockedReceipt(args, at, capture, outPath);
  }

  const capturedFrames = Array.isArray(capture.frames)
    ? capture.frames
    : capture.framePath
      ? [{ index: 0, path: capture.framePath, bytes: capture.frameBytes }]
      : [];
  if (capturedFrames.length < 1) {
    rmSync(frameDir, { recursive: true, force: true });
    return blockedReceipt(
      args,
      at,
      {
        ...capture,
        status: 'blocked',
        blockedReason: 'camera-frame-empty',
        error: 'WinRT capture returned no image frames.',
      },
      outPath
    );
  }

  const frames = [];
  const receiptFrames = [];
  for (let i = 0; i < capturedFrames.length; i += 1) {
    const captured = capturedFrames[i];
    const sourcePath = resolve(captured.path);
    if (!existsSync(sourcePath) || statSync(sourcePath).size <= 0) {
      rmSync(frameDir, { recursive: true, force: true });
      return blockedReceipt(
        args,
        at,
        {
          ...capture,
          status: 'blocked',
          blockedReason: 'camera-frame-empty',
          error: `WinRT capture returned no image bytes for frame ${i}.`,
        },
        outPath
      );
    }
    const jpeg = readFileSync(sourcePath);
    const jpegHash = sha256Bytes(jpeg);
    const decoded = await decodeImageToRgb(sourcePath, args.width, args.height);
    const frameHash = sha256Bytes(decoded.rgb);
    const quality = analyzeFrameQuality(decoded);
    const keptFramePath = args.keepFrame
      ? rel(resolve(dirname(outPath), `camera-frame-${i.toString().padStart(3, '0')}-${jpegHash.slice(0, 12)}.jpg`))
      : undefined;
    const frameIndex = Number.isInteger(captured.index) ? captured.index : i;
    frames.push({
      index: frameIndex,
      timestampMs: frameIndex * args.intervalMs,
      rgb: decoded.rgb,
      width: decoded.width,
      height: decoded.height,
      stride: decoded.stride,
    });
    receiptFrames.push({
      index: frameIndex,
      source: 'windows-winrt-mediacapture',
      capturedAt: captured.capturedAtIso,
      jpegBytes: jpeg.byteLength,
      jpegHash: `sha256:${jpegHash}`,
      rgbWidth: decoded.width,
      rgbHeight: decoded.height,
      rgbStride: decoded.stride,
      rgbHash: `sha256:${frameHash}`,
      quality,
      keptFramePath,
    });
  }

  const videoHash = `holoshell-native-camera:${sha256Text(
    receiptFrames.map((frame) => `${frame.index}:${frame.jpegHash}:${frame.rgbHash}`).join('|')
  )}`;
  const holoMap = await runHoloMap(frames, videoHash, args.intervalMs, args.tileGrid);
  const artifacts = writeScanArtifacts({ outPath, holoMap });
  const firstCapturedMs = Date.parse(receiptFrames[0]?.capturedAt ?? '');
  const lastCapturedMs = Date.parse(receiptFrames[receiptFrames.length - 1]?.capturedAt ?? '');
  const actualCapturedDurationMs =
    Number.isFinite(firstCapturedMs) && Number.isFinite(lastCapturedMs)
      ? Math.max(0, lastCapturedMs - firstCapturedMs)
      : undefined;

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
    capture: {
      ...plan,
      capturedFrameCount: receiptFrames.length,
      acceptedFrameCount: holoMap.manifest.frameCount,
      droppedFrameCount: Math.max(0, plan.requestedFrameCount - receiptFrames.length),
      actualCapturedDurationMs,
      videoHash,
    },
    frame: receiptFrames[0],
    frames: receiptFrames,
    scanQuality: summarizeQuality(receiptFrames),
    holomap: {
      displayName: holoMap.manifest.displayName,
      tileGrid: args.tileGrid,
      frameCount: holoMap.manifest.frameCount,
      pointCount: holoMap.manifest.pointCount,
      replayFingerprint: holoMap.manifest.simulationContract.replayFingerprint,
      steps: holoMap.steps,
      assets: artifacts.assets,
      pointCloudHash: artifacts.pointCloudHash,
      manifest: holoMap.manifest,
    },
    hologramBridge: {
      status: artifacts.bridge.status,
      artifactPath: artifacts.assets.hologramBridge,
      sourceKind: artifacts.bridge.source.kind,
      targets: artifacts.bridge.targets,
      honestScope: artifacts.bridge.honestScope,
      nextCommand: artifacts.bridge.nextCommand,
    },
    outputPath: rel(outPath),
  });

  if (args.keepFrame) {
    mkdirSync(dirname(outPath), { recursive: true });
    for (const frame of receiptFrames) {
      if (!frame.keptFramePath) continue;
      const captured = capturedFrames.find((candidate) => candidate.index === frame.index) ?? capturedFrames[frame.index];
      if (captured?.path) copyFileSync(resolve(captured.path), resolve(REPO_ROOT, frame.keptFramePath));
    }
  }
  rmSync(frameDir, { recursive: true, force: true });
  return receipt;
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt must be an object');
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (!['pass', 'blocked'].includes(receipt.status)) errors.push('status must be pass or blocked');
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  if (receipt.status === 'pass' && receipt.action !== 'direct-native-camera-inventory') {
    if (!receipt.frame?.rgbHash?.startsWith('sha256:')) errors.push('pass receipt missing first frame rgb hash');
    if (!Array.isArray(receipt.frames) || receipt.frames.length < 1) errors.push('pass receipt missing frames');
    if (Array.isArray(receipt.frames) && receipt.frames.some((frame) => !frame.rgbHash?.startsWith('sha256:'))) {
      errors.push('pass receipt has frame without rgb hash');
    }
    if (!receipt.scanQuality?.status) errors.push('pass receipt missing scan quality summary');
    if (!receipt.holomap?.replayFingerprint) errors.push('pass receipt missing HoloMap replay fingerprint');
    if (!(receipt.holomap?.pointCount > 0)) errors.push('pass receipt missing point count');
    if (!receipt.holomap?.assets?.ply) errors.push('pass receipt missing HoloMap PLY asset');
    if (receipt.hologramBridge?.status !== 'geometry-ready') errors.push('pass receipt missing HoloGram bridge');
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
