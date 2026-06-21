import { describe, expect, it, vi } from 'vitest';
import {
  analyzeFairnessWindow,
  deriveFairnessRisk,
  fairnessMonitorHandler,
  runFairnessMonitorSweep,
  stableFairnessMonitorHash,
  type FairnessInferenceRecord,
} from '../FairnessMonitorTrait';

const baseConfig = fairnessMonitorHandler.defaultConfig!;

function records(
  groupAApproved: number,
  groupATotal: number,
  groupBApproved: number,
  groupBTotal: number
) {
  const output: FairnessInferenceRecord[] = [];
  for (let i = 0; i < groupATotal; i++) {
    output.push({
      modelId: 'loan-model-v4',
      protectedAttribute: 'A',
      approved: i < groupAApproved,
    });
  }
  for (let i = 0; i < groupBTotal; i++) {
    output.push({
      modelId: 'loan-model-v4',
      protectedAttribute: 'B',
      approved: i < groupBApproved,
    });
  }
  return output;
}

describe('FairnessMonitorTrait metrics', () => {
  it('computes adverse-impact metrics for a sliding inference window', () => {
    const metrics = analyzeFairnessWindow(records(8, 10, 4, 10));

    expect(metrics.approvalRate).toEqual({ A: 0.8, B: 0.4 });
    expect(metrics.adverseImpactRatio).toBe(0.5);
    expect(metrics.demographicParityDiff).toBe(0.4);
    expect(metrics.fourFifthsPass).toBe(false);
  });

  it('derives green, amber, and red RAG risk from policy thresholds', () => {
    expect(
      deriveFairnessRisk(
        {
          approvalRate: { A: 0.8, B: 0.72 },
          adverseImpactRatio: 0.9,
          demographicParityDiff: 0.08,
          fourFifthsPass: true,
        },
        baseConfig
      )
    ).toBe('green');

    expect(
      deriveFairnessRisk(
        {
          approvalRate: { A: 0.8, B: 0.61 },
          adverseImpactRatio: 0.76,
          demographicParityDiff: 0.19,
          fourFifthsPass: false,
        },
        baseConfig
      )
    ).toBe('amber');

    expect(
      deriveFairnessRisk(
        {
          approvalRate: { A: 0.8, B: 0.4 },
          adverseImpactRatio: 0.5,
          demographicParityDiff: 0.4,
          fourFifthsPass: false,
        },
        baseConfig
      )
    ).toBe('red');
  });

  it('produces stable receipt hashes for equivalent sweep inputs', () => {
    const window = records(8, 10, 4, 10);
    const receipt = runFairnessMonitorSweep(window, baseConfig, {
      issuedAt: '2026-06-21T00:00:00.000Z',
      sweepNumber: 2,
    });
    const replayed = runFairnessMonitorSweep(window, baseConfig, {
      issuedAt: '2026-06-21T00:00:00.000Z',
      sweepNumber: 2,
    });

    expect(receipt.risk).toBe('red');
    expect(receipt.status).toBe('policy_drift');
    expect(receipt.receiptId).toBe(`fm_${receipt.receiptHash}`);
    expect(receipt.receiptHash).toBe(replayed.receiptHash);
    expect(stableFairnessMonitorHash({ b: 2, a: 1 })).toBe(
      stableFairnessMonitorHash({ a: 1, b: 2 })
    );
  });
});

describe('fairnessMonitorHandler', () => {
  it('emits receipts, security drift events, and audit logs on cadence sweeps', () => {
    const node = { id: 'fairness-node' };
    const emit = vi.fn();
    const config = {
      ...baseConfig,
      min_window_size: 4,
      sweep_cadence: 4,
      window_size: 8,
    };

    fairnessMonitorHandler.onAttach!(node as never, config, { emit } as never);
    fairnessMonitorHandler.onEvent!(
      node as never,
      config,
      { emit } as never,
      {
        type: 'fairness_monitor:record_batch',
        payload: {
          records: [
            { modelId: 'loan-model-v4', protectedAttribute: 'A', approved: true },
            { modelId: 'loan-model-v4', protectedAttribute: 'A', approved: true },
            { modelId: 'loan-model-v4', protectedAttribute: 'B', approved: false },
            { modelId: 'loan-model-v4', protectedAttribute: 'B', approved: false },
          ],
        },
      } as never
    );

    expect(emit).toHaveBeenCalledWith(
      'fairness_monitor_receipt',
      expect.objectContaining({
        receipt: expect.objectContaining({
          modelId: 'loan-model-v4',
          risk: 'red',
          status: 'policy_drift',
        }),
      })
    );
    expect(emit).toHaveBeenCalledWith(
      'fairness_drift_event',
      expect.objectContaining({
        action: 'fairness_monitor.drift',
        actor: 'loan-model-v4',
        outcome: 'error',
        risk: 'red',
      })
    );
    expect(emit).toHaveBeenCalledWith(
      'audit_log',
      expect.objectContaining({
        action: 'fairness_monitor.sweep',
        result: 'error',
        severity: 'critical',
      })
    );
  });

  it('accepts external engine fairness sweep receipts', () => {
    const node = { id: 'fairness-node' };
    const emit = vi.fn();

    fairnessMonitorHandler.onAttach!(node as never, baseConfig, { emit } as never);
    fairnessMonitorHandler.onEvent!(
      node as never,
      baseConfig,
      { emit } as never,
      {
        type: 'fairness_monitor:sweep_result',
        payload: {
          receipt: {
            modelId: 'engine-model',
            protectedAttribute: 'cohort',
            sampleSize: 100,
            metrics: {
              approvalRate: { A: 0.8, B: 0.4 },
              adverseImpactRatio: 0.5,
              demographicParityDiff: 0.4,
              fourFifthsPass: false,
            },
            receiptHash: 'engine_hash',
            issuedAt: '2026-06-21T00:00:00.000Z',
          },
        },
      } as never
    );

    expect(emit).toHaveBeenCalledWith(
      'fairness_monitor_receipt',
      expect.objectContaining({
        receipt: expect.objectContaining({
          modelId: 'engine-model',
          protectedAttribute: 'cohort',
          sourceReceiptHash: 'engine_hash',
        }),
      })
    );
  });
});
