import { Buffer } from 'node:buffer';
import type { ReconstructionManifest } from '@holoscript/core/reconstruction';

export interface HoloMapScanRenderAsset {
  kind: 'holomap-point-cloud';
  scanKind?: 'room' | 'face';
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

function writePoint(
  positions: Float32Array,
  colors: Uint8Array,
  index: number,
  position: [number, number, number],
  color: [number, number, number]
): void {
  const p = index * 3;
  positions[p] = position[0];
  positions[p + 1] = position[1];
  positions[p + 2] = position[2];
  colors[p] = color[0];
  colors[p + 1] = color[1];
  colors[p + 2] = color[2];
}

function fillFacePreviewCloud(input: {
  positions: Float32Array;
  colors: Uint8Array;
  rand: () => number;
  bounds: ReconstructionManifest['bounds'];
}): void {
  const { positions, colors, rand, bounds } = input;
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const radiusX = Math.max(0.05, (maxX - minX) / 2);
  const radiusY = Math.max(0.05, (maxY - minY) / 2);
  const radiusZ = Math.max(0.03, (maxZ - minZ) / 2);
  const count = positions.length / 3;

  for (let i = 0; i < count; i += 1) {
    const region = rand();

    if (region < 0.1) {
      const side = rand() < 0.5 ? -1 : 1;
      const eyeX = centerX + side * radiusX * lerp(0.24, 0.42, rand());
      const eyeY = centerY + radiusY * lerp(0.14, 0.27, rand());
      const eyeZ = centerZ + radiusZ * lerp(0.7, 0.93, rand());
      writePoint(
        positions,
        colors,
        i,
        [eyeX, eyeY, eyeZ],
        [jitterColor(38, rand), jitterColor(44, rand), jitterColor(55, rand)]
      );
      continue;
    }

    if (region < 0.18) {
      const noseT = rand();
      const noseY = centerY + radiusY * lerp(-0.08, 0.16, noseT);
      const noseWidth = radiusX * lerp(0.04, 0.14, 1 - noseT);
      writePoint(
        positions,
        colors,
        i,
        [centerX + (rand() - 0.5) * noseWidth, noseY, centerZ + radiusZ * lerp(0.72, 1.05, rand())],
        [jitterColor(198, rand), jitterColor(148, rand), jitterColor(124, rand)]
      );
      continue;
    }

    if (region < 0.25) {
      const mouthX = centerX + radiusX * lerp(-0.24, 0.24, rand());
      const mouthY = centerY - radiusY * lerp(0.26, 0.36, rand());
      const mouthZ = centerZ + radiusZ * lerp(0.68, 0.86, rand());
      writePoint(
        positions,
        colors,
        i,
        [mouthX, mouthY, mouthZ],
        [jitterColor(148, rand), jitterColor(62, rand), jitterColor(72, rand)]
      );
      continue;
    }

    const theta = rand() * Math.PI * 2;
    const yNorm = lerp(-0.92, 0.96, rand());
    const radiusAtY = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
    const surfaceJitter = lerp(0.92, 1.03, rand());
    const x = centerX + Math.cos(theta) * radiusX * radiusAtY * surfaceJitter;
    const y = centerY + yNorm * radiusY;
    const z = centerZ + Math.sin(theta) * radiusZ * radiusAtY * surfaceJitter;
    const hair = yNorm > 0.64 && Math.sin(theta) < 0.3;
    writePoint(
      positions,
      colors,
      i,
      [x, y, z],
      hair
        ? [jitterColor(46, rand), jitterColor(38, rand), jitterColor(34, rand)]
        : [jitterColor(205, rand), jitterColor(160, rand), jitterColor(134, rand)]
    );
  }
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
  scanKind?: 'room' | 'face';
}): HoloMapScanRenderAsset {
  const { manifest } = input;
  const scanKind = input.scanKind === 'face' ? 'face' : 'room';
  const targetPoints = Math.min(20_000, Math.max(0, Math.floor(manifest.pointCount)));
  const positions = new Float32Array(targetPoints * 3);
  const colors = new Uint8Array(targetPoints * 3);
  const rand = mulberry32(hash32(`${input.token}:${input.videoHash}:${manifest.replayHash}`));

  const [minX, minY, minZ] = manifest.bounds.min;
  const [maxX, maxY, maxZ] = manifest.bounds.max;
  const width = Math.max(0.01, maxX - minX);
  const height = Math.max(0.01, maxY - minY);
  const depth = Math.max(0.01, maxZ - minZ);

  if (scanKind === 'face') {
    fillFacePreviewCloud({ positions, colors, rand, bounds: manifest.bounds });
  } else {
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
  }

  return {
    kind: 'holomap-point-cloud',
    scanKind,
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
