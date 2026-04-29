/**
 * molecularDesigner.ts — Molecular Drug Design Engine
 *
 * Protein-ligand docking, binding affinity estimation, molecular property
 * calculation, drug-likeness rules (Lipinski), and 3D molecular visualization.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type Vec3 = [number, number, number] | { x: number; y: number; z: number };

function toTuple(v: Vec3): [number, number, number] {
  if (Array.isArray(v)) return v;
  return [v.x, v.y, v.z];
}

function toObject(v: Vec3): { x: number; y: number; z: number } {
  if (Array.isArray(v)) return { x: v[0], y: v[1], z: v[2] };
  return v;
}

export interface Atom {
  id: string;
  element: string; // 'C', 'N', 'O', 'H', 'S', 'P', etc.
  position: Vec3;
  charge: number; // partial charge
  radius: number; // van der Waals radius (Å)
}

export interface Bond {
  atomA: string;
  atomB: string;
  order: 1 | 2 | 3; // single, double, triple
  rotatable: boolean;
}

export interface Molecule {
  id: string;
  name: string;
  formula: string; // e.g., 'C20H25N3O'
  atoms: Atom[];
  bonds: Bond[];
  molecularWeight: number;
  logP: number; // partition coefficient (lipophilicity)
  hBondDonors: number;
  hBondAcceptors: number;
  rotatableBonds: number;
  polarSurfaceArea: number; // Å²
}

export type AminoAcid =
  | 'ALA'
  | 'ARG'
  | 'ASN'
  | 'ASP'
  | 'CYS'
  | 'GLU'
  | 'GLN'
  | 'GLY'
  | 'HIS'
  | 'ILE'
  | 'LEU'
  | 'LYS'
  | 'MET'
  | 'PHE'
  | 'PRO'
  | 'SER'
  | 'THR'
  | 'TRP'
  | 'TYR'
  | 'VAL';

export interface ProteinResidue {
  id: number;
  aminoAcid: AminoAcid;
  chain: string;
  position: Vec3;
}

export interface BindingSite {
  id: string;
  name: string;
  residues: ProteinResidue[];
  center: Vec3;
  volume: number; // Å³
}

export interface DockingResult {
  ligandId: string;
  siteId: string;
  bindingEnergy: number; // kcal/mol (negative = favorable)
  pose: { position: [number, number, number]; rotation: [number, number, number] };
  contacts: Array<{
    residueId: number;
    type: 'hydrogen' | 'hydrophobic' | 'ionic' | 'pi-stack';
    distance: number;
  }>;
  rmsd: number; // Root-mean-square deviation
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
  H: 1.2,
  C: 1.7,
  N: 1.55,
  O: 1.52,
  S: 1.8,
  P: 1.8,
  F: 1.47,
  Cl: 1.75,
  Br: 1.85,
  I: 1.98,
};

export const ELEMENT_COLORS: Record<string, string> = {
  H: '#ffffff',
  C: '#909090',
  N: '#3050f8',
  O: '#ff0d0d',
  S: '#ffff30',
  P: '#ff8000',
  F: '#90e050',
  Cl: '#1ff01f',
  Br: '#a62929',
  I: '#940094',
};

export const AMINO_ACID_CODES: Record<AminoAcid, string> = {
  ALA: 'A',
  ARG: 'R',
  ASN: 'N',
  ASP: 'D',
  CYS: 'C',
  GLU: 'E',
  GLN: 'Q',
  GLY: 'G',
  HIS: 'H',
  ILE: 'I',
  LEU: 'L',
  LYS: 'K',
  MET: 'M',
  PHE: 'F',
  PRO: 'P',
  SER: 'S',
  THR: 'T',
  TRP: 'W',
  TYR: 'Y',
  VAL: 'V',
};

// ═══════════════════════════════════════════════════════════════════
// Molecular Properties
// ═══════════════════════════════════════════════════════════════════

export function atomDistance(a: Atom, b: Atom): number {
  const [ax, ay, az] = toTuple(a.position);
  const [bx, by, bz] = toTuple(b.position);
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2);
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
  return order.map((el) => `${el}${counts[el] > 1 ? counts[el] : ''}`).join('');
}

export function totalCharge(atoms: Atom[]): number {
  return atoms.reduce((sum, a) => sum + a.charge, 0);
}

export function moleculeCenter(atoms: Atom[]): { x: number; y: number; z: number } {
  const n = atoms.length || 1;
  const cx = atoms.reduce((s, a) => s + toTuple(a.position)[0], 0) / n;
  const cy = atoms.reduce((s, a) => s + toTuple(a.position)[1], 0) / n;
  const cz = atoms.reduce((s, a) => s + toTuple(a.position)[2], 0) / n;
  return { x: cx, y: cy, z: cz };
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

export function estimateBindingEnergy(contacts: DockingResult['contacts']): number {
  let energy = 0;
  for (const c of contacts) {
    if (c.type === 'hydrogen') energy -= 2.5; // kcal/mol
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
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;
  for (const r of residues) {
    const [x, y, z] = toTuple(r.position);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
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
  return ['ASP', 'GLU', 'LYS', 'ARG', 'HIS'].includes(aa);
}

// ═══════════════════════════════════════════════════════════════════
// PDB File Parser
// ═══════════════════════════════════════════════════════════════════

/**
 * Parses a simplified PDB-format text into an array of ProteinResidue.
 * Reads ATOM lines: columns 18-19=aa, 22=chain, 23-26=resSeq, 31-38=x, 39-46=y, 47-54=z
 */
export function parsePDB(pdbText: string): ProteinResidue[] {
  const residues: ProteinResidue[] = [];
  const seen = new Set<string>();
  const AA_MAP: Record<string, AminoAcid> = {
    ALA: 'ALA',
    ARG: 'ARG',
    ASN: 'ASN',
    ASP: 'ASP',
    CYS: 'CYS',
    GLU: 'GLU',
    GLN: 'GLN',
    GLY: 'GLY',
    HIS: 'HIS',
    ILE: 'ILE',
    LEU: 'LEU',
    LYS: 'LYS',
    MET: 'MET',
    PHE: 'PHE',
    PRO: 'PRO',
    SER: 'SER',
    THR: 'THR',
    TRP: 'TRP',
    TYR: 'TYR',
    VAL: 'VAL',
  };

  for (const line of pdbText.split('\n')) {
    if (!line.startsWith('ATOM')) continue;
    const resName = line.substring(17, 20).trim();
    const chain = line.substring(21, 22).trim();
    const resSeqStr = line.substring(22, 26).trim();
    const resSeq = parseInt(resSeqStr, 10);
    const key = `${chain}:${resSeq}`;
    if (seen.has(key)) continue; // first atom per residue
    seen.add(key);

    const x = parseFloat(line.substring(30, 38));
    const y = parseFloat(line.substring(38, 46));
    const z = parseFloat(line.substring(46, 54));
    const aa = AA_MAP[resName];
    if (!aa) continue;

    residues.push({ id: resSeq, aminoAcid: aa, chain, position: { x, y, z } });
  }
  return residues;
}

// ═══════════════════════════════════════════════════════════════════
// Solvent-Accessible Surface Area (Approximate)
// ═══════════════════════════════════════════════════════════════════

/**
 * Estimates solvent-accessible surface area from atom positions.
 * Uses a simplified shrake-rupley-like calculation where each exposed
 * atom contributes 4π(r+probe)² weighted by burial fraction.
 */
export function solventAccessibleSurface(atoms: Atom[], probeRadius: number = 1.4): number {
  let totalSASA = 0;
  for (const atom of atoms) {
    const r = atom.radius || 1.5; // Default VdW radius
    const fullSphere = 4 * Math.PI * (r + probeRadius) ** 2;
    // Count neighbors within contact distance
    let neighborCount = 0;
    for (const other of atoms) {
      if (other.id === atom.id) continue;
      const d = atomDistance(atom, other);
      if (d < r + (other.radius || 1.5) + 2 * probeRadius) neighborCount++;
    }
    // Exposure fraction decreases with neighbors (simplified)
    const expFraction = Math.max(0, 1 - neighborCount * 0.08);
    totalSASA += fullSphere * expFraction;
  }
  return totalSASA;
}

// ═══════════════════════════════════════════════════════════════════
// Pharmacophore Model
// ═══════════════════════════════════════════════════════════════════

export type PharmacophoreType =
  | 'h-bond-donor'
  | 'h-bond-acceptor'
  | 'hydrophobic'
  | 'positive'
  | 'negative'
  | 'aromatic';

export interface PharmacophoreFeature {
  type: PharmacophoreType;
  position: [number, number, number];
  radius: number;
  atomIds: string[];
}

/**
 * Identifies pharmacophore features in a molecule based on element types and charges.
 */
export function pharmacophoreFeatures(mol: Molecule): PharmacophoreFeature[] {
  const features: PharmacophoreFeature[] = [];

  for (const atom of mol.atoms) {
    // Hydrogen bond donors (N-H, O-H)
    if (atom.element === 'N' || atom.element === 'O') {
      if (atom.charge >= 0) {
        features.push({
          type: 'h-bond-donor',
          position: atom.position,
          radius: 1.0,
          atomIds: [atom.id],
        });
      }
      features.push({
        type: 'h-bond-acceptor',
        position: atom.position,
        radius: 1.0,
        atomIds: [atom.id],
      });
    }

    // Charged groups
    if (atom.charge > 0.3) {
      features.push({ type: 'positive', position: atom.position, radius: 1.5, atomIds: [atom.id] });
    } else if (atom.charge < -0.3) {
      features.push({ type: 'negative', position: atom.position, radius: 1.5, atomIds: [atom.id] });
    }

    // Hydrophobic (C atoms with no polar neighbors)
    if (atom.element === 'C') {
      features.push({
        type: 'hydrophobic',
        position: atom.position,
        radius: 1.5,
        atomIds: [atom.id],
      });
    }
  }

  return features;
}
