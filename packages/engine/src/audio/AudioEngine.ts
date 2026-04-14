import type { Vector3 } from '@holoscript/core';
/**
 * AudioEngine.ts
 *
 * Core spatial audio engine for HoloScript+.
 * Manages 3D listener position, audio sources with distance attenuation,
 * and provides a unified API for positional sound in VR.
 *
 * Note: This is a *simulation* layer that models spatial audio behavior.
 * In production, it delegates to Web Audio API (AudioContext/PannerNode).
 * For testing and headless environments, all state is tracked internally.
 */

// =============================================================================
// TYPES
// =============================================================================

export type DistanceModel = 'linear' | 'inverse' | 'exponential';

export interface AudioSourceConfig {
  id: string;
  position: Vector3;
  volume: number; // 0-1
  pitch: number; // Playback rate multiplier
  loop: boolean;
  maxDistance: number; // Distance at which sound is silent
  refDistance: number; // Distance at which sound is at full volume
  rolloffFactor: number; // How quickly volume drops off
  distanceModel: DistanceModel;
  channel: string; // Mixer channel name
  spatialize: boolean; // Enable 3D spatialization
}

export interface AudioSource {
  config: AudioSourceConfig;
  isPlaying: boolean;
  currentTime: number; // Simulated playback position
  computedVolume: number; // After distance attenuation
  computedPan: number; // -1 (left) to 1 (right)
  soundId: string; // Reference to SoundPool sound
}

export interface ListenerState {
  position: Vector3;
  forward: Vector3;
  up: Vector3;
}

// =============================================================================
// DISTANCE ATTENUATION
// =============================================================================

function computeAttenuation(
  distance: number,
  model: DistanceModel,
  refDist: number,
  maxDist: number,
  rolloff: number
): number {
  const d = Math.max(distance, refDist);

  switch (model) {
    case 'linear': {
      const clamped = Math.min(d, maxDist);
      return 1 - (rolloff * (clamped - refDist)) / (maxDist - refDist);
    }
    case 'inverse':
      return refDist / (refDist + rolloff * (d - refDist));
    case 'exponential':
      return Math.pow(d / refDist, -rolloff);
    default:
      return 1;
  }
}

function vec3Dist(
  a: Vector3,
  b: Vector3
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function computePan(
  listener: ListenerState,
  sourcePos: Vector3
): number {
  // Project source position onto listener's left-right axis
  // Right = cross(forward, up)
  const rx = listener.forward[1] * listener.up[2] - listener.forward[2] * listener.up[1];
  const rz = listener.forward[0] * listener.up[1] - listener.forward[1] * listener.up[0];

  const dx = sourcePos[0] - listener.position[0];
  const dz = sourcePos[2] - listener.position[2];

  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.001) return 0;

  // Dot product with right vector
  const dot = dx * rx + dz * rz;
  const rLen = Math.sqrt(rx * rx + rz * rz);
  if (rLen < 0.001) return 0;

  return Math.max(-1, Math.min(1, dot / (dist * rLen)));
}

// =============================================================================
// AUDIO ENGINE
// =============================================================================

export class AudioEngine {
  private sources: Map<string, AudioSource> = new Map();
  private listener: ListenerState = {
    position: [0, 0, 0 ],
    forward: [0, 0, -1 ],
    up: [0, 1, 0 ],
  };
  private masterVolume: number = 1.0;
  private muted: boolean = false;

  /**
   * Update the listener position (typically from VR headset).
   */
  setListenerPosition(pos: Vector3): void {
    this.listener.position = [...pos ];
  }

  setListenerOrientation(
    forward: Vector3,
    up: Vector3
  ): void {
    this.listener.forward = [...forward ];
    this.listener.up = [...up ];
  }

  getListener(): ListenerState {
    return {
      position: [...this.listener.position ],
      forward: [...this.listener.forward ],
      up: [...this.listener.up ],
    };
  }

  /**
   * Create and play a new audio source.
   */
  play(soundId: string, config: Partial<AudioSourceConfig> = {}): string {
    const id = config.id || `src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const fullConfig: AudioSourceConfig = {
      id,
      position: [0, 0, 0 ],
      volume: 1,
      pitch: 1,
      loop: false,
      maxDistance: 50,
      refDistance: 1,
      rolloffFactor: 1,
      distanceModel: 'inverse',
      channel: 'master',
      spatialize: true,
      ...config,
    };

    const source: AudioSource = {
      config: fullConfig,
      isPlaying: true,
      currentTime: 0,
      computedVolume: fullConfig.volume,
      computedPan: 0,
      soundId,
    };

    this.sources.set(id, source);
    return id;
  }

  /**
   * Stop a playing source.
   */
  stop(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (source) {
      source.isPlaying = false;
      this.sources.delete(sourceId);
    }
  }

  /**
   * Update a source's position.
   */
  setSourcePosition(sourceId: string, pos: Vector3): void {
    const source = this.sources.get(sourceId);
    if (source) source.config.position = [...pos ];
  }

  /**
   * Update all sources. Call every frame.
   */
  update(delta: number): void {
    const toRemove: string[] = [];

    for (const [id, source] of this.sources) {
      if (!source.isPlaying) {
        toRemove.push(id);
        continue;
      }

      source.currentTime += delta * source.config.pitch;

      // Compute distance attenuation
      if (source.config.spatialize) {
        const dist = vec3Dist(this.listener.position, source.config.position);
        const attenuation = computeAttenuation(
          dist,
          source.config.distanceModel,
          source.config.refDistance,
          source.config.maxDistance,
          source.config.rolloffFactor
        );
        source.computedVolume =
          source.config.volume * attenuation * this.masterVolume * (this.muted ? 0 : 1);
        source.computedPan = computePan(this.listener, source.config.position);
      } else {
        source.computedVolume = source.config.volume * this.masterVolume * (this.muted ? 0 : 1);
        source.computedPan = 0;
      }
    }

    for (const id of toRemove) this.sources.delete(id);
  }

  /**
   * Get a source by ID.
   */
  getSource(sourceId: string): AudioSource | undefined {
    return this.sources.get(sourceId);
  }

  /**
   * Get all active sources.
   */
  getActiveSources(): AudioSource[] {
    return Array.from(this.sources.values()).filter((s) => s.isPlaying);
  }

  /**
   * Set master volume.
   */
  setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  /**
   * Mute/unmute all audio.
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Get active source count.
   */
  getActiveCount(): number {
    return this.sources.size;
  }

  /**
   * Stop all sources.
   */
  stopAll(): void {
    this.sources.clear();
  }
}
