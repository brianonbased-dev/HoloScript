import type { Vector3 } from '../types';
import type { DetectedPlane, PlaneClassification } from '../traits/PlaneDetectionTrait';

/**
 * PlaneAnchorExtractor — derive horizontal/vertical plane ANCHORS from a captured point cloud.
 *
 * `PlaneDetectionTrait` is a CONSUMER: it filters/classifies/hit-tests `plane_detected` events that a
 * live AR runtime (ARCore/ARKit/OpenXR) feeds it. A reconstructed twin (3DGS / depth-init cloud) has no
 * live runtime — it is static geometry. This module closes that gap: it fits planes to the cloud
 * (RANSAC → coplanar merge → PCA refine), classifies each as horizontal (floor/ceiling/table) or
 * vertical (wall), and emits anchors in the trait's own `DetectedPlane` schema. Those anchors are what a
 * remix-geometry overlay snaps to so placed content aligns to the real captured surfaces.
 *
 * Up-axis is DETECTED from the data, not assumed to be +Y. A handheld capture whose world frame is
 * anchored to the phone's initial (possibly rotated) pose is not gravity-aligned — the same reason the
 * raw frames come out sideways. The extractor finds the room's own up (the normal direction shared by
 * the most horizontal-surface inliers) and classifies horizontal/vertical relative to that, so anchors
 * are correct regardless of capture tilt.
 *
 * Native, not pretrained: the output is DATA the existing `PlaneDetectionTrait` seam consumes
 * (`plane_detected` events via {@link toPlaneDetectedEvents}), not a parallel imperative anchor system.
 * Deterministic — all randomness comes from a seeded RNG so the anchor set is reproducible/assertable.
 */

/** A captured cloud in world space. Accepts typed or plain arrays. */
export interface PointCloud {
  N: number;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  z: ArrayLike<number>;
}

export interface ExtractPlaneAnchorsOpts {
  /** Inlier band half-width, world units (m). Points within this of a candidate plane are inliers. */
  distThreshold?: number;
  /** Minimum inliers for a plane to count. Default max(150, 0.5% of N). */
  minInliers?: number;
  /** Stop after this many raw planes (before merge). Default 12. */
  maxPlanes?: number;
  /** RANSAC hypotheses per plane slot. Default 600. */
  ransacIters?: number;
  /** |dot(normal, up)| ≥ this ⇒ horizontal (floor/ceiling/table). Default 0.80. */
  horizontalDot?: number;
  /** |dot(normal, up)| ≤ this ⇒ vertical (wall). Default 0.40. */
  verticalDot?: number;
  /** Floor↔ceiling must be at least this far apart (m) for a ceiling to be labelled. Default 1.2. */
  minRoomHeight?: number;
  /** Deterministic RNG seed. Default 1. */
  seed?: number;
}

/** A DetectedPlane plus the explicit horizontal/vertical split the overlay asked for. */
export interface PlaneAnchor extends DetectedPlane {
  orientation: 'horizontal' | 'vertical' | 'slanted';
  inlierCount: number;
}

const seededRng = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
};

const sub = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vector3): number => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vector3): Vector3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const neg = (a: Vector3): Vector3 => [-a[0], -a[1], -a[2]];
const pointAt = (c: PointCloud, i: number): Vector3 => [c.x[i], c.y[i], c.z[i]];

/** Cyclic Jacobi eigensolver for a symmetric 3×3 (row-major 9). Eigenvalues ascending with matching
 *  column eigenvectors — used to refine a plane normal (min-variance direction) and build a tight,
 *  spread-aligned in-plane basis (the two larger-variance directions). */
function jacobiEigen3(m: number[]): { values: number[]; vectors: Vector3[] } {
  const a = m.slice();
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const pairs: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  for (let iter = 0; iter < 50; iter++) {
    let p = 0,
      q = 1,
      mx = 0;
    for (const [i, j] of pairs) {
      const av = Math.abs(a[i * 3 + j]);
      if (av > mx) {
        mx = av;
        p = i;
        q = j;
      }
    }
    if (mx < 1e-14) break;
    const app = a[p * 3 + p],
      aqq = a[q * 3 + q],
      apq = a[p * 3 + q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app),
      c = Math.cos(phi),
      s = Math.sin(phi);
    for (let k = 0; k < 3; k++) {
      const akp = a[k * 3 + p],
        akq = a[k * 3 + q];
      a[k * 3 + p] = c * akp - s * akq;
      a[k * 3 + q] = s * akp + c * akq;
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p * 3 + k],
        aqk = a[q * 3 + k];
      a[p * 3 + k] = c * apk - s * aqk;
      a[q * 3 + k] = s * apk + c * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k * 3 + p],
        vkq = v[k * 3 + q];
      v[k * 3 + p] = c * vkp - s * vkq;
      v[k * 3 + q] = s * vkp + c * vkq;
    }
  }
  const values = [a[0], a[4], a[8]];
  const vectors: Vector3[] = [
    [v[0], v[3], v[6]],
    [v[1], v[4], v[7]],
    [v[2], v[5], v[8]],
  ];
  const order = [0, 1, 2].sort((i, j) => values[i] - values[j]);
  return { values: order.map((i) => values[i]), vectors: order.map((i) => vectors[i]) };
}

interface RawPlane {
  normal: Vector3;
  centroid: Vector3;
  u: Vector3;
  v: Vector3;
  inliers: number[];
}

/** PCA-fit a plane to a set of point indices: centroid + min-variance normal + spread-aligned basis. */
function fitPlane(cloud: PointCloud, inliers: number[]): RawPlane {
  let cx = 0,
    cy = 0,
    cz = 0;
  for (const idx of inliers) {
    cx += cloud.x[idx];
    cy += cloud.y[idx];
    cz += cloud.z[idx];
  }
  const n = inliers.length,
    centroid: Vector3 = [cx / n, cy / n, cz / n];
  let c00 = 0,
    c01 = 0,
    c02 = 0,
    c11 = 0,
    c12 = 0,
    c22 = 0;
  for (const idx of inliers) {
    const dx = cloud.x[idx] - centroid[0],
      dy = cloud.y[idx] - centroid[1],
      dz = cloud.z[idx] - centroid[2];
    c00 += dx * dx;
    c01 += dx * dy;
    c02 += dx * dz;
    c11 += dy * dy;
    c12 += dy * dz;
    c22 += dz * dz;
  }
  const { vectors } = jacobiEigen3([c00, c01, c02, c01, c11, c12, c02, c12, c22]);
  return {
    normal: normalize(vectors[0]),
    u: normalize(vectors[2]),
    v: normalize(vectors[1]),
    centroid,
    inliers,
  };
}

/** Spread-aligned bbox on the plane, trimmed to the 2–98th projection percentiles so a few stray
 *  inliers don't inflate the extent. Returns width/height + 4 world-space corner vertices. */
function planeExtent(
  cloud: PointCloud,
  p: RawPlane
): { width: number; height: number; center: Vector3; vertices: Array<[number, number, number]> } {
  const pu: number[] = [],
    pv: number[] = [];
  for (const idx of p.inliers) {
    const rel: Vector3 = [
      cloud.x[idx] - p.centroid[0],
      cloud.y[idx] - p.centroid[1],
      cloud.z[idx] - p.centroid[2],
    ];
    pu.push(dot(rel, p.u));
    pv.push(dot(rel, p.v));
  }
  pu.sort((a, b) => a - b);
  pv.sort((a, b) => a - b);
  const lo = (arr: number[]) => arr[Math.floor(0.05 * (arr.length - 1))];
  const hi = (arr: number[]) => arr[Math.floor(0.95 * (arr.length - 1))];
  const uMin = lo(pu),
    uMax = hi(pu),
    vMin = lo(pv),
    vMax = hi(pv);
  const width = uMax - uMin,
    height = vMax - vMin,
    uc = (uMin + uMax) / 2,
    vc = (vMin + vMax) / 2;
  const center: Vector3 = [
    p.centroid[0] + p.u[0] * uc + p.v[0] * vc,
    p.centroid[1] + p.u[1] * uc + p.v[1] * vc,
    p.centroid[2] + p.u[2] * uc + p.v[2] * vc,
  ];
  const hw = width / 2,
    hh = height / 2;
  const corner = (su: number, sv: number): [number, number, number] => [
    center[0] + p.u[0] * su + p.v[0] * sv,
    center[1] + p.u[1] * su + p.v[1] * sv,
    center[2] + p.u[2] * su + p.v[2] * sv,
  ];
  return {
    width,
    height,
    center,
    vertices: [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)],
  };
}

/**
 * Extract horizontal/vertical plane anchors from a captured cloud. RANSAC-fits dominant planes, merges
 * coplanar duplicates, detects the room's up-axis, classifies each plane, and returns anchors (largest
 * area first) in the `DetectedPlane` schema.
 */
export function extractPlaneAnchors(
  cloud: PointCloud,
  opts: ExtractPlaneAnchorsOpts = {}
): PlaneAnchor[] {
  const N = cloud.N;
  const distThreshold = opts.distThreshold ?? 0.04;
  const minInliers = opts.minInliers ?? Math.max(150, Math.floor(0.005 * N));
  const maxPlanes = opts.maxPlanes ?? 12;
  const ransacIters = opts.ransacIters ?? 600;
  const horizontalDot = opts.horizontalDot ?? 0.8;
  const verticalDot = opts.verticalDot ?? 0.4;
  const minRoomHeight = opts.minRoomHeight ?? 1.2;
  const rng = seededRng(opts.seed ?? 1);

  // --- Phase 1: RANSAC-extract dominant planes (orientation-agnostic) ---
  let remaining: number[] = Array.from({ length: N }, (_, i) => i);
  const raw: RawPlane[] = [];
  for (let slot = 0; slot < maxPlanes && remaining.length >= minInliers; slot++) {
    let bestN: Vector3 | null = null,
      bestD = 0,
      bestCount = 0;
    for (let it = 0; it < ransacIters; it++) {
      const i0 = remaining[(rng() * remaining.length) | 0],
        i1 = remaining[(rng() * remaining.length) | 0],
        i2 = remaining[(rng() * remaining.length) | 0];
      if (i0 === i1 || i1 === i2 || i0 === i2) continue;
      const p0 = pointAt(cloud, i0);
      const nc = cross(sub(pointAt(cloud, i1), p0), sub(pointAt(cloud, i2), p0)),
        l = len(nc);
      if (l < 1e-9) continue;
      const n: Vector3 = [nc[0] / l, nc[1] / l, nc[2] / l],
        d = -dot(n, p0);
      let count = 0;
      for (let r = 0; r < remaining.length; r++) {
        const idx = remaining[r];
        if (
          Math.abs(n[0] * cloud.x[idx] + n[1] * cloud.y[idx] + n[2] * cloud.z[idx] + d) <
          distThreshold
        )
          count++;
      }
      if (count > bestCount) {
        bestCount = count;
        bestN = n;
        bestD = d;
      }
    }
    if (!bestN || bestCount < minInliers) break;
    const inliers: number[] = [],
      rest: number[] = [];
    for (const idx of remaining) {
      if (
        Math.abs(
          bestN[0] * cloud.x[idx] + bestN[1] * cloud.y[idx] + bestN[2] * cloud.z[idx] + bestD
        ) < distThreshold
      )
        inliers.push(idx);
      else rest.push(idx);
    }
    raw.push(fitPlane(cloud, inliers));
    remaining = rest;
  }
  if (raw.length === 0) return [];

  // --- Phase 2: iteratively merge near-coplanar planes (parallel + small offset), REFITTING each round
  //     so duplicate slabs of one wall/floor collapse into a single anchor (a single pass with stale
  //     centroids misses slabs a few cm apart — the duplicate-wall bug) ---
  const cosMerge = Math.cos((15 * Math.PI) / 180),
    offMerge = Math.max(0.15, distThreshold * 3);
  let groups: number[][] = raw.map((p) => p.inliers.slice());
  for (let pass = 0; pass < 8; pass++) {
    const fits = groups.map((g) => fitPlane(cloud, g));
    let mergedAny = false;
    outer: for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        if (
          Math.abs(dot(fits[i].normal, fits[j].normal)) >= cosMerge &&
          Math.abs(dot(fits[i].normal, sub(fits[j].centroid, fits[i].centroid))) < offMerge
        ) {
          groups[i] = groups[i].concat(groups[j]);
          groups.splice(j, 1);
          mergedAny = true;
          break outer;
        }
      }
    if (!mergedAny) break;
  }
  const planes = groups
    .map((g) => fitPlane(cloud, g))
    .filter((p) => p.inliers.length >= minInliers);

  // --- Phase 3: detect the room's up-axis = the normal direction shared by the most horizontal inliers,
  //     biased toward gravity. ARCore captures are gravity-aligned, so the floor's normal is the most
  //     Y-aligned of the large planes. Weighting the shared-inlier vote by |normal·Y| stops a dominant
  //     WALL cluster (e.g. a big kitchen wall the user faced) from being mistaken for "up" — the failure
  //     that mislabeled a Z-facing wall as the floor on a wall-heavy capture. Still tolerates real tilt
  //     (a 25°-tilted floor has |normal.y|≈0.9, far above any wall's ≈0). ---
  const GY: Vector3 = [0, 1, 0];
  let up: Vector3 = [0, 1, 0],
    bestScore = -1;
  for (const p of planes) {
    let shared = 0;
    for (const q of planes)
      if (Math.abs(dot(p.normal, q.normal)) >= horizontalDot) shared += q.inliers.length;
    const score = shared * Math.abs(dot(p.normal, GY));
    if (score > bestScore) {
      bestScore = score;
      up = p.normal;
    }
  }
  // refine to the inlier-weighted consensus of all surfaces parallel to the candidate (robust gravity —
  // averages out per-patch noise so walls read perpendicular and counters read parallel)
  {
    let ax = 0,
      ay = 0,
      az = 0;
    for (const p of planes) {
      const d = dot(p.normal, up);
      if (Math.abs(d) >= horizontalDot) {
        const s = d >= 0 ? 1 : -1,
          w = p.inliers.length;
        ax += s * p.normal[0] * w;
        ay += s * p.normal[1] * w;
        az += s * p.normal[2] * w;
      }
    }
    if (ax || ay || az) up = normalize([ax, ay, az]);
  }
  // orient up so the room sits on its +up side, measured from the largest horizontal (the floor)
  const horizontals = planes.filter((p) => Math.abs(dot(p.normal, up)) >= horizontalDot);
  const floorPlane = horizontals.reduce(
    (a, b) => (b.inliers.length > a.inliers.length ? b : a),
    horizontals[0] ?? planes[0]
  );
  let sx = 0,
    sy = 0,
    sz = 0;
  for (let i = 0; i < N; i++) {
    sx += cloud.x[i];
    sy += cloud.y[i];
    sz += cloud.z[i];
  }
  const sceneC: Vector3 = [sx / N, sy / N, sz / N];
  if (floorPlane && dot(up, sub(sceneC, floorPlane.centroid)) < 0) up = neg(up);
  const floorH = floorPlane ? dot(floorPlane.centroid, up) : 0;
  const ceilingH = horizontals.length
    ? Math.max(...horizontals.map((p) => dot(p.centroid, up)))
    : floorH;

  // --- Phase 4: classify, orient normals, compute extents → anchors ---
  const anchors: PlaneAnchor[] = planes.map((p, i) => {
    const nd = dot(p.normal, up),
      ndAbs = Math.abs(nd);
    let orientation: PlaneAnchor['orientation'], classification: PlaneClassification;
    let normal = p.normal;
    const h = dot(p.centroid, up);
    if (ndAbs >= horizontalDot) {
      orientation = 'horizontal';
      if (p === floorPlane)
        classification = 'floor'; // exactly one ground plane (the dominant horizontal)
      else if (h >= ceilingH - 0.3 && ceilingH - floorH > minRoomHeight) classification = 'ceiling';
      else classification = 'table';
      const want = classification === 'ceiling' ? -1 : 1; // floor/table face up, ceiling faces down
      if (Math.sign(nd) !== want) normal = neg(normal);
    } else if (ndAbs <= verticalDot) {
      orientation = 'vertical';
      classification = 'wall';
      if (dot(normal, sub(sceneC, p.centroid)) < 0) normal = neg(normal); // wall faces inward
    } else {
      orientation = 'slanted';
      classification = 'unknown';
    }
    const ext = planeExtent(cloud, p);
    return {
      id: `anchor_${i}_${classification}`,
      classification,
      orientation,
      center: ext.center,
      extent: { width: ext.width, height: ext.height },
      normal,
      vertices: ext.vertices,
      area: ext.width * ext.height,
      lastUpdated: 0,
      confidence: Math.min(1, p.inliers.length / Math.max(1, minInliers * 3)),
      inlierCount: p.inliers.length,
    };
  });

  anchors.sort((a, b) => b.area - a.area);
  // re-id after sort so ids are stable & ordered
  anchors.forEach((a, i) => {
    a.id = `anchor_${i}_${a.classification}`;
  });
  return anchors;
}

/** Bridge to the existing seam: turn anchors into the `plane_detected` events that
 *  `PlaneDetectionTrait.onEvent` consumes, so a remix overlay node anchors to them with zero new anchor
 *  machinery. (PlaneAnchor extends DetectedPlane, so each anchor IS a valid `plane`.) */
export function toPlaneDetectedEvents(
  anchors: PlaneAnchor[]
): Array<{ type: 'plane_detected'; plane: DetectedPlane }> {
  return anchors.map((a) => ({ type: 'plane_detected', plane: a }));
}
