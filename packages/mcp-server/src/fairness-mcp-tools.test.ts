/**
 * Smoke tests for the fairness MCP tools — exercises the real lazy-imported
 * @holoscript/engine Simulation surface end to end through the MCP handlers.
 */

import { describe, it, expect } from 'vitest';
import { handleFairnessTool, isFairnessToolName, fairnessTools } from './fairness-mcp-tools';

// Deterministic, RNG-free cohort with unambiguous disparate impact: group A has
// low proxy risk (approved), group B has high proxy risk (rejected) under the
// biased weights below. A plumbing smoke test wants a guaranteed verdict, not a
// statistical threshold — the engine-level suite covers the sampled case.
function makeCohort(
  _seed: number,
  n = 200
): Array<{ group: string; features: Record<string, number> }> {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const group = i % 2 === 0 ? 'A' : 'B';
    rows.push({ group, features: { income: 0.5, zip_risk: group === 'B' ? 0.9 : 0.1 } });
  }
  return rows;
}

// Additive linear model: zip_risk is a PENALTY, so its weight is negative.
const biased = {
  id: 'underwriting',
  weights: { income: 1.0, zip_risk: -1.0 },
  bias: 0,
  threshold: 0.25,
};

describe('fairness MCP tools', () => {
  it('registers both tools with required schemas', () => {
    expect(isFairnessToolName('fairness_sweep')).toBe(true);
    expect(isFairnessToolName('explain_fairness_receipt')).toBe(true);
    expect(isFairnessToolName('compile_to_bias_audit_report')).toBe(true);
    expect(isFairnessToolName('not_a_tool')).toBe(false);
    expect(fairnessTools.map((t) => t.name).sort()).toEqual([
      'compile_to_bias_audit_report',
      'explain_fairness_receipt',
      'fairness_sweep',
    ]);
  });

  it('fairness_sweep emits a flagged, integrity-verifiable receipt', async () => {
    const cohort = makeCohort(7);
    const res = (await handleFairnessTool('fairness_sweep', {
      cohort,
      model: biased,
      seed: 1,
    })) as {
      receipt: { kind: string; decision: string; replayFingerprint: string };
      decision: string;
    };

    expect(res.receipt.kind).toBe('fairness.receipt.v1');
    expect(res.receipt.decision).toBe('FLAG-DISPARATE-IMPACT');
    expect(typeof res.receipt.replayFingerprint).toBe('string');

    const explain = (await handleFairnessTool('explain_fairness_receipt', {
      receipt: res.receipt,
    })) as { integrity: boolean; explanation: string };
    expect(explain.integrity).toBe(true);
    expect(explain.explanation).toContain('4/5ths');
  });

  it('runs jurisdictional sweep and compiles a bias audit report', async () => {
    const res = (await handleFairnessTool('fairness_sweep', {
      cohort: makeCohort(7),
      model: biased,
      jurisdiction: 'NYC_LL144',
      seed: 1,
    })) as {
      receipt: {
        kind: string;
        jurisdiction?: { jurisdictionId: string; requiredTests: string[] };
      };
    };

    expect(res.receipt.jurisdiction?.jurisdictionId).toBe('NYC_LL144');
    expect(res.receipt.jurisdiction?.requiredTests).toContain('chi_squared');

    const report = (await handleFairnessTool('compile_to_bias_audit_report', {
      receipt: res.receipt,
      generatedAt: '2026-06-21T00:00:00Z',
      issuer: 'mcp-test',
    })) as { target: string; content: string; jurisdictionId: string };

    expect(report.target).toBe('bias_audit_report');
    expect(report.jurisdictionId).toBe('NYC_LL144');
    expect(report.content).toContain('NYC Local Law 144 annual AEDT bias audit public summary');
  });

  it('explain_fairness_receipt detects a tampered receipt', async () => {
    const cohort = makeCohort(7);
    const res = (await handleFairnessTool('fairness_sweep', {
      cohort,
      model: biased,
    })) as { receipt: Record<string, unknown> & { metrics: Record<string, unknown> } };

    const forged = {
      ...res.receipt,
      metrics: { ...res.receipt.metrics, adverseImpactRatio: 0.99 },
    };
    const explain = (await handleFairnessTool('explain_fairness_receipt', {
      receipt: forged,
    })) as { integrity: boolean };
    expect(explain.integrity).toBe(false);
  });

  it('rejects malformed input', async () => {
    await expect(
      handleFairnessTool('fairness_sweep', { cohort: [], model: biased })
    ).rejects.toThrow();
    await expect(
      handleFairnessTool('fairness_sweep', { cohort: makeCohort(1, 4) })
    ).rejects.toThrow();
  });
});
