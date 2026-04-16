import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkerPool } from './WorkerPool';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('WorkerPool telemetry (internal)', () => {
  it('tracks job throughput and emits telemetry logs for concurrent jobs', async () => {
    const workerPath = resolve(__dirname, '__fixtures__/telemetry-worker.js');
    const pool = new WorkerPool(workerPath, 2);

    try {
      const initial = pool.getTelemetry();
      expect(initial.stats.totalJobs).toBe(0);
      expect(initial.stats.completedJobs).toBe(0);
      expect(initial.stats.failedJobs).toBe(0);

      const jobs = Array.from({ length: 6 }, (_, i) =>
        pool.execute({
          filePath: `telemetry-${i}.ts`,
          content: `export const value${i} = ${i};`,
          language: 'typescript',
          sizeBytes: 24,
        })
      );

      await Promise.all(jobs);

      const telemetry = pool.getTelemetry();
      expect(telemetry.stats.totalJobs).toBe(6);
      expect(telemetry.stats.completedJobs).toBe(6);
      expect(telemetry.stats.failedJobs).toBe(0);
      expect(telemetry.stats.maxQueueDepth).toBeGreaterThanOrEqual(1);
      expect(telemetry.stats.avgJobDurationMs).toBeGreaterThanOrEqual(0);
      expect(
        telemetry.recentLogs.some((line) => line.includes('job-dispatched'))
      ).toBe(true);
      expect(
        telemetry.recentLogs.some((line) => line.includes('job-complete'))
      ).toBe(true);
    } finally {
      await pool.terminate();
    }
  }, 15000);
});