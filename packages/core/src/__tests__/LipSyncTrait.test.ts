import { describe, it, expect, beforeEach } from 'vitest';
import { LipSyncTrait, type PhonemeTimestamp } from '../traits/LipSyncTrait';

describe('LipSyncTrait - Phoneme Method', () => {
  let lipSync: LipSyncTrait;

  beforeEach(() => {
    lipSync = new LipSyncTrait({
      method: 'phoneme',
      smoothing: 0, // Disable smoothing for precise testing
    });
  });

  const samplePhonemes: PhonemeTimestamp[] = [
    { phoneme: 'h', time: 0.0, duration: 0.1 },
    { phoneme: 'eh', time: 0.1, duration: 0.2 },
    { phoneme: 'l', time: 0.3, duration: 0.15 },
    { phoneme: 'ow', time: 0.45, duration: 0.25 },
  ];

  it('should sample the correct viseme for a given time offset', () => {
    lipSync.startSession({ phonemeData: samplePhonemes });

    // "h" -> kk
    expect(lipSync.samplePhonemeAtTime(0.05).viseme).toBe('kk');

    // "eh" -> E
    expect(lipSync.samplePhonemeAtTime(0.2).viseme).toBe('E');

    // "l" -> nn
    expect(lipSync.samplePhonemeAtTime(0.35).viseme).toBe('nn');

    // "ow" -> O
    expect(lipSync.samplePhonemeAtTime(0.55).viseme).toBe('O');
  });

  it('should handle gaps (silence) between phonemes', () => {
    const gaps: PhonemeTimestamp[] = [
      { phoneme: 'aa', time: 0.1, duration: 0.1 },
      { phoneme: 'iy', time: 0.3, duration: 0.1 },
    ];
    lipSync.startSession({ phonemeData: gaps });

    expect(lipSync.samplePhonemeAtTime(0.0)).toEqual({ viseme: 'sil', weight: 0 });
    expect(lipSync.samplePhonemeAtTime(0.15).viseme).toBe('aa');
    expect(lipSync.samplePhonemeAtTime(0.25)).toEqual({ viseme: 'sil', weight: 0 });
    expect(lipSync.samplePhonemeAtTime(0.35).viseme).toBe('I');
  });

  it('should implement co-articulation (fading at boundaries)', () => {
    lipSync.startSession({
      phonemeData: [{ phoneme: 'aa', time: 0.1, duration: 1.0, weight: 1.0 }],
    });

    // Middle: full weight
    expect(lipSync.samplePhonemeAtTime(0.5).weight).toBe(0.85); // maxWeight cap

    // Start (progress 0.05): half weight (0.05/0.1 = 0.5)
    expect(lipSync.samplePhonemeAtTime(0.15).weight).toBeCloseTo(0.425, 2);

    // End (progress 0.95): half weight (0.05/0.1 = 0.5)
    expect(lipSync.samplePhonemeAtTime(1.05).weight).toBeCloseTo(0.425, 2);
  });

  it('should update morph targets in update() loop', () => {
    lipSync.startSession({ phonemeData: samplePhonemes });

    // Simulate update at 0.2s ("eh" -> E -> viseme_E)
    const weights = lipSync.update(0.2);

    // Oculus mapping for 'E' is 'viseme_E'
    expect(weights['viseme_E']).toBeGreaterThan(0);
    expect(weights['viseme_aa']).toBeUndefined();
  });

  it('should work with binary search correctly for large data', () => {
    const manyPhonemes: PhonemeTimestamp[] = [];
    for (let i = 0; i < 1000; i++) {
      manyPhonemes.push({ phoneme: 'aa', time: i * 0.1, duration: 0.1 });
    }
    lipSync.startSession({ phonemeData: manyPhonemes });

    expect(lipSync.samplePhonemeAtTime(50.05).viseme).toBe('aa');
    expect(lipSync.samplePhonemeAtTime(99.95).viseme).toBe('aa');
  });
});

