// skin-skinning.wgsl — native WebGPU GPU skinning for HoloScript characters.
//
// Linear-blend skinning (LBS) with a single bone influence per vertex (rigid per-bone — the
// procedural AgentAvatarMesh body). The skin matrix palette (skin = worldPose · inverseBind)
// is supplied per-frame as a read-only storage buffer; the vertex stage transforms each
// vertex by its bone's matrix, the fragment stage applies a two-sided half-Lambert shade
// (cullMode 'none' downstream, so both faces read). MVP folds viewProj·model on the CPU.
//
// This is the Phase-0 base material; Phase 1 layers skin-SSS / Marschner-hair on top.

struct U {
  mvp : mat4x4<f32>,
  color : vec4<f32>,
  lightDir : vec4<f32>, // xyz = world-space light direction; w unused
};

@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var<storage, read> joints : array<mat4x4<f32>>;

struct VSIn {
  @location(0) pos : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) jointIndex : u32,
  @location(3) jointWeight : f32,
};

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) worldNormal : vec3<f32>,
};

@vertex
fn vs(in : VSIn) -> VSOut {
  let skin = joints[in.jointIndex];
  // Blend bind→skinned by weight (weight==1 ⇒ fully skinned for the rigid procedural body).
  let skinnedPos = mix(vec4<f32>(in.pos, 1.0), skin * vec4<f32>(in.pos, 1.0), in.jointWeight);
  let skinnedNormal = (skin * vec4<f32>(in.normal, 0.0)).xyz;

  var out : VSOut;
  out.clip = u.mvp * vec4<f32>(skinnedPos.xyz, 1.0);
  out.worldNormal = skinnedNormal;
  return out;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let n = normalize(in.worldNormal);
  let l = normalize(u.lightDir.xyz);
  // Two-sided half-Lambert: ambient floor + wrapped diffuse so the figure reads in the round.
  let ndl = abs(dot(n, l));
  let lit = 0.35 + 0.65 * ndl;
  return vec4<f32>(u.color.rgb * lit, u.color.a);
}
