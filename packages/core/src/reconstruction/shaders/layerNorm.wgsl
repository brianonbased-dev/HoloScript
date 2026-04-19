// HoloMap LayerNorm kernel (Sprint 2 P0)
// One workgroup handles one row. Two passes over hidden dim:
// 1) mean + variance reduction  2) scale + shift.

struct Params {
  rows: u32,
  dModel: u32,
  eps: f32,
}

@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read> gamma: array<f32>;
@group(0) @binding(2) var<storage, read> beta: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;

var<workgroup> reduceScratch: array<f32, 64>;

fn inputIndex(row: u32, col: u32) -> u32 {
  return row * params.dModel + col;
}

@compute @workgroup_size(64, 1, 1)
fn main(
  @builtin(workgroup_id) workgroupId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>,
) {
  let row = workgroupId.x;
  let lane = localId.x;

  if (row >= params.rows || params.dModel == 0u) {
    return;
  }

  // Pass 1a: sum for mean.
  var sum = 0.0;
  for (var c: u32 = lane; c < params.dModel; c = c + 64u) {
    sum = sum + input[inputIndex(row, c)];
  }
  reduceScratch[lane] = sum;
  workgroupBarrier();

  var stride: u32 = 32u;
  loop {
    if (lane < stride) {
      reduceScratch[lane] = reduceScratch[lane] + reduceScratch[lane + stride];
    }
    workgroupBarrier();
    if (stride == 1u) {
      break;
    }
    stride = stride >> 1u;
  }

  let mean = reduceScratch[0] / f32(params.dModel);

  // Pass 1b: sum of squared deviations for variance.
  var sq = 0.0;
  for (var c: u32 = lane; c < params.dModel; c = c + 64u) {
    let d = input[inputIndex(row, c)] - mean;
    sq = sq + d * d;
  }
  reduceScratch[lane] = sq;
  workgroupBarrier();

  stride = 32u;
  loop {
    if (lane < stride) {
      reduceScratch[lane] = reduceScratch[lane] + reduceScratch[lane + stride];
    }
    workgroupBarrier();
    if (stride == 1u) {
      break;
    }
    stride = stride >> 1u;
  }

  let variance = reduceScratch[0] / f32(params.dModel);
  let invStd = inverseSqrt(variance + params.eps);

  // Pass 2: normalize, scale, shift.
  for (var c: u32 = lane; c < params.dModel; c = c + 64u) {
    let idx = inputIndex(row, c);
    let normalized = (input[idx] - mean) * invStd;
    output[idx] = normalized * gamma[c] + beta[c];
  }
}