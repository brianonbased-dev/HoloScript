/**
 * CinematicTrack.ts
 *
 * Keyframe-based cinematic sequencer: position/rotation/fov
 * keyframes, easing curves, playback control, and event cues.
 *
 * @module camera
 */

// =============================================================================
// TYPES
// =============================================================================

export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'smoothStep';

export interface CinematicKeyframe {
  time: number; // seconds
  position?: { x: number; y: number; z: number };
  rotation?: { pitch: number; yaw: number; roll: number };
  fov?: number;
  zoom?: number;
  easing: EasingType;
}

export interface CinematicCue {
  time: number;
  event: string;
  data: Record<string, unknown>;
  fired: boolean;
}

export interface CinematicState {
  position: { x: number; y: number; z: number };
  rotation: { pitch: number; yaw: number; roll: number };
  fov: number;
  zoom: number;
}

// =============================================================================
// CINEMATIC TRACK
// =============================================================================

export class CinematicTrack {
  private keyframes: CinematicKeyframe[] = [];
  private cues: CinematicCue[] = [];
  private currentTime = 0;
  private duration = 0;
  private playing = false;
  private looping = false;
  private speed = 1;
  private cueListeners: Array<(event: string, data: Record<string, unknown>) => void> = [];

  // ---------------------------------------------------------------------------
  // Keyframe Management
  // ---------------------------------------------------------------------------

  addKeyframe(keyframe: CinematicKeyframe): void {
    this.keyframes.push(keyframe);
    this.keyframes.sort((a, b) => a.time - b.time);
    this.duration = Math.max(this.duration, keyframe.time);
  }

  addCue(time: number, event: string, data: Record<string, unknown> = {}): void {
    this.cues.push({ time, event, data, fired: false });
    this.cues.sort((a, b) => a.time - b.time);
  }

  removeKeyframesAt(time: number): number {
    const before = this.keyframes.length;
    this.keyframes = this.keyframes.filter((k) => Math.abs(k.time - time) > 0.001);
    this.recalcDuration();
    return before - this.keyframes.length;
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  play(): void {
    this.playing = true;
  }
  pause(): void {
    this.playing = false;
  }
  stop(): void {
    this.playing = false;
    this.currentTime = 0;
    this.resetCues();
  }
  seek(time: number): void {
    this.currentTime = Math.max(0, Math.min(time, this.duration));
  }
  setSpeed(speed: number): void {
    this.speed = speed;
  }
  setLooping(loop: boolean): void {
    this.looping = loop;
  }

  isPlaying(): boolean {
    return this.playing;
  }
  getCurrentTime(): number {
    return this.currentTime;
  }
  getDuration(): number {
    return this.duration;
  }
  getProgress(): number {
    return this.duration > 0 ? this.currentTime / this.duration : 0;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): CinematicState | null {
    if (!this.playing || this.keyframes.length === 0) return null;

    this.currentTime += dt * this.speed;

    // Fire cues
    for (const cue of this.cues) {
      if (!cue.fired && this.currentTime >= cue.time) {
        cue.fired = true;
        for (const listener of this.cueListeners) listener(cue.event, cue.data);
      }
    }

    // Loop or stop
    if (this.currentTime >= this.duration) {
      if (this.looping) {
        this.currentTime %= this.duration;
        this.resetCues();
      } else {
        this.currentTime = this.duration;
        this.playing = false;
      }
    }

    return this.evaluate(this.currentTime);
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  evaluate(time: number): CinematicState {
    const state: CinematicState = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { pitch: 0, yaw: 0, roll: 0 },
      fov: 60,
      zoom: 1,
    };

    if (this.keyframes.length === 0) return state;
    if (this.keyframes.length === 1) {
      const k = this.keyframes[0];
      if (k.position) state.position = { ...k.position };
      if (k.rotation) state.rotation = { ...k.rotation };
      if (k.fov !== undefined) state.fov = k.fov;
      if (k.zoom !== undefined) state.zoom = k.zoom;
      return state;
    }

    // Find surrounding keyframes
    let kA = this.keyframes[0];
    let kB = this.keyframes[this.keyframes.length - 1];

    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (time >= this.keyframes[i].time && time <= this.keyframes[i + 1].time) {
        kA = this.keyframes[i];
        kB = this.keyframes[i + 1];
        break;
      }
    }

    const range = kB.time - kA.time;
    const rawT = range > 0 ? (time - kA.time) / range : 1;
    const t = this.applyEasing(rawT, kB.easing);

    // Interpolate
    if (kA.position && kB.position) {
      state.position.x = kA.position.x + (kB.position.x - kA.position.x) * t;
      state.position.y = kA.position.y + (kB.position.y - kA.position.y) * t;
      state.position.z = kA.position.z + (kB.position.z - kA.position.z) * t;
    } else if (kB.position) {
      state.position = { ...kB.position };
    } else if (kA.position) {
      state.position = { ...kA.position };
    }

    if (kA.rotation && kB.rotation) {
      state.rotation.pitch = kA.rotation.pitch + (kB.rotation.pitch - kA.rotation.pitch) * t;
      state.rotation.yaw = kA.rotation.yaw + (kB.rotation.yaw - kA.rotation.yaw) * t;
      state.rotation.roll = kA.rotation.roll + (kB.rotation.roll - kA.rotation.roll) * t;
    }

    if (kA.fov !== undefined && kB.fov !== undefined) {
      state.fov = kA.fov + (kB.fov - kA.fov) * t;
    }
    if (kA.zoom !== undefined && kB.zoom !== undefined) {
      state.zoom = kA.zoom + (kB.zoom - kA.zoom) * t;
    }

    return state;
  }

  // ---------------------------------------------------------------------------
  // Easing
  // ---------------------------------------------------------------------------

  private applyEasing(t: number, easing: EasingType): number {
    switch (easing) {
      case 'linear':
        return t;
      case 'easeIn':
        return t * t;
      case 'easeOut':
        return 1 - (1 - t) * (1 - t);
      case 'easeInOut':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      case 'smoothStep':
        return t * t * (3 - 2 * t);
      default:
        return t;
    }
  }

  // ---------------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------------

  onCue(listener: (event: string, data: Record<string, unknown>) => void): void {
    this.cueListeners.push(listener);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resetCues(): void {
    for (const cue of this.cues) cue.fired = false;
  }
  private recalcDuration(): void {
    this.duration = this.keyframes.reduce((max, k) => Math.max(max, k.time), 0);
  }

  getKeyframeCount(): number {
    return this.keyframes.length;
  }
  getCueCount(): number {
    return this.cues.length;
  }
  clear(): void {
    this.keyframes = [];
    this.cues = [];
    this.duration = 0;
    this.currentTime = 0;
  }
}

