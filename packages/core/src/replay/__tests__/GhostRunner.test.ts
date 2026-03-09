import { describe, it, expect, beforeEach } from 'vitest';
import { GhostRunner } from '../GhostRunner';

describe('GhostRunner', () => {
  let runner: GhostRunner;

  beforeEach(() => {
    runner = new GhostRunner();
  });

  // Recording
  it('startRecording / isRecording', () => {
    expect(runner.isRecording()).toBe(false);
    runner.startRecording();
    expect(runner.isRecording()).toBe(true);
  });

  it('sample records data while recording', () => {
    runner.startRecording();
    runner.sample(0.016, { x: 1, y: 0, z: 0 }, 0, 5);
    runner.sample(0.016, { x: 2, y: 0, z: 0 }, 0, 5);
    const run = runner.finishRecording('test');
    expect(run.samples).toHaveLength(2);
  });

  it('finishRecording returns GhostRun', () => {
    runner.startRecording();
    runner.sample(0.1, { x: 0, y: 0, z: 0 }, 0, 1);
    const run = runner.finishRecording('myRun');
    expect(run.name).toBe('myRun');
    expect(run.totalTime).toBeGreaterThan(0);
    expect(run.id).toBeDefined();
    expect(runner.isRecording()).toBe(false);
  });

  it('personal best is set for first run', () => {
    runner.startRecording();
    runner.sample(0.1, { x: 0, y: 0, z: 0 }, 0, 1);
    const run = runner.finishRecording();
    expect(run.isPersonalBest).toBe(true);
    expect(runner.getPersonalBest()).toBe(run);
  });

  it('personal best updates for faster run', () => {
    runner.startRecording();
    runner.sample(1.0, { x: 0, y: 0, z: 0 }, 0, 1);
    runner.finishRecording('slow');

    runner.startRecording();
    runner.sample(0.5, { x: 0, y: 0, z: 0 }, 0, 1);
    const fast = runner.finishRecording('fast');
    expect(fast.isPersonalBest).toBe(true);
    expect(runner.getPersonalBest()!.name).toBe('fast');
  });

  // Queries
  it('getRun / getRunCount / getAllRuns', () => {
    runner.startRecording();
    runner.sample(0.1, { x: 0, y: 0, z: 0 }, 0, 1);
    const run = runner.finishRecording();

    expect(runner.getRunCount()).toBe(1);
    expect(runner.getRun(run.id)).toBe(run);
    expect(runner.getAllRuns()).toHaveLength(1);
  });

  it('getAllRuns sorted by totalTime', () => {
    runner.startRecording();
    runner.sample(1.0, { x: 0, y: 0, z: 0 }, 0, 1);
    runner.finishRecording('slow');

    runner.startRecording();
    runner.sample(0.5, { x: 0, y: 0, z: 0 }, 0, 1);
    runner.finishRecording('fast');

    const runs = runner.getAllRuns();
    expect(runs[0].totalTime).toBeLessThanOrEqual(runs[1].totalTime);
  });

  // Playback
  it('startPlayback / stopPlayback', () => {
    runner.startRecording();
    runner.sample(0.1, { x: 1, y: 0, z: 0 }, 0, 1);
    const run = runner.finishRecording();

    expect(runner.startPlayback(run.id)).toBe(true);
    runner.stopPlayback(run.id);
    expect(runner.startPlayback('nonexistent')).toBe(false);
  });

  it('updatePlayback returns samples', () => {
    runner.startRecording();
    runner.sample(0.1, { x: 1, y: 0, z: 0 }, 0, 1);
    runner.sample(0.1, { x: 2, y: 0, z: 0 }, 0, 2);
    const run = runner.finishRecording();

    runner.startPlayback(run.id);
    const results = runner.updatePlayback(0.05);
    expect(results.get(run.id)).toBeDefined();
  });

  // Compare
  it('compareAtTime returns delta', () => {
    runner.startRecording();
    runner.sample(0.1, { x: 0, y: 0, z: 0 }, 0, 1);
    runner.sample(0.1, { x: 5, y: 0, z: 0 }, 0, 1);
    const runA = runner.finishRecording('A');

    runner.startRecording();
    runner.sample(0.1, { x: 0, y: 0, z: 0 }, 0, 1);
    runner.sample(0.1, { x: 3, y: 0, z: 0 }, 0, 1);
    const runB = runner.finishRecording('B');

    const cmp = runner.compareAtTime(runA.id, runB.id, 0.1);
    expect(cmp).not.toBeNull();
    expect(cmp!.deltaPosition).toBeGreaterThanOrEqual(0);
  });

  it('compareAtTime returns null for missing run', () => {
    expect(runner.compareAtTime('x', 'y', 0)).toBeNull();
  });
});
