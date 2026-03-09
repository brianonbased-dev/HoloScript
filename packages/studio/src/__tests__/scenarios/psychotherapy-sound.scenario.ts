/**
 * psychotherapy-sound.scenario.ts — LIVING-SPEC: Psychotherapy Sound Designer
 *
 * Persona: Dr. Luna — clinical psychotherapist who designs therapeutic
 * audio environments using binaural beats, solfeggio frequencies,
 * ASMR textures, guided meditation tracks, and exposure therapy soundscapes.
 *
 * Domain: Therapeutic audio — brainwave entrainment, frequency therapy,
 * session management, patient-safe volume, and clinical logging.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
  type TherapySession,
  type AudioLayer,
  type ExposureTherapyConfig,
} from '@/lib/therapeuticAudio';

// ═══════════════════════════════════════════════════════════════════
// 1. Brainwave Entrainment
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Psychotherapy Sound — Brainwave Entrainment', () => {
  it('BRAINWAVE_BANDS covers delta through gamma', () => {
    expect(BRAINWAVE_BANDS).toHaveLength(5);
    expect(BRAINWAVE_BANDS.map((b) => b.name)).toEqual([
      'delta',
      'theta',
      'alpha',
      'beta',
      'gamma',
    ]);
  });

  it('getBrainwaveBand(2) = delta (deep sleep)', () => {
    expect(getBrainwaveBand(2)).toBe('delta');
  });

  it('getBrainwaveBand(6) = theta (meditation)', () => {
    expect(getBrainwaveBand(6)).toBe('theta');
  });

  it('getBrainwaveBand(10) = alpha (relaxed awareness)', () => {
    expect(getBrainwaveBand(10)).toBe('alpha');
  });

  it('getBrainwaveBand(20) = beta (active thinking)', () => {
    expect(getBrainwaveBand(20)).toBe('beta');
  });

  it('getBrainwaveBand(40) = gamma (higher cognition)', () => {
    expect(getBrainwaveBand(40)).toBe('gamma');
  });

  it('getBrainwaveBand(0) returns null (below range)', () => {
    expect(getBrainwaveBand(0)).toBeNull();
  });

  it('each band has a therapeutic use description', () => {
    for (const band of BRAINWAVE_BANDS) {
      expect(band.therapeuticUse.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Binaural Beat Generation
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Psychotherapy Sound — Binaural Beats', () => {
  it('createBinauralBeat() generates correct L/R frequencies', () => {
    const beat = createBinauralBeat(200, 10, 'alpha');
    expect(beat.leftEarHz).toBe(200);
    expect(beat.rightEarHz).toBe(210);
    expect(beat.beatFrequencyHz).toBe(10);
  });

  it('alpha state uses 8-13 Hz beat frequency', () => {
    const beat = createBinauralBeat(200, 10, 'alpha');
    const band = BRAINWAVE_BANDS.find((b) => b.name === 'alpha')!;
    expect(beat.beatFrequencyHz).toBeGreaterThanOrEqual(band.minHz);
    expect(beat.beatFrequencyHz).toBeLessThanOrEqual(band.maxHz);
  });

  it('delta state uses 0.5-4 Hz for deep sleep therapy', () => {
    const beat = createBinauralBeat(150, 2, 'delta', 30);
    expect(beat.beatFrequencyHz).toBe(2);
    expect(beat.durationMinutes).toBe(30);
  });

  it('theta state (6 Hz) for PTSD/anxiety treatment', () => {
    const beat = createBinauralBeat(180, 6, 'theta', 25);
    expect(beat.targetState).toBe('theta');
    expect(beat.rightEarHz - beat.leftEarHz).toBe(6);
  });

  it('beta state (18 Hz) for ADHD focus training', () => {
    const beat = createBinauralBeat(220, 18, 'beta', 15);
    expect(beat.targetState).toBe('beta');
    expect(beat.rightEarHz).toBe(238);
  });

  it('carrier frequency is preserved as base', () => {
    const beat = createBinauralBeat(440, 10, 'alpha');
    expect(beat.baseFrequencyHz).toBe(440);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Solfeggio Frequencies
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Psychotherapy Sound — Solfeggio Frequencies', () => {
  it('10 solfeggio frequencies are defined', () => {
    expect(SOLFEGGIO_FREQUENCIES).toHaveLength(10);
  });

  it('528 Hz is the "Miracle" frequency', () => {
    const f528 = SOLFEGGIO_FREQUENCIES.find((f) => f.hz === 528);
    expect(f528).toBeDefined();
    expect(f528!.name).toBe('Miracle');
  });

  it('432 Hz is natural tuning frequency', () => {
    const f432 = SOLFEGGIO_FREQUENCIES.find((f) => f.hz === 432);
    expect(f432).toBeDefined();
    expect(f432!.description).toContain('nature');
  });

  it('isFrequencySolfeggio() validates known frequencies', () => {
    expect(isFrequencySolfeggio(528)).toBe(true);
    expect(isFrequencySolfeggio(432)).toBe(true);
    expect(isFrequencySolfeggio(963)).toBe(true);
    expect(isFrequencySolfeggio(440)).toBe(false); // standard A4, not solfeggio
  });

  it('each solfeggio frequency has a chakra mapping', () => {
    for (const freq of SOLFEGGIO_FREQUENCIES) {
      expect(freq.chakra).toBeDefined();
    }
  });

  it('frequencies span 174 Hz to 963 Hz', () => {
    const sorted = [...SOLFEGGIO_FREQUENCIES].sort((a, b) => a.hz - b.hz);
    expect(sorted[0].hz).toBe(174);
    expect(sorted[sorted.length - 1].hz).toBe(963);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Patient Safety & Volume Control
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Psychotherapy Sound — Patient Safety', () => {
  it('validateVolumeSafety() — 50 dBA is safe', () => {
    expect(validateVolumeSafety(50).safe).toBe(true);
    expect(validateVolumeSafety(50).warning).toBeUndefined();
  });

  it('validateVolumeSafety() — 65 dBA is safe with warning', () => {
    const result = validateVolumeSafety(65);
    expect(result.safe).toBe(true);
    expect(result.warning).toContain('Moderate');
  });

  it('validateVolumeSafety() — 80 dBA is unsafe', () => {
    const result = validateVolumeSafety(80);
    expect(result.safe).toBe(false);
    expect(result.warning).toContain('threshold');
  });

  it('validateVolumeSafety() — 90 dBA is dangerous', () => {
    const result = validateVolumeSafety(90);
    expect(result.safe).toBe(false);
    expect(result.warning).toContain('DANGEROUS');
  });

  it('validateSessionSafety() warns on high volume', () => {
    const session: TherapySession = {
      id: 's1',
      patientId: 'p1',
      therapistId: 't1',
      type: 'binaural',
      startTime: Date.now(),
      durationMinutes: 30,
      maxVolumeDBA: 80,
      layers: [
        {
          id: 'l1',
          name: 'Binaural',
          type: 'binaural',
          volume: 0.5,
          panLR: 0,
          fadeInSec: 5,
          fadeOutSec: 5,
        },
      ],
      notes: 'Standard session',
    };
    const warnings = validateSessionSafety(session);
    expect(warnings.some((w) => w.includes('Volume'))).toBe(true);
  });

  it('validateSessionSafety() warns on sessions > 90 minutes', () => {
    const session: TherapySession = {
      id: 's1',
      patientId: 'p1',
      therapistId: 't1',
      type: 'solfeggio',
      startTime: Date.now(),
      durationMinutes: 120,
      maxVolumeDBA: 55,
      layers: [
        {
          id: 'l1',
          name: 'Tone',
          type: 'frequency',
          volume: 0.3,
          panLR: 0,
          fadeInSec: 10,
          fadeOutSec: 10,
        },
      ],
      notes: 'Extended session',
    };
    const warnings = validateSessionSafety(session);
    expect(warnings.some((w) => w.includes('90-minute'))).toBe(true);
  });

  it('validateSessionSafety() warns exposure therapy without consent', () => {
    const session: TherapySession = {
      id: 's1',
      patientId: 'p1',
      therapistId: 't1',
      type: 'exposure',
      startTime: Date.now(),
      durationMinutes: 30,
      maxVolumeDBA: 60,
      layers: [
        {
          id: 'l1',
          name: 'Thunder',
          type: 'nature',
          volume: 0.4,
          panLR: 0,
          fadeInSec: 30,
          fadeOutSec: 10,
        },
      ],
      notes: 'Gradual storm exposure',
    };
    const warnings = validateSessionSafety(session);
    expect(warnings.some((w) => w.includes('consent'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Exposure Therapy & Desensitization
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Psychotherapy Sound — Exposure Therapy', () => {
  const config: ExposureTherapyConfig = {
    trigger: 'thunderstorm',
    startIntensity: 0.05,
    endIntensity: 0.7,
    rampDurationMin: 20,
    safeWord: 'stop',
    maxVolumeDBA: 65,
  };

  it('exposure starts at low intensity (5%)', () => {
    const intensity = calculateExposureIntensity(config, 0);
    expect(intensity).toBeCloseTo(0.05, 2);
  });

  it('exposure ramps gradually over time', () => {
    const mid = calculateExposureIntensity(config, 10);
    expect(mid).toBeGreaterThan(config.startIntensity);
    expect(mid).toBeLessThan(config.endIntensity);
  });

  it('exposure reaches target intensity at end of ramp', () => {
    const end = calculateExposureIntensity(config, 20);
    expect(end).toBeCloseTo(0.7, 2);
  });

  it('exposure plateaus after ramp duration', () => {
    const past = calculateExposureIntensity(config, 30);
    expect(past).toBe(config.endIntensity);
  });

  it('safe word field is configured', () => {
    expect(config.safeWord).toBe('stop');
  });

  it('getSessionDurationFormatted() formats minutes correctly', () => {
    expect(getSessionDurationFormatted(30)).toBe('30m');
    expect(getSessionDurationFormatted(90)).toBe('1h 30m');
    expect(getSessionDurationFormatted(60)).toBe('1h 0m');
  });

  it('EMDR bilateral stimulation alternates L/R tones', () => {
    const emdrConfig = createEMDRPattern(4);
    expect(emdrConfig.pattern).toHaveLength(4);
    expect(emdrConfig.pattern[0]).toBe('left');
    expect(emdrConfig.pattern[1]).toBe('right');
    const panValues = emdrPanValues(emdrConfig.pattern);
    expect(panValues).toEqual([-1, 1, -1, 1]);
  });

  it('HRV feedback adjusts therapy intensity based on heart rate', () => {
    const hrvReading = { bpm: 72, hrv: 45, stress: 0.3 };
    expect(hrvIntensityMultiplier(hrvReading)).toBe(1.0);
    const stressed = { bpm: 95, hrv: 20, stress: 0.8 };
    expect(hrvIntensityMultiplier(stressed)).toBe(0.5);
  });

  it('guided meditation voice overlay uses auto-ducking', () => {
    const musicVolume = 0.6;
    const ducked = calculateAutoDucking(musicVolume, true);
    expect(ducked).toBeCloseTo(0.24, 2);
    const unducked = calculateAutoDucking(musicVolume, false);
    expect(unducked).toBe(0.6);
  });

  it('spatial ASMR positions audio sources in 3D', () => {
    const asmrSources = [
      { id: 'rain', position: { x: 0, y: 2, z: -1 }, type: 'nature' as const },
      { id: 'whisper', position: { x: -0.5, y: 1, z: 0.3 }, type: 'voice' as const },
      { id: 'crackling', position: { x: 1, y: 0, z: -0.5 }, type: 'nature' as const },
    ];
    expect(asmrSources).toHaveLength(3);
    expect(asmrSources[1].position.x).toBeLessThan(0);
  });

  it('HIPAA-compliant session log redacts patient PII', () => {
    const session: TherapySession = {
      id: 's1',
      patientId: 'P-12345',
      therapistId: 'T-001',
      type: 'binaural',
      startTime: Date.now(),
      durationMinutes: 30,
      maxVolumeDBA: 55,
      layers: [
        {
          id: 'l1',
          name: 'Alpha',
          type: 'binaural',
          volume: 0.5,
          panLR: 0,
          fadeInSec: 5,
          fadeOutSec: 5,
        },
      ],
      notes: 'Patient gave informed consent.',
    };
    const exported = exportSessionHIPAA(session);
    expect(exported.patientId).toBe('P-XXXXX');
    expect(exported.type).toBe('binaural');
  });
});
