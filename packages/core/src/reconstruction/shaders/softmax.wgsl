// HoloMap Softmax kernel (Sprint 2 P0)
// Numerically-stable row-wise softmax over last dim (max-subtraction).

struct Params {
  rows: u32,
  cols: u32,
}

@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

var<workgroup> reduceScratch: array<f32, 64>;

fn inputIndex(row: u32, col: u32) -> u32 {
  return row * params.cols + col;
}

@compute @workgroup_size(64, 1, 1)
fn main(
  @builtin(workgroup_id) workgroupId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>,
) {
  let row = workgroupId.x;
  let lane = localId.x;

  if (row >= params.rows || params.cols == 0u) {
    return;
  }

  // Pass 1: row max reduction.
  var localMax = -1e30;
  for (var c: u32 = lane; c < params.cols; c = c + 64u) {
    localMax = max(localMax, input[inputIndex(row, c)]);
  }
  reduceScratch[lane] = localMax;
  workgroupBarrier();

  var stride: u32 = 32u;
  loop {
    if (lane < stride) {
      reduceScratch[lane] = max(reduceScratch[lane], reduceScratch[lane + stride]);
    }
    workgroupBarrier();
    if (stride == 1u) {
      break;
    }
    stride = stride >> 1u;
  }

  let rowMax = reduceScratch[0];

  // Pass 2: exponentiation + denominator reduction.
  var localSum = 0.0;
  for (var c: u32 = lane; c < params.cols; c = c + 64u) {
    let ex = exp(input[inputIndex(row, c)] - rowMax);
    output[inputIndex(row, c)] = ex;
    localSum = localSum + ex;
  }
  reduceScratch[lane] = localSum;
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

  let denom = max(reduceScratch[0], 1e-30);

  // Pass 3: normalize.
  for (var c: u32 = lane; c < params.cols; c = c + 64u) {
    let idx = inputIndex(row, c);
    output[idx] = output[idx] / denom;
  }
}