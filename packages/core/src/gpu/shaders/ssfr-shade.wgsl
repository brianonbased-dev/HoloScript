/**
 * SSFR Final Shading — WebGPU Fragment Shader
 *
 * Composites the fluid surface using:
 *   - Filtered depth + normals from bilateral filter pass
 *   - Fresnel reflections (Schlick approximation)
 *   - Beer-Lambert absorption for depth-based coloring
 *   - Environment refraction (perturbed background sampling)
 *
 * Renders as a fullscreen quad.
 *
 * @module gpu/shaders
 */

// =============================================================================
// Uniforms
// =============================================================================

struct ShadeParams {
  inv_projection: mat4x4<f32>,
  viewport_size: vec2<f32>,
  absorption_color: vec3<f32>,      // RGB absorption coefficients (e.g. [0.4, 0.04, 0.0] for water)
  absorption_strength: f32,          // Beer-Lambert absorption scale
  fresnel_power: f32,               // Schlick F0 base (default: 0.02 for water)
  refraction_strength: f32,          // UV offset scale for refraction (default: 0.1)
  specular_power: f32,              // Blinn-Phong specular exponent
  _pad: f32,
}

@group(0) @binding(0) var<uniform> params: ShadeParams;

// Textures from previous passes
@group(0) @binding(1) var filtered_depth: texture_2d<f32>;
@group(0) @binding(2) var normals_tex: texture_2d<f32>;
@group(0) @binding(3) var thickness_tex: texture_2d<f32>;
@group(0) @binding(4) var scene_color: texture_2d<f32>;     // Background scene
@group(0) @binding(5) var linear_sampler: sampler;

// =============================================================================
// Vertex Shader — Fullscreen Quad
// =============================================================================

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_fullscreen(@builtin(vertex_index) id: u32) -> VertexOutput {
  var out: VertexOutput;
  // Fullscreen triangle (3 vertices cover the screen)
  let x = f32(i32(id) / 2) * 4.0 - 1.0;
  let y = f32(i32(id) % 2) * 4.0 - 1.0;
  out.position = vec4<f32>(x, y, 0.0, 1.0);
  out.uv = vec2<f32>(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
  return out;
}

// =============================================================================
// Fragment Shader — Fluid Surface Compositing
// =============================================================================

@fragment
fn fs_shade(in: VertexOutput) -> @location(0) vec4<f32> {
  let pixel = vec2<u32>(in.uv * params.viewport_size);

  let depth = textureLoad(filtered_depth, pixel, 0).r;

  // Skip non-fluid pixels
  if (depth <= 0.0) {
    return textureSample(scene_color, linear_sampler, in.uv);
  }

  // Decode normals from [0,1] to [-1,1]
  let encoded_n = textureLoad(normals_tex, pixel, 0).rgb;
  let normal = normalize(encoded_n * 2.0 - 1.0);

  // Thickness for absorption
  let thickness = textureLoad(thickness_tex, pixel, 0).r;

  // Reconstruct view-space position from depth
  let ndc = vec4<f32>(in.uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  let view_pos4 = params.inv_projection * ndc;
  let view_pos = view_pos4.xyz / view_pos4.w;

  // View direction (from surface toward camera)
  let view_dir = normalize(-view_pos);

  // --- Fresnel (Schlick approximation) ---
  let cos_theta = max(dot(normal, view_dir), 0.0);
  let f0 = params.fresnel_power;
  let fresnel = f0 + (1.0 - f0) * pow(1.0 - cos_theta, 5.0);

  // --- Beer-Lambert Absorption ---
  // Thicker fluid = darker. Color shifts based on absorption coefficients.
  let absorption = exp(-params.absorption_color * thickness * params.absorption_strength);

  // --- Refraction ---
  // Perturb background UV based on surface normal
  let refract_offset = normal.xy * params.refraction_strength * (1.0 - fresnel);
  let refract_uv = clamp(in.uv + refract_offset, vec2<f32>(0.0), vec2<f32>(1.0));
  let bg_color = textureSample(scene_color, linear_sampler, refract_uv).rgb;

  // --- Specular highlight (Blinn-Phong) ---
  let light_dir = normalize(vec3<f32>(0.5, 1.0, 0.3));
  let half_dir = normalize(view_dir + light_dir);
  let specular = pow(max(dot(normal, half_dir), 0.0), params.specular_power) * fresnel;

  // --- Composite ---
  // Refracted background through absorption + Fresnel reflection + specular
  let fluid_color = bg_color * absorption * (1.0 - fresnel)
                   + vec3<f32>(0.6, 0.8, 1.0) * fresnel  // Sky reflection color
                   + vec3<f32>(1.0) * specular;

  return vec4<f32>(fluid_color, 1.0);
}
