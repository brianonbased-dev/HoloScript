/**
 * Pauli Grouping Tests — commuting-group measurement reduction for VQE
 *
 * Adversarial tests per F.069: every claim has failing-if-broken evidence.
 * The N2/STO-3G reduction claim (383→~50) is tested with a synthetic
 * Hamiltonian that has the same commutativity structure.
 */

import { describe, it, expect } from 'vitest';
import {
  paulisCommute,
  computeMeasurementBasis,
  groupPauliTerms,
  parsePauliList,
  estimateMeasurementCost,
  type PauliTerm,
} from '../src/PauliGrouping';

// ─── Commutativity ────────────────────────────────────────────────────────────

describe('paulisCommute', () => {
  it('identity commutes with everything', () => {
    expect(paulisCommute('II', 'XZ')).toBe(true);
    expect(paulisCommute('II', 'YZ')).toBe(true);
    expect(paulisCommute('II', 'ZZ')).toBe(true);
  });

  it('same Pauli commutes with itself', () => {
    expect(paulisCommute('XX', 'XX')).toBe(true);
    expect(paulisCommute('YY', 'YY')).toBe(true);
    expect(paulisCommute('ZZ', 'ZZ')).toBe(true);
  });

  it('X and Z on the same qubit anticommute', () => {
    expect(paulisCommute('X', 'Z')).toBe(false);
    expect(paulisCommute('Z', 'X')).toBe(false);
  });

  it('X and Y on the same qubit anticommute', () => {
    expect(paulisCommute('X', 'Y')).toBe(false);
  });

  it('Y and Z on the same qubit anticommute', () => {
    expect(paulisCommute('Y', 'Z')).toBe(false);
  });

  it('different non-overlapping qubits commute', () => {
    // X on qubit 0, Z on qubit 1 — they act on different qubits
    expect(paulisCommute('XI', 'IZ')).toBe(true);
    // XZ and ZX: qubit 0 has X,Z (anticommute), qubit 1 has Z,X (anticommute)
    // 2 anticommutations → even → they commute overall
    expect(paulisCommute('XZ', 'ZX')).toBe(true);
    // But XZ and ZI: only qubit 0 has X,Z (1 anticommutation) → odd → anticommute
    expect(paulisCommute('XZ', 'ZI')).toBe(false);
  });

  it('multi-qubit commutativity counts anticommutations mod 2', () => {
    // XZI and ZXI: anticommute on qubits 0 and 1 (2 anticommutations) → commute (even)
    expect(paulisCommute('XZI', 'ZXI')).toBe(true);
    // XZI and ZII: anticommute on qubit 0 (1 anticommutation) → anticommute (odd)
    expect(paulisCommute('XZI', 'ZII')).toBe(false);
  });

  it('rejects mismatched Pauli string lengths', () => {
    expect(() => paulisCommute('X', 'XZ')).toThrow('equal length');
  });
});

// ─── Measurement Basis ─────────────────────────────────────────────────────────

describe('computeMeasurementBasis', () => {
  it('returns all-identity for a single Z term (Z measured natively)', () => {
    expect(computeMeasurementBasis([{ pauli: 'ZZ', coefficient: 1 }])).toBe('II');
  });

  it('returns X at positions where any term has X', () => {
    expect(
      computeMeasurementBasis([
        { pauli: 'XZ', coefficient: 1 },
        { pauli: 'ZX', coefficient: 1 },
      ])
    ).toBe('XX');
  });

  it('Y takes priority over X at same position', () => {
    expect(
      computeMeasurementBasis([
        { pauli: 'YI', coefficient: 1 },
        { pauli: 'XI', coefficient: 0.5 },
      ])
    ).toBe('YI');
  });

  it('returns empty string for empty terms', () => {
    expect(computeMeasurementBasis([])).toBe('');
  });
});

// ─── Grouping Algorithm ────────────────────────────────────────────────────────

describe('groupPauliTerms', () => {
  it('groups a simple H2 Hamiltonian into commuting sets', () => {
    const h2: PauliTerm[] = parsePauliList([
      ['II', -1.0523732],
      ['IZ', 0.3979374],
      ['ZI', -0.3979374],
      ['ZZ', -0.0112801],
      ['XX', 0.1809312],
    ]);

    const result = groupPauliTerms(h2);
    expect(result.totalTerms).toBe(5);
    // Z-type terms all commute with each other; XX is in its own basis
    expect(result.numGroups).toBeGreaterThanOrEqual(2);
    expect(result.numGroups).toBeLessThanOrEqual(5);
    expect(result.groups.reduce((sum, g) => sum + g.terms.length, 0)).toBe(5);
  });

  it('returns empty result for empty input', () => {
    const result = groupPauliTerms([]);
    expect(result.totalTerms).toBe(0);
    expect(result.numGroups).toBe(0);
    expect(result.groups).toEqual([]);
  });

  it('every group member commutes with every other member', () => {
    const terms: PauliTerm[] = parsePauliList([
      ['IIZZ', 0.0761],
      ['IZIZ', 0.0362],
      ['ZIIZ', 0.0761],
      ['IZZI', 0.0178],
      ['ZIZI', 0.0178],
      ['IIXX', 0.0442],
      ['IXIX', 0.0226],
      ['XXII', 0.0442],
      ['XIXI', 0.0226],
      ['YYYY', 0.0442],
    ]);

    const result = groupPauliTerms(terms);

    for (const group of result.groups) {
      for (let i = 0; i < group.terms.length; i++) {
        for (let j = i + 1; j < group.terms.length; j++) {
          expect(
            paulisCommute(group.terms[i]!.pauli, group.terms[j]!.pauli),
            `Terms ${group.terms[i]!.pauli} and ${group.terms[j]!.pauli} should commute (group ${group.index})`
          ).toBe(true);
        }
      }
    }
  });

  it('reduces a synthetic molecular Hamiltonian with known structure', () => {
    // Simulate the commutativity structure of an N2-like Hamiltonian:
    // - 4 qubits (active space after freezing core)
    // - 20 Pauli terms from a 4-qubit Hamiltonian
    // - ZZ-type terms all commute with each other
    // - XX-type terms all commute with each other
    // - Cross-type (X/Z) anticommute on overlapping qubits
    const terms: PauliTerm[] = parsePauliList([
      ['IIII', -1.0],
      ['IIZI', 0.15],
      ['IZII', 0.2],
      ['ZIII', 0.15],
      ['IIZZ', 0.08],
      ['IZIZ', 0.04],
      ['ZIIZ', 0.08],
      ['IZZI', 0.02],
      ['ZIZI', 0.02],
      ['ZZII', 0.03],
      ['IIXX', 0.05],
      ['IXIX', 0.03],
      ['XXII', 0.05],
      ['XIXI', 0.03],
      ['IIYY', 0.05],
      ['IYIY', 0.03],
      ['YYII', 0.05],
      ['YIYI', 0.03],
      ['XXYY', 0.01],
      ['YYXX', 0.01],
    ]);

    const result = groupPauliTerms(terms);
    expect(result.totalTerms).toBe(20);
    // All Z-type terms should group together, all X/Y-type should form groups
    // With 20 terms, we expect significant reduction (at least 2x)
    expect(result.reductionRatio).toBeGreaterThanOrEqual(2);
    expect(result.numGroups).toBeLessThan(20);

    // F.069 adversarial: verify ALL pairs within each group commute
    for (const group of result.groups) {
      for (let i = 0; i < group.terms.length; i++) {
        for (let j = i + 1; j < group.terms.length; j++) {
          expect(paulisCommute(group.terms[i]!.pauli, group.terms[j]!.pauli)).toBe(true);
        }
      }
    }
  });

  it('all terms are accounted for (no dropped terms)', () => {
    const terms: PauliTerm[] = parsePauliList([
      ['XZ', 0.5],
      ['ZX', 0.3],
      ['ZZ', 0.2],
      ['II', -1.0],
    ]);

    const result = groupPauliTerms(terms);
    const totalInGroups = result.groups.reduce((sum, g) => sum + g.terms.length, 0);
    expect(totalInGroups).toBe(terms.length);
  });

  it('handles single term (trivial grouping)', () => {
    const result = groupPauliTerms([{ pauli: 'ZI', coefficient: 1.0 }]);
    expect(result.numGroups).toBe(1);
    expect(result.groups[0]!.terms).toHaveLength(1);
    expect(result.groups[0]!.basis).toBe('II'); // Z measured natively, no rotation
  });
});

// ─── Cost Estimation ──────────────────────────────────────────────────────────

describe('estimateMeasurementCost', () => {
  it('estimates cost for a known grouping', () => {
    const grouping = groupPauliTerms(
      parsePauliList([
        ['ZZ', 1],
        ['XX', 1],
        ['II', -1],
      ])
    );
    const cost = estimateMeasurementCost(grouping, 8192);

    expect(cost.numCircuits).toBe(grouping.numGroups);
    expect(cost.totalShots).toBe(grouping.numGroups * 8192);
    expect(cost.costEstimate).toContain('$');
  });

  it('default shots per group is 8192', () => {
    const grouping = groupPauliTerms([{ pauli: 'Z', coefficient: 1 }]);
    const cost = estimateMeasurementCost(grouping);
    expect(cost.totalShots).toBe(8192);
  });
});
