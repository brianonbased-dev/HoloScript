/**
 * Gaussian Splat Data Compression & Depth Key Generation
 *
 * Compresses Gaussian splat data for efficient GPU sorting and rendering:
 *   - RGBA8 color packing: 4 bytes instead of 16 bytes (vec4<f32>)
 *   - Compressed ellipse axes: 2D covariance stored as 3x f16 (6 bytes)
 *   - Depth key generation: quantized camera-space Z for radix sort
 *
 * Memory layout (compressed, 32 bytes per splat):
 *   [0:12]  position (vec3<f32>)       12 bytes
 *   [12:16] packedColor (u32, RGBA8)    4 bytes
 *   [16:22] packedCov2D (3x u16)        6 bytes  (f16 cov entries)
 *   [22:24] opacity (f16)               2 bytes
 *   [24:28] depth (f32)                 4 bytes  (camera-space Z)
 *   [28:32] padding                     4 bytes
 *
 * vs. uncompressed (64 bytes per splat):
 *   position: vec3<f32>     12 bytes
 *   scale: vec3<f32>        12 bytes
 *   rotation: vec4<f32>     16 bytes
 *   color: vec4<f32>        16 bytes
 *   padding                  8 bytes
 *
 * Compression ratio: 32/64 = 50% memory reduction
 *
 * Cross-browser notes:
 *   - Uses u32 bit packing instead of f16 (f16 requires shader-f16 feature)
 *   - All operations use u32 and f32, universally supported
 *
 * @version 1.0.0
 */

// =============================================================================
// Structures
// =============================================================================

struct SplatRaw {
  pos: vec3<f32>,
  scale: vec3<f32>,
  rot: vec4<f32>,      // quaternion
  color: vec4<f32>,    // RGBA float
};

struct SplatCompressed {
  pos: vec3<f32>,        // 12 bytes
  packedColor: u32,      // 4 bytes (RGBA8)
  packedCov2D_01: u32,   // 4 bytes (cov[0] and cov[1] as f16 pair)
  packedCov2D_2_opacity: u32, // 4 bytes (cov[2] as f16, opacity as f16)
  depth: f32,            // 4 bytes (camera-space Z)
  _pad: u32,             // 4 bytes alignment
};

struct CompressUniforms {
  viewMatrix: mat4x4<f32>,      // 64 bytes
  projMatrix: mat4x4<f32>,      // 64 bytes
  screenWidth: f32,              // 4 bytes
  screenHeight: f32,             // 4 bytes
  focalX: f32,                   // 4 bytes
  focalY: f32,                   // 4 bytes
  splatCount: u32,               // 4 bytes
  _pad1: u32,
  _pad2: u32,
  _pad3: u32,
};

// =============================================================================
// Bindings
// =============================================================================

@group(0) @binding(0) var<uniform> uniforms: CompressUniforms;
@group(0) @binding(1) var<storage, read> splatsIn: array<SplatRaw>;
@group(0) @binding(2) var<storage, read_write> splatsOut: array<SplatCompressed>;
@group(0) @binding(3) var<storage, read_write> sortKeys: array<u32>;
@group(0) @binding(4) var<storage, read_write> sortValues: array<u32>;

// =============================================================================
// f16 Packing Helpers (no shader-f16 feature required)
// =============================================================================

/**
 * Pack a f32 value into f16 (IEEE 754 half-precision) stored in lower 16 bits of u32.
 * Handles normals, denormals, inf, and nan correctly.
 */
fn f32ToF16(value: f32) -> u32 {
  let bits = bitcast<u32>(value);
  let sign = (bits >> 16u) & 0x8000u;
  let exponent = (bits >> 23u) & 0xFFu;
  let mantissa = bits & 0x7FFFFFu;

  // Handle special cases
  if (exponent == 0u) {
    // Zero or denormal -> zero in f16
    return sign;
  }
  if (exponent == 255u) {
    // Inf or NaN
    if (mantissa != 0u) {
      return sign | 0x7E00u; // NaN
    }
    return sign | 0x7C00u; // Inf
  }

  // Bias conversion: f32 bias=127, f16 bias=15
  let newExponent = i32(exponent) - 127 + 15;

  if (newExponent <= 0) {
    // Underflow to zero
    return sign;
  }
  if (newExponent >= 31) {
    // Overflow to infinity
    return sign | 0x7C00u;
  }

  return sign | (u32(newExponent) << 10u) | (mantissa >> 13u);
}

/**
 * Unpack f16 (stored in lower 16 bits of u32) back to f32.
 */
fn f16ToF32(h: u32) -> f32 {
  let sign = (h & 0x8000u) << 16u;
  let exponent = (h >> 10u) & 0x1Fu;
  let mantissa = h & 0x3FFu;

  if (exponent == 0u) {
    if (mantissa == 0u) {
      return bitcast<f32>(sign); // Signed zero
    }
    // Denormalized: convert to normalized f32
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
      return bitcast<f32>(sign | 0x7F800000u); // Inf
    }
    return bitcast<f32>(sign | 0x7FC00000u); // NaN
  }

  let newExp = (exponent + 127u - 15u) << 23u;
  let newMant = mantissa << 13u;
  return bitcast<f32>(sign | newExp | newMant);
}

/**
 * Pack two f16 values into a single u32.
 */
fn packF16x2(a: f32, b: f32) -> u32 {
  return f32ToF16(a) | (f32ToF16(b) << 16u);
}

// =============================================================================
// RGBA8 Color Packing
// =============================================================================

/**
 * Pack vec4<f32> color (0..1 range) into RGBA8 u32.
 * Layout: R[7:0] G[15:8] B[23:16] A[31:24]
 */
fn packRGBA8(color: vec4<f32>) -> u32 {
  let r = u32(clamp(color.r * 255.0, 0.0, 255.0));
  let g = u32(clamp(color.g * 255.0, 0.0, 255.0));
  let b = u32(clamp(color.b * 255.0, 0.0, 255.0));
  let a = u32(clamp(color.a * 255.0, 0.0, 255.0));
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}

/**
 * Unpack RGBA8 u32 back to vec4<f32>.
 */
fn unpackRGBA8(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 0xFFu) / 255.0,
    f32((packed >> 8u) & 0xFFu) / 255.0,
    f32((packed >> 16u) & 0xFFu) / 255.0,
    f32((packed >> 24u) & 0xFFu) / 255.0,
  );
}

// =============================================================================
// 3D to 2D Covariance Projection (Compressed Ellipse Axes)
// =============================================================================

/**
 * Compute 2D covariance matrix from 3D Gaussian parameters.
 *
 * The 3D covariance matrix Sigma = R * S * S^T * R^T where:
 *   R = rotation matrix from quaternion
 *   S = diagonal scale matrix
 *
 * Projected to 2D using the Jacobian of the perspective projection:
 *   Sigma_2D = J * V * Sigma * V^T * J^T
 *
 * where V is the upper-left 3x3 of the view matrix and J is the Jacobian.
 *
 * Returns: vec3(cov[0][0], cov[0][1], cov[1][1]) - the symmetric 2x2 matrix.
 */
fn computeCov2D(
  pos: vec3<f32>,
  scale: vec3<f32>,
  rot: vec4<f32>,
  viewMatrix: mat4x4<f32>,
  focalX: f32,
  focalY: f32,
  tanFovX: f32,
  tanFovY: f32,
) -> vec3<f32> {
  // Transform position to camera space
  let camPos = viewMatrix * vec4<f32>(pos, 1.0);
  let tz = camPos.z;

  // Avoid division by zero
  let tzSafe = select(tz, 0.001, abs(tz) < 0.001);

  // Frustum clamp at 1.3x the field-of-view half-angle. tanFovX/Y are the true
  // tan(fov/2) (= 0.5*screen / focal_px), passed in — NOT 1/focal_px, which would
  // collapse the clamp and shear off-axis splats.
  let limX = 1.3 * tanFovX;
  let limY = 1.3 * tanFovY;

  let tx = clamp(camPos.x / tzSafe, -limX, limX) * tzSafe;
  let ty = clamp(camPos.y / tzSafe, -limY, limY) * tzSafe;

  // Jacobian matrix (2x3)
  let J00 = focalX / tzSafe;
  let J02 = -focalX * tx / (tzSafe * tzSafe);
  let J11 = focalY / tzSafe;
  let J12 = -focalY * ty / (tzSafe * tzSafe);

  // Build rotation matrix from quaternion
  let r = rot.x;
  let x = rot.y;
  let y = rot.z;
  let z = rot.w;

  let R = mat3x3<f32>(
    vec3<f32>(1.0 - 2.0*(y*y + z*z), 2.0*(x*y - r*z), 2.0*(x*z + r*y)),
    vec3<f32>(2.0*(x*y + r*z), 1.0 - 2.0*(x*x + z*z), 2.0*(y*z - r*x)),
    vec3<f32>(2.0*(x*z - r*y), 2.0*(y*z + r*x), 1.0 - 2.0*(x*x + y*y)),
  );

  // Scale matrix (diagonal) applied as column scaling
  let M = mat3x3<f32>(
    R[0] * scale.x,
    R[1] * scale.y,
    R[2] * scale.z,
  );

  // 3D covariance: Sigma = M * M^T = R*S^2*R^T (encodes rotation + scale).
  // NOTE: WGSL mat3x3 is COLUMN-major, so M[i] is the i-th COLUMN. The old manual
  // form built dot(M[i],M[j]) = (M^T*M)[i][j] = S^2 (diagonal) — it silently
  // discarded all rotation, projecting every Gaussian axis-aligned -> streaks.
  let Sigma = M * transpose(M);

  // View rotation (upper-left 3x3)
  let V = mat3x3<f32>(
    viewMatrix[0].xyz,
    viewMatrix[1].xyz,
    viewMatrix[2].xyz,
  );

  // Transform covariance to camera space: T = V * Sigma * V^T
  let T = V * Sigma * transpose(V);

  // Apply Jacobian to get 2D covariance
  // cov2D = J * T * J^T (where J is 2x3, T is 3x3)
  let cov00 = J00 * J00 * T[0][0] + 2.0 * J00 * J02 * T[0][2] + J02 * J02 * T[2][2];
  let cov01 = J00 * J11 * T[0][1] + J00 * J12 * T[0][2] + J02 * J11 * T[1][2] + J02 * J12 * T[2][2];
  let cov11 = J11 * J11 * T[1][1] + 2.0 * J11 * J12 * T[1][2] + J12 * J12 * T[2][2];

  // Return RAW (un-dilated) covariance. The 0.3px low-pass + the matching opacity
  // compensation (Mip-Splatting antialiasing) are applied by the caller, which has
  // the opacity in hand.
  return vec3<f32>(cov00, cov01, cov11);
}

// =============================================================================
// Main Compression + Depth Key Compute Shader
// =============================================================================

/**
 * Compress raw splats and generate sort keys in a single pass.
 *
 * For each splat:
 *   1. Project to camera space, compute depth
 *   2. Compute 2D covariance (compressed ellipse axes)
 *   3. Pack color as RGBA8
 *   4. Pack covariance as f16x3
 *   5. Generate quantized depth key for radix sort
 *   6. Initialize sort value (splat index)
 */
@compute @workgroup_size(256)
fn compressAndKey(
  @builtin(global_invocation_id) globalId: vec3<u32>,
) {
  let idx = globalId.x;
  if (idx >= uniforms.splatCount) {
    return;
  }

  let raw = splatsIn[idx];

  // Transform to camera space for depth
  let camPos = uniforms.viewMatrix * vec4<f32>(raw.pos, 1.0);
  let depth = camPos.z;

  // Frustum culling: skip splats behind camera
  // (They'll be sorted to the end with max depth key)
  var depthKey: u32;
  if (depth < 0.01) {
    depthKey = 0u; // Behind camera -> sorted FIRST -> overdrawn by visible splats
  } else {
    // Back-to-front: premultiplied "over" blending needs farthest drawn first.
    // Radix sorts ascending; inverting the (positive-float) depth bits makes the
    // largest depth produce the smallest key, so far splats lead.
    depthKey = ~bitcast<u32>(depth);
  }

  // Compute 2D covariance (compressed ellipse axes).
  // True tan(fov/2) = 0.5 * screen_dim / focal_px (focal is in pixels).
  let tanFovX = 0.5 * uniforms.screenWidth / uniforms.focalX;
  let tanFovY = 0.5 * uniforms.screenHeight / uniforms.focalY;
  let cov2D = computeCov2D(
    raw.pos,
    raw.scale,
    raw.rot,
    uniforms.viewMatrix,
    uniforms.focalX,
    uniforms.focalY,
    tanFovX,
    tanFovY,
  );

  // Mip-Splatting antialiasing: dilate the 2D covariance by a 0.3px low-pass AND
  // scale opacity by sqrt(det_raw/det_dilated). Thin / edge-on splats get fattened
  // by the low-pass, so without the opacity compensation they over-contribute as
  // full-strength STREAKS. The compensation makes a fattened thin splat fainter,
  // so overlapping grazing-angle splats blend into a smooth surface (matches gsplat).
  let detRaw = cov2D.x * cov2D.z - cov2D.y * cov2D.y;
  let covDil = vec3<f32>(cov2D.x + 0.3, cov2D.y, cov2D.z + 0.3);
  let detDil = covDil.x * covDil.z - covDil.y * covDil.y;
  let aaComp = sqrt(clamp(max(detRaw, 0.0) / max(detDil, 1e-9), 0.0, 1.0));
  let opacityAA = raw.color.a * aaComp;

  // Clamp covariance to the f16-safe range (near-camera splats project huge).
  let COV_MAX = 16384.0;
  let covSafe = vec3<f32>(
    min(covDil.x, COV_MAX),
    clamp(covDil.y, -COV_MAX, COV_MAX),
    min(covDil.z, COV_MAX),
  );

  // Compute the conic (inverse cov2D) and bounding radius in FULL f32 HERE, then pack
  // the CONIC (not cov2D). det = cov00*cov11 - cov01^2 is a small difference of large
  // terms; recomputing it from f16-packed cov in the vertex shader suffers catastrophic
  // cancellation for rotated thin (grazing-angle) splats -> garbage conic -> streaks.
  // The conic values are well-scaled, so packing them to f16 preserves the shape.
  let det = covSafe.x * covSafe.z - covSafe.y * covSafe.y;
  let detS = max(det, 1e-9);
  let conic = vec3<f32>(covSafe.z / detS, -covSafe.y / detS, covSafe.x / detS);
  let mid = 0.5 * (covSafe.x + covSafe.z);
  let disc = max(mid * mid - det, 0.0);
  let lambda1 = mid + sqrt(disc);
  let radius = ceil(3.0 * sqrt(max(lambda1, 0.0)));

  // Pack compressed splat. packedCov2D_* now hold the CONIC; _pad holds the radius.
  var compressed: SplatCompressed;
  compressed.pos = raw.pos;
  compressed.packedColor = packRGBA8(raw.color);
  compressed.packedCov2D_01 = packF16x2(conic.x, conic.y);
  compressed.packedCov2D_2_opacity = packF16x2(conic.z, opacityAA);
  compressed.depth = depth;
  compressed._pad = bitcast<u32>(radius);

  // Write compressed data
  splatsOut[idx] = compressed;

  // Write sort key-value pair
  sortKeys[idx] = depthKey;
  sortValues[idx] = idx;
}
