/**
 * DNASequencerPanel.tsx — Interactive DNA Sequencing Lab
 *
 * Visual DNA strand with base pair coloring, codon wheel,
 * protein synthesis chain, GC content meter, CRISPR target designer,
 * and mutation detector — all powered by dnaSequencing.ts engine.
 */

import React, { useState, useMemo } from 'react';
import {
  complement,
  complementStrand,
  transcribe,
  reverseComplement,
  translateCodon,
  translateMRNA,
  gcContent,
  sequenceLength,
  findMotif,
  detectMutations,
  crisprOnTargetScore,
  type CRISPRTarget,
  type Nucleotide,
} from '@/lib/dnaSequencing';

// ─── Styles ──────────────────────────────────────────────────────

const BASE_COLORS: Record<string, string> = {
  A: '#ff6b6b',
  T: '#4ecdc4',
  G: '#ffe66d',
  C: '#7b68ee',
  U: '#ff9f43',
};

const styles = {
  panel: {
    background: 'linear-gradient(180deg, #0a0f1a 0%, #0d1926 50%, #0a1520 100%)',
    borderRadius: '12px',
    padding: '20px',
    color: '#d0e8f0',
    fontFamily: "'Inter', sans-serif",
    minHeight: '600px',
    maxWidth: '720px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid rgba(78, 205, 196, 0.15)',
    paddingBottom: '12px',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #4ecdc4, #7b68ee)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: '18px',
    padding: '14px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    border: '1px solid rgba(78, 205, 196, 0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#4ecdc4',
    marginBottom: '10px',
  } as React.CSSProperties,
  sequenceInput: {
    width: '100%',
    padding: '10px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(78, 205, 196, 0.2)',
    borderRadius: '6px',
    color: '#e0f0ff',
    fontFamily: "'Fira Code', 'Courier New', monospace",
    fontSize: '14px',
    letterSpacing: '2px',
    resize: 'none' as const,
    outline: 'none',
  } as React.CSSProperties,
  strandRow: {
    display: 'flex',
    gap: '2px',
    flexWrap: 'wrap' as const,
    marginBottom: '6px',
    fontFamily: "'Fira Code', monospace",
    fontSize: '16px',
    fontWeight: 700,
  } as React.CSSProperties,
  base: (color: string) =>
    ({
      display: 'inline-flex',
      width: '22px',
      height: '28px',
      alignItems: 'center',
      justifyContent: 'center',
      background: `${color}22`,
      borderBottom: `3px solid ${color}`,
      borderRadius: '3px 3px 0 0',
      color,
      fontSize: '14px',
      fontWeight: 700,
      transition: 'transform 0.15s, background 0.15s',
    }) as React.CSSProperties,
  complementBase: (color: string) =>
    ({
      display: 'inline-flex',
      width: '22px',
      height: '28px',
      alignItems: 'center',
      justifyContent: 'center',
      background: `${color}15`,
      borderTop: `3px solid ${color}`,
      borderRadius: '0 0 3px 3px',
      color: `${color}99`,
      fontSize: '14px',
      fontWeight: 500,
    }) as React.CSSProperties,
  gcBar: {
    height: '10px',
    background: 'rgba(255, 255, 255, 0.06)',
    borderRadius: '5px',
    overflow: 'hidden',
    marginTop: '6px',
  } as React.CSSProperties,
  gcFill: (gc: number) =>
    ({
      height: '100%',
      width: `${gc * 100}%`,
      background:
        gc > 0.6
          ? 'linear-gradient(90deg, #ffe66d, #ff6b6b)'
          : 'linear-gradient(90deg, #4ecdc4, #7b68ee)',
      borderRadius: '5px',
      transition: 'width 0.3s ease',
    }) as React.CSSProperties,
  proteinChain: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap' as const,
    marginTop: '8px',
  } as React.CSSProperties,
  aminoAcid: {
    padding: '4px 8px',
    background: 'rgba(123, 104, 238, 0.15)',
    border: '1px solid rgba(123, 104, 238, 0.3)',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#c4b5fd',
  } as React.CSSProperties,
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    marginTop: '10px',
  } as React.CSSProperties,
  statCard: (color: string) =>
    ({
      padding: '10px',
      background: `${color}10`,
      border: `1px solid ${color}30`,
      borderRadius: '6px',
      textAlign: 'center' as const,
    }) as React.CSSProperties,
  statValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#fff',
  } as React.CSSProperties,
  statLabel: {
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    color: '#8899aa',
    marginTop: '2px',
  } as React.CSSProperties,
  motifTag: {
    display: 'inline-block',
    padding: '2px 8px',
    background: 'rgba(255, 230, 109, 0.15)',
    border: '1px solid rgba(255, 230, 109, 0.3)',
    borderRadius: '10px',
    fontSize: '11px',
    color: '#ffe66d',
    marginRight: '4px',
    marginBottom: '4px',
  } as React.CSSProperties,
  crisprScore: (score: string) =>
    ({
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '10px',
      fontSize: '12px',
      fontWeight: 700,
      background:
        score === 'excellent'
          ? 'rgba(78, 205, 196, 0.2)'
          : score === 'good'
            ? 'rgba(255, 230, 109, 0.2)'
            : score === 'fair'
              ? 'rgba(255, 159, 67, 0.2)'
              : 'rgba(255, 107, 107, 0.2)',
      color:
        score === 'excellent'
          ? '#4ecdc4'
          : score === 'good'
            ? '#ffe66d'
            : score === 'fair'
              ? '#ff9f43'
              : '#ff6b6b',
    }) as React.CSSProperties,
  button: {
    padding: '6px 14px',
    background: 'linear-gradient(135deg, #4ecdc4, #7b68ee)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  } as React.CSSProperties,
} as const;

// ─── Component ───────────────────────────────────────────────────

export function DNASequencerPanel() {
  const [dna, setDna] = useState('ATGGGCAAATTTGCCTAG');
  const [motifSearch, setMotifSearch] = useState('ATG');
  const [mutatedDna, setMutatedDna] = useState('ATGGGCAAATTTGCCTAG');

  const validDna = dna.replace(/[^ATGC]/gi, '').toUpperCase();
  const comp = useMemo(() => complementStrand(validDna), [validDna]);
  const mrna = useMemo(() => transcribe(validDna), [validDna]);
  const revComp = useMemo(() => reverseComplement(validDna), [validDna]);
  const protein = useMemo(() => translateMRNA(mrna), [mrna]);
  const gc = useMemo(() => gcContent(validDna), [validDna]);
  const motifPositions = useMemo(
    () => findMotif(validDna, motifSearch.toUpperCase()),
    [validDna, motifSearch]
  );
  const mutations = useMemo(
    () => detectMutations(validDna, mutatedDna.toUpperCase()),
    [validDna, mutatedDna]
  );

  const crisprTarget: CRISPRTarget = {
    guideRNA: validDna.substring(0, 20).replace(/T/g, 'U'),
    pamSite: 'NGG',
    targetGene: 'Custom',
    cutPosition: 17,
    offTargetScore: Math.round(gc * 30),
    efficiency: Math.round((1 - gc * 0.3) * 100),
  };
  const crisprResult = crisprOnTargetScore(crisprTarget);

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>🧬 DNA Sequencing Lab</span>
        <span style={{ fontSize: '12px', color: '#4ecdc4' }}>{sequenceLength(validDna)} bp</span>
      </div>

      {/* DNA Input */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>📝 DNA Sequence (5' → 3')</div>
        <textarea
          style={styles.sequenceInput}
          rows={2}
          value={dna}
          onChange={(e) => {
            setDna(e.target.value);
            setMutatedDna(e.target.value);
          }}
          placeholder="Enter DNA sequence (ATGC only)..."
        />
      </div>

      {/* Double Helix Visualization */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>🔬 Double Helix</div>
        <div style={{ fontSize: '10px', color: '#8899aa', marginBottom: '4px' }}>
          5' Sense Strand
        </div>
        <div style={styles.strandRow}>
          {validDna.split('').map((b, i) => (
            <div key={`s-${i}`} style={styles.base(BASE_COLORS[b] || '#999')}>
              {b}
            </div>
          ))}
        </div>
        <div style={styles.strandRow}>
          {comp.split('').map((b, i) => (
            <div key={`c-${i}`} style={styles.complementBase(BASE_COLORS[b] || '#999')}>
              {b}
            </div>
          ))}
        </div>
        <div style={{ fontSize: '10px', color: '#8899aa', marginTop: '2px' }}>
          3' Complement Strand
        </div>
      </div>

      {/* Stats Grid */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>📊 Sequence Analysis</div>
        <div style={styles.statsGrid}>
          <div style={styles.statCard('#4ecdc4')}>
            <div style={styles.statValue}>{(gc * 100).toFixed(1)}%</div>
            <div style={styles.statLabel}>GC Content</div>
          </div>
          <div style={styles.statCard('#7b68ee')}>
            <div style={styles.statValue}>{protein.length}</div>
            <div style={styles.statLabel}>Amino Acids</div>
          </div>
          <div style={styles.statCard('#ff6b6b')}>
            <div style={styles.statValue}>{mutations.length}</div>
            <div style={styles.statLabel}>Mutations</div>
          </div>
        </div>
        <div style={{ marginTop: '8px' }}>
          <span style={{ fontSize: '11px', color: '#8899aa' }}>GC Content</span>
          <div style={styles.gcBar}>
            <div style={styles.gcFill(gc)} />
          </div>
        </div>
      </div>

      {/* mRNA & Protein Synthesis */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>🧫 Protein Synthesis</div>
        <div style={{ fontSize: '11px', color: '#8899aa', marginBottom: '4px' }}>
          mRNA:{' '}
          <span style={{ color: '#ff9f43', fontFamily: 'monospace' }}>
            {mrna.substring(0, 40)}
            {mrna.length > 40 ? '...' : ''}
          </span>
        </div>
        <div style={styles.proteinChain}>
          {protein.map((aa, i) => (
            <div key={i} style={styles.aminoAcid}>
              {i === 0 ? '▶ ' : ''}
              {aa}
            </div>
          ))}
          {protein.length === 0 && (
            <span style={{ fontSize: '12px', color: '#667' }}>
              No ORF found (needs AUG start codon)
            </span>
          )}
        </div>
      </div>

      {/* Motif Finder */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>🔍 Motif Search</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            style={{ ...styles.sequenceInput, width: '120px', fontSize: '13px' }}
            value={motifSearch}
            onChange={(e) => setMotifSearch(e.target.value)}
            placeholder="ATG"
          />
          <span style={{ fontSize: '12px', color: '#4ecdc4', alignSelf: 'center' }}>
            {motifPositions.length} match{motifPositions.length !== 1 ? 'es' : ''}
          </span>
        </div>
        <div>
          {motifPositions.map((pos) => (
            <span key={pos} style={styles.motifTag}>
              pos {pos}
            </span>
          ))}
        </div>
      </div>

      {/* CRISPR Designer */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>✂️ CRISPR Guide RNA</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#8899aa' }}>
              Guide:{' '}
              <span style={{ color: '#ff9f43', fontFamily: 'monospace' }}>
                {crisprTarget.guideRNA.substring(0, 20)}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#8899aa', marginTop: '4px' }}>
              PAM: <span style={{ color: '#ffe66d' }}>{crisprTarget.pamSite}</span> | Cut: pos{' '}
              {crisprTarget.cutPosition}
            </div>
          </div>
          <div>
            <div style={styles.crisprScore(crisprResult)}>{crisprResult.toUpperCase()}</div>
            <div
              style={{ fontSize: '10px', color: '#8899aa', textAlign: 'center', marginTop: '4px' }}
            >
              Eff: {crisprTarget.efficiency}% | Off: {crisprTarget.offTargetScore}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DNASequencerPanel;
