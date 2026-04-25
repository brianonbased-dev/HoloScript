import { describe, it, expect } from 'vitest';
import { GhostRunner } from '../replay/GhostRunner';

// =============================================================================
// C206 — Ghost Racing
// =============================================================================

describe('GhostRunner', () => {
  function recordRun(runner: GhostRunner, steps: number, speed: number, name = 'run') {
    runner.startRecording();
    for (let i = 0; i < steps; i++) {
      runner.sample(0.1, [i * speed, 0, 0], 0, speed);
    }
    return runner.finishRecording(name);
  }

  // --- Recording ---

  it('startRecording sets recording state', () => {
    const r = new GhostRunner();
    r.startRecording();
    expect(r.isRecording()).toBe(true);
  });

  it('sample captures position and time', () => {
    const r = new GhostRunner();
    r.startRecording();
    r.sample(0.1, [5, 0, 0], 90, 10);
    const run = r.finishRecording('test');
    expect(run.samples).toHaveLength(1);
    expect(run.samples[0].position).toEqual([5, 0, 0]);
    expect(run.samples[0].rotation).toBe(90);
    expect(run.samples[0].speed).toBe(10);
  });

  it('sample does nothing when not recording', () => {
    const r = new GhostRunner();
    r.sample(0.1, [1, 0, 0], 0, 1);
    // no run to finish — just ensuring no crash
    expect(r.getRunCount()).toBe(0);
  });

  it('finishRecording returns run with totalTime', () => {
    const r = new GhostRunner();
    const run = recordRun(r, 10, 5, 'fast');
    expect(run.name).toBe('fast');
    expect(run.totalTime).toBeCloseTo(1.0, 1); // 10 × 0.1s
    expect(run.samples).toHaveLength(10);
    expect(r.isRecording()).toBe(false);
  });

  it('getRun retrieves by id', () => {
    const r = new GhostRunner();
    const run = recordRun(r, 5, 1);
    expect(r.getRun(run.id)).toBe(run);
  });

  it('getRunCount tracks total runs', () => {
    const r = new GhostRunner();
    recordRun(r, 3, 1);
    recordRun(r, 3, 2);
    expect(r.getRunCount()).toBe(2);
  });

  // --- Personal Best ---

  it('first run is automatically personal best', () => {
    const r = new GhostRunner();
    const run = recordRun(r, 5, 1);
    expect(run.isPersonalBest).toBe(true);
    expect(r.getPersonalBest()).toBe(run);
  });

  it('faster run replaces personal best', () => {
    const r = new GhostRunner();
    recordRun(r, 10, 1, 'slow'); // 1.0s
    const fast = recordRun(r, 5, 2, 'fast'); // 0.5s
    expect(fast.isPersonalBest).toBe(true);
    expect(r.getPersonalBest()).toBe(fast);
    // Note: old run's isPersonalBest flag is NOT cleared by finishRecording,
    // PB is tracked by the personalBest reference on the runner itself.
  });

  it('slower run does not replace personal best', () => {
    const r = new GhostRunner();
    const fast = recordRun(r, 3, 1, 'fast'); // 0.3s
    const slow = recordRun(r, 10, 1, 'slow'); // 1.0s
    expect(slow.isPersonalBest).toBe(false);
    expect(r.getPersonalBest()).toBe(fast);
  });

  // --- Playback ---

  it('startPlayback returns true for valid run', () => {
    const r = new GhostRunner();
    const run = recordRun(r, 5, 1);
    expect(r.startPlayback(run.id)).toBe(true);
  });

  it('startPlayback returns false for unknown id', () => {
    const r = new GhostRunner();
    expect(r.startPlayback('nope')).toBe(false);
  });

  it('updatePlayback returns samples over time', () => {
    const r = new GhostRunner();
    const run = recordRun(r, 5, 1);
    r.startPlayback(run.id);
    const results = r.updatePlayback(0.05);
    expect(results.has(run.id)).toBe(true);
    expect(results.get(run.id)).not.toBeNull();
  });

  it('stopPlayback removes active playback', () => {
    const r = new GhostRunner();
    const run = recordRun(r, 5, 1);
    r.startPlayback(run.id);
    r.stopPlayback(run.id);
    const results = r.updatePlayback(0.1);
    expect(results.has(run.id)).toBe(false);
  });

  // --- Comparison ---

  it('compareAtTime returns delta position and time', () => {
    const r = new GhostRunner();
    const runA = recordRun(r, 10, 1, 'A'); // x moves at 1/step
    const runB = recordRun(r, 10, 2, 'B'); // x moves at 2/step
    const cmp = r.compareAtTime(runA.id, runB.id, 0.5);
    expect(cmp).not.toBeNull();
    expect(cmp!.deltaPosition).toBeGreaterThan(0);
  });

  it('compareAtTime returns null for unknown run', () => {
    const r = new GhostRunner();
    recordRun(r, 5, 1);
    expect(r.compareAtTime('bad', 'worse', 0.5)).toBeNull();
  });

  // --- getAllRuns ---

  it('getAllRuns returns runs sorted by totalTime ascending', () => {
    const r = new GhostRunner();
    recordRun(r, 10, 1, 'slow'); // 1.0s
    recordRun(r, 3, 1, 'fast'); // 0.3s
    recordRun(r, 7, 1, 'mid'); // 0.7s
    const all = r.getAllRuns();
    expect(all[0].name).toBe('fast');
    expect(all[1].name).toBe('mid');
    expect(all[2].name).toBe('slow');
  });
});
