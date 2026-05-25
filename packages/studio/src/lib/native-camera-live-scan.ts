import crypto from 'crypto';
import {
  computeHoloMapReplayFingerprint,
  createHoloMapRuntime,
  type CameraPose,
  type HoloMapRuntime,
  type ReconstructionFrame,
  type ReconstructionManifest,
} from '@holoscript/core/reconstruction';
import type { ScanKind, ScanSession } from './reconstruction-scan-store';
import { scanSessionModelHash } from './scan-session-manifest';

export interface NativeCameraFramePayload {
  index?: unknown;
  timestampMs?: unknown;
  width?: unknown;
  height?: unknown;
  stride?: unknown;
  rgbBase64?: unknown;
  /**
   * Optional MEASURED per-pixel depth from a real device sensor (iOS LiDAR
   * `sceneDepth.depthMap`, ARCore depth). Little-endian Float32, row-major,
   * length width*height (so byte length = width*height*4), values 0=near..1=far.
   * When present the reconstructor uses it for point Z over the monocular estimate.
   */
  depthBase64?: unknown;
  /**
   * Optional MEASURED device pose (ARKit/ARCore tracking): 6-DoF camera pose.
   * When present it drives the trajectory instead of the scan-derived pose.
   */
  devicePose?: unknown;
}

export interface DecodedNativeCameraFrame {
  frame: ReconstructionFrame;
  byteLength: number;
  frameHash: string;
}

interface LiveRuntimeState {
  runtime: HoloMapRuntime;
  firstFrameHash: string;
}

const MAX_FRAME_DIMENSION = 160;
const MAX_FRAME_PIXELS = MAX_FRAME_DIMENSION * MAX_FRAME_DIMENSION;
const LIVE_TARGET_FPS = 8;
const LIVE_MAX_SEQUENCE = 720;

declare global {
  // eslint-disable-next-line no-var
  var __studioNativeCameraHoloMapRuntimes__: Map<string, LiveRuntimeState> | undefined;
}

const liveRuntimes: Map<string, LiveRuntimeState> =
  globalThis.__studioNativeCameraHoloMapRuntimes__ ??
  (globalThis.__studioNativeCameraHoloMapRuntimes__ = new Map());

function sha256Hex(parts: Array<string | Uint8Array>): string {
  const hash = crypto.createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

function requireInt(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function requireFinite(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a finite number from ${min} to ${max}`);
  }
  return value;
}

export function updateNativeCameraFrameDigest(previousDigest: string | undefined, frameHash: string): string {
  return sha256Hex([
    'holoscript-native-camera-sequence-v1',
    previousDigest ?? 'start',
    frameHash,
  ]);
}

export function nativeCameraVideoHash(token: string, frameDigest: string, frameCount: number): string {
  return `native-camera:${sha256Hex([
    'holoscript-native-camera-video-v1',
    token,
    frameDigest,
    String(frameCount),
  ])}`;
}

function decodeMeasuredDepth(
  raw: unknown,
  width: number,
  height: number
): { depth: Float32Array; bytes: Buffer } | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('nativeFrame.depthBase64 must be a non-empty base64 string when provided');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw new Error('nativeFrame.depthBase64 must be standard base64');
  }
  const bytes = Buffer.from(raw, 'base64');
  const expected = width * height * 4; // Float32 per pixel
  if (bytes.byteLength !== expected) {
    throw new Error(
      `nativeFrame.depthBase64 byte length mismatch: got ${bytes.byteLength}, expected ${expected} (width*height*4)`
    );
  }
  // Copy into an aligned ArrayBuffer so the Float32Array view is valid regardless
  // of Buffer pool offset alignment.
  const aligned = new ArrayBuffer(expected);
  new Uint8Array(aligned).set(bytes);
  return { depth: new Float32Array(aligned), bytes };
}

function decodeDevicePose(raw: unknown): CameraPose | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') throw new Error('nativeFrame.devicePose must be an object');
  const o = raw as Record<string, unknown>;
  const vec = (v: unknown, n: number, name: string): number[] => {
    if (!Array.isArray(v) || v.length !== n) throw new Error(`devicePose.${name} must be a ${n}-number array`);
    return v.map((x, i) => {
      if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`devicePose.${name}[${i}] must be finite`);
      return x;
    });
  };
  const position = vec(o.position, 3, 'position') as [number, number, number];
  const rotation = vec(o.rotation, 4, 'rotation') as [number, number, number, number];
  const confidence =
    typeof o.confidence === 'number' && Number.isFinite(o.confidence)
      ? Math.min(1, Math.max(0, o.confidence))
      : 1;
  return { position, rotation, confidence };
}

export function decodeNativeCameraFramePayload(payload: NativeCameraFramePayload): DecodedNativeCameraFrame {
  if (!payload || typeof payload !== 'object') {
    throw new Error('nativeFrame must be an object');
  }

  const index = requireInt(payload.index, 'nativeFrame.index', 0, 100_000);
  const timestampMs = requireFinite(payload.timestampMs ?? index * 650, 'nativeFrame.timestampMs', 0, 24 * 60 * 60_000);
  const width = requireInt(payload.width, 'nativeFrame.width', 2, MAX_FRAME_DIMENSION);
  const height = requireInt(payload.height, 'nativeFrame.height', 2, MAX_FRAME_DIMENSION);
  const strideRaw = payload.stride ?? 3;
  const stride = strideRaw === 4 ? 4 : strideRaw === 3 ? 3 : undefined;
  if (!stride) throw new Error('nativeFrame.stride must be 3 or 4');
  if (width * height > MAX_FRAME_PIXELS) {
    throw new Error(`nativeFrame is too large; max pixels is ${MAX_FRAME_PIXELS}`);
  }
  if (typeof payload.rgbBase64 !== 'string' || payload.rgbBase64.length === 0) {
    throw new Error('nativeFrame.rgbBase64 is required');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload.rgbBase64)) {
    throw new Error('nativeFrame.rgbBase64 must be standard base64');
  }

  const rgb = Buffer.from(payload.rgbBase64, 'base64');
  const expectedBytes = width * height * stride;
  if (rgb.byteLength !== expectedBytes) {
    throw new Error(
      `nativeFrame byte length mismatch: got ${rgb.byteLength}, expected ${expectedBytes}`
    );
  }

  const measuredDepth = decodeMeasuredDepth(payload.depthBase64, width, height);
  const devicePose = decodeDevicePose(payload.devicePose);

  const frame: ReconstructionFrame = {
    index,
    timestampMs,
    rgb: new Uint8Array(rgb.buffer, rgb.byteOffset, rgb.byteLength),
    width,
    height,
    stride,
    ...(measuredDepth ? { depth: measuredDepth.depth } : {}),
    ...(devicePose ? { devicePose } : {}),
  };
  // Provenance: fold measured depth + pose into the frame hash so a tampered
  // sensor reading changes the sequence digest / replay identity (same guarantee
  // gate-33's negative control relies on for RGB).
  const frameHash = sha256Hex([
    'holoscript-native-camera-frame-v1',
    `${frame.index}:${frame.timestampMs}:${frame.width}x${frame.height}x${frame.stride}`,
    frame.rgb,
    ...(measuredDepth ? ['depth', measuredDepth.bytes] : []),
    ...(devicePose
      ? ['pose', `${devicePose.position.join(',')};${devicePose.rotation.join(',')};${devicePose.confidence}`]
      : []),
  ]);

  return { frame, byteLength: rgb.byteLength, frameHash };
}

async function ensureRuntime(
  session: ScanSession,
  scanKind: ScanKind,
  decoded: DecodedNativeCameraFrame
): Promise<LiveRuntimeState> {
  const existing = liveRuntimes.get(session.token);
  if (existing) return existing;

  const runtime = createHoloMapRuntime();
  const firstFrameVideoHash = nativeCameraVideoHash(session.token, decoded.frameHash, 1);
  await runtime.init({
    inputResolution: { width: decoded.frame.width, height: decoded.frame.height },
    targetFPS: LIVE_TARGET_FPS,
    maxSequenceLength: LIVE_MAX_SEQUENCE,
    seed: 0,
    modelHash: scanSessionModelHash(),
    videoHash: firstFrameVideoHash,
    cpuOffload: false,
    weightStrategy: session.weightStrategy,
    verticalProfile: scanKind === 'face' ? 'object' : 'indoor',
    allowCpuFallback: true,
  });

  const state = { runtime, firstFrameHash: decoded.frameHash };
  liveRuntimes.set(session.token, state);
  return state;
}

export async function stepNativeCameraLiveScan(
  session: ScanSession,
  payload: NativeCameraFramePayload
): Promise<{ accepted: boolean; frameHash?: string }> {
  const decoded = decodeNativeCameraFramePayload(payload);
  const existing = session.nativeCamera;
  if (existing && decoded.frame.index <= existing.lastFrameIndex) {
    return { accepted: false, frameHash: decoded.frameHash };
  }

  const scanKind: ScanKind = session.scanKind === 'face' ? 'face' : 'room';
  const nowIso = new Date().toISOString();
  const frameDigest = updateNativeCameraFrameDigest(existing?.frameDigest, decoded.frameHash);
  session.nativeCamera = {
    source: 'mediaDevices.getUserMedia',
    startedAtIso: existing?.startedAtIso ?? nowIso,
    updatedAtIso: nowIso,
    frameCount: (existing?.frameCount ?? 0) + 1,
    frameBytes: (existing?.frameBytes ?? 0) + decoded.byteLength,
    frameDigest,
    width: decoded.frame.width,
    height: decoded.frame.height,
    stride: decoded.frame.stride,
    lastFrameIndex: decoded.frame.index,
    firstFrameHash: existing?.firstFrameHash ?? decoded.frameHash,
    lastFrameHash: decoded.frameHash,
    holomap: existing?.holomap ?? {
      runtime: 'active',
      framesStepped: 0,
      pointCount: 0,
    },
  };
  session.frameCount = session.nativeCamera.frameCount;
  session.videoBytes = session.nativeCamera.frameBytes;
  session.videoHash = nativeCameraVideoHash(
    session.token,
    session.nativeCamera.frameDigest,
    session.nativeCamera.frameCount
  );

  const runtimeState = await ensureRuntime(session, scanKind, decoded);
  try {
    const step = await runtimeState.runtime.step(decoded.frame);
    if (step) {
      const pointCount = step.points.positions.length / 3;
      session.nativeCamera.holomap = {
        runtime: 'active',
        replayFingerprint: runtimeState.runtime.replayHash(),
        framesStepped: (session.nativeCamera.holomap?.framesStepped ?? 0) + 1,
        pointCount: (session.nativeCamera.holomap?.pointCount ?? 0) + pointCount,
        anchorRevision: step.anchor.revision,
        lastPoseConfidence: step.pose.confidence,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.nativeCamera.holomap = {
      ...(session.nativeCamera.holomap ?? { framesStepped: 0, pointCount: 0 }),
      runtime: 'failed',
      lastError: message,
    };
    throw new Error(`Native camera HoloMap step failed: ${message}`);
  }

  return { accepted: true, frameHash: decoded.frameHash };
}

export async function finalizeNativeCameraLiveScan(
  session: ScanSession
): Promise<ReconstructionManifest | undefined> {
  const nativeCamera = session.nativeCamera;
  if (!nativeCamera || (nativeCamera.holomap?.framesStepped ?? 0) <= 0) return undefined;

  const runtimeState = liveRuntimes.get(session.token);
  if (!runtimeState) return undefined;

  try {
    const manifest = await runtimeState.runtime.finalize();
    const scanKind: ScanKind = session.scanKind === 'face' ? 'face' : 'room';
    const videoHash = nativeCameraVideoHash(session.token, nativeCamera.frameDigest, nativeCamera.frameCount);
    const replayFingerprint = computeHoloMapReplayFingerprint({
      modelHash: scanSessionModelHash(),
      seed: 0,
      weightStrategy: session.weightStrategy,
      videoHash,
    });

    manifest.worldId =
      scanKind === 'face'
        ? `native-camera-face-scan:${session.token}`
        : `native-camera-room-scan:${session.token}`;
    manifest.displayName =
      scanKind === 'face' ? 'Native camera face HoloMap scan' : 'Native camera HoloMap scan';
    manifest.replayHash = replayFingerprint;
    manifest.simulationContract.replayFingerprint = replayFingerprint;
    manifest.provenance = {
      ...manifest.provenance,
      anchorHash: `native-camera-frame-digest:${nativeCamera.frameDigest}`,
      capturedAtIso: nativeCamera.startedAtIso,
    };
    manifest.assets = {
      points: `native-camera-scan-sessions/${session.token}/points.bin`,
      trajectory: `native-camera-scan-sessions/${session.token}/trajectory.json`,
      anchors: `native-camera-scan-sessions/${session.token}/anchors.json`,
    };

    session.videoHash = videoHash;
    session.manifest = manifest;
    session.replayFingerprint = replayFingerprint;
    session.nativeCamera = {
      ...nativeCamera,
      updatedAtIso: new Date().toISOString(),
      holomap: {
        ...(nativeCamera.holomap ?? { framesStepped: manifest.frameCount, pointCount: manifest.pointCount }),
        runtime: 'finalized',
        replayFingerprint,
        framesStepped: manifest.frameCount,
        pointCount: manifest.pointCount,
      },
    };
    return manifest;
  } finally {
    await runtimeState.runtime.dispose().catch(() => undefined);
    liveRuntimes.delete(session.token);
  }
}

export async function disposeNativeCameraLiveScan(token: string): Promise<void> {
  const state = liveRuntimes.get(token);
  if (!state) return;
  await state.runtime.dispose().catch(() => undefined);
  liveRuntimes.delete(token);
}

/** @internal */
export async function __resetNativeCameraLiveScanForTests(): Promise<void> {
  const states = Array.from(liveRuntimes.values());
  liveRuntimes.clear();
  await Promise.all(states.map((state) => state.runtime.dispose().catch(() => undefined)));
}
