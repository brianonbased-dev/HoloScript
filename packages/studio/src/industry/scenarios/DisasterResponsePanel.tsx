/**
 * DisasterResponsePanel.tsx — Disaster Response Command
 * Powered by disasterResponse.ts
 */
import React, { useState, useMemo } from 'react';
import {
  triagePriority,
  resourceUtilization,
  safeDistance,
  evacuationTimeMinutes,
  affectedPopulation,
  type Disaster,
  type ResourcePool,
  type TriagePatient,
  type TriageCategory,
} from '@/lib/disasterResponse';

const CATEGORY_COLORS: Record<TriageCategory, string> = {
  immediate: '#ef4444',
  delayed: '#f59e0b',
  minor: '#22c55e',
  deceased: '#6b7280',
};

const s = {
  panel: {
    background: 'linear-gradient(180deg, #150a0a 0%, #1a1010 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#f0d0d0',
    fontFamily: "'Inter', sans-serif",
    minHeight: 600,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(239,68,68,0.15)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #ef4444, #f97316)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(239,68,68,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#ef4444',
    marginBottom: 10,
  } as React.CSSProperties,
};

export function DisasterResponsePanel() {
  const [magnitude, setMagnitude] = useState(6.5);
  const [popDensity, setPopDensity] = useState(5000);

  const disaster: Disaster = {
    id: 'd1',
    type: 'earthquake',
    name: 'Quake Alpha',
    severity: magnitude >= 7 ? 'critical' : magnitude >= 5 ? 'major' : 'moderate',
    location: { lat: 34.05, lng: -118.24 },
    radiusKm: magnitude * 8,
    estimatedAffected: Math.round(popDensity * magnitude * 10),
    timestamp: Date.now(),
  };
  const safeDist = useMemo(() => safeDistance(magnitude), [magnitude]);
  const evacTime = useMemo(() => evacuationTimeMinutes(popDensity, 4), [popDensity]);
  const affected = useMemo(
    () => affectedPopulation(popDensity, disaster.radiusKm),
    [popDensity, disaster.radiusKm]
  );

  const patients: TriagePatient[] = [
    {
      id: 't1',
      name: 'Patient A',
      age: 45,
      injury: 'Crush injury',
      vitals: {
        heartRate: 130,
        bloodPressure: '80/50',
        respRate: 28,
        oxygenSat: 88,
        conscious: true,
      },
      canWalk: false,
      breathing: true,
    },
    {
      id: 't2',
      name: 'Patient B',
      age: 28,
      injury: 'Laceration',
      vitals: {
        heartRate: 85,
        bloodPressure: '120/80',
        respRate: 16,
        oxygenSat: 97,
        conscious: true,
      },
      canWalk: true,
      breathing: true,
    },
    {
      id: 't3',
      name: 'Patient C',
      age: 60,
      injury: 'Burns 40%',
      vitals: {
        heartRate: 140,
        bloodPressure: '70/40',
        respRate: 32,
        oxygenSat: 82,
        conscious: false,
      },
      canWalk: false,
      breathing: true,
    },
  ];

  const resources: ResourcePool = {
    medical: { total: 50, deployed: 35, available: 15 },
    rescue: { total: 30, deployed: 25, available: 5 },
    logistics: { total: 100, deployed: 60, available: 40 },
  };

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🚨 Disaster Response</span>
        <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 700 }}>
          {disaster.severity.toUpperCase()}
        </span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🌍 Situation</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 10 }}>
          <label>
            Magnitude:{' '}
            <input
              type="number"
              step={0.1}
              value={magnitude}
              onChange={(e) => setMagnitude(+e.target.value)}
              style={{
                width: 50,
                padding: '4px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 4,
                color: '#f0d0d0',
                textAlign: 'right',
              }}
            />
          </label>
          <label>
            Pop/km²:{' '}
            <input
              type="number"
              value={popDensity}
              onChange={(e) => setPopDensity(+e.target.value)}
              style={{
                width: 60,
                padding: '4px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 4,
                color: '#f0d0d0',
                textAlign: 'right',
              }}
            />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            ['Affected', affected.toLocaleString(), '#ef4444'],
            ['Safe Dist', `${safeDist.toFixed(0)} km`, '#f59e0b'],
            ['Evac Time', `${evacTime.toFixed(0)} min`, '#06b6d4'],
          ].map(([l, v, c]) => (
            <div
              key={l as string}
              style={{
                textAlign: 'center',
                padding: 10,
                background: `${c}08`,
                border: `1px solid ${c}20`,
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: c as string }}>{v}</div>
              <div style={{ fontSize: 10, color: '#889' }}>{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🏥 Triage</div>
        {patients.map((p) => {
          const cat = triagePriority(p);
          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 6,
                marginBottom: 4,
                fontSize: 12,
                borderLeft: `3px solid ${CATEGORY_COLORS[cat]}`,
              }}
            >
              <span style={{ fontWeight: 600, width: 70 }}>{p.name}</span>
              <span style={{ flex: 1, color: '#889' }}>{p.injury}</span>
              <span style={{ color: '#889' }}>
                HR:{p.vitals.heartRate} SpO₂:{p.vitals.oxygenSat}%
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: CATEGORY_COLORS[cat],
                  textTransform: 'uppercase',
                  fontSize: 11,
                }}
              >
                {cat}
              </span>
            </div>
          );
        })}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📦 Resources</div>
        {Object.entries(resources).map(([type, r]) => (
          <div key={type} style={{ marginBottom: 6 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                marginBottom: 3,
              }}
            >
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{type}</span>
              <span style={{ color: '#889' }}>
                {r.deployed}/{r.total} deployed ({(resourceUtilization(r) * 100).toFixed(0)}%)
              </span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
              <div
                style={{
                  height: '100%',
                  width: `${resourceUtilization(r) * 100}%`,
                  background: resourceUtilization(r) > 0.8 ? '#ef4444' : '#22c55e',
                  borderRadius: 3,
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DisasterResponsePanel;
