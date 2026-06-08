/**
 * tensor-ops — pure dense Float32 tensor math for TensorOpTrait.
 *
 * Real elementwise add and 2D row-major matmul over Float32Array buffers.
 * Separated from the trait so the math is independently testable (the trait
 * is a thin delegator). Replaces the prior echo-stub that emitted operands
 * back without computing (deep-ratchet 2026-05-24, OVERCLAIMED finding).
 */

export interface DenseTensor {
  shape: number[];
  data: Float32Array;
}

function sizeOf(shape: number[]): number {
  return shape.reduce((a, b) => a * b, 1);
}

export function createTensor(shape: number[], data?: ArrayLike<number>): DenseTensor {
  if (
    !Array.isArray(shape) ||
    shape.length === 0 ||
    shape.some((d) => !Number.isInteger(d) || d <= 0)
  ) {
    throw new Error(`tensor-ops: invalid shape ${JSON.stringify(shape)}`);
  }
  const size = sizeOf(shape);
  const buf = new Float32Array(size);
  if (data) {
    const n = Math.min(size, data.length);
    for (let i = 0; i < n; i++) buf[i] = data[i];
  }
  return { shape: shape.slice(), data: buf };
}

export function add(a: DenseTensor, b: DenseTensor): DenseTensor {
  if (a.data.length !== b.data.length) {
    throw new Error(
      `tensor-ops: add shape mismatch ${JSON.stringify(a.shape)} vs ${JSON.stringify(b.shape)}`
    );
  }
  const out = new Float32Array(a.data.length);
  for (let i = 0; i < out.length; i++) out[i] = a.data[i] + b.data[i];
  return { shape: a.shape.slice(), data: out };
}

export function matmul(a: DenseTensor, b: DenseTensor): DenseTensor {
  if (a.shape.length !== 2 || b.shape.length !== 2) {
    throw new Error('tensor-ops: matmul requires 2D tensors');
  }
  const [m, k] = a.shape;
  const [k2, n] = b.shape;
  if (k !== k2) {
    throw new Error(`tensor-ops: matmul inner dim mismatch ${k} vs ${k2}`);
  }
  const out = new Float32Array(m * n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let acc = 0;
      for (let p = 0; p < k; p++) acc += a.data[i * k + p] * b.data[p * n + j];
      out[i * n + j] = acc;
    }
  }
  return { shape: [m, n], data: out };
}
