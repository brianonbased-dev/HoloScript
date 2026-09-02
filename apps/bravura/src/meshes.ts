/**
 * meshes.ts — procedural geometry for the black room. Everything is a
 * surface of revolution (lathe), a sphere, or a quad; normals analytic.
 */

export interface MeshData {
  positions: number[];
  normals: number[];
  indices: number[];
}

/**
 * Surface of revolution around Y. `profile` is [radius, y] pairs from
 * bottom to top; per-ring normals come from the profile tangent.
 */
export function lathe(profile: [number, number][], segments = 48): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const n = profile.length;

  // 2D outward normals from profile tangents.
  const n2: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = profile[Math.max(0, i - 1)];
    const b = profile[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    n2.push([ty / l, -tx / l]);
  }

  for (let i = 0; i < n; i++) {
    const [r, y] = profile[i];
    for (let s = 0; s <= segments; s++) {
      const th = (s / segments) * Math.PI * 2;
      const c = Math.cos(th);
      const si = Math.sin(th);
      positions.push(r * c, y, r * si);
      normals.push(n2[i][0] * c, n2[i][1], n2[i][0] * si);
    }
  }
  const ring = segments + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = i * ring + s;
      const b = a + ring;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { positions, normals, indices };
}

export function sphere(radius = 1, lat = 12, lon = 16): MeshData {
  const profile: [number, number][] = [];
  for (let i = 0; i <= lat; i++) {
    const phi = (i / lat) * Math.PI;
    profile.push([Math.sin(phi) * radius, -Math.cos(phi) * radius]);
  }
  return lathe(profile, lon);
}

export function cylinder(rBottom: number, rTop: number, height: number, segments = 24): MeshData {
  return lathe(
    [
      [rBottom, 0],
      [rTop, height],
    ],
    segments
  );
}

/** Flat disc at y=0 facing up (slight dome via `domeHeight`). */
export function disc(radius: number, domeHeight = 0, rings = 8, segments = 48): MeshData {
  const profile: [number, number][] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    profile.push([t * radius, domeHeight * (1 - t * t)]);
  }
  // Reverse so normals face up (lathe normals face outward of the profile walk).
  profile.reverse();
  return lathe(profile, segments);
}

/** Unit XY quad centred at origin, +Z normal (for the HUD panel). */
export function quad(): MeshData {
  return {
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  };
}
