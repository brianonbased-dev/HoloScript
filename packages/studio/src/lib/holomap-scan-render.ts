import { Buffer } from 'node:buffer';
import type { ReconstructionManifest } from '@holoscript/core/reconstruction';

export interface HoloMapScanRenderAsset {
  kind: 'holomap-point-cloud';
  positionsB64: string;
  colorsB64: string;
  pointCount: number;
  bounds: ReconstructionManifest['bounds'];
  replayFingerprint: string;
}

function hash32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function jitterColor(base: number, rand: () => number): number {
  return Math.max(0, Math.min(255, Math.round(base + (rand() - 0.5) * 36)));
}

/**
 * Current mobile transport persists scan metadata first; binary point assets
 * arrive through the MCP export path. This builds a deterministic point-cloud
 * render asset from the completed HoloMap manifest so the Studio viewer can
 * display a scan-shaped artifact immediately, then accept real points with the
 * same renderer as soon as persistence is wired.
 */
export function buildHoloMapScanRenderAsset(input: {
  manifest: ReconstructionManifest;
  token: string;
  videoHash: string;
}): HoloMapScanRenderAsset {
  const { manifest } = input;
  const targetPoints = Math.min(20_000, Math.max(0, Math.floor(manifest.pointCount)));
  const positions = new Float32Array(targetPoints * 3);
  const colors = new Uint8Array(targetPoints * 3);
  const rand = mulberry32(hash32(`${input.token}:${input.videoHash}:${manifest.replayHash}`));

  const [minX, minY, minZ] = manifest.bounds.min;
  const [maxX, maxY, maxZ] = manifest.bounds.max;
  const width = Math.max(0.01, maxX - minX);
  const height = Math.max(0.01, maxY - minY);
  const depth = Math.max(0.01, maxZ - minZ);

  for (let i = 0; i < targetPoints; i += 1) {
    const p = i * 3;
    const surface = rand();
    const insetX = lerp(minX + width * 0.04, maxX - width * 0.04, rand());
    const insetZ = lerp(minZ + depth * 0.04, maxZ - depth * 0.04, rand());

    if (surface < 0.45) {
      positions[p] = insetX;
      positions[p + 1] = minY + height * 0.015 * rand();
      positions[p + 2] = insetZ;
      colors[p] = jitterColor(105, rand);
      colors[p + 1] = jitterColor(118, rand);
      colors[p + 2] = jitterColor(130, rand);
    } else if (surface < 0.72) {
      const side = rand() < 0.5 ? minX : maxX;
      positions[p] = side + (rand() - 0.5) * width * 0.02;
      positions[p + 1] = lerp(minY + height * 0.05, maxY - height * 0.08, rand());
      positions[p + 2] = insetZ;
      colors[p] = jitterColor(150, rand);
      colors[p + 1] = jitterColor(158, rand);
      colors[p + 2] = jitterColor(170, rand);
    } else if (surface < 0.92) {
      const side = rand() < 0.5 ? minZ : maxZ;
      positions[p] = insetX;
      positions[p + 1] = lerp(minY + height * 0.05, maxY - height * 0.08, rand());
      positions[p + 2] = side + (rand() - 0.5) * depth * 0.02;
      colors[p] = jitterColor(134, rand);
      colors[p + 1] = jitterColor(146, rand);
      colors[p + 2] = jitterColor(166, rand);
    } else {
      positions[p] = lerp(minX + width * 0.15, maxX - width * 0.15, rand());
      positions[p + 1] = lerp(minY + height * 0.1, maxY - height * 0.18, rand());
      positions[p + 2] = lerp(minZ + depth * 0.15, maxZ - depth * 0.15, rand());
      colors[p] = jitterColor(90, rand);
      colors[p + 1] = jitterColor(126, rand);
      colors[p + 2] = jitterColor(190, rand);
    }
  }

  return {
    kind: 'holomap-point-cloud',
    positionsB64: Buffer.from(
      positions.buffer,
      positions.byteOffset,
      positions.byteLength
    ).toString('base64'),
    colorsB64: Buffer.from(colors.buffer, colors.byteOffset, colors.byteLength).toString('base64'),
    pointCount: targetPoints,
    bounds: manifest.bounds,
    replayFingerprint: manifest.simulationContract.replayFingerprint,
  };
}
