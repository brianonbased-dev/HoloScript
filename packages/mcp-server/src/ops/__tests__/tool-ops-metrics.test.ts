import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildOpsMetricsPrometheusText,
  recordSecuredToolOutcome,
  notifyOpsAnomalyFired,
  __testOnly_resetToolOpsMetrics,
} from '../tool-ops-metrics.js';

describe('tool-ops-metrics', () => {
  afterEach(() => {
    __testOnly_resetToolOpsMetrics();
    vi.unstubAllEnvs();
  });

  it('emits Prometheus lines with required metric names', () => {
    recordSecuredToolOutcome(10, false);
    recordSecuredToolOutcome(20, false);
    recordSecuredToolOutcome(30, true);
    const text = buildOpsMetricsPrometheusText();
    expect(text).toContain('request_total 3');
    expect(text).toContain('error_total 1');
    expect(text).toMatch(/p50_latency_ms \d/);
    expect(text).toMatch(/p95_latency_ms \d/);
    expect(text).toMatch(/replica_count \d/);
    expect(text).toContain('active_anomalies 0');
  });

  it('active_anomalies is 1 shortly after notifyOpsAnomalyFired', () => {
    notifyOpsAnomalyFired();
    expect(buildOpsMetricsPrometheusText()).toContain('active_anomalies 1');
  });
});
