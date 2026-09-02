/**
 * Clifford Diagonalization — entangled measurement circuits for general-commuting
 * Pauli groups.
 *
 * Closes the gap measured in research/paper-37-quantum-receipts/
 * n2_pauli_grouping_receipt.json (ai-ecosystem): `groupPauliTerms` colors on
 * GENERAL commutativity (383-term N2 → 22 groups, matching IBM's 21), but
 * `computeMeasurementBasis` emits single-qubit rotations, which can only measure
 * qubit-wise-commuting (QWC) groups — 1 of the 22. The other 21 need an entangled
 * Clifford circuit U such that U·P·U† is ±(a product of Z's) for EVERY P in the
 * group; then one computational-basis measurement after U samples all of them.
 *
 * Algorithm (standard stabilizer-tableau synthesis; cf. Aaronson–Gottesman 2004,
 * van den Berg & Temme 2020, Crawford et al. 2021):
 *   1. Encode each Pauli as symplectic bit-vectors (x|z) over F₂.
 *   2. Extract an independent generator set by F₂ row reduction (rank k ≤ n).
 *   3. Sequentially bring each generator to a single-qubit X on a fresh pivot:
 *      row-XOR against processed generators (free — regenerates the same group),
 *      H to lift a pure-Z row into X, CNOTs to clear the X-tail, S/CZ to clear
 *      the Z-part. Commutation guarantees each step never disturbs a processed
 *      generator (processed rows are X_pivot; disturbance terms vanish exactly
 *      because the rows commute).
 *   4. Final H on every pivot: all generators ↦ Z_pivot. Every group member is a
 *      product of generators, hence diagonal too.
 *   5. Signs are NOT taken from the synthesis: each original Pauli is conjugated
 *      through the emitted gate list with the exact CHP phase rules
 *      (H: r^=x·z, swap; S: r^=x·z, z^=x; CNOT: r^=x_c·z_t·(x_t⊕z_c⊕1)).
 *      This doubles as a built-in validator — if any term fails to come out
 *      diagonal, the function throws rather than returning a wrong circuit.
 *
 * QWC groups take a fast path (per-qubit H / S†-then-H rotations, no two-qubit
 * gates), then run through the SAME conjugation validator, so both paths carry
 * identical correctness guarantees.
 *
 * Measurement semantics: append `gates` to the state-prep circuit, measure all
 * qubits in the computational basis. Then ⟨ψ|P|ψ⟩ = sign · ⟨Z_S⟩ where Z_S is
 * the `diagonal` string's Z-support and the expectation is over the measured
 * bitstrings. `expectationFromCounts` implements the reconstruction.
 *
 * Qubit convention: string index i = qubit i (leftmost character is qubit 0),
 * matching PauliGrouping and the N2 receipts.
 */

import { paulisCommute, type PauliTerm, type PauliGroup } from './PauliGrouping';

// ─── Types ───────────────────────────────────────────────────────────────────

/** One elementary Clifford gate. Names match OpenQASM 3 stdgates. */
export interface CliffordGate {
  /** 'h' | 's' | 'sdg' (single-qubit), 'cx' | 'cz' (two-qubit) */
  gate: 'h' | 's' | 'sdg' | 'cx' | 'cz';
  /** Target qubit(s); for cx the order is [control, target]. */
  qubits: number[];
}

/** A group member after diagonalization. */
export interface DiagonalizedTerm {
  /** The original Pauli string. */
  pauli: string;
  /** U·P·U† up to sign: a string over {I, Z} only. */
  diagonal: string;
  /** The exact sign relating them: U·P·U† = sign · diagonal. */
  sign: 1 | -1;
}

/** A simultaneous-measurement circuit for one commuting group. */
export interface DiagonalizationCircuit {
  nQubits: number;
  /** Gates to APPEND to state prep, in order, before measuring all qubits. */
  gates: CliffordGate[];
  /** Every input Pauli with its diagonal image and sign. */
  terms: DiagonalizedTerm[];
  /** The independent generator subset used for synthesis (original frame).
   *  Empty on the QWC fast path, which needs no generator synthesis. */
  generators: string[];
  /** Pivot qubit chosen for each generator (parallel to `generators`; empty on
   *  the QWC fast path). */
  pivots: number[];
  /** True → the group was QWC and `gates` contains single-qubit rotations only. */
  isQwc: boolean;
  twoQubitGateCount: number;
  singleQubitGateCount: number;
}

// ─── Pauli ⇄ symplectic encoding (qubit i = string index i = bit i) ──────────

const MAX_QUBITS = 30; // x/z live in one JS number bitmask each

interface SymPauli {
  x: number; // bit i set ⇔ X-component on qubit i
  z: number; // bit i set ⇔ Z-component on qubit i
  r: number; // sign bit: 0 → +1, 1 → −1
}

function encodePauli(pauli: string): SymPauli {
  let x = 0;
  let z = 0;
  for (let i = 0; i < pauli.length; i++) {
    const c = pauli[i]!;
    if (c === 'X') x |= 1 << i;
    else if (c === 'Y') { x |= 1 << i; z |= 1 << i; }
    else if (c === 'Z') z |= 1 << i;
    else if (c !== 'I') throw new Error(`Invalid Pauli character '${c}' in "${pauli}"`);
  }
  return { x, z, r: 0 };
}

function decodePauli(p: SymPauli, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const xi = (p.x >> i) & 1;
    const zi = (p.z >> i) & 1;
    s += xi && zi ? 'Y' : xi ? 'X' : zi ? 'Z' : 'I';
  }
  return s;
}

// ─── Exact CHP conjugation P ↦ g·P·g† (Aaronson–Gottesman phase rules) ───────

function conjH(p: SymPauli, q: number): void {
  const xq = (p.x >> q) & 1;
  const zq = (p.z >> q) & 1;
  p.r ^= xq & zq;
  // swap x_q ↔ z_q
  if (xq !== zq) { p.x ^= 1 << q; p.z ^= 1 << q; }
}

function conjS(p: SymPauli, q: number): void {
  const xq = (p.x >> q) & 1;
  const zq = (p.z >> q) & 1;
  p.r ^= xq & zq;
  if (xq) p.z ^= 1 << q; // z_q ^= x_q
}

function conjCX(p: SymPauli, c: number, t: number): void {
  const xc = (p.x >> c) & 1;
  const zc = (p.z >> c) & 1;
  const xt = (p.x >> t) & 1;
  const zt = (p.z >> t) & 1;
  p.r ^= xc & zt & (xt ^ zc ^ 1);
  if (xc) p.x ^= 1 << t; // x_t ^= x_c
  if (zt) p.z ^= 1 << c; // z_c ^= z_t
}

/** Conjugate through one emitted gate. sdg = s·s·s; cz = h(t)·cx(c,t)·h(t). */
function conjGate(p: SymPauli, g: CliffordGate): void {
  switch (g.gate) {
    case 'h': conjH(p, g.qubits[0]!); break;
    case 's': conjS(p, g.qubits[0]!); break;
    case 'sdg': conjS(p, g.qubits[0]!); conjS(p, g.qubits[0]!); conjS(p, g.qubits[0]!); break;
    case 'cx': conjCX(p, g.qubits[0]!, g.qubits[1]!); break;
    case 'cz': {
      const [c, t] = [g.qubits[0]!, g.qubits[1]!];
      conjH(p, t); conjCX(p, c, t); conjH(p, t);
      break;
    }
  }
}

// ─── QWC detection (per-qubit non-I letter uniformity) ───────────────────────

function qwcBasisOrNull(paulis: string[], n: number): string | null {
  const letter: string[] = new Array(n).fill('I');
  for (const p of paulis) {
    for (let i = 0; i < n; i++) {
      const c = p[i]!;
      if (c === 'I') continue;
      if (letter[i] === 'I') letter[i] = c;
      else if (letter[i] !== c) return null;
    }
  }
  return letter.join('');
}

// ─── Synthesis ───────────────────────────────────────────────────────────────

/**
 * Build a Clifford circuit that simultaneously diagonalizes a pairwise
 * general-commuting set of Pauli strings.
 *
 * Throws if the input does not pairwise commute, or if the built circuit fails
 * the built-in conjugation validation (which would indicate a bug, not bad
 * input — the validator makes that impossible to ship silently).
 */
export function diagonalizeCommutingGroup(paulis: string[]): DiagonalizationCircuit {
  if (paulis.length === 0) {
    return {
      nQubits: 0, gates: [], terms: [], generators: [], pivots: [],
      isQwc: true, twoQubitGateCount: 0, singleQubitGateCount: 0,
    };
  }
  const n = paulis[0]!.length;
  if (n > MAX_QUBITS) {
    throw new Error(`diagonalizeCommutingGroup supports up to ${MAX_QUBITS} qubits, got ${n}`);
  }
  for (const p of paulis) {
    if (p.length !== n) throw new Error(`Pauli length mismatch: "${p}" vs ${n} qubits`);
  }
  // Pairwise commutation gate (clear error over silent nonsense downstream).
  for (let i = 0; i < paulis.length; i++) {
    for (let j = i + 1; j < paulis.length; j++) {
      if (!paulisCommute(paulis[i]!, paulis[j]!)) {
        throw new Error(
          `Paulis do not commute: "${paulis[i]}" vs "${paulis[j]}" — only pairwise-commuting groups are simultaneously measurable`
        );
      }
    }
  }

  const gates: CliffordGate[] = [];
  const emit = (gate: CliffordGate['gate'], ...qubits: number[]) => {
    gates.push({ gate, qubits });
  };

  const qwcBasis = qwcBasisOrNull(paulis, n);
  let generators: string[] = [];
  let pivots: number[] = [];

  if (qwcBasis !== null) {
    // Fast path: per-qubit rotations. X → h; Y → sdg then h (S† maps Y→X, H maps X→Z).
    for (let q = 0; q < n; q++) {
      if (qwcBasis[q] === 'X') emit('h', q);
      else if (qwcBasis[q] === 'Y') { emit('sdg', q); emit('h', q); }
    }
  } else {
    // General path: symplectic elimination on an independent generator set.
    // 1. F₂ row reduction over (x|z) to pick independent generators.
    const rows: Array<{ x: number; z: number }> = [];
    for (const p of paulis) {
      const e = encodePauli(p);
      // Gaussian elimination in the 2n-bit vector (x concatenated with z):
      // rows are kept sorted by leading bit (their lowest set bit), so a single
      // forward pass fully decides independence — XORing a row toggles only
      // bits at or above its lead.
      let cur = { x: e.x, z: e.z };
      for (const r of rows) {
        const lead = leadBit(r);
        if (getBit(cur, lead)) { cur = { x: cur.x ^ r.x, z: cur.z ^ r.z }; }
      }
      if (cur.x !== 0 || cur.z !== 0) {
        rows.push(cur);
        // keep rows in echelon order by leading bit
        rows.sort((a, b) => leadBit(a) - leadBit(b));
      }
    }
    // Recover generator strings in the ORIGINAL frame for reporting: the echelon
    // rows themselves are valid generators (products of inputs), so decode them.
    generators = rows.map((r) => decodePauli({ x: r.x, z: r.z, r: 0 }, n));

    // 2. Working tableau (mutated by row-XOR and by emitted-gate column action).
    const tab = rows.map((r) => ({ x: r.x, z: r.z }));
    const applyToTableau = (g: CliffordGate) => {
      for (const row of tab) {
        const sp: SymPauli = { x: row.x, z: row.z, r: 0 };
        conjGate(sp, g); // sign irrelevant for synthesis
        row.x = sp.x; row.z = sp.z;
      }
    };
    const emitAndApply = (gate: CliffordGate['gate'], ...qubits: number[]) => {
      const g: CliffordGate = { gate, qubits };
      gates.push(g);
      applyToTableau(g);
    };

    pivots = [];
    for (let i = 0; i < tab.length; i++) {
      const row = tab[i]!;
      // 2a. Row-XOR away X-components on already-used pivots (free group op).
      for (let j = 0; j < i; j++) {
        if ((row.x >> pivots[j]!) & 1) { row.x ^= tab[j]!.x; row.z ^= tab[j]!.z; }
      }
      // 2b. Pure-Z row → lift into X with an H. Commutation with processed rows
      //     (each exactly X_pivot) forces z-support off the used pivots, so any
      //     Z-support qubit is fresh.
      if (row.x === 0) {
        if (row.z === 0) throw new Error('Internal error: dependent generator survived row reduction');
        const q = lowestSetBit(row.z);
        emitAndApply('h', q);
      }
      // 2c. Choose a fresh pivot (all used-pivot X-bits were cleared in 2a).
      const p = lowestSetBit(row.x);
      pivots.push(p);
      // 3. Clear the X-tail with CNOT(p → q).
      for (let q = 0; q < n; q++) {
        if (q !== p && ((row.x >> q) & 1)) emitAndApply('cx', p, q);
      }
      // 4. Clear the Z-part: S on the pivot, CZ(p, q) elsewhere. Commutation
      //    keeps the Z-support off earlier pivots, so processed rows are safe.
      if ((row.z >> p) & 1) emitAndApply('s', p);
      for (let q = 0; q < n; q++) {
        if (q !== p && ((row.z >> q) & 1)) emitAndApply('cz', p, q);
      }
      if (row.x !== 1 << p || row.z !== 0) {
        throw new Error(`Internal error: generator ${i} not reduced to X_${p}`);
      }
    }
    // 5. Every generator is now X_pivot; H turns each into Z_pivot.
    for (const p of pivots) emit('h', p);
  }

  // ── Validation + sign extraction: conjugate every ORIGINAL term through the
  //    full emitted gate list with exact CHP rules. Any non-diagonal result is
  //    a synthesis bug and throws.
  const terms: DiagonalizedTerm[] = paulis.map((pauli) => {
    const sp = encodePauli(pauli);
    for (const g of gates) conjGate(sp, g);
    if (sp.x !== 0) {
      throw new Error(
        `Internal error: "${pauli}" not diagonalized (residual X-mask ${sp.x.toString(2)}) — synthesis bug`
      );
    }
    return { pauli, diagonal: decodePauli(sp, n), sign: sp.r === 0 ? 1 : -1 };
  });

  let twoQ = 0;
  for (const g of gates) if (g.gate === 'cx' || g.gate === 'cz') twoQ++;

  return {
    nQubits: n,
    gates,
    terms,
    generators,
    pivots,
    isQwc: qwcBasis !== null,
    twoQubitGateCount: twoQ,
    singleQubitGateCount: gates.length - twoQ,
  };
}

function leadBit(r: { x: number; z: number }): number {
  // leading bit index in the concatenated (x|z) 2n-bit vector, x first
  if (r.x !== 0) return lowestSetBit(r.x);
  return MAX_QUBITS + lowestSetBit(r.z);
}

function getBit(r: { x: number; z: number }, lead: number): boolean {
  return lead < MAX_QUBITS ? ((r.x >> lead) & 1) === 1 : ((r.z >> (lead - MAX_QUBITS)) & 1) === 1;
}

function lowestSetBit(v: number): number {
  return 31 - Math.clz32(v & -v);
}

// ─── Convenience over PauliGrouping output ───────────────────────────────────

/**
 * Build the measurement circuit for a PauliGroup produced by groupPauliTerms.
 * Returns the circuit plus the group's terms with coefficients, ready for
 * expectation reconstruction.
 */
export function measurementPlanForGroup(group: PauliGroup): {
  circuit: DiagonalizationCircuit;
  terms: Array<PauliTerm & DiagonalizedTerm>;
} {
  const circuit = diagonalizeCommutingGroup(group.terms.map((t) => t.pauli));
  const byPauli = new Map(circuit.terms.map((t) => [t.pauli, t]));
  return {
    circuit,
    terms: group.terms.map((t) => ({ ...t, ...byPauli.get(t.pauli)! })),
  };
}

// ─── Expectation reconstruction from computational-basis counts ──────────────

/**
 * Reconstruct Σ_j coeff_j · ⟨P_j⟩ from computational-basis counts measured AFTER
 * appending the circuit's gates.
 *
 * `bitOrder`:
 *   'qubit-index' (default) — key.charAt(i) is qubit i's outcome.
 *   'qiskit'                — keys are reversed (qiskit's little-endian strings,
 *                             leftmost char = highest qubit index).
 */
export function expectationFromCounts(
  terms: Array<{ diagonal: string; sign: 1 | -1; coefficient: number }>,
  counts: Record<string, number>,
  bitOrder: 'qubit-index' | 'qiskit' = 'qubit-index'
): number {
  let totalShots = 0;
  for (const c of Object.values(counts)) totalShots += c;
  if (totalShots === 0) throw new Error('expectationFromCounts: zero total shots');

  const width = terms[0]?.diagonal.length ?? 0;
  let energy = 0;
  for (const [key, shots] of Object.entries(counts)) {
    // Armor against silent misalignment: keys must be plain bitstrings covering
    // every measured qubit (qiskit multi-register keys contain spaces — join
    // registers before calling; short keys would silently read missing qubits
    // as '0').
    if (!/^[01]+$/.test(key)) {
      throw new Error(`expectationFromCounts: counts key "${key}" is not a plain bitstring`);
    }
    if (key.length < width) {
      throw new Error(`expectationFromCounts: counts key "${key}" shorter than ${width} qubits`);
    }
    const bits = bitOrder === 'qiskit' ? [...key].reverse().join('') : key;
    for (const t of terms) {
      let parity = 0;
      for (let i = 0; i < t.diagonal.length; i++) {
        if (t.diagonal[i] === 'Z' && bits[i] === '1') parity ^= 1;
      }
      energy += t.coefficient * t.sign * (parity ? -1 : 1) * shots;
    }
  }
  return energy / totalShots;
}

// ─── OpenQASM 3 emission ─────────────────────────────────────────────────────

/**
 * Emit the measurement circuit as an OpenQASM 3 fragment (stdgates names),
 * ending with a full-register measurement. Prepend your state-prep circuit.
 */
export function measurementCircuitQasm3(circ: DiagonalizationCircuit, registerName = 'q'): string {
  const lines: string[] = [
    'OPENQASM 3.0;',
    'include "stdgates.inc";',
    `qubit[${circ.nQubits}] ${registerName};`,
    `bit[${circ.nQubits}] c;`,
  ];
  for (const g of circ.gates) {
    lines.push(`${g.gate} ${g.qubits.map((q) => `${registerName}[${q}]`).join(', ')};`);
  }
  lines.push(`c = measure ${registerName};`);
  return lines.join('\n') + '\n';
}
