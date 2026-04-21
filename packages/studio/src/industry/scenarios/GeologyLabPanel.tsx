/**
 * GeologyLabPanel.tsx — Geology Simulator
 *
 * Mohs hardness tester, rock classifier, seismic wave profiler,
 * earthquake energy calculator — powered by geologySimulator.ts.
 */

import React, { useState, useMemo } from 'react';
import {
  getMineralByHardness,
  canScratch,
  classifyRock,
  pWaveSpeed,
  sWaveSpeed,
  seismicArrivalTime,
  plateDisplacementOverTime,
  earthquakeMagnitudeEnergy,
  MOHS_SCALE,
} from '@/lib/geologySimulator';

const s = {
  panel: {
    background: 'linear-gradient(180deg, #1a1510 0%, #15120e 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#e0d8c8',
    fontFamily: "'Inter', sans-serif",
    minHeight: 600,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(217,167,95,0.2)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #d9a75f, #8b6914)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(217,167,95,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#d9a75f',
    marginBottom: 10,
  } as React.CSSProperties,
};

export function GeologyLabPanel() {
  const [scratcherH, setScratcherH] = useState(7);
  const [targetH, setTargetH] = useState(4);
  const [depth, setDepth] = useState(100);
  const [magnitude, setMagnitude] = useState(5.0);

  const scratcher = useMemo(() => getMineralByHardness(scratcherH), [scratcherH]);
  const target = useMemo(() => getMineralByHardness(targetH), [targetH]);
  const scratches = useMemo(
    () => (scratcher && target ? canScratch(scratcher, target) : false),
    [scratcher, target]
  );

  const pSpeed = useMemo(() => pWaveSpeed(depth), [depth]);
  const sSpeed = useMemo(() => sWaveSpeed(depth), [depth]);
  const energy = useMemo(() => earthquakeMagnitudeEnergy(magnitude), [magnitude]);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🪨 Geology Lab</span>
        <span style={{ fontSize: 12, color: '#d9a75f' }}>Mohs Scale</span>
      </div>

      {/* Mohs Scale */}
      <div style={s.section}>
        <div style={s.sectionTitle}>💎 Mohs Hardness Scale</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
          {MOHS_SCALE.map((m) => (
            <div
              key={m.id}
              style={{
                padding: 6,
                background:
                  m.hardness === scratcherH
                    ? 'rgba(34,197,94,0.12)'
                    : m.hardness === targetH
                      ? 'rgba(239,68,68,0.12)'
                      : 'rgba(255,255,255,0.03)',
                border: `1px solid ${m.hardness === scratcherH ? 'rgba(34,197,94,0.3)' : m.hardness === targetH ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 6,
                textAlign: 'center',
                cursor: 'pointer',
                fontSize: 11,
              }}
              onClick={() => setScratcherH(m.hardness)}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: '#e0d8c8' }}>{m.hardness}</div>
              <div style={{ color: '#998' }}>{m.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scratch Test */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🔬 Scratch Test</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 12 }}>
            Scratcher:{' '}
            <select
              value={scratcherH}
              onChange={(e) => setScratcherH(+e.target.value)}
              style={{
                padding: '4px 8px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 4,
                color: '#e0d8c8',
              }}
            >
              {MOHS_SCALE.map((m) => (
                <option key={m.id} value={m.hardness}>
                  {m.name} ({m.hardness})
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>
            Target:{' '}
            <select
              value={targetH}
              onChange={(e) => setTargetH(+e.target.value)}
              style={{
                padding: '4px 8px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 4,
                color: '#e0d8c8',
              }}
            >
              {MOHS_SCALE.map((m) => (
                <option key={m.id} value={m.hardness}>
                  {m.name} ({m.hardness})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 700,
            background: scratches ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${scratches ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: scratches ? '#4ade80' : '#ef4444',
          }}
        >
          {scratcher?.name} (H{scratcherH}) {scratches ? 'CAN ✅' : 'CANNOT ❌'} scratch{' '}
          {target?.name} (H{targetH})
        </div>
        {scratcher && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#889' }}>
            Luster: {scratcher.luster} · Crystal: {scratcher.crystalSystem} · SG:{' '}
            {scratcher.specificGravity}
          </div>
        )}
      </div>

      {/* Seismic Waves */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🌋 Seismic Waves at Depth</div>
        <input
          type="range"
          min={0}
          max={6000}
          value={depth}
          onChange={(e) => setDepth(+e.target.value)}
          style={{ width: '100%', accentColor: '#d9a75f', marginBottom: 6 }}
        />
        <div style={{ fontSize: 12, color: '#889', marginBottom: 8 }}>
          Depth:{' '}
          <span style={{ color: '#d9a75f', fontWeight: 700 }}>{depth.toLocaleString()} km</span>
          {depth >= 2900 && (
            <span style={{ color: '#ef4444' }}> (Outer Core — S-waves blocked!)</span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <div
            style={{
              textAlign: 'center',
              padding: 10,
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>
              {pSpeed.toFixed(1)}
            </div>
            <div style={{ fontSize: 10, color: '#889' }}>P-Wave (km/s)</div>
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: 10,
              background: sSpeed > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(100,100,100,0.08)',
              border: `1px solid ${sSpeed > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(100,100,100,0.2)'}`,
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: sSpeed > 0 ? '#ef4444' : '#666' }}>
              {sSpeed > 0 ? sSpeed.toFixed(1) : 'BLOCKED'}
            </div>
            <div style={{ fontSize: 10, color: '#889' }}>S-Wave (km/s)</div>
          </div>
        </div>
      </div>

      {/* Earthquake Energy */}
      <div style={s.section}>
        <div style={s.sectionTitle}>💥 Earthquake Energy</div>
        <input
          type="range"
          min={1}
          max={9.5}
          step={0.1}
          value={magnitude}
          onChange={(e) => setMagnitude(+e.target.value)}
          style={{ width: '100%', accentColor: '#ef4444', marginBottom: 6 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: magnitude >= 7 ? '#ef4444' : magnitude >= 5 ? '#fbbf24' : '#4ade80',
            }}
          >
            M{magnitude.toFixed(1)}
          </span>
          <span style={{ fontSize: 13, color: '#889' }}>
            Energy:{' '}
            <span style={{ color: '#d9a75f', fontFamily: 'monospace' }}>
              {energy.toExponential(2)} J
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default GeologyLabPanel;
