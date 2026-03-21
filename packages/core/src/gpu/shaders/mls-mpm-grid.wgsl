/**
 * MLS-MPM Grid Update — WebGPU Compute Shader
 *
 * After P2G scatter, this kernel:
 *   1. Converts fixed-point grid mass/momentum back to float
 *   2. Applies gravity to grid momentum
 *   3. Enforces boundary conditions (solid walls)
 *   4. Computes grid velocity = momentum / mass
 *
 * @module gpu/shaders
 */

// =============================================================================
// Uniforms
// =============================================================================

struct SimParams {
  grid_res: u32,
  num_particles: u32,
  dt: f32,
  dx: f32,
  inv_dx: f32,
  gravity_y: f32,
  rest_density: f32,
  bulk_modulus: f32,
  viscosity: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> params: SimParams;

// =============================================================================
// Storage Buffers
// =============================================================================

// Grid data (fixed-point from P2G)
@group(0) @binding(1) var<storage, read> grid_mass_in: array<i32>;
@group(0) @binding(2) var<storage, read> grid_momentum_x_in: array<i32>;
@group(0) @binding(3) var<storage, read> grid_momentum_y_in: array<i32>;
@group(0) @binding(4) var<storage, read> grid_momentum_z_in: array<i32>;

// Grid velocity output (float, for G2P to read)
@group(0) @binding(5) var<storage, read_write> grid_velocity: array<vec4<f32>>;

// =============================================================================
// Constants
// =============================================================================

const FIXED_POINT_INV: f32 = 1.0 / 1024.0;
const BOUNDARY_CELLS: u32 = 3u;  // Cells from edge for boundary condition

// =============================================================================
// Grid Update Kernel
// =============================================================================

@compute @workgroup_size(64)
fn cs_grid_update(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total_cells = params.grid_res * params.grid_res * params.grid_res;
  if (idx >= total_cells) { return; }

  // Convert fixed-point back to float
  let mass = f32(grid_mass_in[idx]) * FIXED_POINT_INV;

  // Skip empty cells
  if (mass <= 0.0001) {
    grid_velocity[idx] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return;
  }

  // Momentum to velocity
  var vel = vec3<f32>(
    f32(grid_momentum_x_in[idx]) * FIXED_POINT_INV / mass,
    f32(grid_momentum_y_in[idx]) * FIXED_POINT_INV / mass,
    f32(grid_momentum_z_in[idx]) * FIXED_POINT_INV / mass,
  );

  // Apply gravity
  vel.y += params.gravity_y * params.dt;

  // Boundary conditions (solid walls)
  // Decompose flat index to 3D
  let iz = idx / (params.grid_res * params.grid_res);
  let iy = (idx - iz * params.grid_res * params.grid_res) / params.grid_res;
  let ix = idx - iz * params.grid_res * params.grid_res - iy * params.grid_res;

  // Clamp velocity at boundaries (no-slip or free-slip)
  if (ix < BOUNDARY_CELLS && vel.x < 0.0) { vel.x = 0.0; }
  if (ix >= params.grid_res - BOUNDARY_CELLS && vel.x > 0.0) { vel.x = 0.0; }
  if (iy < BOUNDARY_CELLS && vel.y < 0.0) { vel.y = 0.0; }
  if (iy >= params.grid_res - BOUNDARY_CELLS && vel.y > 0.0) { vel.y = 0.0; }
  if (iz < BOUNDARY_CELLS && vel.z < 0.0) { vel.z = 0.0; }
  if (iz >= params.grid_res - BOUNDARY_CELLS && vel.z > 0.0) { vel.z = 0.0; }

  grid_velocity[idx] = vec4<f32>(vel, mass);
}

// =============================================================================
// Grid Clear Kernel
// =============================================================================

@compute @workgroup_size(256)
fn cs_grid_clear(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total_cells = params.grid_res * params.grid_res * params.grid_res;
  if (idx >= total_cells) { return; }

  // Reset grid for next frame (called BEFORE P2G)
  // Note: atomicStore not needed here since grid is exclusively written
  grid_velocity[idx] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
}
