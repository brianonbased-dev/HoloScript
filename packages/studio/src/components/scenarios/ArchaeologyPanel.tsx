/**
 * ArchaeologyPanel.tsx — Archaeological Dig Simulator
 * Powered by archaeologicalDig.ts
 */
import React, { useState, useMemo } from 'react';
import { dateCarbonYears, depthToEstimatedAge, classifyArtifact, registerArtifact, gridProgress, type DigGrid, type Artifact } from '@/lib/archaeologicalDig';

const ERA_COLORS: Record<string, string> = { 'stone-age': '#8b6914', 'bronze-age': '#cd7f32', 'iron-age': '#708090', 'ancient': '#daa520', 'medieval': '#6b8e23', 'modern': '#4682b4' };

const s = {
  panel: { background: 'linear-gradient(180deg, #15120a 0%, #1a1810 100%)', borderRadius: 12, padding: 20, color: '#e0d8c0', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(205,127,50,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #cd7f32, #daa520)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(205,127,50,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#cd7f32', marginBottom: 10 } as React.CSSProperties,
};

export function ArchaeologyPanel() {
  const [depth, setDepth] = useState(2.0);
  const [c14ratio, setC14ratio] = useState(0.5);

  const estAge = useMemo(() => depthToEstimatedAge(depth), [depth]);
  const c14age = useMemo(() => dateCarbonYears(c14ratio), [c14ratio]);

  const artifacts: Artifact[] = [
    { id: 'a1', name: 'Clay Pottery', type: 'ceramic', material: 'clay', depthM: 1.5, gridCell: 'B3', estimatedAge: 2500, era: 'iron-age', condition: 'good', description: 'Decorated storage vessel' },
    { id: 'a2', name: 'Bronze Dagger', type: 'tool', material: 'bronze', depthM: 3.0, gridCell: 'C4', estimatedAge: 3500, era: 'bronze-age', condition: 'fair', description: 'Ceremonial weapon with handle' },
    { id: 'a3', name: 'Stone Arrowhead', type: 'tool', material: 'flint', depthM: 5.5, gridCell: 'A2', estimatedAge: 12000, era: 'stone-age', condition: 'excellent', description: 'Knapped projectile point' },
    { id: 'a4', name: 'Gold Amulet', type: 'ornament', material: 'gold', depthM: 2.8, gridCell: 'D1', estimatedAge: 3000, era: 'ancient', condition: 'excellent', description: 'Sun deity pendant' },
  ];

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🏛️ Archaeological Dig</span>
        <span style={{ fontSize: 12, color: '#cd7f32' }}>{artifacts.length} artifacts found</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>⛏️ Excavation Depth</div>
        <input type="range" min={0} max={10} step={0.1} value={depth} onChange={e => setDepth(+e.target.value)} style={{ width: '100%', accentColor: '#cd7f32', marginBottom: 6 }} />
        <div style={{ fontSize: 12 }}>
          Depth: <span style={{ color: '#cd7f32', fontWeight: 700 }}>{depth.toFixed(1)}m</span> →
          Est. age: <span style={{ color: '#daa520', fontWeight: 700 }}>{estAge.toLocaleString()} years</span>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🔬 Carbon-14 Dating</div>
        <input type="range" min={0.01} max={1} step={0.01} value={c14ratio} onChange={e => setC14ratio(+e.target.value)} style={{ width: '100%', accentColor: '#daa520', marginBottom: 6 }} />
        <div style={{ fontSize: 12 }}>
          C-14 ratio: <span style={{ color: '#daa520', fontWeight: 700 }}>{(c14ratio * 100).toFixed(0)}%</span> →
          Age: <span style={{ color: '#cd7f32', fontWeight: 700 }}>{c14age.toLocaleString()} years BP</span>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🏺 Artifact Registry</div>
        {artifacts.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 4, fontSize: 12, borderLeft: `3px solid ${ERA_COLORS[a.era] || '#667'}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: '#889' }}>{a.description}</div>
            </div>
            <span style={{ color: '#889' }}>{a.depthM}m · {a.gridCell}</span>
            <span style={{ padding: '2px 6px', background: `${ERA_COLORS[a.era]}20`, borderRadius: 8, fontSize: 10, color: ERA_COLORS[a.era] }}>{a.era}</span>
            <span style={{ color: '#667' }}>{a.estimatedAge.toLocaleString()}yr</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ArchaeologyPanel;
