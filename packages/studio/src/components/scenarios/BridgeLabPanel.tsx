/**
 * BridgeLabPanel.tsx — Bridge Structural Engineering Lab
 * Powered by bridgeEngineering.ts
 */
import React, { useState, useMemo } from 'react';
import { normalStress, vonMisesStress, safetyFactor, isStructurallySafe, beamDeflection, deadLoadWeight, fatigueLifeCycles, MATERIALS, type MaterialType } from '@/lib/bridgeEngineering';

const s = {
  panel: { background: 'linear-gradient(180deg, #0f1215 0%, #151a1f 100%)', borderRadius: 12, padding: 20, color: '#c8d8e8', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(59,130,246,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#3b82f6', marginBottom: 10 } as React.CSSProperties,
};

const MAT_KEYS = Object.keys(MATERIALS) as MaterialType[];

export function BridgeLabPanel() {
  const [mat, setMat] = useState<MaterialType>('steel');
  const [loadKN, setLoadKN] = useState(200);
  const [area, setArea] = useState(0.05);
  const [spanLength, setSpanLength] = useState(30);

  const material = MATERIALS[mat];
  const ns = useMemo(() => normalStress(loadKN, area), [loadKN, area]);
  const ss = useMemo(() => normalStress(loadKN * 0.3, area), [loadKN, area]);
  const vm = useMemo(() => vonMisesStress(ns, ss), [ns, ss]);
  const sf = useMemo(() => safetyFactor(material.yieldStrengthMPa, vm), [material, vm]);
  const safe = useMemo(() => isStructurallySafe(sf), [sf]);
  const defl = useMemo(() => beamDeflection(loadKN, spanLength, material.elasticModulusMPa, 0.01), [loadKN, spanLength, material]);
  const fatLife = useMemo(() => fatigueLifeCycles(vm * 0.3, material.fatigueStrengthMPa), [vm, material]);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🏗️ Bridge Engineer</span>
        <span style={{ fontSize: 12, color: safe ? '#4ade80' : '#ef4444', fontWeight: 700 }}>
          {safe ? '✅ SAFE' : '⚠️ UNSAFE'} (SF: {sf === Infinity ? '∞' : sf.toFixed(2)})
        </span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🔩 Material</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {MAT_KEYS.map(m => (
            <button key={m} onClick={() => setMat(m)} style={{ padding: '6px 12px', background: m === mat ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${m === mat ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 6, color: m === mat ? '#60a5fa' : '#889', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {m}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, fontSize: 11 }}>
          {[['Yield', `${material.yieldStrengthMPa} MPa`], ['E', `${(material.elasticModulusMPa / 1000).toFixed(0)} GPa`], ['ρ', `${material.densityKgM3} kg/m³`], ['Fatigue', `${material.fatigueStrengthMPa} MPa`]].map(([l, v]) => (
            <div key={l as string} style={{ textAlign: 'center', padding: 6, background: 'rgba(59,130,246,0.05)', borderRadius: 4 }}>
              <div style={{ fontWeight: 700, color: '#60a5fa' }}>{v}</div>
              <div style={{ color: '#667', fontSize: 10 }}>{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📐 Load Analysis</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 10 }}>
          <label>Load (kN): <input type="number" value={loadKN} onChange={e => setLoadKN(+e.target.value)} style={{ width: 60, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 4, color: '#c8d8e8', textAlign: 'right' }} /></label>
          <label>Area (m²): <input type="number" step={0.01} value={area} onChange={e => setArea(+e.target.value)} style={{ width: 60, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 4, color: '#c8d8e8', textAlign: 'right' }} /></label>
          <label>Span (m): <input type="number" value={spanLength} onChange={e => setSpanLength(+e.target.value)} style={{ width: 50, padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 4, color: '#c8d8e8', textAlign: 'right' }} /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[['σ Normal', `${ns.toFixed(0)} MPa`, '#3b82f6'], ['σ vonMises', `${vm.toFixed(0)} MPa`, '#8b5cf6'], ['SF', sf === Infinity ? '∞' : sf.toFixed(2), safe ? '#4ade80' : '#ef4444'], ['Deflect', `${(defl * 1000).toFixed(1)} mm`, '#f59e0b']].map(([l, v, c]) => (
            <div key={l as string} style={{ textAlign: 'center', padding: 10, background: `${c}08`, border: `1px solid ${c}20`, borderRadius: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c as string }}>{v}</div>
              <div style={{ fontSize: 10, color: '#667' }}>{l as string}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#889' }}>
          Fatigue life: <span style={{ color: '#a78bfa' }}>{fatLife > 1e9 ? '∞' : `${(fatLife / 1e6).toFixed(1)}M`} cycles</span>
        </div>
      </div>
    </div>
  );
}

export default BridgeLabPanel;
