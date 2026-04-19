import { describe, expect, it } from 'vitest';
import { createHoloMapRuntime, HOLOMAP_DEFAULTS, type ReconstructionFrame } from '../HoloMapRuntime';
import { assertHoloMapManifestContract } from '../simulationContractBinding';

describe('HoloMapRuntime vertical slice', () => {
  it('initializes, steps, finalizes and returns deterministic replay hash', async () => {
    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 42,
      modelHash: 'test-model',
      videoHash: 'fixture-1',
    });

    const frame: ReconstructionFrame = {
      index: 0,
      timestampMs: 0,
      rgb: new Uint8Array([128, 64, 32, 255]),
      width: 1,
      height: 1,
      stride: 4,
    };

    const step = await runtime.step(frame);
    expect(step.pose.position.length).toBe(3);
    expect(step.points.positions.length).toBeGreaterThan(0);

    const manifest = await runtime.finalize();
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.replayHash.length).toBeGreaterThan(8);
    assertHoloMapManifestContract(manifest);

    const replay = runtime.replayHash();
    expect(replay).toBe(manifest.replayHash);

    await runtime.dispose();
  });
});
