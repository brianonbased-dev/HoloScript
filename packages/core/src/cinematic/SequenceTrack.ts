/**
 * SequenceTrack.ts
 *
 * Multi-channel timeline: clips on tracks, keyframe interpolation,
 * blending, looping, and editing.
 *
 * @module cinematic
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TrackKeyframe {
  time: number;
  value: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step';
}

export interface TrackClip {
  id: string;
  trackId: string;
  startTime: number;
  duration: number;
  keyframes: TrackKeyframe[];
  blendIn: number;
  blendOut: number;
  data?: Record<string, unknown>;
}

export interface Track {
  id: string;
  name: string;
  type: 'float' | 'position' | 'rotation' | 'event' | 'camera';
  clips: TrackClip[];
  muted: boolean;
  weight: number;
}

// =============================================================================
// SEQUENCE TRACK
// =============================================================================

let _clipId = 0;

export class SequenceTrack {
  private tracks: Map<string, Track> = new Map();
  private currentTime = 0;
  private duration = 0;
  private playing = false;
  private loop = false;
  private speed = 1;

  // ---------------------------------------------------------------------------
  // Track Management
  // ---------------------------------------------------------------------------

  addTrack(id: string, name: string, type: Track['type']): Track {
    const track: Track = { id, name, type, clips: [], muted: false, weight: 1 };
    this.tracks.set(id, track);
    return track;
  }

  removeTrack(id: string): void {
    this.tracks.delete(id);
  }
  getTrack(id: string): Track | undefined {
    return this.tracks.get(id);
  }
  getTracks(): Track[] {
    return [...this.tracks.values()];
  }

  muteTrack(id: string, muted: boolean): void {
    const t = this.tracks.get(id);
    if (t) t.muted = muted;
  }

  // ---------------------------------------------------------------------------
  // Clip Management
  // ---------------------------------------------------------------------------

  addClip(
    trackId: string,
    startTime: number,
    duration: number,
    keyframes: TrackKeyframe[],
    blendIn = 0,
    blendOut = 0
  ): TrackClip | null {
    const track = this.tracks.get(trackId);
    if (!track) return null;

    const clip: TrackClip = {
      id: `clip_${_clipId++}`,
      trackId,
      startTime,
      duration,
      keyframes,
      blendIn,
      blendOut,
    };
    track.clips.push(clip);
    track.clips.sort((a, b) => a.startTime - b.startTime);

    this.duration = Math.max(this.duration, startTime + duration);
    return clip;
  }

  removeClip(trackId: string, clipId: string): void {
    const track = this.tracks.get(trackId);
    if (track) track.clips = track.clips.filter((c) => c.id !== clipId);
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
  }
  setSpeed(speed: number): void {
    this.speed = speed;
  }
  setLoop(loop: boolean): void {
    this.loop = loop;
  }
  seek(time: number): void {
    this.currentTime = Math.max(0, Math.min(time, this.duration));
  }

  update(dt: number): Map<string, number> {
    const output = new Map<string, number>();
    if (!this.playing) return output;

    this.currentTime += dt * this.speed;

    if (this.currentTime >= this.duration) {
      if (this.loop) {
        this.currentTime %= this.duration;
      } else {
        this.currentTime = this.duration;
        this.playing = false;
      }
    }

    for (const track of this.tracks.values()) {
      if (track.muted) continue;

      for (const clip of track.clips) {
        const localTime = this.currentTime - clip.startTime;
        if (localTime < 0 || localTime > clip.duration) continue;

        const value = this.evaluateClip(clip, localTime);

        // Blend factor
        let blend = 1;
        if (clip.blendIn > 0 && localTime < clip.blendIn) blend *= localTime / clip.blendIn;
        if (clip.blendOut > 0 && localTime > clip.duration - clip.blendOut) {
          blend *= (clip.duration - localTime) / clip.blendOut;
        }

        output.set(track.id, value * blend * track.weight);
      }
    }

    return output;
  }

  private evaluateClip(clip: TrackClip, localTime: number): number {
    const kfs = clip.keyframes;
    if (kfs.length === 0) return 0;
    if (kfs.length === 1) return kfs[0].value;

    // Find surrounding keyframes
    const t = localTime / clip.duration;
    let i = 0;
    for (; i < kfs.length - 1; i++) {
      if (kfs[i + 1].time >= t) break;
    }

    const a = kfs[i],
      b = kfs[Math.min(i + 1, kfs.length - 1)];
    if (a === b || a.time === b.time) return a.value;

    const frac = (t - a.time) / (b.time - a.time);
    return this.interpolate(a.value, b.value, frac, b.easing);
  }

  private interpolate(a: number, b: number, t: number, easing: string): number {
    let e = t;
    switch (easing) {
      case 'easeIn':
        e = t * t;
        break;
      case 'easeOut':
        e = 1 - (1 - t) * (1 - t);
        break;
      case 'easeInOut':
        e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        break;
      case 'step':
        e = t < 1 ? 0 : 1;
        break;
    }
    return a + (b - a) * e;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getDuration(): number {
    return this.duration;
  }
  getCurrentTime(): number {
    return this.currentTime;
  }
  isPlaying(): boolean {
    return this.playing;
  }
}
