import { afterEach, describe, expect, it, vi } from 'vitest';
import { FleetMetrics } from '../FleetMetrics';

function headerJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

describe('FleetMetrics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes provider GPU telemetry from response headers into the durable metric row', () => {
    const logs: unknown[][] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });

    const metrics = new FleetMetrics();
    const handle = metrics.begin();
    metrics.end(handle, {
      provider: 'fleet',
      endpoint: 'vast-serverless:holoscript-qwen-coder',
      model: 'qwen2.5-coder:1.5b',
      requestId: 'vast:holoscript-qwen-coder:4',
      promptTokens: 8,
      completionTokens: 3,
      responseHeaders: {
        'x-holoscript-gpu-start': headerJson({
          name: 'NVIDIA RTX 4000 Ada',
          utilizationGpuPct: 17,
          memoryUsedMiB: 4096,
          memoryTotalMiB: 20480,
        }),
        'x-holoscript-gpu-source': 'worker:nvidia-smi',
      },
    });

    const metricLine = logs.flat().find((line): line is string => (
      typeof line === 'string' && line.includes('[fleet-metric]')
    ));
    expect(metricLine).toBeTruthy();
    const metric = JSON.parse(metricLine!.slice(metricLine!.indexOf('{')));
    expect(metric.gpuUtilization).toMatchObject({
      observed: true,
      utilizationGpuPct: 17,
      source: 'worker:nvidia-smi',
    });
  });
});
