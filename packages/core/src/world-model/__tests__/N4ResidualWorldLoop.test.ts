import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  N4_METRIC_CONTRACT_SHA256,
  N4_RESIDUAL_TARGETS,
  compileN4ResidualWorldSource,
  generateN4Artifacts,
  generateN4Scene,
  predictN4Scene,
  proposeN4TypedMove,
  runN4Experiment,
  stepN4Exact,
  stepN4Truth,
  trainN4Models,
  verifyN4TypedMove,
  verifyN4Prediction,
} from '../N4ResidualWorldLoop';

const SOURCE_PATH = new URL('../n4_residual_world_loop.hsplus', import.meta.url);

function source(): string {
  return readFileSync(SOURCE_PATH, 'utf8');
}

describe('N4 exact-plus-learned residual world loop', () => {
  it('lowers one .hsplus source into digest-bound HSI-IR and LearningGraph custody', () => {
    const first = compileN4ResidualWorldSource(source());
    const second = compileN4ResidualWorldSource(source());

    expect(first.metricContractSha256).toBe(N4_METRIC_CONTRACT_SHA256);
    expect(first.ir.provenance.sourceSurface).toBe('hsplus');
    expect(first.ir.provenance.deterministicDigest).toBe(
      second.ir.provenance.deterministicDigest
    );
    expect(first.learningGraph.deterministicDigest).toBe(
      second.learningGraph.deterministicDigest
    );
    expect(first.residualTargets).toEqual(N4_RESIDUAL_TARGETS);
    expect(first.actionVocabulary).toEqual(['move']);
  });

  it('keeps exact kinematics authoritative and confines truth to declared residuals', () => {
    const scene = generateN4Scene(9100, 'ood');
    const action = { x: 1, y: 0 };
    const exact = stepN4Exact(scene, action);
    const truth = stepN4Truth(scene, action);

    expect(truth.objects).toHaveLength(exact.objects.length);
    expect(truth.objects.some((object, index) =>
      object.velocity.x !== exact.objects[index]!.velocity.x
    )).toBe(true);
    for (let index = 0; index < truth.objects.length; index += 1) {
      const residualVelocity =
        truth.objects[index]!.velocity.x - exact.objects[index]!.velocity.x;
      const residualPosition =
        truth.objects[index]!.position.x - exact.objects[index]!.position.x;
      expect(residualPosition).toBeCloseTo(residualVelocity * 0.1, 10);
    }
  });

  it('regenerates datasets, graph/type/weight tensors, and verifier cases deterministically', () => {
    const first = generateN4Artifacts(source());
    const second = generateN4Artifacts(source());

    expect(first.deterministicDigest).toBe(second.deterministicDigest);
    expect(first.dataManifest.trainSeeds).toHaveLength(64);
    expect(first.dataManifest.oodSeeds).toHaveLength(64);
    expect(first.weightsManifest.weightShape[0]).toBe(2);
    expect(first.weightsManifest.weightTensor.every(Number.isFinite)).toBe(true);
    expect(first.weightsManifest.typeTensor.length).toBe(
      first.weightsManifest.typeShape[0] * first.weightsManifest.typeShape[1]
    );
    expect(first.verifierCases.filter((testCase) => testCase.expected === 'reject')).toHaveLength(9);
  });

  it('makes undeclared action/target states unrepresentable and fails closed on digest tamper', () => {
    const contract = compileN4ResidualWorldSource(source());
    const trainScenes = Array.from({ length: 16 }, (_, index) =>
      generateN4Scene(4100 + index, 'train')
    );
    const models = trainN4Models(trainScenes);
    const scene = generateN4Scene(9101, 'ood');
    const action = { x: 1, y: 0 };
    const prediction = predictN4Scene(
      contract,
      models,
      'exact-plus-typed-residual-uncertainty',
      scene,
      action
    );

    expect(verifyN4Prediction(contract, prediction, scene, action)).toBe(true);
    expect(
      verifyN4Prediction(
        contract,
        { ...prediction, sourceDigest: 'sha256:tampered' },
        scene,
        action
      )
    ).toBe(false);
    expect(() =>
      proposeN4TypedMove(contract, models, scene, 'missing-object', action)
    ).toThrow(/not in the typed scene/);
    const typedMove = proposeN4TypedMove(contract, models, scene, 'object-0', action);
    expect(typedMove).toMatchObject({
      type: 'move',
      entityId: 'object-0',
      residualScope: N4_RESIDUAL_TARGETS,
    });
    expect(verifyN4TypedMove(typedMove)).toBe(true);
    expect(
      verifyN4TypedMove({ ...typedMove, deterministicDigest: 'sha256:stale' })
    ).toBe(false);
    expect(
      verifyN4TypedMove({
        ...typedMove,
        residualScope: [...typedMove.residualScope, 'host.process'] as typeof typedMove.residualScope,
      })
    ).toBe(false);
  });

  it('meets or honestly narrows the frozen preregistered admission gates', () => {
    const receipt = runN4Experiment(source());
    expect(receipt.metrics.map((metric) => metric.arm)).toHaveLength(5);
    expect(receipt.metricContractSha256).toBe(N4_METRIC_CONTRACT_SHA256);
    expect(receipt.deterministicDigest).toMatch(/^sha256:/);
    if (!receipt.admitted) {
      expect(receipt.claim).toBe('narrowed');
      expect(receipt.failedGates.length).toBeGreaterThan(0);
    } else {
      expect(receipt.claim).toBe('n4-candidate');
      expect(receipt.failedGates).toEqual([]);
    }
  }, 60_000);
});
