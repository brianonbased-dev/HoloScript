/**
 * MLS-MPM Particle-to-Grid (P2G) Transfer — WebGPU Compute Shader
 *
 * Scatters particle mass, momentum, and affine momentum to the background
 * Eulerian grid using quadratic B-spline interpolation weights.
 *
 * Uses atomicAdd on fixed-point integers since WebGPU lacks atomic float add.
 * Scale factor: 1024 (10-bit fractional precision).
 *
 * @module gpu/shaders
 */

// =============================================================================
// Uniforms
// =============================================================================

struct SimParams {
  grid_res: u32,          // Grid cells per axis (e.g. 128)
  num_particles: u32,     // Total particle count
  dt: f32,                // Timestep
  dx: f32,                // Grid cell size (domain_size / grid_res)
  inv_dx: f32,            // 1.0 / dx
  gravity_y: f32,         // Gravity (negative = down)
  rest_density: f32,      // Target density (e.g. 1000 for water)
  bulk_modulus: f32,      // Compressibility stiffness (e.g. 50)
  viscosity: f32,         // Dynamic viscosity
  wind_x: f32,           // External wind force X (m/s²)
  wind_y: f32,           // External wind force Y (m/s²)
  wind_z: f32,           // External wind force Z (m/s²)
}

@group(0) @binding(0) var<uniform> params: SimParams;

// =============================================================================
// Storage Buffers
// =============================================================================

// Particle data (SoA layout)
@group(0) @binding(1) var<storage, read> p_pos: array<vec4<f32>>;     // xyz = position, w = volume
@group(0) @binding(2) var<storage, read> p_vel: array<vec4<f32>>;     // xyz = velocity, w = mass
@group(0) @binding(3) var<storage, read> p_C: array<mat4x4<f32>>;    // Affine momentum matrix (APIC, 3x3 in 4x4)
@group(0) @binding(4) var<storage, read> p_J: array<f32>;            // Determinant of deformation gradient

// Grid data (fixed-point integers for atomic ops)
// Layout: grid_res^3 cells, each with (mass, momentum_x, momentum_y, momentum_z) as i32
@group(0) @binding(5) var<storage, read_write> grid_mass: array<atomic<i32>>;
@group(0) @binding(6) var<storage, read_write> grid_momentum_x: array<atomic<i32>>;
@group(0) @binding(7) var<storage, read_write> grid_momentum_y: array<atomic<i32>>;
@group(0) @binding(8) var<storage, read_write> grid_momentum_z: array<atomic<i32>>;

// =============================================================================
// Constants
// =============================================================================

const FIXED_POINT_SCALE: f32 = 1024.0;
const FIXED_POINT_SCALE_I: i32 = 1024;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert 3D grid index to flat array index
 */
fn gridIndex(ix: u32, iy: u32, iz: u32) -> u32 {
  return ix + iy * params.grid_res + iz * params.grid_res * params.grid_res;
}

/**
 * Quadratic B-spline weight for MLS-MPM
 * Returns weights for 3 neighboring cells along one axis
 */
fn bsplineWeights(fx: f32) -> vec3<f32> {
  let w0 = 0.5 * (1.5 - fx) * (1.5 - fx);
  let w1 = 0.75 - (fx - 1.0) * (fx - 1.0);
  let w2 = 0.5 * (fx - 0.5) * (fx - 0.5);
  return vec3<f32>(w0, w1, w2);
}

/**
 * Float to fixed-point i32
 */
fn toFixed(v: f32) -> i32 {
  return i32(v * FIXED_POINT_SCALE);
}

// =============================================================================
// P2G Kernel
// =============================================================================

@compute @workgroup_size(256)
fn cs_p2g(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pid = gid.x;
  if (pid >= params.num_particles) { return; }

  // Load particle state
  let pos = p_pos[pid].xyz;
  let volume = p_pos[pid].w;
  let vel = p_vel[pid].xyz;
  let mass = p_vel[pid].w;
  let C = p_C[pid];
  let J = p_J[pid];

  // Compute stress from equation of state (weakly compressible)
  // pressure = bulk_modulus * (1 - 1/J)
  // For J > 1 (expansion): negative pressure (attraction)
  // For J < 1 (compression): positive pressure (repulsion)
  let pressure = -params.bulk_modulus * (1.0 / J - 1.0);

  // Cauchy stress = -pressure * I + viscosity * (C + C^T)
  // For fluid, stress is isotropic pressure + viscous term
  let stress_diag = pressure;
  let viscous_scale = params.viscosity;

  // Grid cell containing this particle
  let grid_pos = pos * params.inv_dx;
  let base_i = vec3<u32>(vec3<i32>(grid_pos - 0.5));

  // Fractional position within cell (for B-spline weights)
  let fx = grid_pos - vec3<f32>(base_i) - 0.5;

  // B-spline weights along each axis
  let wx = bsplineWeights(fx.x + 0.5);
  let wy = bsplineWeights(fx.y + 0.5);
  let wz = bsplineWeights(fx.z + 0.5);

  // Scatter to 3x3x3 neighborhood
  for (var di = 0u; di < 3u; di++) {
    for (var dj = 0u; dj < 3u; dj++) {
      for (var dk = 0u; dk < 3u; dk++) {
        let cell_i = base_i.x + di;
        let cell_j = base_i.y + dj;
        let cell_k = base_i.z + dk;

        // Bounds check
        if (cell_i >= params.grid_res || cell_j >= params.grid_res || cell_k >= params.grid_res) {
          continue;
        }

        // Combined weight
        let weight = wx[di] * wy[dj] * wz[dk];

        // Offset from particle to grid node
        let dpos = vec3<f32>(vec3<f32>(f32(di), f32(dj), f32(dk)) - fx - 0.5) * params.dx;

        // APIC momentum transfer: m_i * (v_p + C_p * (x_i - x_p))
        let affine_vel = vel + vec3<f32>(
          C[0].x * dpos.x + C[0].y * dpos.y + C[0].z * dpos.z,
          C[1].x * dpos.x + C[1].y * dpos.y + C[1].z * dpos.z,
          C[2].x * dpos.x + C[2].y * dpos.y + C[2].z * dpos.z,
        );

        // Stress contribution to momentum
        // Force = -volume * stress * grad_w
        let stress_force = vec3<f32>(
          stress_diag * dpos.x,
          stress_diag * dpos.y,
          stress_diag * dpos.z,
        ) * (-volume * 4.0 * params.inv_dx * params.inv_dx);

        let momentum = weight * mass * affine_vel + weight * params.dt * stress_force;

        // Atomic scatter (fixed-point)
        let idx = gridIndex(cell_i, cell_j, cell_k);
        atomicAdd(&grid_mass[idx], toFixed(weight * mass));
        atomicAdd(&grid_momentum_x[idx], toFixed(momentum.x));
        atomicAdd(&grid_momentum_y[idx], toFixed(momentum.y));
        atomicAdd(&grid_momentum_z[idx], toFixed(momentum.z));
      }
    }
  }
}
