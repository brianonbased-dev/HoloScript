export interface FusedAttentionInput {
  q: Float32Array;
  k: Float32Array;
  v: Float32Array;
  qRows: number;
  kRows: number;
  dModel: number;
  vCols: number;
}

export interface FusedAttentionBackend {
  name: 'webgpu' | 'cpu';
  compute(input: FusedAttentionInput): Promise<Float32Array>;
}

const WGSL_FUSED_ATTENTION_SOURCE = `
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
@compute @workgroup_size(1, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  // Full implementation mirrored in shaders/fusedAttention.wgsl
  // This inline source exists so runtime can compile without a bundler WGSL loader.
}
`;

function cpuFusedAttention(input: FusedAttentionInput): Float32Array {
  const { q, k, v, qRows, kRows, dModel, vCols } = input;
  const out = new Float32Array(qRows * vCols);
  const scale = 1 / Math.sqrt(Math.max(dModel, 1));

  for (let qr = 0; qr < qRows; qr += 1) {
    let maxScore = -Number.MAX_VALUE;
    const scores = new Float32Array(kRows);

    for (let kr = 0; kr < kRows; kr += 1) {
      let dot = 0;
      for (let d = 0; d < dModel; d += 1) {
        dot += q[qr * dModel + d] * k[kr * dModel + d];
      }
      const s = dot * scale;
      scores[kr] = s;
      if (s > maxScore) maxScore = s;
    }

    let denom = 0;
    for (let kr = 0; kr < kRows; kr += 1) {
      const ex = Math.exp(scores[kr] - maxScore);
      scores[kr] = ex;
      denom += ex;
    }

    for (let c = 0; c < vCols; c += 1) {
      let acc = 0;
      for (let kr = 0; kr < kRows; kr += 1) {
        const w = scores[kr] / Math.max(denom, 1e-9);
        acc += w * v[kr * vCols + c];
      }
      out[qr * vCols + c] = acc;
    }
  }

  return out;
}

class CpuFusedAttentionBackend implements FusedAttentionBackend {
  public readonly name = 'cpu' as const;

  async compute(input: FusedAttentionInput): Promise<Float32Array> {
    return cpuFusedAttention(input);
  }
}

class WebGpuFusedAttentionBackend implements FusedAttentionBackend {
  public readonly name = 'webgpu' as const;

  async compute(input: FusedAttentionInput): Promise<Float32Array> {
    // Sprint slice: compile-ready surface + deterministic CPU fallback.
    // Full GPU dispatch will land once WGSL op gaps are fully closed.
    void WGSL_FUSED_ATTENTION_SOURCE;
    return cpuFusedAttention(input);
  }
}

export async function createFusedAttentionBackend(): Promise<FusedAttentionBackend> {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    return new WebGpuFusedAttentionBackend();
  }
  return new CpuFusedAttentionBackend();
}
