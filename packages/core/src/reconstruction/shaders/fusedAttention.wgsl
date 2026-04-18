// HoloMap fused attention kernel (Sprint 2 baseline)
// Computes O = softmax(QK^T / sqrt(d))V for one batch/head block.

struct Params {
  qRows: u32,
  kRows: u32,
  dModel: u32,
  vCols: u32,
  scale: f32,
}

@group(0) @binding(0) var<storage, read> q: array<f32>;
@group(0) @binding(1) var<storage, read> k: array<f32>;
@group(0) @binding(2) var<storage, read> v: array<f32>;
@group(0) @binding(3) var<storage, read_write> out: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;

fn qIndex(row: u32, col: u32) -> u32 {
  return row * params.dModel + col;
}

fn kIndex(row: u32, col: u32) -> u32 {
  return row * params.dModel + col;
}

fn vIndex(row: u32, col: u32) -> u32 {
  return row * params.vCols + col;
}

fn oIndex(row: u32, col: u32) -> u32 {
  return row * params.vCols + col;
}

@compute @workgroup_size(1, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let qRow = gid.x;
  if (qRow >= params.qRows) {
    return;
  }

  var maxScore = -1e30;
  for (var kRow: u32 = 0u; kRow < params.kRows; kRow = kRow + 1u) {
    var dot = 0.0;
    for (var d: u32 = 0u; d < params.dModel; d = d + 1u) {
      dot = dot + q[qIndex(qRow, d)] * k[kIndex(kRow, d)];
    }
    let score = dot * params.scale;
    if (score > maxScore) {
      maxScore = score;
    }
  }

  var denom = 0.0;
  for (var kRow: u32 = 0u; kRow < params.kRows; kRow = kRow + 1u) {
    var dot = 0.0;
    for (var d: u32 = 0u; d < params.dModel; d = d + 1u) {
      dot = dot + q[qIndex(qRow, d)] * k[kIndex(kRow, d)];
    }
    denom = denom + exp(dot * params.scale - maxScore);
  }

  for (var c: u32 = 0u; c < params.vCols; c = c + 1u) {
    var acc = 0.0;
    for (var kRow: u32 = 0u; kRow < params.kRows; kRow = kRow + 1u) {
      var dot = 0.0;
      for (var d: u32 = 0u; d < params.dModel; d = d + 1u) {
        dot = dot + q[qIndex(qRow, d)] * k[kIndex(kRow, d)];
      }
      let w = exp(dot * params.scale - maxScore) / max(denom, 1e-9);
      acc = acc + w * v[vIndex(kRow, c)];
    }
    out[oIndex(qRow, c)] = acc;
  }
}
