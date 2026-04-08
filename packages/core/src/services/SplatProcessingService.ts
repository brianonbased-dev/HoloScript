/**
 * Splat Processing Service
 *
 * Handles loading, parsing, and depth-sorting of Gaussian Splatting data.
 * Optimized for real-time rendering in spatial computing environments.
 */

import { Vector3 } from '../types/HoloScriptPlus';

export interface SplatData {
  positions: Float32Array;
  scales: Float32Array;
  rotations: Float32Array;
  colors: Uint8Array;
  count: number;
}

export class SplatProcessingService {
  /**
   * Parses a .splat file (32 bytes per splat)
   * pos: 3*4, scale: 3*4, rot: 4*1(uint8), color: 4*1(uint8) = 12+12+4+4 = 32
   */
  public async parseSplat(buffer: ArrayBuffer): Promise<SplatData> {
    const count = buffer.byteLength / 32;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const colors = new Uint8Array(count * 4);

    const view = new DataView(buffer);
    for (let i = 0; i < count; i++) {
      const offset = i * 32;
      
      // Positions
      positions[i * 3 + 0] = view.getFloat32(offset + 0, true);
      positions[i * 3 + 1] = view.getFloat32(offset + 4, true);
      positions[i * 3 + 2] = view.getFloat32(offset + 8, true);

      // Scales
      scales[i * 3 + 0] = view.getFloat32(offset + 12, true);
      scales[i * 3 + 1] = view.getFloat32(offset + 16, true);
      scales[i * 3 + 2] = view.getFloat32(offset + 20, true);

      // Rotations (uint8 to float)
      rotations[i * 4 + 0] = (view.getUint8(offset + 24) - 128) / 128;
      rotations[i * 4 + 1] = (view.getUint8(offset + 25) - 128) / 128;
      rotations[i * 4 + 2] = (view.getUint8(offset + 26) - 128) / 128;
      rotations[i * 4 + 3] = (view.getUint8(offset + 27) - 128) / 128;

      // Colors
      colors[i * 4 + 0] = view.getUint8(offset + 28);
      colors[i * 4 + 1] = view.getUint8(offset + 29);
      colors[i * 4 + 2] = view.getUint8(offset + 30);
      colors[i * 4 + 3] = view.getUint8(offset + 31);
    }

    return { positions, scales, rotations, colors, count };
  }

  /**
   * Performs quick depth sorting to ensure correct transparency blending.
   * In a full implementation, this should use a GPU-based Radix Sort.
   */
  public sortSplat(data: SplatData, cameraPos: Vector3): Uint32Array {
    const indices = new Uint32Array(data.count);
    const depths = new Float32Array(data.count);

    const cp = Array.isArray(cameraPos) ? cameraPos : [cameraPos.x, cameraPos.y, cameraPos.z];

    for (let i = 0; i < data.count; i++) {
      indices[i] = i;
      // @ts-expect-error
      const dx = data.positions[i * 3 + 0] - cp[0];
      // @ts-expect-error
      const dy = data.positions[i * 3 + 1] - cp[1];
      // @ts-expect-error
      const dz = data.positions[i * 3 + 2] - cp[2];
      depths[i] = dx * dx + dy * dy + dz * dz;
    }

    // Sort far to near
    indices.sort((a, b) => depths[b] - depths[a]);

    return indices;
  }

  /**
   * Casts a ray against the splat data.
   * Simplifies each splat as a sphere with radius based on its scale.
   * Returns index of the first splat hit and the hit distance.
   */
  public intersectRay(data: SplatData, origin: Vector3, direction: Vector3, threshold = 0.5): { index: number; distance: number } | null {
    const o = Array.isArray(origin) ? origin : [origin.x, origin.y, origin.z];
    const d = Array.isArray(direction) ? direction : [direction.x, direction.y, direction.z];
    
    // Normalize direction
    // @ts-expect-error
    const len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    // @ts-expect-error
    const dir = [d[0] / len, d[1] / len, d[2] / len];

    let closestIndex = -1;
    let closestDistance = Infinity;

    for (let i = 0; i < data.count; i++) {
      const px = data.positions[i * 3 + 0];
      const py = data.positions[i * 3 + 1];
      const pz = data.positions[i * 3 + 2];

      const sx = data.scales[i * 3 + 0];
      const sy = data.scales[i * 3 + 1];
      const sz = data.scales[i * 3 + 2];
      const radius = Math.max(sx, sy, sz) * threshold;

      // Ray-Sphere intersection
      // @ts-expect-error
      const vx = px - o[0];
      // @ts-expect-error
      const vy = py - o[1];
      // @ts-expect-error
      const vz = pz - o[2];

      const tca = vx * dir[0] + vy * dir[1] + vz * dir[2];
      if (tca < 0) continue;

      const d2 = (vx * vx + vy * vy + vz * vz) - tca * tca;
      if (d2 > radius * radius) continue;

      const thc = Math.sqrt(radius * radius - d2);
      const t0 = tca - thc;

      if (t0 < closestDistance) {
        closestDistance = t0;
        closestIndex = i;
      }
    }

    return closestIndex !== -1 ? { index: closestIndex, distance: closestDistance } : null;
  }
}
