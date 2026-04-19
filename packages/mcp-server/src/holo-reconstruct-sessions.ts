/**
 * In-memory HoloMap reconstruction sessions for MCP tools.
 * Uses @holoscript/core HoloMapRuntime (CPU fused-attention fallback in Node).
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  createHoloMapRuntime,
  HOLOMAP_DEFAULTS,
  type HoloMapConfig,
  type HoloMapRuntime,
  type ReconstructionFrame,
  type ReconstructionManifest,
  type ReconstructionStep,
} from '@holoscript/core/reconstruction';

export type HoloReconstructMcpSession = {
  runtime: HoloMapRuntime;
  videoUrl: string;
  lastStep?: ReconstructionStep;
  finalizedManifest?: ReconstructionManifest;
};

const sessions = new Map<string, HoloReconstructMcpSession>();

export function __resetHoloReconstructSessionsForTests(): void {
  sessions.clear();
}

function hashVideoUrl(url: string): string {
  return createHash('sha256').update(url, 'utf8').digest('hex');
}

function pickPartialHoloMapConfig(raw: unknown): Partial<HoloMapConfig> {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const p: Partial<HoloMapConfig> = {};
  if (typeof o.modelHash === 'string') p.modelHash = o.modelHash;
  if (typeof o.seed === 'number' && Number.isFinite(o.seed)) p.seed = o.seed;
  if (o.inputResolution && typeof o.inputResolution === 'object') {
    const ir = o.inputResolution as Record<string, unknown>;
    if (typeof ir.width === 'number' && typeof ir.height === 'number') {
      p.inputResolution = { width: ir.width, height: ir.height };
    }
  }
  if (typeof o.targetFPS === 'number' && Number.isFinite(o.targetFPS)) p.targetFPS = o.targetFPS;
  if (typeof o.maxSequenceLength === 'number' && Number.isFinite(o.maxSequenceLength)) {
    p.maxSequenceLength = o.maxSequenceLength;
  }
  if (typeof o.cpuOffload === 'boolean') p.cpuOffload = o.cpuOffload;
  if (o.weightStrategy === 'distill' || o.weightStrategy === 'fine-tune' || o.weightStrategy === 'from-scratch') {
    p.weightStrategy = o.weightStrategy;
  }
  if (typeof o.allowCpuFallback === 'boolean') p.allowCpuFallback = o.allowCpuFallback;
  if (typeof o.videoHash === 'string') p.videoHash = o.videoHash;
  return p;
}

export async function mcpStartReconstructFromVideo(
  videoUrl: string,
  configArg: unknown,
): Promise<{ sessionId: string; replayFingerprint: string }> {
  const sessionId = randomUUID();
  const runtime = createHoloMapRuntime();
  const partial = pickPartialHoloMapConfig(configArg);
  await runtime.init({
    ...HOLOMAP_DEFAULTS,
    ...partial,
    videoHash: partial.videoHash ?? hashVideoUrl(videoUrl),
    allowCpuFallback: partial.allowCpuFallback !== false,
  });
  sessions.set(sessionId, { runtime, videoUrl });
  return { sessionId, replayFingerprint: runtime.replayHash() };
}

function getSessionOrThrow(sessionId: string): HoloReconstructMcpSession {
  const s = sessions.get(sessionId);
  if (!s) {
    throw new Error(`holo_reconstruct: unknown sessionId (create one with holo_reconstruct_from_video first)`);
  }
  return s;
}

function requireOpenSession(sessionId: string): HoloReconstructMcpSession {
  const s = getSessionOrThrow(sessionId);
  if (s.finalizedManifest) {
    throw new Error(`holo_reconstruct: session ${sessionId} is finalized; start a new session`);
  }
  return s;
}

function decodeFrame(
  frameBase64: string,
  frameIndex: number,
  width: number,
  height: number,
): ReconstructionFrame {
  let buf: Buffer;
  try {
    buf = Buffer.from(frameBase64, 'base64');
  } catch {
    throw new Error('holo_reconstruct_step: frameBase64 is not valid base64');
  }
  const n3 = width * height * 3;
  const n4 = width * height * 4;
  let stride: 3 | 4;
  if (buf.length === n4) stride = 4;
  else if (buf.length === n3) stride = 3;
  else {
    throw new Error(
      `holo_reconstruct_step: frame byte length ${buf.length} does not match width*height*3 (${n3}) or *4 (${n4})`,
    );
  }
  return {
    index: frameIndex,
    timestampMs: frameIndex * 33,
    rgb: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    width,
    height,
    stride,
  };
}

export async function mcpReconstructStep(
  sessionId: string,
  frameBase64: string,
  frameIndex: number,
  width: number,
  height: number,
): Promise<{
  ok: true;
  frameIndex: number;
  pose: ReconstructionStep['pose'];
  pointCount: number;
  trajectoryRevision: number;
  anchorRevision: number;
}> {
  const state = requireOpenSession(sessionId);
  const frame = decodeFrame(frameBase64, frameIndex, width, height);
  const step = await state.runtime.step(frame);
  state.lastStep = step;
  return {
    ok: true,
    frameIndex: step.frame.index,
    pose: step.pose,
    pointCount: step.points.positions.length / 3,
    trajectoryRevision: step.trajectory.revision,
    anchorRevision: step.anchor.revision,
  };
}

function serializeAnchor(a: ReconstructionStep['anchor']): Record<string, unknown> {
  return {
    anchorFrameIndex: a.anchorFrameIndex,
    anchorPose: a.anchorPose,
    anchorDescriptor: Array.from(a.anchorDescriptor),
    revision: a.revision,
  };
}

export function mcpReconstructAnchor(sessionId: string): {
  ok: true;
  anchor: Record<string, unknown>;
  finalized?: boolean;
} {
  const state = getSessionOrThrow(sessionId);
  if (state.finalizedManifest && state.lastStep) {
    return { ok: true, anchor: serializeAnchor(state.lastStep.anchor), finalized: true };
  }
  if (state.finalizedManifest) {
    return {
      ok: true,
      anchor: serializeAnchor({
        anchorFrameIndex: 0,
        anchorPose: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          confidence: 1,
        },
        anchorDescriptor: new Float32Array([0, 0, 0, 0]),
        revision: 0,
      }),
      finalized: true,
    };
  }
  if (state.lastStep) {
    return { ok: true, anchor: serializeAnchor(state.lastStep.anchor) };
  }
  return {
    ok: true,
    anchor: serializeAnchor({
      anchorFrameIndex: 0,
      anchorPose: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        confidence: 1,
      },
      anchorDescriptor: new Float32Array([0, 0, 0, 0]),
      revision: 0,
    }),
  };
}

function manifestToJson(m: ReconstructionManifest): Record<string, unknown> {
  return JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
}

export async function mcpReconstructExport(
  sessionId: string,
  target: string,
): Promise<{
  ok: true;
  target: string;
  compileStatus: 'MANIFEST_ONLY';
  manifest: Record<string, unknown>;
  message: string;
}> {
  const state = sessions.get(sessionId);
  if (!state) {
    throw new Error(`holo_reconstruct: unknown sessionId`);
  }
  if (state.finalizedManifest) {
    return {
      ok: true,
      target,
      compileStatus: 'MANIFEST_ONLY',
      manifest: manifestToJson(state.finalizedManifest),
      message: 'Cached manifest from prior export. Target compilation is not implemented yet.',
    };
  }
  const manifest = await state.runtime.finalize();
  state.finalizedManifest = manifest;
  await state.runtime.dispose();
  return {
    ok: true,
    target,
    compileStatus: 'MANIFEST_ONLY',
    manifest: manifestToJson(manifest),
    message:
      'HoloMap v1.0 manifest returned. Compiling to scene targets (r3f, unity, …) is not implemented in MCP yet.',
  };
}
