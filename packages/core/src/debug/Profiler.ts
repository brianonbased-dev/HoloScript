/**
 * Profiler.ts
 *
 * Performance profiling: frame timing, named system scopes,
 * memory tracking, and flame graph data export.
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
  depth: number;
  children: ProfileScope[];
}

export interface FrameProfile {
  frameNumber: number;
  totalTime: number;
  scopes: ProfileScope[];
  timestamp: number;
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  label: string;
}

export interface ProfileSummary {
  name: string;
  avgTime: number;
  minTime: number;
  maxTime: number;
  totalTime: number;
  callCount: number;
}

// =============================================================================
// PROFILER
// =============================================================================

export class Profiler {
  private frameHistory: FrameProfile[] = [];
  private maxFrames = 300;
  private currentFrame: FrameProfile | null = null;
  private frameCounter = 0;
  private scopeStack: ProfileScope[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private enabled = true;
  private summaries: Map<string, ProfileSummary> = new Map();

  // ---------------------------------------------------------------------------
  // Frame Lifecycle
  // ---------------------------------------------------------------------------

  beginFrame(): void {
    if (!this.enabled) return;
    this.currentFrame = {
      frameNumber: this.frameCounter++,
      totalTime: 0,
      scopes: [],
      timestamp: performance.now(),
    };
    this.scopeStack = [];
  }

  endFrame(): void {
    if (!this.enabled || !this.currentFrame) return;
    this.currentFrame.totalTime = performance.now() - this.currentFrame.timestamp;
    this.frameHistory.push(this.currentFrame);
    if (this.frameHistory.length > this.maxFrames) this.frameHistory.shift();
    this.currentFrame = null;
  }

  // ---------------------------------------------------------------------------
  // Scope Profiling
  // ---------------------------------------------------------------------------

  beginScope(name: string): void {
    if (!this.enabled || !this.currentFrame) return;

    const scope: ProfileScope = {
      name,
      startTime: performance.now(),
      endTime: 0,
      duration: 0,
      depth: this.scopeStack.length,
      children: [],
    };

    if (this.scopeStack.length > 0) {
      this.scopeStack[this.scopeStack.length - 1].children.push(scope);
    } else {
      this.currentFrame.scopes.push(scope);
    }

    this.scopeStack.push(scope);
  }

  endScope(): void {
    if (!this.enabled || this.scopeStack.length === 0) return;
    const scope = this.scopeStack.pop()!;
    scope.endTime = performance.now();
    scope.duration = scope.endTime - scope.startTime;

    // Update summary
    let summary = this.summaries.get(scope.name);
    if (!summary) {
      summary = {
        name: scope.name,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        totalTime: 0,
        callCount: 0,
      };
      this.summaries.set(scope.name, summary);
    }
    summary.callCount++;
    summary.totalTime += scope.duration;
    summary.minTime = Math.min(summary.minTime, scope.duration);
    summary.maxTime = Math.max(summary.maxTime, scope.duration);
    summary.avgTime = summary.totalTime / summary.callCount;
  }

  /**
   * Profile a synchronous function.
   */
  profile<T>(name: string, fn: () => T): T {
    this.beginScope(name);
    try {
      return fn();
    } finally {
      this.endScope();
    }
  }

  // ---------------------------------------------------------------------------
  // Memory Tracking
  // ---------------------------------------------------------------------------

  takeMemorySnapshot(label = ''): MemorySnapshot {
    const snap: MemorySnapshot = {
      timestamp: performance.now(),
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      label,
    };

    // Use process.memoryUsage if available (Node.js)
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      snap.heapUsed = mem.heapUsed;
      snap.heapTotal = mem.heapTotal;
      snap.external = mem.external;
    }

    this.memorySnapshots.push(snap);
    return snap;
  }

  getMemorySnapshots(): MemorySnapshot[] {
    return [...this.memorySnapshots];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getFrameHistory(): FrameProfile[] {
    return [...this.frameHistory];
  }
  getLastFrame(): FrameProfile | null {
    return this.frameHistory.length > 0 ? this.frameHistory[this.frameHistory.length - 1] : null;
  }

  getAverageFPS(): number {
    if (this.frameHistory.length < 2) return 0;
    const totalTime = this.frameHistory.reduce((sum, f) => sum + f.totalTime, 0);
    return totalTime > 0 ? this.frameHistory.length / (totalTime / 1000) : 0;
  }

  getSummary(name: string): ProfileSummary | undefined {
    return this.summaries.get(name);
  }
  getAllSummaries(): ProfileSummary[] {
    return [...this.summaries.values()];
  }

  getSlowestScopes(count = 5): ProfileSummary[] {
    return [...this.summaries.values()].sort((a, b) => b.maxTime - a.maxTime).slice(0, count);
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

  reset(): void {
    this.frameHistory = [];
    this.summaries.clear();
    this.memorySnapshots = [];
    this.frameCounter = 0;
  }
}
