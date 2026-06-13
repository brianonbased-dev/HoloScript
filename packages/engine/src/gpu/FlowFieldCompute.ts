/**
 * FlowFieldCPU — CPU flow-field pathfinding compute.
 *
 * HONESTY NOTE (zgcn/lh8l, 2026-06-13): this class was previously named
 * `FlowFieldCompute` and documented as "WebGPU-backed" / "GPU-accelerated
 * dispatch", but `compute()` has always run a synchronous CPU loop and never
 * issued a WGSL dispatch — it acquired a WebGPUContext it then ignored. The
 * dead GPU scaffolding has been removed and the class renamed to match reality.
 *
 * It computes, for every cell of a `width × height` grid, a unit direction
 * vector pointing toward a target cell — a classic flow field for steering /
 * pathfinding. A real WebGPU compute path (WGSL shader → pipeline → storage
 * buffer → readback, gated behind a CPU-parity test) is genuine future work and
 * is NOT implemented here.
 *
 * The file retains its `FlowFieldCompute.ts` path for import stability; the
 * `FlowFieldCPU` export is the honest name.
 */

export interface FlowFieldCPUConfig {
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
 * CPU flow-field compute for pathfinding. Occupies the `backend: 'gpu'` slot of
 * the `FlowFieldGenerator` builtin until a real WebGPU path is implemented —
 * see the honesty note above. Behaviour is deterministic and GPU-independent.
 */
export class FlowFieldCPU {
  private readonly width: number;
  private readonly height: number;
  private readonly cellSize: number;

  constructor(config: FlowFieldCPUConfig = {}) {
    this.width = config.width ?? 64;
    this.height = config.height ?? 64;
    this.cellSize = config.cellSize ?? 1.0;
  }

  /**
   * No-op. Retained so the BuiltinRegistry `gpu`-backend lifecycle
   * (`await ff.initialize()`) stays stable; reserved for a future WebGPU
   * pipeline. The CPU `compute()` path requires no initialization.
   */
  async initialize(): Promise<void> {
    /* no GPU resources to acquire — CPU compute path */
  }

  /**
   * Compute flow vectors toward a target grid cell on the CPU.
   * Returns a flat array of {x,y} unit vectors indexed as [row * width + col].
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

  /** No GPU resources to release; retained for lifecycle symmetry. */
  destroy(): void {
    /* no-op */
  }

  get gridWidth(): number {
    return this.width;
  }
  get gridHeight(): number {
    return this.height;
  }
  get worldCellSize(): number {
    return this.cellSize;
  }
}
