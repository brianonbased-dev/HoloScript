/**
 * dnaSequencing.ts — DNA Sequencing & Genomics Engine
 *
 * Base pair operations, codon translation, protein synthesis,
 * GC content analysis, CRISPR targeting, and mutation detection.
 */

export type Nucleotide = 'A' | 'T' | 'G' | 'C';
export type RNANucleotide = 'A' | 'U' | 'G' | 'C';
export type AminoAcid = 'Ala' | 'Arg' | 'Asn' | 'Asp' | 'Cys' | 'Glu' | 'Gln' | 'Gly' | 'His' | 'Ile' | 'Leu' | 'Lys' | 'Met' | 'Phe' | 'Pro' | 'Ser' | 'Thr' | 'Trp' | 'Tyr' | 'Val' | 'STOP';
export type MutationType = 'substitution' | 'insertion' | 'deletion' | 'silent' | 'missense' | 'nonsense';

export interface Gene {
  id: string;
  name: string;
  chromosome: number;
  startPosition: number;
  sequence: string;           // DNA sequence (ATGC)
  function: string;
}

export interface CRISPRTarget {
  guideRNA: string;          // 20-nt guide sequence
  pamSite: string;           // PAM sequence (e.g., 'NGG')
  targetGene: string;
  cutPosition: number;
  offTargetScore: number;    // 0-100 (lower = better)
  efficiency: number;        // 0-100
}

export interface Mutation {
  position: number;
  original: string;
  mutated: string;
  type: MutationType;
}

// ═══════════════════════════════════════════════════════════════════
// Base Pair Operations
// ═══════════════════════════════════════════════════════════════════

export function complement(base: Nucleotide): Nucleotide {
  const map: Record<Nucleotide, Nucleotide> = { A: 'T', T: 'A', G: 'C', C: 'G' };
  return map[base];
}

export function complementStrand(dna: string): string {
  return dna.split('').map(b => complement(b as Nucleotide)).join('');
}

export function transcribe(dna: string): string {
  // DNA → mRNA: T → U, complement
  return dna.split('').map(b => {
    const comp = complement(b as Nucleotide);
    return comp === 'T' ? 'U' : comp;
  }).join('');
}

export function reverseComplement(dna: string): string {
  return complementStrand(dna).split('').reverse().join('');
}

// ═══════════════════════════════════════════════════════════════════
// Codon Table (simplified)
// ═══════════════════════════════════════════════════════════════════

const CODON_TABLE: Record<string, AminoAcid> = {
  AUG: 'Met', UUU: 'Phe', UUC: 'Phe', UUA: 'Leu', UUG: 'Leu',
  CUU: 'Leu', CUC: 'Leu', CUA: 'Leu', CUG: 'Leu',
  AUU: 'Ile', AUC: 'Ile', AUA: 'Ile',
  GUU: 'Val', GUC: 'Val', GUA: 'Val', GUG: 'Val',
  UCU: 'Ser', UCC: 'Ser', UCA: 'Ser', UCG: 'Ser',
  CCU: 'Pro', CCC: 'Pro', CCA: 'Pro', CCG: 'Pro',
  ACU: 'Thr', ACC: 'Thr', ACA: 'Thr', ACG: 'Thr',
  GCU: 'Ala', GCC: 'Ala', GCA: 'Ala', GCG: 'Ala',
  UAU: 'Tyr', UAC: 'Tyr',
  CAU: 'His', CAC: 'His', CAA: 'Gln', CAG: 'Gln',
  AAU: 'Asn', AAC: 'Asn', AAA: 'Lys', AAG: 'Lys',
  GAU: 'Asp', GAC: 'Asp', GAA: 'Glu', GAG: 'Glu',
  UGU: 'Cys', UGC: 'Cys', UGG: 'Trp',
  CGU: 'Arg', CGC: 'Arg', CGA: 'Arg', CGG: 'Arg',
  AGU: 'Ser', AGC: 'Ser', AGA: 'Arg', AGG: 'Arg',
  GGU: 'Gly', GGC: 'Gly', GGA: 'Gly', GGG: 'Gly',
  UAA: 'STOP', UAG: 'STOP', UGA: 'STOP',
};

export function translateCodon(codon: string): AminoAcid | undefined {
  return CODON_TABLE[codon.toUpperCase()];
}

export function translateMRNA(mrna: string): AminoAcid[] {
  const result: AminoAcid[] = [];
  for (let i = 0; i + 2 < mrna.length; i += 3) {
    const codon = mrna.substring(i, i + 3).toUpperCase();
    const aa = translateCodon(codon);
    if (!aa) continue;
    if (aa === 'STOP') break;
    result.push(aa);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// Sequence Analysis
// ═══════════════════════════════════════════════════════════════════

export function gcContent(dna: string): number {
  const gc = dna.split('').filter(b => b === 'G' || b === 'C').length;
  return dna.length > 0 ? gc / dna.length : 0;
}

export function sequenceLength(dna: string): number {
  return dna.length;
}

export function findMotif(dna: string, motif: string): number[] {
  const positions: number[] = [];
  let idx = dna.indexOf(motif);
  while (idx !== -1) {
    positions.push(idx);
    idx = dna.indexOf(motif, idx + 1);
  }
  return positions;
}

export function detectMutations(original: string, mutated: string): Mutation[] {
  const mutations: Mutation[] = [];
  const len = Math.min(original.length, mutated.length);
  for (let i = 0; i < len; i++) {
    if (original[i] !== mutated[i]) {
      mutations.push({ position: i, original: original[i], mutated: mutated[i], type: 'substitution' });
    }
  }
  return mutations;
}

export function crisprOnTargetScore(target: CRISPRTarget): string {
  if (target.efficiency >= 70 && target.offTargetScore <= 20) return 'excellent';
  if (target.efficiency >= 50 && target.offTargetScore <= 40) return 'good';
  if (target.efficiency >= 30) return 'fair';
  return 'poor';
}
