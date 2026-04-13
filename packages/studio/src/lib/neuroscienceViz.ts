/**
 * neuroscienceViz.ts — Neuroscience Visualization Engine
 *
 * Brain region mapping, EEG frequency band analysis, neural pathway
 * visualization, cognitive load estimation, and brainwave state detection.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type BrainRegion =
  | 'frontal'
  | 'parietal'
  | 'temporal'
  | 'occipital'
  | 'cerebellum'
  | 'brainstem'
  | 'limbic';
export type Hemisphere = 'left' | 'right' | 'bilateral';
export type EEGBand = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';
export type CognitiveState =
  | 'deep-sleep'
  | 'light-sleep'
  | 'relaxed'
  | 'focused'
  | 'stressed'
  | 'flow'
  | 'meditative';

export interface BrainArea {
  id: string;
  name: string;
  region: BrainRegion;
  hemisphere: Hemisphere;
  position: Vec3;
  functions: string[];
  brodmannArea?: number;
}

export interface EEGChannel {
  id: string;
  electrode: string; // 10-20 system: Fp1, Fp2, F3, etc.
  region: BrainRegion;
  hemisphere: Hemisphere;
  signal: number[]; // Raw µV samples
  sampleRateHz: number;
}

export interface BandPower {
  delta: number; // 0.5-4 Hz
  theta: number; // 4-8 Hz
  alpha: number; // 8-13 Hz
  beta: number; // 13-30 Hz
  gamma: number; // 30-100 Hz
}

export interface NeuralPathway {
  id: string;
  name: string;
  source: string; // BrainArea ID
  target: string;
  strength: number; // 0-1 (connectivity)
  neurotransmitter: string;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

export const EEG_BANDS: Record<EEGBand, { minHz: number; maxHz: number; label: string }> = {
  delta: { minHz: 0.5, maxHz: 4, label: 'Delta (0.5-4 Hz) — Deep sleep' },
  theta: { minHz: 4, maxHz: 8, label: 'Theta (4-8 Hz) — Drowsy/creative' },
  alpha: { minHz: 8, maxHz: 13, label: 'Alpha (8-13 Hz) — Relaxed/aware' },
  beta: { minHz: 13, maxHz: 30, label: 'Beta (13-30 Hz) — Active/focused' },
  gamma: { minHz: 30, maxHz: 100, label: 'Gamma (30-100 Hz) — High cognition' },
};

export const BRAIN_REGIONS: BrainArea[] = [
  {
    id: 'prefrontal',
    name: 'Prefrontal Cortex',
    region: 'frontal',
    hemisphere: 'bilateral',
    position: [0, 0.8, 0.9],
    functions: ['decision-making', 'planning', 'personality'],
    brodmannArea: 10,
  },
  {
    id: 'broca',
    name: "Broca's Area",
    region: 'frontal',
    hemisphere: 'left',
    position: [-0.5, 0.3, 0.6],
    functions: ['speech production', 'language'],
    brodmannArea: 44,
  },
  {
    id: 'motor',
    name: 'Primary Motor Cortex',
    region: 'frontal',
    hemisphere: 'bilateral',
    position: [0, 0.5, 0.8],
    functions: ['voluntary movement'],
    brodmannArea: 4,
  },
  {
    id: 'somatosensory',
    name: 'Somatosensory Cortex',
    region: 'parietal',
    hemisphere: 'bilateral',
    position: [0, 0.5, 0.4],
    functions: ['touch', 'proprioception'],
    brodmannArea: 1,
  },
  {
    id: 'wernicke',
    name: "Wernicke's Area",
    region: 'temporal',
    hemisphere: 'left',
    position: [-0.6, 0, 0.2],
    functions: ['language comprehension'],
    brodmannArea: 22,
  },
  {
    id: 'auditory',
    name: 'Auditory Cortex',
    region: 'temporal',
    hemisphere: 'bilateral',
    position: [-0.7, 0, 0.3],
    functions: ['hearing', 'sound processing'],
    brodmannArea: 41,
  },
  {
    id: 'visual',
    name: 'Primary Visual Cortex',
    region: 'occipital',
    hemisphere: 'bilateral',
    position: [0, -0.8, 0.2],
    functions: ['vision', 'spatial processing'],
    brodmannArea: 17,
  },
  {
    id: 'hippocampus',
    name: 'Hippocampus',
    region: 'limbic',
    hemisphere: 'bilateral',
    position: [0.3, -0.2, -0.1],
    functions: ['memory formation', 'navigation'],
  },
  {
    id: 'amygdala',
    name: 'Amygdala',
    region: 'limbic',
    hemisphere: 'bilateral',
    position: [0.3, -0.1, -0.2],
    functions: ['emotion', 'fear response'],
  },
];

// ═══════════════════════════════════════════════════════════════════
// EEG Analysis
// ═══════════════════════════════════════════════════════════════════

export function dominantBand(power: BandPower): EEGBand {
  const entries = Object.entries(power) as [EEGBand, number][];
  return entries.reduce((max, [band, val]) => (val > max[1] ? [band, val] : max), entries[0])[0];
}

export function totalPower(power: BandPower): number {
  return power.delta + power.theta + power.alpha + power.beta + power.gamma;
}

export function relativePower(power: BandPower, band: EEGBand): number {
  const total = totalPower(power);
  return total > 0 ? power[band] / total : 0;
}

export function detectCognitiveState(power: BandPower): CognitiveState {
  const dominant = dominantBand(power);
  const alphaRatio = relativePower(power, 'alpha');
  const betaRatio = relativePower(power, 'beta');
  const thetaRatio = relativePower(power, 'theta');

  if (dominant === 'delta') return 'deep-sleep';
  if (dominant === 'theta' && thetaRatio > 0.4) return 'light-sleep';
  if (dominant === 'alpha' && alphaRatio > 0.4) return 'relaxed';
  if (dominant === 'gamma') return 'flow';
  if (dominant === 'beta' && betaRatio > 0.5) return 'stressed';
  if (dominant === 'beta') return 'focused';
  if (dominant === 'alpha') return 'meditative';
  return 'relaxed';
}

// ═══════════════════════════════════════════════════════════════════
// Brain Region Helpers
// ═══════════════════════════════════════════════════════════════════

export function getRegionById(id: string): BrainArea | undefined {
  return BRAIN_REGIONS.find((r) => r.id === id);
}

export function regionsByFunction(fn: string): BrainArea[] {
  return BRAIN_REGIONS.filter((r) => r.functions.some((f) => f.includes(fn)));
}

export function regionsByHemisphere(hemisphere: Hemisphere): BrainArea[] {
  return BRAIN_REGIONS.filter((r) => r.hemisphere === hemisphere);
}

export function pathwayStrength(pathways: NeuralPathway[]): number {
  if (pathways.length === 0) return 0;
  return pathways.reduce((sum, p) => sum + p.strength, 0) / pathways.length;
}

// ═══════════════════════════════════════════════════════════════════
// fMRI — Blood Oxygen Level (BOLD)
// ═══════════════════════════════════════════════════════════════════

export interface BOLDSignal {
  regionId: string;
  activation: number; // 0-1 normalized
  timeSeconds: number;
}

/**
 * Simulates BOLD signal for a brain region given stimulus.
 * Uses canonical hemodynamic response function (HRF).
 */
export function fmriBoldResponse(
  stimulusOnsetSec: number,
  durationSec: number,
  regionActivation: number,
  sampleRateHz: number = 1
): BOLDSignal[] {
  const signals: BOLDSignal[] = [];
  const totalTime = stimulusOnsetSec + durationSec + 20; // 20s for response to decay
  for (let t = 0; t < totalTime; t += 1 / sampleRateHz) {
    const tRel = t - stimulusOnsetSec;
    let activation = 0;
    if (tRel >= 0 && tRel < durationSec + 10) {
      // Gamma-function HRF approximation: peak at ~5s, undershoot at ~15s
      const peak = regionActivation * (tRel / 5) * Math.exp(-(tRel - 5) / 3);
      activation = Math.max(0, Math.min(1, peak));
    }
    signals.push({ regionId: '', activation, timeSeconds: t });
  }
  return signals;
}

/**
 * Builds a connectivity matrix from neural pathways.
 * Returns source→target strength mapping.
 */
export function connectomeMatrix(pathways: NeuralPathway[]): Map<string, Map<string, number>> {
  const matrix = new Map<string, Map<string, number>>();
  for (const p of pathways) {
    if (!matrix.has(p.source)) matrix.set(p.source, new Map());
    matrix.get(p.source)!.set(p.target, p.strength);
  }
  return matrix;
}
