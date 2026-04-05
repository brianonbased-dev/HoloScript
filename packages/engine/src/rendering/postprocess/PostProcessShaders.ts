/**
 * PostProcessShaders.ts
 *
 * WGSL shader code for all post-processing effects.
 * Includes fullscreen triangle vertex shader and per-effect fragment shaders.
 *
 * @module render/postprocess
 */

/**
 * Fullscreen triangle vertex shader
 * Generates fullscreen coverage with a single triangle
 */
export const FULLSCREEN_VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Generate fullscreen triangle
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );

  var uvs = array<vec2f, 3>(
    vec2f(0.0, 1.0),
    vec2f(2.0, 1.0),
    vec2f(0.0, -1.0)
  );

  var output: VertexOutput;
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}
`;

/**
 * Common shader utilities
 */
export const SHADER_UTILS = /* wgsl */ `
// Luminance calculation (Rec. 709)
fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

// sRGB to linear conversion
fn srgbToLinear(color: vec3f) -> vec3f {
  return pow(color, vec3f(2.2));
}

// Linear to sRGB conversion
fn linearToSrgb(color: vec3f) -> vec3f {
  return pow(color, vec3f(1.0 / 2.2));
}

// Hash function for noise
fn hash(p: vec2f) -> f32 {
  let k = vec2f(0.3183099, 0.3678794);
  let x = p * k + k.yx;
  return fract(16.0 * k.x * fract(x.x * x.y * (x.x + x.y)));
}

// Simple 2D noise
fn noise2D(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2f(0.0, 0.0)), hash(i + vec2f(1.0, 0.0)), u.x),
    mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
    u.y
  );
}
`;

/**
 * Bloom effect shader
 */
export const BLOOM_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct BloomUniforms {
  intensity: f32,
  threshold: f32,
  softThreshold: f32,
  radius: f32,
  iterations: f32,
  anamorphic: f32,
  highQuality: f32,
  padding: f32,
  time: f32,
  deltaTime: f32,
  padding2: vec2f,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: BloomUniforms;

// Threshold with soft knee
fn softThreshold(color: vec3f) -> vec3f {
  let brightness = max(max(color.r, color.g), color.b);
  var soft = brightness - uniforms.threshold + uniforms.softThreshold;
  soft = clamp(soft, 0.0, 2.0 * uniforms.softThreshold);
  soft = soft * soft / (4.0 * uniforms.softThreshold + 0.00001);
  var contribution = max(soft, brightness - uniforms.threshold);
  contribution /= max(brightness, 0.00001);
  return color * contribution;
}

// 9-tap gaussian blur
fn blur9(uv: vec2f, direction: vec2f) -> vec3f {
  let texSize = vec2f(textureDimensions(inputTexture));
  let offset = direction / texSize;

  var color = textureSample(inputTexture, texSampler, uv).rgb * 0.2270270270;
  color += textureSample(inputTexture, texSampler, uv + offset * 1.3846153846).rgb * 0.3162162162;
  color += textureSample(inputTexture, texSampler, uv - offset * 1.3846153846).rgb * 0.3162162162;
  color += textureSample(inputTexture, texSampler, uv + offset * 3.2307692308).rgb * 0.0702702703;
  color += textureSample(inputTexture, texSampler, uv - offset * 3.2307692308).rgb * 0.0702702703;

  return color;
}

@fragment
fn fs_bloom(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(inputTexture, texSampler, input.uv).rgb;

  // Extract bright pixels with soft threshold
  var bloom = softThreshold(color);

  // Simple blur approximation (in production, use multi-pass)
  let texSize = vec2f(textureDimensions(inputTexture));
  let radius = uniforms.radius / texSize;

  var blurred = bloom;
  for (var i = 0u; i < 4u; i++) {
    let angle = f32(i) * 1.5707963268;
    let offset = vec2f(cos(angle), sin(angle)) * radius;
    blurred += textureSample(inputTexture, texSampler, input.uv + offset).rgb;
    blurred += textureSample(inputTexture, texSampler, input.uv - offset).rgb;
  }
  blurred /= 9.0;

  // Composite bloom
  let result = color + softThreshold(blurred) * uniforms.intensity;

  return vec4f(result, 1.0);
}
`;

/**
 * Tone mapping shader with multiple operators
 */
export const TONEMAP_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct ToneMapUniforms {
  operator: f32,
  exposure: f32,
  gamma: f32,
  whitePoint: f32,
  contrast: f32,
  saturation: f32,
  intensity: f32,
  padding: f32,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: ToneMapUniforms;

// Reinhard tone mapping
fn tonemapReinhard(x: vec3f) -> vec3f {
  return x / (x + vec3f(1.0));
}

// Reinhard with luminance-based mapping
fn tonemapReinhardLum(x: vec3f) -> vec3f {
  let l = luminance(x);
  let nl = l / (l + 1.0);
  return x * (nl / l);
}

// ACES filmic tone mapping
fn tonemapACES(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + vec3f(b))) / (x * (c * x + vec3f(d)) + vec3f(e)), vec3f(0.0), vec3f(1.0));
}

// ACES approximation (cheaper)
fn tonemapACESApprox(x: vec3f) -> vec3f {
  let v = x * 0.6;
  let a = v * (v * 2.51 + 0.03);
  let b = v * (v * 2.43 + 0.59) + 0.14;
  return clamp(a / b, vec3f(0.0), vec3f(1.0));
}

// Uncharted 2 filmic
fn uncharted2Partial(x: vec3f) -> vec3f {
  let A = 0.15;
  let B = 0.50;
  let C = 0.10;
  let D = 0.20;
  let E = 0.02;
  let F = 0.30;
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

fn tonemapUncharted2(x: vec3f) -> vec3f {
  let white = 11.2;
  let curr = uncharted2Partial(x * 2.0);
  let whiteScale = vec3f(1.0) / uncharted2Partial(vec3f(white));
  return curr * whiteScale;
}

// Lottes (AMD)
fn tonemapLottes(x: vec3f) -> vec3f {
  let a = vec3f(1.6);
  let d = vec3f(0.977);
  let hdrMax = vec3f(8.0);
  let midIn = vec3f(0.18);
  let midOut = vec3f(0.267);

  let b = (-pow(midIn, a) + pow(hdrMax, a) * midOut) / ((pow(hdrMax, a * d) - pow(midIn, a * d)) * midOut);
  let c = (pow(hdrMax, a * d) * pow(midIn, a) - pow(hdrMax, a) * pow(midIn, a * d) * midOut) /
          ((pow(hdrMax, a * d) - pow(midIn, a * d)) * midOut);

  return pow(x, a) / (pow(x, a * d) * b + c);
}

// Uchimura (GT)
fn tonemapUchimura(x: vec3f) -> vec3f {
  let P = 1.0;  // max brightness
  let a = 1.0;  // contrast
  let m = 0.22; // linear section start
  let l = 0.4;  // linear section length
  let c = 1.33; // black tightness
  let b = 0.0;  // black lightness

  let l0 = ((P - m) * l) / a;
  let S0 = m + l0;
  let S1 = m + a * l0;
  let C2 = (a * P) / (P - S1);
  let CP = -C2 / P;

  var result: vec3f;
  for (var i = 0u; i < 3u; i++) {
    let v = x[i];
    var w: f32;
    if (v < m) {
      w = v;
    } else if (v < S0) {
      w = m + a * (v - m);
    } else {
      w = P - (P - S1) * exp(CP * (v - S0));
    }
    result[i] = w;
  }
  return result;
}

// Khronos PBR neutral
fn tonemapKhronosPBR(color: vec3f) -> vec3f {
  let startCompression = 0.8 - 0.04;
  let desaturation = 0.15;

  var x = min(color, vec3f(1.0));
  let peak = max(max(color.r, color.g), color.b);

  if (peak < startCompression) {
    return x;
  }

  let d = 1.0 - startCompression;
  let newPeak = 1.0 - d * d / (peak + d - startCompression);
  x *= newPeak / peak;

  let g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(x, vec3f(newPeak), g);
}

@fragment
fn fs_tonemap(input: VertexOutput) -> @location(0) vec4f {
  var color = textureSample(inputTexture, texSampler, input.uv).rgb;

  // Apply exposure
  color *= uniforms.exposure;

  // Apply contrast (around mid-gray)
  let midGray = 0.18;
  color = midGray * pow(color / midGray, vec3f(uniforms.contrast));

  // Apply saturation
  let lum = luminance(color);
  color = mix(vec3f(lum), color, uniforms.saturation);

  // Apply tone mapping
  let op = u32(uniforms.operator);
  var mapped: vec3f;
  switch (op) {
    case 0u: { mapped = clamp(color, vec3f(0.0), vec3f(1.0)); } // None
    case 1u: { mapped = tonemapReinhard(color); }
    case 2u: { mapped = tonemapReinhardLum(color); }
    case 3u: { mapped = tonemapACES(color); }
    case 4u: { mapped = tonemapACESApprox(color); }
    case 5u: { mapped = tonemapACES(color); } // Filmic = ACES
    case 6u: { mapped = tonemapUncharted2(color); }
    case 7u: { mapped = tonemapUchimura(color); }
    case 8u: { mapped = tonemapLottes(color); }
    case 9u: { mapped = tonemapKhronosPBR(color); }
    default: { mapped = tonemapACES(color); }
  }

  // Apply gamma correction
  let result = pow(mapped, vec3f(1.0 / uniforms.gamma));

  return vec4f(result, 1.0);
}
`;

/**
 * FXAA anti-aliasing shader
 */
export const FXAA_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct FXAAUniforms {
  quality: f32,
  edgeThreshold: f32,
  edgeThresholdMin: f32,
  intensity: f32,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: FXAAUniforms;

@fragment
fn fs_fxaa(input: VertexOutput) -> @location(0) vec4f {
  let texSize = vec2f(textureDimensions(inputTexture));
  let invSize = 1.0 / texSize;

  // Sample center and neighbors
  let center = textureSample(inputTexture, texSampler, input.uv);
  let lumC = luminance(center.rgb);

  let lumN = luminance(textureSample(inputTexture, texSampler, input.uv + vec2f(0.0, -1.0) * invSize).rgb);
  let lumS = luminance(textureSample(inputTexture, texSampler, input.uv + vec2f(0.0, 1.0) * invSize).rgb);
  let lumE = luminance(textureSample(inputTexture, texSampler, input.uv + vec2f(1.0, 0.0) * invSize).rgb);
  let lumW = luminance(textureSample(inputTexture, texSampler, input.uv + vec2f(-1.0, 0.0) * invSize).rgb);

  let lumMin = min(lumC, min(min(lumN, lumS), min(lumE, lumW)));
  let lumMax = max(lumC, max(max(lumN, lumS), max(lumE, lumW)));
  let lumRange = lumMax - lumMin;

  // Skip if edge contrast is too low
  if (lumRange < max(uniforms.edgeThresholdMin, lumMax * uniforms.edgeThreshold)) {
    return center;
  }

  // Compute edge direction
  let lumNW = luminance(textureSample(inputTexture, texSampler, input.uv + vec2f(-1.0, -1.0) * invSize).rgb);
  let lumNE = luminance(textureSample(inputTexture, texSampler, input.uv + vec2f(1.0, -1.0) * invSize).rgb);
  let lumSW = luminance(textureSample(inputTexture, texSampler, input.uv + vec2f(-1.0, 1.0) * invSize).rgb);
  let lumSE = luminance(textureSample(inputTexture, texSampler, input.uv + vec2f(1.0, 1.0) * invSize).rgb);

  let edgeH = abs((lumNW + lumNE) - 2.0 * lumN) +
              abs((lumW + lumE) - 2.0 * lumC) * 2.0 +
              abs((lumSW + lumSE) - 2.0 * lumS);

  let edgeV = abs((lumNW + lumSW) - 2.0 * lumW) +
              abs((lumN + lumS) - 2.0 * lumC) * 2.0 +
              abs((lumNE + lumSE) - 2.0 * lumE);

  let isHorizontal = edgeH >= edgeV;

  // Blend direction
  let stepLength = select(invSize.x, invSize.y, isHorizontal);
  var lum1: f32;
  var lum2: f32;

  if (isHorizontal) {
    lum1 = lumN;
    lum2 = lumS;
  } else {
    lum1 = lumW;
    lum2 = lumE;
  }

  let gradient1 = abs(lum1 - lumC);
  let gradient2 = abs(lum2 - lumC);

  let is1Steeper = gradient1 >= gradient2;
  let gradientScaled = 0.25 * max(gradient1, gradient2);
  let lumLocalAvg = 0.5 * (select(lum2, lum1, is1Steeper) + lumC);

  // Subpixel anti-aliasing
  let subpixC = (2.0 * (lumN + lumS + lumE + lumW) + lumNW + lumNE + lumSW + lumSE) / 12.0;
  let subpixFactor = clamp(abs(subpixC - lumC) / lumRange, 0.0, 1.0);
  let subpix = (-(subpixFactor * subpixFactor) + 1.0) * subpixFactor;

  // Apply blend
  var finalUV = input.uv;
  let blendFactor = max(subpix, 0.5);

  if (isHorizontal) {
    finalUV.y += select(stepLength, -stepLength, is1Steeper) * blendFactor;
  } else {
    finalUV.x += select(stepLength, -stepLength, is1Steeper) * blendFactor;
  }

  let result = textureSample(inputTexture, texSampler, finalUV);
  return mix(center, result, uniforms.intensity);
}
`;

/**
 * Vignette shader
 */
export const VIGNETTE_SHADER = /* wgsl */ `
struct VignetteUniforms {
  intensity: f32,
  roundness: f32,
  smoothness: f32,
  padding: f32,
  color: vec4f,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: VignetteUniforms;

@fragment
fn fs_vignette(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(inputTexture, texSampler, input.uv);

  let uv = input.uv * 2.0 - 1.0;
  let aspect = 1.0; // Could be passed via uniforms

  var coords = uv;
  coords.x *= aspect;

  // Compute vignette
  let dist = length(coords) * uniforms.roundness;
  let vignette = 1.0 - smoothstep(1.0 - uniforms.smoothness, 1.0, dist);

  // Blend with vignette color
  let vignetteColor = mix(uniforms.color.rgb, color.rgb, vignette);
  let result = mix(color.rgb, vignetteColor, uniforms.intensity);

  return vec4f(result, color.a);
}
`;

/**
 * Film grain shader
 */
export const FILM_GRAIN_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct FilmGrainUniforms {
  intensity: f32,
  size: f32,
  luminanceContribution: f32,
  time: f32,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: FilmGrainUniforms;

@fragment
fn fs_filmgrain(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(inputTexture, texSampler, input.uv);

  let texSize = vec2f(textureDimensions(inputTexture));
  let noiseUV = input.uv * texSize / uniforms.size;

  // Generate animated noise
  let grain = noise2D(noiseUV + vec2f(uniforms.time * 123.456, uniforms.time * 789.012)) * 2.0 - 1.0;

  // Scale grain by luminance
  let lum = luminance(color.rgb);
  let grainAmount = uniforms.intensity * mix(1.0, 1.0 - lum, uniforms.luminanceContribution);

  let result = color.rgb + vec3f(grain * grainAmount);

  return vec4f(result, color.a);
}
`;

/**
 * Sharpen shader
 */
export const SHARPEN_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct SharpenUniforms {
  intensity: f32,
  amount: f32,
  threshold: f32,
  padding: f32,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: SharpenUniforms;

@fragment
fn fs_sharpen(input: VertexOutput) -> @location(0) vec4f {
  let texSize = vec2f(textureDimensions(inputTexture));
  let texel = 1.0 / texSize;

  // Sample 3x3 neighborhood
  let center = textureSample(inputTexture, texSampler, input.uv).rgb;
  let n = textureSample(inputTexture, texSampler, input.uv + vec2f(0.0, -texel.y)).rgb;
  let s = textureSample(inputTexture, texSampler, input.uv + vec2f(0.0, texel.y)).rgb;
  let e = textureSample(inputTexture, texSampler, input.uv + vec2f(texel.x, 0.0)).rgb;
  let w = textureSample(inputTexture, texSampler, input.uv + vec2f(-texel.x, 0.0)).rgb;

  // Compute unsharp mask
  let blur = (n + s + e + w) * 0.25;
  let diff = center - blur;

  // Apply threshold
  let sharpened = select(
    center,
    center + diff * uniforms.amount,
    length(diff) > uniforms.threshold
  );

  let result = mix(center, sharpened, uniforms.intensity);

  return vec4f(result, 1.0);
}
`;

/**
 * Chromatic aberration shader
 */
export const CHROMATIC_ABERRATION_SHADER = /* wgsl */ `
struct ChromaticUniforms {
  intensity: f32,
  radial: f32,
  padding: vec2f,
  redOffset: vec2f,
  greenOffset: vec2f,
  blueOffset: vec2f,
  padding2: vec2f,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: ChromaticUniforms;

@fragment
fn fs_chromatic(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv;

  var rOffset = uniforms.redOffset * uniforms.intensity;
  var gOffset = uniforms.greenOffset * uniforms.intensity;
  var bOffset = uniforms.blueOffset * uniforms.intensity;

  // Apply radial distortion if enabled
  if (uniforms.radial > 0.5) {
    let center = vec2f(0.5);
    let dir = uv - center;
    let dist = length(dir);
    let radialFactor = dist * dist;

    rOffset *= radialFactor;
    gOffset *= radialFactor;
    bOffset *= radialFactor;
  }

  let r = textureSample(inputTexture, texSampler, uv + rOffset).r;
  let g = textureSample(inputTexture, texSampler, uv + gOffset).g;
  let b = textureSample(inputTexture, texSampler, uv + bOffset).b;

  return vec4f(r, g, b, 1.0);
}
`;

/**
 * Depth of Field shader
 * Uses circle-of-confusion from depth to apply variable-radius disc blur.
 */
export const DOF_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct DOFUniforms {
  focusDistance: f32,
  focalLength: f32,
  aperture: f32,
  maxBlur: f32,
  nearPlane: f32,
  farPlane: f32,
  padding: vec2f,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: DOFUniforms;
@group(0) @binding(3) var depthTexture: texture_2d<f32>;

fn linearizeDepth(d: f32) -> f32 {
  return uniforms.nearPlane * uniforms.farPlane /
    (uniforms.farPlane - d * (uniforms.farPlane - uniforms.nearPlane));
}

fn circleOfConfusion(depth: f32) -> f32 {
  let s1 = depth;
  let s2 = uniforms.focusDistance;
  let f = uniforms.focalLength;
  let a = uniforms.aperture;
  let coc = abs(a * f * (s2 - s1) / (s1 * (s2 - f)));
  return clamp(coc, 0.0, uniforms.maxBlur);
}

@fragment
fn fs_dof(input: VertexOutput) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(inputTexture));
  let texelSize = 1.0 / dims;

  let rawDepth = textureSample(depthTexture, texSampler, input.uv).r;
  let depth = linearizeDepth(rawDepth);
  let coc = circleOfConfusion(depth);

  // Disc blur with 16 samples in a Poisson-like pattern
  let offsets = array<vec2f, 16>(
    vec2f(-0.94201, -0.39906), vec2f( 0.94558, -0.76890),
    vec2f(-0.09418, -0.92938), vec2f( 0.34495,  0.29387),
    vec2f(-0.91588,  0.45771), vec2f(-0.81544,  0.00298),
    vec2f(-0.38277, -0.56270), vec2f( 0.97484,  0.75648),
    vec2f( 0.44323, -0.97511), vec2f( 0.53742,  0.01683),
    vec2f(-0.26496, -0.01497), vec2f(-0.44693,  0.93910),
    vec2f( 0.79197,  0.19090), vec2f(-0.24188, -0.99706),
    vec2f( 0.04578,  0.53300), vec2f(-0.75738, -0.81580)
  );

  var color = vec4f(0.0);
  var totalWeight = 0.0;

  for (var i = 0u; i < 16u; i++) {
    let sampleUV = input.uv + offsets[i] * texelSize * coc * 8.0;
    let sampleColor = textureSample(inputTexture, texSampler, sampleUV);
    let sampleDepth = linearizeDepth(textureSample(depthTexture, texSampler, sampleUV).r);
    let sampleCoC = circleOfConfusion(sampleDepth);
    let w = max(sampleCoC, coc * 0.2);
    color += sampleColor * w;
    totalWeight += w;
  }

  return color / totalWeight;
}
`;

/**
 * SSAO shader (Screen-Space Ambient Occlusion)
 * Hemisphere sampling around each fragment using depth + reconstructed normals.
 */
export const SSAO_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct SSAOUniforms {
  radius: f32,
  bias: f32,
  samples: f32,
  power: f32,
  falloff: f32,
  mode: f32,        // 0 = hemisphere, 1 = hbao
  bentNormals: f32,  // 0 = off, 1 = on
  spatialDenoise: f32, // 0 = off, 1 = on
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: SSAOUniforms;
@group(0) @binding(3) var depthTexture: texture_2d<f32>;

fn hash3(p: vec2f) -> vec3f {
  let q = vec3f(
    dot(p, vec2f(127.1, 311.7)),
    dot(p, vec2f(269.5, 183.3)),
    dot(p, vec2f(419.2, 371.9))
  );
  return fract(sin(q) * 43758.5453) * 2.0 - 1.0;
}

fn reconstructNormal(uv: vec2f, texelSize: vec2f) -> vec3f {
  let dc = textureSample(depthTexture, texSampler, uv).r;
  let dl = textureSample(depthTexture, texSampler, uv - vec2f(texelSize.x, 0.0)).r;
  let dr = textureSample(depthTexture, texSampler, uv + vec2f(texelSize.x, 0.0)).r;
  let db = textureSample(depthTexture, texSampler, uv - vec2f(0.0, texelSize.y)).r;
  let dt = textureSample(depthTexture, texSampler, uv + vec2f(0.0, texelSize.y)).r;
  return normalize(vec3f(dl - dr, db - dt, 2.0 * texelSize.x));
}

// HBAO: 8 directions × 4 steps per direction = 32 samples
fn hbaoOcclusion(uv: vec2f, normal: vec3f, centerDepth: f32, texelSize: vec2f) -> vec2f {
  var occlusion = 0.0;
  var bentN = vec3f(0.0);
  let directions = 8;
  let stepsPerDir = 4;
  let angleStep = 6.28318 / f32(directions);

  for (var d = 0; d < directions; d++) {
    let angle = f32(d) * angleStep;
    let dir = vec2f(cos(angle), sin(angle));
    var maxHorizon = uniforms.bias;

    for (var s = 1; s <= stepsPerDir; s++) {
      let stepScale = f32(s) / f32(stepsPerDir);
      let sampleOffset = dir * uniforms.radius * stepScale * texelSize * 8.0;
      let sampleUV = uv + sampleOffset;
      let sampleDepth = textureSample(depthTexture, texSampler, sampleUV).r;
      let depthDelta = centerDepth - sampleDepth;

      if (depthDelta > uniforms.bias && depthDelta < uniforms.falloff) {
        let horizonAngle = depthDelta / (length(sampleOffset) * 500.0 + 0.001);
        maxHorizon = max(maxHorizon, horizonAngle);
      }
    }
    occlusion += maxHorizon;
    // Accumulate bent normal: direction of least occlusion
    let weight = 1.0 - min(maxHorizon * 2.0, 1.0);
    bentN += vec3f(dir * weight, weight);
  }

  occlusion = 1.0 - pow(occlusion / f32(directions), uniforms.power);
  return vec2f(occlusion, length(bentN.xy));
}

// 5×5 cross-bilateral spatial denoise
fn spatialDenoise(uv: vec2f, centerOcclusion: f32, centerDepth: f32, centerNormal: vec3f, texelSize: vec2f) -> f32 {
  var sum = centerOcclusion;
  var totalWeight = 1.0;

  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      if (x == 0 && y == 0) { continue; }
      let offset = vec2f(f32(x), f32(y)) * texelSize;
      let sampleUV = uv + offset;
      let sampleDepth = textureSample(depthTexture, texSampler, sampleUV).r;
      let sampleNormal = reconstructNormal(sampleUV, texelSize);

      // Depth similarity weight
      let depthW = exp(-abs(centerDepth - sampleDepth) * 100.0);
      // Normal similarity weight
      let normalW = max(dot(centerNormal, sampleNormal), 0.0);
      // Spatial weight (Gaussian)
      let spatialW = exp(-f32(x * x + y * y) * 0.2);

      let w = depthW * normalW * spatialW;
      // Re-sample occlusion at this location (simplified: use color channel)
      let sampleColor = textureSample(inputTexture, texSampler, sampleUV);
      let sampleOcclusion = luminance(sampleColor.rgb) / max(luminance(textureSample(inputTexture, texSampler, uv).rgb), 0.001);
      sum += clamp(sampleOcclusion, 0.0, 2.0) * w;
      totalWeight += w;
    }
  }

  return sum / totalWeight;
}

@fragment
fn fs_ssao(input: VertexOutput) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(inputTexture));
  let texelSize = 1.0 / dims;
  let color = textureSample(inputTexture, texSampler, input.uv);
  let centerDepth = textureSample(depthTexture, texSampler, input.uv).r;
  let normal = reconstructNormal(input.uv, texelSize);

  var occlusion = 0.0;

  if (uniforms.mode > 0.5) {
    // HBAO mode: 8 directions × 4 steps
    let hbaoResult = hbaoOcclusion(input.uv, normal, centerDepth, texelSize);
    occlusion = hbaoResult.x;
  } else {
    // Standard hemisphere sampling
    let sampleCount = u32(uniforms.samples);
    var occ = 0.0;
    for (var i = 0u; i < sampleCount; i++) {
      let randSeed = input.uv * dims + vec2f(f32(i) * 7.0, f32(i) * 13.0);
      var sampleDir = normalize(hash3(randSeed));
      if (dot(sampleDir, normal) < 0.0) {
        sampleDir = -sampleDir;
      }
      let scale = f32(i + 1u) / f32(sampleCount);
      let sampleOffset = sampleDir * uniforms.radius * mix(0.1, 1.0, scale * scale);
      let sampleUV = input.uv + sampleOffset.xy * texelSize * 8.0;
      let sampleDepth = textureSample(depthTexture, texSampler, sampleUV).r;
      let rangeCheck = smoothstep(0.0, 1.0,
        uniforms.falloff / abs(centerDepth - sampleDepth + 0.0001));
      if (sampleDepth < centerDepth - uniforms.bias) {
        occ += rangeCheck;
      }
    }
    occlusion = 1.0 - pow(occ / f32(sampleCount), uniforms.power);
  }

  // Spatial denoise pass (applied inline for simplicity)
  if (uniforms.spatialDenoise > 0.5) {
    // Approximate denoise by blending with neighbors
    var blurred = occlusion;
    var tw = 1.0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) { continue; }
        let off = vec2f(f32(dx), f32(dy)) * texelSize;
        let sd = textureSample(depthTexture, texSampler, input.uv + off).r;
        let dw = exp(-abs(centerDepth - sd) * 50.0);
        let sn = reconstructNormal(input.uv + off, texelSize);
        let nw = max(dot(normal, sn), 0.0);
        let w = dw * nw;
        blurred += occlusion * w; // Approximation: use same occlusion
        tw += w;
      }
    }
    occlusion = blurred / tw;
  }

  return vec4f(color.rgb * occlusion, color.a);
}
`;

/**
 * Fog shader
 * Supports linear, exponential, and exponential-squared fog with height falloff.
 * mode: 0 = linear, 1 = exponential, 2 = exponential-squared
 */
export const FOG_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct FogUniforms {
  color: vec3f,
  density: f32,
  start: f32,
  end: f32,
  height: f32,
  heightFalloff: f32,
  mode: f32,
  padding: vec3f,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: FogUniforms;
@group(0) @binding(3) var depthTexture: texture_2d<f32>;

@fragment
fn fs_fog(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(inputTexture, texSampler, input.uv);
  let depth = textureSample(depthTexture, texSampler, input.uv).r;

  // Compute fog factor based on mode
  var fogFactor = 0.0;
  let mode = u32(uniforms.mode);
  if (mode == 0u) {
    // Linear fog
    fogFactor = clamp((uniforms.end - depth) / (uniforms.end - uniforms.start), 0.0, 1.0);
  } else if (mode == 1u) {
    // Exponential fog
    fogFactor = exp(-uniforms.density * depth);
  } else {
    // Exponential-squared fog
    let d = uniforms.density * depth;
    fogFactor = exp(-d * d);
  }

  // Height-based attenuation
  let heightUV = 1.0 - input.uv.y; // screen-space approximation of world height
  let heightFactor = exp(-max(heightUV - uniforms.height, 0.0) * uniforms.heightFalloff);
  fogFactor = mix(fogFactor, 1.0, 1.0 - heightFactor);

  let foggedColor = mix(uniforms.color, color.rgb, fogFactor);
  return vec4f(foggedColor, color.a);
}
`;

/**
 * Motion blur shader
 * Samples along per-pixel velocity vector from a velocity buffer.
 */
export const MOTION_BLUR_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct MotionBlurUniforms {
  samples: f32,
  velocityScale: f32,
  maxVelocity: f32,
  intensity: f32,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: MotionBlurUniforms;
@group(0) @binding(3) var velocityTexture: texture_2d<f32>;

@fragment
fn fs_motionblur(input: VertexOutput) -> @location(0) vec4f {
  let velocity = textureSample(velocityTexture, texSampler, input.uv).rg;

  // Scale and clamp velocity
  var vel = velocity * uniforms.velocityScale;
  let speed = length(vel);
  if (speed > uniforms.maxVelocity) {
    vel = vel * (uniforms.maxVelocity / speed);
  }

  let sampleCount = u32(uniforms.samples);
  var color = textureSample(inputTexture, texSampler, input.uv);
  var totalWeight = 1.0;

  for (var i = 1u; i <= sampleCount; i++) {
    let t = (f32(i) / f32(sampleCount)) - 0.5;
    let sampleUV = input.uv + vel * t;
    let sampleColor = textureSample(inputTexture, texSampler, sampleUV);
    let w = 1.0 - abs(t) * 2.0; // Center-weighted
    color += sampleColor * w;
    totalWeight += w;
  }

  let blurred = color / totalWeight;
  let original = textureSample(inputTexture, texSampler, input.uv);
  return mix(original, blurred, uniforms.intensity);
}
`;

/**
 * Color grading shader
 */
export const COLOR_GRADE_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct ColorGradeUniforms {
  shadows: vec3f,
  shadowsOffset: f32,
  midtones: vec3f,
  highlightsOffset: f32,
  highlights: vec3f,
  hueShift: f32,
  temperature: f32,
  tint: f32,
  intensity: f32,
  lutIntensity: f32,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: ColorGradeUniforms;

// RGB to HSL conversion
fn rgbToHsl(c: vec3f) -> vec3f {
  let cMax = max(max(c.r, c.g), c.b);
  let cMin = min(min(c.r, c.g), c.b);
  let delta = cMax - cMin;

  var h = 0.0;
  var s = 0.0;
  let l = (cMax + cMin) / 2.0;

  if (delta > 0.0) {
    s = select(delta / (2.0 - cMax - cMin), delta / (cMax + cMin), l < 0.5);

    if (cMax == c.r) {
      h = (c.g - c.b) / delta + select(0.0, 6.0, c.g < c.b);
    } else if (cMax == c.g) {
      h = (c.b - c.r) / delta + 2.0;
    } else {
      h = (c.r - c.g) / delta + 4.0;
    }
    h /= 6.0;
  }

  return vec3f(h, s, l);
}

fn hue2rgb(p: f32, q: f32, t: f32) -> f32 {
  var tt = t;
  if (tt < 0.0) { tt += 1.0; }
  if (tt > 1.0) { tt -= 1.0; }
  if (tt < 1.0/6.0) { return p + (q - p) * 6.0 * tt; }
  if (tt < 1.0/2.0) { return q; }
  if (tt < 2.0/3.0) { return p + (q - p) * (2.0/3.0 - tt) * 6.0; }
  return p;
}

fn hslToRgb(hsl: vec3f) -> vec3f {
  if (hsl.y == 0.0) {
    return vec3f(hsl.z);
  }

  let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
  let p = 2.0 * hsl.z - q;

  return vec3f(
    hue2rgb(p, q, hsl.x + 1.0/3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0/3.0)
  );
}

// Temperature/tint adjustment
fn adjustTemperature(color: vec3f, temp: f32, tint: f32) -> vec3f {
  var result = color;
  // Warm (positive) = more red, less blue
  result.r += temp * 0.1;
  result.b -= temp * 0.1;
  // Tint: positive = more green
  result.g += tint * 0.1;
  return clamp(result, vec3f(0.0), vec3f(1.0));
}

@fragment
fn fs_colorgrade(input: VertexOutput) -> @location(0) vec4f {
  var color = textureSample(inputTexture, texSampler, input.uv).rgb;

  let lum = luminance(color);

  // Shadows/Midtones/Highlights
  let shadowWeight = 1.0 - smoothstep(0.0, 0.33, lum);
  let highlightWeight = smoothstep(0.66, 1.0, lum);
  let midtoneWeight = 1.0 - shadowWeight - highlightWeight;

  color += uniforms.shadows * shadowWeight;
  color += uniforms.midtones * midtoneWeight;
  color += uniforms.highlights * highlightWeight;

  // Hue shift
  if (abs(uniforms.hueShift) > 0.001) {
    var hsl = rgbToHsl(color);
    hsl.x = fract(hsl.x + uniforms.hueShift);
    color = hslToRgb(hsl);
  }

  // Temperature and tint
  color = adjustTemperature(color, uniforms.temperature, uniforms.tint);

  return vec4f(color, 1.0);
}
`;

/**
 * Blit/copy shader for simple texture copies
 */
export const BLIT_SHADER = /* wgsl */ `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;

@fragment
fn fs_blit(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(inputTexture, texSampler, input.uv);
}
`;

/**
 * Caustics overlay shader
 * Projects animated underwater caustic patterns onto the scene.
 * Uses dual-layer Voronoi for realistic interference.
 */
export const CAUSTICS_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct CausticsUniforms {
  intensity: f32,
  scale: f32,
  speed: f32,
  time: f32,
  color: vec3f,
  depthFade: f32,
  waterLevel: f32,
  dispersion: f32,
  foamIntensity: f32,
  shadowStrength: f32,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: CausticsUniforms;
@group(0) @binding(3) var depthTexture: texture_2d<f32>;

fn voronoiDist(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  var md = 1.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let n = vec2f(f32(x), f32(y));
      let h1 = fract(sin(dot(i + n, vec2f(127.1, 311.7))) * 43758.5453);
      let h2 = fract(sin(dot(i + n, vec2f(269.5, 183.3))) * 43758.5453);
      let pt = n + vec2f(h1, h2) - f;
      md = min(md, dot(pt, pt));
    }
  }
  return sqrt(md);
}

// Refractive caustic with IoR-based convergence
fn refractiveCausticPP(uv: vec2f, time: f32, scale: f32, ior: f32) -> f32 {
  let eps = 0.01;
  let h0 = voronoiDist(uv * scale + vec2f(time * 0.3, time * 0.7));
  let hx = voronoiDist((uv + vec2f(eps, 0.0)) * scale + vec2f(time * 0.3, time * 0.7));
  let hy = voronoiDist((uv + vec2f(0.0, eps)) * scale + vec2f(time * 0.3, time * 0.7));
  let grad = vec2f(hx - h0, hy - h0) / eps;
  let refracted = grad * (1.0 / ior - 1.0);
  let convergence = voronoiDist((uv + refracted * 0.1) * scale * 1.3 + vec2f(-time * 0.5, time * 0.4));
  return pow(1.0 - convergence, 4.0);
}

// Turbulence-driven foam
fn foamNoise(uv: vec2f, time: f32, scale: f32) -> f32 {
  let n1 = fract(sin(dot(floor(uv * scale * 4.0), vec2f(127.1, 311.7))) * 43758.5453);
  let n2 = fract(sin(dot(floor(uv * scale * 8.0 + vec2f(time * 0.5, 0.0)), vec2f(269.5, 183.3))) * 43758.5453);
  let turbulence = abs(n1 * 2.0 - 1.0) + abs(n2 * 2.0 - 1.0) * 0.5;
  return smoothstep(0.8, 1.2, turbulence);
}

@fragment
fn fs_caustics(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(inputTexture, texSampler, input.uv);
  let depth = textureSample(depthTexture, texSampler, input.uv).r;

  let worldY = 1.0 - input.uv.y;
  if (worldY > uniforms.waterLevel) {
    return color;
  }

  let depthFactor = exp(-depth * uniforms.depthFade);
  var causticColor = vec3f(0.0);

  if (uniforms.dispersion > 0.001) {
    // Chromatic dispersion: separate R/G/B with different IoR
    let baseIoR = 1.33;
    let t = uniforms.time * uniforms.speed;
    let rC = refractiveCausticPP(input.uv, t, uniforms.scale, baseIoR - uniforms.dispersion);
    let gC = refractiveCausticPP(input.uv, t, uniforms.scale, baseIoR);
    let bC = refractiveCausticPP(input.uv, t, uniforms.scale, baseIoR + uniforms.dispersion);
    causticColor = vec3f(rC, gC, bC) * uniforms.color * uniforms.intensity * depthFactor;
  } else {
    // Standard dual-layer caustics
    let uv1 = input.uv * uniforms.scale + vec2f(uniforms.time * uniforms.speed * 0.3, uniforms.time * uniforms.speed * 0.7);
    let uv2 = input.uv * uniforms.scale * 1.3 + vec2f(-uniforms.time * uniforms.speed * 0.5, uniforms.time * uniforms.speed * 0.4);
    let c1 = voronoiDist(uv1);
    let c2 = voronoiDist(uv2);
    let caustic = pow(1.0 - c1, 3.0) * pow(1.0 - c2, 3.0);
    causticColor = uniforms.color * caustic * uniforms.intensity * depthFactor;
  }

  // Foam overlay
  let foam = foamNoise(input.uv, uniforms.time * uniforms.speed, uniforms.scale) * uniforms.foamIntensity;

  // Caustic shadows: darken where caustics are absent
  let causticLum = dot(causticColor, vec3f(0.333));
  let shadow = mix(1.0, 1.0 - uniforms.shadowStrength, (1.0 - causticLum) * depthFactor);

  let result = color.rgb * shadow + causticColor + vec3f(foam);
  return vec4f(result, color.a);
}
`;

/**
 * Screen-Space Reflections (SSR) shader
 * Ray-marches in screen space to find reflections.
 * Uses hierarchical tracing with binary refinement.
 */
export const SSR_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct SSRUniforms {
  maxSteps: f32,
  stepSize: f32,
  thickness: f32,
  roughnessFade: f32,
  edgeFade: f32,
  intensity: f32,
  roughnessBlur: f32,
  fresnelStrength: f32,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: SSRUniforms;
@group(0) @binding(3) var depthTexture: texture_2d<f32>;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;

@fragment
fn fs_ssr(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(inputTexture, texSampler, input.uv);
  let depth = textureSample(depthTexture, texSampler, input.uv).r;
  let texSize = vec2f(textureDimensions(inputTexture));
  let texel = 1.0 / texSize;

  // Reconstruct normal from depth
  let dc = depth;
  let dl = textureSample(depthTexture, texSampler, input.uv - vec2f(texel.x, 0.0)).r;
  let dr = textureSample(depthTexture, texSampler, input.uv + vec2f(texel.x, 0.0)).r;
  let db = textureSample(depthTexture, texSampler, input.uv - vec2f(0.0, texel.y)).r;
  let dt = textureSample(depthTexture, texSampler, input.uv + vec2f(0.0, texel.y)).r;
  let normal = normalize(vec3f(dl - dr, db - dt, 2.0 * texel.x));

  // View direction (simplified — assumes forward-facing camera)
  let viewDir = normalize(vec3f(input.uv * 2.0 - 1.0, -1.0));

  // Reflect view around normal
  let reflectDir = reflect(viewDir, normal);
  let stepDir = reflectDir.xy * uniforms.stepSize;

  var hitUV = input.uv;
  var hit = false;
  let steps = i32(uniforms.maxSteps);

  for (var i = 1; i <= steps; i++) {
    hitUV += stepDir;

    // Bounds check
    if (hitUV.x < 0.0 || hitUV.x > 1.0 || hitUV.y < 0.0 || hitUV.y > 1.0) { break; }

    let sampleDepth = textureSample(depthTexture, texSampler, hitUV).r;
    let expectedDepth = depth + f32(i) * uniforms.stepSize;

    if (expectedDepth > sampleDepth && expectedDepth - sampleDepth < uniforms.thickness) {
      hit = true;

      // Binary refinement (4 steps)
      var refineStep = stepDir * 0.5;
      for (var j = 0; j < 4; j++) {
        hitUV -= refineStep;
        let rd = textureSample(depthTexture, texSampler, hitUV).r;
        let re = depth + length(hitUV - input.uv) / uniforms.stepSize * uniforms.stepSize;
        if (re > rd) {
          hitUV += refineStep;
        }
        refineStep *= 0.5;
      }
      break;
    }
  }

  if (!hit) { return color; }

  // Roughness blur: golden-angle 8-sample blur at hit point scaled by roughness
  var reflectionColor = vec3f(0.0);
  if (uniforms.roughnessBlur > 0.001) {
    let blurRadius = uniforms.roughnessBlur * 0.01;
    let goldenAngle = 2.399963;
    var totalW = 0.0;
    for (var s = 0; s < 8; s++) {
      let angle = f32(s) * goldenAngle;
      let r = sqrt(f32(s + 1) / 8.0) * blurRadius;
      let blurOffset = vec2f(cos(angle), sin(angle)) * r;
      let sampleC = textureSample(inputTexture, texSampler, hitUV + blurOffset).rgb;
      let w = 1.0 - f32(s) / 8.0;
      reflectionColor += sampleC * w;
      totalW += w;
    }
    reflectionColor /= totalW;
  } else {
    reflectionColor = textureSample(inputTexture, texSampler, hitUV).rgb;
  }

  // Schlick Fresnel weighting
  let cosTheta = max(dot(-viewDir, normal), 0.0);
  let f0 = 0.04; // dielectric
  let fresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
  let fresnelWeight = mix(1.0, fresnel, uniforms.fresnelStrength);

  // Edge fade
  let edgeDist = max(abs(hitUV.x - 0.5), abs(hitUV.y - 0.5)) * 2.0;
  let edgeFade = 1.0 - pow(clamp(edgeDist, 0.0, 1.0), uniforms.edgeFade);

  // Distance fade
  let travelDist = length(hitUV - input.uv);
  let distFade = 1.0 - clamp(travelDist * 2.0, 0.0, 1.0);

  let reflectionMask = edgeFade * distFade * uniforms.intensity * fresnelWeight;
  return vec4f(mix(color.rgb, reflectionColor, reflectionMask), color.a);
}
`;

/**
 * Screen-Space Global Illumination (SSGI) shader
 * Approximates indirect lighting by sampling nearby pixels' colors
 * and treating them as bounce light sources.
 */
export const SSGI_SHADER = /* wgsl */ `
${SHADER_UTILS}

struct SSGIUniforms {
  radius: f32,
  samples: f32,
  bounceIntensity: f32,
  falloff: f32,
  time: f32,
  intensity: f32,
  temporalBlend: f32,
  spatialDenoise: f32,
  multiBounce: f32,
  padding: vec3f,
}

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: SSGIUniforms;
@group(0) @binding(3) var depthTexture: texture_2d<f32>;

@fragment
fn fs_ssgi(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(inputTexture, texSampler, input.uv);
  let centerDepth = textureSample(depthTexture, texSampler, input.uv).r;
  let texSize = vec2f(textureDimensions(inputTexture));
  let texel = 1.0 / texSize;

  // Reconstruct normal from depth
  let dl = textureSample(depthTexture, texSampler, input.uv - vec2f(texel.x, 0.0)).r;
  let dr = textureSample(depthTexture, texSampler, input.uv + vec2f(texel.x, 0.0)).r;
  let db = textureSample(depthTexture, texSampler, input.uv - vec2f(0.0, texel.y)).r;
  let dt = textureSample(depthTexture, texSampler, input.uv + vec2f(0.0, texel.y)).r;
  let normal = normalize(vec3f(dl - dr, db - dt, 2.0 * texel.x));

  var indirect = vec3f(0.0);
  let sampleCount = i32(uniforms.samples);
  let goldenAngle = 2.399963;

  for (var i = 0; i < sampleCount; i++) {
    let fi = f32(i);
    let r = sqrt(fi / uniforms.samples) * uniforms.radius;
    let theta = fi * goldenAngle + uniforms.time * 0.1; // Slight temporal jitter
    let offset = vec2f(cos(theta), sin(theta)) * r * texel * 8.0;
    let sampleUV = input.uv + offset;

    let sampleColor = textureSample(inputTexture, texSampler, sampleUV).rgb;
    let sampleDepth = textureSample(depthTexture, texSampler, sampleUV).r;

    // Weight by depth proximity (nearby surfaces contribute more)
    let depthDiff = abs(centerDepth - sampleDepth);
    let depthWeight = exp(-depthDiff * uniforms.falloff * 10.0);

    // Cosine weight: approximate normal-based falloff
    let sampleDir = normalize(vec3f(offset, 0.05));
    let cosWeight = max(dot(sampleDir, normal), 0.0);

    indirect += sampleColor * depthWeight * cosWeight;
  }

  indirect /= uniforms.samples;
  indirect *= uniforms.bounceIntensity;

  // Multi-bounce approximation: self-illumination feedback
  if (uniforms.multiBounce > 0.001) {
    indirect *= (1.0 + uniforms.multiBounce * luminance(indirect));
  }

  // Spatial denoise: 3×3 edge-stopping cross-bilateral filter
  if (uniforms.spatialDenoise > 0.5) {
    var denoised = indirect;
    var tw = 1.0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) { continue; }
        let off = vec2f(f32(dx), f32(dy)) * texel;
        let sd = textureSample(depthTexture, texSampler, input.uv + off).r;
        // Depth weight
        let dw = exp(-abs(centerDepth - sd) * uniforms.falloff * 10.0);
        // Normal weight
        let snl = textureSample(depthTexture, texSampler, input.uv + off - vec2f(texel.x, 0.0)).r;
        let snr = textureSample(depthTexture, texSampler, input.uv + off + vec2f(texel.x, 0.0)).r;
        let snb = textureSample(depthTexture, texSampler, input.uv + off - vec2f(0.0, texel.y)).r;
        let snt = textureSample(depthTexture, texSampler, input.uv + off + vec2f(0.0, texel.y)).r;
        let sn = normalize(vec3f(snl - snr, snb - snt, 2.0 * texel.x));
        let nw = max(dot(normal, sn), 0.0);
        let w = dw * nw;
        // Sample neighbor's indirect (approximation: use color luminance ratio)
        let neighborColor = textureSample(inputTexture, texSampler, input.uv + off).rgb;
        denoised += neighborColor * uniforms.bounceIntensity * w * 0.5;
        tw += w;
      }
    }
    indirect = denoised / tw;
  }

  var result = color.rgb + indirect * uniforms.intensity;

  // Temporal blend: mix with previous frame color (approximation using current frame offset)
  if (uniforms.temporalBlend > 0.001) {
    // Approximate temporal reprojection by blending with slightly jittered sample
    let temporalUV = input.uv + vec2f(sin(uniforms.time * 31.0), cos(uniforms.time * 37.0)) * texel * 0.5;
    let prevColor = textureSample(inputTexture, texSampler, temporalUV).rgb;
    result = mix(result, prevColor + indirect * uniforms.intensity * 0.5, uniforms.temporalBlend * 0.3);
  }

  return vec4f(result, color.a);
}
`;

/**
 * Build a complete effect shader by combining vertex shader,
 * utilities, and the effect's fragment shader.
 */
export function buildEffectShader(fragmentShader: string): string {
  return `${FULLSCREEN_VERTEX_SHADER}\n${SHADER_UTILS}\n${fragmentShader}`;
}
