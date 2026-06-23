import type { Asset } from '@/components/assets/useAssetStore';
import type { SceneNode, TraitConfig } from '@/lib/stores/sceneGraphStore';
import type { HoloMapScanRenderAsset } from './holomap-scan-render';

export const HOLOMAP_POINT_CLOUD_TRAIT = 'holomap_point_cloud';

interface HoloMapScanPlacementInput {
  renderAsset: HoloMapScanRenderAsset;
  token?: string;
  videoHash?: string;
  manifest?: {
    displayName?: string;
    replayHash?: string;
    simulationContract?: unknown;
  };
  name?: string;
  now?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export interface HoloMapScanScenePlacement {
  asset: Asset;
  node: SceneNode;
  trait: TraitConfig;
}

function slugSegment(value: string | undefined, fallback: string): string {
  const slug = (value ?? fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return slug.length > 0 ? slug : fallback;
}

function defaultName(input: HoloMapScanPlacementInput): string {
  if (input.name) return input.name;
  if (input.manifest?.displayName) return input.manifest.displayName;
  return input.renderAsset.scanKind === 'face' ? 'HoloMap face scan' : 'HoloMap room scan';
}

export function createHoloMapScanScenePlacement(
  input: HoloMapScanPlacementInput
): HoloMapScanScenePlacement {
  const { renderAsset } = input;
  const name = defaultName(input);
  const seed = slugSegment(renderAsset.replayFingerprint || input.token, 'scan');
  const assetId = `asset-holomap-${seed}`;
  const nodeId = `placed-holomap-${seed}`;
  const now = input.now ?? Date.now();

  const trait: TraitConfig = {
    name: HOLOMAP_POINT_CLOUD_TRAIT,
    properties: {
      source: `holomap-scan:${renderAsset.replayFingerprint}`,
      assetId,
      scanKind: renderAsset.scanKind ?? 'room',
      replayFingerprint: renderAsset.replayFingerprint,
      replayHash: input.manifest?.replayHash,
      simulationContract: input.manifest?.simulationContract,
      token: input.token,
      videoHash: input.videoHash,
      positionsB64: renderAsset.positionsB64,
      colorsB64: renderAsset.colorsB64,
      pointCount: renderAsset.pointCount,
      bounds: renderAsset.bounds,
      gpuPath: 'HolomapPointCloudViewer',
      utilizationEvidence: {
        consumedBy: [
          'useAssetStore',
          'useSceneGraphStore',
          'SceneGraphPointCloudLayer',
          'R3FNodeRenderer.holomapPointCloud',
        ],
        pointBuffers: ['positionsB64', 'colorsB64'],
        note: 'CPU load alone is not accepted as GPU utilization evidence.',
      },
    },
  };

  const asset: Asset = {
    id: assetId,
    name,
    category: 'pointCloud',
    src: `holomap-scan:${renderAsset.replayFingerprint}`,
    size: renderAsset.pointCount * (3 * 4 + 3),
    addedAt: now,
    tags: ['holomap', 'point-cloud', renderAsset.scanKind ?? 'room'],
    metadata: {
      kind: renderAsset.kind,
      renderAsset,
      replayFingerprint: renderAsset.replayFingerprint,
      replayHash: input.manifest?.replayHash,
      token: input.token,
      videoHash: input.videoHash,
    },
  };

  const node: SceneNode = {
    id: nodeId,
    name,
    type: 'holomapPointCloud',
    parentId: null,
    traits: [trait],
    position: input.position ?? [0, 0, 0],
    rotation: input.rotation ?? [0, 0, 0],
    scale: input.scale ?? [1, 1, 1],
    assetMaturity: 'mesh',
  };

  return { asset, node, trait };
}
