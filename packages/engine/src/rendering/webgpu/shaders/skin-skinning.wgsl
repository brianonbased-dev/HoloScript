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
// Vertex stage: single-bone linear-blend skinning (rigid procedural body); emits world
// position + world normal so the fragment stages have view/light geometry. cullMode 'none'
// downstream, so the lit terms are two-sided where appropriate.

struct Frame {
  mvp       : mat4x4<f32>,
  model     : mat4x4<f32>,   // root placement → world position for view dir
  cameraPos : vec4<f32>,     // xyz world camera; w unused
  lightDir  : vec4<f32>,     // xyz world light direction; w unused
};
@group(0) @binding(0) var<uniform> frame : Frame;
@group(0) @binding(1) var<storage, read> joints : array<mat4x4<f32>>;

struct Material {
  color        : vec4<f32>,  // rgb baseColor (linear); a = opacity
  scatterColor : vec4<f32>,  // rgb subsurface tint (linear); w = roughness
  scatterDist  : vec4<f32>,  // rgb per-channel relative scatter radius; w unused
  params       : vec4<f32>,  // x = specularF0, y = thickness, z = transmitStrength, w = ambient
};
@group(1) @binding(0) var<uniform> mat : Material;

struct VSIn {
  @location(0) pos : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) jointIndex : u32,
  @location(3) jointWeight : f32,
  @location(4) tangent : vec4<f32>,   // xyz strand-flow tangent; w = strandT
};
struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) wN : vec3<f32>,
  @location(1) wP : vec3<f32>,
  @location(2) wT : vec3<f32>,        // skinned tangent (hair)
  @location(3) strandT : f32,         // 0 root → 1 tip (hair)
};

@vertex
fn vs(in : VSIn) -> VSOut {
  let skin = joints[in.jointIndex];
  let sp = mix(vec4<f32>(in.pos, 1.0), skin * vec4<f32>(in.pos, 1.0), in.jointWeight);
  var o : VSOut;
  o.clip = frame.mvp * vec4<f32>(sp.xyz, 1.0);
  o.wP = (frame.model * vec4<f32>(sp.xyz, 1.0)).xyz;
  o.wN = (skin * vec4<f32>(in.normal, 0.0)).xyz;
  o.wT = (skin * vec4<f32>(in.tangent.xyz, 0.0)).xyz; // tangent rides the bone too
  o.strandT = in.tangent.w;
  return o;
}

// ── Fallback: flat two-sided half-Lambert (identical look to the Phase-0 shader). ──
@fragment
fn fs_lambert(in : VSOut) -> @location(0) vec4<f32> {
  let n = normalize(in.wN);
  let l = normalize(frame.lightDir.xyz);
  let ndl = abs(dot(n, l));
  let lit = 0.35 + 0.65 * ndl;
  return vec4<f32>(mat.color.rgb * lit, mat.color.a);
}

fn fresnel(cosT : f32, f0 : f32) -> f32 {
  return f0 + (1.0 - f0) * pow(saturate(1.0 - cosT), 5.0);
}

// ── Skin: single-pass subsurface approximation of the CPU Burley model. ──
@fragment
fn fs_skin_sss(in : VSOut) -> @location(0) vec4<f32> {
  let N = normalize(in.wN);
  let L = normalize(frame.lightDir.xyz);
  let V = normalize(frame.cameraPos.xyz - in.wP);
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
  let sss = diffuse * tint;

  // Thin-slab back transmission (relative radii, NO unit fold-in — stays visible).
  let backLobe = pow(saturate(dot(-V, L)), 3.0);
  let transmit = mat.scatterColor.rgb * backLobe * mat.params.z * (1.0 - mat.params.y);

  // Specular: roughness→Beckmann-ish exponent (clamped so pow() never NaNs).
  let rough = clamp(mat.scatterColor.w, 0.05, 1.0);
  let H = normalize(L + V);
  let ndh = max(dot(N, H), 0.0);
  let expo = 2.0 / (rough * rough) - 2.0;
  let spec = pow(ndh, expo) * fresnel(max(dot(V, H), 0.0), mat.params.x);

  var color = mat.color.rgb * (vec3<f32>(mat.params.w) + sss) + transmit + vec3<f32>(spec);
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

// ── Hair: Kajiya-Kay anisotropic diffuse + dual-lobe highlight using a REAL strand tangent. ──
// Material packing (from fillMaterial 'marschner-hair'): scatterColor = (melanin, redness,
// primaryExp, secondaryExp); color.a = opacity.
@fragment
fn fs_marschner(in : VSOut) -> @location(0) vec4<f32> {
  let T = normalize(in.wT);
  let L = normalize(frame.lightDir.xyz);
  let V = normalize(frame.cameraPos.xyz - in.wP);

  let TdotL = dot(T, L);
  let TdotV = dot(T, V);
  let sinTL = sqrt(max(0.0, 1.0 - TdotL * TdotL));
  let sinTV = sqrt(max(0.0, 1.0 - TdotV * TdotV));
  let kkDiffuse = sinTL; // Kajiya-Kay diffuse ≈ sin(T,L)

  // Dual-lobe highlight (KK cos-difference term), primary sharp + secondary broad.
  let lobe = max(0.0, sinTL * sinTV - TdotL * TdotV);
  let primaryExp = max(mat.scatterColor.z, 1.0);
  let secondaryExp = max(mat.scatterColor.w, 1.0);
  let specR = pow(lobe, primaryExp);
  let specTRT = pow(lobe, secondaryExp) * 0.5;

  let base = melaninColor(mat.scatterColor.x, mat.scatterColor.y);
  let rootDarken = mix(0.55, 1.0, in.strandT);
  var col = base * rootDarken * (kkDiffuse * 0.6 + 0.25)
          + vec3<f32>(specR * 0.35)
          + base * specTRT * 0.3;
  return vec4<f32>(col, mat.color.a);
}
