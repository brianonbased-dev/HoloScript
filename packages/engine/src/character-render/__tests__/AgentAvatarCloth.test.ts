import { describe, expect, it } from 'vitest';
import { DeterministicClothSimulation } from '../AgentAvatarCloth';

describe('DeterministicClothSimulation', () => {
  const rest = new Float32Array([-0.5, 1, 0, 0.5, 1, 0, -0.5, 0, 0, 0.5, 0, 0]);
  const indices = new Uint32Array([0, 2, 1, 1, 2, 3]);
  const weights = new Float32Array([0, 0, 1, 1]);

  it('keeps pins fixed, moves dynamic vertices, and replays byte-identically', () => {
    const simulation = new DeterministicClothSimulation(rest, indices, weights, {
      fixedStepHz: 120,
      wind: [0.4, 0, 0.2],
      maxDisplacement: 0.25,
    });
    const first = simulation.sample(0.75);
    const replay = simulation.sample(0.75);

    expect(Array.from(first.positions.slice(0, 6))).toEqual(Array.from(rest.slice(0, 6)));
    expect(first.receipt.dynamicVertexCount).toBe(2);
    expect(first.receipt.fixedSteps).toBe(90);
    expect(first.receipt.maxDisplacement).toBeGreaterThan(0.001);
    expect(first.receipt.maxDisplacement).toBeLessThanOrEqual(0.25 + 1e-6);
    expect(replay.receipt.positionDigest).toBe(first.receipt.positionDigest);
    expect(Array.from(replay.positions)).toEqual(Array.from(first.positions));
  });

  it('rejects a cloth-weight array that does not match the vertex count', () => {
    expect(() => new DeterministicClothSimulation(rest, indices, new Float32Array([1]))).toThrow(
      /one value per vertex/
    );
  });
});
