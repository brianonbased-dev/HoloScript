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
// HoloMap reconstruction decorator → trait mapping. Source of truth is
// packages/core/src/traits/constants/holomap-reconstruction.ts; inlined
// here because @holoscript/core's tsup build does NOT currently emit a
// runtime entry for the constants subpath (only a hand-crafted .d.ts).
// Keep these in lockstep — the contract test below covers all 3 single
// + 1 trio decorator combinations.
type HolomapReconstructionTraitName =
  | 'holomap_reconstruct'
  | 'holomap_camera_trajectory'
  | 'holomap_anchor_context'
  | 'holomap_splat_output'
  | 'holomap_drift_correction';

const HOLOMAP_DECORATOR_TO_TRAITS: Readonly<
  Record<string, readonly HolomapReconstructionTraitName[]>
> = Object.freeze({
  reconstruction_source: [
    'holomap_reconstruct',
    'holomap_camera_trajectory',
    'holomap_anchor_context',
  ],
  acceptance_video: ['holomap_reconstruct', 'holomap_splat_output'],
  drift_corrected: ['holomap_drift_correction'],
});

function stripDecoratorPrefix(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}

function isReconstructionDecorator(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    HOLOMAP_DECORATOR_TO_TRAITS,
    stripDecoratorPrefix(name)
  );
}

function getReconstructionTraitsFromDecorators(
  decoratorNames: readonly string[]
): HolomapReconstructionTraitName[] {
  const seen = new Set<HolomapReconstructionTraitName>();
  const out: HolomapReconstructionTraitName[] = [];
  for (const raw of decoratorNames) {
    const stripped = stripDecoratorPrefix(raw);
    const traits = HOLOMAP_DECORATOR_TO_TRAITS[stripped];
    if (!traits) continue;
    for (const t of traits) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
import { compileManifestToTarget, holomapPayloadFromAggregatedPoints } from './holo-reconstruct-export';
import {
  appendStepToAggregate,
  boundsFromPositions,
  emptyAggregate,
  encodePlyAscii,
  encodeTrajectoryJson,
  effectiveBoundsForExport,
  type AggregatedScanGeometry,
} from './holo-reconstruct-point-assets';
import { fetchVideoToTempFile, ingestVideoRgbFrames } from './holo-video-ingest';

const DEFAULT_EXPORT_MAX_POINTS = 250_000;

function maxExportPointsCap(): number {
  const n = Number.parseInt(process.env.HOLOMAP_MCP_EXPORT_MAX_POINTS ?? '', 10);
  if (Number.isFinite(n) && n > 100) return Math.min(n, 2_000_000);
  return DEFAULT_EXPORT_MAX_POINTS;
}

export type HoloReconstructMcpSession = {
  runtime: HoloMapRuntime;
  videoUrl: string;
  lastStep?: ReconstructionStep;
  finalizedManifest?: ReconstructionManifest;
  aggregate: AggregatedScanGeometry;
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
  if (typeof o.weightCid === 'string' && o.weightCid.trim()) p.weightCid = o.weightCid.trim();
  return p;
}

function pickIngestOptions(configArg: unknown): { ingestVideo: boolean; maxIngestFrames: number } {
  let ingestVideo = process.env.HOLOMAP_MCP_INGEST_VIDEO !== '0';
  let maxIngestFrames = Math.min(
    500,
    Math.max(1, Number.parseInt(process.env.HOLOMAP_MCP_MAX_FRAMES ?? '120', 10) || 120),
  );
  if (configArg && typeof configArg === 'object') {
    const o = configArg as Record<string, unknown>;
    if (typeof o.ingestVideo === 'boolean') ingestVideo = o.ingestVideo;
    if (typeof o.maxIngestFrames === 'number' && Number.isFinite(o.maxIngestFrames)) {
      maxIngestFrames = Math.min(500, Math.max(1, Math.floor(o.maxIngestFrames)));
    }
  }
  return { ingestVideo, maxIngestFrames };
}

/**
 * Sprint-3 Phase 2: trait → MCP dispatch.
 *
 * Given the decorator names declared on a `.holo` Node, decide which
 * MCP session shape to spin up and what config tweaks the decorators
 * imply. The 3 HoloMap reconstruction decorators map onto two
 * orthogonal pieces of session config:
 *
 *   - `@reconstruction_source`  → full reconstruction pipeline
 *                                  (camera trajectory + anchor context).
 *   - `@acceptance_video`       → reconstruction + splat output (validated
 *                                  reconstruction, not just trajectory).
 *   - `@drift_corrected`        → pure post-processing flag; cannot drive
 *                                  a session on its own.
 *
 * Acceptance criterion (task_p0gl): an integration test must cover all
 * three single-decorator combos AND the trio. See
 * packages/mcp-server/src/__tests__/holo-reconstruct-dispatch.test.ts.
 */
export type ReconstructionDispatch =
  | {
      kind: 'no-session';
      reason: 'no-decorators' | 'drift-only-needs-source';
      resolvedTraits: HolomapReconstructionTraitName[];
    }
  | {
      kind: 'video-session';
      sessionConstructor: 'mcpStartReconstructFromVideo';
      sessionFlags: {
        emitTrajectory: boolean;
        emitSplatOutput: boolean;
        applyDriftCorrection: boolean;
      };
      resolvedTraits: HolomapReconstructionTraitName[];
    };

export function dispatchReconstructionFromDecorators(
  decoratorNames: readonly string[]
): ReconstructionDispatch {
  // Filter to only HoloMap reconstruction decorators; other families
  // (motion, environment, etc.) are silently ignored, matching the
  // contract of `getReconstructionTraitsFromDecorators`.
  const ours = decoratorNames.filter((d) => isReconstructionDecorator(d));
  if (ours.length === 0) {
    return { kind: 'no-session', reason: 'no-decorators', resolvedTraits: [] };
  }

  const stripped = ours.map((d) => (d.startsWith('@') ? d.slice(1) : d));
  const hasReconSource = stripped.includes('reconstruction_source');
  const hasAcceptance = stripped.includes('acceptance_video');
  const hasDrift = stripped.includes('drift_corrected');
  const resolvedTraits = getReconstructionTraitsFromDecorators(decoratorNames);

  // `@drift_corrected` alone is a post-processing marker — it cannot
  // produce a session because it has no upstream pose source. Surface
  // this as a structured no-session result rather than spinning up a
  // half-configured runtime.
  if (!hasReconSource && !hasAcceptance && hasDrift) {
    return { kind: 'no-session', reason: 'drift-only-needs-source', resolvedTraits };
  }

  return {
    kind: 'video-session',
    sessionConstructor: 'mcpStartReconstructFromVideo',
    sessionFlags: {
      // Camera-trajectory output piggybacks on `@reconstruction_source`;
      // `@acceptance_video` doesn't need it (it emits splats not poses).
      emitTrajectory: hasReconSource,
      emitSplatOutput: hasAcceptance,
      applyDriftCorrection: hasDrift,
    },
    resolvedTraits,
  };
}

export async function mcpStartReconstructFromVideo(
  videoUrl: string,
  configArg: unknown,
): Promise<{
  sessionId: string;
  replayFingerprint: string;
  framesIngested: number;
  ingestMode: 'ffmpeg' | 'none';
  videoBytes?: number;
  ingestWarning?: string;
}> {
  const sessionId = randomUUID();
  const runtime = createHoloMapRuntime();
  const partial = pickPartialHoloMapConfig(configArg);
  const cfg: HoloMapConfig = { ...HOLOMAP_DEFAULTS, ...partial };
  const { ingestVideo, maxIngestFrames } = pickIngestOptions(configArg);

  let framesIngested = 0;
  let ingestMode: 'ffmpeg' | 'none' = 'none';
  let videoBytes: number | undefined;
  let ingestWarning: string | undefined;

  const aggregate = emptyAggregate();
  const pointCap = maxExportPointsCap();

  if (ingestVideo) {
    let cleanup: (() => Promise<void>) | undefined;
    try {
      const file = await fetchVideoToTempFile(videoUrl);
      cleanup = file.cleanup;
      videoBytes = file.bytes;
      await runtime.init({
        ...cfg,
        videoHash: partial.videoHash ?? file.sha256Hex,
        allowCpuFallback: partial.allowCpuFallback !== false,
      });
      try {
        const fps = Math.max(1, Math.min(30, cfg.targetFPS));
        const { frames } = await ingestVideoRgbFrames({
          videoPath: file.path,
          width: cfg.inputResolution.width,
          height: cfg.inputResolution.height,
          fps,
          maxFrames: maxIngestFrames,
        });
        let lastStep: ReconstructionStep | undefined;
        for (const f of frames) {
          lastStep = await runtime.step({
            index: f.index,
            timestampMs: Math.round((f.index * 1000) / fps),
            rgb: f.rgb,
            width: cfg.inputResolution.width,
            height: cfg.inputResolution.height,
            stride: 3,
          });
          appendStepToAggregate(aggregate, lastStep, pointCap);
          framesIngested += 1;
        }
        ingestMode = 'ffmpeg';
        if (framesIngested === 0) {
          ingestWarning =
            'ffmpeg produced zero frames (unsupported codec, empty video, or decode error). Session is ready for holo_reconstruct_step.';
        }
        sessions.set(sessionId, { runtime, videoUrl, aggregate, lastStep });
      } catch (ffErr) {
        ingestWarning =
          ffErr instanceof Error ? ffErr.message : String(ffErr);
        sessions.set(sessionId, { runtime, videoUrl, aggregate });
      }
    } catch (e) {
      ingestWarning = e instanceof Error ? e.message : String(e);
      await runtime.init({
        ...cfg,
        videoHash: partial.videoHash ?? hashVideoUrl(videoUrl),
        allowCpuFallback: partial.allowCpuFallback !== false,
      });
      sessions.set(sessionId, { runtime, videoUrl, aggregate });
    } finally {
      if (cleanup) await cleanup();
    }
  } else {
    await runtime.init({
      ...cfg,
      videoHash: partial.videoHash ?? hashVideoUrl(videoUrl),
      allowCpuFallback: partial.allowCpuFallback !== false,
    });
    sessions.set(sessionId, { runtime, videoUrl, aggregate });
  }

  return {
    sessionId,
    replayFingerprint: runtime.replayHash(),
    framesIngested,
    ingestMode,
    videoBytes,
    ingestWarning,
  };
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
  appendStepToAggregate(state.aggregate, step, maxExportPointsCap());
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
  compileStatus: 'COMPILED' | 'COMPILE_FAILED';
  manifest: Record<string, unknown>;
  compiledOutput?: string;
  usedCompilerFallback?: boolean;
  compileError?: string;
  /** ASCII PLY (xyz + rgb) from aggregated step points; load in DCC tools or three.js PLYLoader. */
  pointCloudPly?: string;
  /** Camera / rig poses per reconstructed frame (JSON). */
  trajectoryJson?: string;
  exportPointCount?: number;
  message: string;
}> {
  const state = sessions.get(sessionId);
  if (!state) {
    throw new Error(`holo_reconstruct: unknown sessionId`);
  }

  let manifest: ReconstructionManifest;
  if (state.finalizedManifest) {
    manifest = state.finalizedManifest;
  } else {
    manifest = await state.runtime.finalize();
    state.finalizedManifest = manifest;
    await state.runtime.dispose();
  }

  const geom = state.aggregate;
  const geomBounds = boundsFromPositions(geom.positions);
  const boundsForStub = effectiveBoundsForExport(manifest, geomBounds);
  const exportPointCount = Math.floor(geom.positions.length / 3);
  const pointCloudPly =
    exportPointCount > 0 ? encodePlyAscii(geom.positions, geom.colors) : undefined;
  const trajectoryJson =
    geom.poses.length > 0 ? encodeTrajectoryJson(geom.poses) : undefined;

  let compiledOutput: string | undefined;
  let usedCompilerFallback: boolean | undefined;
  let compileError: string | undefined;
  let compileStatus: 'COMPILED' | 'COMPILE_FAILED';

  const holomapPc = holomapPayloadFromAggregatedPoints(geom.positions, geom.colors);

  try {
    const c = await compileManifestToTarget(manifest, target, boundsForStub, holomapPc);
    compiledOutput = c.output;
    usedCompilerFallback = c.usedFallback;
    compileStatus = 'COMPILED';
  } catch (e) {
    compileError = e instanceof Error ? e.message : String(e);
    compileStatus = 'COMPILE_FAILED';
  }

  return {
    ok: true,
    target,
    compileStatus,
    manifest: manifestToJson(manifest),
    compiledOutput,
    usedCompilerFallback,
    compileError,
    pointCloudPly,
    trajectoryJson,
    exportPointCount,
    message:
      compileStatus === 'COMPILED'
        ? 'HoloMap manifest generated and export target compiled via ExportManager.'
        : `HoloMap manifest returned; compile failed (${compileError ?? 'unknown'}). Retry with another target or fix toolchain.`,
  };
}
