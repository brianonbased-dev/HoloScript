/**
 * therapeuticAudio.ts — Production Therapeutic Audio Engine
 *
 * Clinical audio design: brainwave entrainment, binaural beats,
 * solfeggio frequencies, exposure therapy, volume safety,
 * session management, and HIPAA-compliant exports.
 *
 * Used by: TherapySessionPanel, psychotherapy-sound scenario
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type BrainwaveState = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';

export interface BrainwaveBand {
  name: BrainwaveState;
  minHz: number;
  maxHz: number;
  description: string;
  therapeuticUse: string;
}

export interface BinauralBeatConfig {
  baseFrequencyHz: number;
  beatFrequencyHz: number;
  leftEarHz: number;
  rightEarHz: number;
  targetState: BrainwaveState;
  durationMinutes: number;
}

export interface SolfeggioFrequency {
  hz: number;
  name: string;
  description: string;
  chakra?: string;
}

export interface AudioLayer {
  id: string;
  name: string;
  type: 'binaural' | 'nature' | 'music' | 'voice' | 'noise' | 'frequency';
  volume: number; // 0-1
  panLR: number; // -1 (left) to 1 (right)
  fadeInSec: number;
  fadeOutSec: number;
}

export interface TherapySession {
  id: string;
  patientId: string;
  therapistId: string;
  type: 'binaural' | 'solfeggio' | 'asmr' | 'guided' | 'exposure' | 'emdr';
  startTime: number;
  durationMinutes: number;
  maxVolumeDBA: number;
  layers: AudioLayer[];
  notes: string;
}

export interface ExposureTherapyConfig {
  trigger: string;
  startIntensity: number; // 0-1
  endIntensity: number;
  rampDurationMin: number;
  safeWord: string;
  maxVolumeDBA: number;
}

export interface VolumeSafetyResult {
  safe: boolean;
  warning?: string;
}

export interface EMDRConfig {
  toneHz: number;
  durationMs: number;
  intervalMs: number;
  pattern: readonly ('left' | 'right')[];
}

export interface HRVReading {
  bpm: number;
  hrv: number;
  stress: number; // 0-1
}

export interface SpatialAudioSource {
  id: string;
  position: { x: number; y: number; z: number };
  type: 'nature' | 'voice' | 'frequency' | 'noise';
}

export interface HIPAAExport {
  sessionId: string;
  patientId: string; // redacted
  type: string;
  durationMinutes: number;
  layerCount: number;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

export const BRAINWAVE_BANDS: BrainwaveBand[] = [
  {
    name: 'delta',
    minHz: 0.5,
    maxHz: 4,
    description: 'Deep sleep',
    therapeuticUse: 'Insomnia, deep rest, healing',
  },
  {
    name: 'theta',
    minHz: 4,
    maxHz: 8,
    description: 'Meditation, creativity',
    therapeuticUse: 'PTSD, anxiety, creativity enhancement',
  },
  {
    name: 'alpha',
    minHz: 8,
    maxHz: 13,
    description: 'Relaxed awareness',
    therapeuticUse: 'Stress reduction, mindfulness, pain management',
  },
  {
    name: 'beta',
    minHz: 13,
    maxHz: 30,
    description: 'Active thinking',
    therapeuticUse: 'ADHD focus training, cognitive therapy',
  },
  {
    name: 'gamma',
    minHz: 30,
    maxHz: 100,
    description: 'Higher cognition',
    therapeuticUse: 'Memory recall, peak performance',
  },
];

export const SOLFEGGIO_FREQUENCIES: SolfeggioFrequency[] = [
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

export const SAFE_VOLUME_THRESHOLD_DBA = 70;
export const MAX_SESSION_MINUTES = 90;

// ═══════════════════════════════════════════════════════════════════
// Binaural Beat Generation
// ═══════════════════════════════════════════════════════════════════

export function createBinauralBeat(
  baseHz: number,
  beatHz: number,
  targetState: BrainwaveState,
  durationMin = 20
): BinauralBeatConfig {
  return {
    baseFrequencyHz: baseHz,
    beatFrequencyHz: beatHz,
    leftEarHz: baseHz,
    rightEarHz: baseHz + beatHz,
    targetState,
    durationMinutes: durationMin,
  };
}

export function getBrainwaveBand(frequencyHz: number): BrainwaveState | null {
  for (const band of BRAINWAVE_BANDS) {
    if (frequencyHz >= band.minHz && frequencyHz < band.maxHz) return band.name;
  }
  if (frequencyHz >= 30 && frequencyHz <= 100) return 'gamma';
  return null;
}

export function isFrequencySolfeggio(hz: number): boolean {
  return SOLFEGGIO_FREQUENCIES.some((f) => f.hz === hz);
}

// ═══════════════════════════════════════════════════════════════════
// Safety & Validation
// ═══════════════════════════════════════════════════════════════════

export function validateVolumeSafety(volumeDBA: number): VolumeSafetyResult {
  if (volumeDBA <= 60) return { safe: true };
  if (volumeDBA <= 70) return { safe: true, warning: 'Moderate volume — monitor patient comfort' };
  if (volumeDBA <= 85) return { safe: false, warning: 'Exceeds safe therapy threshold (70 dBA)' };
  return { safe: false, warning: 'DANGEROUS: Risk of hearing damage above 85 dBA' };
}

export function validateSessionSafety(session: TherapySession): string[] {
  const warnings: string[] = [];
  if (session.maxVolumeDBA > SAFE_VOLUME_THRESHOLD_DBA)
    warnings.push('Volume exceeds safe therapy limit (70 dBA)');
  if (session.durationMinutes > MAX_SESSION_MINUTES)
    warnings.push('Session exceeds recommended 90-minute maximum');
  if (session.layers.length === 0) warnings.push('No audio layers configured');
  if (session.type === 'exposure' && !session.notes.toLowerCase().includes('consent')) {
    warnings.push('Exposure therapy requires documented patient consent');
  }
  return warnings;
}

// ═══════════════════════════════════════════════════════════════════
// Exposure Therapy
// ═══════════════════════════════════════════════════════════════════

export function calculateExposureIntensity(
  config: ExposureTherapyConfig,
  elapsedMin: number
): number {
  if (elapsedMin >= config.rampDurationMin) return config.endIntensity;
  const t = elapsedMin / config.rampDurationMin;
  // Ease-in-out for gentler exposure
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return config.startIntensity + (config.endIntensity - config.startIntensity) * eased;
}

// ═══════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════

export function getSessionDurationFormatted(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function redactPatientPII(patientId: string): string {
  return patientId.replace(/\d/g, 'X');
}

export function exportSessionHIPAA(session: TherapySession): HIPAAExport {
  return {
    sessionId: session.id,
    patientId: redactPatientPII(session.patientId),
    type: session.type,
    durationMinutes: session.durationMinutes,
    layerCount: session.layers.length,
    timestamp: new Date(session.startTime).toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════
// EMDR & HRV Integration
// ═══════════════════════════════════════════════════════════════════

export function createEMDRPattern(cycles = 4): EMDRConfig {
  const pattern: ('left' | 'right')[] = [];
  for (let i = 0; i < cycles; i++) {
    pattern.push(i % 2 === 0 ? 'left' : 'right');
  }
  return {
    toneHz: 440,
    durationMs: 500,
    intervalMs: 1000,
    pattern,
  };
}

export function emdrPanValues(pattern: readonly ('left' | 'right')[]): number[] {
  return pattern.map((p) => (p === 'left' ? -1 : 1));
}

export function hrvIntensityMultiplier(reading: HRVReading): number {
  return reading.stress > 0.5 ? 0.5 : 1.0;
}

export function calculateAutoDucking(
  musicVolume: number,
  voiceActive: boolean,
  duckAmount = 0.4
): number {
  return voiceActive ? musicVolume * duckAmount : musicVolume;
}
