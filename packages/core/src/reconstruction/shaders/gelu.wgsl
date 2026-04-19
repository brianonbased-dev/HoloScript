// HoloMap GELU kernel (Sprint 2 P0)
// Element-wise GELU using tanh approximation.

struct Params {
  elements: u32,
}

@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

fn gelu(x: f32) -> f32 {
  let k0 = 0.7978845608; // sqrt(2/pi)
  let k1 = 0.044715;
  let x3 = x * x * x;
  let inner = k0 * (x + k1 * x3);
  return 0.5 * x * (1.0 + tanh(inner));
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  var idx = gid.x;
  let stride = 64u;

  while (idx < params.elements) {
    output[idx] = gelu(input[idx]);
    idx = idx + stride;
  }
}