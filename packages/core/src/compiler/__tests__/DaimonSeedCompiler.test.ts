import { describe, expect, it, vi } from 'vitest';
import {
  DaimonSeedCompiler,
  computeExportFidelity,
  runHysteresisExp2,
  type DaimonSeedIR,
} from '../DaimonSeedCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { readJson } from '../../errors/safeJsonParse';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

const composition = {
  type: 'Composition',
  name: 'SeededTutor',
  templates: [],
  objects: [
    {
      type: 'Object',
      name: 'mentor_agent',
      traits: [
        { type: 'ObjectTrait', name: 'agent', config: { role: 'mentor' } },
        { type: 'ObjectTrait', name: 'emergence', config: { heldout: true } },
      ],
      properties: [{ type: 'ObjectProperty', key: 'domain', value: 'learning' }],
    },
  ],
  spatialGroups: [],
  lights: [],
  imports: [],
  timelines: [],
  audio: [],
  zones: [],
  transitions: [],
  conditionals: [],
  iterators: [],
  npcs: [],
  quests: [],
  abilities: [],
  dialogues: [],
  stateMachines: [],
  achievements: [],
  talentTrees: [],
  shapes: [],
} as unknown as HoloComposition;

function compileSeed(options = {}): DaimonSeedIR {
  const compiler = new DaimonSeedCompiler({
    provenanceChainRef: 'prov:v2:test',
    emergenceContractRef: 'emergence:t4:test',
    noiseFloorRef: 'noise:test',
    ...options,
  });
  return readJson(compiler.compile(composition, 'test-token')) as DaimonSeedIR;
}

describe('DaimonSeedCompiler', () => {
  it('emits deterministic seed-only IR with shared JSON-Logic threshold runtime', () => {
    const first = compileSeed();
    const second = compileSeed();

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe('holoscript.daimon-seed.v0.1.0');
    expect(first.kind).toBe('DaimonSeed');
    expect(first.thresholdRuntime).toEqual({
      id: 'ContentPolicyGate.jsonLogic',
      source: 'packages/core/src/policy/jsonLogic.ts',
      operators: 'shared-json-logic-subset',
    });
    expect(first.thresholdPreview.passed).toBe(true);
    expect(first.compositionPriors.traitVocabulary).toEqual(['agent', 'emergence']);
    expect(first.compositionPriors.initialWeights).toEqual({ agent: 1, emergence: 1 });
    expect(first.fieldPriors).toEqual({
      tensorSchema: 'trait-prior-vector/v1',
      shape: [2],
      dtype: 'float32',
      weightsRef: 'weights:not-serialized',
    });
    expect(first.fidelityContract).toEqual({
      metric: 'exportFidelity',
      formula: '1 - div(runtime,download)/noise_floor',
      divergence: 'rootMeanSquare',
      lowFidelityVerdict: 'forbidden_theater',
      receiptRequired: true,
    });
    expect(first.hysteresisExp2.coefficient).toBe('div(A,B)/div(A,A_prime)');
    expect(first.hysteresisExp2.diffContentArm).toBe('upper-bound scale only, non-diagnostic');
    expect(first.custody.ownedObject).toBe('lossless_recipe');
    expect(first.custody.weightsOwnership).toBe('not_owned');
    expect(first.custody.runtimeOnly).toEqual(['realizedComposition', 'observationPath', 'soul']);
    expect(first.provenanceChainRef).toBe('prov:v2:test');
    expect(first.emergenceContractRef).toBe('emergence:t4:test');
  });

  it('never serializes realized composition, observation path, or soul payloads', () => {
    const raw = new DaimonSeedCompiler().compile(composition, 'test-token');
    const parsed = readJson(raw) as Record<string, unknown>;

    expect(parsed).not.toHaveProperty('realizedComposition');
    expect(parsed).not.toHaveProperty('observationPath');
    expect(parsed).not.toHaveProperty('soul');
    expect(raw).not.toContain('"realizedComposition":');
    expect(raw).not.toContain('"observationPath":');
    expect(raw).not.toContain('"soul":');
  });

  it('evaluates caller-provided thresholds through the shared policy JSON-Logic evaluator', () => {
    const seed = compileSeed({
      thresholdFn: {
        and: [
          { '>': [{ var: 'hysteresisCoefficient' }, 4] },
          { '===': [{ var: 'tier' }, 'R1b'] },
        ],
      },
      thresholdFacts: {
        hysteresisCoefficient: 5.25,
        tier: 'R1b',
      },
      initialWeights: { agent: 0.75, emergence: 1.25 },
    });

    expect(seed.thresholdPreview).toEqual({
      facts: { hysteresisCoefficient: 5.25, tier: 'R1b' },
      result: true,
      passed: true,
    });
    expect(seed.compositionPriors.initialWeights).toEqual({ agent: 0.75, emergence: 1.25 });
  });

  it('wraps compile output as daimon-seed.json', () => {
    const files = new DaimonSeedCompiler().compileToFiles(composition, 'test-token');

    expect(Object.keys(files)).toEqual(['daimon-seed.json']);
    expect(files['daimon-seed.json']).toContain('"kind": "DaimonSeed"');
  });

  it('computes export fidelity against a measured noise floor', () => {
    const result = computeExportFidelity({
      runtimeVector: [1, 2, 3],
      downloadedVector: [1, 2, 4],
      noiseFloor: 2,
    });

    expect(result.divergence).toBeCloseTo(Math.sqrt(1 / 3));
    expect(result.exportFidelity).toBeCloseTo(1 - Math.sqrt(1 / 3) / 2);
    expect(result.forbiddenTheater).toBe(false);
  });

  it('detects hysteresis only when same-set shuffle divergence dominates noise and plateaus', () => {
    const real = runHysteresisExp2({
      ordered: [1, 1, 1],
      shuffled: [3, 3, 3],
      rerun: [1.1, 1, 1],
      coefficientSeries: [34.5, 34.7, 34.7],
    });
    const notPlateaued = runHysteresisExp2({
      ordered: [1, 1, 1],
      shuffled: [3, 3, 3],
      rerun: [1.1, 1, 1],
      coefficientSeries: [10, 20, 35],
    });

    expect(real.hysteresisCoefficient).toBeGreaterThan(1);
    expect(real.plateaued).toBe(true);
    expect(real.pathDependenceReal).toBe(true);
    expect(real.diagnostic).toBe('path-dependent');
    expect(notPlateaued.pathDependenceReal).toBe(false);
    expect(notPlateaued.diagnostic).toBe('not-plateaued');
  });
});
