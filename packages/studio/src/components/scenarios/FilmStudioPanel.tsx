/**
 * FilmStudioPanel.tsx — Film Storyboard Planner
 * Powered by filmStoryboard.ts
 */
import React, { useState, useMemo } from 'react';
import { sceneDuration, totalFilmDuration, shotCountBySize, averageShotDuration, threeActBalance, isBalancedStructure, uniqueLocations, type Scene, type StoryboardPanel as SBPanel } from '@/lib/filmStoryboard';

const mkPanel = (o: Partial<SBPanel> = {}): SBPanel => ({ id: 'p', sceneNumber: 1, shotNumber: 1, shotSize: 'medium', cameraMovement: 'static', lighting: 'three-point', description: '', dialogue: '', durationSec: 5, characters: [], location: '', notes: '', ...o });

const DEMO_SCENES: Scene[] = [
  { id: 's1', number: 1, name: 'Opening', act: 'setup', location: 'Cafe', timeOfDay: 'dawn', emotionalTone: 'hopeful', panels: [mkPanel({ id: 'p1', shotSize: 'wide', durationSec: 12, cameraMovement: 'crane' }), mkPanel({ id: 'p2', shotSize: 'medium', durationSec: 8, cameraMovement: 'dolly' }), mkPanel({ id: 'p3', shotSize: 'close-up', durationSec: 5, cameraMovement: 'static' })] },
  { id: 's2', number: 2, name: 'Confrontation', act: 'confrontation', location: 'Office', timeOfDay: 'day', emotionalTone: 'tense', panels: [mkPanel({ id: 'p4', shotSize: 'over-shoulder', durationSec: 15, cameraMovement: 'handheld' }), mkPanel({ id: 'p5', shotSize: 'close-up', durationSec: 6, cameraMovement: 'static' }), mkPanel({ id: 'p6', shotSize: 'wide', durationSec: 20, cameraMovement: 'steadicam' }), mkPanel({ id: 'p7', shotSize: 'medium', durationSec: 10, cameraMovement: 'dolly' })] },
  { id: 's3', number: 3, name: 'Resolution', act: 'resolution', location: 'Rooftop', timeOfDay: 'dusk', emotionalTone: 'cathartic', panels: [mkPanel({ id: 'p8', shotSize: 'extreme-wide', durationSec: 15, cameraMovement: 'drone' }), mkPanel({ id: 'p9', shotSize: 'close-up', durationSec: 8, cameraMovement: 'static' })] },
];

const s = {
  panel: { background: 'linear-gradient(180deg, #12100a 0%, #1a1510 100%)', borderRadius: 12, padding: 20, color: '#e0d8c8', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(251,191,36,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #fbbf24, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(251,191,36,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#fbbf24', marginBottom: 10 } as React.CSSProperties,
};

const ACT_COLORS = { setup: '#22c55e', confrontation: '#ef4444', resolution: '#3b82f6' };

export function FilmStudioPanel() {
  const [scenes] = useState(DEMO_SCENES);
  const allPanels = scenes.flatMap(sc => sc.panels);
  const total = useMemo(() => totalFilmDuration(scenes), [scenes]);
  const balance = useMemo(() => threeActBalance(scenes), [scenes]);
  const balanced = useMemo(() => isBalancedStructure(balance), [balance]);
  const shots = useMemo(() => shotCountBySize(allPanels), [allPanels]);
  const avgShot = useMemo(() => averageShotDuration(allPanels), [allPanels]);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🎬 Film Storyboard</span>
        <span style={{ fontSize: 12, color: '#fbbf24' }}>{Math.floor(total / 60)}:{String(total % 60).padStart(2, '0')}</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🎭 Three-Act Structure</div>
        <div style={{ display: 'flex', height: 30, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
          {(['setup', 'confrontation', 'resolution'] as const).map(act => (
            <div key={act} style={{ width: `${balance[act] * 100}%`, background: ACT_COLORS[act], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', transition: 'width 0.3s' }}>
              {(balance[act] * 100).toFixed(0)}%
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: balanced ? '#4ade80' : '#ef4444', fontWeight: 600 }}>
          {balanced ? '✅ Well-balanced structure' : '⚠️ Structure needs rebalancing'}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🎥 Scenes</div>
        {scenes.map(sc => (
          <div key={sc.id} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 4, borderLeft: `3px solid ${ACT_COLORS[sc.act]}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>Sc. {sc.number}: {sc.name}</span>
              <span style={{ color: '#889' }}>{sceneDuration(sc)}s · {sc.panels.length} shots</span>
            </div>
            <div style={{ fontSize: 11, color: '#889' }}>{sc.location} · {sc.timeOfDay} · {sc.emotionalTone}</div>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📊 Shot Analysis</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {Object.entries(shots).filter(([, v]) => v > 0).map(([size, count]) => (
            <div key={size} style={{ textAlign: 'center', padding: 8, background: 'rgba(251,191,36,0.06)', borderRadius: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fbbf24' }}>{count}</div>
              <div style={{ fontSize: 10, color: '#889' }}>{size}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#889' }}>
          Avg shot: <span style={{ color: '#fbbf24' }}>{avgShot.toFixed(1)}s</span> ·
          Locations: <span style={{ color: '#f97316' }}>{uniqueLocations(scenes).length}</span> ·
          Total shots: <span style={{ color: '#fff' }}>{allPanels.length}</span>
        </div>
      </div>
    </div>
  );
}

export default FilmStudioPanel;
