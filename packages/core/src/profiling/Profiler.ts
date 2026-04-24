/**
 * Profiler - Runtime performance profiling with Chrome DevTools export support
 *
 * Provides detailed profiling of HoloScript operations with support for:
 * - Parse/compile timing
 * - Memory snapshots
 * - Frame timing (for runtime)
 * - Chrome DevTools trace format export
 */

export interface ProfileSample {
  name: string;
  category: ProfileCategory;
  startTime: number; // microseconds since profile start
  duration: number; // microseconds
  depth: number;
  args?: Record<string, unknown>;
}

export type ProfileCategory = 'parse' | 'compile' | 'render' | 'network' | 'memory' | 'user' | 'gc';

export interface ProfileResult {
  name: string;
  startTime: number;
  endTime: number;
  duration: number; // milliseconds
  samples: ProfileSample[];
  memorySnapshots: MemorySnapshot[];
  summary: ProfileSummary;
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number; // bytes
  heapTotal: number; // bytes
  external?: number; // bytes
}

export interface ProfileSummary {
  totalDuration: number;
  categoryBreakdown: Record<ProfileCategory, number>;
  hotspots: Hotspot[];
  memoryPeak: number;
  memoryDelta: number;
}

export interface Hotspot {
  name: string;
  totalTime: number;
  callCount: number;
  avgTime: number;
  percentage: number;
}

export interface ChromeTraceEvent {
  name: string;
  cat: string;
  ph: 'B' | 'E' | 'X' | 'I' | 'C' | 'M';
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: Record<string, unknown>;
}

export interface ChromeTrace {
  traceEvents: ChromeTraceEvent[];
  metadata: {
    'clock-domain': string;
    'cpu-family': number;
    'highres-ticks': boolean;
    'network-type': string;
    'num-cpus': number;
    'os-arch': string;
    'os-name': string;
    'os-version': string;
    'process-name': string;
    'product-version': string;
    'physical-memory': number;
    'trace-capture-datetime': string;
  };
}

/**
 * Performance profiler with Chrome DevTools export support
 */
export class Profiler {
  private samples: ProfileSample[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private startTime: number = 0;
  private isRunning: boolean = false;
  private currentDepth: number = 0;
  private profileName: string = 'HoloScript Profile';

  private callStack: Array<{ name: string; startTime: number }> = [];
  private hotspotMap: Map<string, { totalTime: number; callCount: number }> = new Map();

  // Frame-based profiling state
  private frameHistory: Array<{ frameNumber: number; totalTime: number; scopes: unknown[]; timestamp: number }> = [];
  private maxFrames = 300;
  private currentFrameData: { frameNumber: number; totalTime: number; scopes: Array<{ name: string; startTime: number; endTime: number; duration: number; depth: number; children: unknown[] }>; timestamp: number } | null = null;
  private frameCounter = 0;
  private scopeStack: Array<{ name: string; startTime: number; endTime: number; duration: number; depth: number; children: unknown[] }> = [];
  private frameSummaries: Map<string, { name: string; avgTime: number; minTime: number; maxTime: number; totalTime: number; callCount: number }> = new Map();

  /**
   * Start profiling session
   */
  start(name?: string): void {
    if (this.isRunning) {
      console.warn('Profiler already running');
      return;
    }

    this.profileName = name || `HoloScript Profile ${new Date().toISOString()}`;
    this.samples = [];
    this.memorySnapshots = [];
    this.callStack = [];
    this.hotspotMap.clear();
    this.startTime = this.getHighResTime();
    this.isRunning = true;
    this.currentDepth = 0;

    // Capture initial memory
    this.captureMemory();
  }

  /**
   * Stop profiling and return results
   */
  stop(): ProfileResult {
    if (!this.isRunning) {
      throw new Error('Profiler not running');
    }

    this.isRunning = false;
    const endTime = this.getHighResTime();
    const duration = (endTime - this.startTime) / 1000; // Convert to ms

    // Capture final memory
    this.captureMemory();

    const summary = this.generateSummary(duration);

    return {
      name: this.profileName,
      startTime: this.startTime,
      endTime,
      duration,
      samples: [...this.samples],
      memorySnapshots: [...this.memorySnapshots],
      summary,
    };
  }

  /**
   * Begin a profiling span
   */
  beginSpan(
    name: string,
    _category: ProfileCategory = 'user',
    _args?: Record<string, unknown>
  ): void {
    if (!this.isRunning) return;

    const now = this.getHighResTime();
    this.callStack.push({ name, startTime: now - this.startTime });
    this.currentDepth++;
  }

  /**
   * End a profiling span
   */
  endSpan(): void {
    if (!this.isRunning || this.callStack.length === 0) return;

    const span = this.callStack.pop()!;
    const now = this.getHighResTime();
    const duration = now - this.startTime - span.startTime;

    this.currentDepth--;

    const sample: ProfileSample = {
      name: span.name,
      category: this.inferCategory(span.name),
      startTime: span.startTime,
      duration,
      depth: this.currentDepth,
    };

    this.samples.push(sample);

    // Track hotspots
    const existing = this.hotspotMap.get(span.name);
    if (existing) {
      existing.totalTime += duration;
      existing.callCount++;
    } else {
      this.hotspotMap.set(span.name, { totalTime: duration, callCount: 1 });
    }
  }

  /**
   * Record a complete span (for async operations)
   */
  recordSpan(
    name: string,
    duration: number,
    category: ProfileCategory = 'user',
    args?: Record<string, unknown>
  ): void {
    if (!this.isRunning) return;

    const now = this.getHighResTime() - this.startTime;
    const sample: ProfileSample = {
      name,
      category,
      startTime: now - duration,
      duration,
      depth: 0,
      args,
    };

    this.samples.push(sample);

    // Track hotspots
    const existing = this.hotspotMap.get(name);
    if (existing) {
      existing.totalTime += duration;
      existing.callCount++;
    } else {
      this.hotspotMap.set(name, { totalTime: duration, callCount: 1 });
    }
  }

  /**
   * Capture current memory usage
   */
  captureMemory(): void {
    if (!this.isRunning && this.memorySnapshots.length > 0) return;

    const timestamp = this.isRunning ? this.getHighResTime() - this.startTime : 0;

    // Try to get memory info (works in Node.js)
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      this.memorySnapshots.push({
        timestamp,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      });
    } else if (
      typeof performance !== 'undefined' &&
      (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } })
        .memory
    ) {
      // Chrome-specific memory info
      const mem = (
        performance as unknown as { memory: { usedJSHeapSize: number; totalJSHeapSize: number } }
      ).memory;
      this.memorySnapshots.push({
        timestamp,
        heapUsed: mem.usedJSHeapSize,
        heapTotal: mem.totalJSHeapSize,
      });
    }
  }

  /**
   * Export to Chrome DevTools trace format
   */
  exportChromeTrace(result?: ProfileResult): ChromeTrace {
    const profile = result || this.stop();
    const pid = 1;
    const tid = 1;

    const traceEvents: ChromeTraceEvent[] = [];

    // Add process name metadata
    traceEvents.push({
      name: 'process_name',
      cat: '__metadata',
      ph: 'M',
      ts: 0,
      pid,
      tid: 0,
      args: { name: 'HoloScript' },
    });

    traceEvents.push({
      name: 'thread_name',
      cat: '__metadata',
      ph: 'M',
      ts: 0,
      pid,
      tid,
      args: { name: 'Main Thread' },
    });

    // Convert samples to trace events
    for (const sample of profile.samples) {
      traceEvents.push({
        name: sample.name,
        cat: sample.category,
        ph: 'X', // Complete event
        ts: sample.startTime,
        dur: sample.duration,
        pid,
        tid,
        args: sample.args,
      });
    }

    // Add memory counter events
    for (const snapshot of profile.memorySnapshots) {
      traceEvents.push({
        name: 'Memory',
        cat: 'memory',
        ph: 'C',
        ts: snapshot.timestamp,
        pid,
        tid,
        args: {
          heapUsed: snapshot.heapUsed,
          heapTotal: snapshot.heapTotal,
        },
      });
    }

    return {
      traceEvents,
      metadata: {
        'clock-domain': 'CHROME_TRACE_CLOCK_DOMAIN',
        'cpu-family': 0,
        'highres-ticks': true,
        'network-type': 'unknown',
        'num-cpus': typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4,
        'os-arch': typeof process !== 'undefined' ? process.arch : 'x64',
        'os-name': typeof process !== 'undefined' ? process.platform : 'browser',
        'os-version': '',
        'process-name': 'HoloScript Profiler',
        'product-version': '3.4.0',
        'physical-memory': 0,
        'trace-capture-datetime': new Date().toISOString(),
      },
    };
  }

  /**
   * Export to JSON format
   */
  exportJSON(result?: ProfileResult): string {
    const profile = result || this.stop();
    return JSON.stringify(profile, null, 2);
  }

  /**
   * Check if profiler is currently running
   */
  get running(): boolean {
    return this.isRunning;
  }

  // ---------------------------------------------------------------------------
  // Frame-based profiling API
  // ---------------------------------------------------------------------------

  beginFrame(): void {
    this.currentFrameData = {
      frameNumber: this.frameCounter++,
      totalTime: 0,
      scopes: [],
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };
    this.scopeStack = [];
  }

  endFrame(): void {
    if (!this.currentFrameData) return;
    this.currentFrameData.totalTime =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
      this.currentFrameData.timestamp;
    this.frameHistory.push(this.currentFrameData);
    if (this.frameHistory.length > this.maxFrames) this.frameHistory.shift();
    this.currentFrameData = null;
  }

  beginScope(name: string): void {
    if (!this.currentFrameData) return;
    const scope = {
      name,
      startTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      endTime: 0,
      duration: 0,
      depth: this.scopeStack.length,
      children: [] as unknown[],
    };
    if (this.scopeStack.length > 0) {
      this.scopeStack[this.scopeStack.length - 1].children.push(scope);
    } else {
      this.currentFrameData.scopes.push(scope);
    }
    this.scopeStack.push(scope);
  }

  endScope(): void {
    if (this.scopeStack.length === 0) return;
    const scope = this.scopeStack.pop()!;
    scope.endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    scope.duration = scope.endTime - scope.startTime;
    // Update frame summary
    let summary = this.frameSummaries.get(scope.name);
    if (!summary) {
      summary = { name: scope.name, avgTime: 0, minTime: Infinity, maxTime: 0, totalTime: 0, callCount: 0 };
      this.frameSummaries.set(scope.name, summary);
    }
    summary.callCount++;
    summary.totalTime += scope.duration;
    summary.minTime = Math.min(summary.minTime, scope.duration);
    summary.maxTime = Math.max(summary.maxTime, scope.duration);
    summary.avgTime = summary.totalTime / summary.callCount;
  }

  profile<T>(name: string, fn: () => T): T {
    this.beginScope(name);
    try {
      return fn();
    } finally {
      this.endScope();
    }
  }

  getFrameHistory(): Array<{ frameNumber: number; totalTime: number; scopes: unknown[]; timestamp: number }> {
    return [...this.frameHistory];
  }

  getAllSummaries(): Array<{ name: string; avgTime: number; minTime: number; maxTime: number; totalTime: number; callCount: number }> {
    return [...this.frameSummaries.values()];
  }

  getSlowestScopes(count = 5): Array<{ name: string; avgTime: number; minTime: number; maxTime: number; totalTime: number; callCount: number }> {
    return [...this.frameSummaries.values()].sort((a, b) => b.maxTime - a.maxTime).slice(0, count);
  }

  getSummary(name: string): { name: string; avgTime: number; minTime: number; maxTime: number; totalTime: number; callCount: number } | undefined {
    return this.frameSummaries.get(name);
  }

  private getHighResTime(): number {
    if (typeof performance !== 'undefined') {
      return performance.now() * 1000; // Convert to microseconds
    }
    return Date.now() * 1000;
  }

  private inferCategory(name: string): ProfileCategory {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('parse')) return 'parse';
    if (lowerName.includes('compile') || lowerName.includes('generate')) return 'compile';
    if (lowerName.includes('render') || lowerName.includes('draw')) return 'render';
    if (lowerName.includes('network') || lowerName.includes('fetch')) return 'network';
    if (lowerName.includes('memory') || lowerName.includes('alloc')) return 'memory';
    if (lowerName.includes('gc') || lowerName.includes('garbage')) return 'gc';
    return 'user';
  }

  private generateSummary(totalDuration: number): ProfileSummary {
    const categoryBreakdown: Record<ProfileCategory, number> = {
      parse: 0,
      compile: 0,
      render: 0,
      network: 0,
      memory: 0,
      user: 0,
      gc: 0,
    };

    // Calculate category breakdown
    for (const sample of this.samples) {
      categoryBreakdown[sample.category] += sample.duration / 1000; // Convert to ms
    }

    // Generate hotspots
    const hotspots: Hotspot[] = [];
    const totalTimeUs = totalDuration * 1000; // Convert to microseconds for comparison

    for (const [name, data] of this.hotspotMap) {
      hotspots.push({
        name,
        totalTime: data.totalTime / 1000, // Convert to ms
        callCount: data.callCount,
        avgTime: data.totalTime / data.callCount / 1000, // Convert to ms
        percentage: (data.totalTime / totalTimeUs) * 100,
      });
    }

    // Sort by total time descending
    hotspots.sort((a, b) => b.totalTime - a.totalTime);

    // Memory analysis
    let memoryPeak = 0;
    let memoryDelta = 0;

    if (this.memorySnapshots.length > 0) {
      memoryPeak = Math.max(...this.memorySnapshots.map((s) => s.heapUsed));
      memoryDelta =
        this.memorySnapshots[this.memorySnapshots.length - 1].heapUsed -
        this.memorySnapshots[0].heapUsed;
    }

    return {
      totalDuration,
      categoryBreakdown,
      hotspots: hotspots.slice(0, 10), // Top 10 hotspots
      memoryPeak,
      memoryDelta,
    };
  }
}

// Singleton instance
export const profiler = new Profiler();
