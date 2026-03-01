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

// ═══════════════════════════════════════════════════════════════════
// Phylogenetics
// ═══════════════════════════════════════════════════════════════════

export interface PhyloNode {
  id: string;
  label?: string;
  distance: number;
  children: PhyloNode[];
}

/**
 * Computes pairwise Hamming distance between aligned sequences.
 */
export function sequenceDistance(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let mismatches = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) mismatches++;
  }
  return mismatches / len;
}

/**
 * Builds a simplified neighbor-joining tree from aligned sequences.
 * Returns a Newick-like tree structure.
 */
export function neighborJoiningTree(
  labels: string[],
  sequences: string[]
): PhyloNode {
  if (labels.length !== sequences.length || labels.length < 2) {
    return { id: labels[0] ?? 'root', label: labels[0], distance: 0, children: [] };
  }

  // Build distance matrix
  const n = sequences.length;
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = sequenceDistance(sequences[i], sequences[j]);
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }

  // Simple UPGMA-style agglomerative clustering
  type Cluster = { node: PhyloNode; indices: number[] };
  let clusters: Cluster[] = labels.map((label, i) => ({
    node: { id: label, label, distance: 0, children: [] },
    indices: [i],
  }));

  while (clusters.length > 1) {
    // Find closest pair
    let minDist = Infinity;
    let ci = 0, cj = 1;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        let avg = 0, count = 0;
        for (const a of clusters[i].indices) {
          for (const b of clusters[j].indices) {
            avg += dist[a][b];
            count++;
          }
        }
        avg /= count;
        if (avg < minDist) { minDist = avg; ci = i; cj = j; }
      }
    }

    const merged: Cluster = {
      node: {
        id: `${clusters[ci].node.id}+${clusters[cj].node.id}`,
        distance: minDist / 2,
        children: [clusters[ci].node, clusters[cj].node],
      },
      indices: [...clusters[ci].indices, ...clusters[cj].indices],
    };

    clusters = clusters.filter((_, i) => i !== ci && i !== cj);
    clusters.push(merged);
  }

  return clusters[0].node;
}

// ═══════════════════════════════════════════════════════════════════
// BLAST Local Alignment
// ═══════════════════════════════════════════════════════════════════

export interface BlastHit {
  queryStart: number;
  subjectStart: number;
  length: number;
  score: number;
  identity: number;  // 0-1
}

/**
 * Simplified local alignment search (Smith-Waterman style).
 * Finds highest-scoring local alignment between query and subject.
 */
export function blastLocalAlignment(
  query: string,
  subject: string,
  matchScore: number = 2,
  mismatchPenalty: number = -1,
  gapPenalty: number = -2
): BlastHit {
  const m = query.length;
  const n = subject.length;
  const H: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  let maxScore = 0;
  let maxI = 0, maxJ = 0;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const match = H[i - 1][j - 1] + (query[i - 1] === subject[j - 1] ? matchScore : mismatchPenalty);
      const del = H[i - 1][j] + gapPenalty;
      const ins = H[i][j - 1] + gapPenalty;
      H[i][j] = Math.max(0, match, del, ins);

      if (H[i][j] > maxScore) {
        maxScore = H[i][j];
        maxI = i;
        maxJ = j;
      }
    }
  }

  // Traceback to find alignment length and identity
  let len = 0, matches = 0;
  let i = maxI, j = maxJ;
  while (i > 0 && j > 0 && H[i][j] > 0) {
    if (query[i - 1] === subject[j - 1]) matches++;
    len++;
    i--;
    j--;
  }

  return {
    queryStart: i,
    subjectStart: j,
    length: len,
    score: maxScore,
    identity: len > 0 ? matches / len : 0,
  };
}

