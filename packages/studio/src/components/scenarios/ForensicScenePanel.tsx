/**
 * ForensicScenePanel.tsx — Forensic Crime Scene Reconstruction
 * Powered by forensicScene.ts
 */
import React, { useState, useMemo } from 'react';
import { calculateTrajectory, analyzeBloodSpatter, addCustodyEntry, getWitnessReliability, type Evidence, type CustodyEntry, type WitnessStatement } from '@/lib/forensicScene';

const s = {
  panel: { background: 'linear-gradient(180deg, #0a0a12 0%, #121218 100%)', borderRadius: 12, padding: 20, color: '#c8c8d8', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(239,68,68,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#ef4444', marginBottom: 10 } as React.CSSProperties,
};

export function ForensicScenePanel() {
  const [velocity, setVelocity] = useState(400);
  const [angle, setAngle] = useState(15);
  const [impactAngle, setImpactAngle] = useState(30);

  const trajectory = useMemo(() => calculateTrajectory({ x: 0, y: 1.5, z: 0 }, velocity, angle), [velocity, angle]);
  const spatter = useMemo(() => analyzeBloodSpatter(impactAngle, 2), [impactAngle]);

  const witnesses: WitnessStatement[] = [
    { id: 'w1', name: 'J. Smith', timestamp: Date.now() - 3600000, position: { x: 10, y: 0, z: 5 }, description: 'Heard two shots', reliability: 0.8, corroborated: true },
    { id: 'w2', name: 'M. Jones', timestamp: Date.now() - 7200000, position: { x: 30, y: 0, z: 20 }, description: 'Saw figure running', reliability: 0.5, corroborated: false },
  ];

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🔬 Forensic Lab</span>
        <span style={{ fontSize: 12, color: '#ef4444' }}>CSI Tools</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🔫 Ballistics</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 12 }}>
          <label>Velocity (m/s): <input type="number" value={velocity} onChange={e => setVelocity(+e.target.value)} style={{ width: 60, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, color: '#c8c8d8', textAlign: 'right' }} /></label>
          <label>Angle (°): <input type="number" value={angle} onChange={e => setAngle(+e.target.value)} style={{ width: 50, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, color: '#c8c8d8', textAlign: 'right' }} /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[['Range', `${trajectory.range.toFixed(1)}m`, '#ef4444'], ['Max Height', `${trajectory.maxHeight.toFixed(1)}m`, '#f59e0b'], ['Time', `${trajectory.timeOfFlight.toFixed(2)}s`, '#06b6d4']].map(([l, v, c]) => (
            <div key={l as string} style={{ textAlign: 'center', padding: 10, background: `${c}08`, border: `1px solid ${c}20`, borderRadius: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c as string }}>{v}</div>
              <div style={{ fontSize: 10, color: '#889' }}>{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🩸 Blood Spatter</div>
        <input type="range" min={5} max={85} value={impactAngle} onChange={e => setImpactAngle(+e.target.value)} style={{ width: '100%', accentColor: '#ef4444', marginBottom: 6 }} />
        <div style={{ fontSize: 12 }}>
          Impact angle: <span style={{ color: '#ef4444', fontWeight: 700 }}>{impactAngle}°</span> →
          Width/Length: <span style={{ color: '#f59e0b' }}>{spatter.widthLengthRatio.toFixed(3)}</span> ·
          Origin: <span style={{ color: '#06b6d4' }}>{spatter.estimatedOriginHeight.toFixed(1)}m</span>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>👤 Witnesses</div>
        {witnesses.map(w => (
          <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
            <span style={{ fontWeight: 600, width: 70 }}>{w.name}</span>
            <span style={{ flex: 1, color: '#889' }}>{w.description}</span>
            <span style={{ color: getWitnessReliability(w) === 'high' ? '#4ade80' : getWitnessReliability(w) === 'medium' ? '#fbbf24' : '#ef4444', fontWeight: 600 }}>
              {getWitnessReliability(w)}
            </span>
            {w.corroborated && <span style={{ padding: '1px 6px', background: 'rgba(34,197,94,0.15)', borderRadius: 8, fontSize: 10, color: '#4ade80' }}>✓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ForensicScenePanel;
