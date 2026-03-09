/**
 * RuntimeProfiler.ts
 *
 * Runtime profiling: named scope markers, frame timing,
 * flame graph data, percentile stats, and sampling.
 *
 * @module debug
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ProfileScope {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  children: ProfileScope[];
  parent: ProfileScope | null;
}

export interface FrameStats {
  frameNumber: number;
  frameTime: number;
  fps: number;
  scopes: ProfileScope[];
}

// =============================================================================
// RUNTIME PROFILER
// =============================================================================

export class RuntimeProfiler {
  private frameHistory: FrameStats[] = [];
  private maxHistory: number;
  private currentFrame: ProfileScope[] = [];
  private scopeStack: ProfileScope[] = [];
  private frameNumber = 0;
  private frameStart = 0;
  private enabled = true;

  constructor(maxHistory = 300) {
    this.maxHistory = maxHistory;
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  beginFrame(): void {
    if (!this.enabled) return;
    this.frameStart = performance.now();
    this.currentFrame = [];
    this.scopeStack = [];
  }

  endFrame(): void {
    if (!this.enabled) return;
    const frameTime = performance.now() - this.frameStart;
    const stats: FrameStats = {
      frameNumber: this.frameNumber++,
      frameTime,
      fps: frameTime > 0 ? 1000 / frameTime : 0,
      scopes: this.currentFrame,
    };
    this.frameHistory.push(stats);
    if (this.frameHistory.length > this.maxHistory) this.frameHistory.shift();
  }

  // ---------------------------------------------------------------------------
  // Scopes
  // ---------------------------------------------------------------------------

  beginScope(name: string): void {
    if (!this.enabled) return;
    const scope: ProfileScope = {
      name,
      startTime: performance.now(),
      endTime: 0,
      duration: 0,
      children: [],
      parent: this.scopeStack[this.scopeStack.length - 1] ?? null,
    };

    if (scope.parent) {
      scope.parent.children.push(scope);
    } else {
      this.currentFrame.push(scope);
    }
    this.scopeStack.push(scope);
  }

  endScope(): void {
    if (!this.enabled) return;
    const scope = this.scopeStack.pop();
    if (scope) {
      scope.endTime = performance.now();
      scope.duration = scope.endTime - scope.startTime;
    }
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getAverageFrameTime(lastN?: number): number {
    const frames = lastN ? this.frameHistory.slice(-lastN) : this.frameHistory;
    if (frames.length === 0) return 0;
    return frames.reduce((s, f) => s + f.frameTime, 0) / frames.length;
  }

  getPercentile(percentile: number, lastN?: number): number {
    const frames = lastN ? this.frameHistory.slice(-lastN) : this.frameHistory;
    if (frames.length === 0) return 0;
    const sorted = frames.map((f) => f.frameTime).sort((a, b) => a - b);
    const idx = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getAverageFPS(lastN?: number): number {
    const avg = this.getAverageFrameTime(lastN);
    return avg > 0 ? 1000 / avg : 0;
  }

  getScopeStats(scopeName: string): { count: number; totalMs: number; avgMs: number } {
    let count = 0,
      total = 0;
    const searchScopes = (scopes: ProfileScope[]) => {
      for (const s of scopes) {
        if (s.name === scopeName) {
          count++;
          total += s.duration;
        }
        searchScopes(s.children);
      }
    };
    for (const frame of this.frameHistory) searchScopes(frame.scopes);
    return { count, totalMs: total, avgMs: count > 0 ? total / count : 0 };
  }

  // ---------------------------------------------------------------------------
  // Control
  // ---------------------------------------------------------------------------

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  isEnabled(): boolean {
    return this.enabled;
  }
  getFrameCount(): number {
    return this.frameHistory.length;
  }
  getFrameHistory(): FrameStats[] {
    return [...this.frameHistory];
  }
  clear(): void {
    this.frameHistory = [];
    this.frameNumber = 0;
  }
}
