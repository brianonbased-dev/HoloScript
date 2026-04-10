/**
 * BrainMapperPanel.tsx — Neuroscience Brain Mapping Dashboard
 *
 * Brain region explorer, EEG band power analyzer, cognitive state detector.
 * Powered by neuroscienceViz.ts engine.
 */

import React, { useState, useMemo } from 'react';
import {
  dominantBand,
  totalPower,
  relativePower,
  detectCognitiveState,
  getRegionById,
  EEG_BANDS,
  BRAIN_REGIONS,
  type BandPower,
  type EEGBand,
} from '@/lib/neuroscienceViz';

const BAND_COLORS: Record<EEGBand, string> = {
  delta: '#6366f1',
  theta: '#8b5cf6',
  alpha: '#06b6d4',
  beta: '#f59e0b',
  gamma: '#ef4444',
};
const STATE_EMOJIS: Record<string, string> = {
  'deep-sleep': '😴',
  'light-sleep': '💤',
  relaxed: '😌',
  focused: '🎯',
  stressed: '😰',
  flow: '🧠',
  meditative: '🧘',
};

const s = {
  panel: {
    background: 'linear-gradient(180deg, #0d0a1a 0%, #150e28 100%)',
    borderRadius: '12px',
    padding: '20px',
    color: '#d0c8f0',
    fontFamily: "'Inter', sans-serif",
    minHeight: '600px',
    maxWidth: '720px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid rgba(139,92,246,0.15)',
    paddingBottom: '12px',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: '18px',
    padding: '14px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '8px',
    border: '1px solid rgba(139,92,246,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#8b5cf6',
    marginBottom: '10px',
  } as React.CSSProperties,
  bandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  } as React.CSSProperties,
  bandBar: {
    flex: 1,
    height: '14px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '7px',
    overflow: 'hidden',
  } as React.CSSProperties,
  stateCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px',
    background: 'rgba(139,92,246,0.08)',
    border: '1px solid rgba(139,92,246,0.2)',
    borderRadius: '10px',
    marginTop: '10px',
  } as React.CSSProperties,
  regionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '6px',
  } as React.CSSProperties,
  functionTag: {
    display: 'inline-block',
    padding: '2px 6px',
    background: 'rgba(6,182,212,0.1)',
    border: '1px solid rgba(6,182,212,0.2)',
    borderRadius: '8px',
    fontSize: '10px',
    color: '#06b6d4',
    marginRight: '3px',
    marginBottom: '3px',
  } as React.CSSProperties,
  detailPanel: {
    padding: '12px',
    background: 'rgba(6,182,212,0.05)',
    border: '1px solid rgba(6,182,212,0.15)',
    borderRadius: '8px',
    marginTop: '10px',
  } as React.CSSProperties,
};

export function BrainMapperPanel() {
  const [power, setPower] = useState<BandPower>({
    delta: 10,
    theta: 15,
    alpha: 35,
    beta: 25,
    gamma: 15,
  });
  const [selectedRegion, setSelectedRegion] = useState('prefrontal');
  const total = useMemo(() => totalPower(power), [power]);
  const dominant = useMemo(() => dominantBand(power), [power]);
  const state = useMemo(() => detectCognitiveState(power), [power]);
  const region = useMemo(() => getRegionById(selectedRegion), [selectedRegion]);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🧠 Neuroscience Lab</span>
        <span style={{ fontSize: '12px', color: '#8b5cf6' }}>{BRAIN_REGIONS.length} regions</span>
      </div>

      {/* EEG Band Power */}
      <div style={s.section}>
        <div style={s.sectionTitle}>📊 EEG Band Power</div>
        {(Object.keys(EEG_BANDS) as EEGBand[]).map((band) => (
          <div key={band}>
            <div style={s.bandRow}>
              <span style={{ width: 60, fontSize: 12, fontWeight: 600, color: BAND_COLORS[band] }}>
                {band.charAt(0).toUpperCase() + band.slice(1)}
              </span>
              <div style={s.bandBar}>
                <div
                  style={{
                    height: '100%',
                    width: `${total > 0 ? (power[band] / total) * 100 : 0}%`,
                    background: `linear-gradient(90deg, ${BAND_COLORS[band]}, ${BAND_COLORS[band]}88)`,
                    borderRadius: 7,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <span style={{ width: 40, textAlign: 'right', fontSize: 12, color: '#889' }}>
                {total > 0 ? (relativePower(power, band) * 100).toFixed(0) : 0}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={power[band]}
              onChange={(e) => setPower((p) => ({ ...p, [band]: +e.target.value }))}
              style={{ width: '100%', marginBottom: 6, accentColor: BAND_COLORS[band] }}
            />
          </div>
        ))}
      </div>

      {/* Cognitive State */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🎯 Detected Cognitive State</div>
        <div style={s.stateCard}>
          <span style={{ fontSize: 36 }}>{STATE_EMOJIS[state] || '❓'}</span>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: BAND_COLORS[dominant] }}>
              {state.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </div>
            <div style={{ fontSize: 12, color: '#889' }}>
              Dominant: {dominant} ({EEG_BANDS[dominant].minHz}–{EEG_BANDS[dominant].maxHz} Hz)
            </div>
          </div>
        </div>
      </div>

      {/* Brain Region Explorer */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🗺️ Brain Region Explorer</div>
        <div style={s.regionGrid}>
          {BRAIN_REGIONS.map((r) => (
            <div
              key={r.id}
              onClick={() => setSelectedRegion(r.id)}
              style={{
                padding: 8,
                background:
                  r.id === selectedRegion ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${r.id === selectedRegion ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 11,
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontWeight: 600, color: '#d0d0ff', marginBottom: 2 }}>{r.name}</div>
              <div style={{ color: '#678' }}>
                {r.region} · {r.hemisphere}
              </div>
            </div>
          ))}
        </div>
        {region && (
          <div style={s.detailPanel}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#06b6d4', marginBottom: 6 }}>
              {region.name}
            </div>
            <div style={{ fontSize: 12, color: '#889', marginBottom: 6 }}>
              {region.region} lobe · {region.hemisphere}
              {region.brodmannArea ? ` · BA ${region.brodmannArea}` : ''}
            </div>
            <div>
              {region.functions.map((fn) => (
                <span key={fn} style={s.functionTag}>
                  {fn}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BrainMapperPanel;
