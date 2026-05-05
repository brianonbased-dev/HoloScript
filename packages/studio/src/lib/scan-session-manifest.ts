import {
  computeHoloMapReplayFingerprint,
  HOLOMAP_SIMULATION_CONTRACT_KIND,
} from '@holoscript/core/reconstruction';
import type { ReconstructionManifest } from '@holoscript/core/reconstruction';

const DEFAULT_MODEL_HASH = 'studio-room-scan-mvp';
type ScanKind = 'room' | 'face';

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

/** Minimal v1.0 manifest fields for scan completion (ingest / replay identity). */
export function buildScanCompletionManifest(input: {
  token: string;
  scanKind?: ScanKind;
  weightStrategy: 'distill' | 'fine-tune' | 'from-scratch';
  videoHash: string;
  frameCount: number;
  videoBytes: number;
  capturedAtIso: string;
}): ReconstructionManifest {
  const modelHash = scanSessionModelHash();
  const seed = 0;
  const scanKind = input.scanKind === 'face' ? 'face' : 'room';
  const pointMultiplier = scanKind === 'face' ? 96 : 128;
  const bounds =
    scanKind === 'face'
      ? {
          min: [-0.46, -0.62, -0.32] as [number, number, number],
          max: [0.46, 0.58, 0.28] as [number, number, number],
        }
      : {
          min: [-1, -1, -1] as [number, number, number],
          max: [1, 1, 1] as [number, number, number],
        };
  const assetPrefix = scanKind === 'face' ? 'face-scan-sessions' : 'scan-sessions';
  const replayFingerprint = computeHoloMapReplayFingerprint({
    modelHash,
    seed,
    weightStrategy: input.weightStrategy,
    videoHash: input.videoHash,
  });
  const replayHash = replayFingerprint;

  return {
    version: '1.0.0',
    worldId:
      scanKind === 'face' ? `face-scan-session:${input.token}` : `scan-session:${input.token}`,
    displayName: scanKind === 'face' ? 'Studio face scan' : 'Studio room scan',
    pointCount: Math.max(0, input.frameCount * pointMultiplier),
    frameCount: input.frameCount,
    bounds,
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
      points: `${assetPrefix}/${input.token}/points.bin`,
      trajectory: `${assetPrefix}/${input.token}/trajectory.json`,
      anchors: `${assetPrefix}/${input.token}/anchors.json`,
    },
    weightStrategy: input.weightStrategy,
  };
}

export function buildRoomScanCompletionManifest(
  input: Omit<Parameters<typeof buildScanCompletionManifest>[0], 'scanKind'>
): ReconstructionManifest {
  return buildScanCompletionManifest({ ...input, scanKind: 'room' });
}
