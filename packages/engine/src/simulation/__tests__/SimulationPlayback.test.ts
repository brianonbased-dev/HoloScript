/**
 * Phase 15: SimulationRecorder + SimulationPlayback tests.
 */

import { describe, it, expect } from 'vitest';
import { SimulationRecorder } from '../SimulationRecorder';
import { SimulationPlayback } from '../SimulationPlayback';
import type { SimSolver, FieldData } from '../SimSolver';

// ── Mock Solver ──────────────────────────────────────────────────────────────

/** Mock transient solver that produces a field = time * index. */
function createMockSolver(fieldSize: number): SimSolver & { simTime: number } {
  let time = 0;
  return {
    mode: 'transient' as const,
    fieldNames: ['temperature'] as const,
    simTime: 0,
    step(dt: number) { time += dt; this.simTime = time; },
    solve() {},
    getField(name: string): FieldData | null {
      if (name !== 'temperature') return null;
      const data = new Float32Array(fieldSize);
      for (let i = 0; i < fieldSize; i++) data[i] = time * (i + 1);
      return data;
    },
    getStats() { return { currentTime: time }; },
    dispose() {},
  };
}

// ═══════════════════════════════════════════════════════════════════════
// SimulationRecorder
// ═══════════════════════════════════════════════════════════════════════

describe('SimulationRecorder', () => {
  it('captures snapshots and tracks frame count', () => {
    const recorder = new SimulationRecorder();
    const solver = createMockSolver(10);

    for (let i = 0; i < 100; i++) {
      solver.step(0.01);
      recorder.capture(solver, solver.simTime);
    }

    expect(recorder.frameCount).toBe(100);
    expect(recorder.timeRange[0]).toBeCloseTo(0.01);
    expect(recorder.timeRange[1]).toBeCloseTo(1.0);
  });

  it('respects capture interval', () => {
    const recorder = new SimulationRecorder({ captureInterval: 0.05 });
    const solver = createMockSolver(10);

    for (let i = 0; i < 100; i++) {
      solver.step(0.01);
      recorder.capture(solver, solver.simTime);
    }

    // With 0.05s interval and 0.01s steps, should capture every ~5th step
    expect(recorder.frameCount).toBeGreaterThan(15);
    expect(recorder.frameCount).toBeLessThan(25);
  });

  it('evicts oldest frames when over memory budget', () => {
    // 10 floats × 4 bytes = 40 bytes per snapshot
    // Cap at 2000 bytes → ~50 snapshots max
    const recorder = new SimulationRecorder({ maxMemoryBytes: 2000 });
    const solver = createMockSolver(10);

    for (let i = 0; i < 200; i++) {
      solver.step(0.01);
      recorder.capture(solver, solver.simTime);
    }

    // Should have evicted old frames
    expect(recorder.frameCount).toBeLessThan(200);
    expect(recorder.memoryUsage).toBeLessThanOrEqual(2000);
    // Most recent frame should still exist
    const lastSnap = recorder.getSnapshot(recorder.frameCount - 1);
    expect(lastSnap).not.toBeNull();
    expect(lastSnap!.time).toBeCloseTo(2.0, 1);
  });

  it('bracket search finds correct interpolation position', () => {
    const recorder = new SimulationRecorder();
    const solver = createMockSolver(5);

    // Record 10 frames at t=0.1, 0.2, ..., 1.0
    for (let i = 0; i < 10; i++) {
      solver.step(0.1);
      recorder.capture(solver, solver.simTime);
    }

    // Search for t=0.35 → should bracket between frame 2 (t=0.3) and frame 3 (t=0.4)
    const bracket = recorder.findBracket(0.35);
    const snapA = recorder.getSnapshot(bracket.before);
    const snapB = recorder.getSnapshot(bracket.after);

    expect(snapA!.time).toBeCloseTo(0.3);
    expect(snapB!.time).toBeCloseTo(0.4);
    expect(bracket.alpha).toBeCloseTo(0.5, 1);
  });

  it('bracket search handles edge cases', () => {
    const recorder = new SimulationRecorder();
    const solver = createMockSolver(5);
    solver.step(0.1); recorder.capture(solver, solver.simTime);
    solver.step(0.1); recorder.capture(solver, solver.simTime);

    // Before start
    const b1 = recorder.findBracket(0);
    expect(b1.before).toBe(0);
    expect(b1.alpha).toBe(0);

    // After end
    const b2 = recorder.findBracket(999);
    expect(b2.before).toBe(1);
    expect(b2.alpha).toBe(0);
  });

  it('stores field data as independent copies', () => {
    const recorder = new SimulationRecorder();
    const solver = createMockSolver(3);

    solver.step(0.1);
    recorder.capture(solver, solver.simTime);

    solver.step(0.1);
    recorder.capture(solver, solver.simTime);

    // Snapshots should have different data (time changed)
    const s0 = recorder.getSnapshot(0)!;
    const s1 = recorder.getSnapshot(1)!;
    const f0 = s0.fields.get('temperature')!;
    const f1 = s1.fields.get('temperature')!;

    expect(f0[0]).not.toEqual(f1[0]); // different times → different values
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SimulationPlayback
// ═══════════════════════════════════════════════════════════════════════

describe('SimulationPlayback', () => {
  function recordFrames(n: number, dt = 0.1): { recorder: SimulationRecorder; playback: SimulationPlayback } {
    const recorder = new SimulationRecorder();
    const solver = createMockSolver(5);
    for (let i = 0; i < n; i++) {
      solver.step(dt);
      recorder.capture(solver, solver.simTime);
    }
    const playback = new SimulationPlayback(recorder);
    return { recorder, playback };
  }

  it('state transitions: idle → recording → paused → playing', () => {
    const { playback } = recordFrames(10);
    expect(playback.getState()).toBe('idle');

    playback.startRecording();
    expect(playback.getState()).toBe('recording');

    playback.stopRecording();
    expect(playback.getState()).toBe('paused');

    playback.play();
    expect(playback.getState()).toBe('playing');

    playback.pause();
    expect(playback.getState()).toBe('paused');
  });

  it('tick advances time during playback', () => {
    const { playback } = recordFrames(50);
    playback.seekTo(0.1); // start of recording
    playback.play();

    const t0 = playback.getCurrentTime();
    playback.tick(0.5); // 0.5s wall time at 1x speed
    const t1 = playback.getCurrentTime();

    expect(t1).toBeGreaterThan(t0);
    expect(t1 - t0).toBeCloseTo(0.5, 1);
  });

  it('tick returns interpolated fields', () => {
    const { playback } = recordFrames(10, 0.1);
    playback.seekTo(0.15); // between frame 0 (t=0.1) and frame 1 (t=0.2)
    playback.play();

    const fields = playback.tick(0); // zero delta — just get current fields
    expect(fields).not.toBeNull();
    expect(fields!.has('temperature')).toBe(true);

    const temp = fields!.get('temperature')!;
    // At t=0.15, field[0] should interpolate between 0.1*1=0.1 and 0.2*1=0.2 → ~0.15
    expect(temp[0]).toBeCloseTo(0.15, 1);
  });

  it('seekTo works for scrubbing', () => {
    const { playback } = recordFrames(20);

    playback.seekTo(1.0);
    expect(playback.getCurrentTime()).toBeCloseTo(1.0);
    expect(playback.getProgress()).toBeCloseTo(0.45, 1); // 1.0 out of [0.1, 2.0]

    playback.seekTo(2.0);
    expect(playback.getProgress()).toBeCloseTo(1.0);
  });

  it('stepForward and stepBackward navigate frames', () => {
    const { playback } = recordFrames(10, 0.1);
    playback.seekTo(0.1);

    const t0 = playback.getCurrentTime();
    playback.stepForward();
    const t1 = playback.getCurrentTime();
    expect(t1).toBeGreaterThan(t0); // moved forward

    playback.stepForward();
    const t2 = playback.getCurrentTime();
    expect(t2).toBeGreaterThan(t1); // moved forward again

    playback.stepBackward();
    const t3 = playback.getCurrentTime();
    expect(t3).toBeLessThan(t2); // moved backward
  });

  it('speed control scales playback rate', () => {
    const { playback } = recordFrames(50);
    playback.seekTo(0.1);
    playback.setSpeed(2.0);
    playback.play();

    playback.tick(0.5); // 0.5s wall time at 2x → 1.0s sim time advance
    expect(playback.getCurrentTime()).toBeCloseTo(1.1, 1);
  });

  it('playback pauses at end when not looping', () => {
    const { playback } = recordFrames(10, 0.1);
    playback.seekTo(0.9); // near end (t=1.0)
    playback.play();

    playback.tick(0.5); // would go past end
    expect(playback.getState()).toBe('paused');
    expect(playback.getCurrentTime()).toBeCloseTo(1.0);
  });

  it('loop wraps around', () => {
    const { playback } = recordFrames(10, 0.1);
    playback.setLoop(true);
    playback.seekTo(0.9);
    playback.play();

    playback.tick(0.5); // would go past end → wraps
    expect(playback.getState()).toBe('playing');
    expect(playback.getCurrentTime()).toBeGreaterThanOrEqual(0.1);
    expect(playback.getCurrentTime()).toBeLessThan(1.0);
  });

  it('tick returns null when not playing', () => {
    const { playback } = recordFrames(10);

    expect(playback.tick(0.1)).toBeNull(); // idle
    playback.startRecording();
    expect(playback.tick(0.1)).toBeNull(); // recording
    playback.stopRecording();
    expect(playback.tick(0.1)).toBeNull(); // paused
  });

  it('getFieldsAtCurrentTime works in paused state for preview', () => {
    const { playback } = recordFrames(10, 0.1);
    playback.seekTo(0.5);

    const fields = playback.getFieldsAtCurrentTime();
    expect(fields).not.toBeNull();
    expect(fields!.get('temperature')![0]).toBeCloseTo(0.5, 1);
  });
});
