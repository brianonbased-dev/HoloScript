import type { Vector3 } from '@holoscript/core';
/**
 * SpatialAudioSource.ts
 *
 * 3D audio source: positioning, distance attenuation,
 * rolloff models, panning, cone, and Doppler.
 *
 * @module audio
 */

// =============================================================================
// TYPES
// =============================================================================

export type RolloffModel = 'linear' | 'inverse' | 'exponential' | 'custom';

export interface AudioCone {
  innerAngle: number; // degrees — full volume
  outerAngle: number; // degrees — outer gain applies
  outerGain: number; // 0-1
}

export interface SpatialAudioConfig {
  position: Vector3;
  velocity: Vector3;
  rolloff: RolloffModel;
  minDistance: number;
  maxDistance: number;
  volume: number;
  pitch: number;
  loop: boolean;
  cone: AudioCone | null;
  dopplerFactor: number;
  rolloffFactor: number; // New: 0-infinite, default 1
  spatialBlend: number; // 0 = 2D, 1 = full 3D
}

// =============================================================================
// SPATIAL AUDIO SOURCE
// =============================================================================

export class SpatialAudioSource {
  private config: SpatialAudioConfig;
  private playing = false;
  private paused = false;
  private time = 0;
  private clipDuration = 0;
  private gain = 1; // Computed gain after attenuation
  private pan = 0; // -1 (left) to 1 (right)

  constructor(config?: Partial<SpatialAudioConfig>) {
    this.config = {
      position: [0, 0, 0 ],
      velocity: [0, 0, 0 ],
      rolloff: 'inverse',
      minDistance: 3, // Tuned for voice: audible within 3m
      maxDistance: 100,
      volume: 1,
      pitch: 1,
      loop: false,
      cone: null,
      dopplerFactor: 1,
      rolloffFactor: 1,
      spatialBlend: 1,
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  play(duration = 5): void {
    this.playing = true;
    this.paused = false;
    this.time = 0;
    this.clipDuration = duration;
  }
  stop(): void {
    this.playing = false;
    this.paused = false;
    this.time = 0;
  }
  pause(): void {
    if (this.playing) this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  isPlaying(): boolean {
    return this.playing && !this.paused;
  }

  // ---------------------------------------------------------------------------
  // Position / Properties
  // ---------------------------------------------------------------------------

  setPosition(x: number, y: number, z: number): void {
    this.config.position = [x, y, z ];
  }
  getPosition(): Vector3 {
    return [...this.config.position ];
  }
  setVelocity(x: number, y: number, z: number): void {
    this.config.velocity = [x, y, z ];
  }
  setVolume(v: number): void {
    this.config.volume = Math.max(0, Math.min(1, v));
  }
  getVolume(): number {
    return this.config.volume;
  }
  setPitch(p: number): void {
    this.config.pitch = Math.max(0.1, p);
  }
  setLoop(loop: boolean): void {
    this.config.loop = loop;
  }
  setRolloff(model: RolloffModel): void {
    this.config.rolloff = model;
  }
  setMinDistance(d: number): void {
    this.config.minDistance = Math.max(0.01, d);
  }
  setMaxDistance(d: number): void {
    this.config.maxDistance = Math.max(this.config.minDistance, d);
  }
  setSpatialBlend(blend: number): void {
    this.config.spatialBlend = Math.max(0, Math.min(1, blend));
  }
  setCone(cone: AudioCone): void {
    this.config.cone = { ...cone };
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number, listenerPos: Vector3): void {
    if (!this.playing || this.paused) return;

    this.time += dt * this.config.pitch;
    if (this.time >= this.clipDuration) {
      if (this.config.loop) {
        this.time %= this.clipDuration;
      } else {
        this.playing = false;
        return;
      }
    }

    // Compute distance
    const dx = this.config.position[0] - listenerPos[0];
    const dy = this.config.position[1] - listenerPos[1];
    const dz = this.config.position[2] - listenerPos[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Attenuation
    this.gain = this.computeAttenuation(distance) * this.config.volume;

    // Pan (simplified stereo)
    if (distance > 0.001) {
      this.pan = Math.max(-1, Math.min(1, dx / distance)) * this.config.spatialBlend;
    } else {
      this.pan = 0;
    }

    // Cone attenuation
    if (this.config.cone) {
      this.gain *= this.computeConeGain(listenerPos);
    }
  }

  // ---------------------------------------------------------------------------
  // Attenuation
  // ---------------------------------------------------------------------------

  private computeAttenuation(distance: number): number {
    const min = this.config.minDistance;
    const max = this.config.maxDistance;
    const clamped = Math.max(min, Math.min(max, distance));

    switch (this.config.rolloff) {
      case 'linear': {
        return 1 - (clamped - min) / (max - min);
      }
      case 'inverse': {
        // min / (min + rolloffFactor * (distance - min))
        return min / (min + this.config.rolloffFactor * (clamped - min));
      }
      case 'exponential': {
        // (distance / min) ^ -rolloffFactor
        return Math.pow(clamped / min, -this.config.rolloffFactor);
      }
      default:
        return 1;
    }
  }

  private computeConeGain(listenerPos: Vector3): number {
    if (!this.config.cone) return 1;
    const dx = listenerPos[0] - this.config.position[0];
    const dz = listenerPos[2] - this.config.position[2];
    const angle = Math.abs(Math.atan2(dz, dx) * (180 / Math.PI));

    const halfInner = this.config.cone.innerAngle / 2;
    const halfOuter = this.config.cone.outerAngle / 2;

    if (angle <= halfInner) return 1;
    if (angle >= halfOuter) return this.config.cone.outerGain;
    const t = (angle - halfInner) / (halfOuter - halfInner);
    return 1 - t * (1 - this.config.cone.outerGain);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getGain(): number {
    return this.gain;
  }
  getPan(): number {
    return this.pan;
  }
  getTime(): number {
    return this.time;
  }
  getConfig(): SpatialAudioConfig {
    return {
      ...this.config,
      position: [...this.config.position ],
      velocity: [...this.config.velocity ],
    };
  }
}
