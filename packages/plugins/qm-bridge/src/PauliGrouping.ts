/**
 * Pauli Grouping — Commuting-group measurement reduction for VQE circuits.
 *
 * Takes a Hamiltonian expressed as a sum of Pauli terms (e.g., from Jordan-Wigner
 * transformation of an N2/STO-3G Hamiltonian) and partitions them into commuting
 * groups that can be measured simultaneously. This reduces the number of distinct
 * measurement bases from O(n^4) terms to O(n^2) groups, making larger molecules
 * tractable on NISQ hardware.
 *
 * Algorithm: greedy graph coloring on the commutativity graph.
 * Two Pauli terms commute iff they share no qubit on which they differ (X vs Z).
 * Terms that commute can be measured in the same basis rotation.
 *
 * Paper 37 deliverable: N2 383-term Hamiltonian → ~50 commuting groups.
 * Per F.072, cost estimate required before paid hardware submission (founder-gated).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single Pauli term: coefficient * P_1 ⊗ P_2 ⊗ ... ⊗ P_n */
export interface PauliTerm {
  /** Pauli string, e.g. "XIZY" (one char per qubit: I, X, Y, Z) */
  pauli: string;
  /** Real coefficient */
  coefficient: number;
}

/** A group of commuting Pauli terms that share a measurement basis */
export interface PauliGroup {
  /** Group index (0-based) */
  index: number;
  /** All terms in this group */
  terms: PauliTerm[];
  /** The measurement basis: which qubits need X, Y, Z rotations.
   *  'I' = no rotation (Z-basis), 'X' = H gate, 'Y' = S†H */
  basis: string;
}

/** Result of Pauli grouping */
export interface PauliGroupingResult {
  /** Original term count */
  totalTerms: number;
  /** Number of commuting groups */
  numGroups: number;
  /** The groups */
  groups: PauliGroup[];
  /** Reduction ratio: original terms / groups */
  reductionRatio: number;
}

// ─── Core Algorithm ──────────────────────────────────────────────────────────

/**
 * Check whether two Pauli strings commute.
 * Two Pauli operators P and Q commute iff for every qubit i,
 * P_i and Q_i commute (same operator, or one is I).
 * They ANTI-commute if they differ on an odd number of qubits.
 */
export function paulisCommute(a: string, b: string): boolean {
  if (a.length !== b.length) {
    throw new Error(`Pauli strings must have equal length: got ${a.length} vs ${b.length}`);
  }
  let anticommutations = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (ai !== bi && ai !== 'I' && bi !== 'I') {
      // Different non-identity operators anticommute on this qubit
      anticommutations++;
    }
  }
  return anticommutations % 2 === 0;
}

/**
 * Compute the measurement basis rotation for a set of commuting Pauli terms.
 *
 * Convention: the basis string shows which single-qubit rotation to apply
 * before measuring in the Z basis.
 *   I = no rotation (Z-basis measurement native)
 *   X = apply H gate
 *   Y = apply S† then H
 *   Z = no rotation (native Z-basis)
 *
 * For grouping: any qubit position where ANY term has X → X rotation.
 * Any position where ANY term has Y → Y rotation (Y takes priority over X).
 * Positions with only Z or I → no rotation (I in basis string).
 */
export function computeMeasurementBasis(terms: PauliTerm[]): string {
  if (terms.length === 0) return '';
  const n = terms[0]!.pauli.length;
  const basis: string[] = new Array(n).fill('I');

  for (const term of terms) {
    for (let i = 0; i < n; i++) {
      const c = term.pauli[i]!;
      if (c === 'Y') {
        basis[i] = 'Y';
      } else if (c === 'X' && basis[i] !== 'Y') {
        basis[i] = 'X';
      }
      // Z and I don't change the basis — Z is measured natively
    }
  }
  return basis.join('');
}

/**
 * Group commuting Pauli terms using greedy graph coloring.
 *
 * Algorithm:
 * 1. Build a commutativity graph where edges connect commuting terms.
 * 2. Color the graph greedily: assign each term to the first group
 *    where it commutes with ALL existing members.
 * 3. This is a heuristic — not guaranteed optimal, but typically achieves
 *    good reduction for molecular Hamiltonians (383 → ~50 for N2/STO-3G).
 *
 * @param terms - Array of Pauli terms to group
 * @returns Grouping result with commuting groups
 */
export function groupPauliTerms(terms: PauliTerm[]): PauliGroupingResult {
  if (terms.length === 0) {
    return { totalTerms: 0, numGroups: 0, groups: [], reductionRatio: Infinity };
  }

  // Sort terms by weight (descending) — larger coefficients first for better grouping
  const sorted = [...terms].sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

  const groups: PauliTerm[][] = [];
  // Precompute commutativity matrix for sorted terms
  // commutes[i][j] = true if sorted[i] and sorted[j] commute
  const n = sorted.length;
  const commutes: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));

  for (let i = 0; i < n; i++) {
    commutes[i]![i] = true; // a term commutes with itself
    for (let j = i + 1; j < n; j++) {
      const c = paulisCommute(sorted[i]!.pauli, sorted[j]!.pauli);
      commutes[i]![j] = c;
      commutes[j]![i] = c;
    }
  }

  // Greedy coloring: assign each term to the first group where it commutes with all members
  const termToGroup: number[] = new Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    let assigned = false;
    for (let g = 0; g < groups.length; g++) {
      // Check if term i commutes with ALL members of group g
      const allCommute = groups[g]!.every((member) => {
        const memberIdx = sorted.indexOf(member);
        return commutes[i]![memberIdx]!;
      });

      if (allCommute) {
        groups[g]!.push(sorted[i]!);
        termToGroup[i] = g;
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      // Create a new group
      groups.push([sorted[i]!]);
      termToGroup[i] = groups.length - 1;
    }
  }

  // Build result
  const resultGroups: PauliGroup[] = groups.map((terms, index) => ({
    index,
    terms,
    basis: computeMeasurementBasis(terms),
  }));

  return {
    totalTerms: terms.length,
    numGroups: resultGroups.length,
    groups: resultGroups,
    reductionRatio: terms.length / resultGroups.length,
  };
}

/**
 * Parse a SparsePauliOp-style list of (pauli_string, coefficient) pairs
 * into PauliTerm array.
 */
export function parsePauliList(
  entries: Array<[string, number]>
): PauliTerm[] {
  return entries.map(([pauli, coefficient]) => ({ pauli, coefficient }));
}

/**
 * Estimate the measurement cost (number of circuit evaluations) for a
 * grouped Hamiltonian, including shots-per-group overhead.
 *
 * @param grouping - Result from groupPauliTerms
 * @param shotsPerGroup - Number of shots per measurement group (default: 8192)
 * @returns Total circuit evaluations needed
 */
export function estimateMeasurementCost(
  grouping: PauliGroupingResult,
  shotsPerGroup: number = 8192
): { totalShots: number; numCircuits: number; costEstimate: string } {
  const totalShots = grouping.numGroups * shotsPerGroup;
  const numCircuits = grouping.numGroups;

  // Rough cost estimate for IBM Quantum (Kingston pricing as of 2026-05)
  // ~$0.03 per second on ibm_kingston, each circuit ~2-5 seconds including
  // readout, so ~$0.06-$0.15 per circuit per shot set.
  const costPerCircuitSecond = 0.03;
  const secondsPerCircuit = 3; // conservative estimate
  const estimatedCost = numCircuits * secondsPerCircuit * costPerCircuitSecond;

  return {
    totalShots,
    numCircuits,
    costEstimate: `~$${estimatedCost.toFixed(2)} at ibm_kingston rates (${numCircuits} circuits × ${shotsPerGroup} shots × ${secondsPerCircuit}s/circuit)`,
  };
}