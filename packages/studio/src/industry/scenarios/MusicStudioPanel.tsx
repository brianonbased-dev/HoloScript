/**
 * MusicStudioPanel.tsx — Music Production Studio
 * Powered by musicProduction.ts
 */
import React, { useState, useMemo } from 'react';
import {
  midiNoteNumber,
  noteFrequency,
  beatsToSeconds,
  measureCount,
  dbToLinear,
  _linearToDb,
  panLaw,
  isClipping,
  trackDuration,
  soloedTracks,
  type MidiTrack,
  type _MidiNote,
  type TimeSignature,
  type NoteValue,
} from '@/lib/musicProduction';

const NOTES: NoteValue[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const s = {
  panel: {
    background: 'linear-gradient(180deg, #0f0a18 0%, #180f25 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#d8c8f0',
    fontFamily: "'Inter', sans-serif",
    minHeight: 600,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(168,85,247,0.15)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #a855f7, #ec4899)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(168,85,247,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#a855f7',
    marginBottom: 10,
  } as React.CSSProperties,
  key: (isBlack: boolean, active: boolean) =>
    ({
      width: isBlack ? 20 : 28,
      height: isBlack ? 50 : 80,
      background: active ? '#a855f7' : isBlack ? '#1a1a2e' : '#e8e0f0',
      border: '1px solid rgba(168,85,247,0.2)',
      borderRadius: '0 0 4px 4px',
      cursor: 'pointer',
      transition: 'background 0.1s',
    }) as React.CSSProperties,
};

export function MusicStudioPanel() {
  const [note, setNote] = useState<NoteValue>('A');
  const [octave, setOctave] = useState(4);
  const [bpm, setBpm] = useState(120);
  const [gain, setGain] = useState(0);

  const midi = useMemo(() => midiNoteNumber(note, octave), [note, octave]);
  const freq = useMemo(() => noteFrequency(note, octave), [note, octave]);
  const linear = useMemo(() => dbToLinear(gain), [gain]);
  const { _left, _right } = useMemo(() => panLaw(0), []);
  const ts: TimeSignature = { beatsPerMeasure: 4, beatValue: 4 };

  const tracks: MidiTrack[] = [
    {
      id: 't1',
      name: 'Bass',
      instrument: 'synth',
      notes: [{ note: 'C', octave: 2, velocity: 100, startBeat: 0, durationBeats: 4, channel: 0 }],
      muted: false,
      solo: false,
      volume: 0.8,
      pan: 0,
    },
    {
      id: 't2',
      name: 'Lead',
      instrument: 'piano',
      notes: [
        { note: 'E', octave: 4, velocity: 90, startBeat: 0, durationBeats: 2, channel: 1 },
        { note: 'G', octave: 4, velocity: 85, startBeat: 4, durationBeats: 4, channel: 1 },
      ],
      muted: false,
      solo: false,
      volume: 0.7,
      pan: 0.3,
    },
    {
      id: 't3',
      name: 'Drums',
      instrument: 'kit',
      notes: [{ note: 'C', octave: 1, velocity: 127, startBeat: 0, durationBeats: 1, channel: 9 }],
      muted: false,
      solo: false,
      volume: 0.9,
      pan: 0,
    },
  ];
  const _active = soloedTracks(tracks);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🎵 Music Studio</span>
        <span style={{ fontSize: 12, color: '#a855f7' }}>{bpm} BPM</span>
      </div>

      {/* Piano */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🎹 Keyboard</div>
        <div style={{ display: 'flex', gap: 2 }}>
          {NOTES.map((n) => (
            <div key={n} style={s.key(n.includes('#'), n === note)} onClick={() => setNote(n)}>
              <div
                style={{
                  fontSize: 8,
                  textAlign: 'center',
                  marginTop: n.includes('#') ? 35 : 60,
                  color: n === note ? '#fff' : n.includes('#') ? '#666' : '#333',
                }}
              >
                {n}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12 }}>
          <label>
            Octave:{' '}
            <input
              type="number"
              min={0}
              max={8}
              value={octave}
              onChange={(e) => setOctave(+e.target.value)}
              style={{
                width: 40,
                padding: '2px 4px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(168,85,247,0.2)',
                borderRadius: 4,
                color: '#d8c8f0',
                textAlign: 'center',
              }}
            />
          </label>
          <span style={{ color: '#a855f7', fontWeight: 700 }}>
            MIDI {midi} · {freq.toFixed(1)} Hz
          </span>
        </div>
      </div>

      {/* Mixer */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🎛️ Mixer</div>
        {tracks.map((t) => (
          <div
            key={t.id}
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
            <span style={{ fontWeight: 600, width: 50 }}>{t.name}</span>
            <div
              style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${t.volume * 100}%`,
                  background: 'linear-gradient(90deg, #a855f7, #ec4899)',
                  borderRadius: 3,
                }}
              />
            </div>
            <span style={{ width: 30, textAlign: 'right', color: '#889' }}>
              {Math.round(t.volume * 100)}%
            </span>
            <span style={{ color: '#889', width: 50 }}>{trackDuration(t)}b</span>
          </div>
        ))}
      </div>

      {/* Transport */}
      <div style={s.section}>
        <div style={s.sectionTitle}>⏱️ Transport</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
          <label>
            BPM:{' '}
            <input
              type="number"
              min={60}
              max={200}
              value={bpm}
              onChange={(e) => setBpm(+e.target.value)}
              style={{
                width: 50,
                padding: '4px 6px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(168,85,247,0.2)',
                borderRadius: 4,
                color: '#d8c8f0',
                textAlign: 'center',
              }}
            />
          </label>
          <span style={{ color: '#889' }}>4 beats = {beatsToSeconds(4, bpm).toFixed(2)}s</span>
          <span style={{ color: '#889' }}>16 beats = {measureCount(16, ts)} measures</span>
        </div>
      </div>

      {/* Gain */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🔊 Master Gain</div>
        <input
          type="range"
          min={-30}
          max={12}
          value={gain}
          onChange={(e) => setGain(+e.target.value)}
          style={{ width: '100%', accentColor: '#a855f7' }}
        />
        <div
          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}
        >
          <span>
            {gain} dB → {linear.toFixed(3)} linear
          </span>
          <span style={{ color: isClipping(linear) ? '#ef4444' : '#4ade80', fontWeight: 700 }}>
            {isClipping(linear) ? '🔴 CLIPPING' : '🟢 OK'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default MusicStudioPanel;
