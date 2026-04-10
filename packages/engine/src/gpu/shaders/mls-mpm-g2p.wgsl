/**
 * MLS-MPM Grid-to-Particle (G2P) Transfer — WebGPU Compute Shader
 *
 * Gathers grid velocities back to particles using quadratic B-spline
 * interpolation. Updates particle velocity, position, affine momentum
 * matrix (APIC), and deformation gradient determinant (J).
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
  wind_x: f32,
  wind_y: f32,
  wind_z: f32,
}

@group(0) @binding(0) var<uniform> params: SimParams;

// =============================================================================
// Storage Buffers
// =============================================================================

// Grid velocity (from grid update pass)
@group(0) @binding(1) var<storage, read> grid_velocity: array<vec4<f32>>;

// Particle data (read-write: updated in place)
@group(0) @binding(2) var<storage, read_write> p_pos: array<vec4<f32>>;     // xyz = position, w = volume
@group(0) @binding(3) var<storage, read_write> p_vel: array<vec4<f32>>;     // xyz = velocity, w = mass
@group(0) @binding(4) var<storage, read_write> p_C: array<mat4x4<f32>>;    // Affine momentum matrix
@group(0) @binding(5) var<storage, read_write> p_J: array<f32>;            // Deformation gradient det

// =============================================================================
// Helper Functions
// =============================================================================

fn gridIndex(ix: u32, iy: u32, iz: u32) -> u32 {
  return ix + iy * params.grid_res + iz * params.grid_res * params.grid_res;
}

fn bsplineWeights(fx: f32) -> vec3<f32> {
  let w0 = 0.5 * (1.5 - fx) * (1.5 - fx);
  let w1 = 0.75 - (fx - 1.0) * (fx - 1.0);
  let w2 = 0.5 * (fx - 0.5) * (fx - 0.5);
  return vec3<f32>(w0, w1, w2);
}

// =============================================================================
// G2P Kernel
// =============================================================================

@compute @workgroup_size(256)
fn cs_g2p(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pid = gid.x;
  if (pid >= params.num_particles) { return; }

  // Load particle position
  let pos = p_pos[pid].xyz;
  let volume = p_pos[pid].w;
  let mass = p_vel[pid].w;

  // Grid cell containing this particle
  let grid_pos = pos * params.inv_dx;
  let base_i = vec3<u32>(vec3<i32>(grid_pos - 0.5));

  // Fractional position within cell
  let fx = grid_pos - vec3<f32>(base_i) - 0.5;

  // B-spline weights
  let wx = bsplineWeights(fx.x + 0.5);
  let wy = bsplineWeights(fx.y + 0.5);
  let wz = bsplineWeights(fx.z + 0.5);

  // Accumulate velocity and affine momentum from grid
  var new_vel = vec3<f32>(0.0, 0.0, 0.0);
  var new_C = mat4x4<f32>(
    vec4<f32>(0.0), vec4<f32>(0.0), vec4<f32>(0.0), vec4<f32>(0.0)
  );

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

        let weight = wx[di] * wy[dj] * wz[dk];
        let idx = gridIndex(cell_i, cell_j, cell_k);
        let g_vel = grid_velocity[idx].xyz;

        // Offset from particle to grid node
        let dpos = vec3<f32>(f32(di), f32(dj), f32(dk)) - fx - 0.5;

        // Gather velocity
        new_vel += weight * g_vel;

        // APIC affine momentum matrix: C = sum(w_i * v_i * (x_i - x_p)^T)
        // Scaled by 4 * inv_dx^2 for the D^{-1} term
        let scale = 4.0 * params.inv_dx * params.inv_dx;
        new_C[0] += vec4<f32>(weight * g_vel.x * dpos * scale, 0.0);
        new_C[1] += vec4<f32>(weight * g_vel.y * dpos * scale, 0.0);
        new_C[2] += vec4<f32>(weight * g_vel.z * dpos * scale, 0.0);
      }
    }
  }

  // Update deformation gradient determinant
  // J_new = J_old * (1 + dt * trace(C))
  let trace_C = new_C[0].x + new_C[1].y + new_C[2].z;
  var new_J = p_J[pid] * (1.0 + params.dt * trace_C);

  // Clamp J to prevent instability
  new_J = clamp(new_J, 0.1, 10.0);

  // Advect particle
  let new_pos = pos + new_vel * params.dt;

  // Clamp to domain
  let margin = params.dx * 3.0;
  let domain_max = f32(params.grid_res) * params.dx - margin;
  let clamped_pos = clamp(new_pos, vec3<f32>(margin), vec3<f32>(domain_max));

  // Write back
  p_pos[pid] = vec4<f32>(clamped_pos, volume);
  p_vel[pid] = vec4<f32>(new_vel, mass);
  p_C[pid] = new_C;
  p_J[pid] = new_J;
}
