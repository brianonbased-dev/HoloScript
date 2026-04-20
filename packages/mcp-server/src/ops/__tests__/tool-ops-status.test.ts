import { describe, it, expect, afterEach } from 'vitest';
import '../../compiler-tools.js';
import { buildOpsStatusPayload } from '../tool-ops-status.js';
import { recordSecuredToolOutcome, __testOnly_resetToolOpsMetrics } from '../tool-ops-metrics.js';

describe('tool-ops-status', () => {
  afterEach(() => {
    __testOnly_resetToolOpsMetrics();
  });

  it('buildOpsStatusPayload returns structured JSON with regions and circuit breakers', async () => {
    recordSecuredToolOutcome(5, false);
    const p = await buildOpsStatusPayload();
    expect(p).toHaveProperty('status');
    expect(['healthy', 'degraded', 'critical']).toContain(p.status);
    expect(p.regions).toHaveLength(3);
    expect(p.regions.map((r) => r.id).sort()).toEqual(['ap-east', 'eu-west', 'us-west']);
    expect(p.circuitBreakers.length).toBeGreaterThan(0);
    expect(p.securedTools.requests).toBe(1);
    expect(p).toHaveProperty('replicaCount');
    expect(p.anomaly).toHaveProperty('activeAnomalies');
  });
});
