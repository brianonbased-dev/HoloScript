'use client';

/**
 * TraitInspector — Visual trait details + culture norm editor
 */

import React, { useState } from 'react';
import { useTraitInspector, type TraitInfo } from '../../hooks/useTraitInspector';
import type { CulturalNorm, NormCategory } from '@holoscript/core';

// ═══════════════════════════════════════════════════════════════════

interface TraitInspectorProps {
  /** Initial selected trait */
  initialTrait?: string;
  /** Show culture section */
  showCulture?: boolean;
}

const DANGER_COLORS: Record<string, string> = {
  safe: '#10b981', low: '#22c55e', medium: '#f59e0b', high: '#f97316', extreme: '#ef4444',
};

const CATEGORY_ICONS: Record<NormCategory, string> = {
  cooperation: '🤝', communication: '💬', territory: '🏠', exchange: '💰',
  authority: '👑', safety: '🛡️', ritual: '🎭', identity: '🏷️',
};

export function TraitInspector({ initialTrait, showCulture = true }: TraitInspectorProps) {
  const { traits, cultureTraits, norms, selectedTrait, selectTrait, normsByCategory, criticalMass, normCategories } = useTraitInspector();
  const [tab, setTab] = useState<'traits' | 'norms'>('traits');
  const [filter, setFilter] = useState('');
  const [selectedNormCat, setSelectedNormCat] = useState<NormCategory>('safety');
  const [population, setPopulation] = useState(100);

  const filteredTraits = traits.filter(t =>
    t.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>🧬 Trait Inspector</div>

      {/* Tabs */}
      {showCulture && (
        <div style={styles.tabs}>
          <button style={tab === 'traits' ? styles.tabActive : styles.tab} onClick={() => setTab('traits')}>
            Traits ({traits.length})
          </button>
          <button style={tab === 'norms' ? styles.tabActive : styles.tab} onClick={() => setTab('norms')}>
            Culture Norms ({norms.length})
          </button>
        </div>
      )}

      {tab === 'traits' ? (
        <>
          {/* Search */}
          <input
            style={styles.search}
            placeholder="Filter traits..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />

          {/* Culture traits highlighted */}
          {cultureTraits.length > 0 && !filter && (
            <div style={styles.cultureSection}>
              <div style={styles.sectionTitle}>🌐 Culture Traits</div>
              {cultureTraits.map(t => (
                <TraitRow key={t.name} trait={t} selected={selectedTrait?.name === t.name} onSelect={selectTrait} />
              ))}
            </div>
          )}

          {/* All traits */}
          <div style={styles.traitList}>
            {filteredTraits.map(t => (
              <TraitRow key={t.name} trait={t} selected={selectedTrait?.name === t.name} onSelect={selectTrait} />
            ))}
          </div>

          {/* Selected detail */}
          {selectedTrait && (
            <div style={styles.detail}>
              <div style={styles.detailName}>{selectedTrait.name}</div>
              <div style={{ ...styles.detailDanger, color: DANGER_COLORS[selectedTrait.dangerLevel] }}>
                {selectedTrait.dangerLevel.toUpperCase()}
              </div>
              <div style={styles.detailEffects}>
                {selectedTrait.effects.length > 0
                  ? selectedTrait.effects.map(e => <span key={e} style={styles.effectTag}>{e}</span>)
                  : <span style={styles.pureTag}>PURE (no effects)</span>
                }
              </div>
            </div>
          )}
        </>
      ) : (
        /* Norms Tab */
        <>
          <div style={styles.normCategories}>
            {normCategories.map(cat => (
              <button
                key={cat}
                style={selectedNormCat === cat ? styles.catActive : styles.cat}
                onClick={() => setSelectedNormCat(cat)}
              >
                {CATEGORY_ICONS[cat]} {cat}
              </button>
            ))}
          </div>

          <div style={styles.normList}>
            {normsByCategory(selectedNormCat).map(norm => (
              <NormCard key={norm.id} norm={norm} population={population} criticalMass={criticalMass} />
            ))}
            {normsByCategory(selectedNormCat).length === 0 && (
              <div style={styles.empty}>No norms in this category</div>
            )}
          </div>

          <div style={styles.populationSlider}>
            <label style={styles.sliderLabel}>Population: {population}</label>
            <input
              type="range" min={10} max={1000} value={population}
              onChange={e => setPopulation(parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════

function TraitRow({ trait, selected, onSelect }: { trait: TraitInfo; selected: boolean; onSelect: (name: string) => void }) {
  return (
    <div
      style={{ ...styles.traitRow, background: selected ? '#3030aa30' : 'transparent', borderColor: selected ? '#4040aa' : 'transparent' }}
      onClick={() => onSelect(trait.name)}
    >
      <span style={styles.traitName}>
        {trait.isCulture && '🌐 '}{trait.name}
      </span>
      <span style={{ ...styles.traitDanger, color: DANGER_COLORS[trait.dangerLevel] || '#888' }}>
        {trait.dangerLevel}
      </span>
      <span style={styles.traitEffectCount}>{trait.effects.length} effects</span>
    </div>
  );
}

function NormCard({ norm, population, criticalMass }: { norm: CulturalNorm; population: number; criticalMass: (id: string, pop: number) => number }) {
  const mass = criticalMass(norm.id, population);
  return (
    <div style={styles.normCard}>
      <div style={styles.normHeader}>
        <span style={styles.normName}>{norm.name}</span>
        <span style={{ ...styles.normEnforcement, color: norm.enforcement === 'hard' ? '#ef4444' : norm.enforcement === 'soft' ? '#f59e0b' : '#10b981' }}>
          {norm.enforcement}
        </span>
      </div>
      <div style={styles.normDesc}>{norm.description}</div>
      <div style={styles.normMeta}>
        <span>Scope: {norm.scope}</span>
        <span>Strength: {norm.strength}</span>
        <span>Critical mass: {mass}/{population} agents</span>
      </div>
      {norm.forbiddenEffects && (
        <div style={styles.normForbidden}>
          Forbidden: {norm.forbiddenEffects.join(', ')}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 12, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, color: '#e0e0e0', background: '#1a1a2e', borderRadius: 8, border: '1px solid #2a2a4a' },
  header: { fontWeight: 700, fontSize: 14, marginBottom: 12 },
  tabs: { display: 'flex', gap: 4, marginBottom: 8 },
  tab: { padding: '4px 12px', background: '#2a2a4a', border: 'none', borderRadius: 4, color: '#aaa', cursor: 'pointer', fontSize: 12 },
  tabActive: { padding: '4px 12px', background: '#4040aa', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  search: { width: '100%', padding: '6px 10px', background: '#1e1e3a', border: '1px solid #3a3a5a', borderRadius: 6, color: '#e0e0e0', fontSize: 12, marginBottom: 8, outline: 'none', boxSizing: 'border-box' as const },
  cultureSection: { marginBottom: 8, padding: 8, background: '#1e1e3a', borderRadius: 6, border: '1px solid #4040aa30' },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#a0a0ff', marginBottom: 6 },
  traitList: { maxHeight: 250, overflowY: 'auto' as const },
  traitRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid transparent', marginBottom: 2 },
  traitName: { flex: 1, fontFamily: 'monospace', fontSize: 12 },
  traitDanger: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const },
  traitEffectCount: { fontSize: 10, color: '#888' },
  detail: { marginTop: 8, padding: 10, background: '#1e1e3a', borderRadius: 6, border: '1px solid #3a3a5a' },
  detailName: { fontWeight: 700, fontSize: 14, fontFamily: 'monospace', marginBottom: 4 },
  detailDanger: { fontSize: 12, fontWeight: 700, marginBottom: 8 },
  detailEffects: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
  effectTag: { padding: '2px 6px', background: '#2a2a5a', borderRadius: 3, fontSize: 11, fontFamily: 'monospace', color: '#c0c0ff' },
  pureTag: { padding: '2px 8px', background: '#10b98120', borderRadius: 3, fontSize: 11, color: '#10b981' },
  normCategories: { display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginBottom: 8 },
  cat: { padding: '2px 8px', background: '#2a2a4a', border: 'none', borderRadius: 4, color: '#aaa', cursor: 'pointer', fontSize: 11 },
  catActive: { padding: '2px 8px', background: '#4040aa', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 },
  normList: { display: 'flex', flexDirection: 'column' as const, gap: 8, maxHeight: 300, overflowY: 'auto' as const },
  normCard: { padding: 10, background: '#1e1e3a', borderRadius: 6, border: '1px solid #2a2a5a' },
  normHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  normName: { fontWeight: 600, fontSize: 13 },
  normEnforcement: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const },
  normDesc: { fontSize: 12, color: '#aaa', marginBottom: 6 },
  normMeta: { display: 'flex', gap: 12, fontSize: 10, color: '#888', marginBottom: 4 },
  normForbidden: { fontSize: 10, color: '#ef4444', fontFamily: 'monospace' },
  populationSlider: { marginTop: 12, padding: 8, background: '#1e1e3a', borderRadius: 6 },
  sliderLabel: { fontSize: 11, color: '#aaa', marginBottom: 4, display: 'block' },
  empty: { color: '#666', fontStyle: 'italic', padding: '16px 0', textAlign: 'center' },
};
