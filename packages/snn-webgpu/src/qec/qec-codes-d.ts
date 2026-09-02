/**
 * qec-codes-d.ts — distance-parameterized rotated surface codes + exact reference decoding.
 *
 * Generalizes the graduated [[9,1,3]] module ({@link ./qec-codes}) to arbitrary odd distance
 * d ≥ 3 without touching it: {@link buildRotatedSurfaceCode} generates the layout, and the
 * validity GATES (CSS commutation, k = 1 by GF(2) rank, logical anticommutation, and exact
 * code distance by weight-bounded enumeration) prove it — the same "candidate, not trusted
 * from memory" discipline as the d3 header. A generated layout that fails a gate throws.
 *
 * Exact maximum-likelihood reference at d5: the d3 module's 2^n lookup sweep is infeasible at
 * n = 25, but weight-ORDERED enumeration is not — {@link buildMinWeightLookup} fills the
 * per-syndrome min-weight table lowest weight first and stops when the whole 2^m syndrome
 * space is covered (d5: all 4096 X-syndromes are hit by weight ≤ 4 supports; the sweep also
 * certifies each entry is a true min-weight coset representative).
 *
 * BP/OSD-0 come from {@link ./qec-codes} unchanged (they are already check-matrix
 * parameterized) — this module only adds the code generator, the gates, the scalable ML
 * reference, and an audit that reports the HONEST d5 numbers: syndrome-validity must be 100%,
 * while ML-coset agreement is MEASURED, not asserted (BP+OSD-0 is not exact at d ≥ 5).
 *
 * @module snn-webgpu/qec/qec-codes-d
 */

import {
  bpOsdDecode,
  priorLLR,
  stabsToMatrix,
  overlapParity,
  xorVec,
  weight,
  DEFAULT_PRIOR,
  type BitVector,
  type CheckMatrix,
} from './qec-codes.js';

/** A distance-parameterized rotated surface code. */
export interface SurfaceCode {
  /** Odd code distance ≥ 3. */
  d: number;
  /** Data qubits: n = d². Qubit index = d·row + col. */
  n: number;
  /** Z-stabilizer supports (detect X errors). (d²−1)/2 of them. */
  zStabs: number[][];
  /** X-stabilizer supports (detect Z errors). (d²−1)/2 of them. */
  xStabs: number[][];
  /** Logical Z support (a column string). */
  zLogical: number[];
  /** Logical X support (a row string). */
  xLogical: number[];
}

/**
 * Generate the rotated surface code of odd distance d.
 *
 * Construction: data qubits on a d×d grid. Faces live on the (d+1)×(d+1) corner grid; face
 * (r, c) touches the ≤4 data qubits {(r−1,c−1), (r−1,c), (r,c−1), (r,c)} that exist. Bulk
 * faces checkerboard between Z and X; boundary faces (weight 2) are kept only where their
 * type's boundary runs — Z-type faces on the top/bottom rows, X-type on the left/right
 * columns — which is what makes the left column a logical-Z string and the top row a
 * logical-X string. The parity choice below is the one the gates accept; it is validated,
 * not assumed.
 */
export function buildRotatedSurfaceCode(d: number): SurfaceCode {
  if (d < 3 || d % 2 === 0) throw new Error(`rotated surface code needs odd d ≥ 3, got ${d}`);
  const n = d * d;
  const q = (r: number, c: number) => d * r + c;
  const zStabs: number[][] = [];
  const xStabs: number[][] = [];

  for (let r = 0; r <= d; r++) {
    for (let c = 0; c <= d; c++) {
      const support: number[] = [];
      for (const [dr, dc] of [
        [-1, -1],
        [-1, 0],
        [0, -1],
        [0, 0],
      ]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < d && cc >= 0 && cc < d) support.push(q(rr, cc));
      }
      if (support.length === 1) continue; // corners carry no stabilizer
      const isZ = (r + c) % 2 === 0; // checkerboard parity — gated below, not trusted
      if (support.length === 2) {
        // boundary faces: Z-type only on top/bottom rows, X-type only on left/right columns
        const horizontal = r === 0 || r === d;
        if (isZ && !horizontal) continue;
        if (!isZ && horizontal) continue;
      }
      (isZ ? zStabs : xStabs).push(support.sort((a, b) => a - b));
    }
  }

  const zLogical = Array.from({ length: d }, (_, r) => q(r, 0)); // left column
  const xLogical = Array.from({ length: d }, (_, c) => q(0, c)); // top row
  return { d, n, zStabs, xStabs, zLogical, xLogical };
}

// ── Validity gates ───────────────────────────────────────────────────────────

/** GF(2) rank of a check matrix. */
export function gf2Rank(H: CheckMatrix): number {
  const rows = H.map((r) => [...r]);
  const m = rows.length;
  const n = rows[0]?.length ?? 0;
  let rank = 0;
  for (let col = 0; col < n && rank < m; col++) {
    let piv = -1;
    for (let r = rank; r < m; r++)
      if (rows[r][col]) {
        piv = r;
        break;
      }
    if (piv === -1) continue;
    [rows[rank], rows[piv]] = [rows[piv], rows[rank]];
    for (let r = 0; r < m; r++)
      if (r !== rank && rows[r][col]) for (let k = 0; k < n; k++) rows[r][k] ^= rows[rank][k];
    rank++;
  }
  return rank;
}

const supportParity = (a: readonly number[], b: readonly number[]): number => {
  const set = new Set(a);
  let p = 0;
  for (const x of b) if (set.has(x)) p ^= 1;
  return p;
};

export interface CodeGateReport {
  stabilizerCounts: { z: number; x: number; expected: number };
  allStabilizersCommute: boolean;
  logicalsCommuteWithStabilizers: boolean;
  logicalsAnticommute: boolean;
  logicalQubits: number; // n − rank(HX) − rank(HZ), must be 1
  distance: number; // exact, by weight-bounded enumeration
}

/**
 * Run every validity gate. Throws unless the code is a genuine [[d², 1, d]] CSS code:
 * counts, commutation, k = 1, logical anticommutation, and distance EXACTLY d.
 */
export function validateSurfaceCode(code: SurfaceCode): CodeGateReport {
  const expected = (code.n - 1) / 2;
  const report: CodeGateReport = {
    stabilizerCounts: { z: code.zStabs.length, x: code.xStabs.length, expected },
    allStabilizersCommute: code.zStabs.every((z) =>
      code.xStabs.every((x) => supportParity(z, x) === 0)
    ),
    logicalsCommuteWithStabilizers:
      code.xStabs.every((x) => supportParity(code.zLogical, x) === 0) &&
      code.zStabs.every((z) => supportParity(code.xLogical, z) === 0),
    logicalsAnticommute: supportParity(code.zLogical, code.xLogical) === 1,
    logicalQubits:
      code.n - gf2Rank(stabsToMatrix(code.zStabs, code.n)) - gf2Rank(stabsToMatrix(code.xStabs, code.n)),
    distance: codeDistanceBounded(code, code.d + 1),
  };
  const ok =
    report.stabilizerCounts.z === expected &&
    report.stabilizerCounts.x === expected &&
    report.allStabilizersCommute &&
    report.logicalsCommuteWithStabilizers &&
    report.logicalsAnticommute &&
    report.logicalQubits === 1 &&
    report.distance === code.d;
  if (!ok) {
    throw new Error(`generated d=${code.d} layout failed validity gates: ${JSON.stringify(report)}`);
  }
  return report;
}

/** Enumerate supports of exactly weight w over n qubits (combinations, ascending). */
function* combinations(n: number, w: number): Generator<number[]> {
  const idx = Array.from({ length: w }, (_, i) => i);
  while (true) {
    yield [...idx];
    let i = w - 1;
    while (i >= 0 && idx[i] === n - w + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < w; j++) idx[j] = idx[j - 1] + 1;
  }
}

/**
 * Exact code distance via weight-bounded search: the minimum weight of a support that is
 * undetectable (trivial syndrome) yet logical (anticommutes with the opposite logical),
 * checked for X-type and Z-type errors separately. `wMax` must exceed the true distance for
 * the answer to be exact; passing d+1 proves "distance is exactly d" or throws.
 */
export function codeDistanceBounded(code: SurfaceCode, wMax: number): number {
  const trials: Array<{ stabs: number[][]; logical: readonly number[] }> = [
    { stabs: code.zStabs, logical: code.zLogical }, // X errors: trivial Z-syndrome + hits Z_L
    { stabs: code.xStabs, logical: code.xLogical }, // Z errors: trivial X-syndrome + hits X_L
  ];
  for (let w = 1; w <= wMax; w++) {
    for (const { stabs, logical } of trials) {
      const logicalSet = new Set(logical);
      for (const support of combinations(code.n, w)) {
        let logicalPar = 0;
        for (const x of support) if (logicalSet.has(x)) logicalPar ^= 1;
        if (logicalPar === 0) continue;
        let clean = true;
        for (const s of stabs) {
          if (supportParity(s, support) === 1) {
            clean = false;
            break;
          }
        }
        if (clean) return w;
      }
    }
  }
  throw new Error(`no logical operator of weight ≤ ${wMax} found — raise wMax`);
}

// ── Exact ML reference by weight-ordered sweep ───────────────────────────────

export interface MinWeightLookup {
  /** syndrome key ('0110…', one char per check) → min-weight coset representative. */
  table: Map<string, { correction: BitVector; w: number }>;
  /** Highest weight that had to be enumerated to cover all syndromes. */
  maxWeightUsed: number;
}

/**
 * Exact per-syndrome min-weight decoder table, built lowest weight first. Because supports
 * are visited in weight order, the FIRST support hitting a syndrome is a true min-weight
 * representative — no 2^n sweep needed. Covers all 2^m syndromes or throws at `maxWeight`.
 */
export function buildMinWeightLookup(
  stabs: readonly number[][],
  n: number,
  maxWeight: number = 8
): MinWeightLookup {
  const m = stabs.length;
  const total = 1 << m;
  const table = new Map<string, { correction: BitVector; w: number }>();
  const zero = new Array(n).fill(0);
  table.set(stabs.map(() => 0).join(''), { correction: zero, w: 0 });
  for (let w = 1; w <= maxWeight; w++) {
    for (const support of combinations(n, w)) {
      const err = new Array(n).fill(0);
      for (const q of support) err[q] = 1;
      const key = stabs.map((s) => overlapParity(err, s)).join('');
      if (!table.has(key)) table.set(key, { correction: err, w });
      if (table.size === total) return { table, maxWeightUsed: w };
    }
    if (table.size === total) return { table, maxWeightUsed: w };
  }
  throw new Error(`syndrome space not covered by weight ≤ ${maxWeight}: ${table.size}/${total}`);
}

// ── Honest exhaustive audit: BP+OSD-0 vs exact ML over the whole syndrome space

export interface SyndromeAudit {
  syndromes: number;
  /** BP alone satisfied the syndrome. */
  bpConverged: number;
  /** Final correction reproduces the syndrome — must equal `syndromes`. */
  syndromeValid: number;
  /** Correction lands in the same logical coset as the exact-ML representative. */
  mlCosetAgreement: number;
  /** Correction weight equals the ML minimum (stronger than coset agreement). */
  minWeightAgreement: number;
}

/**
 * Sweep the ENTIRE syndrome space of one error type: decode with BP+OSD-0, compare to the
 * exact min-weight table. d3: 16 syndromes; d5: 4096. Validity is a hard requirement of the
 * OSD-0 guard; ML agreement is reported as measured.
 */
export function auditSyndromeSpace(
  code: SurfaceCode,
  which: 'x-errors' | 'z-errors',
  p: number = DEFAULT_PRIOR
): SyndromeAudit {
  const stabs = which === 'x-errors' ? code.zStabs : code.xStabs;
  const logical = which === 'x-errors' ? code.zLogical : code.xLogical;
  const H = stabsToMatrix(stabs, code.n);
  const { table } = buildMinWeightLookup(stabs, code.n);
  const m = stabs.length;
  const audit: SyndromeAudit = {
    syndromes: 1 << m,
    bpConverged: 0,
    syndromeValid: 0,
    mlCosetAgreement: 0,
    minWeightAgreement: 0,
  };
  for (let sm = 0; sm < 1 << m; sm++) {
    const s = Array.from({ length: m }, (_, a) => (sm >> a) & 1);
    const key = s.join('');
    const ml = table.get(key)!;
    const { correction, method } = bpOsdDecode(H, s, p);
    if (method === 'bp') audit.bpConverged++;
    const valid = stabs.every((st, a) => overlapParity(correction, st) === s[a]);
    if (valid) audit.syndromeValid++;
    const diff = xorVec(correction, ml.correction);
    // same logical coset ⇔ diff is a stabilizer product ⇔ trivial syndrome (valid ⇒ yes) AND
    // trivial logical overlap
    if (valid && overlapParity(diff, logical) === 0) audit.mlCosetAgreement++;
    if (valid && weight(correction) === ml.w) audit.minWeightAgreement++;
  }
  return audit;
}

/** Parity of `support` overlap of a ⊕ b — 0 ⇔ a and b are in the same logical coset (given both valid). */
export function xorSupportParity(
  a: BitVector,
  b: BitVector,
  support: readonly number[]
): number {
  return overlapParity(xorVec(a, b), support);
}

export { priorLLR, DEFAULT_PRIOR };
