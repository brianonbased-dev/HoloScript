/**
 * CliffordDiagonalization tests — implementation-independent ground truth.
 *
 * Two verification layers, neither reusing the module's tableau/CHP machinery:
 *   1. Dense complex matrices (n ≤ 4): literally build U from the gate list and
 *      check U·P·U† = sign · diag(Z-string) entrywise.
 *   2. A from-scratch statevector simulator (12 qubits for the real N2 groups
 *      shipped in fixtures/n2-pauli-groups.json): for random |ψ⟩ check
 *      ⟨ψ|P|ψ⟩ = sign · ⟨Uψ| Z_S |Uψ⟩ for every term of every group.
 *
 * Fixture provenance: genuine N2/STO-3G CAS(6,6) groups from the measured
 * receipt (ai-ecosystem research/paper-37-quantum-receipts/
 * n2_pauli_grouping_receipt.json).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  diagonalizeCommutingGroup,
  measurementPlanForGroup,
  expectationFromCounts,
  measurementCircuitQasm3,
  type CliffordGate,
  type DiagonalizationCircuit,
} from '../src/CliffordDiagonalization';
import { groupPauliTerms } from '../src/PauliGrouping';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── ground truth #1: dense complex matrices ─────────────────────────────────

type C = [number, number]; // [re, im]
type Mat = C[][];

const cAdd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const cMul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

function matMul(a: Mat, b: Mat): Mat {
  const n = a.length;
  const out: Mat = Array.from({ length: n }, () => Array.from({ length: n }, () => [0, 0] as C));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const aik = a[i]![k]!;
      if (aik[0] === 0 && aik[1] === 0) continue;
      for (let j = 0; j < n; j++) {
        out[i]![j] = cAdd(out[i]![j]!, cMul(aik, b[k]![j]!));
      }
    }
  }
  return out;
}

function dagger(a: Mat): Mat {
  const n = a.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => [a[j]![i]![0], -a[j]![i]![1]] as C)
  );
}

const s = Math.SQRT1_2;
const H2: Mat = [[[s, 0], [s, 0]], [[s, 0], [-s, 0]]];
const S2: Mat = [[[1, 0], [0, 0]], [[0, 0], [0, 1]]];
const SDG2: Mat = [[[1, 0], [0, 0]], [[0, 0], [0, -1]]];

/**
 * Embed a gate into n-qubit space.
 * SINGLE bit convention throughout the dense layer (matching the statevector
 * simulator and the module): qubit q ↔ bit q of the basis-state index.
 */
function gateMatrix(g: CliffordGate, n: number): Mat {
  const dim = 1 << n;
  const out: Mat = Array.from({ length: dim }, () => Array.from({ length: dim }, () => [0, 0] as C));
  if (g.gate === 'cx' || g.gate === 'cz') {
    const [c, t] = [g.qubits[0]!, g.qubits[1]!];
    for (let b = 0; b < dim; b++) {
      const cbit = (b >> c) & 1;
      if (g.gate === 'cx') {
        const b2 = cbit ? b ^ (1 << t) : b;
        out[b2]![b] = [1, 0];
      } else {
        const sign = cbit && ((b >> t) & 1) ? -1 : 1;
        out[b]![b] = [sign, 0];
      }
    }
    return out;
  }
  const single = g.gate === 'h' ? H2 : g.gate === 's' ? S2 : SDG2;
  const q = g.qubits[0]!;
  for (let b = 0; b < dim; b++) {
    const beta = (b >> q) & 1;
    for (let betaP = 0; betaP < 2; betaP++) {
      const entry = single[betaP]![beta]!;
      if (entry[0] === 0 && entry[1] === 0) continue;
      const b2 = (b & ~(1 << q)) | (betaP << q);
      out[b2]![b] = cAdd(out[b2]![b]!, entry);
    }
  }
  return out;
}

/** Pauli matrix via P|b⟩ = i^{#Y} · (−1)^{popcount(b∧z)} · |b ⊕ x⟩, bit q = qubit q. */
function pauliMatrix(pauli: string): Mat {
  const n = pauli.length;
  const dim = 1 << n;
  let xMask = 0, zMask = 0, yCount = 0;
  for (let q = 0; q < n; q++) {
    const ch = pauli[q]!;
    if (ch === 'X') xMask |= 1 << q;
    else if (ch === 'Y') { xMask |= 1 << q; zMask |= 1 << q; yCount++; }
    else if (ch === 'Z') zMask |= 1 << q;
    else if (ch !== 'I') throw new Error(`bad pauli ${pauli}`);
  }
  const phase: C = [[1, 0], [0, 1], [-1, 0], [0, -1]][yCount % 4]! as C;
  const out: Mat = Array.from({ length: dim }, () => Array.from({ length: dim }, () => [0, 0] as C));
  for (let b = 0; b < dim; b++) {
    let par = b & zMask;
    par ^= par >> 16; par ^= par >> 8; par ^= par >> 4; par ^= par >> 2; par ^= par >> 1;
    const sgn = par & 1 ? -1 : 1;
    out[b ^ xMask]![b] = [phase[0] * sgn, phase[1] * sgn];
  }
  return out;
}

function circuitMatrix(circ: DiagonalizationCircuit): Mat {
  const dim = 1 << circ.nQubits;
  let u: Mat = Array.from({ length: dim }, (_, i) =>
    Array.from({ length: dim }, (_, j) => [i === j ? 1 : 0, 0] as C)
  );
  // gates applied in order: U = g_m ··· g_1
  for (const g of circ.gates) u = matMul(gateMatrix(g, circ.nQubits), u);
  return u;
}

function matricesAgree(a: Mat, b: Mat, tol = 1e-10): boolean {
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a.length; j++) {
    if (Math.abs(a[i]![j]![0] - b[i]![j]![0]) > tol) return false;
    if (Math.abs(a[i]![j]![1] - b[i]![j]![1]) > tol) return false;
  }
  return true;
}

/** Full dense check: U·P·U† = sign · diag for every term. */
function verifyByMatrices(circ: DiagonalizationCircuit): void {
  const u = circuitMatrix(circ);
  const udag = dagger(u);
  for (const t of circ.terms) {
    const lhs = matMul(u, matMul(pauliMatrix(t.pauli), udag));
    const rhs = pauliMatrix(t.diagonal).map((row) =>
      row.map((c) => [c[0] * t.sign, c[1] * t.sign] as C)
    );
    expect(
      matricesAgree(lhs, rhs),
      `U·(${t.pauli})·U† should equal ${t.sign < 0 ? '-' : '+'}${t.diagonal}`
    ).toBe(true);
    for (const ch of t.diagonal) expect(['I', 'Z']).toContain(ch);
  }
}

// ─── ground truth #2: statevector simulator (for 12-qubit N2 groups) ─────────

class StateVector {
  re: Float64Array;
  im: Float64Array;
  n: number;
  constructor(n: number) {
    this.n = n;
    this.re = new Float64Array(1 << n);
    this.im = new Float64Array(1 << n);
  }
  static random(n: number, seed: number): StateVector {
    const sv = new StateVector(n);
    let state = seed >>> 0;
    const rnd = () => {
      // xorshift32 — deterministic test states
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      return state / 0xffffffff - 0.5;
    };
    let norm = 0;
    for (let i = 0; i < sv.re.length; i++) {
      sv.re[i] = rnd(); sv.im[i] = rnd();
      norm += sv.re[i]! ** 2 + sv.im[i]! ** 2;
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < sv.re.length; i++) { sv.re[i]! /= norm; sv.im[i]! /= norm; }
    return sv;
  }
  clone(): StateVector {
    const c = new StateVector(this.n);
    c.re.set(this.re); c.im.set(this.im);
    return c;
  }
  applyGate(g: CliffordGate): void {
    const { re, im } = this;
    if (g.gate === 'h') {
      const q = 1 << g.qubits[0]!;
      for (let b = 0; b < re.length; b++) {
        if (b & q) continue;
        const b1 = b | q;
        const r0 = re[b]!, i0 = im[b]!, r1 = re[b1]!, i1 = im[b1]!;
        re[b] = s * (r0 + r1); im[b] = s * (i0 + i1);
        re[b1] = s * (r0 - r1); im[b1] = s * (i0 - i1);
      }
    } else if (g.gate === 's' || g.gate === 'sdg') {
      const q = 1 << g.qubits[0]!;
      const sgn = g.gate === 's' ? 1 : -1; // |1⟩ → ±i|1⟩
      for (let b = 0; b < re.length; b++) {
        if (!(b & q)) continue;
        const r = re[b]!, i = im[b]!;
        re[b] = -sgn * i; im[b] = sgn * r;
      }
    } else if (g.gate === 'cx') {
      const c = 1 << g.qubits[0]!, t = 1 << g.qubits[1]!;
      for (let b = 0; b < re.length; b++) {
        if ((b & c) && !(b & t)) {
          const b1 = b | t;
          const r = re[b]!, i = im[b]!;
          re[b] = re[b1]!; im[b] = im[b1]!;
          re[b1] = r; im[b1] = i;
        }
      }
    } else { // cz
      const c = 1 << g.qubits[0]!, t = 1 << g.qubits[1]!;
      for (let b = 0; b < re.length; b++) {
        if ((b & c) && (b & t)) { re[b] = -re[b]!; im[b] = -im[b]!; }
      }
    }
  }
  /** ⟨this| P |this⟩ for a Pauli string (real for Hermitian P; return re). */
  pauliExpectation(pauli: string): number {
    let xMask = 0, zMask = 0, yCount = 0;
    for (let q = 0; q < pauli.length; q++) {
      const ch = pauli[q]!;
      if (ch === 'X') xMask |= 1 << q;
      else if (ch === 'Y') { xMask |= 1 << q; zMask |= 1 << q; yCount++; }
      else if (ch === 'Z') zMask |= 1 << q;
    }
    // P|b⟩ = i^{yCount} · (−1)^{popcount(b & zMask)} · |b ⊕ xMask⟩
    const phaseRe = [1, 0, -1, 0][yCount % 4]!;
    const phaseIm = [0, 1, 0, -1][yCount % 4]!;
    let accRe = 0;
    for (let b = 0; b < this.re.length; b++) {
      const b2 = b ^ xMask;
      let par = b & zMask;
      par ^= par >> 16; par ^= par >> 8; par ^= par >> 4; par ^= par >> 2; par ^= par >> 1;
      const sgn = par & 1 ? -1 : 1;
      // amp2 = phase · sgn · ψ[b]  lands on basis state b2 → ⟨ψ|P|ψ⟩ += conj(ψ[b2]) · amp2
      const aRe = sgn * (phaseRe * this.re[b]! - phaseIm * this.im[b]!);
      const aIm = sgn * (phaseRe * this.im[b]! + phaseIm * this.re[b]!);
      accRe += this.re[b2]! * aRe + this.im[b2]! * aIm;
    }
    return accRe;
  }
}

function verifyByStatevector(circ: DiagonalizationCircuit, seeds: number[]): void {
  for (const seed of seeds) {
    const psi = StateVector.random(circ.nQubits, seed);
    const evolved = psi.clone();
    for (const g of circ.gates) evolved.applyGate(g);
    for (const t of circ.terms) {
      const direct = psi.pauliExpectation(t.pauli);
      const viaDiag = t.sign * evolved.pauliExpectation(t.diagonal);
      expect(Math.abs(direct - viaDiag)).toBeLessThan(1e-9);
    }
  }
}

// ─── random commuting sets by rejection sampling (generation-independent) ────

function randomCommutingSet(n: number, target: number, seedState: { s: number }): string[] {
  const letters = ['I', 'X', 'Y', 'Z'];
  const rnd = () => {
    seedState.s ^= seedState.s << 13; seedState.s >>>= 0;
    seedState.s ^= seedState.s >> 17;
    seedState.s ^= seedState.s << 5; seedState.s >>>= 0;
    return seedState.s;
  };
  const commutes = (a: string, b: string): boolean => {
    let anti = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== 'I' && b[i] !== 'I' && a[i] !== b[i]) anti++;
    }
    return anti % 2 === 0;
  };
  const set: string[] = [];
  let attempts = 0;
  while (set.length < target && attempts < 4000) {
    attempts++;
    let p = '';
    for (let i = 0; i < n; i++) p += letters[rnd() % 4]!;
    if (/^I+$/.test(p)) continue;
    if (set.includes(p)) continue;
    if (set.every((q) => commutes(q, p))) set.push(p);
  }
  return set;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('diagonalizeCommutingGroup — exact matrix ground truth', () => {
  it('diagonalizes the Bell triple {XX, YY, ZZ} with an entangling gate', () => {
    const circ = diagonalizeCommutingGroup(['XX', 'YY', 'ZZ']);
    expect(circ.isQwc).toBe(false);
    expect(circ.twoQubitGateCount).toBeGreaterThan(0);
    verifyByMatrices(circ);
  });

  it('diagonalizes the GHZ-style stabilizers {XXX, ZZI, IZZ}', () => {
    const circ = diagonalizeCommutingGroup(['XXX', 'ZZI', 'IZZ']);
    expect(circ.isQwc).toBe(false);
    verifyByMatrices(circ);
  });

  it('takes the single-qubit fast path for QWC groups (all signs +1)', () => {
    const circ = diagonalizeCommutingGroup(['XIZ', 'XYI', 'IYZ']);
    expect(circ.isQwc).toBe(true);
    expect(circ.twoQubitGateCount).toBe(0);
    for (const t of circ.terms) expect(t.sign).toBe(1);
    verifyByMatrices(circ);
  });

  it('handles identity terms and the empty group', () => {
    const circ = diagonalizeCommutingGroup(['II', 'ZZ']);
    const id = circ.terms.find((t) => t.pauli === 'II')!;
    expect(id.diagonal).toBe('II');
    expect(id.sign).toBe(1);
    verifyByMatrices(circ);
    expect(diagonalizeCommutingGroup([]).gates).toHaveLength(0);
  });

  it('property: 30 random commuting sets on 3–4 qubits verify densely', () => {
    const seed = { s: 0xC0FFEE };
    for (let trial = 0; trial < 30; trial++) {
      const n = 3 + (trial % 2);
      const set = randomCommutingSet(n, 3 + (trial % 4), seed);
      if (set.length < 2) continue;
      const circ = diagonalizeCommutingGroup(set);
      verifyByMatrices(circ);
    }
  });

  it('rejects non-commuting input with a clear error', () => {
    expect(() => diagonalizeCommutingGroup(['XI', 'ZI'])).toThrow(/do not commute/);
  });

  it('rejects malformed input', () => {
    expect(() => diagonalizeCommutingGroup(['XA'])).toThrow(/Invalid Pauli/);
    expect(() => diagonalizeCommutingGroup(['XI', 'X'])).toThrow(/length mismatch/);
  });
});

describe('N2 receipt groups — 12-qubit statevector ground truth', () => {
  const fixture = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'n2-pauli-groups.json'), 'utf8')
  ) as {
    n_qubits: number;
    groups: Array<{ group: number; qwc_valid: boolean; terms: Array<{ pauli: string; coefficient: number }> }>;
  };

  for (const g of fixture.groups) {
    it(`group ${g.group} (${g.terms.length} terms, ${g.qwc_valid ? 'QWC' : 'general-only'}) measures correctly`, () => {
      const circ = diagonalizeCommutingGroup(g.terms.map((t) => t.pauli));
      expect(circ.isQwc).toBe(g.qwc_valid);
      if (g.qwc_valid) {
        expect(circ.twoQubitGateCount).toBe(0);
      } else {
        expect(circ.twoQubitGateCount).toBeGreaterThan(0);
      }
      // every diagonal image is I/Z only
      for (const t of circ.terms) expect(t.diagonal).toMatch(/^[IZ]+$/);
      // exact observable equality on deterministic random states
      verifyByStatevector(circ, [11, 22, 33]);
    });
  }

  it('measurementPlanForGroup carries coefficients through', () => {
    const grouping = groupPauliTerms(
      fixture.groups[1]!.terms.map((t) => ({ pauli: t.pauli, coefficient: t.coefficient }))
    );
    const plan = measurementPlanForGroup(grouping.groups[0]!);
    expect(plan.terms.length).toBe(grouping.groups[0]!.terms.length);
    for (const t of plan.terms) {
      expect(typeof t.coefficient).toBe('number');
      expect(t.diagonal).toMatch(/^[IZ]+$/);
    }
  });
});

describe('expectationFromCounts', () => {
  it('reconstructs a hand-computed expectation with signs and both bit orders', () => {
    // Single term: diagonal ZI, sign −1, coefficient 2. Counts: '00'×3, '10'×1.
    // qubit-index order: bits[0] is qubit 0. ⟨Z₀⟩ = (3·(+1) + 1·(−1))/4 = 0.5
    // → energy = 2 · (−1) · 0.5 = −1.
    const terms = [{ diagonal: 'ZI', sign: -1 as const, coefficient: 2 }];
    expect(expectationFromCounts(terms, { '00': 3, '10': 1 })).toBeCloseTo(-1, 12);
    // qiskit order reverses keys: qubit 0 is the RIGHTMOST char.
    expect(expectationFromCounts(terms, { '00': 3, '01': 1 }, 'qiskit')).toBeCloseTo(-1, 12);
  });

  it('matches the statevector on a real diagonalized group', () => {
    // Build exact Born-rule "counts" (probabilities) from the evolved state and
    // check the reconstruction equals the direct expectation.
    const circ = diagonalizeCommutingGroup(['XX', 'YY', 'ZZ']);
    const psi = StateVector.random(2, 7);
    const evolved = psi.clone();
    for (const g of circ.gates) evolved.applyGate(g);
    const counts: Record<string, number> = {};
    for (let b = 0; b < 4; b++) {
      const p = evolved.re[b]! ** 2 + evolved.im[b]! ** 2;
      const key = `${b & 1}${(b >> 1) & 1}`; // charAt(i) = qubit i
      counts[key] = (counts[key] ?? 0) + p;
    }
    const coeffs = [0.5, -1.25, 2];
    const terms = circ.terms.map((t, i) => ({ ...t, coefficient: coeffs[i]! }));
    const direct = circ.terms.reduce(
      (acc, t, i) => acc + coeffs[i]! * psi.pauliExpectation(t.pauli), 0);
    expect(expectationFromCounts(terms, counts)).toBeCloseTo(direct, 9);
  });
});

describe('measurementCircuitQasm3', () => {
  it('emits stdgates QASM 3 with a full measurement', () => {
    const circ = diagonalizeCommutingGroup(['XX', 'YY', 'ZZ']);
    const qasm = measurementCircuitQasm3(circ);
    expect(qasm).toContain('OPENQASM 3.0;');
    expect(qasm).toContain('include "stdgates.inc";');
    expect(qasm).toContain('qubit[2] q;');
    expect(qasm).toContain('c = measure q;');
    for (const g of circ.gates) expect(qasm).toContain(g.gate + ' ');
  });
});
