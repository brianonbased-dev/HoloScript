/**
 * audioSync.ts — Audio-Visual Synchronization
 *
 * Sync animations, particles, and scene events to audio beats and waveforms.
 */

export interface AudioAnalysis {
  bpm: number;
  beats: number[]; // Timestamps in seconds
  waveform: Float32Array | number[];
  spectrum: Float32Array | number[];
  duration: number;
  sampleRate: number;
}

export interface BeatEvent {
  time: number;
  strength: number; // 0..1 normalized beat strength
  index: number;
}

export interface SyncBinding {
  id: string;
  targetProperty: string; // e.g., 'scale.x', 'emissionRate', 'color.r'
  source: 'beat' | 'amplitude' | 'frequency-band';
  band?: number; // Frequency band index (for 'frequency-band')
  scale: number; // Multiplier
  offset: number; // Base value
  smoothing: number; // 0..1 (0 = instant, 1 = very smooth)
}

/**
 * Detect beats from an amplitude envelope (simple threshold-based).
 */
export function detectBeats(
  amplitudes: number[],
  sampleRate: number,
  threshold: number = 0.6,
  minIntervalMs: number = 200
): BeatEvent[] {
  const beats: BeatEvent[] = [];
  const minSamples = (minIntervalMs / 1000) * sampleRate;
  let lastBeatSample = -minSamples;

  for (let i = 1; i < amplitudes.length; i++) {
    if (
      amplitudes[i] >= threshold &&
      amplitudes[i] > amplitudes[i - 1] &&
      i - lastBeatSample >= minSamples
    ) {
      beats.push({
        time: i / sampleRate,
        strength: Math.min(1, amplitudes[i]),
        index: beats.length,
      });
      lastBeatSample = i;
    }
  }
  return beats;
}

/**
 * Estimate BPM from beat events.
 */
export function estimateBPM(beats: BeatEvent[]): number {
  if (beats.length < 2) return 0;
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    intervals.push(beats[i].time - beats[i - 1].time);
  }
  const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  return avgInterval > 0 ? Math.round(60 / avgInterval) : 0;
}

/**
 * Get the beat index at a playback time.
 */
export function beatAtTime(beats: BeatEvent[], time: number): BeatEvent | null {
  for (let i = beats.length - 1; i >= 0; i--) {
    if (beats[i].time <= time) return beats[i];
  }
  return null;
}

/**
 * Calculate time until next beat.
 */
export function timeToNextBeat(beats: BeatEvent[], time: number): number {
  for (const beat of beats) {
    if (beat.time > time) return beat.time - time;
  }
  return Infinity;
}

/**
 * Apply a sync binding to produce a value from audio data.
 */
export function applySyncBinding(
  binding: SyncBinding,
  amplitude: number,
  frequencyBands: number[]
): number {
  let raw = 0;
  switch (binding.source) {
    case 'beat':
    case 'amplitude':
      raw = amplitude;
      break;
    case 'frequency-band':
      raw = frequencyBands[binding.band ?? 0] ?? 0;
      break;
  }
  return binding.offset + raw * binding.scale;
}

/**
 * Smooth a value over time (exponential moving average).
 */
export function smoothValue(current: number, target: number, smoothing: number): number {
  const factor = Math.max(0, Math.min(1, smoothing));
  return current + (target - current) * (1 - factor);
}

/**
 * Create a sync binding.
 */
export function createSyncBinding(
  targetProperty: string,
  source: SyncBinding['source'],
  scale: number = 1,
  offset: number = 0
): SyncBinding {
  return {
    id: `sync-${Date.now().toString(36)}`,
    targetProperty,
    source,
    scale,
    offset,
    smoothing: 0.3,
  };
}
