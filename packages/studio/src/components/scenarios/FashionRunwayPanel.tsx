/**
 * FashionRunwayPanel.tsx — Fashion Runway Choreography
 * Powered by fashionRunway.ts
 */
import React, { useState, useMemo } from 'react';
import { walkDuration, totalShowDuration, modelUtilization, outfitChangeTime, runwayTiming, type RunwayShow, type Model, type SegmentType } from '@/lib/fashionRunway';

const SEG_COLORS: Record<SegmentType, string> = { opening: '#ec4899', collection: '#a855f7', featured: '#f59e0b', finale: '#ef4444', intermission: '#6b7280' };

const s = {
  panel: { background: 'linear-gradient(180deg, #1a0f18 0%, #201520 100%)', borderRadius: 12, padding: 20, color: '#f0d0e8', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(236,72,153,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #ec4899, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(236,72,153,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#ec4899', marginBottom: 10 } as React.CSSProperties,
};

export function FashionRunwayPanel() {
  const models: Model[] = [
    { id: 'm1', name: 'Aria Chen', height: 180, measurements: '86-62-90', looks: 3, walkSpeedMs: 1.2 },
    { id: 'm2', name: 'Zara Osei', height: 178, measurements: '84-60-88', looks: 2, walkSpeedMs: 1.1 },
    { id: 'm3', name: 'Luna Rivera', height: 176, measurements: '82-61-89', looks: 3, walkSpeedMs: 1.3 },
    { id: 'm4', name: 'Mika Tanaka', height: 175, measurements: '80-58-86', looks: 2, walkSpeedMs: 1.15 },
  ];

  const show: RunwayShow = { id: 'show1', name: 'Midnight Bloom', designer: 'House of Nova', season: 'SS26', venue: 'Grand Pavilion',
    segments: [
      { id: 'seg1', name: 'Dawn', type: 'opening', models: ['m1', 'm3'], looks: 4, musicBpm: 110, lightingMood: 'dramatic', durationMin: 5 },
      { id: 'seg2', name: 'Flourish', type: 'collection', models: ['m1', 'm2', 'm3', 'm4'], looks: 8, musicBpm: 120, lightingMood: 'warm', durationMin: 12 },
      { id: 'seg3', name: 'Statement', type: 'featured', models: ['m1'], looks: 2, musicBpm: 90, lightingMood: 'spotlight', durationMin: 4 },
      { id: 'seg4', name: 'Finale', type: 'finale', models: ['m1', 'm2', 'm3', 'm4'], looks: 4, musicBpm: 130, lightingMood: 'strobe', durationMin: 6 },
    ],
    runwayLengthM: 25, models, totalLooks: 18 };

  const totalDur = useMemo(() => totalShowDuration(show), []);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>👗 {show.name}</span>
        <span style={{ fontSize: 12, color: '#ec4899' }}>{show.designer} · {show.season}</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🎭 Segments</div>
        {show.segments.map(seg => (
          <div key={seg.id} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 4, borderLeft: `3px solid ${SEG_COLORS[seg.type]}`, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>{seg.name}</span>
              <span style={{ color: SEG_COLORS[seg.type], fontSize: 11, textTransform: 'uppercase' }}>{seg.type}</span>
            </div>
            <div style={{ color: '#889', fontSize: 11, marginTop: 2 }}>
              {seg.looks} looks · {seg.durationMin}min · {seg.musicBpm} BPM · {seg.lightingMood}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 12, color: '#889', marginTop: 6 }}>
          Total: <span style={{ color: '#ec4899', fontWeight: 700 }}>{totalDur}min</span> · {show.totalLooks} looks · {show.runwayLengthM}m runway
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>👤 Models</div>
        {models.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
            <span style={{ fontWeight: 600, width: 100 }}>{m.name}</span>
            <span style={{ color: '#889' }}>{m.height}cm</span>
            <span style={{ color: '#889' }}>{m.measurements}</span>
            <span style={{ flex: 1, textAlign: 'right', color: '#a855f7' }}>{m.looks} looks</span>
            <span style={{ color: '#889' }}>{walkDuration(show.runwayLengthM, m.walkSpeedMs).toFixed(1)}s walk</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FashionRunwayPanel;
