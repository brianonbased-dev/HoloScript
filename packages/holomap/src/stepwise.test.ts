import { describe, it, expect } from 'vitest';

import { StepwiseVideoReconstructor, type VideoFrame } from './stepwise.js';

function makeFrame(index: number, r: number, g: number, b: number): VideoFrame {
  return {
    index,
    rgb: new Uint8Array([r, g, b, 255]),
    width: 1,
    height: 1,
  };
}

describe('StepwiseVideoReconstructor', () => {
  it('exposes intermediate state after each stage', () => {
    const recon = new StepwiseVideoReconstructor();
    recon.ingest([makeFrame(0, 100, 100, 100)]);
    recon.advance(); // depth
    recon.advance(); // merge

    const depthState = recon.inspect('depth');
    expect(depthState?.stage).toBe('depth');
    expect(depthState?.depth?.width).toBe(1);

    const mergeState = recon.inspect('merge');
    expect(mergeState?.stage).toBe('merge');
    expect(mergeState?.cloud?.count).toBeGreaterThan(0);
  });

  it('accepts a correction to intermediate state before advancing', () => {
    const recon = new StepwiseVideoReconstructor();
    recon.ingest([makeFrame(0, 100, 100, 100)]);
    recon.advance(); // depth

    // Apply a correction to the depth map
    recon.correct('depth', (state) => {
      const newDepth = { ...state.depth! };
      newDepth.values = new Float32Array([0.99]);
      return { ...state, depth: newDepth };
    });

    const corrected = recon.inspect('depth');
    expect(corrected?.depth?.values[0]).toBeCloseTo(0.99, 5);
  });

  it('asserts the corrected value persists into the next stage output', () => {
    const recon = new StepwiseVideoReconstructor();
    recon.ingest([makeFrame(0, 100, 100, 100)]);
    recon.advance(); // depth
    recon.advance(); // merge (first run)

    // Now correct depth and replay downstream
    recon.correct('depth', (state) => {
      const newDepth = { ...state.depth! };
      newDepth.values = new Float32Array([0.42]);
      return { ...state, depth: newDepth };
    });

    recon.replayFrom('depth');

    const mergeState = recon.inspect('merge');
    // The point-cloud z-coordinate is depth * 100, so 0.42 should become 42
    expect(mergeState?.cloud?.positions[2]).toBe(42);
  });

  it('fails if the correction is ignored (negative guard)', () => {
    const recon = new StepwiseVideoReconstructor();
    recon.ingest([makeFrame(0, 100, 100, 100)]);
    recon.advance(); // depth

    // Apply a very specific correction
    recon.correct('depth', (state) => {
      const newDepth = { ...state.depth! };
      newDepth.values = new Float32Array([0.77]);
      return { ...state, depth: newDepth };
    });

    recon.replayFrom('depth');

    const mergeState = recon.inspect('merge');
    // If the correction were ignored, the value would be ~0.39 (100+100+100)/(3*255)
    // instead of 0.77
    const expectedZ = 0.77 * 100;
    expect(mergeState?.cloud?.positions[2]).toBe(expectedZ);
    expect(mergeState?.cloud?.positions[2]).not.toBeCloseTo(0.39 * 100, 1);
  });

  it('fails if the pipeline restarts from scratch instead of replaying', () => {
    const recon = new StepwiseVideoReconstructor();
    recon.ingest([makeFrame(0, 50, 50, 50)]);
    recon.advance(); // depth
    recon.advance(); // merge

    // Capture the original cloud count
    const originalCount = recon.inspect('merge')?.cloud?.count;

    // Correct depth and replay
    recon.correct('depth', (state) => {
      const newDepth = { ...state.depth! };
      newDepth.values = new Float32Array([0.1]);
      return { ...state, depth: newDepth };
    });
    recon.replayFrom('depth');

    // If the pipeline restarted from scratch, the frame would need to be re-ingested
    // and the merge state would be missing. Instead, replay should preserve upstream
    // data and only recompute downstream.
    const mergeState = recon.inspect('merge');
    expect(mergeState?.cloud?.count).toBe(originalCount);
    expect(mergeState?.cloud?.positions[2]).toBe(0.1 * 100);
  });

  it('throws when correcting a stage that has not been run', () => {
    const recon = new StepwiseVideoReconstructor();
    expect(() =>
      recon.correct('depth', (s) => s),
    ).toThrow('Cannot correct stage "depth"');
  });
});
