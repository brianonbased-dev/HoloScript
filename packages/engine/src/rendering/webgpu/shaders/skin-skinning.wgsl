// skin-skinning.wgsl — shared native-WebGPU character shading module.
//
// One module, multiple fragment entry points selected per material group by the renderer:
//   fs_lambert   — two-sided half-Lambert (the Phase-0 base + the single-material fallback)
//   fs_skin_sss  — single-pass real-time skin: per-channel wrap diffuse + scatter tint +
//                  thin-slab back transmission + Schlick-Fresnel specular + Reinhard tonemap
//
// Bind groups are split so the shared frame state (camera + light + skin palette) is set ONCE
// and only the per-group Material changes between draws (material-groups model):
//   @group(0) = Frame{mvp,model,cameraPos,lightDir} + joints palette   (shared, set once)
//   @group(1) = Material                                               (per group/draw)
//
// Vertex stage: backward-compatible dual-influence linear-blend skinning. Legacy meshes bind
// their secondary index to the primary with weight zero; V4 hands author normalized pairs.
// Emits world position + world normal so the fragment stages have view/light geometry.
// cullMode 'none' downstream, so the lit terms are two-sided where appropriate.

struct Frame {
  mvp       : mat4x4<f32>,
  model     : mat4x4<f32>,   // root placement → world position for view dir
  cameraPos : vec4<f32>,     // xyz world camera; w unused
  keyDirection  : vec4<f32>,
  keyColor      : vec4<f32>,
  fillDirection : vec4<f32>,
  fillColor     : vec4<f32>,
  rimDirection  : vec4<f32>,
  rimColor      : vec4<f32>,
  envParams     : vec4<f32>, // x exposure; y analytic-three-point enabled
};
@group(0) @binding(0) var<uniform> frame : Frame;
@group(0) @binding(1) var<storage, read> joints : array<mat4x4<f32>>;

struct Material {
  color        : vec4<f32>,  // rgb baseColor (linear); a = opacity
  scatterColor : vec4<f32>,  // rgb subsurface tint (linear); w = roughness
  scatterDist  : vec4<f32>,  // rgb scatter radius; w = analytic skin-microdetail strength
  params       : vec4<f32>,  // x = specularF0, y = thickness, z = transmitStrength, w = ambient
  texFlags     : vec4<f32>,  // skin xyz = albedo/roughness/normal amplitudes; w = microdetail scale / cloth UV repeat
  albedoTile   : array<vec4<f32>, 4>,
  normalXTile  : array<vec4<f32>, 4>,
  normalYTile  : array<vec4<f32>, 4>,
  roughTile    : array<vec4<f32>, 4>,
};
@group(1) @binding(0) var<uniform> mat : Material;

struct VSIn {
  @location(0) pos : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) jointIndex : u32,
  @location(3) jointWeight : f32,
  @location(4) tangent : vec4<f32>,   // xyz strand-flow tangent; w = strandT
  @location(5) uv : vec2<f32>,
  @location(6) secondaryJointIndex : u32,
  @location(7) secondaryJointWeight : f32,
};
struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) wN : vec3<f32>,
  @location(1) wP : vec3<f32>,
  @location(2) wT : vec3<f32>,        // skinned tangent (hair)
  @location(3) strandT : f32,         // 0 root → 1 tip (hair)
  @location(4) uv : vec2<f32>,
  @location(5) bodyP : vec3<f32>,      // posed body-local position for attached microdetail
};

@vertex
fn vs(in : VSIn) -> VSOut {
  let primarySkin = joints[in.jointIndex];
  let secondarySkin = joints[in.secondaryJointIndex];
  let primaryWeight = clamp(in.jointWeight, 0.0, 1.0);
  let secondaryWeight = clamp(in.secondaryJointWeight, 0.0, 1.0 - primaryWeight);
  let totalWeight = primaryWeight + secondaryWeight;
  let bindP = vec4<f32>(in.pos, 1.0);
  let sp =
    bindP * (1.0 - totalWeight) +
    primarySkin * bindP * primaryWeight +
    secondarySkin * bindP * secondaryWeight;
  let skinnedNormal =
    (primarySkin * vec4<f32>(in.normal, 0.0)).xyz * primaryWeight +
    (secondarySkin * vec4<f32>(in.normal, 0.0)).xyz * secondaryWeight;
  let skinnedTangent =
    (primarySkin * vec4<f32>(in.tangent.xyz, 0.0)).xyz * primaryWeight +
    (secondarySkin * vec4<f32>(in.tangent.xyz, 0.0)).xyz * secondaryWeight;
  let hasSkin = totalWeight > 0.000001;
  var o : VSOut;
  o.clip = frame.mvp * vec4<f32>(sp.xyz, 1.0);
  o.wP = (frame.model * vec4<f32>(sp.xyz, 1.0)).xyz;
  o.wN = select(in.normal, skinnedNormal / max(totalWeight, 0.000001), hasSkin);
  o.wT = select(in.tangent.xyz, skinnedTangent / max(totalWeight, 0.000001), hasSkin);
  o.strandT = in.tangent.w;
  o.uv = in.uv;
  o.bodyP = sp.xyz;
  return o;
}

// ── Fallback: flat two-sided half-Lambert (identical look to the Phase-0 shader). ──
fn environmentDiffuse(n : vec3<f32>, twoSided : bool) -> vec3<f32> {
  let keyN = select(
    max(dot(n, normalize(frame.keyDirection.xyz)), 0.0),
    abs(dot(n, normalize(frame.keyDirection.xyz))),
    twoSided
  );
  let fillN = select(
    max(dot(n, normalize(frame.fillDirection.xyz)), 0.0),
    abs(dot(n, normalize(frame.fillDirection.xyz))),
    twoSided
  );
  let rimN = select(
    max(dot(n, normalize(frame.rimDirection.xyz)), 0.0),
    abs(dot(n, normalize(frame.rimDirection.xyz))),
    twoSided
  );
  return
    frame.keyColor.rgb * frame.keyColor.w * keyN +
    frame.fillColor.rgb * frame.fillColor.w * fillN +
    frame.rimColor.rgb * frame.rimColor.w * rimN;
}

@fragment
fn fs_lambert(in : VSOut) -> @location(0) vec4<f32> {
  let n = normalize(in.wN);
  let lit = vec3<f32>(0.35) + environmentDiffuse(n, true) * 0.65;
  return vec4<f32>(mat.color.rgb * lit * frame.envParams.x, mat.color.a);
}

fn fresnel(cosT : f32, f0 : f32) -> f32 {
  return f0 + (1.0 - f0) * pow(saturate(1.0 - cosT), 5.0);
}

// Two incommensurate analytic waves avoid a repeating axis-aligned grid while keeping the
// source-derived microdetail deterministic, texture-free, and cheap enough for a bounded lane.
fn analyticPoreSignal(p : vec3<f32>) -> f32 {
  let primary = sin(p.x) * sin(p.y * 1.37) * sin(p.z * 0.83);
  let q = vec3<f32>(
    p.y * 0.71 + p.z * 0.19,
    p.z * 1.11 + p.x * 0.17,
    p.x * 0.91 + p.y * 0.13
  );
  let secondary = sin(q.x) * sin(q.y) * sin(q.z);
  return 0.5 + 0.5 * (primary * 0.62 + secondary * 0.38);
}

fn analyticPoreNormal(
  baseN : vec3<f32>,
  authoredTangent : vec3<f32>,
  p : vec3<f32>,
  scale : f32,
  strength : f32
) -> vec3<f32> {
  let projectedTangent = authoredTangent - baseN * dot(authoredTangent, baseN);
  let fallbackAxis = select(
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(1.0, 0.0, 0.0),
    abs(baseN.y) > 0.92
  );
  let fallbackTangent = normalize(cross(fallbackAxis, baseN));
  let T = normalize(select(fallbackTangent, projectedTangent, length(projectedTangent) > 0.0001));
  let B = normalize(cross(baseN, T));
  let q = p * scale;
  let epsilon = 0.035;
  let dx =
    analyticPoreSignal(q + vec3<f32>(epsilon, 0.0, 0.0)) -
    analyticPoreSignal(q - vec3<f32>(epsilon, 0.0, 0.0));
  let dy =
    analyticPoreSignal(q + vec3<f32>(0.0, epsilon, 0.0)) -
    analyticPoreSignal(q - vec3<f32>(0.0, epsilon, 0.0));
  let dz =
    analyticPoreSignal(q + vec3<f32>(0.0, 0.0, epsilon)) -
    analyticPoreSignal(q - vec3<f32>(0.0, 0.0, epsilon));
  let gradient = vec3<f32>(dx, dy, dz) / (2.0 * epsilon);
  let tangentSlope = dot(gradient, T);
  let bitangentSlope = dot(gradient, B);
  return normalize(
    baseN - (T * tangentSlope + B * bitangentSlope) * clamp(strength, 0.0, 0.35)
  );
}

// ── Skin: single-pass subsurface approximation of the CPU Burley model. ──
@fragment
fn fs_skin_sss(in : VSOut) -> @location(0) vec4<f32> {
  let baseN = normalize(in.wN);
  let L = normalize(frame.keyDirection.xyz);
  let V = normalize(frame.cameraPos.xyz - in.wP);
  let microScale = max(mat.texFlags.w, 0.0);
  let pore = select(0.5, analyticPoreSignal(in.bodyP * microScale), microScale > 0.0);
  let N = analyticPoreNormal(
    baseN,
    in.wT,
    in.bodyP,
    microScale,
    select(0.0, mat.texFlags.z, microScale > 0.0)
  );
  let ndl = dot(N, L);

  // Per-channel wrap widths from relative scatter radii — red widest, so light leaks
  // furthest past the terminator (reproduces the CPU model's wide-R / tight-B character).
  let radii = mat.scatterDist.rgb;
  let maxR = max(radii.r, max(radii.g, radii.b)) + 1e-4;
  let wrap = clamp(radii * (0.6 / maxR), vec3<f32>(0.15), vec3<f32>(0.6));
  let diffuse = max(vec3<f32>(0.0), (vec3<f32>(ndl) + wrap) / (vec3<f32>(1.0) + wrap));

  // Redden the terminator: tint where light grazes toward the subsurface colour.
  let term = smoothstep(0.0, 0.5, 1.0 - max(ndl, 0.0));
  let tint = mix(vec3<f32>(1.0), mat.scatterColor.rgb, term);
  let fillDiffuse = max(dot(N, normalize(frame.fillDirection.xyz)), 0.0);
  let rimDiffuse = max(dot(N, normalize(frame.rimDirection.xyz)), 0.0);
  let sss =
    diffuse * tint * frame.keyColor.rgb * frame.keyColor.w +
    vec3<f32>(fillDiffuse) * frame.fillColor.rgb * frame.fillColor.w +
    vec3<f32>(rimDiffuse) * frame.rimColor.rgb * frame.rimColor.w;

  // Thin-slab back transmission (relative radii, NO unit fold-in — stays visible).
  let backLobe = pow(saturate(dot(-V, L)), 3.0);
  let transmit = mat.scatterColor.rgb * backLobe * mat.params.z * (1.0 - mat.params.y);

  // Source-authored analytic pore response. A zero strength or scale is exactly the legacy path.
  // Specular: roughness→Beckmann-ish exponent (clamped so pow() never NaNs).
  let roughnessVariation = clamp(mat.texFlags.y, 0.0, 0.2);
  let rough = clamp(mat.scatterColor.w + (pore - 0.5) * roughnessVariation, 0.05, 1.0);
  let H = normalize(L + V);
  let ndh = max(dot(N, H), 0.0);
  let expo = 2.0 / (rough * rough) - 2.0;
  let spec = pow(ndh, expo) * fresnel(max(dot(V, H), 0.0), mat.params.x);

  let albedoVariation = clamp(mat.texFlags.x, 0.0, 0.08);
  let microAlbedo = 1.0 + (pore - 0.5) * albedoVariation;
  var color =
    mat.color.rgb * microAlbedo * (vec3<f32>(mat.params.w) + sss) +
    transmit +
    frame.keyColor.rgb * vec3<f32>(spec) * frame.keyColor.w;
  color *= frame.envParams.x;
  color = color / (color + vec3<f32>(1.0)); // Reinhard
  return vec4<f32>(color, mat.color.a);
}

// melanin → hair colour (eumelanin/pheomelanin absorption; port of HairRenderer melaninToColor).
fn melaninColor(m : f32, red : f32) -> vec3<f32> {
  let eu = m;
  let ph = red * m;
  return clamp(
    vec3<f32>(exp(-eu * 1.5 - ph * 0.5), exp(-eu * 2.5 - ph * 1.5), exp(-eu * 4.0 - ph * 3.0)),
    vec3<f32>(0.02),
    vec3<f32>(1.0)
  );
}

// ── Hair: tangent-aware dual-lobe response + analytic card-width coverage. ──
// Material packing (from fillMaterial 'marschner-hair'): scatterColor = (melanin, redness,
// primaryExp, secondaryExp); scatterDist = (coverage, edgeSoftness, anisotropyStrength,
// coverageProfileCode); params.x = longitudinalShift; color.a = opacity.
@fragment
fn fs_marschner(in : VSOut) -> @location(0) vec4<f32> {
  let N = normalize(in.wN);
  let shift = clamp(mat.params.x, -0.35, 0.35);
  let T = normalize(in.wT + N * shift);
  let TSecondary = normalize(in.wT - N * shift * 0.65);
  let L = normalize(frame.keyDirection.xyz);
  let V = normalize(frame.cameraPos.xyz - in.wP);
  let H = normalize(L + V);

  let TdotL = dot(T, L);
  let TdotV = dot(T, V);
  let sinTL = sqrt(max(0.0, 1.0 - TdotL * TdotL));
  let sinTV = sqrt(max(0.0, 1.0 - TdotV * TdotV));
  let kkDiffuse = sinTL; // Kajiya-Kay diffuse ≈ sin(T,L)

  // Dual-lobe highlight (KK cos-difference term), shifted longitudinally in opposing directions.
  let tangentLobe = max(0.0, sinTL * sinTV - TdotL * TdotV);
  let secondaryTdotL = dot(TSecondary, L);
  let secondaryTdotV = dot(TSecondary, V);
  let secondarySinTL = sqrt(max(0.0, 1.0 - secondaryTdotL * secondaryTdotL));
  let secondarySinTV = sqrt(max(0.0, 1.0 - secondaryTdotV * secondaryTdotV));
  let secondaryTangentLobe =
    max(0.0, secondarySinTL * secondarySinTV - secondaryTdotL * secondaryTdotV);
  let isotropicLobe = max(dot(N, H), 0.0);
  let anisotropy = clamp(mat.scatterDist.z, 0.0, 1.0);
  let primaryLobe = mix(isotropicLobe, tangentLobe, anisotropy);
  let secondaryLobe = mix(isotropicLobe, secondaryTangentLobe, anisotropy);
  let primaryExp = max(mat.scatterColor.z, 1.0);
  let secondaryExp = max(mat.scatterColor.w, 1.0);
  let specR = pow(primaryLobe, primaryExp);
  let specTRT = pow(secondaryLobe, secondaryExp) * 0.5;

  var alpha = mat.color.a;
  let coverageMode = mat.scatterDist.w > 0.5;
  let isCard = in.uv.y >= 0.0;
  if (coverageMode && isCard) {
    let halfWidth = clamp(mat.scatterDist.x, 0.2, 1.0);
    let softness = clamp(mat.scatterDist.y, 0.01, 0.5);
    let edge = abs(in.uv.x * 2.0 - 1.0);
    alpha *= 1.0 - smoothstep(halfWidth - softness, halfWidth, edge);
    if (alpha < 0.01) {
      discard;
    }
  }

  let base = melaninColor(mat.scatterColor.x, mat.scatterColor.y);
  let rootDarken = mix(0.55, 1.0, in.strandT);
  let environment = select(
    vec3<f32>(kkDiffuse * 0.6 + 0.25),
    vec3<f32>(0.25) + environmentDiffuse(N, false) * 0.6,
    frame.envParams.y > 0.5
  );
  var col = base * rootDarken * environment
          + frame.keyColor.rgb * vec3<f32>(specR * 0.35) * frame.keyColor.w
          + base * specTRT * 0.3;
  return vec4<f32>(col * frame.envParams.x, alpha);
}

// ── Eye: legacy composite or one native sclera/iris/pupil/cornea geometry region. ──
// Material packing: color = region colour; scatterColor.x = ior; .y = region code (0..4).
@fragment
fn fs_eye(in : VSOut) -> @location(0) vec4<f32> {
  let N = normalize(in.wN);
  let L = normalize(frame.keyDirection.xyz);
  let V = normalize(frame.cameraPos.xyz - in.wP);
  let facing = max(dot(N, V), 0.0); // 1 at the front of the eyeball, 0 at the rim
  let H = normalize(L + V);
  let ndh = max(dot(N, H), 0.0);
  let catchlight = pow(ndh, 200.0);
  let ior = max(mat.scatterColor.x, 1.0);
  let region = i32(mat.scatterColor.y + 0.5);

  if (region == 1) {
    let fres = pow(1.0 - facing, 4.0) * 0.06;
    let col =
      mat.color.rgb * (vec3<f32>(0.38) + environmentDiffuse(N, false) * 0.62) +
      frame.keyColor.rgb * (catchlight * 0.18 + fres) * frame.keyColor.w;
    return vec4<f32>(col * frame.envParams.x, mat.color.a);
  }

  if (region == 2) {
    let radial = clamp(distance(in.uv, vec2<f32>(0.5)) * 2.0, 0.0, 1.0);
    let fibre = 0.84 + 0.16 * sin((in.uv.x * 1.7 + in.uv.y) * 76.0);
    let limbal = 1.0 - smoothstep(0.72, 1.0, radial) * 0.48;
    let inner = mix(0.72, 1.0, smoothstep(0.08, 0.62, radial));
    let col =
      mat.color.rgb * fibre * limbal * inner *
      (vec3<f32>(0.34) + environmentDiffuse(N, false) * 0.66);
    return vec4<f32>(col * frame.envParams.x, mat.color.a);
  }

  if (region == 3) {
    return vec4<f32>(
      mat.color.rgb * (vec3<f32>(0.18) + environmentDiffuse(N, false) * 0.22) *
        frame.envParams.x,
      mat.color.a
    );
  }

  if (region == 4) {
    let f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
    let fres = f0 + (1.0 - f0) * pow(1.0 - facing, 5.0);
    let alpha = clamp(mat.color.a + fres * 0.55 + catchlight * 0.25, 0.0, 0.82);
    let col = frame.keyColor.rgb * (catchlight * 1.15 + fres * 0.28) * frame.keyColor.w;
    return vec4<f32>(col, alpha);
  }

  let iris = mat.color.rgb;
  let sclera = vec3<f32>(0.93, 0.93, 0.91);
  var base = mix(sclera, iris, smoothstep(0.55, 0.9, facing)); // sclera ring → iris center
  let pupil = smoothstep(0.86, 0.98, facing);
  base = mix(base, vec3<f32>(0.02), pupil); // dark pupil at dead-center

  let fres = pow(1.0 - facing, 4.0) * (ior - 1.0); // corneal rim

  let col =
    base * (vec3<f32>(0.3) + environmentDiffuse(N, false) * 0.7) +
    frame.keyColor.rgb * vec3<f32>(catchlight + fres * 0.3) * frame.keyColor.w;
  return vec4<f32>(col * frame.envParams.x, mat.color.a);
}

// ── Woven cloth: broad rough specular + grazing fibre sheen + micro-weave breakup. ──
// Material packing: scatterColor = (roughness, sheen, weaveScale, rimStrength).
fn sampleTile(tile : array<vec4<f32>, 4>, uv : vec2<f32>) -> f32 {
  let wrapped = fract(uv);
  let column = u32(clamp(floor(wrapped.x * 4.0), 0.0, 3.0));
  let row = u32(clamp(floor(wrapped.y * 4.0), 0.0, 3.0));
  return tile[row][column];
}

@fragment
fn fs_woven_cloth(in : VSOut) -> @location(0) vec4<f32> {
  let baseN = normalize(in.wN);
  let repeat = clamp(mat.texFlags.w, 1.0, 16.0);
  let tiledUv = in.uv * repeat;
  let normalX = sampleTile(mat.normalXTile, tiledUv) * 2.0 - 1.0;
  let normalY = sampleTile(mat.normalYTile, tiledUv) * 2.0 - 1.0;
  let tangent = normalize(in.wT);
  let bitangent = normalize(cross(baseN, tangent));
  let mappedN = normalize(tangent * normalX + bitangent * normalY + baseN);
  let N = normalize(mix(baseN, mappedN, mat.texFlags.y));
  let L = normalize(frame.keyDirection.xyz);
  let V = normalize(frame.cameraPos.xyz - in.wP);
  let H = normalize(L + V);
  let ndv = max(dot(N, V), 0.0);
  let ndh = max(dot(N, H), 0.0);

  let mappedRough = sampleTile(mat.roughTile, tiledUv);
  let rough = clamp(mix(mat.scatterColor.x, mappedRough, mat.texFlags.z), 0.08, 1.0);
  let sheenStrength = clamp(mat.scatterColor.y, 0.0, 1.0);
  let weaveScale = max(mat.scatterColor.z, 1.0);
  let rimStrength = clamp(mat.scatterColor.w, 0.0, 1.0);

  // World-space crossed fibres keep the procedural garment texture-owned and UV independent.
  let warp = sin(in.wP.x * weaveScale * 6.28318);
  let weft = sin(in.wP.y * weaveScale * 6.28318);
  let weave = 0.92 + 0.08 * warp * weft;

  let specExp = max(2.0, 2.0 / (rough * rough) - 2.0);
  let roughSpec = pow(ndh, specExp) * (0.04 + 0.08 * (1.0 - rough));
  let fibreSheen = pow(1.0 - ndv, 3.0) * sheenStrength;
  let rim = pow(1.0 - ndv, 4.0) * rimStrength;

  let albedo = mix(1.0, sampleTile(mat.albedoTile, tiledUv), mat.texFlags.x);
  var col =
    mat.color.rgb * albedo * weave *
    (vec3<f32>(0.18) + environmentDiffuse(N, false) * 0.82);
  col += mat.color.rgb * fibreSheen * 0.35;
  col += vec3<f32>(roughSpec + rim * 0.12);
  col = col / (col + vec3<f32>(1.0));
  return vec4<f32>(col * frame.envParams.x, mat.color.a);
}
