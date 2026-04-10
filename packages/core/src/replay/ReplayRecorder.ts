/**
 * ReplayRecorder.ts
 *
 * Input/state recording: frame-by-frame capture,
 * timestamps, delta compression, and export.
 *
 * @module replay
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ReplayFrame {
  frameIndex: number;
  timestamp: number; // ms since recording start
  inputs: Record<string, number | boolean>;
  state: Record<string, number>;
}

export interface ReplayHeader {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  frameCount: number;
  fps: number;
  version: number;
  metadata: Record<string, unknown>;
}

export interface ReplayData {
  header: ReplayHeader;
  frames: ReplayFrame[];
}

// =============================================================================
// REPLAY RECORDER
// =============================================================================

let _replayId = 0;

export class ReplayRecorder {
  private recording = false;
  private paused = false;
  private frames: ReplayFrame[] = [];
  private startTime = 0;
  private currentTime = 0;
  private fps: number;
  private frameInterval: number;
  private lastCaptureTime = 0;
  private name = '';
  private metadata: Record<string, unknown> = {};

  constructor(fps = 30) {
    this.fps = fps;
    this.frameInterval = 1000 / fps;
  }

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  start(name = 'replay'): void {
    this.recording = true;
    this.paused = false;
    this.frames = [];
    this.startTime = Date.now();
    this.currentTime = 0;
    this.lastCaptureTime = 0;
    this.name = name;
  }

  stop(): ReplayData {
    this.recording = false;
    return this.export();
  }

  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  isRecording(): boolean {
    return this.recording && !this.paused;
  }

  // ---------------------------------------------------------------------------
  // Capture
  // ---------------------------------------------------------------------------

  captureFrame(
    dt: number,
    inputs: Record<string, number | boolean>,
    state: Record<string, number>
  ): boolean {
    if (!this.recording || this.paused) return false;

    this.currentTime += dt * 1000;

    if (this.currentTime - this.lastCaptureTime < this.frameInterval) return false;

    this.frames.push({
      frameIndex: this.frames.length,
      timestamp: this.currentTime,
      inputs: { ...inputs },
      state: { ...state },
    });

    this.lastCaptureTime = this.currentTime;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Compression (delta)
  // ---------------------------------------------------------------------------

  compress(): ReplayData {
    const compressed: ReplayFrame[] = [];
    let prevState: Record<string, number> = {};

    for (const frame of this.frames) {
      const delta: Record<string, number> = {};
      let hasChanges = false;

      for (const [key, val] of Object.entries(frame.state)) {
        if (prevState[key] !== val) {
          delta[key] = val;
          hasChanges = true;
        }
      }

      compressed.push({
        ...frame,
        state: hasChanges ? delta : {},
      });

      prevState = { ...frame.state };
    }

    return {
      header: this.buildHeader(),
      frames: compressed,
    };
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  export(): ReplayData {
    return {
      header: this.buildHeader(),
      frames: [...this.frames],
    };
  }

  private buildHeader(): ReplayHeader {
    return {
      id: `replay_${_replayId++}`,
      name: this.name,
      startTime: this.startTime,
      duration: this.currentTime,
      frameCount: this.frames.length,
      fps: this.fps,
      version: 1,
      metadata: { ...this.metadata },
    };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getFrameCount(): number {
    return this.frames.length;
  }
  getDuration(): number {
    return this.currentTime;
  }
  setMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
  }
}
