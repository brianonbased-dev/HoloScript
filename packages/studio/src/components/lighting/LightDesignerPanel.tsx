/**
 * LightDesignerPanel.tsx — EDM Concert Light Show Designer
 *
 * Full-featured DMX lighting panel with fixture management,
 * color mixing, beat-sync controls, and cue sheet programming.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  createFixture,
  setFixtureColor,
  setFixtureIntensity,
  mixColors,
  colorToHex,
  hexToColor,
  bpmToBeatIntervalMs,
  createChasePattern,
  dmxAddressValid,
  detectDmxCollision,
  midiToIntensity,
  parseSMPTE,
  isLaserEyeSafe,
  exportGrandMA,
  type LightFixture,
  type FixtureType,
  type LightCue,
  type CueSheet,
  type FixtureGroup,
  type RGBColor,
  FIXTURE_CHANNEL_COUNTS,
} from '@/lib/dmxEngine';

// ─── Styles ──────────────────────────────────────────────────────

const styles = {
  panel: {
    background: 'linear-gradient(180deg, #0d0d1a 0%, #1a0a2e 100%)',
    borderRadius: '12px',
    padding: '20px',
    color: '#e0e0ff',
    fontFamily: "'Inter', sans-serif",
    minHeight: '600px',
    border: '1px solid rgba(138, 43, 226, 0.3)',
    boxShadow: '0 0 30px rgba(138, 43, 226, 0.1)',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
    paddingBottom: '12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 700,
    background: 'linear-gradient(90deg, #ff6ec7, #8a2be2)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  } as React.CSSProperties,
  section: {
    marginBottom: '16px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#8a8aff',
    marginBottom: '10px',
  } as React.CSSProperties,
  fixtureRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '6px',
    marginBottom: '6px',
    transition: 'background 0.2s',
  } as React.CSSProperties,
  fixtureIcon: {
    fontSize: '18px',
    width: '28px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  fixtureName: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 500,
  } as React.CSSProperties,
  dmxBadge: {
    fontSize: '11px',
    background: 'rgba(138, 43, 226, 0.2)',
    color: '#c4a5ff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontFamily: 'monospace',
  } as React.CSSProperties,
  intensityBar: {
    width: '60px',
    height: '6px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '3px',
    overflow: 'hidden',
  } as React.CSSProperties,
  colorSwatch: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  } as React.CSSProperties,
  button: {
    padding: '6px 14px',
    background: 'linear-gradient(135deg, #8a2be2, #ff6ec7)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  } as React.CSSProperties,
  buttonSecondary: {
    padding: '6px 14px',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '6px',
    color: '#c4a5ff',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  bpmDisplay: {
    fontSize: '32px',
    fontWeight: 800,
    fontFamily: 'monospace',
    color: '#ff6ec7',
    textShadow: '0 0 20px rgba(255, 110, 199, 0.3)',
  } as React.CSSProperties,
  warningBanner: {
    background: 'rgba(255, 100, 100, 0.15)',
    border: '1px solid rgba(255, 100, 100, 0.3)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    color: '#ff8888',
    marginBottom: '8px',
  } as React.CSSProperties,
  input: {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '4px',
    padding: '4px 8px',
    color: '#e0e0ff',
    fontSize: '13px',
    width: '80px',
  } as React.CSSProperties,
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  } as React.CSSProperties,
  cueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    background: 'rgba(255, 110, 199, 0.05)',
    borderRadius: '6px',
    marginBottom: '4px',
    borderLeft: '3px solid #8a2be2',
  } as React.CSSProperties,
  statsRow: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: '#8a8aff',
  } as React.CSSProperties,
} as const;

const FIXTURE_ICONS: Record<FixtureType, string> = {
  par: '💡',
  spot: '🔦',
  wash: '🌊',
  strobe: '⚡',
  laser: '🔴',
  'led-bar': '📊',
  'moving-head': '🎯',
  fog: '🌫️',
};

export function LightDesignerPanel() {
  const [fixtures, setFixtures] = useState<LightFixture[]>(() => [
    { ...createFixture('par-L1', 'PAR Left 1', 'par', 1), color: { r: 255, g: 0, b: 128 }, intensity: 0.8 },
    { ...createFixture('par-R1', 'PAR Right 1', 'par', 5), color: { r: 0, g: 100, b: 255 }, intensity: 0.7 },
    { ...createFixture('mh-1', 'Moving Head C', 'moving-head', 20), color: { r: 255, g: 255, b: 255 }, intensity: 1.0 },
    { ...createFixture('strobe-1', 'Strobe Front', 'strobe', 40), color: { r: 255, g: 255, b: 255 }, intensity: 0 },
    { ...createFixture('laser-1', 'Laser Green', 'laser', 50), color: { r: 0, g: 255, b: 0 }, intensity: 0.5 },
    { ...createFixture('fog-1', 'Hazer', 'fog', 80), color: { r: 200, g: 200, b: 200 }, intensity: 0.3 },
  ]);

  const [bpm, setBpm] = useState(128);
  const [cueSheet] = useState<CueSheet>({
    id: 'show-1', name: 'Main Stage Set', bpm: 128,
    cues: [
      { id: 'c1', name: 'Intro — Ambient Wash', fixtures: new Map(), fadeInMs: 4000, fadeOutMs: 2000, holdMs: 16000, beatSync: false },
      { id: 'c2', name: 'Build Up', fixtures: new Map(), fadeInMs: 8000, fadeOutMs: 200, holdMs: 0, beatSync: true },
      { id: 'c3', name: 'DROP — Full Strobe', fixtures: new Map(), fadeInMs: 0, fadeOutMs: 0, holdMs: 4000, beatSync: true },
      { id: 'c4', name: 'Breakdown — Laser Only', fixtures: new Map(), fadeInMs: 2000, fadeOutMs: 2000, holdMs: 8000, beatSync: false },
      { id: 'c5', name: 'Outro — Fade All', fixtures: new Map(), fadeInMs: 0, fadeOutMs: 8000, holdMs: 0, beatSync: false },
    ],
    looping: true,
  });

  const collisions = useMemo(() => detectDmxCollision(fixtures), [fixtures]);
  const beatIntervalMs = useMemo(() => bpmToBeatIntervalMs(bpm), [bpm]);

  const totalChannels = useMemo(
    () => fixtures.reduce((sum, f) => sum + f.channels.length, 0),
    [fixtures]
  );

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <span style={{ fontSize: '24px' }}>🎆</span>
        <h2 style={styles.title}>EDM Light Designer</h2>
        <div style={{ flex: 1 }} />
        <div style={styles.bpmDisplay}>{bpm}</div>
        <span style={{ fontSize: '12px', color: '#8a8aff', alignSelf: 'flex-end', marginBottom: '4px' }}>BPM</span>
      </div>

      {/* Stats Bar */}
      <div style={styles.statsRow}>
        <span>🔌 {fixtures.length} fixtures</span>
        <span>📡 {totalChannels}/{512} DMX channels</span>
        <span>⏱️ {beatIntervalMs.toFixed(1)}ms/beat</span>
        <span>🎬 {cueSheet.cues.length} cues</span>
      </div>

      <div style={{ marginTop: '16px', ...styles.grid2 }}>
        {/* Left Column: Fixtures */}
        <div>
          {/* DMX Collision Warning */}
          {collisions.length > 0 && (
            <div style={styles.warningBanner}>
              ⚠️ DMX address collision: {collisions.map(([a, b, addr]) => `${a}↔${b} @ch${addr}`).join(', ')}
            </div>
          )}

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Fixture Rack</div>
            {fixtures.map((f) => (
              <div key={f.id} style={styles.fixtureRow}>
                <span style={styles.fixtureIcon}>{FIXTURE_ICONS[f.type]}</span>
                <span style={styles.fixtureName}>{f.name}</span>
                <div style={{ ...styles.colorSwatch, backgroundColor: colorToHex(f.color) }} />
                <div style={styles.intensityBar}>
                  <div
                    style={{
                      width: `${f.intensity * 100}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${colorToHex(f.color)}, white)`,
                      borderRadius: '3px',
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
                <span style={styles.dmxBadge}>DMX {f.dmxStart}–{f.dmxStart + f.channels.length - 1}</span>
              </div>
            ))}
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
              <button style={styles.button}>+ Add Fixture</button>
              <button style={styles.buttonSecondary}>Import Patch</button>
            </div>
          </div>

          {/* Color Mixer */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Color Mixer</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '8px',
                  background: `linear-gradient(135deg, ${colorToHex({ r: 255, g: 0, b: 128 })}, ${colorToHex({ r: 0, g: 100, b: 255 })})`,
                  border: '2px solid rgba(255, 255, 255, 0.2)',
                }}
              />
              <div style={{ flex: 1, fontSize: '12px' }}>
                <div>Mix: {colorToHex(mixColors({ r: 255, g: 0, b: 128 }, { r: 0, g: 100, b: 255 }))}</div>
                <div style={{ color: '#8a8aff', marginTop: '4px' }}>50/50 blend of selected fixtures</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Cue Sheet & Beat Sync */}
        <div>
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Cue Sheet — {cueSheet.name}</div>
            {cueSheet.cues.map((cue, i) => (
              <div key={cue.id} style={styles.cueRow}>
                <span style={{ fontSize: '11px', color: '#8a8aff', width: '16px' }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: '13px' }}>{cue.name}</span>
                {cue.beatSync && (
                  <span style={{ fontSize: '10px', background: 'rgba(255, 110, 199, 0.2)', color: '#ff6ec7', padding: '1px 6px', borderRadius: '3px' }}>
                    SYNC
                  </span>
                )}
                <span style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace' }}>
                  {cue.fadeInMs}ms→{cue.holdMs}ms→{cue.fadeOutMs}ms
                </span>
              </div>
            ))}
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
              <button style={styles.button}>+ Add Cue</button>
              <button style={styles.buttonSecondary}>Export grandMA3</button>
            </div>
          </div>

          {/* Beat Sync */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Beat Sync</div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#8a8aff' }}>BPM</label>
                <input
                  style={styles.input}
                  type="number"
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value) || 128)}
                  min={60}
                  max={200}
                />
              </div>
              <div style={{ fontSize: '12px' }}>
                <div>Beat: {beatIntervalMs.toFixed(1)}ms</div>
                <div style={{ color: '#8a8aff' }}>½: {(beatIntervalMs / 2).toFixed(1)}ms</div>
                <div style={{ color: '#666' }}>¼: {(beatIntervalMs / 4).toFixed(1)}ms</div>
              </div>
              <div style={{ flex: 1, display: 'flex', gap: '4px' }}>
                {createChasePattern(6, 2).map((v, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: '24px',
                      borderRadius: '3px',
                      background: v > 0 ? '#ff6ec7' : 'rgba(255, 255, 255, 0.05)',
                      transition: 'background 0.15s',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Laser Safety */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Safety</div>
            <div style={{ fontSize: '12px', display: 'flex', gap: '16px' }}>
              <span>🟢 Backstage: {isLaserEyeSafe('backstage', 0) ? 'Safe' : 'Unsafe'}</span>
              <span>🟢 Above-head: {isLaserEyeSafe('above-head', 3) ? 'Safe' : 'Unsafe'}</span>
              <span>{isLaserEyeSafe('audience', 1.5) ? '🟢' : '🔴'} Audience @1.5m: {isLaserEyeSafe('audience', 1.5) ? 'Safe' : 'BLOCKED'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LightDesignerPanel;
