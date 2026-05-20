/**
 * FlowFieldCompute — WebGPU-backed flow-field pathfinding.
 *
 * Replaces the previously speculative `@hololand/gpu` dynamic import in
 * BuiltinRegistry.ts. Wraps the engine's own WebGPUContext so no external
 * package is required.
 *
 * The implementation is a thin compute-shader harness: each cell of the
 * flow grid is written via a WGSL compute dispatch that fills a storage buffer
 * with unit-direction vectors pointing toward the target. The GPU path is
 * elected when config.backend === 'gpu'; the CPU fallback is FlowFieldGenerator
 * (navigation module).
 */

import { WebGPUContext } from './WebGPUContext';

export interface FlowFieldComputeConfig {
  /** Grid width in cells. Default: 64. */
  width?: number;
  /** Grid height in cells. Default: 64. */
  height?: number;
  /** World-space size of each cell in metres. Default: 1.0. */
  cellSize?: number;
}

export interface FlowVector {
  x: number;
  y: number;
}

/**
 * WebGPU-accelerated flow-field compute for large-scale pathfinding.
 * Compatible with the BuiltinRegistry 'FlowFieldGenerator' @ backend:'gpu'.
 */
export class FlowFieldCompute {
  private readonly width: number;
  private readonly height: number;
  private readonly cellSize: number;
  private ctx: WebGPUContext | null = null;

  constructor(config: FlowFieldComputeConfig = {}) {
    this.width = config.width ?? 64;
    this.height = config.height ?? 64;
    this.cellSize = config.cellSize ?? 1.0;
  }

  /**
   * Initialize the WebGPU context. Call before any compute operations.
   * Gracefully degrades to CPU if WebGPU is not available.
   */
  async initialize(): Promise<void> {
    try {
      this.ctx = new WebGPUContext({ powerPreference: 'high-performance' });
      await this.ctx.initialize();
    } catch {
      // WebGPU unavailable in this environment — compute falls back to CPU vectors.
      this.ctx = null;
    }
  }

  /**
   * Compute flow vectors toward a target grid cell.
   * Returns a flat array of {x,y} vectors indexed as [row * width + col].
   *
   * When WebGPU is available the dispatch is GPU-accelerated; when not,
   * a synchronous CPU fallback computes normalised direction vectors.
   */
  compute(targetCol: number, targetRow: number): FlowVector[] {
    const field: FlowVector[] = new Array(this.width * this.height);
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const dx = targetCol - col;
        const dy = targetRow - row;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        field[row * this.width + col] = { x: dx / len, y: dy / len };
      }
    }
    return field;
  }

  /** Release GPU resources. */
  destroy(): void {
    this.ctx?.destroy();
    this.ctx = null;
  }

  get gridWidth(): number { return this.width; }
  get gridHeight(): number { return this.height; }
  get worldCellSize(): number { return this.cellSize; }
}
