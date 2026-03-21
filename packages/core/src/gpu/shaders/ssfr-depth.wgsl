/**
 * SSFR Depth Pass — WebGPU Render Shader
 *
 * Screen-Space Fluid Rendering: renders fluid particles as point sprites
 * to a depth buffer. Each particle is a sphere projected to screen space.
 *
 * Part of the SSFR pipeline:
 *   [1] Depth pass (this shader)    — particle → depth buffer
 *   [2] Thickness pass              — additive blending of particle thickness
 *   [3] Bilateral filter            — smooth depth to remove particle noise
 *   [4] Normal computation          — screen-space derivatives of filtered depth
 *   [5] Final shade                 — Fresnel + refraction + Beer-Lambert absorption
 *
 * @module gpu/shaders
 */

// =============================================================================
// Uniforms
// =============================================================================

struct CameraParams {
  view: mat4x4<f32>,
  projection: mat4x4<f32>,
  viewport_size: vec2<f32>,
  near: f32,
  far: f32,
  particle_radius: f32,
  resolution_scale: f32,    // 0.5 = half-res (default)
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> camera: CameraParams;

// =============================================================================
// Storage Buffers
// =============================================================================

@group(0) @binding(1) var<storage, read> p_pos: array<vec4<f32>>;  // xyz = position, w = volume

// =============================================================================
// Vertex Shader — Point Sprite Expansion
// =============================================================================

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) view_center: vec3<f32>,    // Particle center in view space
  @location(1) point_coord: vec2<f32>,    // -1 to 1 within sprite quad
  @location(2) radius_screen: f32,        // Particle radius in screen pixels
}

@vertex
fn vs_depth(
  @builtin(vertex_index) vertex_id: u32,
  @builtin(instance_index) instance_id: u32,
) -> VertexOutput {
  var out: VertexOutput;

  // Particle position in world space
  let world_pos = p_pos[instance_id].xyz;

  // Transform to view space
  let view_pos = camera.view * vec4<f32>(world_pos, 1.0);
  let center = view_pos.xyz;

  out.view_center = center;

  // Point sprite quad: 2 triangles forming a quad
  // Vertices: 0=(-1,-1), 1=(1,-1), 2=(-1,1), 3=(1,-1), 4=(1,1), 5=(-1,1)
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
  );

  let corner = corners[vertex_id];
  out.point_coord = corner;

  // Project radius to screen space
  let r = camera.particle_radius;
  let proj_scale = camera.projection[1][1]; // focal_y
  let screen_radius = r * proj_scale / (-center.z);
  out.radius_screen = screen_radius * camera.viewport_size.y * 0.5;

  // Offset vertex position by sprite corner in view space
  let offset = vec4<f32>(corner * r, 0.0, 0.0);
  let clip_pos = camera.projection * (view_pos + offset);

  out.position = clip_pos;
  return out;
}

// =============================================================================
// Fragment Shader — Sphere Depth
// =============================================================================

struct FragmentOutput {
  @builtin(frag_depth) depth: f32,
  @location(0) view_depth: f32,    // Linear depth for bilateral filter
}

@fragment
fn fs_depth(in: VertexOutput) -> FragmentOutput {
  var out: FragmentOutput;

  // Discard pixels outside the sphere
  let dist2 = dot(in.point_coord, in.point_coord);
  if (dist2 > 1.0) {
    discard;
  }

  // Compute sphere surface depth offset
  // z_offset = radius * sqrt(1 - x^2 - y^2)
  let z_offset = camera.particle_radius * sqrt(1.0 - dist2);

  // View-space depth of this fragment on the sphere surface
  let frag_z = in.view_center.z + z_offset;

  // Convert to clip-space depth for depth buffer
  // depth = (projection[2][2] * z + projection[3][2]) / (-z)
  let ndc_z = (camera.projection[2][2] * frag_z + camera.projection[3][2]) / (-frag_z);
  out.depth = ndc_z * 0.5 + 0.5;  // [0, 1] range

  // Store linear depth for bilateral filter
  out.view_depth = -frag_z;

  return out;
}
