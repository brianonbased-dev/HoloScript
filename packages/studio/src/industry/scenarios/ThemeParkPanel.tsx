/**
 * ThemeParkPanel.tsx — Theme Park Ride Designer
 *
 * Coaster physics, G-force analysis, queue optimizer,
 * thrill scoring — powered by themeParkDesigner.ts.
 */

import React, { useState, useMemo } from 'react';
import {
  velocityFromDrop,
  gForceInLoop,
  isSafeGForce,
  totalRideDuration,
  peakGForce,
  peakSpeed,
  estimatedWaitMinutes,
  dailyThroughput,
  canRide,
  thrillScore,
  type RideProfile,
  type RideSegment,
} from '@/lib/themeParkDesigner';

const s = {
  panel: {
    background: 'linear-gradient(180deg, #1a0825 0%, #12061f 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#e0c8f0',
    fontFamily: "'Inter', sans-serif",
    minHeight: 600,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(251,146,60,0.15)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #fb923c, #ec4899)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(251,146,60,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#fb923c',
    marginBottom: 10,
  } as React.CSSProperties,
};

export function ThemeParkPanel() {
  const [dropHeight, setDropHeight] = useState(50);
  const [loopRadius, setLoopRadius] = useState(12);
  const [queueSize, setQueueSize] = useState(300);
  const [fastPass, setFastPass] = useState(0.2);

  const speed = useMemo(() => velocityFromDrop(dropHeight), [dropHeight]);
  const gLoop = useMemo(() => gForceInLoop(speed, loopRadius), [speed, loopRadius]);
  const safe = useMemo(() => isSafeGForce(gLoop), [gLoop]);

  const segments: RideSegment[] = [
    {
      id: 's1',
      name: 'Lift Hill',
      velocityKmh: 8,
      heightM: dropHeight,
      gForce: 1,
      bankAngleDeg: 0,
      durationSec: 35,
    },
    {
      id: 's2',
      name: 'First Drop',
      velocityKmh: speed,
      heightM: 0,
      gForce: 3.5,
      bankAngleDeg: 0,
      durationSec: 4,
    },
    {
      id: 's3',
      name: 'Loop',
      velocityKmh: speed * 0.85,
      heightM: loopRadius * 2,
      gForce: gLoop,
      bankAngleDeg: 0,
      durationSec: 3,
    },
    {
      id: 's4',
      name: 'Helix',
      velocityKmh: speed * 0.7,
      heightM: 10,
      gForce: 2.5,
      bankAngleDeg: 45,
      durationSec: 6,
    },
    {
      id: 's5',
      name: 'Airtime Hill',
      velocityKmh: speed * 0.6,
      heightM: 15,
      gForce: -0.3,
      bankAngleDeg: 0,
      durationSec: 5,
    },
    {
      id: 's6',
      name: 'Brakes',
      velocityKmh: 15,
      heightM: 2,
      gForce: 0.5,
      bankAngleDeg: 0,
      durationSec: 8,
    },
  ];

  const ride: RideProfile = {
    id: 'r1',
    name: 'Project X',
    type: 'coaster',
    thrillLevel: 'extreme',
    topSpeedKmh: speed,
    heightM: dropHeight,
    maxGForce: peakGForce(segments),
    durationSec: totalRideDuration(segments),
    capacityPerHour: 1200,
    minHeightCm: 120,
  };

  const thrill = useMemo(() => thrillScore(ride), [speed, dropHeight, gLoop]);
  const waitMin = useMemo(
    () => estimatedWaitMinutes(queueSize, 1200, fastPass),
    [queueSize, fastPass]
  );
  const daily = useMemo(() => dailyThroughput(ride, 12), []);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🎢 Ride Designer</span>
        <span style={{ fontSize: 12, color: '#fb923c' }}>Thrill: {thrill}/100</span>
      </div>

      {/* Drop & Loop */}
      <div style={s.section}>
        <div style={s.sectionTitle}>📐 Ride Parameters</div>
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            <span>Drop Height</span>
            <span style={{ color: '#fb923c', fontWeight: 700 }}>{dropHeight}m</span>
          </div>
          <input
            type="range"
            min={10}
            max={120}
            value={dropHeight}
            onChange={(e) => setDropHeight(+e.target.value)}
            style={{ width: '100%', accentColor: '#fb923c' }}
          />
        </div>
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            <span>Loop Radius</span>
            <span style={{ color: '#ec4899', fontWeight: 700 }}>{loopRadius}m</span>
          </div>
          <input
            type="range"
            min={5}
            max={25}
            value={loopRadius}
            onChange={(e) => setLoopRadius(+e.target.value)}
            style={{ width: '100%', accentColor: '#ec4899' }}
          />
        </div>
      </div>

      {/* Physics Results */}
      <div style={s.section}>
        <div style={s.sectionTitle}>⚡ Physics</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            ['Speed', `${speed.toFixed(0)} km/h`, '#fb923c'],
            ['G-Force', `${gLoop.toFixed(1)}G`, safe ? '#4ade80' : '#ef4444'],
            ['Duration', `${totalRideDuration(segments)}s`, '#a78bfa'],
            ['Thrill', `${thrill}/100`, '#fbbf24'],
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
              <div style={{ fontSize: 10, color: '#8a7a9a' }}>{label as string}</div>
            </div>
          ))}
        </div>
        {!safe && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              fontSize: 12,
              color: '#ef4444',
            }}
          >
            ⚠️ G-Force exceeds safety limits ({gLoop.toFixed(1)}G &gt; 6G max)! Increase loop
            radius.
          </div>
        )}
      </div>

      {/* Ride Profile */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🛤️ Track Segments</div>
        {segments.map((seg) => (
          <div
            key={seg.id}
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
            <span style={{ fontWeight: 600, width: 90, color: '#e0d0f0' }}>{seg.name}</span>
            <span style={{ flex: 1, color: '#889' }}>{seg.velocityKmh.toFixed(0)} km/h</span>
            <span
              style={{
                color: isSafeGForce(seg.gForce) ? '#4ade80' : '#ef4444',
                fontWeight: 600,
                width: 50,
                textAlign: 'right',
              }}
            >
              {seg.gForce.toFixed(1)}G
            </span>
            <span style={{ color: '#889', width: 30, textAlign: 'right' }}>{seg.durationSec}s</span>
          </div>
        ))}
      </div>

      {/* Queue */}
      <div style={s.section}>
        <div style={s.sectionTitle}>👥 Queue Optimization</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 13 }}>
          <label>
            Queue:{' '}
            <input
              type="number"
              value={queueSize}
              onChange={(e) => setQueueSize(+e.target.value)}
              style={{
                width: 60,
                padding: '4px 6px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(251,146,60,0.2)',
                borderRadius: 4,
                color: '#e0c8f0',
                textAlign: 'right',
              }}
            />
          </label>
          <label>
            FastPass:{' '}
            <input
              type="number"
              step={0.05}
              min={0}
              max={0.5}
              value={fastPass}
              onChange={(e) => setFastPass(+e.target.value)}
              style={{
                width: 60,
                padding: '4px 6px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(251,146,60,0.2)',
                borderRadius: 4,
                color: '#e0c8f0',
                textAlign: 'right',
              }}
            />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div
            style={{
              textAlign: 'center',
              padding: 8,
              background: 'rgba(251,146,60,0.06)',
              borderRadius: 6,
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: waitMin > 60 ? '#ef4444' : waitMin > 30 ? '#fbbf24' : '#4ade80',
              }}
            >
              {waitMin === Infinity ? '∞' : `${Math.round(waitMin)}`}
            </div>
            <div style={{ fontSize: 10, color: '#889' }}>Wait (min)</div>
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: 8,
              background: 'rgba(236,72,153,0.06)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: '#ec4899' }}>
              {daily.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: '#889' }}>Daily Riders</div>
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: 8,
              background: 'rgba(167,139,250,0.06)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: '#a78bfa' }}>
              {canRide(ride, 130) ? '✅' : '❌'}
            </div>
            <div style={{ fontSize: 10, color: '#889' }}>130cm Guest</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThemeParkPanel;
