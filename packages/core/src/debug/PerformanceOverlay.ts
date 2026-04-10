/**
 * PerformanceOverlay — FPS, draw calls, memory, frame graph
 *
 * @version 1.0.0
 */

export interface FrameSample {
  frameNumber: number;
  deltaMs: number;
  fps: number;
  drawCalls: number;
  triangles: number;
  memoryMB: number;
  timestamp: number;
}

export interface OverlayConfig {
  maxSamples: number;
  showFPS: boolean;
  showMemory: boolean;
  showDrawCalls: boolean;
  showGraph: boolean;
  targetFPS: number;
}

export class PerformanceOverlay {
  private samples: FrameSample[] = [];
  private config: OverlayConfig;
  private frameNumber: number = 0;
  private visible: boolean = true;

  constructor(config?: Partial<OverlayConfig>) {
    this.config = {
      maxSamples: config?.maxSamples ?? 120,
      showFPS: config?.showFPS ?? true,
      showMemory: config?.showMemory ?? true,
      showDrawCalls: config?.showDrawCalls ?? true,
      showGraph: config?.showGraph ?? true,
      targetFPS: config?.targetFPS ?? 60,
    };
  }

  /**
   * Record a frame sample
   */
  recordFrame(deltaMs: number, drawCalls: number, triangles: number, memoryMB: number): void {
    this.frameNumber++;
    const sample: FrameSample = {
      frameNumber: this.frameNumber,
      deltaMs,
      fps: deltaMs > 0 ? 1000 / deltaMs : 0,
      drawCalls,
      triangles,
      memoryMB,
      timestamp: Date.now(),
    };
    this.samples.push(sample);
    if (this.samples.length > this.config.maxSamples) this.samples.shift();
  }

  /**
   * Get average FPS over last N frames
   */
  getAverageFPS(frames: number = 60): number {
    const slice = this.samples.slice(-frames);
    if (slice.length === 0) return 0;
    return slice.reduce((sum, s) => sum + s.fps, 0) / slice.length;
  }

  /**
   * Get 1% low FPS
   */
  get1PercentLow(): number {
    if (this.samples.length < 10) return 0;
    const sorted = [...this.samples].sort((a, b) => a.fps - b.fps);
    const lowCount = Math.max(1, Math.floor(sorted.length * 0.01));
    return sorted.slice(0, lowCount).reduce((s, v) => s + v.fps, 0) / lowCount;
  }

  /**
   * Get current memory usage
   */
  getCurrentMemory(): number {
    return this.samples.length > 0 ? this.samples[this.samples.length - 1].memoryMB : 0;
  }

  /**
   * Check if below target FPS
   */
  isBelowTarget(): boolean {
    return this.getAverageFPS() < this.config.targetFPS;
  }

  /**
   * Get frame graph data (last N samples)
   */
  getFrameGraph(count: number = 60): number[] {
    return this.samples.slice(-count).map((s) => s.deltaMs);
  }

  toggle(): void {
    this.visible = !this.visible;
  }
  isVisible(): boolean {
    return this.visible;
  }
  getSampleCount(): number {
    return this.samples.length;
  }
  getConfig(): OverlayConfig {
    return { ...this.config };
  }
}
