/**
 * molecularDesigner.ts — Molecular Drug Design Engine
 *
 * Protein-ligand docking, binding affinity estimation, molecular property
 * calculation, drug-likeness rules (Lipinski), and 3D molecular visualization.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface Atom {
  id: string;
  element: string;       // 'C', 'N', 'O', 'H', 'S', 'P', etc.
  position: { x: number; y: number; z: number };
  charge: number;         // partial charge
  radius: number;         // van der Waals radius (Å)
}

export interface Bond {
  atomA: string;
  atomB: string;
  order: 1 | 2 | 3;      // single, double, triple
  rotatable: boolean;
}

export interface Molecule {
  id: string;
  name: string;
  formula: string;        // e.g., 'C20H25N3O'
  atoms: Atom[];
  bonds: Bond[];
  molecularWeight: number;
  logP: number;           // partition coefficient (lipophilicity)
  hBondDonors: number;
  hBondAcceptors: number;
  rotatableBonds: number;
  polarSurfaceArea: number; // Å²
}

export type AminoAcid =
  | 'ALA' | 'ARG' | 'ASN' | 'ASP' | 'CYS'
  | 'GLU' | 'GLN' | 'GLY' | 'HIS' | 'ILE'
  | 'LEU' | 'LYS' | 'MET' | 'PHE' | 'PRO'
  | 'SER' | 'THR' | 'TRP' | 'TYR' | 'VAL';

export interface ProteinResidue {
  id: number;
  aminoAcid: AminoAcid;
  chain: string;
  position: { x: number; y: number; z: number };
}

export interface BindingSite {
  id: string;
  name: string;
  residues: ProteinResidue[];
  center: { x: number; y: number; z: number };
  volume: number;         // Å³
}

export interface DockingResult {
  ligandId: string;
  siteId: string;
  bindingEnergy: number;  // kcal/mol (negative = favorable)
  pose: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number };
  contacts: Array<{ residueId: number; type: 'hydrogen' | 'hydrophobic' | 'ionic' | 'pi-stack'; distance: number }>;
  rmsd: number;           // Root-mean-square deviation
}

export interface LipinskiResult {
  passes: boolean;
  violations: string[];
  mw: boolean;
  logP: boolean;
  hbd: boolean;
  hba: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

export const VDW_RADII: Record<string, number> = {
  H: 1.20, C: 1.70, N: 1.55, O: 1.52, S: 1.80, P: 1.80, F: 1.47, Cl: 1.75, Br: 1.85, I: 1.98,
};

export const ELEMENT_COLORS: Record<string, string> = {
  H: '#ffffff', C: '#909090', N: '#3050f8', O: '#ff0d0d', S: '#ffff30',
  P: '#ff8000', F: '#90e050', Cl: '#1ff01f', Br: '#a62929', I: '#940094',
};

export const AMINO_ACID_CODES: Record<AminoAcid, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLU: 'E', GLN: 'Q', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
};

// ═══════════════════════════════════════════════════════════════════
// Molecular Properties
// ═══════════════════════════════════════════════════════════════════

export function atomDistance(a: Atom, b: Atom): number {
  return Math.sqrt(
    (a.position.x - b.position.x) ** 2 +
    (a.position.y - b.position.y) ** 2 +
    (a.position.z - b.position.z) ** 2
  );
}

export function molecularFormula(atoms: Atom[]): string {
  const counts: Record<string, number> = {};
  for (const a of atoms) counts[a.element] = (counts[a.element] || 0) + 1;
  // Hill system: C first, H second, then alphabetical
  const order = Object.keys(counts).sort((a, b) => {
    if (a === 'C') return -1;
    if (b === 'C') return 1;
    if (a === 'H') return -1;
    if (b === 'H') return 1;
    return a.localeCompare(b);
  });
  return order.map(el => `${el}${counts[el] > 1 ? counts[el] : ''}`).join('');
}

export function totalCharge(atoms: Atom[]): number {
  return atoms.reduce((sum, a) => sum + a.charge, 0);
}

export function moleculeCenter(atoms: Atom[]): { x: number; y: number; z: number } {
  const n = atoms.length || 1;
  return {
    x: atoms.reduce((s, a) => s + a.position.x, 0) / n,
    y: atoms.reduce((s, a) => s + a.position.y, 0) / n,
    z: atoms.reduce((s, a) => s + a.position.z, 0) / n,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Drug-Likeness (Lipinski's Rule of Five)
// ═══════════════════════════════════════════════════════════════════

export function checkLipinski(mol: Molecule): LipinskiResult {
  const violations: string[] = [];
  const mw = mol.molecularWeight <= 500;
  const logP = mol.logP <= 5;
  const hbd = mol.hBondDonors <= 5;
  const hba = mol.hBondAcceptors <= 10;

  if (!mw) violations.push(`MW ${mol.molecularWeight} > 500`);
  if (!logP) violations.push(`logP ${mol.logP} > 5`);
  if (!hbd) violations.push(`HBD ${mol.hBondDonors} > 5`);
  if (!hba) violations.push(`HBA ${mol.hBondAcceptors} > 10`);

  return { passes: violations.length <= 1, violations, mw, logP, hbd, hba };
}

export function drugLikenessScore(mol: Molecule): number {
  let score = 0;
  if (mol.molecularWeight <= 500) score += 25;
  if (mol.logP <= 5) score += 25;
  if (mol.hBondDonors <= 5) score += 25;
  if (mol.hBondAcceptors <= 10) score += 25;
  return score;
}

// ═══════════════════════════════════════════════════════════════════
// Protein-Ligand Docking
// ═══════════════════════════════════════════════════════════════════

export function estimateBindingEnergy(
  contacts: DockingResult['contacts']
): number {
  let energy = 0;
  for (const c of contacts) {
    if (c.type === 'hydrogen') energy -= 2.5;      // kcal/mol
    if (c.type === 'hydrophobic') energy -= 0.7;
    if (c.type === 'ionic') energy -= 5.0;
    if (c.type === 'pi-stack') energy -= 1.5;
    // Distance penalty: weaker with distance
    energy *= Math.exp(-0.5 * Math.max(0, c.distance - 3.0));
  }
  return Math.round(energy * 100) / 100;
}

export function bindingSiteVolume(residues: ProteinResidue[]): number {
  // Approximate as convex hull bounding box
  if (residues.length === 0) return 0;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const r of residues) {
    minX = Math.min(minX, r.position.x); maxX = Math.max(maxX, r.position.x);
    minY = Math.min(minY, r.position.y); maxY = Math.max(maxY, r.position.y);
    minZ = Math.min(minZ, r.position.z); maxZ = Math.max(maxZ, r.position.z);
  }
  return (maxX - minX) * (maxY - minY) * (maxZ - minZ);
}

export function aminoAcidOneLetterCode(aa: AminoAcid): string {
  return AMINO_ACID_CODES[aa];
}

export function isHydrophobic(aa: AminoAcid): boolean {
  return ['ALA', 'VAL', 'ILE', 'LEU', 'MET', 'PHE', 'TRP', 'PRO'].includes(aa);
}

export function isPolar(aa: AminoAcid): boolean {
  return ['SER', 'THR', 'ASN', 'GLN', 'TYR', 'CYS'].includes(aa);
}

export function isCharged(aa: AminoAcid): boolean {
  return ['ARG', 'LYS', 'ASP', 'GLU', 'HIS'].includes(aa);
}
