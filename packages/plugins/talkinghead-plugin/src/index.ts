/**
 * @holoscript/talkinghead-plugin — TalkingHead WebXR lip-sync bridge.
 *
 * Research: ai-ecosystem/research/2026-04-*_talkinghead*.md + memory/talkinghead-*.md
 * Universal-IR coverage row 14 (TalkingHead WebXR lipsync).
 *
 * Scope: viseme track schema, audio ingestion, offline/WebAudio adapter hook,
 * viseme extraction, mapping to @lipsync + @expression traits.
 */

export type Viseme =
  | 'aa'
  | 'E'
  | 'I'
  | 'O'
  | 'U'
  | 'PP'
  | 'FF'
  | 'TH'
  | 'DD'
  | 'kk'
  | 'CH'
  | 'SS'
  | 'nn'
  | 'RR'
  | 'sil';

export interface VisemeEvent {
  viseme: Viseme;
  t_start_ms: number;
  t_end_ms: number;
  intensity?: number; // 0..1 for emphasis
}

export interface TalkingHeadInput {
  clip_id: string;
  duration_ms: number;
  visemes?: VisemeEvent[];
  audio_uri?: string;
  audio_buffer?: AudioBufferLike;
}

export interface AudioBufferLike {
  /** Mono or interleaved sample data (mono preferred) */
  samples: Float32Array;
  sampleRate: number;
  channels: number;
  durationMs: number;
}

export interface HoloLipsyncEmission {
  lipsync: { kind: '@lipsync'; target_id: string; params: Record<string, unknown> };
  viseme_count: number;
  coverage: number; // 0..1 fraction of duration with a viseme event
  warnings: string[];
}

// =============================================================================
// VISEME EXTRACTOR ADAPTER HOOK
// =============================================================================

export interface VisemeExtractor {
  /**
   * Extract viseme events from an audio buffer.
   */
  extract(audio: AudioBufferLike): VisemeEvent[];
}

/**
 * Offline (headless / Node.js) viseme extractor using simple band energy analysis.
 *
 * Heuristic baseline — not phoneme-perfect. Maps frequency band energy to the
 * 15-standard-viseme set. Suitable for compile-time / CI environments where
 * WebAudio is unavailable.
 */
export class OfflineVisemeExtractor implements VisemeExtractor {
  private frameMs: number;
  private silenceThreshold: number;
  private bands: { name: string; low: number; high: number; target: Viseme; sensitivity: number }[];

  constructor(options?: { frameMs?: number; silenceThreshold?: number }) {
    this.frameMs = options?.frameMs ?? 50;
    this.silenceThreshold = options?.silenceThreshold ?? 0.02;

    // Frequency-to-viseme mapping derived from LipSyncTrait.DEFAULT_FREQUENCY_BANDS
    // plus consonant heuristics.
    this.bands = [
      { name: 'subVowel', low: 85, high: 150, target: 'O', sensitivity: 1.2 },
      { name: 'midVowel', low: 150, high: 200, target: 'aa', sensitivity: 1.0 },
      { name: 'highVowel', low: 200, high: 280, target: 'E', sensitivity: 1.1 },
      { name: 'veryHighVowel', low: 280, high: 400, target: 'I', sensitivity: 1.0 },
      { name: 'lowMid', low: 400, high: 1000, target: 'U', sensitivity: 0.8 },
      { name: 'fricative', low: 2000, high: 4000, target: 'FF', sensitivity: 0.7 },
      { name: 'sibilant', low: 4000, high: 8000, target: 'SS', sensitivity: 0.8 },
      { name: 'highFricative', low: 8000, high: 16000, target: 'TH', sensitivity: 0.6 },
    ];
  }

  extract(audio: AudioBufferLike): VisemeEvent[] {
    const frameSamples = Math.floor((audio.sampleRate * this.frameMs) / 1000);
    const frameCount = Math.ceil(audio.samples.length / frameSamples);
    const events: VisemeEvent[] = [];
    let current: VisemeEvent | null = null;

    for (let i = 0; i < frameCount; i++) {
      const startSample = i * frameSamples;
      const endSample = Math.min(startSample + frameSamples, audio.samples.length);
      const frame = audio.samples.subarray(startSample, endSample);
      const tStartMs = i * this.frameMs;
      const tEndMs = Math.min((i + 1) * this.frameMs, audio.durationMs);

      const viseme = this.classifyFrame(frame, audio.sampleRate);

      if (viseme === 'sil') {
        if (current && current.viseme !== 'sil') {
          events.push(current);
          current = null;
        }
        continue;
      }

      if (!current) {
        current = { viseme, t_start_ms: tStartMs, t_end_ms: tEndMs, intensity: 0.5 };
      } else if (current.viseme === viseme) {
        current.t_end_ms = tEndMs;
        current.intensity = Math.min(1, (current.intensity ?? 0) + 0.05);
      } else {
        events.push(current);
        current = { viseme, t_start_ms: tStartMs, t_end_ms: tEndMs, intensity: 0.5 };
      }
    }

    if (current && current.viseme !== 'sil') {
      events.push(current);
    }

    return events;
  }

  private classifyFrame(samples: Float32Array, sampleRate: number): Viseme {
    const energy = this.computeRMS(samples);
    if (energy < this.silenceThreshold) {
      return 'sil';
    }

    // Simple DFT for band energy (small frame, low bin count)
    const binCount = 8;
    const frequencies = this.simpleDFT(samples, binCount);
    const binWidth = sampleRate / (binCount * 2);

    let bestViseme: Viseme = 'sil';
    let bestScore = 0;

    for (const band of this.bands) {
      const lowBin = Math.floor(band.low / binWidth);
      const highBin = Math.min(Math.ceil(band.high / binWidth), binCount - 1);
      if (lowBin >= binCount) continue;

      let bandEnergy = 0;
      let count = 0;
      for (let b = lowBin; b <= highBin && b < binCount; b++) {
        bandEnergy += frequencies[b];
        count++;
      }

      if (count > 0) {
        const normalized = (bandEnergy / count) * band.sensitivity;
        if (normalized > bestScore) {
          bestScore = normalized;
          bestViseme = band.target;
        }
      }
    }

    // Fallback consonants when energy is present but no strong band peaks
    if (bestScore < this.silenceThreshold * 2) {
      const zcr = this.zeroCrossingRate(samples);
      if (zcr > 0.15) return 'SS'; // high zcr → sibilant-ish
      if (zcr > 0.08) return 'CH'; // mid zcr
      return 'nn'; // low zcr, no strong band → neutral consonant
    }

    return bestViseme;
  }

  private computeRMS(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  private zeroCrossingRate(samples: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / samples.length;
  }

  private simpleDFT(samples: Float32Array, binCount: number): Float32Array {
    const magnitudes = new Float32Array(binCount);
    const N = samples.length;
    for (let k = 0; k < binCount; k++) {
      let real = 0;
      let imag = 0;
      for (let n = 0; n < N; n++) {
        const angle = (2 * Math.PI * k * n) / N;
        real += samples[n] * Math.cos(angle);
        imag -= samples[n] * Math.sin(angle);
      }
      magnitudes[k] = Math.sqrt(real * real + imag * imag) / N;
    }
    return magnitudes;
  }
}

/**
 * Browser-side viseme extractor using the Web Audio API.
 *
 * Wraps OfflineAudioContext for render-time extraction. Falls back to
 * OfflineVisemeExtractor if the API is missing (e.g. SSR / Node.js).
 */
export class WebAudioVisemeExtractor implements VisemeExtractor {
  private offlineExtractor: OfflineVisemeExtractor;

  constructor(options?: { frameMs?: number; silenceThreshold?: number }) {
    this.offlineExtractor = new OfflineVisemeExtractor(options);
  }

  /**
   * Fetch audio from `audioURI`, decode via Web Audio API (browser) or
   * node:fs (Node.js), then pipe PCM through OfflineVisemeExtractor.
   *
   * Browser path:  fetch() + AudioContext.decodeAudioData()
   * Node.js path:  node:fs/promises readFile + node-web-audio-api fallback,
   *                or OfflineVisemeExtractor on raw bytes if audio API absent.
   */
  async extractFromURI(audioURI: string): Promise<VisemeEvent[]> {
    // ── 1. Fetch raw bytes ──────────────────────────────────────────────────
    let arrayBuffer: ArrayBuffer;

    if (typeof fetch !== 'undefined') {
      const res = await fetch(audioURI);
      if (!res.ok) {
        throw new Error(
          `WebAudioVisemeExtractor: fetch failed for "${audioURI}" — HTTP ${res.status}`
        );
      }
      arrayBuffer = await res.arrayBuffer();
    } else {
      // Node.js 18+ — file path or file:// URI
      const { readFile } = await import('node:fs/promises');
      const filePath = audioURI.startsWith('file://')
        ? new URL(audioURI).pathname
        : audioURI;
      const buf = await readFile(filePath);
      arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    }

    // ── 2. Decode with Web Audio (browser) or fall back to heuristic ────────
    const AudioCtx: typeof AudioContext | undefined =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : typeof (globalThis as Record<string, unknown>).AudioContext !== 'undefined'
          ? (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext
          : undefined;

    if (!AudioCtx) {
      // No Web Audio available (pure Node.js without polyfill).
      // Best-effort: treat raw bytes as 16-bit PCM at 44100 Hz mono.
      const samples = pcmBytesToFloat32(new Uint8Array(arrayBuffer));
      return this.offlineExtractor.extract({
        samples,
        sampleRate: 44100,
        channels: 1,
        durationMs: (samples.length / 44100) * 1000,
      });
    }

    // ── 3. Decode and convert to AudioBufferLike ─────────────────────────────
    const ctx = new AudioCtx();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      await ctx.close().catch(() => undefined);
    }

    const monoSamples =
      decoded.numberOfChannels > 1
        ? mixToMono(decoded)
        : decoded.getChannelData(0).slice();

    return this.offlineExtractor.extract({
      samples: monoSamples,
      sampleRate: decoded.sampleRate,
      channels: 1,
      durationMs: (decoded.length / decoded.sampleRate) * 1000,
    });
  }

  extract(audio: AudioBufferLike): VisemeEvent[] {
    return this.offlineExtractor.extract(audio);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  const scale = 1 / buffer.numberOfChannels;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i++) {
      mono[i] += channelData[i] * scale;
    }
  }
  return mono;
}

function pcmBytesToFloat32(bytes: Uint8Array): Float32Array {
  // Interpret as little-endian signed 16-bit PCM (WAV default)
  const samples = new Float32Array(Math.floor(bytes.length / 2));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

// =============================================================================
// CORE PIPELINE
// =============================================================================

export function mapTalkingHead(input: TalkingHeadInput): HoloLipsyncEmission {
  const warnings: string[] = [];
  let visemes = input.visemes ?? [];

  // If audio buffer is provided but no visemes, auto-extract via offline hook
  if (visemes.length === 0 && input.audio_buffer) {
    const extractor = new OfflineVisemeExtractor();
    visemes = extractor.extract(input.audio_buffer);
  }

  if (!visemes.length && input.audio_uri && !input.audio_buffer) {
    warnings.push('audio_uri provided but no audio_buffer for offline extraction');
  }

  let covered_ms = 0;
  const sorted = [...visemes].sort((a, b) => a.t_start_ms - b.t_start_ms);
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    if (v.t_end_ms <= v.t_start_ms) {
      warnings.push(`viseme ${i} has non-positive duration`);
      continue;
    }
    covered_ms += v.t_end_ms - v.t_start_ms;
    if (i > 0 && sorted[i - 1].t_end_ms > v.t_start_ms) {
      warnings.push(`visemes ${i - 1} and ${i} overlap`);
    }
  }

  // Silence / gap detection
  if (sorted.length > 0) {
    let gapMs = 0;
    // Gap before first viseme
    if (sorted[0].t_start_ms > 0) {
      gapMs += sorted[0].t_start_ms;
    }
    // Gaps between visemes
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1].t_end_ms;
      const currStart = sorted[i].t_start_ms;
      if (currStart > prevEnd) {
        gapMs += currStart - prevEnd;
      }
    }
    // Gap after last viseme
    const lastEnd = sorted[sorted.length - 1].t_end_ms;
    if (lastEnd < input.duration_ms) {
      gapMs += input.duration_ms - lastEnd;
    }
    if (gapMs > 0) {
      warnings.push(`silence gaps cover ${((gapMs / input.duration_ms) * 100).toFixed(1)}% of duration`);
    }
  } else if (input.duration_ms > 0) {
    warnings.push('no viseme events — full silence');
  }

  const coverage = input.duration_ms > 0 ? covered_ms / input.duration_ms : 0;
  return {
    lipsync: {
      kind: '@lipsync',
      target_id: input.clip_id,
      params: {
        duration_ms: input.duration_ms,
        viseme_events: sorted,
        audio_uri: input.audio_uri,
      },
    },
    viseme_count: sorted.length,
    coverage,
    warnings,
  };
}
