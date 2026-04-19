import {
  computeHoloMapReplayFingerprint,
  HOLOMAP_SIMULATION_CONTRACT_KIND,
} from '@holoscript/core/reconstruction';
import type { ReconstructionManifest } from '@holoscript/core/reconstruction';

const DEFAULT_MODEL_HASH = 'studio-room-scan-mvp';

export function scanSessionModelHash(): string {
  return process.env.HOLOMAP_SESSION_MODEL_HASH?.trim() || DEFAULT_MODEL_HASH;
}

export function holoScriptBuildLabel(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.GITHUB_SHA?.slice(0, 12) ||
    `studio@${process.env.npm_package_version ?? 'dev'}`
  );
}

/** Minimal v1.0 manifest fields for room-scan completion (ingest / replay identity). */
export function buildRoomScanCompletionManifest(input: {
  token: string;
  weightStrategy: 'distill' | 'fine-tune' | 'from-scratch';
  videoHash: string;
  frameCount: number;
  videoBytes: number;
  capturedAtIso: string;
}): ReconstructionManifest {
  const modelHash = scanSessionModelHash();
  const seed = 0;
  const replayFingerprint = computeHoloMapReplayFingerprint({
    modelHash,
    seed,
    weightStrategy: input.weightStrategy,
    videoHash: input.videoHash,
  });
  const replayHash = replayFingerprint;

  return {
    version: '1.0.0',
    worldId: `scan-session:${input.token}`,
    displayName: 'Studio room scan',
    pointCount: Math.max(0, input.frameCount * 128),
    frameCount: input.frameCount,
    bounds: {
      min: [-1, -1, -1],
      max: [1, 1, 1],
    },
    replayHash,
    simulationContract: {
      kind: HOLOMAP_SIMULATION_CONTRACT_KIND,
      replayFingerprint,
      holoScriptBuild: holoScriptBuildLabel(),
    },
    provenance: {
      capturedAtIso: input.capturedAtIso,
    },
    assets: {
      points: `scan-sessions/${input.token}/points.bin`,
      trajectory: `scan-sessions/${input.token}/trajectory.json`,
      anchors: `scan-sessions/${input.token}/anchors.json`,
    },
    weightStrategy: input.weightStrategy,
  };
}
