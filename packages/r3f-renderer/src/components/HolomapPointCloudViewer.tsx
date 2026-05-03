import { useMemo } from 'react';
import * as THREE from 'three';

export interface HolomapPointCloudViewerProps {
  /** Base64 little-endian Float32 xyz triples. */
  positionsB64: string;
  /** Base64 uint8 rgb triples. */
  colorsB64: string;
  pointCount: number;
  maxPoints?: number;
  pointSize?: number;
  opacity?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
}

export interface DecodedHolomapPointCloud {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.trim();
  if (!normalized) return new Uint8Array(0);
  const binary = globalThis.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeFloat32Le(bytes: Uint8Array, count: number): Float32Array {
  const floats = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readable = Math.min(count, Math.floor(bytes.byteLength / 4));
  for (let i = 0; i < readable; i += 1) {
    floats[i] = view.getFloat32(i * 4, true);
  }
  return floats;
}

export function decodeHolomapPointCloudPayload(input: {
  positionsB64: string;
  colorsB64: string;
  pointCount: number;
  maxPoints?: number;
}): DecodedHolomapPointCloud {
  const positionsBytes = base64ToBytes(input.positionsB64);
  const colorsBytes = base64ToBytes(input.colorsB64);
  const requestedCount = Math.max(0, Math.floor(input.pointCount));
  const cappedCount =
    input.maxPoints !== undefined
      ? Math.min(requestedCount, Math.max(0, Math.floor(input.maxPoints)))
      : requestedCount;
  const readableCount = Math.min(
    cappedCount,
    Math.floor(positionsBytes.byteLength / 12),
    Math.floor(colorsBytes.byteLength / 3)
  );

  const positions = decodeFloat32Le(positionsBytes, readableCount * 3);
  const colors = new Float32Array(readableCount * 3);
  for (let i = 0; i < readableCount * 3; i += 1) {
    colors[i] = colorsBytes[i] / 255;
  }

  return { positions, colors, count: readableCount };
}

export function HolomapPointCloudViewer({
  positionsB64,
  colorsB64,
  pointCount,
  maxPoints,
  pointSize = 0.025,
  opacity = 0.95,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
}: HolomapPointCloudViewerProps) {
  const cloud = useMemo(() => {
    try {
      return decodeHolomapPointCloudPayload({ positionsB64, colorsB64, pointCount, maxPoints });
    } catch {
      return {
        positions: new Float32Array(0),
        colors: new Float32Array(0),
        count: 0,
      };
    }
  }, [positionsB64, colorsB64, pointCount, maxPoints]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cloud.colors, 3));
    g.computeBoundingSphere();
    return g;
  }, [cloud]);

  if (cloud.count < 1) return null;

  return (
    <points
      geometry={geometry}
      position={position}
      rotation={rotation}
      scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
      frustumCulled={false}
    >
      <pointsMaterial
        vertexColors
        transparent={opacity < 1}
        opacity={opacity}
        size={pointSize}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
