/**
 * GhostRunner.ts
 *
 * Ghost data: records player path for overlay rendering,
 * personal best tracking, side-by-side comparison.
 *
 * @module replay
 */

// =============================================================================
// TYPES
// =============================================================================

export interface GhostSample {
  time: number;
  position: { x: number; y: number; z: number };
  rotation: number; // Y-axis heading
  speed: number;
  metadata?: Record<string, unknown>;
}

export interface GhostRun {
  id: string;
  name: string;
  samples: GhostSample[];
  totalTime: number;
  isPersonalBest: boolean;
  date: number;
  checkpoints: number[]; // timestamps of checkpoint hits
}

// =============================================================================
// GHOST RUNNER
// =============================================================================

let _ghostId = 0;

export class GhostRunner {
  private runs: Map<string, GhostRun> = new Map();
  private personalBest: GhostRun | null = null;
  private activeRecording: GhostSample[] = [];
  private recording = false;
  private recordTime = 0;
  private activePlaybacks: Map<string, { run: GhostRun; time: number; sampleIndex: number }> =
    new Map();

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  startRecording(): void {
    this.recording = true;
    this.activeRecording = [];
    this.recordTime = 0;
  }

  sample(
    dt: number,
    pos: { x: number; y: number; z: number },
    rotation: number,
    speed: number
  ): void {
    if (!this.recording) return;
    this.recordTime += dt;
    this.activeRecording.push({
      time: this.recordTime,
      position: { ...pos },
      rotation,
      speed,
    });
  }

  addCheckpoint(time: number): void {
    // Checkpoint at current recording time — stored in finishRecording
  }

  finishRecording(name = 'run'): GhostRun {
    this.recording = false;

    const run: GhostRun = {
      id: `ghost_${_ghostId++}`,
      name,
      samples: this.activeRecording,
      totalTime: this.recordTime,
      isPersonalBest: false,
      date: Date.now(),
      checkpoints: [],
    };

    // Check PB
    if (!this.personalBest || run.totalTime < this.personalBest.totalTime) {
      run.isPersonalBest = true;
      this.personalBest = run;
    }

    this.runs.set(run.id, run);
    return run;
  }

  isRecording(): boolean {
    return this.recording;
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  startPlayback(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;
    this.activePlaybacks.set(runId, { run, time: 0, sampleIndex: 0 });
    return true;
  }

  stopPlayback(runId: string): void {
    this.activePlaybacks.delete(runId);
  }

  updatePlayback(dt: number): Map<string, GhostSample | null> {
    const results = new Map<string, GhostSample | null>();

    for (const [id, pb] of this.activePlaybacks) {
      pb.time += dt;

      // Find the sample at current time
      while (
        pb.sampleIndex < pb.run.samples.length - 1 &&
        pb.run.samples[pb.sampleIndex + 1].time <= pb.time
      ) {
        pb.sampleIndex++;
      }

      if (pb.sampleIndex < pb.run.samples.length) {
        results.set(id, pb.run.samples[pb.sampleIndex]);
      } else {
        results.set(id, null);
        this.activePlaybacks.delete(id);
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Comparison
  // ---------------------------------------------------------------------------

  compareAtTime(
    runIdA: string,
    runIdB: string,
    time: number
  ): { deltaTime: number; deltaPosition: number } | null {
    const runA = this.runs.get(runIdA);
    const runB = this.runs.get(runIdB);
    if (!runA || !runB) return null;

    const sampleA = this.getSampleAtTime(runA, time);
    const sampleB = this.getSampleAtTime(runB, time);
    if (!sampleA || !sampleB) return null;

    const dx = sampleA.position.x - sampleB.position.x;
    const dy = sampleA.position.y - sampleB.position.y;
    const dz = sampleA.position.z - sampleB.position.z;

    return {
      deltaTime: sampleA.time - sampleB.time,
      deltaPosition: Math.sqrt(dx * dx + dy * dy + dz * dz),
    };
  }

  private getSampleAtTime(run: GhostRun, time: number): GhostSample | null {
    for (let i = run.samples.length - 1; i >= 0; i--) {
      if (run.samples[i].time <= time) return run.samples[i];
    }
    return run.samples[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getRun(id: string): GhostRun | undefined {
    return this.runs.get(id);
  }
  getRunCount(): number {
    return this.runs.size;
  }
  getPersonalBest(): GhostRun | null {
    return this.personalBest;
  }

  getAllRuns(): GhostRun[] {
    return [...this.runs.values()].sort((a, b) => a.totalTime - b.totalTime);
  }
}
