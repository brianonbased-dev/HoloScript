// splat-train-backward.wgsl
//
// GPU alpha-blend BACKWARD for the sovereign 3DGS trainer — Stage 3 WGSL port of the
// gradient-checked CPU reference GaussianTrainer2D.backward2D. One thread per pixel: replay the
// front-to-back over-blend, then walk back-to-front accumulating dL/d{mean2d, conic, color, opacity}
// per gaussian.  This is the GPU half of the native trainer (Stage 1/2 = CPU autodiff core).
//
// WebGPU has no atomic<f32>, so per-gaussian gradients scatter via fixed-point atomic<i32>
// (same technique as mls-mpm-p2g.wgsl). Unlike that physics kernel we ROUND rather than truncate —
// gradients need an unbiased quantizer, and round() keeps the parity error ~sqrt(P)*0.5/SCALE
// instead of a P/SCALE one-sided bias.
//
// Buffer budget: 1 uniform + 1 read (splats) + 1 read (dLimg) + 1 read_write (grad) = 4 — within the
// baseline maxStorageBuffersPerShaderStage of 8 (Jetson/mobile-safe). Params packed into one struct
// buffer (all f32 → 4-byte alignment, no std140 padding traps); grads flat at i*9+k.
//
// PARITY: splat-train-backward.parity.ts mirrors this math exactly (incl. the fixed-point round-trip)
// and is tested against backward2D. The CPU reference iterates ALL N gaussians per pixel; MAX_HITS
// bounds the per-pixel local hit list — scenes with deeper per-pixel overlap need the tiled follow-up.

// 16-bit fractional; MUST match the parity twin. The global scale trades precision vs i32 overflow:
// accumulated |grad|*SCALE must stay < 2^31. Safe for bounded scenes; very large images / deep
// per-pixel overlap need an adaptive scale or tiled reduction (same follow-up as MAX_HITS).
const FIXED_POINT_SCALE: f32 = 65536.0;
const MAX_HITS: u32 = 256u;
const ALPHA_MIN: f32 = 1.0 / 255.0;
const ALPHA_MAX: f32 = 0.999;

// One packed gaussian: mean2d, conic (a,b,c), color (r,g,b), opacity. All f32 (align 4, stride 36).
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
  bg: vec4<f32>, // .xyz = background color
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> splats: array<Gauss>;
@group(0) @binding(2) var<storage, read> dLimg: array<f32>; // W*H*3, upstream gradient
// Flat per-gaussian gradient accumulator: grad[i*9 + k], k = {posx,posy,a,b,c,r,g,bl,op}.
@group(0) @binding(3) var<storage, read_write> grad: array<atomic<i32>>;

fn toFixed(v: f32) -> i32 {
  return i32(round(v * FIXED_POINT_SCALE));
}

@compute @workgroup_size(8, 8, 1)
fn cs_train_backward(@builtin(global_invocation_id) gid: vec3<u32>) {
  let px = gid.x;
  let py = gid.y;
  if (px >= u.width || py >= u.height) {
    return;
  }
  let o = (py * u.width + px) * 3u;
  let dLr = dLimg[o];
  let dLg = dLimg[o + 1u];
  let dLb = dLimg[o + 2u];
  let fx = f32(px) + 0.5;
  let fy = f32(py) + 0.5;

  // ── forward replay: collect the visible (clipped) hits front-to-back ──
  var hitIdx: array<u32, MAX_HITS>;
  var hitAlpha: array<f32, MAX_HITS>;
  var hitTb: array<f32, MAX_HITS>;
  var hitClamp: array<u32, MAX_HITS>;
  var nHits: u32 = 0u;
  var T: f32 = 1.0;
  for (var i: u32 = 0u; i < u.count; i = i + 1u) {
    let s = splats[i];
    let dx = fx - s.posx;
    let dy = fy - s.posy;
    let sigma = 0.5 * (s.a * dx * dx + s.c * dy * dy) + s.b * dx * dy;
    if (sigma < 0.0) {
      continue;
    }
    var alpha = s.op * exp(-sigma);
    if (alpha < ALPHA_MIN) {
      continue;
    }
    let clamped = alpha > ALPHA_MAX;
    alpha = min(alpha, ALPHA_MAX);
    if (nHits < MAX_HITS) {
      hitIdx[nHits] = i;
      hitAlpha[nHits] = alpha;
      hitTb[nHits] = T;
      hitClamp[nHits] = select(0u, 1u, clamped);
      nHits = nHits + 1u;
    }
    T = T * (1.0 - alpha);
  }

  // ── back-to-front suffix walk: S_i = sum_{j>i} c_j a_j T_j + T_final*bg ──
  var sr = T * u.bg.x;
  var sg = T * u.bg.y;
  var sb = T * u.bg.z;
  var k: i32 = i32(nHits) - 1;
  loop {
    if (k < 0) {
      break;
    }
    let kk = u32(k);
    let i = hitIdx[kk];
    let al = hitAlpha[kk];
    let Tb = hitTb[kk];
    let s = splats[i];
    let dx = fx - s.posx;
    let dy = fy - s.posy;

    // dC/dcolor_i = T_i * alpha_i  (applied even when alpha was clamped)
    atomicAdd(&grad[i * 9u + 5u], toFixed(dLr * Tb * al));
    atomicAdd(&grad[i * 9u + 6u], toFixed(dLg * Tb * al));
    atomicAdd(&grad[i * 9u + 7u], toFixed(dLb * Tb * al));

    // dC/dalpha_i = T_i*color_i - S_i/(1-alpha_i)
    let inv = 1.0 / (1.0 - al);
    let dCdA = dLr * (Tb * s.r - sr * inv) + dLg * (Tb * s.g - sg * inv) + dLb * (Tb * s.bl - sb * inv);
    // suffix update S_i (ADDITIVE recurrence)
    sr = sr + al * Tb * s.r;
    sg = sg + al * Tb * s.g;
    sb = sb + al * Tb * s.bl;

    if (hitClamp[kk] == 0u) {
      let sigma = 0.5 * (s.a * dx * dx + s.c * dy * dy) + s.b * dx * dy;
      atomicAdd(&grad[i * 9u + 8u], toFixed(dCdA * exp(-sigma))); // dop = dCdA * exp(-sigma)
      let dCdSigma = dCdA * (-al);                                 // dalpha/dsigma = -alpha
      atomicAdd(&grad[i * 9u + 2u], toFixed(dCdSigma * 0.5 * dx * dx)); // da
      atomicAdd(&grad[i * 9u + 4u], toFixed(dCdSigma * 0.5 * dy * dy)); // dc
      atomicAdd(&grad[i * 9u + 3u], toFixed(dCdSigma * dx * dy));       // db
      let dSdx = s.a * dx + s.b * dy;
      let dSdy = s.c * dy + s.b * dx;
      atomicAdd(&grad[i * 9u + 0u], toFixed(dCdSigma * (-dSdx)));       // dposx
      atomicAdd(&grad[i * 9u + 1u], toFixed(dCdSigma * (-dSdy)));       // dposy
    }
    k = k - 1;
  }
}
