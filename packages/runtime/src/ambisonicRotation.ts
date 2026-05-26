/**
 * @holoscript/runtime - Ambisonic soundfield rotation
 *
 * Real spherical-harmonic rotation matrices for head-tracked ambisonic audio.
 * When a listener's head rotates, the encoded soundfield must be counter-rotated
 * so that sources stay world-locked. For order-N ambisonics this means rotating
 * the (N+1)^2 channels by the block-diagonal real-SH rotation operator.
 *
 * The order>=2 blocks are built by the Ivanic–Ruedenberg recursion
 * (J. Phys. Chem. 1996, 100, 6342; corrected 1998, 102, 9099), which derives the
 * real spherical-harmonic rotation directly from the 3x3 Cartesian rotation and
 * the previous-order block. Channel layout is ACN / SN3D (AmbiX), i.e. real SH
 * ordered by degree l then m = -l..l, with l=1 mapping to (y, z, x).
 */

/** Quaternion in [x, y, z, w] order (matches AmbisonicsTrait rotation state). */
export type Quaternion = [number, number, number, number];

/** A square numeric matrix (row-major). */
export type Matrix = number[][];

/**
 * Convert a quaternion [x,y,z,w] to a 3x3 rotation matrix (row-major, axes x=0,y=1,z=2).
 * The quaternion is normalized first; a zero quaternion falls back to identity.
 */
export function quaternionToMatrix3(q: Quaternion): Matrix {
  let [x, y, z, w] = q;
  const n = Math.hypot(x, y, z, w);
  if (n === 0) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }
  x /= n;
  y /= n;
  z /= n;
  w /= n;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return [
    [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
    [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
    [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)],
  ];
}

// ---------------------------------------------------------------------------
// Ivanic–Ruedenberg recursion internals
// ---------------------------------------------------------------------------

/**
 * P helper for the recursion. `i` in {-1,0,1} indexes the l=1 block columns;
 * the previous-order block `Rprev` (degree l-1) is read with a (l-1) offset.
 */
function P(
  i: number,
  l: number,
  a: number,
  b: number,
  R1: Matrix,
  Rprev: Matrix
): number {
  const ri1 = R1[i + 1][2]; // column m=+1
  const rim1 = R1[i + 1][0]; // column m=-1
  const ri0 = R1[i + 1][1]; // column m=0
  const off = l - 1;
  if (b === -l) {
    return ri1 * Rprev[a + off][-l + 1 + off] + rim1 * Rprev[a + off][l - 1 + off];
  }
  if (b === l) {
    return ri1 * Rprev[a + off][l - 1 + off] - rim1 * Rprev[a + off][-l + 1 + off];
  }
  return ri0 * Rprev[a + off][b + off];
}

function U(l: number, m: number, n: number, R1: Matrix, Rprev: Matrix): number {
  return P(0, l, m, n, R1, Rprev);
}

function V(l: number, m: number, n: number, R1: Matrix, Rprev: Matrix): number {
  if (m === 0) {
    return P(1, l, 1, n, R1, Rprev) + P(-1, l, -1, n, R1, Rprev);
  }
  if (m > 0) {
    const d = m === 1 ? 1 : 0;
    return (
      P(1, l, m - 1, n, R1, Rprev) * Math.sqrt(1 + d) -
      P(-1, l, -m + 1, n, R1, Rprev) * (1 - d)
    );
  }
  const d = m === -1 ? 1 : 0;
  return (
    P(1, l, m + 1, n, R1, Rprev) * (1 - d) +
    P(-1, l, -m - 1, n, R1, Rprev) * Math.sqrt(1 + d)
  );
}

function W(l: number, m: number, n: number, R1: Matrix, Rprev: Matrix): number {
  if (m > 0) {
    return P(1, l, m + 1, n, R1, Rprev) + P(-1, l, -m - 1, n, R1, Rprev);
  }
  // m < 0 (m === 0 has w-coefficient 0 and is never reached)
  return P(1, l, m - 1, n, R1, Rprev) - P(-1, l, -m + 1, n, R1, Rprev);
}

/**
 * Build the per-degree real-SH rotation blocks for degrees 0..order from a 3x3
 * Cartesian rotation matrix. Returns an array `blocks` where `blocks[l]` is the
 * (2l+1)x(2l+1) rotation for degree l (ACN/SN3D channel layout).
 */
export function realSHRotationBlocks(R3: Matrix, order: number): Matrix[] {
  const blocks: Matrix[] = [];
  blocks[0] = [[1]];
  if (order >= 1) {
    // Degree-1 real SH ordered m=-1,0,+1 maps to Cartesian (y, z, x).
    blocks[1] = [
      [R3[1][1], R3[1][2], R3[1][0]],
      [R3[2][1], R3[2][2], R3[2][0]],
      [R3[0][1], R3[0][2], R3[0][0]],
    ];
  }
  for (let l = 2; l <= order; l++) {
    const size = 2 * l + 1;
    const Rl: Matrix = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    const R1 = blocks[1];
    const Rprev = blocks[l - 1];
    for (let m = -l; m <= l; m++) {
      for (let n = -l; n <= l; n++) {
        const d = m === 0 ? 1 : 0;
        const denom = Math.abs(n) === l ? 2 * l * (2 * l - 1) : (l + n) * (l - n);
        const u = Math.sqrt(((l + m) * (l - m)) / denom);
        const v =
          0.5 *
          Math.sqrt(((1 + d) * (l + Math.abs(m) - 1) * (l + Math.abs(m))) / denom) *
          (1 - 2 * d);
        const w =
          -0.5 *
          Math.sqrt(((l - Math.abs(m) - 1) * (l - Math.abs(m))) / denom) *
          (1 - d);
        let val = 0;
        if (u !== 0) val += u * U(l, m, n, R1, Rprev);
        if (v !== 0) val += v * V(l, m, n, R1, Rprev);
        if (w !== 0) val += w * W(l, m, n, R1, Rprev);
        Rl[m + l][n + l] = val;
      }
    }
    blocks[l] = Rl;
  }
  return blocks;
}

/**
 * Assemble the full block-diagonal channel rotation matrix of size
 * (order+1)^2 x (order+1)^2 from per-degree blocks.
 */
export function blocksToChannelMatrix(blocks: Matrix[], order: number): Matrix {
  const channels = (order + 1) * (order + 1);
  const M: Matrix = Array.from({ length: channels }, () =>
    new Array<number>(channels).fill(0)
  );
  let base = 0;
  for (let l = 0; l <= order; l++) {
    const block = blocks[l];
    const size = 2 * l + 1;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        M[base + i][base + j] = block[i][j];
      }
    }
    base += size;
  }
  return M;
}

/**
 * Convenience: quaternion -> full ambisonic channel rotation matrix for `order`.
 * The soundfield is counter-rotated relative to head motion, so the inverse
 * (transpose) of the head rotation is used.
 */
export function ambisonicRotationMatrix(q: Quaternion, order: number): Matrix {
  const R = quaternionToMatrix3(q);
  // Counter-rotate the soundfield: inverse of a rotation matrix is its transpose.
  const Rinv: Matrix = [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]],
  ];
  const blocks = realSHRotationBlocks(Rinv, order);
  return blocksToChannelMatrix(blocks, order);
}

/** Number of ambisonic channels for a given order: (order+1)^2. */
export function channelCount(order: number): number {
  return (order + 1) * (order + 1);
}
