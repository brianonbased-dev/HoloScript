import { describe, expect, it } from 'vitest';
import { assessPublishWorthiness, type PublishWorthinessInput } from '../publishWorthinessDetector';

function worthySimulationInput(
  overrides: Partial<PublishWorthinessInput> = {}
): PublishWorthinessInput {
  return {
    userIntent:
      'Validate a reproducible WebGPU spatial solver paper claim against baseline Three.js demos so reviewers can inspect the evidence path.',
    projectDNA: {
      kind: 'spatial',
      confidence: 0.72,
      frameworks: ['three', 'react', 'webgpu'],
      languages: ['ts', 'tsx', 'wgsl'],
      packageManagers: ['pnpm'],
      repoShape: 'monorepo',
      strengths: ['has-tests', 'documented', 'typed', 'has-ci'],
      riskSignals: ['polyglot-complexity'],
      recommendedMode: 'deep',
    },
    absorbGraph: {
      totalFiles: 220,
      totalSymbols: 760,
      totalImports: 340,
      totalLoc: 38_000,
      totalCalls: 940,
      hubFiles: [
        { path: 'src/solver/StructuralReplayHarness.ts', inDegree: 18, symbols: 28 },
        { path: 'src/webgpu/ComputePipeline.ts', inDegree: 12, symbols: 21 },
      ],
      domainTerms: ['webgpu', 'solver', 'ablation', 'replay', 'provenance'],
      errors: [],
    },
    paths: [
      'src/solver/StructuralReplayHarness.ts',
      'src/webgpu/ComputePipeline.ts',
      'src/__tests__/solver-replay.test.ts',
      'benchmarks/webgpu-structural-harness.json',
      'docs/demos/full-loop-d011.md',
      'research/paper-spatial-solver/ablation.md',
    ],
    conversionCandidates: [
      {
        id: 'solver',
        rank: 1,
        sourcePaths: ['src/solver/StructuralReplayHarness.ts'],
        detectedPattern: 'compiler or export target',
        target: 'compiler-export-target',
        confidence: 0.9,
        value: 9,
        effort: 'deep',
        risk: 'high',
        whyItMatters: 'Turns the solver into a reusable HoloScript compile target.',
        nextAction: 'Map AST shape and conformance fixtures.',
      },
      {
        id: 'scene',
        rank: 2,
        sourcePaths: ['src/webgpu/SceneCanvas.tsx'],
        detectedPattern: 'Three.js or R3F scene',
        target: 'hololand-scene',
        confidence: 0.86,
        value: 9,
        effort: 'moderate',
        risk: 'medium',
        whyItMatters: 'Maps spatial scene evidence into HoloLand.',
        nextAction: 'Extract meshes, controls, and replay loop.',
      },
      {
        id: 'config',
        rank: 3,
        sourcePaths: ['package.json'],
        detectedPattern: 'declarative config',
        target: '.hsplus',
        confidence: 0.84,
        value: 8,
        effort: 'quick',
        risk: 'low',
        whyItMatters: 'Captures commands and evidence contracts.',
        nextAction: 'Generate a system profile.',
      },
    ],
    noveltyClaims: [
      'Composition-level replay proves solver interventions without rewriting the renderer.',
      'Evidence artifacts connect user actions, WebGPU compute output, and paper D.011 gates.',
    ],
    differentiators: [
      'Baseline demos show frames, but this preserves semantic, execution, interaction, and evidence truth.',
    ],
    baselineComparisons: ['Three.js examples', 'manual Jupyter notebooks'],
    evidence: {
      artifacts: ['research/paper-spatial-solver/claim-map.md'],
      benchmarkPaths: ['benchmarks/webgpu-structural-harness.json'],
      demoPaths: ['docs/demos/full-loop-d011.md'],
      studyPaths: ['research/paper-spatial-solver/n12-study-plan.md'],
      ablationPaths: ['research/paper-spatial-solver/ablation.md'],
      hardwarePaths: ['benchmarks/HARDWARE.md'],
      hasHardwarePlan: true,
      hasN12StudyPlan: true,
      hasFullLoopDemo: true,
      hasAblationPlan: true,
      hasBenchmarkHarness: true,
      claims: ['RTX benchmark has a reproducible rerun command.'],
    },
    ...overrides,
  };
}

describe('assessPublishWorthiness', () => {
  it('unlocks the hidden paper lane only for evidence-backed publishable projects', () => {
    const assessment = assessPublishWorthiness(worthySimulationInput());

    expect(assessment.verdict).toBe('unlock');
    expect(assessment.hiddenPaperProgramUnlocked).toBe(true);
    expect(assessment.finalScore).toBeGreaterThanOrEqual(assessment.threshold);
    expect(assessment.requiredGateFailures).toEqual([]);
    expect(assessment.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'novelty', score: expect.any(Number) }),
        expect.objectContaining({ key: 'd011Feasibility', score: expect.any(Number) }),
      ])
    );
    expect(assessment.llmAssistPrompt).toContain('Return JSON with verdict');
  });

  it('keeps routine cleanup below the unlock threshold', () => {
    const assessment = assessPublishWorthiness({
      userIntent: 'Cleanup old TODOs and refactor only the admin CRUD pages.',
      projectDNA: {
        kind: 'frontend',
        confidence: 0.58,
        frameworks: ['react'],
        languages: ['tsx'],
        repoShape: 'single-package',
        strengths: ['typed'],
      },
      paths: [
        'src/app/users/page.tsx',
        'src/app/products/page.tsx',
        'src/app/orders/page.tsx',
        'src/components/AdminList.tsx',
      ],
      conversionCandidates: [],
    });

    expect(assessment.verdict).toBe('locked');
    expect(assessment.hiddenPaperProgramUnlocked).toBe(false);
    expect(assessment.finalScore).toBeLessThan(assessment.threshold);
    expect(assessment.disqualifyingSignals).toEqual(
      expect.arrayContaining(['routine-cleanup', 'generic-crud'])
    );
  });

  it('does not let an LLM review unlock a thin demo without deterministic evidence', () => {
    const assessment = assessPublishWorthiness({
      userIntent: 'Thin demo landing page for a portfolio.',
      paths: ['src/app/page.tsx', 'src/components/Hero.tsx'],
      llmReview: {
        verdict: 'unlock',
        score: 96,
        confidence: 1,
        rationale: 'Looks exciting.',
      },
    });

    expect(assessment.hiddenPaperProgramUnlocked).toBe(false);
    expect(assessment.llmAdjustment).toBeGreaterThan(0);
    expect(assessment.disqualifyingSignals).toContain('thin-demo');
    expect(assessment.requiredGateFailures).toEqual(
      expect.arrayContaining(['Disqualified by thin-demo.'])
    );
  });
});
