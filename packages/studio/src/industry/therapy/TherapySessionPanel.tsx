/**
 * TherapySessionPanel.tsx — Psychotherapy Sound Session Designer
 *
 * Clinical audio environment designer with brainwave state selection,
 * binaural beat configuration, solfeggio frequency picker, volume safety,
 * exposure therapy controls, and session management.
 */

import React, { useState, useMemo } from 'react';
import {
  createBinauralBeat,
  getBrainwaveBand,
  isFrequencySolfeggio,
  validateVolumeSafety,
  validateSessionSafety,
  calculateExposureIntensity,
  getSessionDurationFormatted,
  redactPatientPII,
  exportSessionHIPAA,
  createEMDRPattern,
  emdrPanValues,
  hrvIntensityMultiplier,
  calculateAutoDucking,
  BRAINWAVE_BANDS,
  SOLFEGGIO_FREQUENCIES,
  type BrainwaveState,
  type BinauralBeatConfig,
  type TherapySession,
  type AudioLayer,
  type ExposureTherapyConfig,
} from '@/lib/therapeuticAudio';

// ─── Styles ──────────────────────────────────────────────────────

const styles = {
  panel: {
    background: 'linear-gradient(180deg, #0a1628 0%, #0d1f2d 50%, #0a1a20 100%)',
    borderRadius: '12px',
    padding: '20px',
    color: '#d0e8f0',
    fontFamily: "'Inter', sans-serif",
    minHeight: '600px',
    border: '1px solid rgba(100, 200, 255, 0.15)',
    boxShadow: '0 0 40px rgba(100, 200, 255, 0.05)',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
    paddingBottom: '12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 700,
    background: 'linear-gradient(90deg, #64d2ff, #5ac8fa, #30b0c7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  } as React.CSSProperties,
  section: {
    marginBottom: '16px',
    padding: '12px',
    background: 'rgba(100, 200, 255, 0.03)',
    borderRadius: '8px',
    border: '1px solid rgba(100, 200, 255, 0.06)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#5ac8fa',
    marginBottom: '10px',
  } as React.CSSProperties,
  brainwaveBtn: (active: boolean) =>
    ({
      padding: '8px 12px',
      background: active
        ? 'linear-gradient(135deg, rgba(100, 200, 255, 0.3), rgba(90, 200, 250, 0.15))'
        : 'rgba(255, 255, 255, 0.04)',
      border: active ? '1px solid #5ac8fa' : '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '8px',
      color: active ? '#64d2ff' : '#8a9aaa',
      fontSize: '12px',
      cursor: 'pointer',
      textAlign: 'center' as const,
      transition: 'all 0.2s',
    }) as React.CSSProperties,
  freqPill: (active: boolean) =>
    ({
      padding: '6px 10px',
      background: active
        ? 'linear-gradient(135deg, rgba(90, 200, 250, 0.2), rgba(50, 180, 220, 0.1))'
        : 'rgba(255, 255, 255, 0.03)',
      border: active ? '1px solid #30b0c7' : '1px solid rgba(255, 255, 255, 0.06)',
      borderRadius: '6px',
      color: active ? '#64d2ff' : '#667788',
      fontSize: '11px',
      cursor: 'pointer',
      textAlign: 'center' as const,
    }) as React.CSSProperties,
  safetyIndicator: (safe: boolean) =>
    ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      background: safe ? 'rgba(50, 205, 50, 0.1)' : 'rgba(255, 80, 80, 0.1)',
      color: safe ? '#32cd32' : '#ff5050',
      border: `1px solid ${safe ? 'rgba(50, 205, 50, 0.3)' : 'rgba(255, 80, 80, 0.3)'}`,
    }) as React.CSSProperties,
  volumeBar: {
    height: '8px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '4px',
    overflow: 'hidden',
    flex: 1,
  } as React.CSSProperties,
  layerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '6px',
    marginBottom: '4px',
  } as React.CSSProperties,
  button: {
    padding: '6px 14px',
    background: 'linear-gradient(135deg, #30b0c7, #5ac8fa)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  } as React.CSSProperties,
  exposureBar: {
    height: '16px',
    background: 'rgba(255, 255, 255, 0.06)',
    borderRadius: '8px',
    overflow: 'hidden',
    marginTop: '8px',
  } as React.CSSProperties,
  emdrDot: (side: 'left' | 'right') =>
    ({
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      background: side === 'left' ? '#5ac8fa' : '#ff6ec7',
    }) as React.CSSProperties,
} as const;

const BRAINWAVE_EMOJIS: Record<BrainwaveState, string> = {
  delta: '🌙',
  theta: '🧘',
  alpha: '😌',
  beta: '🧠',
  gamma: '✨',
};

export function TherapySessionPanel() {
  const [targetState, setTargetState] = useState<BrainwaveState>('alpha');
  const [baseFreq, _setBaseFreq] = useState(200);
  const [selectedSolfeggio, setSelectedSolfeggio] = useState(528);
  const [volume, _setVolume] = useState(55);
  const [sessionDuration, _setSessionDuration] = useState(30);
  const [exposureElapsed, _setExposureElapsed] = useState(8);

  const selectedBand = useMemo(
    () => BRAINWAVE_BANDS.find((b) => b.name === targetState)!,
    [targetState]
  );

  const beatFreq = useMemo(() => (selectedBand.minHz + selectedBand.maxHz) / 2, [selectedBand]);

  const binauralConfig = useMemo(
    () => createBinauralBeat(baseFreq, beatFreq, targetState, sessionDuration),
    [baseFreq, beatFreq, targetState, sessionDuration]
  );

  const volumeSafety = useMemo(() => validateVolumeSafety(volume), [volume]);

  const exposureConfig: ExposureTherapyConfig = useMemo(
    () => ({
      trigger: 'thunderstorm',
      startIntensity: 0.05,
      endIntensity: 0.7,
      rampDurationMin: 20,
      safeWord: 'stop',
      maxVolumeDBA: volume,
    }),
    [volume]
  );

  const exposureIntensity = useMemo(
    () => calculateExposureIntensity(exposureConfig, exposureElapsed),
    [exposureConfig, exposureElapsed]
  );

  const layers: AudioLayer[] = useMemo(
    () => [
      {
        id: 'binaural',
        name: 'Binaural Tone',
        type: 'binaural',
        volume: 0.5,
        panLR: 0,
        fadeInSec: 5,
        fadeOutSec: 5,
      },
      {
        id: 'nature',
        name: 'Rain Ambience',
        type: 'nature',
        volume: 0.3,
        panLR: 0,
        fadeInSec: 10,
        fadeOutSec: 10,
      },
      {
        id: 'guide',
        name: 'Voice Guide',
        type: 'voice',
        volume: 0.8,
        panLR: 0,
        fadeInSec: 2,
        fadeOutSec: 2,
      },
    ],
    []
  );

  const session: TherapySession = useMemo(
    () => ({
      id: 'session-live',
      patientId: 'P-12345',
      therapistId: 'T-001',
      type: 'binaural',
      startTime: Date.now(),
      durationMinutes: sessionDuration,
      maxVolumeDBA: volume,
      layers,
      notes: 'Patient gave informed consent. Standard alpha entrainment.',
    }),
    [sessionDuration, volume, layers]
  );

  const sessionWarnings = useMemo(() => validateSessionSafety(session), [session]);
  const emdrPattern = useMemo(() => createEMDRPattern(8), []);

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <span style={{ fontSize: '24px' }}>🧠</span>
        <h2 style={styles.title}>Therapy Session Designer</h2>
        <div style={{ flex: 1 }} />
        <span style={styles.safetyIndicator(volumeSafety.safe)}>
          {volumeSafety.safe ? '🟢' : '🔴'} {volume} dBA
        </span>
      </div>

      {/* Session Info */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          fontSize: '12px',
          color: '#5ac8fa',
          marginBottom: '16px',
        }}
      >
        <span>⏱️ {getSessionDurationFormatted(sessionDuration)}</span>
        <span>🎧 {binauralConfig.beatFrequencyHz.toFixed(1)} Hz beat</span>
        <span>
          🔊 L: {binauralConfig.leftEarHz} Hz / R: {binauralConfig.rightEarHz.toFixed(1)} Hz
        </span>
        <span>🆔 {redactPatientPII(session.patientId)}</span>
      </div>

      {sessionWarnings.length > 0 && (
        <div
          style={{
            background: 'rgba(255, 180, 50, 0.1)',
            border: '1px solid rgba(255, 180, 50, 0.3)',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '12px',
            color: '#ffb432',
            marginBottom: '12px',
          }}
        >
          ⚠️ {sessionWarnings.join(' • ')}
        </div>
      )}

      <div style={styles.grid2}>
        {/* Left Column */}
        <div>
          {/* Brainwave Selector */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Target Brainwave State</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {BRAINWAVE_BANDS.map((band) => (
                <button
                  key={band.name}
                  onClick={() => setTargetState(band.name)}
                  style={styles.brainwaveBtn(targetState === band.name)}
                >
                  <div style={{ fontSize: '16px' }}>{BRAINWAVE_EMOJIS[band.name]}</div>
                  <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{band.name}</div>
                  <div style={{ fontSize: '10px', opacity: 0.7 }}>
                    {band.minHz}–{band.maxHz} Hz
                  </div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#8a9aaa' }}>
              {selectedBand.description} — {selectedBand.therapeuticUse}
            </div>
          </div>

          {/* Solfeggio Frequencies */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Solfeggio Frequencies</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
              {SOLFEGGIO_FREQUENCIES.map((f) => (
                <button
                  key={f.hz}
                  onClick={() => setSelectedSolfeggio(f.hz)}
                  style={styles.freqPill(selectedSolfeggio === f.hz)}
                >
                  <div style={{ fontWeight: 600 }}>{f.hz}</div>
                  <div style={{ fontSize: '9px', opacity: 0.7 }}>{f.name}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '6px', fontSize: '11px', color: '#667788' }}>
              {SOLFEGGIO_FREQUENCIES.find((f) => f.hz === selectedSolfeggio)?.description} •{' '}
              {SOLFEGGIO_FREQUENCIES.find((f) => f.hz === selectedSolfeggio)?.chakra} Chakra
            </div>
          </div>

          {/* EMDR Bilateral */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>EMDR Bilateral Stimulation</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {emdrPanValues(emdrPattern.pattern).map((pan, i) => (
                <div key={i} style={styles.emdrDot(pan < 0 ? 'left' : 'right')} />
              ))}
              <span style={{ fontSize: '11px', color: '#667788', marginLeft: '8px' }}>
                {emdrPattern.toneHz}Hz @ {emdrPattern.intervalMs}ms interval
              </span>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div>
          {/* Audio Layers */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Audio Layers</div>
            {layers.map((layer) => {
              const duckedVolume =
                layer.type === 'music' ? calculateAutoDucking(layer.volume, true) : layer.volume;
              return (
                <div key={layer.id} style={styles.layerRow}>
                  <span style={{ fontSize: '14px' }}>
                    {layer.type === 'binaural' ? '🎵' : layer.type === 'nature' ? '🌿' : '🗣️'}
                  </span>
                  <span style={{ flex: 1, fontSize: '13px' }}>{layer.name}</span>
                  <div style={styles.volumeBar}>
                    <div
                      style={{
                        width: `${duckedVolume * 100}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #30b0c7, #5ac8fa)',
                        borderRadius: '4px',
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: '#5ac8fa',
                      width: '36px',
                    }}
                  >
                    {Math.round(duckedVolume * 100)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Exposure Therapy Ramp */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Exposure Therapy — {exposureConfig.trigger}</div>
            <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Start: {(exposureConfig.startIntensity * 100).toFixed(0)}%</span>
              <span>Current: {(exposureIntensity * 100).toFixed(1)}%</span>
              <span>Target: {(exposureConfig.endIntensity * 100).toFixed(0)}%</span>
            </div>
            <div style={styles.exposureBar}>
              <div
                style={{
                  width: `${exposureIntensity * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #32cd32, #ffb432, #ff5050)',
                  borderRadius: '8px',
                  transition: 'width 0.5s ease-out',
                }}
              />
            </div>
            <div style={{ marginTop: '6px', fontSize: '11px', color: '#667788' }}>
              Elapsed: {exposureElapsed}m / {exposureConfig.rampDurationMin}m — Safe word: "
              {exposureConfig.safeWord}"
            </div>
          </div>

          {/* Session Controls */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Session Controls</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={styles.button}>▶ Start Session</button>
              <button
                style={{
                  ...styles.button,
                  background: 'rgba(255, 80, 80, 0.2)',
                  color: '#ff5050',
                  border: '1px solid rgba(255, 80, 80, 0.3)',
                }}
              >
                ⏹ Stop
              </button>
              <button
                style={{
                  ...styles.button,
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: '#5ac8fa',
                  border: '1px solid rgba(100, 200, 255, 0.2)',
                }}
              >
                📋 Export HIPAA Log
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TherapySessionPanel;
