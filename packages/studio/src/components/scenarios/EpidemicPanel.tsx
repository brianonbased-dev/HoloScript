/**
 * EpidemicPanel.tsx — Epidemic Heatmap Planner
 * Powered by epidemicHeatmap.ts
 */
import React, { useState, useMemo } from 'react';
import { sirModel, reproductionNumber, doublingTimeDays, herdImmunityThreshold, caseFatalityRate, activeCases, type SIRState } from '@/lib/epidemicHeatmap';

const s = {
  panel: { background: 'linear-gradient(180deg, #120a0a 0%, #1a1010 100%)', borderRadius: 12, padding: 20, color: '#f0d0c8', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(239,68,68,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#ef4444', marginBottom: 10 } as React.CSSProperties,
};

export function EpidemicPanel() {
  const [r0, setR0] = useState(2.5);
  const [gamma, setGamma] = useState(0.1);
  const [pop, setPop] = useState(1000000);
  const [days, setDays] = useState(30);

  const beta = r0 * gamma;
  const init: SIRState = { susceptible: pop - 100, infected: 100, recovered: 0, population: pop };
  const sir = useMemo(() => sirModel(init, beta, gamma, days), [pop, beta, gamma, days]);
  const final = sir[sir.length - 1];
  const herd = useMemo(() => herdImmunityThreshold(r0), [r0]);
  const doubling = useMemo(() => doublingTimeDays(r0, gamma), [r0, gamma]);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🦠 Epidemic Tracker</span>
        <span style={{ fontSize: 12, color: '#ef4444' }}>SIR Model</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📊 Parameters</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 13 }}>
          <label>R₀: <input type="number" step={0.1} value={r0} onChange={e => setR0(+e.target.value)} style={{ width: 50, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, color: '#f0d0c8', textAlign: 'right' }} /></label>
          <label>γ (recovery): <input type="number" step={0.01} value={gamma} onChange={e => setGamma(+e.target.value)} style={{ width: 50, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, color: '#f0d0c8', textAlign: 'right' }} /></label>
          <label>Population: <input type="number" value={pop} onChange={e => setPop(+e.target.value)} style={{ width: 80, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, color: '#f0d0c8', textAlign: 'right' }} /></label>
          <label>Days: <input type="number" value={days} onChange={e => setDays(+e.target.value)} style={{ width: 50, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, color: '#f0d0c8', textAlign: 'right' }} /></label>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📈 Day {days} Projection</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[['Susceptible', final.susceptible.toLocaleString(), '#3b82f6'], ['Infected', final.infected.toLocaleString(), '#ef4444'], ['Recovered', final.recovered.toLocaleString(), '#22c55e']].map(([l, v, c]) => (
            <div key={l as string} style={{ textAlign: 'center', padding: 10, background: `${c}08`, border: `1px solid ${c}20`, borderRadius: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c as string }}>{v}</div>
              <div style={{ fontSize: 10, color: '#889' }}>{l as string}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
          <div style={{ width: `${(final.susceptible/pop)*100}%`, background: '#3b82f6', transition: 'width 0.3s' }} />
          <div style={{ width: `${(final.infected/pop)*100}%`, background: '#ef4444', transition: 'width 0.3s' }} />
          <div style={{ width: `${(final.recovered/pop)*100}%`, background: '#22c55e', transition: 'width 0.3s' }} />
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🔬 Key Metrics</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div style={{ textAlign: 'center', padding: 8, background: 'rgba(239,68,68,0.06)', borderRadius: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: r0 > 1 ? '#ef4444' : '#22c55e' }}>R₀ = {r0}</div>
            <div style={{ fontSize: 10, color: '#889' }}>{r0 > 1 ? 'Spreading' : 'Declining'}</div>
          </div>
          <div style={{ textAlign: 'center', padding: 8, background: 'rgba(245,158,11,0.06)', borderRadius: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>{(herd*100).toFixed(0)}%</div>
            <div style={{ fontSize: 10, color: '#889' }}>Herd Immunity</div>
          </div>
          <div style={{ textAlign: 'center', padding: 8, background: 'rgba(139,92,246,0.06)', borderRadius: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#8b5cf6' }}>{doubling.toFixed(1)}d</div>
            <div style={{ fontSize: 10, color: '#889' }}>Doubling Time</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EpidemicPanel;
