import { useEffect, useMemo } from 'react';

export const CROSS_SCALE_PROJECTION_RECEIPT_SCHEMA = 'cross-scale-projection-r3f/v1';

export const CROSS_SCALE_PROJECTION_SCALES = [
  'atomic',
  'molecular',
  'structural',
  'scene',
] as const;

export type CrossScaleProjectionScale = (typeof CROSS_SCALE_PROJECTION_SCALES)[number];
export type CrossScaleProjectionColorMode = 'lod' | 'importance';

export interface CrossScaleAnchorLike {
  id: string;
  position: [number, number, number];
  scale: number;
  lodLevel: number;
  gaussianCount: number;
  importance: number;
  provenanceHash: string;
  sourceFile?: string;
}

export interface CrossScalePartitionLike {
  schema: string;
  compositionName: string;
  anchors: CrossScaleAnchorLike[];
  merkleRoot: string;
  totalGaussians: number;
}

export interface CrossScaleProjectionOptions {
  minRadius?: number;
  radiusMultiplier?: number;
  colorBy?: CrossScaleProjectionColorMode;
}

export interface CrossScaleProjectionEdge {
  fromScale: CrossScaleProjectionScale | 'source';
  toScale: CrossScaleProjectionScale;
  provenanceHash: string;
}

export interface CrossScaleProjectionMaterial {
  color: string;
  emissive: string;
  opacity: number;
}

export interface CrossScaleProjectionNode {
  anchorId: string;
  renderId: string;
  pixelProxyId: string;
  position: [number, number, number];
  radius: number;
  lodLevel: number;
  gaussianCount: number;
  sourceFile?: string;
  sourceProvenanceHash: string;
  provenanceHash: string;
  projectionPath: CrossScaleProjectionEdge[];
  material: CrossScaleProjectionMaterial;
}

export interface CrossScaleProjectionReceipt {
  schema: typeof CROSS_SCALE_PROJECTION_RECEIPT_SCHEMA;
  sourceSchema: string;
  compositionName: string;
  sourceMerkleRoot: string;
  projectionHash: string;
  scalePath: CrossScaleProjectionScale[];
  nodeCount: number;
  edgeCount: number;
  totalGaussians: number;
  pixelProxyIds: string[];
  finalProvenanceHashes: string[];
  renderable: true;
}

export interface CrossScaleProjectionResult {
  nodes: CrossScaleProjectionNode[];
  receipt: CrossScaleProjectionReceipt;
}

export interface CrossScaleProjectionRendererProps extends CrossScaleProjectionOptions {
  partition: CrossScalePartitionLike;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  onReceipt?: (receipt: CrossScaleProjectionReceipt) => void;
}

const DEFAULT_MIN_RADIUS = 0.035;
const DEFAULT_RADIUS_MULTIPLIER = 0.08;
const LOD_COLORS = ['#4cc9f0', '#80ed99', '#ffd166', '#f77f00', '#ef476f', '#9d4edd'];

export function buildCrossScaleProjection(
  partition: CrossScalePartitionLike,
  options: CrossScaleProjectionOptions = {}
): CrossScaleProjectionResult {
  const minRadius = resolvePositive(options.minRadius, DEFAULT_MIN_RADIUS);
  const radiusMultiplier = resolvePositive(options.radiusMultiplier, DEFAULT_RADIUS_MULTIPLIER);
  const colorBy = options.colorBy ?? 'lod';

  const nodes = partition.anchors.map((anchor) => {
    const projectionPath = buildProjectionPath(partition, anchor);
    const provenanceHash =
      projectionPath[projectionPath.length - 1]?.provenanceHash ?? anchor.provenanceHash;
    const pixelProxyId = `px_${sanitizeId(anchor.id)}_${provenanceHash.slice(0, 12)}`;

    return {
      anchorId: anchor.id,
      renderId: `cross_scale_${pixelProxyId}`,
      pixelProxyId,
      position: normalizePosition(anchor.position),
      radius: Math.max(minRadius, Math.abs(anchor.scale) * radiusMultiplier),
      lodLevel: anchor.lodLevel,
      gaussianCount: anchor.gaussianCount,
      sourceFile: anchor.sourceFile,
      sourceProvenanceHash: anchor.provenanceHash,
      provenanceHash,
      projectionPath,
      material: materialForAnchor(anchor, colorBy),
    };
  });

  const receiptInput = {
    schema: CROSS_SCALE_PROJECTION_RECEIPT_SCHEMA,
    sourceSchema: partition.schema,
    compositionName: partition.compositionName,
    sourceMerkleRoot: partition.merkleRoot,
    scalePath: CROSS_SCALE_PROJECTION_SCALES,
    totalGaussians: partition.totalGaussians,
    nodes: nodes.map((node) => ({
      anchorId: node.anchorId,
      renderId: node.renderId,
      pixelProxyId: node.pixelProxyId,
      sourceProvenanceHash: node.sourceProvenanceHash,
      finalProvenanceHash: node.provenanceHash,
    })),
  };

  const receipt: CrossScaleProjectionReceipt = {
    schema: CROSS_SCALE_PROJECTION_RECEIPT_SCHEMA,
    sourceSchema: partition.schema,
    compositionName: partition.compositionName,
    sourceMerkleRoot: partition.merkleRoot,
    projectionHash: stableProjectionHash(JSON.stringify(receiptInput)),
    scalePath: [...CROSS_SCALE_PROJECTION_SCALES],
    nodeCount: nodes.length,
    edgeCount: nodes.reduce((sum, node) => sum + node.projectionPath.length, 0),
    totalGaussians: partition.totalGaussians,
    pixelProxyIds: nodes.map((node) => node.pixelProxyId),
    finalProvenanceHashes: nodes.map((node) => node.provenanceHash),
    renderable: true,
  };

  return { nodes, receipt };
}

export function CrossScaleProjectionRenderer({
  partition,
  minRadius,
  radiusMultiplier,
  colorBy,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  onReceipt,
}: CrossScaleProjectionRendererProps) {
  const projection = useMemo(
    () => buildCrossScaleProjection(partition, { minRadius, radiusMultiplier, colorBy }),
    [partition, minRadius, radiusMultiplier, colorBy]
  );

  useEffect(() => {
    onReceipt?.(projection.receipt);
  }, [onReceipt, projection.receipt]);

  return (
    <group
      name="cross-scale-projection"
      position={position}
      rotation={rotation}
      scale={scale}
      userData={{ crossScaleProjectionReceipt: projection.receipt }}
    >
      {projection.nodes.map((node) => (
        <mesh
          key={node.renderId}
          name={node.renderId}
          position={node.position}
          userData={{
            crossScaleProjection: node,
            pixelProxyId: node.pixelProxyId,
            provenanceHash: node.provenanceHash,
          }}
        >
          <sphereGeometry args={[node.radius, 16, 12]} />
          <meshStandardMaterial
            color={node.material.color}
            emissive={node.material.emissive}
            emissiveIntensity={0.25}
            transparent
            opacity={node.material.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

function buildProjectionPath(
  partition: CrossScalePartitionLike,
  anchor: CrossScaleAnchorLike
): CrossScaleProjectionEdge[] {
  const path: CrossScaleProjectionEdge[] = [];
  let fromScale: CrossScaleProjectionEdge['fromScale'] = 'source';
  let previousHash = anchor.provenanceHash;

  for (const toScale of CROSS_SCALE_PROJECTION_SCALES) {
    const provenanceHash = stableProjectionHash(
      [
        partition.merkleRoot,
        partition.compositionName,
        anchor.id,
        previousHash,
        `${fromScale}>${toScale}`,
        anchor.lodLevel,
        anchor.gaussianCount,
      ].join('|')
    );

    path.push({ fromScale, toScale, provenanceHash });
    fromScale = toScale;
    previousHash = provenanceHash;
  }

  return path;
}

function stableProjectionHash(input: string): string {
  const seeds = [
    0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1, 0xd3a2646c,
  ];

  return seeds.map((seed) => hashWord(input, seed)).join('');
}

function hashWord(input: string, seed: number): string {
  let hash = seed >>> 0;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

function sanitizeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'anchor';
}

function normalizePosition(position: [number, number, number]): [number, number, number] {
  return [
    Number.isFinite(position[0]) ? position[0] : 0,
    Number.isFinite(position[1]) ? position[1] : 0,
    Number.isFinite(position[2]) ? position[2] : 0,
  ];
}

function resolvePositive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function materialForAnchor(
  anchor: CrossScaleAnchorLike,
  colorBy: CrossScaleProjectionColorMode
): CrossScaleProjectionMaterial {
  const importance = clamp01(anchor.importance);
  const colorIndex =
    colorBy === 'importance'
      ? Math.round(importance * (LOD_COLORS.length - 1))
      : Math.abs(anchor.lodLevel) % LOD_COLORS.length;
  const color = LOD_COLORS[colorIndex] ?? LOD_COLORS[0];

  return {
    color,
    emissive: color,
    opacity: Math.max(0.42, Math.min(0.9, 0.48 + importance * 0.28)),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
