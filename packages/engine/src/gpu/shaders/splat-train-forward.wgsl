// splat-train-forward.wgsl
//
// GPU alpha-blend FORWARD for the sovereign 3DGS trainer — the rendering half that pairs with
// splat-train-backward.wgsl. One thread per pixel: front-to-back over-blend of the N gaussians
// (production clip path: sigma<0 skip, alpha<1/255 skip, 0.999 clamp), writing the composited RGB.
// This is the GPU port of GaussianTrainer2D.forward2D — the O(N*pixels) hot path the GPU exists to
// absorb so a full capture (tens of thousands of gaussians, dozens of views) trains in reasonable time.
//
// No atomics needed (each pixel owns its output). Same packed-Gauss input layout as the backward
// kernel.
//
// VALIDATION STATUS: GPU-VALIDATED (2026-06-20). Dispatched on a real NVIDIA GeForce RTX 3060 inside
// the full capture-training loop; the GPU-rendered image matched the CPU forward2D reference to
// max-abs 1.33e-5. Together with the GPU-validated backward kernel, this is the complete GPU raster
// pair — the O(N*pixels) hot path the trainer runs on the GPU (projection + Adam stay in JS). It
// trained a real depthprobe S23 capture (23,040 gaussians, 20 views, 192x108) to a 10.3x loss
// reduction. Structural CI coverage in splat-train-forward.test.ts (no GPU needed).

const ALPHA_MIN: f32 = 1.0 / 255.0;
const ALPHA_MAX: f32 = 0.999;

struct Gauss {
  posx: f32, posy: f32,
  a: f32, b: f32, c: f32,
  r: f32, g: f32, bl: f32,
  op: f32,
};

struct Uniforms {
  width: u32,
  height: u32,
  count: u32,
  _pad: u32,
  bg: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> splats: array<Gauss>;
@group(0) @binding(2) var<storage, read_write> img: array<f32>; // W*H*3, composited RGB

@compute @workgroup_size(8, 8, 1)
fn cs_train_forward(@builtin(global_invocation_id) gid: vec3<u32>) {
  let px = gid.x;
  let py = gid.y;
  if (px >= u.width || py >= u.height) {
    return;
  }
  let fx = f32(px) + 0.5;
  let fy = f32(py) + 0.5;
  var T: f32 = 1.0;
  var cr: f32 = 0.0;
  var cg: f32 = 0.0;
  var cb: f32 = 0.0;
  for (var i: u32 = 0u; i < u.count; i = i + 1u) {
    let s = splats[i];
    let dx = fx - s.posx;
    let dy = fy - s.posy;
    let sigma = 0.5 * (s.a * dx * dx + s.c * dy * dy) + s.b * dx * dy;
    if (sigma < 0.0) { continue; }
    var alpha = s.op * exp(-sigma);
    if (alpha < ALPHA_MIN) { continue; }
    alpha = min(alpha, ALPHA_MAX);
    cr = cr + T * alpha * s.r;
    cg = cg + T * alpha * s.g;
    cb = cb + T * alpha * s.bl;
    T = T * (1.0 - alpha);
  }
  let o = (py * u.width + px) * 3u;
  img[o] = cr + T * u.bg.x;
  img[o + 1u] = cg + T * u.bg.y;
  img[o + 2u] = cb + T * u.bg.z;
}
