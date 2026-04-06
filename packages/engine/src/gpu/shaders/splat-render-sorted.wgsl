/**
 * Sorted Gaussian Splat Renderer
 *
 * Renders compressed, depth-sorted Gaussian splats using the output
 * of the radix sort pipeline. Reads RGBA8-packed colors and f16-packed
 * 2D covariance (compressed ellipse axes) for efficient memory bandwidth.
 *
 * Rendering approach:
 *   - Instance-based quad rendering (4 vertices per splat)
 *   - Back-to-front order (via radix-sorted indices)
 *   - Alpha blending with premultiplied alpha
 *   - 2D Gaussian falloff using projected covariance (elliptical)
 *
 * Cross-browser compatible:
 *   - No f16 shader feature required
 *   - No subgroup operations
 *   - Standard vertex/fragment pipeline
 *
 * @version 1.0.0
 */

// =============================================================================
// Structures
// =============================================================================

struct SplatCompressed {
  pos: vec3<f32>,
  packedColor: u32,
  packedCov2D_01: u32,
  packedCov2D_2_opacity: u32,
  depth: f32,
  _pad: u32,
};

struct RenderUniforms {
  viewProjection: mat4x4<f32>,
  viewMatrix: mat4x4<f32>,
  cameraPosition: vec3<f32>,
  screenWidth: f32,
  screenHeight: f32,
  focalX: f32,
  focalY: f32,
  _pad: f32,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) conicAndOpacity: vec4<f32>,  // conic.xyz + opacity
  @location(2) centerScreen: vec2<f32>,
};

// =============================================================================
// Bindings
// =============================================================================

@group(0) @binding(0) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(1) var<storage, read> splats: array<SplatCompressed>;
@group(0) @binding(2) var<storage, read> sortedIndices: array<u32>;

// =============================================================================
// f16 Unpacking Helpers
// =============================================================================

fn f16ToF32(h: u32) -> f32 {
  let sign = (h & 0x8000u) << 16u;
  let exponent = (h >> 10u) & 0x1Fu;
  let mantissa = h & 0x3FFu;

  if (exponent == 0u) {
    if (mantissa == 0u) {
      return bitcast<f32>(sign);
    }
    var m = mantissa;
    var e = 0u;
    while ((m & 0x400u) == 0u) {
      m <<= 1u;
      e++;
    }
    let newExp = (127u - 15u - e) << 23u;
    let newMant = (m & 0x3FFu) << 13u;
    return bitcast<f32>(sign | newExp | newMant);
  }
  if (exponent == 31u) {
    if (mantissa == 0u) {
      return bitcast<f32>(sign | 0x7F800000u);
    }
    return bitcast<f32>(sign | 0x7FC00000u);
  }

  let newExp = (exponent + 127u - 15u) << 23u;
  let newMant = mantissa << 13u;
  return bitcast<f32>(sign | newExp | newMant);
}

fn unpackF16Low(packed: u32) -> f32 {
  return f16ToF32(packed & 0xFFFFu);
}

fn unpackF16High(packed: u32) -> f32 {
  return f16ToF32((packed >> 16u) & 0xFFFFu);
}

fn unpackRGBA8(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 0xFFu) / 255.0,
    f32((packed >> 8u) & 0xFFu) / 255.0,
    f32((packed >> 16u) & 0xFFu) / 255.0,
    f32((packed >> 24u) & 0xFFu) / 255.0,
  );
}

// =============================================================================
// Vertex Shader
// =============================================================================

/**
 * Renders a billboard quad for each sorted Gaussian splat.
 *
 * The quad is sized based on the 2D covariance ellipse to tightly
 * bound the Gaussian at the 3-sigma level.
 *
 * vertex_index 0..3 maps to quad corners:
 *   0: (-1, -1)  1: (1, -1)  2: (-1, 1)  3: (1, 1)
 */
@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  // Look up sorted splat index
  let splatIndex = sortedIndices[instanceIndex];
  let splat = splats[splatIndex];

  // Unpack compressed data
  let color = unpackRGBA8(splat.packedColor);
  let cov00 = unpackF16Low(splat.packedCov2D_01);
  let cov01 = unpackF16High(splat.packedCov2D_01);
  let cov11 = unpackF16Low(splat.packedCov2D_2_opacity);
  let opacity = unpackF16High(splat.packedCov2D_2_opacity);

  // Project center to screen space
  let clipPos = uniforms.viewProjection * vec4<f32>(splat.pos, 1.0);
  let ndcPos = clipPos.xyz / clipPos.w;

  // Screen-space center
  let centerScreen = vec2<f32>(
    (ndcPos.x * 0.5 + 0.5) * uniforms.screenWidth,
    (ndcPos.y * -0.5 + 0.5) * uniforms.screenHeight,
  );

  // Compute inverse covariance (conic) for Gaussian evaluation in fragment shader
  // For 2x2 symmetric matrix [[a, b], [b, c]]:
  //   det = a*c - b*b
  //   inv = [[c, -b], [-b, a]] / det
  let det = cov00 * cov11 - cov01 * cov01;
  let detSafe = max(det, 1e-6);
  let conic = vec3<f32>(cov11 / detSafe, -cov01 / detSafe, cov00 / detSafe);

  // Compute eigenvalues for quad sizing (ellipse bounding box)
  let mid = 0.5 * (cov00 + cov11);
  let discriminant = max(mid * mid - det, 0.0);
  let lambda1 = mid + sqrt(discriminant);
  let lambda2 = mid - sqrt(discriminant);

  // 3-sigma bounding radius in pixels
  let maxRadius = ceil(3.0 * sqrt(max(lambda1, 0.0)));

  // Quad vertex positions (billboard)
  let quadUV = vec2<f32>(
    f32(vertexIndex & 1u) * 2.0 - 1.0,
    f32((vertexIndex >> 1u) & 1u) * 2.0 - 1.0,
  );

  let pixelOffset = quadUV * maxRadius;
  let screenPos = centerScreen + pixelOffset;

  // Convert back to NDC
  let finalNdc = vec2<f32>(
    (screenPos.x / uniforms.screenWidth) * 2.0 - 1.0,
    -((screenPos.y / uniforms.screenHeight) * 2.0 - 1.0),
  );

  var out: VertexOutput;
  out.position = vec4<f32>(finalNdc, ndcPos.z, 1.0);
  out.color = color;
  out.conicAndOpacity = vec4<f32>(conic, opacity);
  out.centerScreen = centerScreen;

  return out;
}

// =============================================================================
// Fragment Shader
// =============================================================================

/**
 * Evaluates the 2D Gaussian using the inverse covariance (conic).
 *
 * For a pixel at position p relative to the Gaussian center c:
 *   power = -0.5 * (d^T * Sigma^{-1} * d)
 *   alpha = opacity * exp(power)
 *
 * where d = p - c, and Sigma^{-1} is the conic (inverse covariance).
 */
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Fragment position in screen space (pixels)
  let fragScreen = in.position.xy;

  // Distance from Gaussian center in pixels
  let d = fragScreen - in.centerScreen;

  // Evaluate Gaussian: power = -0.5 * (conic.x * dx^2 + 2*conic.y * dx*dy + conic.z * dy^2)
  let power = -0.5 * (in.conicAndOpacity.x * d.x * d.x
                     + 2.0 * in.conicAndOpacity.y * d.x * d.y
                     + in.conicAndOpacity.z * d.y * d.y);

  // Clamp power to avoid numerical issues
  if (power > 0.0) {
    discard;
  }

  let alpha = min(0.99, in.conicAndOpacity.w * exp(power));

  // Discard nearly transparent fragments
  if (alpha < 1.0 / 255.0) {
    discard;
  }

  // Premultiplied alpha output for back-to-front compositing
  return vec4<f32>(in.color.rgb * alpha, alpha);
}
