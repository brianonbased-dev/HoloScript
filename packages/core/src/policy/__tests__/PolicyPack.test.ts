import { describe, expect, test } from 'vitest';
import {
  assertPolicyPackDeploymentReady,
  definePolicyPack,
  evaluatePolicyPackDeployment,
  policyPackFromSchemaBlock,
  PolicyPackDeploymentError,
  type PolicyPack,
} from '../PolicyPack';

const pack = (): PolicyPack =>
  definePolicyPack({
    name: 'fair-lending-v1',
    version: '2026.06',
    frameworkId: 'CFPB_FAIR_LENDING',
    requiredTests: [
      {
        id: 'four-fifths-race',
        protectedAttribute: 'race',
        minSampleSize: 100,
        adverseImpactRatioMin: 0.8,
        demographicParityDiffMax: 0.2,
      },
      {
        id: 'robustness-sex',
        protectedAttribute: 'sex',
        requireRobustnessReceipt: true,
      },
    ],
    requiredCompileTargets: ['model_card', 'impact_assessment', 'declaration_of_conformity'],
    auditRetention: { minDays: 2555, storage: 'immutable_ledger', legalHold: true },
    monitoringCadence: { interval: 'quarterly', driftSweepRequired: true },
  });

describe('PolicyPack deployment gate', () => {
  test('validates the named framework bundle shape', () => {
    const p = pack();
    expect(p.type).toBe('PolicyPack');
    expect(p.frameworkId).toBe('CFPB_FAIR_LENDING');
    expect(p.requiredCompileTargets).toContain('model_card');
  });

  test('normalizes .holo policy_pack block fields into the typed schema', () => {
    const p = policyPackFromSchemaBlock({
      name: 'nyc_ll144_hiring',
      version: '2026.06',
      frameworkId: 'NYC_LL144',
      requiredTests: [
        {
          id: 'selection-rate',
          protected_attribute: 'gender',
          adverse_impact_ratio_min: 0.8,
          min_sample_size: 50,
        },
      ],
      requiredCompileTargets: ['model_card', 'impact_assessment'],
      auditRetention: { min_days: 365, storage: 'append_only' },
      monitoringCadence: { interval: 'annual', drift_sweep_required: true },
    });

    expect(p.frameworkId).toBe('NYC_LL144');
    expect(p.requiredTests[0].protectedAttribute).toBe('gender');
    expect(p.requiredTests[0].adverseImpactRatioMin).toBe(0.8);
    expect(p.auditRetention.minDays).toBe(365);
    expect(p.monitoringCadence.driftSweepRequired).toBe(true);
  });

  test('refuses deploy when required fairness tests are missing', () => {
    const evaluation = evaluatePolicyPackDeployment(pack(), {
      tests: [],
      compileTargets: [
        { target: 'model_card', artifactId: 'mc-1' },
        { target: 'impact_assessment', artifactId: 'ia-1' },
        { target: 'declaration_of_conformity', artifactId: 'doc-1' },
      ],
      auditRetentionAccepted: true,
      monitoringScheduled: true,
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.missingTests).toEqual(['four-fifths-race', 'robustness-sex']);
    expect(evaluation.issues.map((issue) => issue.code)).toContain('missing_required_test');
  });

  test('refuses deploy when compliance compile artifacts are absent', () => {
    const evaluation = evaluatePolicyPackDeployment(pack(), {
      tests: [
        {
          id: 'four-fifths-race',
          passed: true,
          sampleSize: 120,
          adverseImpactRatio: 0.86,
          demographicParityDiff: 0.1,
          receiptHash: 'r1',
        },
        {
          id: 'robustness-sex',
          passed: true,
          adverseImpactRatio: 0.9,
          robustnessReceiptHash: 'rr1',
        },
      ],
      compileTargets: [{ target: 'model_card', artifactId: 'mc-1' }],
      auditRetentionAccepted: true,
      monitoringScheduled: true,
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.missingCompileTargets).toEqual([
      'impact_assessment',
      'declaration_of_conformity',
    ]);
  });

  test('allows deploy only when tests, artifacts, retention, and monitoring are armed', () => {
    const evaluation = assertPolicyPackDeploymentReady(pack(), {
      tests: [
        {
          id: 'four-fifths-race',
          passed: true,
          sampleSize: 250,
          adverseImpactRatio: 0.82,
          demographicParityDiff: 0.18,
          receiptHash: 'r1',
        },
        {
          id: 'robustness-sex',
          passed: true,
          adverseImpactRatio: 0.91,
          robustnessReceiptHash: 'rr1',
        },
      ],
      compileTargets: [
        { target: 'model_card', artifactId: 'mc-1' },
        { target: 'impact_assessment', artifactId: 'ia-1' },
        { target: 'declaration_of_conformity', artifactId: 'doc-1' },
      ],
      auditRetentionAccepted: true,
      monitoringScheduled: true,
    });

    expect(evaluation.allowed).toBe(true);
    expect(evaluation.issues).toEqual([]);
  });

  test('throws a deployment error that preserves machine-readable issues', () => {
    expect(() =>
      assertPolicyPackDeploymentReady(pack(), {
        tests: [],
        compileTargets: [],
      })
    ).toThrow(PolicyPackDeploymentError);
  });
});
