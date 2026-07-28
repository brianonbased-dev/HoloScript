/**
 * qec-codes.ts — the [[9,1,3]] rotated surface code + its CPU reference decoders.
 *
 * This is the graduated, typed core of the QEC decoder research probe
 * (research/qec-decoder-probe/{surface-code-d3-decoder,bp-decoder}.mjs). It defines the
 * distance-3 rotated surface code Google Willow/Sycamore run, an EXACT maximum-likelihood
 * (min-weight lookup) decoder, and the message-passing decoder that actually maps onto a
 * spiking/GPU substrate: normalized min-sum belief propagation + an OSD-0 validity guard.
 *
 * The exact lookup is the ground truth the BP decoder — and the GPU port in
 * {@link ./qec-decoder} — are validated against (coset-equivalence over the whole syndrome
 * domain). Nothing here touches the GPU; it is pure, deterministic, and unit-testable in CI
 * without a device.
 *
 * ── Provenance honesty (kept from the probe) ─────────────────────────────────
 * The stabilizer layout is a CANDIDATE, not trusted from memory. It is a valid [[9,1,3]]
 * surface code iff the commutation + distance gates hold (see the tests): every X-stabilizer
 * commutes with every Z-stabilizer, the logicals commute with all stabilizers and anticommute
 * with each other, and the minimum-weight undetectable logical operator has weight exactly 3.
 *
 * @module snn-webgpu/qec/qec-codes
 */

/** A GF(2) support vector over the 9 data qubits (entries are 0 or 1). */
export type BitVector = number[];
/** A parity-check matrix (rows = checks, cols = qubits). */
export type CheckMatrix = number[][];

// ── The [[9,1,3]] rotated surface code ───────────────────────────────────────
// 9 data qubits on a 3x3 grid, index = 3*row + col:
//     q0 q1 q2
//     q3 q4 q5
//     q6 q7 q8
// Z-stabilizers (weight-4 bulk plaquettes + weight-2 boundary) detect X errors.
// X-stabilizers (weight-4 + weight-2 boundary) detect Z errors.
export const N = 9;
export const ZSTAB: readonly number[][] = [
  [0, 1, 3, 4], // top-left plaquette
  [4, 5, 7, 8], // bottom-right plaquette
  [1, 2], // top boundary
  [6, 7], // bottom boundary
];
export const XSTAB: readonly number[][] = [
  [0, 3], // left boundary
  [1, 2, 4, 5], // upper-right plaquette
  [3, 4, 6, 7], // lower-left plaquette
  [5, 8], // right boundary
];
/** Logical operators: a vertical Z string (left column) and a horizontal X string (top row). */
export const ZL: readonly number[] = [0, 3, 6];
export const XL: readonly number[] = [0, 1, 2];

// ── Pauli bookkeeping (errors are 9-bit support vectors) ─────────────────────
const vec = (): BitVector => new Array(N).fill(0);
export const weight = (v: BitVector): number => v.reduce((a, b) => a + b, 0);
export const xorVec = (a: BitVector, b: BitVector): BitVector => a.map((x, i) => x ^ b[i]);
/** Parity of the overlap of a support vector with a stabilizer/logical support list. */
export const overlapParity = (v: BitVector, support: readonly number[]): number =>
  support.reduce((acc, q) => acc ^ v[q], 0);

/** X-error syndrome: which Z-stabilizers fire (Z-stabs detect X errors). */
export function syndromeX(eX: BitVector): number[] {
  return ZSTAB.map((s) => overlapParity(eX, s));
}
/** Z-error syndrome: which X-stabilizers fire (X-stabs detect Z errors). */
export function syndromeZ(eZ: BitVector): number[] {
  return XSTAB.map((s) => overlapParity(eZ, s));
}

/** One min-weight coset representative for a syndrome. */
export interface LookupEntry {
  correction: BitVector;
  w: number;
}

/** Build the optimal (min-weight per syndrome) lookup decoder for one error type. */
function buildLookup(stabs: readonly number[][]): Map<string, LookupEntry> {
  const table = new Map<string, LookupEntry>();
  for (let m = 0; m < 1 << N; m++) {
    const err = vec();
    for (let q = 0; q < N; q++) err[q] = (m >> q) & 1;
    const s = stabs.map((st) => overlapParity(err, st)).join('');
    const w = weight(err);
    const prev = table.get(s);
    if (!prev || w < prev.w) table.set(s, { correction: err.slice(), w });
  }
  return table;
}
export const LOOKUP_X = buildLookup(ZSTAB); // decode X errors from Z-syndrome
export const LOOKUP_Z = buildLookup(XSTAB); // decode Z errors from X-syndrome

export function decodeX(eX: BitVector): BitVector {
  return LOOKUP_X.get(syndromeX(eX).join(''))!.correction;
}
export function decodeZ(eZ: BitVector): BitVector {
  return LOOKUP_Z.get(syndromeZ(eZ).join(''))!.correction;
}

/** A residual X-error (trivial X-syndrome) is a LOGICAL X iff it anticommutes with Z_L. */
export function isLogicalX(residualX: BitVector): boolean {
  return (overlapParity(residualX, ZL) & 1) === 1;
}
/** A residual Z-error (trivial Z-syndrome) is a LOGICAL Z iff it anticommutes with X_L. */
export function isLogicalZ(residualZ: BitVector): boolean {
  return (overlapParity(residualZ, XL) & 1) === 1;
}

/** Decode one (eX, eZ) error pair with the exact lookup; true iff it caused a logical failure. */
export function decodeShot(eX: BitVector, eZ: BitVector): boolean {
  const resX = xorVec(eX, decodeX(eX));
  const resZ = xorVec(eZ, decodeZ(eZ));
  return isLogicalX(resX) || isLogicalZ(resZ);
}

/** Code distance: min weight of an UNDETECTABLE logical operator (should be exactly 3). */
export function codeDistance(): number {
  let d = Infinity;
  for (let m = 1; m < 1 << N; m++) {
    const e = vec();
    for (let q = 0; q < N; q++) e[q] = (m >> q) & 1;
    if (syndromeX(e).every((b) => b === 0) && isLogicalX(e)) d = Math.min(d, weight(e));
    if (syndromeZ(e).every((b) => b === 0) && isLogicalZ(e)) d = Math.min(d, weight(e));
  }
  return d;
}

// ── Parity-check matrices + belief propagation ───────────────────────────────
export function stabsToMatrix(stabs: readonly number[][], n: number = N): CheckMatrix {
  return stabs.map((s) => {
    const row = new Array(n).fill(0);
    for (const q of s) row[q] = 1;
    return row;
  });
}
export const HX: CheckMatrix = stabsToMatrix(ZSTAB); // Z-stabilizers detect X errors
export const HZ: CheckMatrix = stabsToMatrix(XSTAB); // X-stabilizers detect Z errors

/** Channel prior LLR for a depolarizing rate p: per-qubit X (or Z) component flips w.p. 2p/3. */
export function priorLLR(p: number): number {
  const pf = Math.min(Math.max((2 * p) / 3, 1e-9), 0.5 - 1e-9); // clamp away from 0 and 0.5
  return Math.log((1 - pf) / pf);
}

/** Tuning knobs for the normalized min-sum message passing. Defaults match the probe + WGSL. */
export interface BpOptions {
  maxIter?: number;
  alpha?: number;
  gamma?: number;
}

export interface BpResult {
  e: BitVector;
  converged: boolean;
  iters: number;
  posterior: number[];
}

/**
 * Normalized min-sum belief propagation (with damping). Decodes the error consistent with
 * syndrome `s` under a uniform prior LLR `lambda`. This is the exact algorithm the GPU shader
 * in {@link ./qec-decoder} runs, one thread per syndrome — the CPU reference for that port.
 */
export function bpMinSum(
  H: CheckMatrix,
  s: number[],
  lambda: number,
  { maxIter = 30, alpha = 0.8125, gamma = 0.2 }: BpOptions = {}
): BpResult {
  const m = H.length;
  const n = H[0].length;
  const checkVars = H.map((row) => row.map((h, i) => (h ? i : -1)).filter((i) => i >= 0));
  const varChecks = Array.from({ length: n }, (_, i) =>
    H.map((row, a) => (row[i] ? a : -1)).filter((a) => a >= 0)
  );
  const v2c: Record<number, number>[] = Array.from({ length: n }, () => ({}));
  const c2v: Record<number, number>[] = Array.from({ length: m }, () => ({}));
  for (let i = 0; i < n; i++) for (const a of varChecks[i]) v2c[i][a] = lambda;

  const e = new Array(n).fill(0);
  const posterior = new Array(n).fill(lambda);
  let converged = false;
  let iters = 0;
  for (let it = 1; it <= maxIter; it++) {
    iters = it;
    // check-node update (syndrome-signed normalized min-sum)
    for (let a = 0; a < m; a++) {
      const vars = checkVars[a];
      for (const i of vars) {
        let signProd = 1;
        let minMag = Infinity;
        for (const j of vars) {
          if (j === i) continue;
          const msg = v2c[j][a];
          signProd *= msg < 0 ? -1 : 1;
          minMag = Math.min(minMag, Math.abs(msg));
        }
        if (!isFinite(minMag)) minMag = 0; // degree-1 check (none here, but safe)
        c2v[a][i] = alpha * (s[a] ? -1 : 1) * signProd * minMag;
      }
    }
    // variable-node update + posterior + hard decision (with damping)
    for (let i = 0; i < n; i++) {
      let total = lambda;
      for (const a of varChecks[i]) total += c2v[a][i];
      posterior[i] = total;
      for (const a of varChecks[i]) {
        const newMsg = total - c2v[a][i];
        v2c[i][a] = (1 - gamma) * newMsg + gamma * v2c[i][a]; // damping
      }
      e[i] = total < 0 ? 1 : 0;
    }
    // early stop when H.e == s
    let ok = true;
    for (let a = 0; a < m; a++) {
      let par = 0;
      for (const i of checkVars[a]) par ^= e[i];
      if (par !== s[a]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      converged = true;
      break;
    }
  }
  return { e, converged, iters, posterior };
}

/**
 * OSD-0 validity guard: when BP fails to satisfy the syndrome, force a syndrome-valid
 * correction — keep the most-reliable hard decisions fixed (information set), solve the
 * least-reliable independent columns (parity set) to match the residual syndrome over GF(2).
 */
export function osd0(
  H: CheckMatrix,
  s: number[],
  reliability: number[],
  hard: BitVector
): BitVector {
  const m = H.length;
  const n = H[0].length;
  const asc = [...Array(n).keys()].sort((x, y) => reliability[x] - reliability[y]); // least reliable first
  const reduced: { vec: number[]; pivot: number }[] = [];
  const parity: number[] = [];
  for (const c of asc) {
    let vv = H.map((row) => row[c]);
    for (const b of reduced) if (vv[b.pivot]) vv = vv.map((x, k) => x ^ b.vec[k]);
    const piv = vv.findIndex((x) => x === 1);
    if (piv !== -1) {
      reduced.push({ vec: vv, pivot: piv });
      parity.push(c);
      if (parity.length === m) break;
    }
  }
  const paritySet = new Set(parity);
  const e = new Array(n).fill(0);
  for (let c = 0; c < n; c++) if (!paritySet.has(c)) e[c] = hard[c];
  const sPrime = H.map((row, a) => {
    let par = s[a];
    for (let c = 0; c < n; c++) if (!paritySet.has(c)) par ^= row[c] & e[c];
    return par;
  });
  // solve H_parity . x = sPrime (m x m over GF(2)), columns in `parity` order
  const A = H.map((row, a) => parity.map((c) => row[c]).concat([sPrime[a]]));
  let rp = 0;
  for (let col = 0; col < m && rp < m; col++) {
    let piv = -1;
    for (let r = rp; r < m; r++)
      if (A[r][col]) {
        piv = r;
        break;
      }
    if (piv === -1) continue;
    [A[rp], A[piv]] = [A[piv], A[rp]];
    for (let r = 0; r < m; r++)
      if (r !== rp && A[r][col]) for (let k = col; k <= m; k++) A[r][k] ^= A[rp][k];
    rp++;
  }
  const x = new Array(m).fill(0);
  for (let r = 0; r < m; r++) {
    let pc = -1;
    for (let c = 0; c < m; c++)
      if (A[r][c]) {
        pc = c;
        break;
      }
    if (pc !== -1) x[pc] = A[r][m];
  }
  for (let k = 0; k < m; k++) e[parity[k]] = x[k];
  return e;
}

export interface DecodeResult {
  correction: BitVector;
  method: 'bp' | 'osd0';
  iters: number;
}

/** The full CPU decoder: BP, with OSD-0 fallback when BP does not satisfy the syndrome. */
export function bpOsdDecode(
  H: CheckMatrix,
  s: number[],
  p: number,
  opts: BpOptions = {}
): DecodeResult {
  const lambda = priorLLR(p);
  const { e, converged, iters, posterior } = bpMinSum(H, s, lambda, opts);
  if (converged) return { correction: e, method: 'bp', iters };
  const reliability = posterior.map(Math.abs);
  const hard = posterior.map((v) => (v < 0 ? 1 : 0));
  return { correction: osd0(H, s, reliability, hard), method: 'osd0', iters };
}

/** Default decoding prior used when a specific physical error rate is not supplied. */
export const DEFAULT_PRIOR = 0.05;

export function decodeXBP(eX: BitVector, p: number = DEFAULT_PRIOR, opts?: BpOptions): BitVector {
  return bpOsdDecode(HX, syndromeX(eX), p, opts).correction;
}
export function decodeZBP(eZ: BitVector, p: number = DEFAULT_PRIOR, opts?: BpOptions): BitVector {
  return bpOsdDecode(HZ, syndromeZ(eZ), p, opts).correction;
}

/** Per-error-type coset audit of BP+OSD-0 vs the exact lookup over the whole syndrome domain. */
export interface CosetAudit {
  exact_match: number;
  coset_equivalent: number;
  syndrome_invalid: number;
  total: number;
}

/** How BP+OSD-0 does on all 16+16 syndromes vs the exact lookup (coset-equivalent?). */
export function syndromeCosetAudit(): { x_errors: CosetAudit; z_errors: CosetAudit } {
  const audit = (
    H: CheckMatrix,
    LOOKUP: Map<string, LookupEntry>,
    isLogical: (v: BitVector) => boolean,
    syndromeFn: (v: BitVector) => number[]
  ): CosetAudit => {
    let exact = 0;
    let cosetEq = 0;
    let invalid = 0;
    for (let m = 0; m < 16; m++) {
      const s = [(m >> 3) & 1, (m >> 2) & 1, (m >> 1) & 1, m & 1];
      const cBp = bpOsdDecode(H, s, DEFAULT_PRIOR).correction;
      const cOpt = LOOKUP.get(s.join(''))!.correction;
      const valid = syndromeFn(cBp).every((b, i) => b === s[i]);
      if (!valid) {
        invalid++;
        continue;
      }
      const diff = xorVec(cBp, cOpt);
      const trivialSynd = syndromeFn(diff).every((b) => b === 0);
      const notLogical = !isLogical(diff);
      if (trivialSynd && notLogical) {
        cosetEq++;
        if (cBp.join('') === cOpt.join('')) exact++;
      }
    }
    return { exact_match: exact, coset_equivalent: cosetEq, syndrome_invalid: invalid, total: 16 };
  };
  return {
    x_errors: audit(HX, LOOKUP_X, isLogicalX, syndromeX),
    z_errors: audit(HZ, LOOKUP_Z, isLogicalZ, syndromeZ),
  };
}

// ── Tanner-graph adjacency (the snn-webgpu decoder input) ─────────────────────
export interface TannerCheck {
  id: string;
  type: 'Z' | 'X';
  detects: 'X' | 'Z';
  support: readonly number[];
}
export interface TannerGraph {
  data_qubits: string[];
  checks: TannerCheck[];
  edges: [string, string][];
}

/** Bipartite Tanner graph; checks = neurons, syndrome = spikes, decode = message passing on edges. */
export function tannerGraph(): TannerGraph {
  const checks: TannerCheck[] = [];
  const edges: [string, string][] = [];
  ZSTAB.forEach((s, i) => {
    checks.push({ id: `Z${i}`, type: 'Z', detects: 'X', support: s });
    s.forEach((q) => edges.push([`Z${i}`, `q${q}`]));
  });
  XSTAB.forEach((s, i) => {
    checks.push({ id: `X${i}`, type: 'X', detects: 'Z', support: s });
    s.forEach((q) => edges.push([`X${i}`, `q${q}`]));
  });
  return {
    data_qubits: Array.from({ length: N }, (_, q) => `q${q}`),
    checks,
    edges,
  };
}

/** The @decode_receipt shape — replayable, both syndromes, layout-pinned. */
export function decodeReceipt(eX: BitVector, eZ: BitVector): Record<string, unknown> {
  const sX = syndromeX(eX);
  const sZ = syndromeZ(eZ);
  const cX = decodeX(eX);
  const cZ = decodeZ(eZ);
  return {
    schema: 'qec-decode-receipt/v0',
    code: '[[9,1,3]] rotated surface',
    layout: { z_stabilizers: ZSTAB, x_stabilizers: XSTAB, logical_x: XL, logical_z: ZL },
    x_syndrome: sX.join(''),
    z_syndrome: sZ.join(''),
    x_correction: cX.join(''),
    z_correction: cZ.join(''),
    logical_error: isLogicalX(xorVec(eX, cX)) || isLogicalZ(xorVec(eZ, cZ)),
  };
}
