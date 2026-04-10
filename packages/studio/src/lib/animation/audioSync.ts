import { logger } from '@/lib/logger';
/**
 * audioSync.ts — Audio Sync for TikTok Sounds & Beat Detection
 *
 * MEME-007: Sync animations to audio beats
 * Priority: High | Estimate: 8 hours
 *
 * Features:
 * - Audio file import and playback
 * - Waveform visualization
 * - Beat detection (Web Audio API)
 * - Timeline markers
 * - Snap-to-beat tooling
 * - BPM analysis
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AudioAnalysis {
  duration: number; // seconds
  sampleRate: number;
  bpm: number; // beats per minute
  beats: Beat[];
  waveform: Float32Array;
  peaks: number[];
}

export interface Beat {
  time: number; // seconds
  strength: number; // 0-1
  index: number;
}

export interface TimelineMarker {
  id: string;
  time: number; // seconds
  label: string;
  type: 'beat' | 'section' | 'custom';
  color?: string;
}

export interface AudioSyncConfig {
  /**
   * Beat detection sensitivity (0-1)
   * Higher = more beats detected
   * Default: 0.5
   */
  sensitivity?: number;

  /**
   * Minimum time between beats (ms)
   * Default: 300ms (200 BPM max)
   */
  minBeatInterval?: number;

  /**
   * Waveform resolution (samples per pixel)
   * Default: 512
   */
  waveformResolution?: number;

  /**
   * Enable auto-BPM detection
   * Default: true
   */
  autoBPM?: boolean;
}

// ─── Audio Sync Manager ──────────────────────────────────────────────────────

export class AudioSyncManager {
  private audioContext: AudioContext;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private analyserNode: AnalyserNode;
  private gainNode: GainNode;

  private isPlaying = false;
  private startTime = 0;
  private pausedAt = 0;

  private analysis: AudioAnalysis | null = null;
  private markers: TimelineMarker[] = [];
  private config: Required<AudioSyncConfig>;

  // Animation callbacks
  private beatCallbacks: Array<(beat: Beat) => void> = [];
  private updateCallbacks: Array<(currentTime: number) => void> = [];

  constructor(config: AudioSyncConfig = {}) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error('AudioContext not supported');
    this.audioContext = new AudioCtx();

    this.config = {
      sensitivity: config.sensitivity ?? 0.5,
      minBeatInterval: config.minBeatInterval ?? 300,
      waveformResolution: config.waveformResolution ?? 512,
      autoBPM: config.autoBPM ?? true,
    };

    // Create audio graph
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;

    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.analyserNode.connect(this.gainNode);
  }

  /**
   * Load audio file
   */
  async loadAudio(file: File): Promise<AudioAnalysis> {
    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    logger.debug('[AudioSync] Loaded audio:', {
      duration: this.audioBuffer.duration,
      sampleRate: this.audioBuffer.sampleRate,
      channels: this.audioBuffer.numberOfChannels,
    });

    // Analyze audio
    this.analysis = await this.analyzeAudio(this.audioBuffer);

    // Auto-create beat markers
    if (this.config.autoBPM) {
      this.createBeatMarkers();
    }

    return this.analysis;
  }

  /**
   * Load audio from URL
   */
  async loadAudioFromUrl(url: string): Promise<AudioAnalysis> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    this.analysis = await this.analyzeAudio(this.audioBuffer);

    if (this.config.autoBPM) {
      this.createBeatMarkers();
    }

    return this.analysis;
  }

  /**
   * Analyze audio for beats and waveform
   */
  private async analyzeAudio(buffer: AudioBuffer): Promise<AudioAnalysis> {
    const channelData = buffer.getChannelData(0); // Use first channel
    const sampleRate = buffer.sampleRate;
    const duration = buffer.duration;

    // Generate waveform
    const waveform = this.generateWaveform(channelData, this.config.waveformResolution);

    // Detect beats
    const beats = this.detectBeats(channelData, sampleRate);

    // Calculate BPM from beats
    const bpm = this.calculateBPM(beats, duration);

    // Find peaks for visualization
    const peaks = this.findPeaks(channelData, sampleRate, 100);

    logger.debug('[AudioSync] Analysis complete:', {
      beats: beats.length,
      bpm: bpm.toFixed(2),
      peaks: peaks.length,
    });

    return {
      duration,
      sampleRate,
      bpm,
      beats,
      waveform,
      peaks,
    };
  }

  /**
   * Generate waveform data for visualization
   */
  private generateWaveform(channelData: Float32Array, resolution: number): Float32Array {
    const blockSize = Math.floor(channelData.length / resolution);
    const waveform = new Float32Array(resolution);

    for (let i = 0; i < resolution; i++) {
      const start = blockSize * i;
      let sum = 0;

      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channelData[start + j]);
      }

      waveform[i] = sum / blockSize;
    }

    return waveform;
  }

  /**
   * Detect beats using energy-based algorithm
   */
  private detectBeats(channelData: Float32Array, sampleRate: number): Beat[] {
    const beats: Beat[] = [];
    const windowSize = Math.floor(sampleRate * 0.1); // 100ms window
    const minInterval = Math.floor((this.config.minBeatInterval / 1000) * sampleRate);

    let lastBeatIndex = -minInterval;

    for (let i = windowSize; i < channelData.length - windowSize; i += windowSize / 2) {
      // Calculate energy in window
      let energy = 0;
      for (let j = i; j < i + windowSize && j < channelData.length; j++) {
        energy += channelData[j] * channelData[j];
      }
      energy = Math.sqrt(energy / windowSize);

      // Calculate average energy in previous windows
      let avgEnergy = 0;
      const historySize = 20;
      for (let h = 1; h <= historySize; h++) {
        const historyStart = i - h * windowSize;
        if (historyStart < 0) break;

        let historyEnergy = 0;
        for (let j = historyStart; j < historyStart + windowSize && j < channelData.length; j++) {
          historyEnergy += channelData[j] * channelData[j];
        }
        avgEnergy += Math.sqrt(historyEnergy / windowSize);
      }
      avgEnergy /= historySize;

      // Detect beat if energy exceeds threshold
      const threshold = avgEnergy * (1 + this.config.sensitivity);

      if (energy > threshold && i - lastBeatIndex >= minInterval) {
        beats.push({
          time: i / sampleRate,
          strength: Math.min(energy / (avgEnergy * 2), 1),
          index: beats.length,
        });
        lastBeatIndex = i;
      }
    }

    return beats;
  }

  /**
   * Calculate BPM from detected beats
   */
  private calculateBPM(beats: Beat[], duration: number): number {
    if (beats.length < 2) return 0;

    // Calculate average interval between beats
    let totalInterval = 0;
    for (let i = 1; i < beats.length; i++) {
      totalInterval += beats[i].time - beats[i - 1].time;
    }

    const avgInterval = totalInterval / (beats.length - 1);
    const bpm = 60 / avgInterval;

    return bpm;
  }

  /**
   * Find amplitude peaks
   */
  private findPeaks(channelData: Float32Array, sampleRate: number, maxPeaks: number): number[] {
    const peaks: Array<{ time: number; amplitude: number }> = [];
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms window

    for (let i = windowSize; i < channelData.length - windowSize; i += windowSize) {
      let max = 0;
      let maxIndex = i;

      for (let j = i; j < i + windowSize; j++) {
        const amp = Math.abs(channelData[j]);
        if (amp > max) {
          max = amp;
          maxIndex = j;
        }
      }

      if (max > 0.3) {
        // Threshold for peak
        peaks.push({ time: maxIndex / sampleRate, amplitude: max });
      }
    }

    // Sort by amplitude and take top N
    peaks.sort((a, b) => b.amplitude - a.amplitude);
    return peaks.slice(0, maxPeaks).map((p) => p.time);
  }

  /**
   * Create beat markers from analysis
   */
  private createBeatMarkers(): void {
    if (!this.analysis) return;

    this.markers = this.analysis.beats.map((beat, i) => ({
      id: `beat-${i}`,
      time: beat.time,
      label: `Beat ${i + 1}`,
      type: 'beat' as const,
      color: beat.strength > 0.7 ? '#ff0000' : '#888888',
    }));

    logger.debug(`[AudioSync] Created ${this.markers.length} beat markers`);
  }

  /**
   * Play audio
   */
  play(): void {
    if (!this.audioBuffer || this.isPlaying) return;

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.analyserNode);

    const offset = this.pausedAt;
    this.sourceNode.start(0, offset);
    this.startTime = this.audioContext.currentTime - offset;
    this.isPlaying = true;

    logger.debug('[AudioSync] Playing from', offset.toFixed(2), 's');

    // Monitor playback for beat triggers
    this.monitorPlayback();
  }

  /**
   * Pause audio
   */
  pause(): void {
    if (!this.isPlaying || !this.sourceNode) return;

    this.sourceNode.stop();
    this.pausedAt = this.audioContext.currentTime - this.startTime;
    this.isPlaying = false;

    logger.debug('[AudioSync] Paused at', this.pausedAt.toFixed(2), 's');
  }

  /**
   * Stop audio and reset
   */
  stop(): void {
    if (this.sourceNode) {
      this.sourceNode.stop();
    }
    this.isPlaying = false;
    this.pausedAt = 0;
    this.startTime = 0;
  }

  /**
   * Seek to time
   */
  seek(time: number): void {
    const wasPlaying = this.isPlaying;
    this.stop();
    this.pausedAt = time;
    if (wasPlaying) {
      this.play();
    }
  }

  /**
   * Monitor playback and trigger beat callbacks
   */
  private monitorPlayback(): void {
    if (!this.isPlaying || !this.analysis) return;

    const currentTime = this.getCurrentTime();

    // Trigger update callbacks
    this.updateCallbacks.forEach((cb) => cb(currentTime));

    // Check for beats
    const upcomingBeats = this.analysis.beats.filter(
      (beat) => beat.time >= currentTime && beat.time < currentTime + 0.1
    );

    upcomingBeats.forEach((beat) => {
      this.beatCallbacks.forEach((cb) => cb(beat));
    });

    // Continue monitoring
    requestAnimationFrame(() => this.monitorPlayback());
  }

  /**
   * Get current playback time
   */
  getCurrentTime(): number {
    if (!this.isPlaying) return this.pausedAt;
    return this.audioContext.currentTime - this.startTime;
  }

  /**
   * Snap time to nearest beat
   */
  snapToBeat(time: number): number {
    if (!this.analysis || this.analysis.beats.length === 0) return time;

    let nearestBeat = this.analysis.beats[0];
    let minDistance = Math.abs(time - nearestBeat.time);

    for (const beat of this.analysis.beats) {
      const distance = Math.abs(time - beat.time);
      if (distance < minDistance) {
        minDistance = distance;
        nearestBeat = beat;
      }
    }

    return nearestBeat.time;
  }

  /**
   * Get beat at time (within threshold)
   */
  getBeatAtTime(time: number, threshold = 0.1): Beat | null {
    if (!this.analysis) return null;

    return this.analysis.beats.find((beat) => Math.abs(beat.time - time) < threshold) || null;
  }

  /**
   * Add timeline marker
   */
  addMarker(marker: Omit<TimelineMarker, 'id'>): string {
    const id = `marker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.markers.push({ ...marker, id });
    return id;
  }

  /**
   * Remove timeline marker
   */
  removeMarker(id: string): void {
    this.markers = this.markers.filter((m) => m.id !== id);
  }

  /**
   * Get all markers
   */
  getMarkers(): TimelineMarker[] {
    return [...this.markers];
  }

  /**
   * Register beat callback
   */
  onBeat(callback: (beat: Beat) => void): () => void {
    this.beatCallbacks.push(callback);
    return () => {
      this.beatCallbacks = this.beatCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Register update callback
   */
  onUpdate(callback: (currentTime: number) => void): () => void {
    this.updateCallbacks.push(callback);
    return () => {
      this.updateCallbacks = this.updateCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Get audio analysis
   */
  getAnalysis(): AudioAnalysis | null {
    return this.analysis;
  }

  /**
   * Set volume
   */
  setVolume(volume: number): void {
    this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.stop();
    this.beatCallbacks = [];
    this.updateCallbacks = [];
    this.markers = [];
    this.audioContext.close();
  }
}

// ─── React Hook ──────────────────────────────────────────────────────────────

/**
 * React hook for audio sync
 */
export function useAudioSync(config?: AudioSyncConfig) {
  const [manager, setManager] = React.useState<AudioSyncManager | null>(null);
  const [analysis, setAnalysis] = React.useState<AudioAnalysis | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);

  React.useEffect(() => {
    const audioManager = new AudioSyncManager(config);
    setManager(audioManager);

    return () => {
      audioManager.dispose();
    };
  }, [config]);

  React.useEffect(() => {
    if (!manager) return;

    const unsubscribe = manager.onUpdate((time) => {
      setCurrentTime(time);
    });

    return unsubscribe;
  }, [manager]);

  const loadAudio = React.useCallback(
    async (file: File) => {
      if (!manager) return null;
      const result = await manager.loadAudio(file);
      setAnalysis(result);
      return result;
    },
    [manager]
  );

  const play = React.useCallback(() => {
    manager?.play();
    setIsPlaying(true);
  }, [manager]);

  const pause = React.useCallback(() => {
    manager?.pause();
    setIsPlaying(false);
  }, [manager]);

  const stop = React.useCallback(() => {
    manager?.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  }, [manager]);

  const seek = React.useCallback(
    (time: number) => {
      manager?.seek(time);
      setCurrentTime(time);
    },
    [manager]
  );

  return {
    manager,
    analysis,
    isPlaying,
    currentTime,
    loadAudio,
    play,
    pause,
    stop,
    seek,
  };
}

// Lazy React import
let React: typeof import('react');
if (typeof window !== 'undefined') {
  React = require('react');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export default AudioSyncManager;
