/**
 * SpaceMissionPanel.tsx — Space Mission Control Center
 *
 * Orbital mechanics dashboard with Hohmann transfer planner,
 * delta-v budget tracker, celestial body database, fuel calculator,
 * and mission timeline — powered by spaceMission.ts engine.
 */

import React, { useState, useMemo } from 'react';
import {
  orbitalPeriod,
  orbitalVelocity,
  escapeVelocity,
  hohmannDeltaV,
  hohmannTransferTime,
  tsiolkovskyDeltaV,
  fuelRequired,
  totalMissionDeltaV,
  missionProgress,
  BODY_DATA,
  type CelestialBody,
  type MissionEvent,
} from '@/lib/spaceMission';

// ─── Styles ──────────────────────────────────────────────────────

const BODY_EMOJIS: Record<CelestialBody, string> = {
  sun: '☀️',
  mercury: '⚫',
  venus: '🟡',
  earth: '🌍',
  moon: '🌙',
  mars: '🔴',
  jupiter: '🟤',
  saturn: '🪐',
};

const styles = {
  panel: {
    background: 'linear-gradient(180deg, #05080f 0%, #0a1225 50%, #070d1a 100%)',
    borderRadius: '12px',
    padding: '20px',
    color: '#c8d8f0',
    fontFamily: "'Inter', sans-serif",
    minHeight: '600px',
    maxWidth: '720px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid rgba(88, 166, 255, 0.15)',
    paddingBottom: '12px',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #58a6ff, #bc8cff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: '18px',
    padding: '14px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '8px',
    border: '1px solid rgba(88, 166, 255, 0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#58a6ff',
    marginBottom: '10px',
  } as React.CSSProperties,
  bodyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  } as React.CSSProperties,
  bodyCard: (selected: boolean) =>
    ({
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      padding: '10px 6px',
      background: selected ? 'rgba(88, 166, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
      border: `1px solid ${selected ? 'rgba(88, 166, 255, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`,
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      fontSize: '11px',
    }) as React.CSSProperties,
  bodyEmoji: { fontSize: '24px', marginBottom: '4px' } as React.CSSProperties,
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
    marginTop: '10px',
  } as React.CSSProperties,
  statCard: (color: string) =>
    ({
      padding: '12px',
      background: `${color}08`,
      border: `1px solid ${color}25`,
      borderRadius: '6px',
    }) as React.CSSProperties,
  statValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#fff',
  } as React.CSSProperties,
  statLabel: {
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    color: '#6688aa',
    marginTop: '2px',
  } as React.CSSProperties,
  transferArrow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '12px',
    margin: '10px 0',
    background: 'rgba(188, 140, 255, 0.06)',
    borderRadius: '8px',
    border: '1px solid rgba(188, 140, 255, 0.15)',
    fontSize: '14px',
  } as React.CSSProperties,
  dvBar: {
    height: '8px',
    background: 'rgba(255, 255, 255, 0.06)',
    borderRadius: '4px',
    overflow: 'hidden',
    marginTop: '6px',
  } as React.CSSProperties,
  dvFill: (pct: number, color: string) =>
    ({
      height: '100%',
      width: `${Math.min(100, pct)}%`,
      background: `linear-gradient(90deg, ${color}, ${color}88)`,
      borderRadius: '4px',
      transition: 'width 0.3s ease',
    }) as React.CSSProperties,
  missionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '6px',
    marginBottom: '4px',
    fontSize: '12px',
  } as React.CSSProperties,
  fuelInput: {
    width: '80px',
    padding: '6px 8px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(88, 166, 255, 0.2)',
    borderRadius: '4px',
    color: '#c8d8f0',
    fontSize: '13px',
    outline: 'none',
    textAlign: 'right' as const,
  } as React.CSSProperties,
} as const;

// ─── Component ───────────────────────────────────────────────────

export function SpaceMissionPanel() {
  const [origin, setOrigin] = useState<CelestialBody>('earth');
  const [destination, setDestination] = useState<CelestialBody>('mars');
  const [isp, setIsp] = useState(350);
  const [dryMass, setDryMass] = useState(5000);

  const bodies = Object.entries(BODY_DATA) as [CelestialBody, (typeof BODY_DATA)['earth']][];
  const originData = BODY_DATA[origin];
  const destData = BODY_DATA[destination];

  const transfer = useMemo(() => {
    if (origin === destination || originData.orbitRadiusKm === 0 || destData.orbitRadiusKm === 0)
      return null;
    const dv = hohmannDeltaV(
      originData.orbitRadiusKm,
      destData.orbitRadiusKm,
      BODY_DATA.sun.muKm3s2
    );
    const time = hohmannTransferTime(
      originData.orbitRadiusKm,
      destData.orbitRadiusKm,
      BODY_DATA.sun.muKm3s2
    );
    return { ...dv, timeDays: time / 86400 };
  }, [origin, destination]);

  const escVel = useMemo(() => escapeVelocity(originData.radiusKm, originData.muKm3s2), [origin]);
  const orbVel = useMemo(
    () => orbitalVelocity(originData.radiusKm + 200, originData.muKm3s2),
    [origin]
  );
  const _orbPeriodMin = useMemo(
    () => orbitalPeriod(originData.radiusKm + 200, originData.muKm3s2) / 60,
    [origin]
  );

  const fuel = useMemo(() => {
    if (!transfer) return 0;
    return fuelRequired(transfer.total, isp, dryMass);
  }, [transfer, isp, dryMass]);

  const rocketDv = useMemo(
    () => tsiolkovskyDeltaV(isp, dryMass + fuel, dryMass),
    [isp, dryMass, fuel]
  );

  const missionEvents: MissionEvent[] = [
    {
      id: 'e1',
      phase: 'launch',
      name: 'Launch',
      description: 'Surface to LEO',
      deltaVMs: escVel * 1000,
      timestamp: 0,
      completed: true,
    },
    {
      id: 'e2',
      phase: 'orbit-insertion',
      name: 'Orbit Insertion',
      description: `${origin} LEO`,
      deltaVMs: orbVel * 1000,
      timestamp: 1,
      completed: true,
    },
    {
      id: 'e3',
      phase: 'transfer',
      name: 'Hohmann Transfer',
      description: `${origin} → ${destination}`,
      deltaVMs: transfer ? transfer.total * 1000 : 0,
      timestamp: 2,
      completed: false,
    },
    {
      id: 'e4',
      phase: 'arrival',
      name: 'Arrival Burn',
      description: `${destination} orbit`,
      deltaVMs: transfer ? transfer.dv2 * 1000 : 0,
      timestamp: 3,
      completed: false,
    },
  ];

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>🚀 Mission Control</span>
        <span style={{ fontSize: '12px', color: '#58a6ff' }}>
          {Math.round(missionProgress(missionEvents) * 100)}% Complete
        </span>
      </div>

      {/* Body Selector */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>🌍 Origin</div>
        <div style={styles.bodyGrid}>
          {bodies
            .filter(([k]) => k !== 'sun')
            .map(([key]) => (
              <div
              key={key}
              style={styles.bodyCard(key === origin)}
              onClick={() => setOrigin(key)}
              role="button"
              tabIndex={0}
              aria-pressed={key === origin}
              aria-label={key.charAt(0).toUpperCase() + key.slice(1)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOrigin(key)}
            >
                <span style={styles.bodyEmoji}>{BODY_EMOJIS[key]}</span>
                <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
              </div>
            ))}
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>📍 Destination</div>
        <div style={styles.bodyGrid}>
          {bodies
            .filter(([k]) => k !== 'sun')
            .map(([key]) => (
              <div
                key={key}
                style={styles.bodyCard(key === destination)}
                onClick={() => setDestination(key)}
                role="button"
                tabIndex={0}
                aria-pressed={key === destination}
                aria-label={key.charAt(0).toUpperCase() + key.slice(1)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setDestination(key)}
              >
                <span style={styles.bodyEmoji}>{BODY_EMOJIS[key]}</span>
                <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Transfer */}
      {transfer && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>🛸 Hohmann Transfer</div>
          <div style={styles.transferArrow}>
            <span style={{ fontSize: '20px' }}>{BODY_EMOJIS[origin]}</span>
            <span style={{ color: '#bc8cff' }}>──── Δv {transfer.total.toFixed(2)} km/s ────</span>
            <span style={{ fontSize: '20px' }}>{BODY_EMOJIS[destination]}</span>
          </div>
          <div style={styles.statsGrid}>
            <div style={styles.statCard('#58a6ff')}>
              <div style={styles.statValue}>{transfer.total.toFixed(2)}</div>
              <div style={styles.statLabel}>Total Δv (km/s)</div>
            </div>
            <div style={styles.statCard('#bc8cff')}>
              <div style={styles.statValue}>{Math.round(transfer.timeDays)}</div>
              <div style={styles.statLabel}>Transfer (days)</div>
            </div>
            <div style={styles.statCard('#ff9f43')}>
              <div style={styles.statValue}>{Math.round(fuel).toLocaleString()}</div>
              <div style={styles.statLabel}>Fuel (kg)</div>
            </div>
            <div style={styles.statCard('#4ecdc4')}>
              <div style={styles.statValue}>{escVel.toFixed(1)}</div>
              <div style={styles.statLabel}>Escape v (km/s)</div>
            </div>
          </div>
        </div>
      )}

      {/* Spacecraft Config */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>⚙️ Spacecraft</div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '13px' }}>
          <label>
            Isp (s):{' '}
            <input
              style={styles.fuelInput}
              type="number"
              value={isp}
              onChange={(e) => setIsp(+e.target.value)}
            />
          </label>
          <label>
            Dry mass (kg):{' '}
            <input
              style={styles.fuelInput}
              type="number"
              value={dryMass}
              onChange={(e) => setDryMass(+e.target.value)}
            />
          </label>
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#6688aa' }}>
          Tsiolkovsky Δv:{' '}
          <span style={{ color: '#4ecdc4', fontWeight: 600 }}>{rocketDv.toFixed(2)} km/s</span>
        </div>
      </div>

      {/* Mission Timeline */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>📋 Mission Timeline</div>
        {missionEvents.map((e) => (
          <div key={e.id} style={styles.missionRow}>
            <span>{e.completed ? '✅' : '⬜'}</span>
            <span style={{ fontWeight: 600, color: '#c8d8f0' }}>{e.name}</span>
            <span style={{ flex: 1, color: '#667788' }}>{e.description}</span>
            <span style={{ color: '#bc8cff', fontFamily: 'monospace' }}>
              {(e.deltaVMs / 1000).toFixed(1)} km/s
            </span>
          </div>
        ))}
        <div style={{ marginTop: '6px', fontSize: '11px', color: '#6688aa' }}>
          Total mission Δv:{' '}
          <span style={{ color: '#fff' }}>{totalMissionDeltaV(missionEvents).toFixed(1)} km/s</span>
        </div>
      </div>
    </div>
  );
}

export default SpaceMissionPanel;
