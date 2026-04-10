/**
 * SSFR Bilateral Filter — WebGPU Compute Shader
 *
 * Smooths the depth buffer from the SSFR depth pass while preserving edges.
 * Uses a bilateral Gaussian filter: spatial weight * range weight.
 *
 * Also computes screen-space normals from the filtered depth.
 *
 * @module gpu/shaders
 */

struct FilterParams {
  viewport_width: u32,
  viewport_height: u32,
  filter_radius: u32,        // Kernel half-size (default: 7)
  sigma_spatial: f32,         // Spatial Gaussian sigma (default: 3.0)
  sigma_range: f32,           // Range Gaussian sigma (default: 0.05)
  near: f32,
  far: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> params: FilterParams;

// Input: raw depth from depth pass
@group(0) @binding(1) var depth_in: texture_2d<f32>;

// Output: filtered depth
@group(0) @binding(2) var depth_out: texture_storage_2d<r32float, write>;

// Output: screen-space normals (computed from filtered depth)
@group(0) @binding(3) var normals_out: texture_storage_2d<rgba16float, write>;

// =============================================================================
// Bilateral Filter
// =============================================================================

@compute @workgroup_size(16, 16)
fn cs_bilateral_filter(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;

  if (x >= params.viewport_width || y >= params.viewport_height) {
    return;
  }

  let center_depth = textureLoad(depth_in, vec2<u32>(x, y), 0).r;

  // Skip background pixels
  if (center_depth <= 0.0 || center_depth >= params.far * 0.99) {
    textureStore(depth_out, vec2<u32>(x, y), vec4<f32>(0.0));
    textureStore(normals_out, vec2<u32>(x, y), vec4<f32>(0.0, 0.0, 1.0, 0.0));
    return;
  }

  var sum_depth: f32 = 0.0;
  var sum_weight: f32 = 0.0;
  let r = i32(params.filter_radius);
  let inv_sigma_s2 = -0.5 / (params.sigma_spatial * params.sigma_spatial);
  let inv_sigma_r2 = -0.5 / (params.sigma_range * params.sigma_range);

  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      let sx = i32(x) + dx;
      let sy = i32(y) + dy;

      // Bounds check
      if (sx < 0 || sy < 0 || sx >= i32(params.viewport_width) || sy >= i32(params.viewport_height)) {
        continue;
      }

      let sample_depth = textureLoad(depth_in, vec2<u32>(u32(sx), u32(sy)), 0).r;
      if (sample_depth <= 0.0) { continue; }

      // Spatial weight (Gaussian based on pixel distance)
      let dist2 = f32(dx * dx + dy * dy);
      let w_spatial = exp(dist2 * inv_sigma_s2);

      // Range weight (Gaussian based on depth difference)
      let d_diff = sample_depth - center_depth;
      let w_range = exp(d_diff * d_diff * inv_sigma_r2);

      let weight = w_spatial * w_range;
      sum_depth += sample_depth * weight;
      sum_weight += weight;
    }
  }

  let filtered_depth = select(center_depth, sum_depth / sum_weight, sum_weight > 0.0);
  textureStore(depth_out, vec2<u32>(x, y), vec4<f32>(filtered_depth, 0.0, 0.0, 0.0));
}

// =============================================================================
// Normal Computation (from filtered depth)
// =============================================================================

@compute @workgroup_size(16, 16)
fn cs_compute_normals(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;

  if (x >= params.viewport_width || y >= params.viewport_height) {
    return;
  }

  if (x == 0u || y == 0u || x >= params.viewport_width - 1u || y >= params.viewport_height - 1u) {
    textureStore(normals_out, vec2<u32>(x, y), vec4<f32>(0.0, 0.0, 1.0, 0.0));
    return;
  }

  // Screen-space derivatives of depth
  let d_c = textureLoad(depth_in, vec2<u32>(x, y), 0).r;
  let d_r = textureLoad(depth_in, vec2<u32>(x + 1u, y), 0).r;
  let d_u = textureLoad(depth_in, vec2<u32>(x, y + 1u), 0).r;

  if (d_c <= 0.0 || d_r <= 0.0 || d_u <= 0.0) {
    textureStore(normals_out, vec2<u32>(x, y), vec4<f32>(0.0, 0.0, 1.0, 0.0));
    return;
  }

  let dzdx = d_r - d_c;
  let dzdy = d_u - d_c;

  // Normal from cross product of tangent vectors
  var normal = normalize(vec3<f32>(-dzdx, -dzdy, 1.0));

  // Encode to [0,1] for storage
  textureStore(normals_out, vec2<u32>(x, y), vec4<f32>(normal * 0.5 + 0.5, 1.0));
}
