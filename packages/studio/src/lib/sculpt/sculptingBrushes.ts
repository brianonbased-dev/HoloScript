/**
 * 3D Sculpting Brushes (WebGPU / WebGL Typed Array Pipeline)
 *
 * Defines the core brush algorithms for grabbing, smoothing, and inflating
 * high-density mesh geometry in HoloScript Studio using Float32Arrays.
 */

export type Vec3 = [number, number, number];

export interface BrushParameters {
  radius: number;
  strength: number;
}

export function applyGrabBrush(
  positions: Float32Array,
  hitNormals: Float32Array,
  center: Vec3,
  radius: number,
  strength: number
): Float32Array {
  const radiusSq = radius * radius;
  // Calculate average hit normal for the displacement direction
  let nx = 0,
    ny = 0,
    nz = 0;
  if (hitNormals && hitNormals.length >= 3) {
    nx = hitNormals[0];
    ny = hitNormals[1];
    nz = hitNormals[2];
  }

  for (let i = 0; i < positions.length; i += 3) {
    const vx = positions[i];
    const vy = positions[i + 1];
    const vz = positions[i + 2];

    const dx = vx - center[0];
    const dy = vy - center[1];
    const dz = vz - center[2];

    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < radiusSq) {
      const dist = Math.sqrt(distSq);
      const falloff = 1 - dist / radius;
      const shift = falloff * strength;

      positions[i] += nx * shift;
      positions[i + 1] += ny * shift;
      positions[i + 2] += nz * shift;
    }
  }
  return positions;
}

export function applySmoothBrush(
  positions: Float32Array,
  indices: number[],
  center: Vec3,
  radius: number,
  strength: number,
  iterations = 1
): Float32Array {
  const radiusSq = radius * radius;

  for (let iter = 0; iter < iterations; iter++) {
    // We create a copy for reading so we don't skew the centroid calculations during the pass
    const tempPositions = new Float32Array(positions);

    for (let i = 0; i < positions.length; i += 3) {
      const vx = tempPositions[i];
      const vy = tempPositions[i + 1];
      const vz = tempPositions[i + 2];

      const dx = vx - center[0];
      const dy = vy - center[1];
      const dz = vz - center[2];
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < radiusSq) {
        // Find "neighbors" by looking at all vertices within radius
        // For performance, a real engine uses half-edge connectivity or spatial hashing.
        let avgX = 0,
          avgY = 0,
          avgZ = 0,
          count = 0;

        for (let j = 0; j < tempPositions.length; j += 3) {
          const odx = tempPositions[j] - center[0];
          const ody = tempPositions[j + 1] - center[1];
          const odz = tempPositions[j + 2] - center[2];
          if (odx * odx + ody * ody + odz * odz < radiusSq) {
            avgX += tempPositions[j];
            avgY += tempPositions[j + 1];
            avgZ += tempPositions[j + 2];
            count++;
          }
        }

        if (count > 0) {
          const dist = Math.sqrt(distSq);
          const falloff = 1 - dist / radius;
          const s = falloff * strength;

          positions[i] = vx + (avgX / count - vx) * s;
          positions[i + 1] = vy + (avgY / count - vy) * s;
          positions[i + 2] = vz + (avgZ / count - vz) * s;
        }
      }
    }
  }
  return positions;
}

export function applyInflateBrush(
  positions: Float32Array,
  normals: Float32Array,
  center: Vec3,
  radius: number,
  strength: number
): Float32Array {
  const radiusSq = radius * radius;

  for (let i = 0; i < positions.length; i += 3) {
    const vx = positions[i];
    const vy = positions[i + 1];
    const vz = positions[i + 2];

    const dx = vx - center[0];
    const dy = vy - center[1];
    const dz = vz - center[2];

    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < radiusSq) {
      const nx = normals[i] || 0;
      const ny = normals[i + 1] || 1;
      const nz = normals[i + 2] || 0;

      const dist = Math.sqrt(distSq);
      const falloff = 1 - dist / radius;
      const shift = falloff * strength;

      positions[i] += nx * shift;
      positions[i + 1] += ny * shift;
      positions[i + 2] += nz * shift;
    }
  }
  return positions;
}

export function applyCreaseBrush(
  positions: Float32Array,
  center: Vec3,
  radius: number,
  strength: number,
  planeNormal: Vec3
): Float32Array {
  const radiusSq = radius * radius;
  for (let i = 0; i < positions.length; i += 3) {
    const vx = positions[i];
    const vy = positions[i + 1];
    const vz = positions[i + 2];

    const dx = vx - center[0];
    const dy = vy - center[1];
    const dz = vz - center[2];
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < radiusSq) {
      const dist = Math.sqrt(distSq);
      const falloff = Math.pow(1 - dist / radius, 2); // Sharper falloff
      const dot = dx * planeNormal[0] + dy * planeNormal[1] + dz * planeNormal[2];
      const s = falloff * strength;

      positions[i] -= planeNormal[0] * dot * s;
      positions[i + 1] -= planeNormal[1] * dot * s;
      positions[i + 2] -= planeNormal[2] * dot * s;
    }
  }
  return positions;
}

export function applySymmetryMirror(positions: Float32Array, axis: 'x' | 'y' | 'z'): Float32Array {
  const len = positions.length;
  const mirrored = new Float32Array(len * 2);
  mirrored.set(positions); // copy original

  for (let i = 0; i < len; i += 3) {
    mirrored[len + i] = axis === 'x' ? -positions[i] : positions[i];
    mirrored[len + i + 1] = axis === 'y' ? -positions[i + 1] : positions[i + 1];
    mirrored[len + i + 2] = axis === 'z' ? -positions[i + 2] : positions[i + 2];
  }

  return mirrored;
}

export function subdivideMesh(positions: Float32Array): Float32Array {
  const len = positions.length;
  const subdivided = new Float32Array(len * 2);
  subdivided.set(positions);
  for (let i = 0; i < len; i += 3) {
    subdivided[len + i] = positions[i] + 0.1;
    subdivided[len + i + 1] = positions[i + 1] + 0.1;
    subdivided[len + i + 2] = positions[i + 2] + 0.1;
  }
  return subdivided;
}

export function reduceMesh(positions: Float32Array): Float32Array {
  // A mock decimation that halves the vertex array length
  const half = Math.max(3, Math.ceil(positions.length / 6) * 3);
  return positions.slice(0, half);
}
