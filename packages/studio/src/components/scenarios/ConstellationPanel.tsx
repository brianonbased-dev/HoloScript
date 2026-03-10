/**
 * ConstellationPanel.tsx — Constellation Storyteller
 * Powered by constellationStory.ts
 */
import React, { useState, useMemo } from 'react';
import {
  type Star,
  type ConstellationDef as Constellation,
} from '@/lib/constellationStory';

export function constellationsByMonth(constellations: any[], month: number) {
  // Simple logic: visible if bestMonth is within +/- 2 months
  return constellations.filter((c) => {
    const diff = Math.abs(c.bestMonth - month);
    return diff <= 2 || diff >= 10;
  });
}

const DEMO_CONSTELLATIONS: Constellation[] = [
  {
    id: 'ori',
    name: 'Orion',
    mythology: 'The mighty hunter from Greek myth',
    season: 'winter',
    bestMonth: 1,
    stars: [
      {
        id: 's1',
        name: 'Betelgeuse',
        magnitude: 0.42,
        rightAscension: 5.92,
        declination: 7.41,
        constellation: 'Orion',
        spectralClass: 'M',
        distanceLy: 700,
      },
      {
        id: 's2',
        name: 'Rigel',
        magnitude: 0.12,
        rightAscension: 5.24,
        declination: -8.2,
        constellation: 'Orion',
        spectralClass: 'B',
        distanceLy: 860,
      },
      {
        id: 's3',
        name: 'Bellatrix',
        magnitude: 1.64,
        rightAscension: 5.42,
        declination: 6.35,
        constellation: 'Orion',
        spectralClass: 'B',
        distanceLy: 250,
      },
    ],
    lines: [
      ['s1', 's3'],
      ['s2', 's3'],
    ],
    culturalSignificance: 10,
  },
  {
    id: 'uma',
    name: 'Ursa Major',
    mythology: 'The Great Bear, mother of Arcas',
    season: 'spring',
    bestMonth: 4,
    stars: [
      {
        id: 's4',
        name: 'Dubhe',
        magnitude: 1.79,
        rightAscension: 11.06,
        declination: 61.75,
        constellation: 'Ursa Major',
        spectralClass: 'K',
        distanceLy: 124,
      },
      {
        id: 's5',
        name: 'Merak',
        magnitude: 2.37,
        rightAscension: 11.03,
        declination: 56.38,
        constellation: 'Ursa Major',
        spectralClass: 'A',
        distanceLy: 79,
      },
    ],
    lines: [['s4', 's5']],
    culturalSignificance: 9,
  },
  {
    id: 'sco',
    name: 'Scorpius',
    mythology: 'The scorpion that slew Orion',
    season: 'summer',
    bestMonth: 7,
    stars: [
      {
        id: 's6',
        name: 'Antares',
        magnitude: 0.96,
        rightAscension: 16.49,
        declination: -26.43,
        constellation: 'Scorpius',
        spectralClass: 'M',
        distanceLy: 550,
      },
    ],
    lines: [],
    culturalSignificance: 8,
  },
];

const SPECTRAL_COLORS: Record<string, string> = {
  O: '#9bb0ff',
  B: '#aabfff',
  A: '#cad7ff',
  F: '#f8f7ff',
  G: '#fff4ea',
  K: '#ffd2a1',
  M: '#ffcc6f',
};

const s = {
  panel: {
    background: 'linear-gradient(180deg, #050510 0%, #0a0a1e 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#d0d0f0',
    fontFamily: "'Inter', sans-serif",
    minHeight: 600,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(99,102,241,0.15)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #6366f1, #fbbf24)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(99,102,241,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#6366f1',
    marginBottom: 10,
  } as React.CSSProperties,
};

export function ConstellationPanel() {
  const [selected, setSelected] = useState('ori');
  const [month, setMonth] = useState(1);
  const constellation = DEMO_CONSTELLATIONS.find((c) => c.id === selected)!;
  const visible = useMemo(() => constellationsByMonth(DEMO_CONSTELLATIONS, month), [month]);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>⭐ Constellation Storyteller</span>
        <span style={{ fontSize: 12, color: '#6366f1' }}>
          {DEMO_CONSTELLATIONS.length} constellations
        </span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🌌 Star Map</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {DEMO_CONSTELLATIONS.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              style={{
                padding: '6px 12px',
                background: c.id === selected ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${c.id === selected ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 6,
                color: c.id === selected ? '#a5b4fc' : '#667',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div style={{ padding: 12, background: 'rgba(99,102,241,0.05)', borderRadius: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#a5b4fc', marginBottom: 4 }}>
            {constellation.name}
          </div>
          <div style={{ fontSize: 12, color: '#889', fontStyle: 'italic', marginBottom: 8 }}>
            {constellation.mythology}
          </div>
          <div style={{ fontSize: 11, color: '#667' }}>
            Best: {constellation.season} · Month {constellation.bestMonth} · Significance:{' '}
            {constellation.culturalSignificance}/10
          </div>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>✨ Stars in {constellation.name}</div>
        {constellation.stars.map((star) => (
          <div
            key={star.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 6,
              marginBottom: 4,
              fontSize: 12,
            }}
          >
            <span style={{ fontSize: 16, color: SPECTRAL_COLORS[star.spectralClass] || '#fff' }}>
              ★
            </span>
            <span style={{ fontWeight: 600, width: 80 }}>{star.name}</span>
            <span style={{ color: '#889' }}>mag {star.magnitude.toFixed(2)}</span>
            <span
              style={{ color: SPECTRAL_COLORS[star.spectralClass], fontSize: 11, fontWeight: 600 }}
            >
              {star.spectralClass}
            </span>
            <span style={{ flex: 1, textAlign: 'right', color: '#667' }}>{star.distanceLy} ly</span>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📅 Visible by Month</div>
        <input
          type="range"
          min={1}
          max={12}
          value={month}
          onChange={(e) => setMonth(+e.target.value)}
          style={{ width: '100%', accentColor: '#6366f1', marginBottom: 6 }}
        />
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          Month:{' '}
          <span style={{ color: '#a5b4fc', fontWeight: 700 }}>
            {
              ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
                month - 1
              ]
            }
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {visible.map((c) => (
            <span
              key={c.id}
              style={{
                padding: '3px 8px',
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 8,
                fontSize: 11,
                color: '#a5b4fc',
              }}
            >
              {c.name}
            </span>
          ))}
          {visible.length === 0 && (
            <span style={{ color: '#667', fontSize: 12 }}>No constellations visible</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConstellationPanel;
