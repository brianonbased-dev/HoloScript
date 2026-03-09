/**
 * ReplayPlayback.ts
 *
 * Replay playback: speed control, scrubbing, camera modes,
 * frame interpolation, and event markers.
 *
 * @module replay
 */

import type { ReplayData, ReplayFrame } from './ReplayRecorder';

// =============================================================================
// TYPES
// =============================================================================

export type PlaybackState = 'stopped' | 'playing' | 'paused';
export type CameraMode = 'follow' | 'free' | 'orbit' | 'first-person';

export interface PlaybackEvent {
  name: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// =============================================================================
// REPLAY PLAYBACK
// =============================================================================

export class ReplayPlayback {
  private data: ReplayData | null = null;
  private state: PlaybackState = 'stopped';
  private speed = 1;
  private currentTime = 0;
  private cameraMode: CameraMode = 'follow';
  private events: PlaybackEvent[] = [];
  private eventCallbacks: Map<string, Array<(event: PlaybackEvent) => void>> = new Map();
  private looping = false;

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  load(data: ReplayData): void {
    this.data = data;
    this.currentTime = 0;
    this.state = 'stopped';
  }

  isLoaded(): boolean {
    return this.data !== null;
  }

  // ---------------------------------------------------------------------------
  // Control
  // ---------------------------------------------------------------------------

  play(): void {
    if (!this.data) return;
    this.state = 'playing';
  }

  pause(): void {
    this.state = 'paused';
  }
  stop(): void {
    this.state = 'stopped';
    this.currentTime = 0;
  }
  getState(): PlaybackState {
    return this.state;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(8, speed));
  }
  getSpeed(): number {
    return this.speed;
  }

  setLoop(loop: boolean): void {
    this.looping = loop;
  }
  isLooping(): boolean {
    return this.looping;
  }

  // ---------------------------------------------------------------------------
  // Seeking
  // ---------------------------------------------------------------------------

  seek(timeMs: number): void {
    if (!this.data) return;
    this.currentTime = Math.max(0, Math.min(this.data.header.duration, timeMs));
  }

  seekToFrame(frameIndex: number): void {
    if (!this.data) return;
    const frame = this.data.frames[frameIndex];
    if (frame) this.currentTime = frame.timestamp;
  }

  getProgress(): number {
    if (!this.data || this.data.header.duration === 0) return 0;
    return this.currentTime / this.data.header.duration;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
  }
  getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  addEvent(name: string, timestamp: number, data: Record<string, unknown> = {}): void {
    this.events.push({ name, timestamp, data });
    this.events.sort((a, b) => a.timestamp - b.timestamp);
  }

  onEvent(name: string, callback: (event: PlaybackEvent) => void): void {
    const list = this.eventCallbacks.get(name) ?? [];
    list.push(callback);
    this.eventCallbacks.set(name, list);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): ReplayFrame | null {
    if (!this.data || this.state !== 'playing') return null;

    const prevTime = this.currentTime;
    this.currentTime += dt * 1000 * this.speed;

    // Check for events in this time window
    for (const evt of this.events) {
      if (evt.timestamp > prevTime && evt.timestamp <= this.currentTime) {
        const callbacks = this.eventCallbacks.get(evt.name);
        if (callbacks) callbacks.forEach((cb) => cb(evt));
      }
    }

    // Handle end
    if (this.currentTime >= this.data.header.duration) {
      if (this.looping) {
        this.currentTime = this.currentTime % this.data.header.duration;
      } else {
        this.currentTime = this.data.header.duration;
        this.state = 'stopped';
      }
    }

    return this.getFrameAtTime(this.currentTime);
  }

  // ---------------------------------------------------------------------------
  // Frame Interpolation
  // ---------------------------------------------------------------------------

  getFrameAtTime(timeMs: number): ReplayFrame | null {
    if (!this.data || this.data.frames.length === 0) return null;

    // Find bracketing frames
    let lo = 0,
      hi = this.data.frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.data.frames[mid].timestamp < timeMs) lo = mid + 1;
      else hi = mid;
    }

    return this.data.frames[Math.min(lo, this.data.frames.length - 1)];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getDuration(): number {
    return this.data?.header.duration ?? 0;
  }
  getFrameCount(): number {
    return this.data?.header.frameCount ?? 0;
  }
}
