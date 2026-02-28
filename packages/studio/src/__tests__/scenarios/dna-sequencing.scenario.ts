/**
 * dna-sequencing.scenario.ts — LIVING-SPEC: DNA Sequencing Lab
 *
 * Persona: Dr. Nakamura — molecular biologist who sequences DNA,
 * translates codons, analyzes mutations, and designs CRISPR guides.
 */

import { describe, it, expect } from 'vitest';
import {
  complement, complementStrand, transcribe, reverseComplement,
  translateCodon, translateMRNA,
  gcContent, sequenceLength, findMotif, detectMutations,
  crisprOnTargetScore,
  type CRISPRTarget,
} from '@/lib/dnaSequencing';

describe('Scenario: DNA — Base Pairing', () => {
  it('A pairs with T', () => {
    expect(complement('A')).toBe('T');
  });

  it('G pairs with C', () => {
    expect(complement('G')).toBe('C');
  });

  it('complementStrand(ATGC) = TACG', () => {
    expect(complementStrand('ATGC')).toBe('TACG');
  });

  it('reverseComplement(ATGC) = GCAT', () => {
    expect(reverseComplement('ATGC')).toBe('GCAT');
  });

  it('transcribe(ATGC) → mRNA = UACG', () => {
    expect(transcribe('ATGC')).toBe('UACG');
  });
});

describe('Scenario: DNA — Codon Translation', () => {
  it('AUG = Met (start codon)', () => {
    expect(translateCodon('AUG')).toBe('Met');
  });

  it('UAA = STOP', () => {
    expect(translateCodon('UAA')).toBe('STOP');
  });

  it('UUU = Phe', () => {
    expect(translateCodon('UUU')).toBe('Phe');
  });

  it('translateMRNA produces protein until STOP', () => {
    const protein = translateMRNA('AUGUUUUAAGGG');
    // AUG=Met, UUU=Phe, UAA=STOP → ['Met', 'Phe']
    expect(protein).toEqual(['Met', 'Phe']);
  });

  it('translateMRNA longer sequence', () => {
    const protein = translateMRNA('AUGGGCAAAUAA');
    // AUG=Met, GGC=Gly, AAA=Lys, UAA=STOP
    expect(protein).toEqual(['Met', 'Gly', 'Lys']);
  });
});

describe('Scenario: DNA — Sequence Analysis', () => {
  it('gcContent of ATGC = 50%', () => {
    expect(gcContent('ATGC')).toBe(0.5);
  });

  it('gcContent of AAAA = 0%', () => {
    expect(gcContent('AAAA')).toBe(0);
  });

  it('gcContent of GCGC = 100%', () => {
    expect(gcContent('GCGC')).toBe(1);
  });

  it('sequenceLength counts bases', () => {
    expect(sequenceLength('ATGCGATCGA')).toBe(10);
  });

  it('findMotif locates all occurrences', () => {
    expect(findMotif('ATGATGATG', 'ATG')).toEqual([0, 3, 6]);
  });

  it('findMotif returns empty for no match', () => {
    expect(findMotif('AAAA', 'GGG')).toEqual([]);
  });

  it('detectMutations finds substitutions', () => {
    const muts = detectMutations('ATGCGA', 'ATGCTA');
    expect(muts).toHaveLength(1);
    expect(muts[0].position).toBe(4);
    expect(muts[0].original).toBe('G');
    expect(muts[0].mutated).toBe('T');
  });
});

describe('Scenario: DNA — CRISPR', () => {
  it('crisprOnTargetScore: excellent (high eff, low off-target)', () => {
    const target: CRISPRTarget = { guideRNA: 'ATGCGATCGATCGATCGATC', pamSite: 'NGG', targetGene: 'TP53', cutPosition: 100, offTargetScore: 10, efficiency: 85 };
    expect(crisprOnTargetScore(target)).toBe('excellent');
  });

  it('crisprOnTargetScore: poor (low efficiency)', () => {
    const target: CRISPRTarget = { guideRNA: 'ATGCGATCGATCGATCGATC', pamSite: 'NGG', targetGene: 'BRCA1', cutPosition: 200, offTargetScore: 60, efficiency: 20 };
    expect(crisprOnTargetScore(target)).toBe('poor');
  });

  it.todo('phylogenetic tree — build neighbor-joining tree from aligned sequences');
  it.todo('BLAST search — simulate local alignment score matrix');
});
