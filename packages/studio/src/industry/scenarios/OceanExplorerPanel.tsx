/**
 * OceanExplorerPanel.tsx — Oceanography Exploration Dashboard
 *
 * Depth zone explorer, water column profiler, tide predictor,
 * marine species tracker — powered by oceanography.ts.
 */

import React, { useState, useMemo } from 'react';
import {
  pressureAtDepth,
  lightAtDepth,
  depthZone,
  soundSpeedMs,
  waterDensity,
  simpleTide,
  tidePhase,
  speciesInZone,
  canSurviveAtDepth,
  endangeredSpecies,
  totalPopulation,
  type MarineSpecies,
  type MarineZone,
} from '@/lib/oceanography';

const ZONE_COLORS: Record<MarineZone, string> = {
  epipelagic: '#22d3ee',
  mesopelagic: '#3b82f6',
  bathypelagic: '#6366f1',
  abyssopelagic: '#4338ca',
  hadopelagic: '#1e1b4b',
};
const ZONE_EMOJIS: Record<MarineZone, string> = {
  epipelagic: '☀️',
  mesopelagic: '🌒',
  bathypelagic: '🌑',
  abyssopelagic: '⬛',
  hadopelagic: '🕳️',
};

const SPECIES: MarineSpecies[] = [
  {
    id: 'whale',
    name: 'Blue Whale',
    zone: 'epipelagic',
    depthRange: { min: 0, max: 500 },
    optimalTempC: { min: 5, max: 20 },
    population: 10000,
    endangered: true,
  },
  {
    id: 'tuna',
    name: 'Bluefin Tuna',
    zone: 'epipelagic',
    depthRange: { min: 0, max: 1000 },
    optimalTempC: { min: 10, max: 25 },
    population: 50000,
    endangered: true,
  },
  {
    id: 'squid',
    name: 'Giant Squid',
    zone: 'mesopelagic',
    depthRange: { min: 300, max: 1000 },
    optimalTempC: { min: 4, max: 10 },
    population: 200000,
    endangered: false,
  },
  {
    id: 'angler',
    name: 'Anglerfish',
    zone: 'bathypelagic',
    depthRange: { min: 1000, max: 4000 },
    optimalTempC: { min: 1, max: 4 },
    population: 100000,
    endangered: false,
  },
  {
    id: 'tube',
    name: 'Giant Tube Worm',
    zone: 'abyssopelagic',
    depthRange: { min: 2000, max: 5000 },
    optimalTempC: { min: 2, max: 30 },
    population: 500000,
    endangered: false,
  },
  {
    id: 'amphipod',
    name: 'Supergiant Amphipod',
    zone: 'hadopelagic',
    depthRange: { min: 6000, max: 11000 },
    optimalTempC: { min: 1, max: 4 },
    population: 30000,
    endangered: false,
  },
];

const s = {
  panel: {
    background: 'linear-gradient(180deg, #021020 0%, #051830 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#b0d8f0',
    fontFamily: "'Inter', sans-serif",
    minHeight: 600,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(34,211,238,0.15)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(34,211,238,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#22d3ee',
    marginBottom: 10,
  } as React.CSSProperties,
};

export function OceanExplorerPanel() {
  const [depth, setDepth] = useState(200);
  const [tideHours, setTideHours] = useState(0);

  const zone = useMemo(() => depthZone(depth), [depth]);
  const pressure = useMemo(() => pressureAtDepth(depth), [depth]);
  const light = useMemo(() => lightAtDepth(depth), [depth]);
  const sound = useMemo(() => soundSpeedMs(15 - depth * 0.002, 35, depth), [depth]);
  const density = useMemo(() => waterDensity(15 - depth * 0.002, 35), [depth]);
  const tide = useMemo(() => simpleTide(tideHours, 2), [tideHours]);
  const phase = useMemo(() => tidePhase(tideHours), [tideHours]);
  const _zoneSpecies = useMemo(() => speciesInZone(SPECIES, zone), [zone]);
  const survivingSpecies = useMemo(
    () => SPECIES.filter((sp) => canSurviveAtDepth(sp, depth)),
    [depth]
  );

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🌊 Ocean Explorer</span>
        <span style={{ fontSize: 12, color: '#22d3ee' }}>{SPECIES.length} species tracked</span>
      </div>

      {/* Depth Slider */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🔽 Depth Control</div>
        <input
          type="range"
          min={0}
          max={11000}
          value={depth}
          onChange={(e) => setDepth(+e.target.value)}
          style={{ width: '100%', accentColor: ZONE_COLORS[zone] }}
        />
        <div
          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}
        >
          <span>Surface</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: ZONE_COLORS[zone] }}>
            {ZONE_EMOJIS[zone]} {depth.toLocaleString()}m — {zone}
          </span>
          <span>11,000m</span>
        </div>
      </div>

      {/* Water Column Profile */}
      <div style={s.section}>
        <div style={s.sectionTitle}>📊 Water Column Profile</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            ['Pressure', `${pressure.toFixed(0)} atm`, '#22d3ee'],
            ['Light', `${light.toFixed(1)}%`, '#fbbf24'],
            ['Sound', `${sound.toFixed(0)} m/s`, '#a78bfa'],
            ['Density', `${density.toFixed(0)} kg/m³`, '#34d399'],
          ].map(([label, val, color]) => (
            <div
              key={label as string}
              style={{
                textAlign: 'center',
                padding: 10,
                background: `${color}08`,
                border: `1px solid ${color}20`,
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: color as string }}>{val}</div>
              <div style={{ fontSize: 10, color: '#6a8899' }}>{label as string}</div>
            </div>
          ))}
        </div>
        {/* Light bar */}
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#889' }}>Light penetration</span>
          <div
            style={{
              height: 8,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 4,
              overflow: 'hidden',
              marginTop: 3,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, light)}%`,
                background: 'linear-gradient(90deg, #fbbf24, #fb923c)',
                borderRadius: 4,
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      </div>

      {/* Tides */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🌙 Tidal Prediction</div>
        <input
          type="range"
          min={0}
          max={24}
          step={0.1}
          value={tideHours}
          onChange={(e) => setTideHours(+e.target.value)}
          style={{ width: '100%', accentColor: '#3b82f6' }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
            marginTop: 6,
          }}
        >
          <span>Hour: {tideHours.toFixed(1)}</span>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#3b82f6' }}>
            {tide > 0 ? '+' : ''}
            {tide.toFixed(2)}m · {phase}
          </span>
        </div>
      </div>

      {/* Marine Species */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🐋 Marine Life at {depth}m</div>
        {survivingSpecies.length === 0 && (
          <div style={{ fontSize: 12, color: '#667' }}>No tracked species at this depth</div>
        )}
        {survivingSpecies.map((sp) => (
          <div
            key={sp.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 6,
              marginBottom: 4,
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 600, flex: 1, color: '#d0e8f0' }}>{sp.name}</span>
            <span style={{ color: '#889' }}>
              {sp.depthRange.min}-{sp.depthRange.max}m
            </span>
            {sp.endangered && (
              <span
                style={{
                  padding: '1px 6px',
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8,
                  fontSize: 10,
                  color: '#ef4444',
                }}
              >
                endangered
              </span>
            )}
            <span
              style={{ color: '#4ade80', fontFamily: 'monospace', width: 60, textAlign: 'right' }}
            >
              {sp.population.toLocaleString()}
            </span>
          </div>
        ))}
        <div style={{ marginTop: 8, fontSize: 11, color: '#889' }}>
          Total population:{' '}
          <span style={{ color: '#fff' }}>
            {totalPopulation(survivingSpecies).toLocaleString()}
          </span>
          {' · '}Endangered:{' '}
          <span style={{ color: '#ef4444' }}>{endangeredSpecies(survivingSpecies).length}</span>
        </div>
      </div>
    </div>
  );
}

export default OceanExplorerPanel;
