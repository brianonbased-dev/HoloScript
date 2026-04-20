/**
 * Integration-style tests for MCP ops pipeline primitives (P.008.03).
 * Implementation: packages/mcp-server/src/ops/pipeline.ts
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AnomalyDetector,
  AutoScalingLoop,
  PredictiveLoadBalancer,
} from '../../packages/mcp-server/src/ops/pipeline';

describe('ops pipeline (P.008.03)', () => {
  it('AnomalyDetector ingests tool metrics and fires alert on high error rate', () => {
    const onAlert = vi.fn();
    const detector = new AnomalyDetector({
      windowMs: 60_000,
      minSamples: 5,
      maxErrorRate: 0.4,
      onAlert,
    });

    const t0 = Date.now();
    for (let i = 0; i < 4; i++) {
      detector.ingest({
        toolName: 'compile_holoscript',
        latencyMs: 20,
        error: false,
        timestamp: t0 + i * 100,
      });
    }
    expect(onAlert).not.toHaveBeenCalled();

    detector.ingest({
      toolName: 'compile_holoscript',
      latencyMs: 50,
      error: true,
      timestamp: t0 + 500,
    });
    detector.ingest({
      toolName: 'compile_holoscript',
      latencyMs: 40,
      error: true,
      timestamp: t0 + 600,
    });
    detector.ingest({
      toolName: 'compile_holoscript',
      latencyMs: 35,
      error: true,
      timestamp: t0 + 700,
    });

    expect(onAlert).toHaveBeenCalledTimes(1);
    const arg = onAlert.mock.calls[0]![0];
    expect(arg.reason).toBe('high_tool_error_rate');
    expect(arg.errorRate).toBeGreaterThanOrEqual(0.4);
    expect(arg.p95LatencyMs).toBeGreaterThanOrEqual(35);
    expect(arg.requestRatePerMin).toBeGreaterThan(0);
  });

  it('AutoScalingLoop evaluates policy and calls scaler mock', async () => {
    const setReplicas = vi.fn().mockResolvedValue(undefined);
    const loop = new AutoScalingLoop(
      { setReplicas },
      {
        minReplicas: 2,
        maxReplicas: 10,
        scaleUpUtilThreshold: 0.85,
        scaleDownUtilThreshold: 0.25,
      }
    );

    await loop.evaluate({ utilization: 0.9, currentReplicas: 3 });
    expect(setReplicas).toHaveBeenCalledWith(4);

    setReplicas.mockClear();
    await loop.evaluate({ utilization: 0.2, currentReplicas: 4 });
    expect(setReplicas).toHaveBeenCalledWith(3);

    setReplicas.mockClear();
    await loop.evaluate({ utilization: 0.5, currentReplicas: 5 });
    expect(setReplicas).not.toHaveBeenCalled();
  });

  it('PredictiveLoadBalancer updates normalized weights from health scores', () => {
    const lb = new PredictiveLoadBalancer(['a', 'b', 'c']);
    lb.updateWeights({ a: 1, b: 0.5, c: 0.5 });

    const w = lb.getWeights();
    expect(w.get('a')).toBeCloseTo(0.5, 5);
    expect(w.get('b')).toBeCloseTo(0.25, 5);
    expect(w.get('c')).toBeCloseTo(0.25, 5);
    let sum = 0;
    w.forEach((v) => {
      sum += v;
    });
    expect(sum).toBeCloseTo(1, 5);

    lb.updateWeights({ a: 0.2, b: 1, c: 1 });
    expect(lb.getWeight('b')).toBeGreaterThan(lb.getWeight('a'));
  });
});
