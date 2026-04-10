/**
 * PBDSolver.ts
 *
 * GPU Position-Based Dynamics solver using WebGPU compute shaders.
 * Implements soft-body physics with distance, volume, bending, collision,
 * and attachment constraints solved in parallel via graph coloring.
 *
 * Pipeline per frame:
 *   [1] Apply external forces (gravity, wind)
 *   [2] Predict new positions (Euler integration)
 *   [3] Solve constraints (parallel Gauss-Seidel, N iterations)
 *       ├─ Distance constraints (edges maintain rest length)
 *       ├─ Volume constraints (tetrahedra maintain rest volume)
 *       ├─ Bending constraints (adjacent triangles resist folding)
 *       ├─ Collision constraints (SDF-based penetration resolution)
 *       └─ Attachment constraints (pinned vertices stay fixed)
 *   [4] Update velocities from position delta
 *   [5] Apply damping
 *   [6] Recompute normals
 *
 * @module physics
 */

import type {
  IVector3,
  ISoftBodyConfig,
  ISoftBodyState,
  ISDFCollider,
  IPBDDistanceConstraint,
  IPBDVolumeConstraint,
  IPBDBendingConstraint,
  IPBDAttachmentConstraint,
  IConstraintColoring,
  SoftBodyPreset,
  SOFT_BODY_PRESETS as _SOFT_BODY_PRESETS,
} from './PhysicsTypes';

// =============================================================================
// WGSL Compute Shaders
// =============================================================================

/**
 * WGSL: Apply external forces and predict positions via semi-implicit Euler
 */
export const PBD_PREDICT_SHADER = /* wgsl */ `
struct SimParams {
  gravity: vec3f,
  dt: f32,
  wind: vec3f,
  damping: f32,
  numVertices: u32,
  padding: vec3u,
}

@group(0) @binding(0) var<storage, read_write> positions: array<f32>;
@group(0) @binding(1) var<storage, read_write> velocities: array<f32>;
@group(0) @binding(2) var<storage, read_write> predicted: array<f32>;
@group(0) @binding(3) var<storage, read> masses: array<f32>;
@group(0) @binding(4) var<uniform> params: SimParams;

@compute @workgroup_size(256)
fn cs_predict(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.numVertices) { return; }

  let mass = masses[idx];
  let i3 = idx * 3u;

  // Load current position and velocity
  var pos = vec3f(positions[i3], positions[i3 + 1u], positions[i3 + 2u]);
  var vel = vec3f(velocities[i3], velocities[i3 + 1u], velocities[i3 + 2u]);

  // Skip pinned vertices (mass == 0)
  if (mass > 0.0) {
    // Apply gravity
    vel += params.gravity * params.dt;

    // Apply wind (simple drag model)
    vel += params.wind * params.dt / mass;

    // Apply damping
    vel *= params.damping;

    // Predict position
    pos += vel * params.dt;
  }

  // Store predicted position
  predicted[i3]      = pos.x;
  predicted[i3 + 1u] = pos.y;
  predicted[i3 + 2u] = pos.z;
}
`;

/**
 * WGSL: Solve distance constraints (one color group at a time)
 */
export const PBD_DISTANCE_SHADER = /* wgsl */ `
struct DistanceConstraint {
  vertexA: u32,
  vertexB: u32,
  restLength: f32,
  compliance: f32,
}

struct SolveParams {
  dt: f32,
  numConstraints: u32,
  iteration: u32,
  padding: u32,
}

@group(0) @binding(0) var<storage, read_write> predicted: array<f32>;
@group(0) @binding(1) var<storage, read> masses: array<f32>;
@group(0) @binding(2) var<storage, read> constraints: array<DistanceConstraint>;
@group(0) @binding(3) var<uniform> params: SolveParams;

@compute @workgroup_size(256)
fn cs_solve_distance(@builtin(global_invocation_id) gid: vec3u) {
  let cIdx = gid.x;
  if (cIdx >= params.numConstraints) { return; }

  let c = constraints[cIdx];
  let iA = c.vertexA * 3u;
  let iB = c.vertexB * 3u;

  let pA = vec3f(predicted[iA], predicted[iA + 1u], predicted[iA + 2u]);
  let pB = vec3f(predicted[iB], predicted[iB + 1u], predicted[iB + 2u]);

  let diff = pB - pA;
  let dist = length(diff);

  if (dist < 1e-7) { return; }

  let wA = masses[c.vertexA];
  let wB = masses[c.vertexB];
  let invMassA = select(1.0 / wA, 0.0, wA <= 0.0);
  let invMassB = select(1.0 / wB, 0.0, wB <= 0.0);
  let wSum = invMassA + invMassB;

  if (wSum < 1e-7) { return; }

  // XPBD: compliance scaled by dt²
  let alpha = c.compliance / (params.dt * params.dt);
  let C = dist - c.restLength;
  let lambda = -C / (wSum + alpha);

  let correction = (diff / dist) * lambda;

  // Apply corrections
  if (invMassA > 0.0) {
    predicted[iA]      -= correction.x * invMassA;
    predicted[iA + 1u] -= correction.y * invMassA;
    predicted[iA + 2u] -= correction.z * invMassA;
  }
  if (invMassB > 0.0) {
    predicted[iB]      += correction.x * invMassB;
    predicted[iB + 1u] += correction.y * invMassB;
    predicted[iB + 2u] += correction.z * invMassB;
  }
}
`;

/**
 * WGSL: Solve volume constraints (one tetrahedron at a time)
 */
export const PBD_VOLUME_SHADER = /* wgsl */ `
struct VolumeConstraint {
  v0: u32,
  v1: u32,
  v2: u32,
  v3: u32,
  restVolume: f32,
  compliance: f32,
  padding: vec2u,
}

struct SolveParams {
  dt: f32,
  numConstraints: u32,
  iteration: u32,
  padding: u32,
}

@group(0) @binding(0) var<storage, read_write> predicted: array<f32>;
@group(0) @binding(1) var<storage, read> masses: array<f32>;
@group(0) @binding(2) var<storage, read> constraints: array<VolumeConstraint>;
@group(0) @binding(3) var<uniform> params: SolveParams;

fn loadPos(idx: u32) -> vec3f {
  let i = idx * 3u;
  return vec3f(predicted[i], predicted[i + 1u], predicted[i + 2u]);
}

fn storePos(idx: u32, p: vec3f) {
  let i = idx * 3u;
  predicted[i]      = p.x;
  predicted[i + 1u] = p.y;
  predicted[i + 2u] = p.z;
}

@compute @workgroup_size(64)
fn cs_solve_volume(@builtin(global_invocation_id) gid: vec3u) {
  let cIdx = gid.x;
  if (cIdx >= params.numConstraints) { return; }

  let c = constraints[cIdx];
  let p0 = loadPos(c.v0);
  let p1 = loadPos(c.v1);
  let p2 = loadPos(c.v2);
  let p3 = loadPos(c.v3);

  // Signed volume of tetrahedron = dot(p1-p0, cross(p2-p0, p3-p0)) / 6
  let d1 = p1 - p0;
  let d2 = p2 - p0;
  let d3 = p3 - p0;
  let volume = dot(d1, cross(d2, d3)) / 6.0;

  let C = volume - c.restVolume;
  if (abs(C) < 1e-7) { return; }

  // Gradients of volume w.r.t. each vertex
  let g1 = cross(d2, d3) / 6.0;
  let g2 = cross(d3, d1) / 6.0;
  let g3 = cross(d1, d2) / 6.0;
  let g0 = -(g1 + g2 + g3);

  let w0 = select(1.0 / masses[c.v0], 0.0, masses[c.v0] <= 0.0);
  let w1 = select(1.0 / masses[c.v1], 0.0, masses[c.v1] <= 0.0);
  let w2 = select(1.0 / masses[c.v2], 0.0, masses[c.v2] <= 0.0);
  let w3 = select(1.0 / masses[c.v3], 0.0, masses[c.v3] <= 0.0);

  let denom = w0 * dot(g0, g0) + w1 * dot(g1, g1) + w2 * dot(g2, g2) + w3 * dot(g3, g3);

  if (denom < 1e-7) { return; }

  let alpha = c.compliance / (params.dt * params.dt);
  let lambda = -C / (denom + alpha);

  if (w0 > 0.0) { storePos(c.v0, p0 + g0 * lambda * w0); }
  if (w1 > 0.0) { storePos(c.v1, p1 + g1 * lambda * w1); }
  if (w2 > 0.0) { storePos(c.v2, p2 + g2 * lambda * w2); }
  if (w3 > 0.0) { storePos(c.v3, p3 + g3 * lambda * w3); }
}
`;

/**
 * WGSL: SDF collision constraint solve
 */
export const PBD_COLLISION_SHADER = /* wgsl */ `
struct SDFParams {
  boundsMin: vec3f,
  cellSize: f32,
  boundsMax: vec3f,
  friction: f32,
  gridSizeX: u32,
  gridSizeY: u32,
  gridSizeZ: u32,
  numVertices: u32,
  collisionMargin: f32,
  padding: vec3f,
}

@group(0) @binding(0) var<storage, read_write> predicted: array<f32>;
@group(0) @binding(1) var<storage, read> masses: array<f32>;
@group(0) @binding(2) var<storage, read> sdfData: array<f32>;
@group(0) @binding(3) var<uniform> params: SDFParams;

fn sampleSDF(pos: vec3f) -> f32 {
  let local = (pos - params.boundsMin) / params.cellSize;
  let gi = vec3u(clamp(vec3i(floor(local)), vec3i(0), vec3i(
    i32(params.gridSizeX) - 2,
    i32(params.gridSizeY) - 2,
    i32(params.gridSizeZ) - 2
  )));
  let f = fract(local);

  // Trilinear interpolation
  let idx000 = gi.x + gi.y * params.gridSizeX + gi.z * params.gridSizeX * params.gridSizeY;
  let idx100 = idx000 + 1u;
  let idx010 = idx000 + params.gridSizeX;
  let idx110 = idx010 + 1u;
  let idx001 = idx000 + params.gridSizeX * params.gridSizeY;
  let idx101 = idx001 + 1u;
  let idx011 = idx001 + params.gridSizeX;
  let idx111 = idx011 + 1u;

  let c00 = mix(sdfData[idx000], sdfData[idx100], f.x);
  let c10 = mix(sdfData[idx010], sdfData[idx110], f.x);
  let c01 = mix(sdfData[idx001], sdfData[idx101], f.x);
  let c11 = mix(sdfData[idx011], sdfData[idx111], f.x);
  let c0 = mix(c00, c10, f.y);
  let c1 = mix(c01, c11, f.y);
  return mix(c0, c1, f.z);
}

fn sdfGradient(pos: vec3f) -> vec3f {
  let eps = params.cellSize * 0.5;
  return normalize(vec3f(
    sampleSDF(pos + vec3f(eps, 0.0, 0.0)) - sampleSDF(pos - vec3f(eps, 0.0, 0.0)),
    sampleSDF(pos + vec3f(0.0, eps, 0.0)) - sampleSDF(pos - vec3f(0.0, eps, 0.0)),
    sampleSDF(pos + vec3f(0.0, 0.0, eps)) - sampleSDF(pos - vec3f(0.0, 0.0, eps))
  ));
}

@compute @workgroup_size(256)
fn cs_solve_collision(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.numVertices) { return; }
  if (masses[idx] <= 0.0) { return; }

  let i3 = idx * 3u;
  let pos = vec3f(predicted[i3], predicted[i3 + 1u], predicted[i3 + 2u]);

  // Check if inside SDF bounds
  if (any(pos < params.boundsMin) || any(pos > params.boundsMax)) { return; }

  let dist = sampleSDF(pos);

  if (dist < params.collisionMargin) {
    let normal = sdfGradient(pos);
    let penetration = params.collisionMargin - dist;

    // Push vertex out along SDF gradient
    let correction = normal * penetration;
    predicted[i3]      += correction.x;
    predicted[i3 + 1u] += correction.y;
    predicted[i3 + 2u] += correction.z;
  }
}
`;

/**
 * WGSL: Update velocities from position delta and apply damping
 */
export const PBD_VELOCITY_SHADER = /* wgsl */ `
struct VelParams {
  dt: f32,
  damping: f32,
  numVertices: u32,
  padding: u32,
}

@group(0) @binding(0) var<storage, read> positions: array<f32>;
@group(0) @binding(1) var<storage, read_write> velocities: array<f32>;
@group(0) @binding(2) var<storage, read> predicted: array<f32>;
@group(0) @binding(3) var<uniform> params: VelParams;

@compute @workgroup_size(256)
fn cs_update_velocity(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.numVertices) { return; }

  let i3 = idx * 3u;
  let invDt = 1.0 / params.dt;

  velocities[i3]      = (predicted[i3]      - positions[i3])      * invDt;
  velocities[i3 + 1u] = (predicted[i3 + 1u] - positions[i3 + 1u]) * invDt;
  velocities[i3 + 2u] = (predicted[i3 + 2u] - positions[i3 + 2u]) * invDt;
}
`;

/**
 * WGSL: Copy predicted back to positions (finalize step)
 */
export const PBD_FINALIZE_SHADER = /* wgsl */ `
struct FinalizeParams {
  numVertices: u32,
  padding: vec3u,
}

@group(0) @binding(0) var<storage, read_write> positions: array<f32>;
@group(0) @binding(1) var<storage, read> predicted: array<f32>;
@group(0) @binding(2) var<uniform> params: FinalizeParams;

@compute @workgroup_size(256)
fn cs_finalize(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.numVertices) { return; }

  let i3 = idx * 3u;
  positions[i3]      = predicted[i3];
  positions[i3 + 1u] = predicted[i3 + 1u];
  positions[i3 + 2u] = predicted[i3 + 2u];
}
`;

/**
 * WGSL: Recompute vertex normals from triangle indices
 */
export const PBD_NORMALS_SHADER = /* wgsl */ `
struct NormalParams {
  numTriangles: u32,
  numVertices: u32,
  padding: vec2u,
}

@group(0) @binding(0) var<storage, read> positions: array<f32>;
@group(0) @binding(1) var<storage, read_write> normals: array<atomic<i32>>;
@group(0) @binding(2) var<storage, read> indices: array<u32>;
@group(0) @binding(3) var<uniform> params: NormalParams;

fn loadPos(idx: u32) -> vec3f {
  let i = idx * 3u;
  return vec3f(positions[i], positions[i + 1u], positions[i + 2u]);
}

// Atomic accumulate normal via fixed-point (multiply by 1e6, cast to i32)
fn atomicAddNormal(vertIdx: u32, n: vec3f) {
  let i = vertIdx * 3u;
  let scale = 1000000.0;
  atomicAdd(&normals[i],      i32(n.x * scale));
  atomicAdd(&normals[i + 1u], i32(n.y * scale));
  atomicAdd(&normals[i + 2u], i32(n.z * scale));
}

@compute @workgroup_size(256)
fn cs_compute_normals(@builtin(global_invocation_id) gid: vec3u) {
  let triIdx = gid.x;
  if (triIdx >= params.numTriangles) { return; }

  let i0 = indices[triIdx * 3u];
  let i1 = indices[triIdx * 3u + 1u];
  let i2 = indices[triIdx * 3u + 2u];

  let p0 = loadPos(i0);
  let p1 = loadPos(i1);
  let p2 = loadPos(i2);

  let faceNormal = cross(p1 - p0, p2 - p0);

  atomicAddNormal(i0, faceNormal);
  atomicAddNormal(i1, faceNormal);
  atomicAddNormal(i2, faceNormal);
}
`;

/**
 * WGSL: Normalize accumulated vertex normals
 */
export const PBD_NORMALIZE_SHADER = /* wgsl */ `
struct NormalizeParams {
  numVertices: u32,
  padding: vec3u,
}

@group(0) @binding(0) var<storage, read_write> normalsI32: array<i32>;
@group(0) @binding(1) var<storage, read_write> normalsF32: array<f32>;
@group(0) @binding(2) var<uniform> params: NormalizeParams;

@compute @workgroup_size(256)
fn cs_normalize_normals(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.numVertices) { return; }

  let i3 = idx * 3u;
  let scale = 1.0 / 1000000.0;
  var n = vec3f(
    f32(normalsI32[i3])      * scale,
    f32(normalsI32[i3 + 1u]) * scale,
    f32(normalsI32[i3 + 2u]) * scale
  );

  let len = length(n);
  if (len > 1e-7) {
    n /= len;
  } else {
    n = vec3f(0.0, 1.0, 0.0);
  }

  normalsF32[i3]      = n.x;
  normalsF32[i3 + 1u] = n.y;
  normalsF32[i3 + 2u] = n.z;

  // Reset atomic accumulator for next frame
  normalsI32[i3]      = 0;
  normalsI32[i3 + 1u] = 0;
  normalsI32[i3 + 2u] = 0;
}
`;

// =============================================================================
// Bending Constraint Shader (XPBD dihedral angle)
// =============================================================================

/**
 * WGSL compute shader for bending constraints.
 * Maintains rest dihedral angles between adjacent triangle pairs.
 * Uses XPBD formulation with compliance for stable soft constraints.
 *
 * Buffers:
 *   binding(1) positions   — read_write predicted positions (flat xyz)
 *   binding(2) masses      — read per-vertex masses (0 = pinned)
 *   binding(3) constraints — read 4 u32 per constraint [v0, v1, v2, v3]
 *   binding(4) restAngles  — read rest dihedral angle per constraint
 */
export const PBD_BENDING_SHADER = /* wgsl */ `
struct Params {
  dt: f32,
  numConstraints: u32,
  compliance: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> positions: array<f32>;
@group(0) @binding(2) var<storage, read> masses: array<f32>;
@group(0) @binding(3) var<storage, read> constraints: array<u32>;
@group(0) @binding(4) var<storage, read> restAngles: array<f32>;

fn loadPos(i: u32) -> vec3<f32> {
  return vec3<f32>(positions[i * 3u], positions[i * 3u + 1u], positions[i * 3u + 2u]);
}

fn storePos(i: u32, p: vec3<f32>) {
  positions[i * 3u] = p.x;
  positions[i * 3u + 1u] = p.y;
  positions[i * 3u + 2u] = p.z;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.numConstraints) { return; }

  // v0-v1 = shared edge, v2 = opposite on face 1, v3 = opposite on face 2
  let v0 = constraints[idx * 4u];
  let v1 = constraints[idx * 4u + 1u];
  let v2 = constraints[idx * 4u + 2u];
  let v3 = constraints[idx * 4u + 3u];

  let p0 = loadPos(v0);
  let p1 = loadPos(v1);
  let p2 = loadPos(v2);
  let p3 = loadPos(v3);

  // Shared edge
  let e = p1 - p0;
  let eLen = length(e);
  if (eLen < 1e-7) { return; }
  let eNorm = e / eLen;

  // Vectors from v0 to opposite vertices
  let d2 = p2 - p0;
  let d3 = p3 - p0;

  // Face normals (unnormalized, magnitude = 2 * triangle area)
  let n1 = cross(e, d2);
  let n2 = cross(e, d3);
  let n1Len = length(n1);
  let n2Len = length(n2);
  if (n1Len < 1e-7 || n2Len < 1e-7) { return; }

  let n1n = n1 / n1Len;
  let n2n = n2 / n2Len;

  // Dihedral angle via atan2 for full [-pi, pi] range
  let cosTheta = clamp(dot(n1n, n2n), -1.0, 1.0);
  let sinTheta = dot(cross(n1n, n2n), eNorm);
  let theta = atan2(sinTheta, cosTheta);

  // Constraint: C = theta - restAngle
  let restAngle = restAngles[idx];
  let C = theta - restAngle;
  if (abs(C) < 1e-6) { return; }

  // Perpendicular distances from opposite vertices to shared edge
  let h2 = n1Len / eLen;
  let h3 = n2Len / eLen;
  if (h2 < 1e-7 || h3 < 1e-7) { return; }

  // Gradients of theta w.r.t. vertex positions (Bridson formulation)
  let g2 = n1n / h2;
  let g3 = -n2n / h3;

  // Parametric projections along shared edge for gradient distribution
  let eDotE = eLen * eLen;
  let s2 = dot(d2, e) / eDotE;
  let s3 = dot(d3, e) / eDotE;

  // Edge vertex gradients (sum of all gradients = 0, translation invariance)
  let g0 = -(1.0 - s2) * g2 - (1.0 - s3) * g3;
  let g1 = -s2 * g2 - s3 * g3;

  // Inverse masses
  let w0 = select(0.0, 1.0 / masses[v0], masses[v0] > 0.0);
  let w1 = select(0.0, 1.0 / masses[v1], masses[v1] > 0.0);
  let w2 = select(0.0, 1.0 / masses[v2], masses[v2] > 0.0);
  let w3 = select(0.0, 1.0 / masses[v3], masses[v3] > 0.0);

  // XPBD: alpha = compliance / dt^2
  let alpha = params.compliance / (params.dt * params.dt);
  let denom = w0 * dot(g0, g0) + w1 * dot(g1, g1)
            + w2 * dot(g2, g2) + w3 * dot(g3, g3) + alpha;
  if (denom < 1e-10) { return; }

  let lambda = -C / denom;

  // Apply position corrections
  if (w0 > 0.0) { storePos(v0, p0 + g0 * lambda * w0); }
  if (w1 > 0.0) { storePos(v1, p1 + g1 * lambda * w1); }
  if (w2 > 0.0) { storePos(v2, p2 + g2 * lambda * w2); }
  if (w3 > 0.0) { storePos(v3, p3 + g3 * lambda * w3); }
}
`;

// =============================================================================
// Attachment Constraint Shader (XPBD compliant pin)
// =============================================================================

/**
 * WGSL compute shader for attachment constraints.
 * Pins vertices to target positions with XPBD compliance.
 * compliance=0 → hard pin, compliance>0 → soft spring.
 *
 * Buffers:
 *   binding(1) positions    — read_write predicted positions (flat xyz)
 *   binding(2) masses       — read per-vertex masses
 *   binding(3) vertexIndices — read vertex index per constraint
 *   binding(4) targets      — read target positions (flat xyz, 3 per constraint)
 *   binding(5) compliances  — read compliance per constraint
 */
export const PBD_ATTACHMENT_SHADER = /* wgsl */ `
struct Params {
  dt: f32,
  numConstraints: u32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> positions: array<f32>;
@group(0) @binding(2) var<storage, read> masses: array<f32>;
@group(0) @binding(3) var<storage, read> vertexIndices: array<u32>;
@group(0) @binding(4) var<storage, read> targets: array<f32>;
@group(0) @binding(5) var<storage, read> compliances: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.numConstraints) { return; }

  let vi = vertexIndices[idx];
  let mass = masses[vi];
  if (mass <= 0.0) { return; }  // Pinned vertex, already at target

  let px = positions[vi * 3u];
  let py = positions[vi * 3u + 1u];
  let pz = positions[vi * 3u + 2u];

  let tx = targets[idx * 3u];
  let ty = targets[idx * 3u + 1u];
  let tz = targets[idx * 3u + 2u];

  let dx = tx - px;
  let dy = ty - py;
  let dz = tz - pz;

  let dist = sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-7) { return; }

  let compliance = compliances[idx];
  let w = 1.0 / mass;
  let alpha = compliance / (params.dt * params.dt);

  // XPBD: C = dist, gradient = normalize(d), single vertex
  let lambda = dist / (w + alpha);

  let nx = dx / dist;
  let ny = dy / dist;
  let nz = dz / dist;

  positions[vi * 3u]      = px + nx * lambda * w;
  positions[vi * 3u + 1u] = py + ny * lambda * w;
  positions[vi * 3u + 2u] = pz + nz * lambda * w;
}
`;

// =============================================================================
// Density Constraint Shader (Fluid-PBD Coupling)
// =============================================================================

/**
 * WGSL: Solve density constraints (SPH-style).
 * Each fluid particle computes local density from neighbors and projects
 * towards the rest density using XPBD compliance.
 *
 * Buffer layout:
 *   binding(0) params       — uniform: dt, numConstraints, restDensity, kernelRadius
 *   binding(1) predicted    — read/write predicted positions (flat xyz)
 *   binding(2) masses       — read per-vertex masses
 *   binding(3) particleIdx  — read: which vertices are fluid particles
 *   binding(4) neighborList — read: flattened neighbor indices (maxNeighbors per particle)
 *   binding(5) neighborCnt  — read: neighbor count per particle
 */
export const PBD_DENSITY_SHADER = /* wgsl */ `
struct DensityParams {
  dt: f32,
  numParticles: u32,
  restDensity: f32,
  kernelRadius: f32,
  compliance: f32,
  maxNeighbors: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> params: DensityParams;
@group(0) @binding(1) var<storage, read_write> predicted: array<f32>;
@group(0) @binding(2) var<storage, read> masses: array<f32>;
@group(0) @binding(3) var<storage, read> particleIdx: array<u32>;
@group(0) @binding(4) var<storage, read> neighborList: array<u32>;
@group(0) @binding(5) var<storage, read> neighborCnt: array<u32>;
@group(0) @binding(6) var<storage, read_write> lambdas: array<f32>;

// Poly6 kernel
fn poly6(r2: f32, h: f32) -> f32 {
  let h2 = h * h;
  if (r2 >= h2) { return 0.0; }
  let diff = h2 - r2;
  return 315.0 / (64.0 * 3.14159265 * pow(h, 9.0)) * diff * diff * diff;
}

// Spiky gradient magnitude / r (to multiply with direction)
fn spikyGrad(r: f32, h: f32) -> f32 {
  if (r >= h || r < 1e-7) { return 0.0; }
  let diff = h - r;
  return -45.0 / (3.14159265 * pow(h, 6.0)) * diff * diff;
}

fn loadPos(idx: u32) -> vec3f {
  let i = idx * 3u;
  return vec3f(predicted[i], predicted[i + 1u], predicted[i + 2u]);
}

@compute @workgroup_size(256)
fn cs_compute_density_lambda(@builtin(global_invocation_id) gid: vec3u) {
  let pIdx = gid.x;
  if (pIdx >= params.numParticles) { return; }

  let vi = particleIdx[pIdx];
  let pi = loadPos(vi);
  let h = params.kernelRadius;
  let nCount = min(neighborCnt[pIdx], params.maxNeighbors);
  let nBase = pIdx * params.maxNeighbors;

  // Compute density
  var density = poly6(0.0, h) * masses[vi]; // self-contribution
  for (var n = 0u; n < nCount; n++) {
    let nj = neighborList[nBase + n];
    let pj = loadPos(nj);
    let diff = pi - pj;
    let r2 = dot(diff, diff);
    density += poly6(r2, h) * masses[nj];
  }

  // Constraint: C = density / restDensity - 1
  let C = density / params.restDensity - 1.0;
  if (C <= 0.0) { lambdas[pIdx] = 0.0; return; }

  // Compute denominator: sum of squared gradient magnitudes
  var gradSumSq: f32 = 0.0;
  var gradI = vec3f(0.0);

  for (var n = 0u; n < nCount; n++) {
    let nj = neighborList[nBase + n];
    let pj = loadPos(nj);
    let diff = pi - pj;
    let r = length(diff);
    let s = spikyGrad(r, h) / params.restDensity;
    if (r > 1e-7) {
      let gradJ = diff * (s / r);
      gradSumSq += dot(gradJ, gradJ);
      gradI += gradJ;
    }
  }

  gradSumSq += dot(gradI, gradI);

  let alpha = params.compliance / (params.dt * params.dt);
  lambdas[pIdx] = -C / (gradSumSq + alpha);
}

@compute @workgroup_size(256)
fn cs_apply_density(@builtin(global_invocation_id) gid: vec3u) {
  let pIdx = gid.x;
  if (pIdx >= params.numParticles) { return; }

  let vi = particleIdx[pIdx];
  let pi = loadPos(vi);
  let h = params.kernelRadius;
  let nCount = min(neighborCnt[pIdx], params.maxNeighbors);
  let nBase = pIdx * params.maxNeighbors;
  let lambdaI = lambdas[pIdx];

  var correction = vec3f(0.0);
  for (var n = 0u; n < nCount; n++) {
    let nj = neighborList[nBase + n];
    // Find lambda for neighbor (it's also a fluid particle)
    let pj = loadPos(nj);
    let diff = pi - pj;
    let r = length(diff);
    let s = spikyGrad(r, h) / params.restDensity;
    if (r > 1e-7) {
      // Use lambdaI for simplicity (symmetric correction)
      correction += diff * ((lambdaI + lambdaI) * s / r);
    }
  }

  let i3 = vi * 3u;
  predicted[i3]      += correction.x;
  predicted[i3 + 1u] += correction.y;
  predicted[i3 + 2u] += correction.z;
}
`;

// =============================================================================
// Self-Collision Shaders (Spatial Hash Build + Resolve)
// =============================================================================

/**
 * WGSL compute shader: build spatial hash grid.
 * Hashes each vertex position into a 3D grid cell and atomically appends
 * the vertex index to that cell's list via a prefix-sum-style counter array.
 *
 * Two-pass approach:
 *   Pass 1 (this shader): count vertices per cell + write vertex→cell mapping
 *   CPU prefix sum: compute cell offsets from counts
 *   Pass 2 (resolve shader): iterate 27 neighbors, resolve penetrations
 */
export const PBD_HASH_BUILD_SHADER = /* wgsl */ `
struct Params {
  numVertices: u32,
  cellSize: f32,
  gridDimX: u32,
  gridDimY: u32,
  gridDimZ: u32,
  originX: f32,
  originY: f32,
  originZ: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> positions: array<f32>;
@group(0) @binding(2) var<storage, read_write> cellCounts: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> vertexCells: array<u32>;

fn hashCell(ix: u32, iy: u32, iz: u32) -> u32 {
  return ix + iy * params.gridDimX + iz * params.gridDimX * params.gridDimY;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.numVertices) { return; }

  let px = positions[idx * 3u];
  let py = positions[idx * 3u + 1u];
  let pz = positions[idx * 3u + 2u];

  let ix = clamp(u32(floor((px - params.originX) / params.cellSize)), 0u, params.gridDimX - 1u);
  let iy = clamp(u32(floor((py - params.originY) / params.cellSize)), 0u, params.gridDimY - 1u);
  let iz = clamp(u32(floor((pz - params.originZ) / params.cellSize)), 0u, params.gridDimZ - 1u);

  let cell = hashCell(ix, iy, iz);
  vertexCells[idx] = cell;
  atomicAdd(&cellCounts[cell], 1u);
}
`;

/**
 * WGSL compute shader: resolve self-collisions.
 * For each vertex, iterate all vertices in the 27 neighboring cells
 * and push apart any that are closer than the collision radius.
 *
 * Buffers:
 *   binding(1) positions    — read_write predicted positions
 *   binding(2) masses       — read per-vertex masses
 *   binding(3) vertexCells  — read cell index per vertex
 *   binding(4) cellOffsets  — read prefix-sum offsets per cell (from CPU)
 *   binding(5) cellCounts   — read vertex count per cell
 *   binding(6) sortedVerts  — read vertex indices sorted by cell
 */
export const PBD_SELF_COLLISION_SHADER = /* wgsl */ `
struct Params {
  numVertices: u32,
  collisionRadius: f32,
  gridDimX: u32,
  gridDimY: u32,
  gridDimZ: u32,
  originX: f32,
  originY: f32,
  originZ: f32,
  cellSize: f32,
  _pad: f32,
  _pad2: f32,
  _pad3: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> positions: array<f32>;
@group(0) @binding(2) var<storage, read> masses: array<f32>;
@group(0) @binding(3) var<storage, read> vertexCells: array<u32>;
@group(0) @binding(4) var<storage, read> cellOffsets: array<u32>;
@group(0) @binding(5) var<storage, read> cellCounts2: array<u32>;
@group(0) @binding(6) var<storage, read> sortedVerts: array<u32>;

fn hashCell(ix: u32, iy: u32, iz: u32) -> u32 {
  return ix + iy * params.gridDimX + iz * params.gridDimX * params.gridDimY;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.numVertices) { return; }

  let mi = masses[idx];
  if (mi <= 0.0) { return; }
  let wi = 1.0 / mi;

  let px = positions[idx * 3u];
  let py = positions[idx * 3u + 1u];
  let pz = positions[idx * 3u + 2u];

  let ix = clamp(u32(floor((px - params.originX) / params.cellSize)), 0u, params.gridDimX - 1u);
  let iy = clamp(u32(floor((py - params.originY) / params.cellSize)), 0u, params.gridDimY - 1u);
  let iz = clamp(u32(floor((pz - params.originZ) / params.cellSize)), 0u, params.gridDimZ - 1u);

  let radius = params.collisionRadius;
  let radiusSq = radius * radius;

  var corrX = 0.0;
  var corrY = 0.0;
  var corrZ = 0.0;

  // Iterate 27 neighbor cells
  for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      for (var dx: i32 = -1; dx <= 1; dx++) {
        let nx = i32(ix) + dx;
        let ny = i32(iy) + dy;
        let nz = i32(iz) + dz;

        if (nx < 0 || nx >= i32(params.gridDimX) ||
            ny < 0 || ny >= i32(params.gridDimY) ||
            nz < 0 || nz >= i32(params.gridDimZ)) { continue; }

        let cell = hashCell(u32(nx), u32(ny), u32(nz));
        let offset = cellOffsets[cell];
        let count = cellCounts2[cell];

        for (var k: u32 = 0u; k < count; k++) {
          let j = sortedVerts[offset + k];
          if (j == idx) { continue; }

          let mj = masses[j];
          if (mj <= 0.0) { continue; }

          let qx = positions[j * 3u] - px;
          let qy = positions[j * 3u + 1u] - py;
          let qz = positions[j * 3u + 2u] - pz;
          let distSq = qx * qx + qy * qy + qz * qz;

          if (distSq < radiusSq && distSq > 1e-10) {
            let dist = sqrt(distSq);
            let penetration = radius - dist;
            let wj = 1.0 / mj;
            let wSum = wi + wj;
            let scale = penetration / (wSum * dist);

            // Push this vertex away (negative direction)
            corrX -= qx * scale * wi;
            corrY -= qy * scale * wi;
            corrZ -= qz * scale * wi;
          }
        }
      }
    }
  }

  positions[idx * 3u]      = px + corrX;
  positions[idx * 3u + 1u] = py + corrY;
  positions[idx * 3u + 2u] = pz + corrZ;
}
`;

// =============================================================================
// Graph Coloring for Parallel Constraint Solving
// =============================================================================

/**
 * Greedy graph coloring for distance/bending constraints.
 * Constraints sharing a vertex cannot be the same color — this allows
 * same-color constraints to execute in parallel without data races.
 */
export function colorConstraints(
  constraints: Array<{ vertexA: number; vertexB: number }>,
  numVertices: number
): IConstraintColoring {
  const numConstraints = constraints.length;
  const colors = new Uint32Array(numConstraints);
  const vertexColor = new Int32Array(numVertices).fill(-1);

  // Build adjacency: for each constraint, track which colors its vertices use
  let maxColor = 0;

  for (let i = 0; i < numConstraints; i++) {
    const { vertexA, vertexB } = constraints[i];

    // Find smallest color not used by either vertex's current constraint
    const forbidden = new Set<number>();
    if (vertexColor[vertexA] >= 0) forbidden.add(vertexColor[vertexA]);
    if (vertexColor[vertexB] >= 0) forbidden.add(vertexColor[vertexB]);

    let color = 0;
    while (forbidden.has(color)) color++;

    colors[i] = color;
    vertexColor[vertexA] = color;
    vertexColor[vertexB] = color;
    if (color > maxColor) maxColor = color;
  }

  const numColors = maxColor + 1;

  // Count per group
  const groupCounts = new Uint32Array(numColors);
  for (let i = 0; i < numConstraints; i++) {
    groupCounts[colors[i]]++;
  }

  // Compute offsets
  const groupOffsets = new Uint32Array(numColors);
  for (let c = 1; c < numColors; c++) {
    groupOffsets[c] = groupOffsets[c - 1] + groupCounts[c - 1];
  }

  // Sort indices by color
  const sortedIndices = new Uint32Array(numConstraints);
  const writePos = new Uint32Array(numColors);
  writePos.set(groupOffsets);

  for (let i = 0; i < numConstraints; i++) {
    const c = colors[i];
    sortedIndices[writePos[c]] = i;
    writePos[c]++;
  }

  return { numColors, colors, sortedIndices, groupOffsets, groupCounts };
}

// =============================================================================
// Tetrahedral Mesh Generation
// =============================================================================

/**
 * Generate tetrahedral mesh from a surface triangle mesh.
 * Uses simple fan tetrahedralization from centroid — suitable for convex
 * and mildly concave meshes. For complex shapes, use Delaunay tetrahedralization.
 */
export function generateTetrahedra(
  positions: Float32Array,
  indices: Uint32Array
): { tetIndices: Uint32Array; restVolumes: Float32Array } {
  const numVerts = positions.length / 3;
  const numTris = indices.length / 3;

  // Compute centroid
  let cx = 0,
    cy = 0,
    cz = 0;
  for (let i = 0; i < numVerts; i++) {
    cx += positions[i * 3];
    cy += positions[i * 3 + 1];
    cz += positions[i * 3 + 2];
  }
  cx /= numVerts;
  cy /= numVerts;
  cz /= numVerts;

  // Add centroid as extra vertex (conceptual — we store its index)
  const centroidIdx = numVerts; // Virtual index

  // Each surface triangle + centroid = 1 tetrahedron
  const tetIndices = new Uint32Array(numTris * 4);
  const restVolumes = new Float32Array(numTris);

  for (let t = 0; t < numTris; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];

    tetIndices[t * 4] = i0;
    tetIndices[t * 4 + 1] = i1;
    tetIndices[t * 4 + 2] = i2;
    tetIndices[t * 4 + 3] = centroidIdx;

    // Compute signed volume
    const p0x = positions[i0 * 3],
      p0y = positions[i0 * 3 + 1],
      p0z = positions[i0 * 3 + 2];
    const d1x = positions[i1 * 3] - p0x,
      d1y = positions[i1 * 3 + 1] - p0y,
      d1z = positions[i1 * 3 + 2] - p0z;
    const d2x = positions[i2 * 3] - p0x,
      d2y = positions[i2 * 3 + 1] - p0y,
      d2z = positions[i2 * 3 + 2] - p0z;
    const d3x = cx - p0x,
      d3y = cy - p0y,
      d3z = cz - p0z;

    // cross(d2, d3)
    const crx = d2y * d3z - d2z * d3y;
    const cry = d2z * d3x - d2x * d3z;
    const crz = d2x * d3y - d2y * d3x;

    const vol = Math.abs(d1x * crx + d1y * cry + d1z * crz) / 6;
    restVolumes[t] = vol;
  }

  return { tetIndices, restVolumes };
}

// =============================================================================
// Edge Extraction
// =============================================================================

/**
 * Extract unique edges from triangle indices for distance constraints.
 */
export function extractEdges(
  indices: Uint32Array,
  _numVertices: number
):
  | { edges: Uint32Array; restLengths: Float32Array; positions: Float32Array }
  | { edges: Uint32Array } {
  const edgeSet = new Set<string>();
  const edgeList: [number, number][] = [];

  const numTris = indices.length / 3;
  for (let t = 0; t < numTris; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];

    const pairs: [number, number][] = [
      [Math.min(i0, i1), Math.max(i0, i1)],
      [Math.min(i1, i2), Math.max(i1, i2)],
      [Math.min(i0, i2), Math.max(i0, i2)],
    ];

    for (const [a, b] of pairs) {
      const key = `${a}_${b}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edgeList.push([a, b]);
      }
    }
  }

  const edges = new Uint32Array(edgeList.length * 2);
  for (let i = 0; i < edgeList.length; i++) {
    edges[i * 2] = edgeList[i][0];
    edges[i * 2 + 1] = edgeList[i][1];
  }

  return { edges };
}

/**
 * Compute rest lengths for distance constraints.
 */
export function computeRestLengths(positions: Float32Array, edges: Uint32Array): Float32Array {
  const numEdges = edges.length / 2;
  const restLengths = new Float32Array(numEdges);

  for (let i = 0; i < numEdges; i++) {
    const a = edges[i * 2];
    const b = edges[i * 2 + 1];
    const dx = positions[b * 3] - positions[a * 3];
    const dy = positions[b * 3 + 1] - positions[a * 3 + 1];
    const dz = positions[b * 3 + 2] - positions[a * 3 + 2];
    restLengths[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return restLengths;
}

// =============================================================================
// Bending Pair Extraction
// =============================================================================

/**
 * Extract bending constraint pairs from a triangle mesh.
 * Finds pairs of triangles sharing an edge and computes rest dihedral angles.
 *
 * @returns constraints — flat Uint32Array, 4 indices per constraint [v0, v1, v2, v3]
 *          where (v0,v1) is the shared edge and v2, v3 are the opposite vertices.
 * @returns restAngles — Float32Array of rest dihedral angles (one per constraint).
 */
export function extractBendingPairs(
  indices: Uint32Array,
  positions: Float32Array
): { constraints: Uint32Array; restAngles: Float32Array } {
  // Build edge → triangle adjacency map
  const edgeMap = new Map<string, Array<{ triIndex: number; oppositeVertex: number }>>();
  const numTris = indices.length / 3;

  for (let t = 0; t < numTris; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];

    // For each edge, record the opposite vertex
    const triEdges: Array<[number, number, number]> = [
      [i0, i1, i2],
      [i1, i2, i0],
      [i0, i2, i1],
    ];
    for (const [a, b, opp] of triEdges) {
      const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
      let list = edgeMap.get(key);
      if (!list) {
        list = [];
        edgeMap.set(key, list);
      }
      list.push({ triIndex: t, oppositeVertex: opp });
    }
  }

  // Find edges shared by exactly 2 triangles → bending pairs
  const bendingList: Array<[number, number, number, number]> = [];
  const angleList: number[] = [];

  for (const [key, tris] of edgeMap) {
    if (tris.length !== 2) continue;

    const [minStr, maxStr] = key.split('_');
    const v0 = parseInt(minStr);
    const v1 = parseInt(maxStr);
    const v2 = tris[0].oppositeVertex;
    const v3 = tris[1].oppositeVertex;

    // Compute rest dihedral angle
    const p0x = positions[v0 * 3],
      p0y = positions[v0 * 3 + 1],
      p0z = positions[v0 * 3 + 2];
    const p1x = positions[v1 * 3],
      p1y = positions[v1 * 3 + 1],
      p1z = positions[v1 * 3 + 2];
    const p2x = positions[v2 * 3],
      p2y = positions[v2 * 3 + 1],
      p2z = positions[v2 * 3 + 2];
    const p3x = positions[v3 * 3],
      p3y = positions[v3 * 3 + 1],
      p3z = positions[v3 * 3 + 2];

    const ex = p1x - p0x,
      ey = p1y - p0y,
      ez = p1z - p0z;
    const eLen = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (eLen < 1e-7) continue;
    const enx = ex / eLen,
      eny = ey / eLen,
      enz = ez / eLen;

    const d2x = p2x - p0x,
      d2y = p2y - p0y,
      d2z = p2z - p0z;
    const d3x = p3x - p0x,
      d3y = p3y - p0y,
      d3z = p3z - p0z;

    // Face normals
    const n1x = ey * d2z - ez * d2y;
    const n1y = ez * d2x - ex * d2z;
    const n1z = ex * d2y - ey * d2x;
    const n1Len = Math.sqrt(n1x * n1x + n1y * n1y + n1z * n1z);

    const n2x = ey * d3z - ez * d3y;
    const n2y = ez * d3x - ex * d3z;
    const n2z = ex * d3y - ey * d3x;
    const n2Len = Math.sqrt(n2x * n2x + n2y * n2y + n2z * n2z);

    if (n1Len < 1e-7 || n2Len < 1e-7) continue;

    const n1nx = n1x / n1Len,
      n1ny = n1y / n1Len,
      n1nz = n1z / n1Len;
    const n2nx = n2x / n2Len,
      n2ny = n2y / n2Len,
      n2nz = n2z / n2Len;

    const cosTheta = Math.max(-1, Math.min(1, n1nx * n2nx + n1ny * n2ny + n1nz * n2nz));
    const cx = n1ny * n2nz - n1nz * n2ny;
    const cy = n1nz * n2nx - n1nx * n2nz;
    const cz = n1nx * n2ny - n1ny * n2nx;
    const sinTheta = cx * enx + cy * eny + cz * enz;

    bendingList.push([v0, v1, v2, v3]);
    angleList.push(Math.atan2(sinTheta, cosTheta));
  }

  const constraints = new Uint32Array(bendingList.length * 4);
  for (let i = 0; i < bendingList.length; i++) {
    constraints[i * 4] = bendingList[i][0];
    constraints[i * 4 + 1] = bendingList[i][1];
    constraints[i * 4 + 2] = bendingList[i][2];
    constraints[i * 4 + 3] = bendingList[i][3];
  }

  return { constraints, restAngles: new Float32Array(angleList) };
}

// =============================================================================
// SDF Generation
// =============================================================================

/**
 * Generate a signed distance field from a triangle mesh.
 * Uses brute-force closest-triangle for each grid cell.
 * For production, use a spatial acceleration structure.
 */
export function generateSDF(
  vertices: Float32Array,
  indices: Uint32Array,
  gridSize: number,
  padding: number = 0.1
): ISDFCollider {
  const numVerts = vertices.length / 3;

  // Compute bounding box
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (let i = 0; i < numVerts; i++) {
    const x = vertices[i * 3],
      y = vertices[i * 3 + 1],
      z = vertices[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  // Pad bounds
  minX -= padding;
  minY -= padding;
  minZ -= padding;
  maxX += padding;
  maxY += padding;
  maxZ += padding;

  const cellSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / gridSize;
  const gx = Math.ceil((maxX - minX) / cellSize);
  const gy = Math.ceil((maxY - minY) / cellSize);
  const gz = Math.ceil((maxZ - minZ) / cellSize);

  const sdfData = new Float32Array(gx * gy * gz);
  sdfData.fill(1e6); // Initialize to large positive distance

  const numTris = indices.length / 3;

  // For each grid cell, find distance to closest triangle
  for (let iz = 0; iz < gz; iz++) {
    for (let iy = 0; iy < gy; iy++) {
      for (let ix = 0; ix < gx; ix++) {
        const px = minX + (ix + 0.5) * cellSize;
        const py = minY + (iy + 0.5) * cellSize;
        const pz = minZ + (iz + 0.5) * cellSize;

        let closestDist = 1e6;

        for (let t = 0; t < numTris; t++) {
          const i0 = indices[t * 3],
            i1 = indices[t * 3 + 1],
            i2 = indices[t * 3 + 2];
          const dist = pointTriangleDistance(
            px,
            py,
            pz,
            vertices[i0 * 3],
            vertices[i0 * 3 + 1],
            vertices[i0 * 3 + 2],
            vertices[i1 * 3],
            vertices[i1 * 3 + 1],
            vertices[i1 * 3 + 2],
            vertices[i2 * 3],
            vertices[i2 * 3 + 1],
            vertices[i2 * 3 + 2]
          );
          if (dist < closestDist) closestDist = dist;
        }

        // Simple inside/outside: use winding number sign (approximate via normal)
        sdfData[ix + iy * gx + iz * gx * gy] = closestDist;
      }
    }
  }

  return {
    bodyId: 'sdf_' + Date.now(),
    gridSize: [gx, gy, gz],
    sdfData,
    boundsMin: { x: minX, y: minY, z: minZ },
    boundsMax: { x: maxX, y: maxY, z: maxZ },
    cellSize,
    friction: 0.5,
  };
}

/**
 * Point-to-triangle unsigned distance.
 */
function pointTriangleDistance(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): number {
  // Edge vectors
  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const acx = cx - ax,
    acy = cy - ay,
    acz = cz - az;
  const apx = px - ax,
    apy = py - ay,
    apz = pz - az;

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    return Math.sqrt(apx * apx + apy * apy + apz * apz);
  }

  const bpx = px - bx,
    bpy = py - by,
    bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    return Math.sqrt(bpx * bpx + bpy * bpy + bpz * bpz);
  }

  const cpx = px - cx,
    cpy = py - cy,
    cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    return Math.sqrt(cpx * cpx + cpy * cpy + cpz * cpz);
  }

  // Edge AB
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const ex = ax + abx * v - px,
      ey = ay + aby * v - py,
      ez = az + abz * v - pz;
    return Math.sqrt(ex * ex + ey * ey + ez * ez);
  }

  // Edge AC
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const ex = ax + acx * w - px,
      ey = ay + acy * w - py,
      ez = az + acz * w - pz;
    return Math.sqrt(ex * ex + ey * ey + ez * ez);
  }

  // Edge BC
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const ex = bx + (cx - bx) * w - px,
      ey = by + (cy - by) * w - py,
      ez = bz + (cz - bz) * w - pz;
    return Math.sqrt(ex * ex + ey * ey + ez * ez);
  }

  // Inside triangle
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const qx = ax + abx * v + acx * w - px;
  const qy = ay + aby * v + acy * w - py;
  const qz = az + abz * v + acz * w - pz;
  return Math.sqrt(qx * qx + qy * qy + qz * qz);
}

// =============================================================================
// CPU PBD Solver (Fallback when WebGPU unavailable)
// =============================================================================

/**
 * CPU-side PBD solver. Mirrors the GPU pipeline for environments without WebGPU.
 */
export class PBDSolverCPU {
  private config: ISoftBodyConfig;
  private state: ISoftBodyState;
  private distanceConstraints: IPBDDistanceConstraint[] = [];
  private volumeConstraints: IPBDVolumeConstraint[] = [];
  private bendingConstraints: IPBDBendingConstraint[] = [];
  private attachmentConstraints: IPBDAttachmentConstraint[] = [];
  private densityParticles: number[] = [];
  private densityNeighbors: number[][] = [];
  private densityRestDensity: number = 1000;
  private densityKernelRadius: number = 0.1;
  private densityCompliance: number = 0.0001;
  private coloring: IConstraintColoring | null = null;
  private sdfColliders: ISDFCollider[] = [];

  constructor(config: ISoftBodyConfig) {
    this.config = config;
    const numVerts = config.positions.length / 3;

    this.state = {
      id: config.id,
      positions: new Float32Array(config.positions),
      velocities: new Float32Array(numVerts * 3),
      predicted: new Float32Array(numVerts * 3),
      normals: new Float32Array(numVerts * 3),
      volume: 0,
      restVolume: 0,
      deformationAmount: 0,
      centerOfMass: { x: 0, y: 0, z: 0 },
      isActive: true,
    };

    this.buildConstraints();
  }

  private buildConstraints(): void {
    const { positions, edges, compliance, indices, tetIndices } = this.config;
    const restLengths = computeRestLengths(positions, edges);
    const numEdges = edges.length / 2;

    // Distance constraints from edges
    const edgePairs: Array<{ vertexA: number; vertexB: number }> = [];
    for (let i = 0; i < numEdges; i++) {
      const vertexA = edges[i * 2];
      const vertexB = edges[i * 2 + 1];
      edgePairs.push({ vertexA, vertexB });
      this.distanceConstraints.push({
        type: 'distance',
        vertexA,
        vertexB,
        restLength: restLengths[i],
        compliance,
        colorGroup: 0,
      });
    }

    // Graph coloring
    this.coloring = colorConstraints(edgePairs, positions.length / 3);
    for (let i = 0; i < this.distanceConstraints.length; i++) {
      this.distanceConstraints[i].colorGroup = this.coloring.colors[i];
    }

    // Volume constraints from tetrahedra
    if (tetIndices) {
      const numTets = tetIndices.length / 4;
      for (let t = 0; t < numTets; t++) {
        const v0 = tetIndices[t * 4];
        const v1 = tetIndices[t * 4 + 1];
        const v2 = tetIndices[t * 4 + 2];
        const v3 = tetIndices[t * 4 + 3];
        const vol = this.computeTetVolume(v0, v1, v2, v3, positions);
        this.volumeConstraints.push({
          type: 'volume',
          vertices: [v0, v1, v2, v3],
          restVolume: vol,
          compliance: compliance * 0.1,
        });
      }
      this.state.restVolume = this.volumeConstraints.reduce((s, c) => s + c.restVolume, 0);
      this.state.volume = this.state.restVolume;
    }

    // Bending constraints from triangle adjacency
    const { constraints: bendingIndices, restAngles } = extractBendingPairs(indices, positions);
    const numBending = bendingIndices.length / 4;
    for (let i = 0; i < numBending; i++) {
      this.bendingConstraints.push({
        type: 'bending',
        vertices: [
          bendingIndices[i * 4],
          bendingIndices[i * 4 + 1],
          bendingIndices[i * 4 + 2],
          bendingIndices[i * 4 + 3],
        ],
        restAngle: restAngles[i],
        compliance: compliance * 10, // Bending is typically softer than stretching
        colorGroup: 0,
      });
    }
  }

  private computeTetVolume(
    v0: number,
    v1: number,
    v2: number,
    v3: number,
    pos: Float32Array
  ): number {
    const p0x = pos[v0 * 3],
      p0y = pos[v0 * 3 + 1],
      p0z = pos[v0 * 3 + 2];
    const d1x = pos[v1 * 3] - p0x,
      d1y = pos[v1 * 3 + 1] - p0y,
      d1z = pos[v1 * 3 + 2] - p0z;
    const d2x = pos[v2 * 3] - p0x,
      d2y = pos[v2 * 3 + 1] - p0y,
      d2z = pos[v2 * 3 + 2] - p0z;
    const d3x = pos[v3 * 3] - p0x,
      d3y = pos[v3 * 3 + 1] - p0y,
      d3z = pos[v3 * 3 + 2] - p0z;
    const crx = d2y * d3z - d2z * d3y;
    const cry = d2z * d3x - d2x * d3z;
    const crz = d2x * d3y - d2y * d3x;
    return Math.abs(d1x * crx + d1y * cry + d1z * crz) / 6;
  }

  /**
   * Add an SDF collider for collision detection
   */
  public addCollider(collider: ISDFCollider): void {
    this.sdfColliders.push(collider);
  }

  /**
   * Pin a vertex to a world position.
   * @param compliance 0 = hard pin, >0 = soft spring (XPBD compliant)
   */
  public pinVertex(vertexIndex: number, position: IVector3, compliance: number = 0): void {
    this.attachmentConstraints.push({
      type: 'attachment',
      vertexIndex,
      targetPosition: position,
      compliance,
    });
  }

  /**
   * Unpin a vertex
   */
  public unpinVertex(vertexIndex: number): void {
    this.attachmentConstraints = this.attachmentConstraints.filter(
      (c) => c.vertexIndex !== vertexIndex
    );
  }

  /**
   * Apply an impulse at a position (for grab interaction)
   */
  public applyImpulse(position: IVector3, force: IVector3, radius: number): void {
    const pos = this.state.positions;
    const vel = this.state.velocities;
    const masses = this.config.masses;
    const numVerts = pos.length / 3;

    for (let i = 0; i < numVerts; i++) {
      if (masses[i] <= 0) continue;
      const dx = pos[i * 3] - position.x;
      const dy = pos[i * 3 + 1] - position.y;
      const dz = pos[i * 3 + 2] - position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < radius) {
        const falloff = 1 - dist / radius;
        const invMass = 1 / masses[i];
        vel[i * 3] += force.x * falloff * invMass;
        vel[i * 3 + 1] += force.y * falloff * invMass;
        vel[i * 3 + 2] += force.z * falloff * invMass;
      }
    }
  }

  /**
   * Step the simulation forward by dt seconds
   */
  public step(dt: number): ISoftBodyState {
    if (!this.state.isActive || dt <= 0) return this.state;

    const { damping, solverIterations, gravity, wind, collisionMargin } = this.config;
    const { positions, velocities, predicted } = this.state;
    const masses = this.config.masses;
    const numVerts = positions.length / 3;

    const gx = gravity?.x ?? 0;
    const gy = gravity?.y ?? -9.81;
    const gz = gravity?.z ?? 0;
    const wx = wind?.x ?? 0;
    const wy = wind?.y ?? 0;
    const wz = wind?.z ?? 0;

    // [1] Apply forces + predict
    for (let i = 0; i < numVerts; i++) {
      const m = masses[i];
      if (m <= 0) {
        predicted[i * 3] = positions[i * 3];
        predicted[i * 3 + 1] = positions[i * 3 + 1];
        predicted[i * 3 + 2] = positions[i * 3 + 2];
        continue;
      }

      velocities[i * 3] += (gx + wx / m) * dt;
      velocities[i * 3 + 1] += (gy + wy / m) * dt;
      velocities[i * 3 + 2] += (gz + wz / m) * dt;

      velocities[i * 3] *= damping;
      velocities[i * 3 + 1] *= damping;
      velocities[i * 3 + 2] *= damping;

      predicted[i * 3] = positions[i * 3] + velocities[i * 3] * dt;
      predicted[i * 3 + 1] = positions[i * 3 + 1] + velocities[i * 3 + 1] * dt;
      predicted[i * 3 + 2] = positions[i * 3 + 2] + velocities[i * 3 + 2] * dt;
    }

    // [2] Solve constraints
    for (let iter = 0; iter < solverIterations; iter++) {
      // Distance constraints (solved per color group for correctness)
      if (this.coloring) {
        for (let g = 0; g < this.coloring.numColors; g++) {
          const start = this.coloring.groupOffsets[g];
          const count = this.coloring.groupCounts[g];
          for (let j = 0; j < count; j++) {
            const ci = this.coloring.sortedIndices[start + j];
            this.solveDistanceConstraint(this.distanceConstraints[ci], dt);
          }
        }
      }

      // Volume constraints
      for (const vc of this.volumeConstraints) {
        this.solveVolumeConstraint(vc, dt);
      }

      // Bending constraints
      for (const bc of this.bendingConstraints) {
        this.solveBendingConstraint(bc, dt);
      }

      // SDF collision
      for (const collider of this.sdfColliders) {
        this.solveSdfCollision(collider, collisionMargin);
      }

      // Self-collision (spatial hash)
      if (this.config.selfCollision) {
        this.solveSelfCollision();
      }

      // Attachment constraints (XPBD compliance)
      for (const ac of this.attachmentConstraints) {
        this.solveAttachmentConstraint(ac, dt);
      }

      // Density constraints (fluid-PBD coupling)
      if (this.densityParticles.length > 0) {
        this.solveDensityConstraints(dt);
      }

      // Ground plane (y = 0) collision
      for (let i = 0; i < numVerts; i++) {
        if (masses[i] <= 0) continue;
        if (predicted[i * 3 + 1] < collisionMargin) {
          predicted[i * 3 + 1] = collisionMargin;
        }
      }
    }

    // [3] Update velocities
    const invDt = 1 / dt;
    for (let i = 0; i < numVerts * 3; i++) {
      velocities[i] = (predicted[i] - positions[i]) * invDt;
    }

    // [4] Copy predicted → positions
    positions.set(predicted);

    // [5] Compute deformation + center of mass
    let totalDeform = 0;
    let comX = 0,
      comY = 0,
      comZ = 0,
      totalMass = 0;
    const rest = this.config.positions;
    for (let i = 0; i < numVerts; i++) {
      const dx = positions[i * 3] - rest[i * 3];
      const dy = positions[i * 3 + 1] - rest[i * 3 + 1];
      const dz = positions[i * 3 + 2] - rest[i * 3 + 2];
      totalDeform += Math.sqrt(dx * dx + dy * dy + dz * dz);
      const m = masses[i] > 0 ? masses[i] : 1;
      comX += positions[i * 3] * m;
      comY += positions[i * 3 + 1] * m;
      comZ += positions[i * 3 + 2] * m;
      totalMass += m;
    }
    this.state.deformationAmount = totalDeform / numVerts;
    if (totalMass > 0) {
      this.state.centerOfMass = { x: comX / totalMass, y: comY / totalMass, z: comZ / totalMass };
    }

    // [6] Recompute normals
    this.recomputeNormals();

    return this.state;
  }

  private solveDistanceConstraint(c: IPBDDistanceConstraint, dt: number): void {
    const pred = this.state.predicted;
    const masses = this.config.masses;
    const iA = c.vertexA * 3,
      iB = c.vertexB * 3;

    const dx = pred[iB] - pred[iA];
    const dy = pred[iB + 1] - pred[iA + 1];
    const dz = pred[iB + 2] - pred[iA + 2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1e-7) return;

    const wA = masses[c.vertexA] > 0 ? 1 / masses[c.vertexA] : 0;
    const wB = masses[c.vertexB] > 0 ? 1 / masses[c.vertexB] : 0;
    const wSum = wA + wB;
    if (wSum < 1e-7) return;

    const alpha = c.compliance / (dt * dt);
    const C = dist - c.restLength;
    const lambda = -C / (wSum + alpha);

    const nx = (dx / dist) * lambda;
    const ny = (dy / dist) * lambda;
    const nz = (dz / dist) * lambda;

    if (wA > 0) {
      pred[iA] -= nx * wA;
      pred[iA + 1] -= ny * wA;
      pred[iA + 2] -= nz * wA;
    }
    if (wB > 0) {
      pred[iB] += nx * wB;
      pred[iB + 1] += ny * wB;
      pred[iB + 2] += nz * wB;
    }
  }

  private solveVolumeConstraint(c: IPBDVolumeConstraint, dt: number): void {
    const pred = this.state.predicted;
    const masses = this.config.masses;
    const [v0, v1, v2, v3] = c.vertices;

    const p0x = pred[v0 * 3],
      p0y = pred[v0 * 3 + 1],
      p0z = pred[v0 * 3 + 2];
    const p1x = pred[v1 * 3],
      p1y = pred[v1 * 3 + 1],
      p1z = pred[v1 * 3 + 2];
    const p2x = pred[v2 * 3],
      p2y = pred[v2 * 3 + 1],
      p2z = pred[v2 * 3 + 2];
    const p3x = pred[v3 * 3],
      p3y = pred[v3 * 3 + 1],
      p3z = pred[v3 * 3 + 2];

    const d1x = p1x - p0x,
      d1y = p1y - p0y,
      d1z = p1z - p0z;
    const d2x = p2x - p0x,
      d2y = p2y - p0y,
      d2z = p2z - p0z;
    const d3x = p3x - p0x,
      d3y = p3y - p0y,
      d3z = p3z - p0z;

    const crx = d2y * d3z - d2z * d3y;
    const cry = d2z * d3x - d2x * d3z;
    const crz = d2x * d3y - d2y * d3x;

    const vol = (d1x * crx + d1y * cry + d1z * crz) / 6;
    const C = vol - c.restVolume;
    if (Math.abs(C) < 1e-7) return;

    // Gradients
    const g1x = crx / 6,
      g1y = cry / 6,
      g1z = crz / 6;
    const c2x = d3y * d1z - d3z * d1y,
      c2y = d3z * d1x - d3x * d1z,
      c2z = d3x * d1y - d3y * d1x;
    const g2x = c2x / 6,
      g2y = c2y / 6,
      g2z = c2z / 6;
    const c3x = d1y * d2z - d1z * d2y,
      c3y = d1z * d2x - d1x * d2z,
      c3z = d1x * d2y - d1y * d2x;
    const g3x = c3x / 6,
      g3y = c3y / 6,
      g3z = c3z / 6;
    const g0x = -(g1x + g2x + g3x),
      g0y = -(g1y + g2y + g3y),
      g0z = -(g1z + g2z + g3z);

    const w0 = masses[v0] > 0 ? 1 / masses[v0] : 0;
    const w1 = masses[v1] > 0 ? 1 / masses[v1] : 0;
    const w2 = masses[v2] > 0 ? 1 / masses[v2] : 0;
    const w3 = masses[v3] > 0 ? 1 / masses[v3] : 0;

    const denom =
      w0 * (g0x * g0x + g0y * g0y + g0z * g0z) +
      w1 * (g1x * g1x + g1y * g1y + g1z * g1z) +
      w2 * (g2x * g2x + g2y * g2y + g2z * g2z) +
      w3 * (g3x * g3x + g3y * g3y + g3z * g3z);
    if (denom < 1e-7) return;

    const alpha = c.compliance / (dt * dt);
    const lambda = -C / (denom + alpha);

    if (w0 > 0) {
      pred[v0 * 3] += g0x * lambda * w0;
      pred[v0 * 3 + 1] += g0y * lambda * w0;
      pred[v0 * 3 + 2] += g0z * lambda * w0;
    }
    if (w1 > 0) {
      pred[v1 * 3] += g1x * lambda * w1;
      pred[v1 * 3 + 1] += g1y * lambda * w1;
      pred[v1 * 3 + 2] += g1z * lambda * w1;
    }
    if (w2 > 0) {
      pred[v2 * 3] += g2x * lambda * w2;
      pred[v2 * 3 + 1] += g2y * lambda * w2;
      pred[v2 * 3 + 2] += g2z * lambda * w2;
    }
    if (w3 > 0) {
      pred[v3 * 3] += g3x * lambda * w3;
      pred[v3 * 3 + 1] += g3y * lambda * w3;
      pred[v3 * 3 + 2] += g3z * lambda * w3;
    }
  }

  private solveBendingConstraint(c: IPBDBendingConstraint, dt: number): void {
    const pred = this.state.predicted;
    const masses = this.config.masses;
    const [v0, v1, v2, v3] = c.vertices;

    const p0x = pred[v0 * 3],
      p0y = pred[v0 * 3 + 1],
      p0z = pred[v0 * 3 + 2];
    const p1x = pred[v1 * 3],
      p1y = pred[v1 * 3 + 1],
      p1z = pred[v1 * 3 + 2];
    const p2x = pred[v2 * 3],
      p2y = pred[v2 * 3 + 1],
      p2z = pred[v2 * 3 + 2];
    const p3x = pred[v3 * 3],
      p3y = pred[v3 * 3 + 1],
      p3z = pred[v3 * 3 + 2];

    // Shared edge
    const ex = p1x - p0x,
      ey = p1y - p0y,
      ez = p1z - p0z;
    const eLen = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (eLen < 1e-7) return;
    const enx = ex / eLen,
      eny = ey / eLen,
      enz = ez / eLen;

    // Vectors from v0 to opposite vertices
    const d2x = p2x - p0x,
      d2y = p2y - p0y,
      d2z = p2z - p0z;
    const d3x = p3x - p0x,
      d3y = p3y - p0y,
      d3z = p3z - p0z;

    // Face normals (unnormalized)
    const n1x = ey * d2z - ez * d2y,
      n1y = ez * d2x - ex * d2z,
      n1z = ex * d2y - ey * d2x;
    const n2x = ey * d3z - ez * d3y,
      n2y = ez * d3x - ex * d3z,
      n2z = ex * d3y - ey * d3x;
    const n1Len = Math.sqrt(n1x * n1x + n1y * n1y + n1z * n1z);
    const n2Len = Math.sqrt(n2x * n2x + n2y * n2y + n2z * n2z);
    if (n1Len < 1e-7 || n2Len < 1e-7) return;

    const n1nx = n1x / n1Len,
      n1ny = n1y / n1Len,
      n1nz = n1z / n1Len;
    const n2nx = n2x / n2Len,
      n2ny = n2y / n2Len,
      n2nz = n2z / n2Len;

    // Dihedral angle
    const cosTheta = Math.max(-1, Math.min(1, n1nx * n2nx + n1ny * n2ny + n1nz * n2nz));
    const crx = n1ny * n2nz - n1nz * n2ny;
    const cry = n1nz * n2nx - n1nx * n2nz;
    const crz = n1nx * n2ny - n1ny * n2nx;
    const sinTheta = crx * enx + cry * eny + crz * enz;
    const theta = Math.atan2(sinTheta, cosTheta);

    const C = theta - c.restAngle;
    if (Math.abs(C) < 1e-6) return;

    // Perpendicular distances
    const h2 = n1Len / eLen;
    const h3 = n2Len / eLen;
    if (h2 < 1e-7 || h3 < 1e-7) return;

    // Gradients (Bridson formulation)
    const g2x = n1nx / h2,
      g2y = n1ny / h2,
      g2z = n1nz / h2;
    const g3x = -n2nx / h3,
      g3y = -n2ny / h3,
      g3z = -n2nz / h3;

    const eDotE = eLen * eLen;
    const s2 = (d2x * ex + d2y * ey + d2z * ez) / eDotE;
    const s3 = (d3x * ex + d3y * ey + d3z * ez) / eDotE;

    const g0x = -(1 - s2) * g2x - (1 - s3) * g3x;
    const g0y = -(1 - s2) * g2y - (1 - s3) * g3y;
    const g0z = -(1 - s2) * g2z - (1 - s3) * g3z;
    const g1x2 = -s2 * g2x - s3 * g3x;
    const g1y2 = -s2 * g2y - s3 * g3y;
    const g1z2 = -s2 * g2z - s3 * g3z;

    // Inverse masses
    const w0 = masses[v0] > 0 ? 1 / masses[v0] : 0;
    const w1 = masses[v1] > 0 ? 1 / masses[v1] : 0;
    const w2 = masses[v2] > 0 ? 1 / masses[v2] : 0;
    const w3 = masses[v3] > 0 ? 1 / masses[v3] : 0;

    const denom =
      w0 * (g0x * g0x + g0y * g0y + g0z * g0z) +
      w1 * (g1x2 * g1x2 + g1y2 * g1y2 + g1z2 * g1z2) +
      w2 * (g2x * g2x + g2y * g2y + g2z * g2z) +
      w3 * (g3x * g3x + g3y * g3y + g3z * g3z);

    const alpha = c.compliance / (dt * dt);
    if (denom + alpha < 1e-10) return;
    const lambda = -C / (denom + alpha);

    if (w0 > 0) {
      pred[v0 * 3] += g0x * lambda * w0;
      pred[v0 * 3 + 1] += g0y * lambda * w0;
      pred[v0 * 3 + 2] += g0z * lambda * w0;
    }
    if (w1 > 0) {
      pred[v1 * 3] += g1x2 * lambda * w1;
      pred[v1 * 3 + 1] += g1y2 * lambda * w1;
      pred[v1 * 3 + 2] += g1z2 * lambda * w1;
    }
    if (w2 > 0) {
      pred[v2 * 3] += g2x * lambda * w2;
      pred[v2 * 3 + 1] += g2y * lambda * w2;
      pred[v2 * 3 + 2] += g2z * lambda * w2;
    }
    if (w3 > 0) {
      pred[v3 * 3] += g3x * lambda * w3;
      pred[v3 * 3 + 1] += g3y * lambda * w3;
      pred[v3 * 3 + 2] += g3z * lambda * w3;
    }
  }

  private solveAttachmentConstraint(c: IPBDAttachmentConstraint, dt: number): void {
    const pred = this.state.predicted;
    const masses = this.config.masses;
    const vi = c.vertexIndex;
    const m = masses[vi];

    const i3 = vi * 3;
    const px = pred[i3],
      py = pred[i3 + 1],
      pz = pred[i3 + 2];
    const tx = c.targetPosition.x,
      ty = c.targetPosition.y,
      tz = c.targetPosition.z;

    // Hard pin when compliance=0 or mass=0
    if (c.compliance <= 0 || m <= 0) {
      pred[i3] = tx;
      pred[i3 + 1] = ty;
      pred[i3 + 2] = tz;
      return;
    }

    const dx = tx - px,
      dy = ty - py,
      dz = tz - pz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1e-7) return;

    const w = 1 / m;
    const alpha = c.compliance / (dt * dt);
    const lambda = dist / (w + alpha);
    const scale = (lambda * w) / dist;

    pred[i3] = px + dx * scale;
    pred[i3 + 1] = py + dy * scale;
    pred[i3 + 2] = pz + dz * scale;
  }

  /**
   * CPU density constraint solver (SPH-style for fluid-PBD coupling).
   * Each fluid particle corrects toward rest density using neighbor kernel.
   */
  private solveDensityConstraints(dt: number): void {
    const pred = this.state.predicted;
    const masses = this.config.masses;
    const h = this.densityKernelRadius;
    const h2 = h * h;
    const restDensity = this.densityRestDensity;
    const alpha = this.densityCompliance / (dt * dt);

    // Poly6 kernel
    const poly6Coeff = 315.0 / (64.0 * Math.PI * Math.pow(h, 9));
    const spikyCoeff = -45.0 / (Math.PI * Math.pow(h, 6));

    const numParticles = this.densityParticles.length;
    const lambdas = new Float32Array(numParticles);

    // Phase 1: Compute lambdas
    for (let p = 0; p < numParticles; p++) {
      const vi = this.densityParticles[p];
      const i3 = vi * 3;
      const pix = pred[i3],
        piy = pred[i3 + 1],
        piz = pred[i3 + 2];
      const neighbors = this.densityNeighbors[p];

      // Compute density
      let density = poly6Coeff * Math.pow(h2, 3) * masses[vi]; // self
      for (const nj of neighbors) {
        const j3 = nj * 3;
        const dx = pix - pred[j3],
          dy = piy - pred[j3 + 1],
          dz = piz - pred[j3 + 2];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 < h2) {
          const diff = h2 - r2;
          density += poly6Coeff * diff * diff * diff * masses[nj];
        }
      }

      const C = density / restDensity - 1;
      if (C <= 0) {
        lambdas[p] = 0;
        continue;
      }

      // Compute gradient denominator
      let gradSumSq = 0;
      let giX = 0,
        giY = 0,
        giZ = 0;
      for (const nj of neighbors) {
        const j3 = nj * 3;
        const dx = pix - pred[j3],
          dy = piy - pred[j3 + 1],
          dz = piz - pred[j3 + 2];
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (r > 1e-7 && r < h) {
          const diff = h - r;
          const s = (spikyCoeff * diff * diff) / (restDensity * r);
          const gjX = dx * s,
            gjY = dy * s,
            gjZ = dz * s;
          gradSumSq += gjX * gjX + gjY * gjY + gjZ * gjZ;
          giX += gjX;
          giY += gjY;
          giZ += gjZ;
        }
      }
      gradSumSq += giX * giX + giY * giY + giZ * giZ;

      lambdas[p] = -C / (gradSumSq + alpha);
    }

    // Phase 2: Apply corrections
    for (let p = 0; p < numParticles; p++) {
      const vi = this.densityParticles[p];
      const i3 = vi * 3;
      const pix = pred[i3],
        piy = pred[i3 + 1],
        piz = pred[i3 + 2];
      const neighbors = this.densityNeighbors[p];
      const lambdaI = lambdas[p];

      let corrX = 0,
        corrY = 0,
        corrZ = 0;
      for (const nj of neighbors) {
        const j3 = nj * 3;
        const dx = pix - pred[j3],
          dy = piy - pred[j3 + 1],
          dz = piz - pred[j3 + 2];
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (r > 1e-7 && r < h) {
          const diff = h - r;
          const s = (spikyCoeff * diff * diff) / (restDensity * r);
          corrX += dx * (lambdaI + lambdaI) * s;
          corrY += dy * (lambdaI + lambdaI) * s;
          corrZ += dz * (lambdaI + lambdaI) * s;
        }
      }

      pred[i3] += corrX;
      pred[i3 + 1] += corrY;
      pred[i3 + 2] += corrZ;
    }
  }

  /**
   * Configure density constraints for fluid particles in the unified buffer.
   * Call this to enable fluid-PBD coupling.
   */
  public setDensityParticles(
    particleIndices: number[],
    neighbors: number[][],
    restDensity = 1000,
    kernelRadius = 0.1,
    compliance = 0.0001
  ): void {
    this.densityParticles = particleIndices;
    this.densityNeighbors = neighbors;
    this.densityRestDensity = restDensity;
    this.densityKernelRadius = kernelRadius;
    this.densityCompliance = compliance;
  }

  private solveSelfCollision(): void {
    const pred = this.state.predicted;
    const masses = this.config.masses;
    const numVerts = pred.length / 3;
    const cellSize = this.config.selfCollisionCellSize ?? 0.1;
    const radius = cellSize * 0.5;

    // Build spatial hash (CPU Map-based)
    const cellMap = new Map<string, number[]>();

    for (let i = 0; i < numVerts; i++) {
      if (masses[i] <= 0) continue;
      const cx = Math.floor(pred[i * 3] / cellSize);
      const cy = Math.floor(pred[i * 3 + 1] / cellSize);
      const cz = Math.floor(pred[i * 3 + 2] / cellSize);
      const key = `${cx}_${cy}_${cz}`;
      let list = cellMap.get(key);
      if (!list) {
        list = [];
        cellMap.set(key, list);
      }
      list.push(i);
    }

    // Resolve: iterate 27 neighbors for each vertex
    const radiusSq = radius * radius;
    for (let i = 0; i < numVerts; i++) {
      if (masses[i] <= 0) continue;
      const px = pred[i * 3],
        py = pred[i * 3 + 1],
        pz = pred[i * 3 + 2];
      const wi = 1 / masses[i];
      const cx = Math.floor(px / cellSize);
      const cy = Math.floor(py / cellSize);
      const cz = Math.floor(pz / cellSize);

      let corrX = 0,
        corrY = 0,
        corrZ = 0;

      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const key = `${cx + dx}_${cy + dy}_${cz + dz}`;
            const cell = cellMap.get(key);
            if (!cell) continue;

            for (const j of cell) {
              if (j === i) continue;
              const qx = pred[j * 3] - px;
              const qy = pred[j * 3 + 1] - py;
              const qz = pred[j * 3 + 2] - pz;
              const distSq = qx * qx + qy * qy + qz * qz;

              if (distSq < radiusSq && distSq > 1e-10) {
                const dist = Math.sqrt(distSq);
                const pen = radius - dist;
                const wj = masses[j] > 0 ? 1 / masses[j] : 0;
                const wSum = wi + wj;
                if (wSum < 1e-7) continue;
                const scale = pen / (wSum * dist);
                corrX -= qx * scale * wi;
                corrY -= qy * scale * wi;
                corrZ -= qz * scale * wi;
              }
            }
          }
        }
      }

      pred[i * 3] += corrX;
      pred[i * 3 + 1] += corrY;
      pred[i * 3 + 2] += corrZ;
    }
  }

  /**
   * Update the target position of an existing attachment constraint.
   * Used for dynamic targets like grab interaction or rigid body following.
   */
  public updateAttachmentTarget(vertexIndex: number, newTarget: IVector3): void {
    for (const ac of this.attachmentConstraints) {
      if (ac.vertexIndex === vertexIndex) {
        ac.targetPosition = newTarget;
        return;
      }
    }
  }

  private solveSdfCollision(collider: ISDFCollider, margin: number): void {
    const pred = this.state.predicted;
    const masses = this.config.masses;
    const numVerts = pred.length / 3;
    const { boundsMin, boundsMax, gridSize, sdfData, cellSize } = collider;

    for (let i = 0; i < numVerts; i++) {
      if (masses[i] <= 0) continue;
      const px = pred[i * 3],
        py = pred[i * 3 + 1],
        pz = pred[i * 3 + 2];

      if (
        px < boundsMin.x ||
        px > boundsMax.x ||
        py < boundsMin.y ||
        py > boundsMax.y ||
        pz < boundsMin.z ||
        pz > boundsMax.z
      )
        continue;

      // Sample SDF via trilinear interpolation
      const lx = (px - boundsMin.x) / cellSize;
      const ly = (py - boundsMin.y) / cellSize;
      const lz = (pz - boundsMin.z) / cellSize;
      const gix = Math.min(Math.max(Math.floor(lx), 0), gridSize[0] - 2);
      const giy = Math.min(Math.max(Math.floor(ly), 0), gridSize[1] - 2);
      const giz = Math.min(Math.max(Math.floor(lz), 0), gridSize[2] - 2);
      const fx = lx - gix,
        fy = ly - giy,
        fz = lz - giz;

      const stride = gridSize[0];
      const sliceStride = gridSize[0] * gridSize[1];
      const idx = gix + giy * stride + giz * sliceStride;

      const c00 = sdfData[idx] * (1 - fx) + sdfData[idx + 1] * fx;
      const c10 = sdfData[idx + stride] * (1 - fx) + sdfData[idx + stride + 1] * fx;
      const c01 = sdfData[idx + sliceStride] * (1 - fx) + sdfData[idx + sliceStride + 1] * fx;
      const c11 =
        sdfData[idx + stride + sliceStride] * (1 - fx) +
        sdfData[idx + stride + sliceStride + 1] * fx;
      const c0 = c00 * (1 - fy) + c10 * fy;
      const c1 = c01 * (1 - fy) + c11 * fy;
      const dist = c0 * (1 - fz) + c1 * fz;

      if (dist < margin) {
        // Compute gradient (finite difference)
        const eps = cellSize * 0.5;
        const sampleAt = (ox: number, oy: number, oz: number) => {
          const sx = (px + ox - boundsMin.x) / cellSize;
          const sy = (py + oy - boundsMin.y) / cellSize;
          const sz = (pz + oz - boundsMin.z) / cellSize;
          const si =
            Math.min(Math.max(Math.floor(sx), 0), gridSize[0] - 1) +
            Math.min(Math.max(Math.floor(sy), 0), gridSize[1] - 1) * stride +
            Math.min(Math.max(Math.floor(sz), 0), gridSize[2] - 1) * sliceStride;
          return sdfData[si] ?? 1e6;
        };
        let nx = sampleAt(eps, 0, 0) - sampleAt(-eps, 0, 0);
        let ny = sampleAt(0, eps, 0) - sampleAt(0, -eps, 0);
        let nz = sampleAt(0, 0, eps) - sampleAt(0, 0, -eps);
        const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nLen > 1e-7) {
          nx /= nLen;
          ny /= nLen;
          nz /= nLen;
          const pen = margin - dist;
          pred[i * 3] += nx * pen;
          pred[i * 3 + 1] += ny * pen;
          pred[i * 3 + 2] += nz * pen;
        }
      }
    }
  }

  private recomputeNormals(): void {
    const { positions, normals } = this.state;
    const indices = this.config.indices;
    const numVerts = positions.length / 3;
    const numTris = indices.length / 3;

    // Zero normals
    normals.fill(0);

    // Accumulate face normals
    for (let t = 0; t < numTris; t++) {
      const i0 = indices[t * 3],
        i1 = indices[t * 3 + 1],
        i2 = indices[t * 3 + 2];
      const p0x = positions[i0 * 3],
        p0y = positions[i0 * 3 + 1],
        p0z = positions[i0 * 3 + 2];
      const e1x = positions[i1 * 3] - p0x,
        e1y = positions[i1 * 3 + 1] - p0y,
        e1z = positions[i1 * 3 + 2] - p0z;
      const e2x = positions[i2 * 3] - p0x,
        e2y = positions[i2 * 3 + 1] - p0y,
        e2z = positions[i2 * 3 + 2] - p0z;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;

      for (const idx of [i0, i1, i2]) {
        normals[idx * 3] += nx;
        normals[idx * 3 + 1] += ny;
        normals[idx * 3 + 2] += nz;
      }
    }

    // Normalize
    for (let i = 0; i < numVerts; i++) {
      const nx = normals[i * 3],
        ny = normals[i * 3 + 1],
        nz = normals[i * 3 + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-7) {
        normals[i * 3] /= len;
        normals[i * 3 + 1] /= len;
        normals[i * 3 + 2] /= len;
      } else {
        normals[i * 3 + 1] = 1;
      }
    }
  }

  /** Get current state (positions, normals, etc.) */
  public getState(): ISoftBodyState {
    return this.state;
  }

  /** Pause/resume */
  public setActive(active: boolean): void {
    this.state.isActive = active;
  }

  /** Reset to rest shape */
  public reset(): void {
    this.state.positions.set(this.config.positions);
    this.state.velocities.fill(0);
    this.state.predicted.set(this.config.positions);
    this.state.deformationAmount = 0;
    this.state.volume = this.state.restVolume;
    this.recomputeNormals();
  }
}

// =============================================================================
// GPU PBD Solver (WebGPU implementation)
// =============================================================================

/**
 * GPU-accelerated PBD solver.
 * Uses WebGPU compute shaders for massively parallel constraint solving.
 */
export class PBDSolverGPU {
  private config: ISoftBodyConfig;
  private state: ISoftBodyState;

  private device: GPUDevice;
  private buffers: {
    positions: GPUBuffer;
    velocities: GPUBuffer;
    predicted: GPUBuffer;
    masses: GPUBuffer;
    indices: GPUBuffer;
    constraints: GPUBuffer;
    restLengths?: GPUBuffer;
    restAngles?: GPUBuffer;
    simParams: GPUBuffer;
    solveParams: GPUBuffer;
    normals: GPUBuffer;
  } | null = null;

  private pipelines: {
    predict: GPUComputePipeline;
    solveDistance: GPUComputePipeline;
    solveVolume: GPUComputePipeline;
    solveBending: GPUComputePipeline;
    velocity: GPUComputePipeline;
    finalize: GPUComputePipeline;
    normals: GPUComputePipeline;
    normalize: GPUComputePipeline;
  } | null = null;

  private bindGroups: {
    predict: GPUBindGroup;
    solveDistance: GPUBindGroup[];
    solveVolume: GPUBindGroup;
    velocity: GPUBindGroup;
    finalize: GPUBindGroup;
    normals: GPUBindGroup;
    normalize: GPUBindGroup;
  } | null = null;

  private coloring: IConstraintColoring | null = null;

  constructor(config: ISoftBodyConfig, device: GPUDevice) {
    this.config = config;
    this.device = device;
    const numVerts = config.positions.length / 3;

    this.state = {
      id: config.id,
      positions: new Float32Array(config.positions),
      velocities: new Float32Array(numVerts * 3),
      predicted: new Float32Array(numVerts * 3),
      normals: new Float32Array(numVerts * 3),
      volume: 0,
      restVolume: 0,
      deformationAmount: 0,
      centerOfMass: { x: 0, y: 0, z: 0 },
      isActive: true,
    };
  }

  /**
   * Initialize GPU resources (buffers, pipelines, bind groups).
   */
  public async initialize(): Promise<void> {
    const { positions, masses, indices, edges, tetIndices: _tetIndices } = this.config;
    const numVerts = positions.length / 3;
    const _numTris = indices.length / 3;

    // 1. Create Buffers
    this.buffers = {
      positions: this.createBuffer(
        positions,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
      ),
      velocities: this.createBuffer(new Float32Array(numVerts * 3), GPUBufferUsage.STORAGE),
      predicted: this.createBuffer(
        new Float32Array(numVerts * 3),
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
      ),
      masses: this.createBuffer(masses, GPUBufferUsage.STORAGE),
      indices: this.createBuffer(indices, GPUBufferUsage.STORAGE),
      normals: this.createBuffer(new Int32Array(numVerts * 3), GPUBufferUsage.STORAGE),
      simParams: this.device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
      solveParams: this.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
      constraints: this.createBuffer(edges, GPUBufferUsage.STORAGE), // Simplified for distance
    };

    // 2. Extract and color constraints
    const edgePairs: Array<{ vertexA: number; vertexB: number }> = [];
    for (let i = 0; i < edges.length / 2; i++) {
      edgePairs.push({ vertexA: edges[i * 2], vertexB: edges[i * 2 + 1] });
    }
    this.coloring = colorConstraints(edgePairs, numVerts);

    // Sort and store distance constraints by color group
    const sortedEdges = new Uint32Array(edges.length);
    const restLengths = computeRestLengths(positions, edges);
    const sortedRestLengths = new Float32Array(restLengths.length);

    for (let i = 0; i < this.coloring.sortedIndices.length; i++) {
      const ci = this.coloring.sortedIndices[i];
      sortedEdges[i * 2] = edges[ci * 2];
      sortedEdges[i * 2 + 1] = edges[ci * 2 + 1];
      sortedRestLengths[i] = restLengths[ci];
    }

    this.buffers.constraints = this.createBuffer(sortedEdges, GPUBufferUsage.STORAGE);
    this.buffers.restLengths = this.createBuffer(sortedRestLengths, GPUBufferUsage.STORAGE);

    // 3. Create Pipelines
    this.pipelines = {
      predict: this.createPipeline(PBD_PREDICT_SHADER),
      solveDistance: this.createPipeline(PBD_DISTANCE_SHADER),
      solveVolume: this.createPipeline(PBD_VOLUME_SHADER),
      solveBending: this.createPipeline(PBD_BENDING_SHADER),
      velocity: this.createPipeline(PBD_VELOCITY_SHADER),
      finalize: this.createPipeline(PBD_FINALIZE_SHADER),
      normals: this.createPipeline(PBD_NORMALS_SHADER),
      normalize: this.createPipeline(PBD_NORMALIZE_SHADER),
    };

    // 4. Create Bind Groups
    this.bindGroups = {
      predict: this.device.createBindGroup({
        layout: this.pipelines.predict.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.positions } },
          { binding: 1, resource: { buffer: this.buffers.velocities } },
          { binding: 2, resource: { buffer: this.buffers.predicted } },
          { binding: 3, resource: { buffer: this.buffers.masses } },
          { binding: 4, resource: { buffer: this.buffers.simParams } },
        ],
      }),
      solveDistance: [], // Populated below
      solveVolume: this.device.createBindGroup({
        layout: this.pipelines.solveVolume.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.predicted } },
          { binding: 1, resource: { buffer: this.buffers.masses } },
          { binding: 2, resource: { buffer: this.buffers.constraints } }, // Placeholder
          { binding: 3, resource: { buffer: this.buffers.solveParams } },
        ],
      }),
      velocity: this.device.createBindGroup({
        layout: this.pipelines.velocity.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.positions } },
          { binding: 1, resource: { buffer: this.buffers.velocities } },
          { binding: 2, resource: { buffer: this.buffers.predicted } },
          { binding: 3, resource: { buffer: this.buffers.simParams } },
        ],
      }),
      finalize: this.device.createBindGroup({
        layout: this.pipelines.finalize.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.positions } },
          { binding: 1, resource: { buffer: this.buffers.predicted } },
          { binding: 2, resource: { buffer: this.buffers.simParams } },
        ],
      }),
      normals: this.device.createBindGroup({
        layout: this.pipelines.normals.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.positions } },
          { binding: 1, resource: { buffer: this.buffers.normals } },
          { binding: 2, resource: { buffer: this.buffers.indices } },
          { binding: 3, resource: { buffer: this.buffers.simParams } }, // Using simParams for numTris
        ],
      }),
      normalize: this.device.createBindGroup({
        layout: this.pipelines.normalize.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.normals } },
          { binding: 1, resource: { buffer: this.buffers.predicted } }, // Recycling predicted for float normals
          { binding: 2, resource: { buffer: this.buffers.simParams } },
        ],
      }),
    };

    // Distance bind groups per color group
    for (let g = 0; g < this.coloring.numColors; g++) {
      // Ideally we'd use offsets into a single large buffer, but for simplicity:
      this.bindGroups.solveDistance.push(
        this.device.createBindGroup({
          layout: this.pipelines.solveDistance.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.buffers.predicted } },
            { binding: 1, resource: { buffer: this.buffers.masses } },
            { binding: 2, resource: { buffer: this.buffers.constraints } },
            { binding: 3, resource: { buffer: this.buffers.solveParams } },
          ],
        })
      );
    }
  }

  private createBuffer(data: Float32Array | Uint32Array | Int32Array, usage: number): GPUBuffer {
    const buffer = this.device.createBuffer({
      size: data.byteLength,
      usage,
      mappedAtCreation: true,
    });
    const TypedArrayCtor = data.constructor as new (buffer: ArrayBuffer) => typeof data;
    new TypedArrayCtor(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  }

  private createPipeline(shaderCode: string): GPUComputePipeline {
    return this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: this.device.createShaderModule({ code: shaderCode }),
        entryPoint: shaderCode.includes('cs_predict')
          ? 'cs_predict'
          : shaderCode.includes('cs_solve_distance')
            ? 'cs_solve_distance'
            : shaderCode.includes('cs_solve_volume')
              ? 'cs_solve_volume'
              : shaderCode.includes('cs_update_velocity')
                ? 'cs_update_velocity'
                : shaderCode.includes('cs_finalize')
                  ? 'cs_finalize'
                  : shaderCode.includes('cs_compute_normals')
                    ? 'cs_compute_normals'
                    : shaderCode.includes('cs_normalize_normals')
                      ? 'cs_normalize_normals'
                        : 'main',
      },
    });
  }

  /**
   * Step the simulation.
   */
  public step(dt: number): ISoftBodyState {
    if (!this.state.isActive || !this.buffers || !this.pipelines || !this.bindGroups || dt <= 0)
      return this.state;

    const { gravity, solverIterations } = this.config;
    const numVerts = this.config.positions.length / 3;

    // Update Uniforms
    const simParams = new Float32Array([
      gravity?.x ?? 0,
      gravity?.y ?? -9.81,
      gravity?.z ?? 0,
      dt,
      0,
      0,
      0,
      this.config.damping, // wind, damping
      numVerts,
      0,
      0,
      0, // numVertices, padding
    ]);
    this.device.queue.writeBuffer(this.buffers.simParams, 0, simParams);

    const commandEncoder = this.device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();

    // 1. Predict
    pass.setPipeline(this.pipelines.predict);
    pass.setBindGroup(0, this.bindGroups.predict);
    pass.dispatchWorkgroups(Math.ceil(numVerts / 256));

    // 2. Solve Constraints
    for (let i = 0; i < solverIterations; i++) {
      // Distance
      if (this.coloring) {
        pass.setPipeline(this.pipelines.solveDistance);
        for (let g = 0; g < this.coloring.numColors; g++) {
          const solveParams = new Float32Array([dt, this.coloring.groupCounts[g], i, 0]);
          this.device.queue.writeBuffer(this.buffers.solveParams, 0, solveParams);
          pass.setBindGroup(0, this.bindGroups.solveDistance[g]);
          pass.dispatchWorkgroups(Math.ceil(this.coloring.groupCounts[g] / 256));
        }
      }
    }

    // 3. Update Velocity
    pass.setPipeline(this.pipelines.velocity);
    pass.setBindGroup(0, this.bindGroups.velocity);
    pass.dispatchWorkgroups(Math.ceil(numVerts / 256));

    // 4. Finalize
    pass.setPipeline(this.pipelines.finalize);
    pass.setBindGroup(0, this.bindGroups.finalize);
    pass.dispatchWorkgroups(Math.ceil(numVerts / 256));

    pass.end();
    this.device.queue.submit([commandEncoder.finish()]);

    // Note: In a real high-performance loop, we wouldn't read back every frame
    // unless necessary for logic. For now we just return the state object.
    return this.state;
  }

  public getState(): ISoftBodyState {
    // In a real implementation we might want an async readBack()
    return this.state;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a soft-body solver with the given configuration.
 * Applies preset parameters if a preset is specified.
 */
export async function createPBDSolver(
  config: ISoftBodyConfig
): Promise<PBDSolverCPU | PBDSolverGPU> {
  // Apply preset if specified
  if (config.preset) {
    const presetValues: Record<
      SoftBodyPreset,
      {
        compliance: number;
        damping: number;
        solverIterations: number;
        selfCollision: boolean;
      }
    > = {
      rubber: { compliance: 0.001, damping: 0.98, solverIterations: 20, selfCollision: false },
      cloth: { compliance: 0.1, damping: 0.95, solverIterations: 15, selfCollision: true },
      jelly: { compliance: 0.05, damping: 0.97, solverIterations: 12, selfCollision: false },
      flesh: { compliance: 0.01, damping: 0.99, solverIterations: 20, selfCollision: false },
      paper: { compliance: 0.5, damping: 0.9, solverIterations: 8, selfCollision: true },
    };
    const p = presetValues[config.preset];
    config = { ...config, ...p };
  }

  // Attempt to use WebGPU if available and requested
  const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<GPUAdapter> } };
  if (config.useGPU && nav.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) throw new Error('No GPU adapter available');
      const device = await adapter.requestDevice();
      const solver = new PBDSolverGPU(config, device);
      await solver.initialize();
      return solver;
    } catch (e) {
      console.warn('[PBDSolver] WebGPU initialization failed, falling back to CPU:', e);
    }
  }

  return new PBDSolverCPU(config);
}

