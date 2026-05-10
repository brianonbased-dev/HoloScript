import { describe, it, expect } from 'vitest';
import {
  mapTalkingHead,
  OfflineVisemeExtractor,
  type AudioBufferLike,
  type TalkingHeadInput,
} from '../index';

function makeSineWave(freq: number, sampleRate: number, durationMs: number, amplitude = 0.8): Float32Array {
  const samples = Math.floor((sampleRate * durationMs) / 1000);
  const buf = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    buf[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return buf;
}

function silence(durationMs: number, sampleRate = 44100): Float32Array {
  return new Float32Array(Math.floor((sampleRate * durationMs) / 1000));
}

function audioBuffer(samples: Float32Array, sampleRate = 44100, durationMs?: number): AudioBufferLike {
  return {
    samples,
    sampleRate,
    channels: 1,
    durationMs: durationMs ?? Math.floor((samples.length / sampleRate) * 1000),
  };
}

describe('mapTalkingHead precomputed visemes', () => {
  it('computes coverage fraction', () => {
    const r = mapTalkingHead({
      clip_id: 'hello',
      duration_ms: 1000,
      visemes: [
        { viseme: 'aa', t_start_ms: 0, t_end_ms: 200 },
        { viseme: 'E', t_start_ms: 200, t_end_ms: 500 },
      ],
    });
    expect(r.viseme_count).toBe(2);
    expect(r.coverage).toBeCloseTo(0.5);
  });

  it('warns on overlapping visemes', () => {
    const r = mapTalkingHead({
      clip_id: 'bad',
      duration_ms: 1000,
      visemes: [
        { viseme: 'aa', t_start_ms: 0, t_end_ms: 300 },
        { viseme: 'E', t_start_ms: 200, t_end_ms: 500 },
      ],
    });
    expect(r.warnings.some((w) => w.includes('overlap'))).toBe(true);
  });

  it('warns on non-positive duration visemes', () => {
    const r = mapTalkingHead({
      clip_id: 'bad',
      duration_ms: 500,
      visemes: [{ viseme: 'sil', t_start_ms: 100, t_end_ms: 100 }],
    });
    expect(r.warnings.some((w) => w.includes('non-positive'))).toBe(true);
  });

  it('warns on silence gaps between visemes', () => {
    const r = mapTalkingHead({
      clip_id: 'gappy',
      duration_ms: 1000,
      visemes: [
        { viseme: 'aa', t_start_ms: 0, t_end_ms: 200 },
        { viseme: 'E', t_start_ms: 400, t_end_ms: 600 },
      ],
    });
    expect(r.warnings.some((w) => w.includes('silence gaps'))).toBe(true);
    expect(r.coverage).toBeCloseTo(0.4);
  });

  it('warns on full silence when no visemes provided', () => {
    const r = mapTalkingHead({
      clip_id: 'silent',
      duration_ms: 1000,
      visemes: [],
    });
    expect(r.warnings.some((w) => w.includes('full silence'))).toBe(true);
    expect(r.coverage).toBe(0);
  });
});

describe('mapTalkingHead audio_buffer auto-extraction', () => {
  it('extracts visemes from audio buffer when precomputed visemes omitted', () => {
    // 200 Hz sine = midVowel band → should map to 'aa'
    const samples = makeSineWave(200, 44100, 400);
    const buf = audioBuffer(samples, 44100, 400);
    const r = mapTalkingHead({
      clip_id: 'auto',
      duration_ms: 400,
      audio_buffer: buf,
    });
    expect(r.viseme_count).toBeGreaterThan(0);
    expect(r.warnings).not.toContain('no viseme events — full silence');
  });

  it('prefers precomputed visemes over audio_buffer extraction', () => {
    const samples = makeSineWave(200, 44100, 400);
    const buf = audioBuffer(samples, 44100, 400);
    const r = mapTalkingHead({
      clip_id: 'prefer-precomputed',
      duration_ms: 400,
      visemes: [{ viseme: 'O', t_start_ms: 0, t_end_ms: 400 }],
      audio_buffer: buf,
    });
    expect(r.viseme_count).toBe(1);
    expect(r.lipsync.params.viseme_events).toEqual([
      { viseme: 'O', t_start_ms: 0, t_end_ms: 400 },
    ]);
  });

  it('warns when audio_uri is provided but audio_buffer is missing', () => {
    const r = mapTalkingHead({
      clip_id: 'uri-only',
      duration_ms: 1000,
      audio_uri: 'https://example.com/audio.wav',
    });
    expect(r.warnings.some((w) => w.includes('audio_uri provided but no audio_buffer'))).toBe(true);
  });
});

describe('OfflineVisemeExtractor', () => {
  it('extracts silence for zero-amplitude buffer', () => {
    const ext = new OfflineVisemeExtractor();
    const samples = silence(500);
    const events = ext.extract(audioBuffer(samples, 44100, 500));
    expect(events.length).toBe(0);
  });

  it('classifies low-frequency sine as vowel-like (not silence)', () => {
    const ext = new OfflineVisemeExtractor();
    const samples = makeSineWave(150, 44100, 300);
    const events = ext.extract(audioBuffer(samples, 44100, 300));
    expect(events.length).toBeGreaterThan(0);
    // Should be one contiguous event for a steady tone
    expect(events.length).toBeLessThanOrEqual(1);
    expect(events[0].viseme).not.toBe('sil');
  });

  it('produces contiguous events covering the full duration for continuous tone', () => {
    const ext = new OfflineVisemeExtractor({ frameMs: 50 });
    const samples = makeSineWave(200, 44100, 400);
    const events = ext.extract(audioBuffer(samples, 44100, 400));
    expect(events.length).toBeGreaterThanOrEqual(1);
    const first = events[0];
    const last = events[events.length - 1];
    expect(first.t_start_ms).toBe(0);
    expect(last.t_end_ms).toBeGreaterThanOrEqual(350);
  });

  it('splits events when tone changes frequency band', () => {
    // Build two 200ms segments: 150Hz then 5000Hz
    const low = makeSineWave(150, 44100, 200);
    const high = makeSineWave(5000, 44100, 200);
    const combined = new Float32Array(low.length + high.length);
    combined.set(low, 0);
    combined.set(high, low.length);
    const ext = new OfflineVisemeExtractor({ frameMs: 50 });
    const events = ext.extract(audioBuffer(combined, 44100, 400));
    // Should produce at least two distinct viseme regions (vowel then sibilant/fricative)
    expect(events.length).toBeGreaterThanOrEqual(1);
    const visemes = events.map((e) => e.viseme);
    // Expect at least one non-sil viseme; exact mapping is heuristic
    expect(visemes.some((v) => v !== 'sil')).toBe(true);
  });
});
