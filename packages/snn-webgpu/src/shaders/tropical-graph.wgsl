struct TropicalGemmDims {
  m: u32,
  n: u32,
  k: u32,
  _pad: u32,
}

struct TropicalSparseDims {
  rows: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

const INF: f32 = 1e30;

@group(0) @binding(0) var<storage, read> matA: array<f32>;
@group(0) @binding(1) var<storage, read> matB: array<f32>;
@group(0) @binding(2) var<storage, read_write> matC: array<f32>;
@group(0) @binding(3) var<uniform> gemmDims: TropicalGemmDims;

@compute @workgroup_size(16, 16)
fn tropical_min_plus_gemm(@builtin(global_invocation_id) gid: vec3<u32>) {
  let col = gid.x;
  let row = gid.y;

  if (row >= gemmDims.m || col >= gemmDims.n) {
    return;
  }

  var best: f32 = INF;
  for (var kk: u32 = 0u; kk < gemmDims.k; kk = kk + 1u) {
    let a = matA[row * gemmDims.k + kk];
    let b = matB[kk * gemmDims.n + col];
    if (a < INF && b < INF) {
      best = min(best, a + b);
    }
  }

  matC[row * gemmDims.n + col] = best;
}

@group(0) @binding(0) var<storage, read> rowPtr: array<u32>;
@group(0) @binding(1) var<storage, read> colIdx: array<u32>;
@group(0) @binding(2) var<storage, read> values: array<f32>;
@group(0) @binding(3) var<storage, read> distIn: array<f32>;
@group(0) @binding(4) var<storage, read_write> distOut: array<f32>;
@group(0) @binding(5) var<uniform> sparseDims: TropicalSparseDims;

@compute @workgroup_size(256)
fn tropical_spmv(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= sparseDims.rows) {
    return;
  }

  var best = distIn[row];
  let start = rowPtr[row];
  let finish = rowPtr[row + 1u];

  for (var j: u32 = start; j < finish; j = j + 1u) {
    let col = colIdx[j];
    let weight = values[j];
    let base = distIn[col];
    if (base < INF && weight < INF) {
      best = min(best, base + weight);
    }
  }

  distOut[row] = best;
}
