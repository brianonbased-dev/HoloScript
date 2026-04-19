// Rotary Positional Encoding (RoPE)
//
// Applies in-place sin/cos rotation to Q or K tensors.
//
// Layout: input/output shape is [seqLen, numHeads, headDim]
// Flat index: token * numHeads * headDim + head * headDim + dim
//
// Algorithm:
//   For each (dim_pair = d/2) in [0, headDim/2):
//     theta = pos * base^(-2*dim_pair / headDim)
//     [x0, x1] = [x[2*dim_pair], x[2*dim_pair+1]]
//     x[2*dim_pair]   = x0 * cos(theta) - x1 * sin(theta)
//     x[2*dim_pair+1] = x0 * sin(theta) + x1 * cos(theta)
//
// Dispatch: one workgroup per (token, head) pair.
//   grid = (seqLen * numHeads, 1, 1)   workgroup_size(32, 1, 1)
//   Each lane processes headDim/2 / 32 pairs (grid-stride over pairs).

struct Params {
  seqLen:   u32,   // T
  numHeads: u32,   // H
  headDim:  u32,   // D  (must be even)
  base:     f32,   // RoPE base, typically 10000.0
  posOffset: u32,  // offset added to token index (for KV-cache continuation)
}

@group(0) @binding(0) var<storage, read>       qIn:  array<f32>;
@group(0) @binding(1) var<storage, read_write> qOut: array<f32>;
@group(0) @binding(2) var<uniform>             p:    Params;

fn flatIdx(token: u32, head: u32, dim: u32) -> u32 {
  return token * p.numHeads * p.headDim + head * p.headDim + dim;
}

@compute @workgroup_size(32, 1, 1)
fn main(
  @builtin(workgroup_id)       wgid: vec3<u32>,
  @builtin(local_invocation_id) lid:  vec3<u32>,
) {
  // One workgroup = one (token, head) pair.
  let wg   = wgid.x;                        // flattened (token, head)
  let token = wg / p.numHeads;
  let head  = wg % p.numHeads;

  if (token >= p.seqLen) { return; }

  let pairs  = p.headDim / 2u;              // number of rotation pairs
  let pos    = token + p.posOffset;

  var pairIdx = lid.x;
  while (pairIdx < pairs) {
    let d = pairIdx;
    // theta = pos * base^(-2d / headDim)
    let exponent = -2.0 * f32(d) / f32(p.headDim);
    let theta    = f32(pos) * pow(p.base, exponent);

    let c = cos(theta);
    let s = sin(theta);

    let i0 = flatIdx(token, head, 2u * d);
    let i1 = flatIdx(token, head, 2u * d + 1u);

    let x0 = qIn[i0];
    let x1 = qIn[i1];

    qOut[i0] = x0 * c - x1 * s;
    qOut[i1] = x0 * s + x1 * c;

    pairIdx = pairIdx + 32u;
  }
}
