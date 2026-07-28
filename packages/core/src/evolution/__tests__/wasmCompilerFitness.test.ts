import { describe, expect, it } from 'vitest';
import type { Gate } from '../EvolveProgramBackend';
import {
  makeWasmCompilerFitnessGate,
  scoreWasmCompilerArtifact,
  wasmFitnessBaselineFromScenario,
} from '../wasmCompilerFitness';

describe('wasmCompilerFitness', () => {
  it('scores WAT density as wat.length / memoryLayout.totalSize', () => {
    const measured = scoreWasmCompilerArtifact({
      wat: '(module)',
      memoryLayout: { totalSize: 4 },
    });

    expect(measured).toMatchObject({
      passed: true,
      score: 2,
      watLength: 8,
      memoryTotalSize: 4,
      baselineScore: null,
      improvementPct: null,
    });
  });

  it('computes baseline improvement when a scenario provides density inputs', () => {
    const baseline = wasmFitnessBaselineFromScenario('wasm-evolve-density', {
      watLength: 100,
      memoryTotalSize: 20,
    });

    const measured = scoreWasmCompilerArtifact(
      { wat: 'x'.repeat(80), memoryLayout: { totalSize: 20 } },
      { baseline, requireImprovement: true }
    );

    expect(baseline?.score).toBe(5);
    expect(measured.passed).toBe(true);
    expect(measured.score).toBe(4);
    expect(measured.improvementPct).toBe(20);
  });

  it('fails the improvement gate when a candidate only matches the baseline', () => {
    const baseline = wasmFitnessBaselineFromScenario('wasm-evolve-density', {
      wasmDensity: 4,
      watLength: 80,
      memoryTotalSize: 20,
    });

    const measured = scoreWasmCompilerArtifact(
      { wat: 'x'.repeat(80), memoryLayout: { totalSize: 20 } },
      { baseline, requireImprovement: true }
    );

    expect(measured).toMatchObject({
      passed: false,
      score: 4,
      baselineScore: 4,
      improvementPct: 0,
      note: 'no_baseline_improvement',
    });
  });

  it('fails empty WAT and invalid memory layouts', () => {
    expect(scoreWasmCompilerArtifact({ wat: '', memoryLayout: { totalSize: 1 } }).passed).toBe(
      false
    );
    expect(
      scoreWasmCompilerArtifact({ wat: '(module)', memoryLayout: { totalSize: 0 } }).passed
    ).toBe(false);
  });

  it('adapts the scorer to an EvolveProgramBackend Gate', async () => {
    const gate: Gate = makeWasmCompilerFitnessGate(async (code) => ({
      wat: code,
      memoryLayout: { totalSize: 10 },
    }));

    await expect(gate('12345')).resolves.toEqual({ passed: true, score: 0.5 });
  });

  it('keeps correctness failures outside the fitness archive', async () => {
    const gate = makeWasmCompilerFitnessGate(
      async () => ({ wat: '(module)', memoryLayout: { totalSize: 1 } }),
      { correctness: async () => ({ passed: false, note: 'compiler-tests-failed' }) }
    );

    await expect(gate('candidate')).resolves.toEqual({ passed: false, score: Infinity });
  });
});
