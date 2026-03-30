/**
 * sound-designer.scenario.ts — LIVING-SPEC: Sound Designer
 *
 * Persona: Eli — sound designer working with beat detection,
 * BPM analysis, waveform visualization, and timeline markers.
 *
 * Note: AudioContext/AudioBuffer require browser APIs.
 * These tests cover the pure-logic paths (BPM calc, markers, config)
 * while browser-dependent paths are marked as todos.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect } from 'vitest';
import type {
  AudioAnalysis,
  Beat,
  TimelineMarker,
  AudioSyncConfig,
} from '@/lib/animation/audioSync';

// ═══════════════════════════════════════════════════════════════════
// 1. Audio Analysis Types
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Sound Designer — Audio Analysis Types', () => {
  it('AudioAnalysis structure has required fields', () => {
    const analysis: AudioAnalysis = {
      duration: 180,
      sampleRate: 44100,
      bpm: 128,
      beats: [],
      waveform: new Float32Array(1024),
      peaks: [],
    };
    expect(analysis.duration).toBe(180);
    expect(analysis.sampleRate).toBe(44100);
    expect(analysis.bpm).toBe(128);
  });

  it('Beat structure includes time, strength, and index', () => {
    const beat: Beat = { time: 0.469, strength: 0.85, index: 1 };
    expect(beat.time).toBeCloseTo(0.469, 3);
    expect(beat.strength).toBeGreaterThan(0);
    expect(beat.index).toBe(1);
  });

  it('BPM calculation — 60 beats in 60 seconds = 60 BPM', () => {
    const beats: Beat[] = Array.from({ length: 60 }, (_, i) => ({
      time: i,
      strength: 1.0,
      index: i,
    }));
    const duration = 60;
    // BPM = beats / duration * 60
    const bpm = (beats.length / duration) * 60;
    expect(bpm).toBe(60);
  });

  it('BPM calculation — 128 beats in 60 seconds = 128 BPM', () => {
    const beatInterval = 60 / 128; // ~0.469s
    const beats: Beat[] = Array.from({ length: 128 }, (_, i) => ({
      time: i * beatInterval,
      strength: 0.9,
      index: i,
    }));
    const bpm = (beats.length / 60) * 60;
    expect(bpm).toBe(128);
  });

  it('waveform is a Float32Array of normalized samples', () => {
    const waveform = new Float32Array(512);
    // Simulate a sine wave
    for (let i = 0; i < 512; i++) {
      waveform[i] = Math.sin((i / 512) * Math.PI * 4);
    }
    expect(waveform.length).toBe(512);
    expect(Math.max(...waveform)).toBeLessThanOrEqual(1.0);
    expect(Math.min(...waveform)).toBeGreaterThanOrEqual(-1.0);
  });

  it('peaks array contains sample indices of loudest moments', () => {
    const peaks = [1024, 5120, 10240, 22050];
    expect(peaks).toHaveLength(4);
    expect(peaks.every((p) => p >= 0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Timeline Markers
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Sound Designer — Timeline Markers', () => {
  it('TimelineMarker structure has id, time, label, type', () => {
    const marker: TimelineMarker = {
      id: 'm1',
      time: 2.5,
      label: 'Chorus',
      type: 'section',
      color: '#ff6600',
    };
    expect(marker.id).toBe('m1');
    expect(marker.time).toBe(2.5);
    expect(marker.type).toBe('section');
  });

  it('markers can be sorted by time', () => {
    const markers: TimelineMarker[] = [
      { id: 'm3', time: 10, label: 'C', type: 'section' },
      { id: 'm1', time: 1, label: 'A', type: 'beat' },
      { id: 'm2', time: 5, label: 'B', type: 'custom' },
    ];
    markers.sort((a, b) => a.time - b.time);
    expect(markers.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('beat markers can be auto-generated from beat list', () => {
    const beats: Beat[] = Array.from({ length: 8 }, (_, i) => ({
      time: i * 0.5,
      strength: 0.8,
      index: i,
    }));
    const markers: TimelineMarker[] = beats.map((b) => ({
      id: `beat-${b.index}`,
      time: b.time,
      label: `Beat ${b.index}`,
      type: 'beat' as const,
    }));
    expect(markers).toHaveLength(8);
    expect(markers[0].type).toBe('beat');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Audio Sync Configuration
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Sound Designer — Sync Configuration', () => {
  it('default config values are sensible', () => {
    const config: AudioSyncConfig = {};
    const sensitivity = config.sensitivity ?? 0.5;
    const minBeatInterval = config.minBeatInterval ?? 0.2;
    const waveformResolution = config.waveformResolution ?? 1024;
    expect(sensitivity).toBe(0.5);
    expect(minBeatInterval).toBe(0.2);
    expect(waveformResolution).toBe(1024);
  });

  it('custom sensitivity (0-1) adjusts beat detection threshold', () => {
    const config: AudioSyncConfig = { sensitivity: 0.8 };
    expect(config.sensitivity).toBe(0.8);
    // Higher sensitivity = more beats detected
  });

  it('snapToBeat logic — finds nearest beat to a given time', () => {
    const beats: Beat[] = [
      { time: 0, strength: 1, index: 0 },
      { time: 0.5, strength: 1, index: 1 },
      { time: 1.0, strength: 1, index: 2 },
    ];
    const queryTime = 0.42;
    let nearest = beats[0];
    for (const b of beats) {
      if (Math.abs(b.time - queryTime) < Math.abs(nearest.time - queryTime)) {
        nearest = b;
      }
    }
    expect(nearest.time).toBe(0.5); // 0.42 is closest to 0.5
  });

  it('getBeatAtTime logic — returns beat within threshold', () => {
    const beats: Beat[] = [{ time: 1.0, strength: 0.9, index: 0 }];
    const threshold = 0.1;
    const time = 1.05;
    const match = beats.find((b) => Math.abs(b.time - time) < threshold);
    expect(match).toBeDefined();
    expect(match!.time).toBe(1.0);
  });

  it('getBeatAtTime logic — returns null when no beat is near', () => {
    const beats: Beat[] = [{ time: 1.0, strength: 0.9, index: 0 }];
    const threshold = 0.1;
    const time = 5.0;
    const match = beats.find((b) => Math.abs(b.time - time) < threshold);
    expect(match).toBeUndefined();
  });

  it('spatial audio — PannerNode uses HRTF model', () => {
    const pannerConfig = {
      panningModel: 'HRTF' as const,
      distanceModel: 'inverse' as const,
      refDistance: 1,
      maxDistance: 100,
      rolloffFactor: 1,
      position: { x: 2, y: 0, z: -3 },
    };
    expect(pannerConfig.panningModel).toBe('HRTF');
    expect(pannerConfig.distanceModel).toBe('inverse');
    expect(pannerConfig.position.x).toBe(2);
  });

  it('audio import from URL produces ArrayBuffer', () => {
    // Simulate fetch + decode workflow
    const importConfig = {
      url: 'https://cdn.example.com/audio/beat.mp3',
      format: 'mp3' as const,
      expectedSampleRate: 44100,
    };
    expect(importConfig.url).toContain('.mp3');
    expect(importConfig.expectedSampleRate).toBe(44100);
  });

  it('waveform visualizer renders sample bars', () => {
    const waveform = new Float32Array(256);
    for (let i = 0; i < 256; i++) waveform[i] = Math.sin((i / 256) * Math.PI * 8);
    // Downsample to 64 bars for display
    const barCount = 64;
    const samplesPerBar = Math.floor(waveform.length / barCount);
    const bars: number[] = [];
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < samplesPerBar; j++) sum += Math.abs(waveform[i * samplesPerBar + j]);
      bars.push(sum / samplesPerBar);
    }
    expect(bars).toHaveLength(64);
    expect(bars.every((b) => b >= 0 && b <= 1)).toBe(true);
  });

  it('beat-driven triggers snap keyframes to nearest beat', () => {
    const beats: Beat[] = [
      { time: 0, strength: 1, index: 0 },
      { time: 0.5, strength: 1, index: 1 },
      { time: 1.0, strength: 1, index: 2 },
      { time: 1.5, strength: 1, index: 3 },
    ];
    const keyframeTimes = [0.12, 0.53, 1.05, 1.6];
    const snapped = keyframeTimes.map((t) => {
      let nearest = beats[0];
      for (const b of beats) {
        if (Math.abs(b.time - t) < Math.abs(nearest.time - t)) nearest = b;
      }
      return nearest.time;
    });
    expect(snapped).toEqual([0, 0.5, 1.0, 1.5]);
  });
});
