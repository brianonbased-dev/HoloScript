import { describe, expect, test } from 'vitest';
import { parseHolo } from '../HoloCompositionParser';

describe('PolicyPack block parser', () => {
  test('parses a named versioned policy_pack primitive', () => {
    const source = `
      composition "GovernedModel" {
        policy_pack fair_lending_v1 {
          version: "2026.06"
          framework_id: CFPB_FAIR_LENDING
          required_tests: [
            { id: "four_fifths", protected_attribute: "race", adverse_impact_ratio_min: 0.8 },
            { id: "robustness", protected_attribute: "sex", require_robustness_receipt: true }
          ]
          required_compile_targets: [
            "model_card",
            "impact_assessment",
            "declaration_of_conformity"
          ]
          audit_retention {
            min_days: 2555
            storage: "immutable_ledger"
          }
          monitoring {
            interval: "quarterly"
            drift_sweep_required: true
          }
        }
      }
    `;

    const result = parseHolo(source);

    expect(result.success).toBe(true);
    const policyPack = result.ast!.policyPacks![0];
    expect(policyPack.type).toBe('PolicyPack');
    expect(policyPack.name).toBe('fair_lending_v1');
    expect(policyPack.version).toBe('2026.06');
    expect(policyPack.frameworkId).toBe('CFPB_FAIR_LENDING');
    expect(policyPack.requiredTests).toHaveLength(2);
    expect(policyPack.requiredCompileTargets).toEqual([
      'model_card',
      'impact_assessment',
      'declaration_of_conformity',
    ]);
    expect(policyPack.auditRetention.min_days).toBe(2555);
    expect(policyPack.monitoringCadence.interval).toBe('quarterly');
  });
});
