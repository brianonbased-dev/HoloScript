/**
 * BiomechanicsPanel.tsx — Sports Biomechanics Lab
 * Powered by sportsBiomechanics.ts
 */
import React, { useState, useMemo } from 'react';
import { jointTorque, power, kineticEnergy, potentialEnergy, strideFrequency, fatigueIndex, injuryRiskScore, vo2AtIntensity, caloriesBurned } from '@/lib/sportsBiomechanics';

const s = {
  panel: { background: 'linear-gradient(180deg, #0a1510 0%, #0f1f18 100%)', borderRadius: 12, padding: 20, color: '#c8e8d0', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(34,197,94,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #22c55e, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#22c55e', marginBottom: 10 } as React.CSSProperties,
};

export function BiomechanicsPanel() {
  const [mass, setMass] = useState(70);
  const [velocity, setVelocity] = useState(8);
  const [vo2Max, setVo2Max] = useState(55);
  const [intensity, setIntensity] = useState(75);
  const [peakPower, setPeakPower] = useState(1200);
  const [endPower, setEndPower] = useState(800);

  const ke = useMemo(() => kineticEnergy(mass, velocity), [mass, velocity]);
  const pe = useMemo(() => potentialEnergy(mass, 0.3), [mass]);
  const pw = useMemo(() => power(mass * 9.81, velocity * 0.1), [mass, velocity]);
  const fatigue = useMemo(() => fatigueIndex(peakPower, endPower), [peakPower, endPower]);
  const risk = useMemo(() => injuryRiskScore(65, 12, 1.3), []);
  const vo2 = useMemo(() => vo2AtIntensity(vo2Max, intensity), [vo2Max, intensity]);
  const cal = useMemo(() => caloriesBurned(vo2, 30, mass), [vo2, mass]);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🏋️ Biomechanics Lab</span>
        <span style={{ fontSize: 12, color: '#22c55e' }}>Motion Analysis</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>⚡ Athlete Profile</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 10 }}>
          <label>Mass (kg): <input type="number" value={mass} onChange={e => setMass(+e.target.value)} style={{ width: 50, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 4, color: '#c8e8d0', textAlign: 'right' }} /></label>
          <label>v (m/s): <input type="number" value={velocity} onChange={e => setVelocity(+e.target.value)} style={{ width: 50, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 4, color: '#c8e8d0', textAlign: 'right' }} /></label>
          <label>VO₂max: <input type="number" value={vo2Max} onChange={e => setVo2Max(+e.target.value)} style={{ width: 50, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 4, color: '#c8e8d0', textAlign: 'right' }} /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[['KE', `${ke.toFixed(0)} J`, '#22c55e'], ['Power', `${pw.toFixed(0)} W`, '#06b6d4'], ['Stride', `${strideFrequency(180, 60).toFixed(1)} Hz`, '#a78bfa']].map(([l, v, c]) => (
            <div key={l as string} style={{ textAlign: 'center', padding: 10, background: `${c}08`, border: `1px solid ${c}20`, borderRadius: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c as string }}>{v}</div>
              <div style={{ fontSize: 10, color: '#6a9978' }}>{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>😤 Fatigue & Injury</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 8 }}>
          <label>Peak W: <input type="number" value={peakPower} onChange={e => setPeakPower(+e.target.value)} style={{ width: 60, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 4, color: '#c8e8d0', textAlign: 'right' }} /></label>
          <label>End W: <input type="number" value={endPower} onChange={e => setEndPower(+e.target.value)} style={{ width: 60, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 4, color: '#c8e8d0', textAlign: 'right' }} /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <div style={{ textAlign: 'center', padding: 10, background: fatigue > 30 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', borderRadius: 6, border: `1px solid ${fatigue > 30 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: fatigue > 30 ? '#ef4444' : '#4ade80' }}>{fatigue.toFixed(0)}%</div>
            <div style={{ fontSize: 10, color: '#889' }}>Fatigue Index</div>
          </div>
          <div style={{ textAlign: 'center', padding: 10, background: risk > 50 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', borderRadius: 6, border: `1px solid ${risk > 50 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: risk > 50 ? '#ef4444' : '#4ade80' }}>{risk}/100</div>
            <div style={{ fontSize: 10, color: '#889' }}>Injury Risk</div>
          </div>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🫁 VO₂ & Calories</div>
        <input type="range" min={30} max={100} value={intensity} onChange={e => setIntensity(+e.target.value)} style={{ width: '100%', accentColor: '#22c55e', marginBottom: 6 }} />
        <div style={{ fontSize: 12 }}>
          Intensity: <span style={{ color: '#22c55e', fontWeight: 700 }}>{intensity}%</span> →
          VO₂: <span style={{ color: '#06b6d4' }}>{vo2.toFixed(1)} mL/kg/min</span> ·
          Calories (30min): <span style={{ color: '#f59e0b' }}>{cal.toFixed(0)} kcal</span>
        </div>
      </div>
    </div>
  );
}

export default BiomechanicsPanel;
