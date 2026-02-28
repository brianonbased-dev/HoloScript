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

// ═══════════════════════════════════════════════════════════════════
// Domain Types — Therapeutic Audio
// ═══════════════════════════════════════════════════════════════════

type BrainwaveState = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';

interface BrainwaveBand {
  name: BrainwaveState;
  minHz: number;
  maxHz: number;
  description: string;
  therapeuticUse: string;
}

interface BinauralBeatConfig {
  baseFrequencyHz: number;    // Carrier tone (e.g., 200 Hz)
  beatFrequencyHz: number;    // Difference between L/R (e.g., 10 Hz for alpha)
  leftEarHz: number;          // baseFrequency
  rightEarHz: number;         // baseFrequency + beatFrequency
  targetState: BrainwaveState;
  durationMinutes: number;
}

interface SolfeggioFrequency {
  hz: number;
  name: string;
  description: string;
  chakra?: string;
}

interface TherapySession {
  id: string;
  patientId: string;
  therapistId: string;
  type: 'binaural' | 'solfeggio' | 'asmr' | 'guided' | 'exposure' | 'emdr';
  startTime: number;
  durationMinutes: number;
  maxVolumeDBA: number;       // Safety limit
  layers: AudioLayer[];
  notes: string;
}

interface AudioLayer {
  id: string;
  name: string;
  type: 'binaural' | 'nature' | 'music' | 'voice' | 'noise' | 'frequency';
  volume: number;   // 0-1
  panLR: number;    // -1 (left) to 1 (right)
  fadeInSec: number;
  fadeOutSec: number;
}

interface ExposureTherapyConfig {
  trigger: string;          // e.g., "thunderstorm", "crowd noise", "airplane"
  startIntensity: number;   // 0-1
  endIntensity: number;
  rampDurationMin: number;  // Gradual exposure ramp
  safeWord: string;         // Immediate stop trigger
  maxVolumeDBA: number;
}

// ═══════════════════════════════════════════════════════════════════
// Domain Logic — Pure Functions
// ═══════════════════════════════════════════════════════════════════

const BRAINWAVE_BANDS: BrainwaveBand[] = [
  { name: 'delta', minHz: 0.5, maxHz: 4, description: 'Deep sleep', therapeuticUse: 'Insomnia, deep rest, healing' },
  { name: 'theta', minHz: 4, maxHz: 8, description: 'Meditation, creativity', therapeuticUse: 'PTSD, anxiety, creativity enhancement' },
  { name: 'alpha', minHz: 8, maxHz: 13, description: 'Relaxed awareness', therapeuticUse: 'Stress reduction, mindfulness, pain management' },
  { name: 'beta', minHz: 13, maxHz: 30, description: 'Active thinking', therapeuticUse: 'ADHD focus training, cognitive therapy' },
  { name: 'gamma', minHz: 30, maxHz: 100, description: 'Higher cognition', therapeuticUse: 'Memory recall, peak performance' },
];

const SOLFEGGIO_FREQUENCIES: SolfeggioFrequency[] = [
  { hz: 174, name: 'Foundation', description: 'Pain reduction, security', chakra: 'Root' },
  { hz: 285, name: 'Restoration', description: 'Tissue healing, safety', chakra: 'Sacral' },
  { hz: 396, name: 'Liberation', description: 'Release fear and guilt', chakra: 'Root' },
  { hz: 417, name: 'Change', description: 'Facilitate change, undo past', chakra: 'Sacral' },
  { hz: 432, name: 'Natural Tuning', description: 'Harmony with nature', chakra: 'Heart' },
  { hz: 528, name: 'Miracle', description: 'DNA repair, transformation', chakra: 'Solar Plexus' },
  { hz: 639, name: 'Connection', description: 'Relationships, communication', chakra: 'Heart' },
  { hz: 741, name: 'Expression', description: 'Self-expression, solutions', chakra: 'Throat' },
  { hz: 852, name: 'Intuition', description: 'Inner awareness, insight', chakra: 'Third Eye' },
  { hz: 963, name: 'Transcendence', description: 'Divine connection, oneness', chakra: 'Crown' },
];

function createBinauralBeat(baseHz: number, beatHz: number, targetState: BrainwaveState, durationMin = 20): BinauralBeatConfig {
  return {
    baseFrequencyHz: baseHz,
    beatFrequencyHz: beatHz,
    leftEarHz: baseHz,
    rightEarHz: baseHz + beatHz,
    targetState,
    durationMinutes: durationMin,
  };
}

function getBrainwaveBand(frequencyHz: number): BrainwaveState | null {
  for (const band of BRAINWAVE_BANDS) {
    if (frequencyHz >= band.minHz && frequencyHz < band.maxHz) return band.name;
  }
  if (frequencyHz >= 30 && frequencyHz <= 100) return 'gamma';
  return null;
}

function validateVolumeSafety(volumeDBA: number): { safe: boolean; warning?: string } {
  if (volumeDBA <= 60) return { safe: true };
  if (volumeDBA <= 70) return { safe: true, warning: 'Moderate volume — monitor patient comfort' };
  if (volumeDBA <= 85) return { safe: false, warning: 'Exceeds safe therapy threshold (70 dBA)' };
  return { safe: false, warning: 'DANGEROUS: Risk of hearing damage above 85 dBA' };
}

function calculateExposureIntensity(config: ExposureTherapyConfig, elapsedMin: number): number {
  if (elapsedMin >= config.rampDurationMin) return config.endIntensity;
  const t = elapsedMin / config.rampDurationMin;
  // Ease-in-out for gentler exposure
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return config.startIntensity + (config.endIntensity - config.startIntensity) * eased;
}

function isFrequencySolfeggio(hz: number): boolean {
  return SOLFEGGIO_FREQUENCIES.some(f => f.hz === hz);
}

function getSessionDurationFormatted(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function validateSessionSafety(session: TherapySession): string[] {
  const warnings: string[] = [];
  if (session.maxVolumeDBA > 70) warnings.push('Volume exceeds safe therapy limit (70 dBA)');
  if (session.durationMinutes > 90) warnings.push('Session exceeds recommended 90-minute maximum');
  if (session.layers.length === 0) warnings.push('No audio layers configured');
  if (session.type === 'exposure' && !session.notes.toLowerCase().includes('consent')) {
    warnings.push('Exposure therapy requires documented patient consent');
  }
  return warnings;
}

// ═══════════════════════════════════════════════════════════════════
// 1. Brainwave Entrainment
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Psychotherapy Sound — Brainwave Entrainment', () => {
  it('BRAINWAVE_BANDS covers delta through gamma', () => {
    expect(BRAINWAVE_BANDS).toHaveLength(5);
    expect(BRAINWAVE_BANDS.map(b => b.name)).toEqual(['delta', 'theta', 'alpha', 'beta', 'gamma']);
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
    const band = BRAINWAVE_BANDS.find(b => b.name === 'alpha')!;
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
    const f528 = SOLFEGGIO_FREQUENCIES.find(f => f.hz === 528);
    expect(f528).toBeDefined();
    expect(f528!.name).toBe('Miracle');
  });

  it('432 Hz is natural tuning frequency', () => {
    const f432 = SOLFEGGIO_FREQUENCIES.find(f => f.hz === 432);
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
      id: 's1', patientId: 'p1', therapistId: 't1', type: 'binaural',
      startTime: Date.now(), durationMinutes: 30, maxVolumeDBA: 80,
      layers: [{ id: 'l1', name: 'Binaural', type: 'binaural', volume: 0.5, panLR: 0, fadeInSec: 5, fadeOutSec: 5 }],
      notes: 'Standard session',
    };
    const warnings = validateSessionSafety(session);
    expect(warnings.some(w => w.includes('Volume'))).toBe(true);
  });

  it('validateSessionSafety() warns on sessions > 90 minutes', () => {
    const session: TherapySession = {
      id: 's1', patientId: 'p1', therapistId: 't1', type: 'solfeggio',
      startTime: Date.now(), durationMinutes: 120, maxVolumeDBA: 55,
      layers: [{ id: 'l1', name: 'Tone', type: 'frequency', volume: 0.3, panLR: 0, fadeInSec: 10, fadeOutSec: 10 }],
      notes: 'Extended session',
    };
    const warnings = validateSessionSafety(session);
    expect(warnings.some(w => w.includes('90-minute'))).toBe(true);
  });

  it('validateSessionSafety() warns exposure therapy without consent', () => {
    const session: TherapySession = {
      id: 's1', patientId: 'p1', therapistId: 't1', type: 'exposure',
      startTime: Date.now(), durationMinutes: 30, maxVolumeDBA: 60,
      layers: [{ id: 'l1', name: 'Thunder', type: 'nature', volume: 0.4, panLR: 0, fadeInSec: 30, fadeOutSec: 10 }],
      notes: 'Gradual storm exposure',
    };
    const warnings = validateSessionSafety(session);
    expect(warnings.some(w => w.includes('consent'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Exposure Therapy & Desensitization
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Psychotherapy Sound — Exposure Therapy', () => {
  const config: ExposureTherapyConfig = {
    trigger: 'thunderstorm', startIntensity: 0.05, endIntensity: 0.7,
    rampDurationMin: 20, safeWord: 'stop', maxVolumeDBA: 65,
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

  it.todo('EMDR bilateral audio stimulation (alternating L/R tones)');
  it.todo('real-time heart rate variability (HRV) feedback integration');
  it.todo('guided meditation voice overlay with auto-ducking');
  it.todo('spatial ASMR 3D audio positioning in VR therapy room');
  it.todo('clinical session export to HIPAA-compliant log format');
});
