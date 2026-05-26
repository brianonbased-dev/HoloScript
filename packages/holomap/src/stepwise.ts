/**
 * Stepwise Reconstruction — each stage exposes intermediate state and
 * accepts a correction before advancing, so a bad stage can be fixed
 * without restarting the whole pipeline.
 */

export interface VideoFrame {
  index: number;
  rgb: Uint8Array;
  width: number;
  height: number;
}

export interface DepthMap {
  values: Float32Array;
  width: number;
  height: number;
}

export interface PointCloudSlice {
  positions: Float32Array;
  colors: Uint8Array;
  count: number;
}

export type ReconstructionStage = 'ingest' | 'depth' | 'merge';

export interface StageState {
  stage: ReconstructionStage;
  frames?: VideoFrame[];
  depth?: DepthMap;
  cloud?: PointCloudSlice;
}

export class StepwiseVideoReconstructor {
  private states = new Map<ReconstructionStage, StageState>();
  private current: ReconstructionStage = 'ingest';

  /** Run the next stage (or the current one if it hasn't been run yet). */
  advance(): ReconstructionStage {
    switch (this.current) {
      case 'ingest': {
        // noop until frames are injected via ingest()
        this.states.set('ingest', { stage: 'ingest', frames: [] });
        this.current = 'depth';
        break;
      }
      case 'depth': {
        const ingest = this.states.get('ingest');
        const frames = ingest?.frames ?? [];
        // Synthetic depth from first frame (deterministic for tests)
        const depth = this.estimateDepth(frames);
        this.states.set('depth', { stage: 'depth', frames, depth });
        this.current = 'merge';
        break;
      }
      case 'merge': {
        const depthState = this.states.get('depth');
        const cloud = this.fusePointCloud(depthState?.frames ?? [], depthState?.depth);
        this.states.set('merge', {
          stage: 'merge',
          frames: depthState?.frames,
          depth: depthState?.depth,
          cloud,
        });
        this.current = 'merge';
        break;
      }
    }
    return this.current;
  }

  /** Push frames into the ingest stage. */
  ingest(frames: VideoFrame[]): void {
    this.states.set('ingest', { stage: 'ingest', frames });
    this.current = 'depth';
  }

  /** Inspect the state of any stage that has already run. */
  inspect(stage: ReconstructionStage): StageState | undefined {
    return this.states.get(stage);
  }

  /**
   * Apply a correction to a completed stage's intermediate state.
   * The corrected value will persist into downstream stages when they next run.
   */
  correct(stage: ReconstructionStage, patch: (state: StageState) => StageState): void {
    const existing = this.states.get(stage);
    if (!existing) {
      throw new Error(`Cannot correct stage "${stage}" — it has not been run yet.`);
    }
    this.states.set(stage, patch(existing));
  }

  /** Re-run all downstream stages after a correction so the fix propagates. */
  replayFrom(stage: ReconstructionStage): void {
    const order: ReconstructionStage[] = ['ingest', 'depth', 'merge'];
    const idx = order.indexOf(stage);
    if (idx === -1) return;

    // Clear everything after the corrected stage so it re-computes
    for (let i = idx + 1; i < order.length; i++) {
      this.states.delete(order[i]!);
    }

    // Advance through remaining stages
    this.current = order[idx + 1] ?? stage;
    while (this.current !== 'merge') {
      this.advance();
    }
    if (this.current === 'merge') {
      this.advance();
    }
  }

  private estimateDepth(frames: VideoFrame[]): DepthMap {
    if (frames.length === 0) {
      return { values: new Float32Array(0), width: 0, height: 0 };
    }
    const f = frames[0];
    const size = f.width * f.height;
    const values = new Float32Array(size);
    // Deterministic fake depth: average RGB per pixel scaled to [0,1]
    for (let i = 0; i < size; i++) {
      const r = f.rgb[i * 4] ?? 0;
      const g = f.rgb[i * 4 + 1] ?? 0;
      const b = f.rgb[i * 4 + 2] ?? 0;
      values[i] = (r + g + b) / (3 * 255);
    }
    return { values, width: f.width, height: f.height };
  }

  private fusePointCloud(frames: VideoFrame[], depth?: DepthMap): PointCloudSlice {
    if (!depth || depth.width === 0) {
      return { positions: new Float32Array(0), colors: new Uint8Array(0), count: 0 };
    }
    const count = depth.values.length;
    const positions = new Float32Array(count * 3);
    const colors = new Uint8Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = i % depth.width;
      const y = Math.floor(i / depth.width);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = depth.values[i]! * 100; // scale depth to world units

      const f = frames[0];
      colors[i * 3] = f?.rgb[i * 4] ?? 0;
      colors[i * 3 + 1] = f?.rgb[i * 4 + 1] ?? 0;
      colors[i * 3 + 2] = f?.rgb[i * 4 + 2] ?? 0;
    }
    return { positions, colors, count };
  }
}
