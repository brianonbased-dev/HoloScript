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
  position: { x: number; y: number; z: number };
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
  position: { x: number; y: number; z: number };
  forward: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
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
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function computePan(
  listener: ListenerState,
  sourcePos: { x: number; y: number; z: number }
): number {
  // Project source position onto listener's left-right axis
  // Right = cross(forward, up)
  const rx = listener.forward.y * listener.up.z - listener.forward.z * listener.up.y;
  const rz = listener.forward.x * listener.up.y - listener.forward.y * listener.up.x;

  const dx = sourcePos.x - listener.position.x;
  const dz = sourcePos.z - listener.position.z;

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
    position: { x: 0, y: 0, z: 0 },
    forward: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
  };
  private masterVolume: number = 1.0;
  private muted: boolean = false;

  /**
   * Update the listener position (typically from VR headset).
   */
  setListenerPosition(pos: { x: number; y: number; z: number }): void {
    this.listener.position = { ...pos };
  }

  setListenerOrientation(
    forward: { x: number; y: number; z: number },
    up: { x: number; y: number; z: number }
  ): void {
    this.listener.forward = { ...forward };
    this.listener.up = { ...up };
  }

  getListener(): ListenerState {
    return { ...this.listener };
  }

  /**
   * Create and play a new audio source.
   */
  play(soundId: string, config: Partial<AudioSourceConfig> = {}): string {
    const id = config.id || `src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const fullConfig: AudioSourceConfig = {
      id,
      position: { x: 0, y: 0, z: 0 },
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
  setSourcePosition(sourceId: string, pos: { x: number; y: number; z: number }): void {
    const source = this.sources.get(sourceId);
    if (source) source.config.position = { ...pos };
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
