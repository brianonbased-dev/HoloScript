/**
 * molecular-drug-designer.scenario.ts — LIVING-SPEC: Molecular Drug Designer
 *
 * Persona: Dr. Kenji — computational chemist who designs drug candidates,
 * analyzes protein-ligand binding, checks Lipinski's Rule of Five,
 * and visualizes molecular structures in 3D.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect } from 'vitest';
import {
  atomDistance,
  molecularFormula,
  totalCharge,
  moleculeCenter,
  checkLipinski,
  drugLikenessScore,
  estimateBindingEnergy,
  bindingSiteVolume,
  aminoAcidOneLetterCode,
  isHydrophobic,
  isPolar,
  isCharged,
  parsePDB,
  solventAccessibleSurface,
  pharmacophoreFeatures,
  VDW_RADII,
  ELEMENT_COLORS,
  AMINO_ACID_CODES,
  type Atom,
  type Molecule,
  type ProteinResidue,
  type DockingResult,
} from '@/lib/molecularDesigner';

// ═══════════════════════════════════════════════════════════════════
// 1. Atomic & Molecular Properties
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Molecular Drug Designer — Molecular Properties', () => {
  const carbon: Atom = {
    id: 'C1',
    element: 'C',
    position: { x: 0, y: 0, z: 0 },
    charge: 0,
    radius: 1.7,
  };
  const oxygen: Atom = {
    id: 'O1',
    element: 'O',
    position: { x: 1.43, y: 0, z: 0 },
    charge: -0.5,
    radius: 1.52,
  };
  const hydrogen: Atom = {
    id: 'H1',
    element: 'H',
    position: { x: -0.5, y: 0.87, z: 0 },
    charge: 0.25,
    radius: 1.2,
  };

  it('atomDistance() calculates distance between two atoms', () => {
    const dist = atomDistance(carbon, oxygen);
    expect(dist).toBeCloseTo(1.43, 2); // C-O bond length
  });

  it('molecularFormula() generates Hill system notation', () => {
    const formula = molecularFormula([
      carbon,
      carbon,
      oxygen,
      hydrogen,
      hydrogen,
      hydrogen,
      hydrogen,
    ]);
    expect(formula).toBe('C2H4O');
  });

  it('totalCharge() sums partial charges', () => {
    const charge = totalCharge([carbon, oxygen, hydrogen]);
    expect(charge).toBeCloseTo(-0.25, 2);
  });

  it('moleculeCenter() calculates centroid', () => {
    const center = moleculeCenter([carbon, oxygen]);
    expect(center.x).toBeCloseTo(0.715, 2);
  });

  it('VDW_RADII has entries for common elements', () => {
    expect(VDW_RADII['C']).toBe(1.7);
    expect(VDW_RADII['N']).toBe(1.55);
    expect(VDW_RADII['O']).toBe(1.52);
    expect(VDW_RADII['H']).toBe(1.2);
  });

  it('ELEMENT_COLORS maps elements to hex colors', () => {
    expect(ELEMENT_COLORS['C']).toBe('#909090');
    expect(ELEMENT_COLORS['O']).toBe('#ff0d0d');
    expect(ELEMENT_COLORS['N']).toBe('#3050f8');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Drug-Likeness (Lipinski's Rule of Five)
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Molecular Drug Designer — Lipinski Rules', () => {
  const aspirinLike: Molecule = {
    id: 'aspirin',
    name: 'Aspirin-like',
    formula: 'C9H8O4',
    atoms: [],
    bonds: [],
    molecularWeight: 180.16,
    logP: 1.2,
    hBondDonors: 1,
    hBondAcceptors: 4,
    rotatableBonds: 3,
    polarSurfaceArea: 63.6,
  };

  const violator: Molecule = {
    id: 'big-mol',
    name: 'Over-sized',
    formula: 'C40H50N8O10',
    atoms: [],
    bonds: [],
    molecularWeight: 820,
    logP: 6.5,
    hBondDonors: 8,
    hBondAcceptors: 12,
    rotatableBonds: 15,
    polarSurfaceArea: 200,
  };

  it('aspirin-like molecule passes Lipinski', () => {
    const result = checkLipinski(aspirinLike);
    expect(result.passes).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('Lipinski checks MW ≤ 500', () => {
    expect(checkLipinski(aspirinLike).mw).toBe(true);
    expect(checkLipinski(violator).mw).toBe(false);
  });

  it('Lipinski checks logP ≤ 5', () => {
    expect(checkLipinski(aspirinLike).logP).toBe(true);
    expect(checkLipinski(violator).logP).toBe(false);
  });

  it('Lipinski checks HBD ≤ 5', () => {
    expect(checkLipinski(aspirinLike).hbd).toBe(true);
    expect(checkLipinski(violator).hbd).toBe(false);
  });

  it('Lipinski checks HBA ≤ 10', () => {
    expect(checkLipinski(aspirinLike).hba).toBe(true);
    expect(checkLipinski(violator).hba).toBe(false);
  });

  it('violator fails with 4 violations', () => {
    const result = checkLipinski(violator);
    expect(result.passes).toBe(false);
    expect(result.violations).toHaveLength(4);
  });

  it('drugLikenessScore() returns 100 for ideal molecule', () => {
    expect(drugLikenessScore(aspirinLike)).toBe(100);
  });

  it('drugLikenessScore() returns 0 for full violator', () => {
    expect(drugLikenessScore(violator)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Protein-Ligand Docking
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Molecular Drug Designer — Docking', () => {
  it('estimateBindingEnergy() returns negative for favorable contacts', () => {
    const contacts: DockingResult['contacts'] = [
      { residueId: 1, type: 'hydrogen', distance: 2.8 },
      { residueId: 5, type: 'hydrophobic', distance: 3.5 },
      { residueId: 12, type: 'ionic', distance: 3.0 },
    ];
    const energy = estimateBindingEnergy(contacts);
    expect(energy).toBeLessThan(0); // Negative = favorable
  });

  it('stronger contacts have more negative energy', () => {
    const one = estimateBindingEnergy([{ residueId: 1, type: 'hydrogen', distance: 2.5 }]);
    const two = estimateBindingEnergy([
      { residueId: 1, type: 'hydrogen', distance: 2.5 },
      { residueId: 2, type: 'ionic', distance: 2.8 },
    ]);
    expect(two).toBeLessThan(one); // More contacts = lower (more negative) energy
  });

  it('distant contacts contribute less energy', () => {
    const close = estimateBindingEnergy([{ residueId: 1, type: 'hydrogen', distance: 2.5 }]);
    const far = estimateBindingEnergy([{ residueId: 1, type: 'hydrogen', distance: 6.0 }]);
    expect(Math.abs(close)).toBeGreaterThan(Math.abs(far));
  });

  it('bindingSiteVolume() calculates bounding box volume', () => {
    const residues: ProteinResidue[] = [
      { id: 1, aminoAcid: 'ALA', chain: 'A', position: { x: 0, y: 0, z: 0 } },
      { id: 2, aminoAcid: 'GLY', chain: 'A', position: { x: 10, y: 10, z: 10 } },
    ];
    expect(bindingSiteVolume(residues)).toBe(1000); // 10*10*10
  });

  it('empty binding site has 0 volume', () => {
    expect(bindingSiteVolume([])).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Amino Acid Classification
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Molecular Drug Designer — Amino Acids', () => {
  it('aminoAcidOneLetterCode() converts 3-letter to 1-letter', () => {
    expect(aminoAcidOneLetterCode('ALA')).toBe('A');
    expect(aminoAcidOneLetterCode('TRP')).toBe('W');
    expect(aminoAcidOneLetterCode('GLY')).toBe('G');
  });

  it('all 20 standard amino acids are defined', () => {
    expect(Object.keys(AMINO_ACID_CODES)).toHaveLength(20);
  });

  it('isHydrophobic() identifies nonpolar residues', () => {
    expect(isHydrophobic('ALA')).toBe(true);
    expect(isHydrophobic('LEU')).toBe(true);
    expect(isHydrophobic('ASP')).toBe(false);
  });

  it('isPolar() identifies uncharged polar residues', () => {
    expect(isPolar('SER')).toBe(true);
    expect(isPolar('THR')).toBe(true);
    expect(isPolar('ALA')).toBe(false);
  });

  it('isCharged() identifies charged residues', () => {
    expect(isCharged('ARG')).toBe(true); // positive
    expect(isCharged('ASP')).toBe(true); // negative
    expect(isCharged('ALA')).toBe(false);
  });

  it('parsePDB() — parses ATOM lines into ProteinResidue[]', () => {
    const pdb = [
      'ATOM      1  N   ALA A   1       1.000   2.000   3.000  1.00  0.00           N',
      'ATOM      2  CA  ALA A   1       2.000   3.000   4.000  1.00  0.00           C',
      'ATOM      3  N   GLY A   2       5.000   6.000   7.000  1.00  0.00           N',
    ].join('\n');
    const residues = parsePDB(pdb);
    expect(residues).toHaveLength(2);
    expect(residues[0].aminoAcid).toBe('ALA');
    expect(residues[1].aminoAcid).toBe('GLY');
    expect(residues[0].position.x).toBeCloseTo(1.0, 1);
  });

  it('solventAccessibleSurface() — returns positive surface area', () => {
    const atoms: Atom[] = [
      { id: 'C1', element: 'C', position: { x: 0, y: 0, z: 0 }, charge: 0, radius: 1.7 },
      { id: 'O1', element: 'O', position: { x: 1.43, y: 0, z: 0 }, charge: -0.5, radius: 1.52 },
    ];
    const sasa = solventAccessibleSurface(atoms);
    expect(sasa).toBeGreaterThan(0);
  });

  it('pharmacophoreFeatures() — identifies H-bond and hydrophobic features', () => {
    const mol: Molecule = {
      id: 'test',
      name: 'Test',
      formula: 'CNO',
      atoms: [
        { id: 'C1', element: 'C', position: { x: 0, y: 0, z: 0 }, charge: 0, radius: 1.7 },
        { id: 'N1', element: 'N', position: { x: 1, y: 0, z: 0 }, charge: 0.1, radius: 1.55 },
        { id: 'O1', element: 'O', position: { x: 2, y: 0, z: 0 }, charge: -0.5, radius: 1.52 },
      ],
      bonds: [],
      molecularWeight: 42,
      logP: 0.5,
      hBondDonors: 1,
      hBondAcceptors: 2,
      rotatableBonds: 1,
      polarSurfaceArea: 40,
    };
    const features = pharmacophoreFeatures(mol);
    expect(features.some((f) => f.type === 'hydrophobic')).toBe(true);
    expect(features.some((f) => f.type === 'h-bond-acceptor')).toBe(true);
    expect(features.some((f) => f.type === 'negative')).toBe(true);
  });
});
