/**
 * Test fixture worker — simulates a parse-like job for WorkerPool telemetry tests.
 *
 * Protocol matches parse-worker.ts:
 *   IN:  { jobId, filePath, content, language, sizeBytes }
 *   OUT: { jobId, file?: { ... }, error?: string }
 *
 * Used only by test-telemetry-internal.test.ts to verify WorkerPool
 * telemetry counters (totalJobs, completedJobs, queue depth, dispatch
 * + complete log lines) without depending on real tree-sitter parsing.
 */

import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('telemetry-worker.js must be run as a worker_thread');
}

parentPort.postMessage({ type: 'ready' });

parentPort.on('message', async (job) => {
  const { jobId, filePath, content, language, sizeBytes } = job ?? {};
  if (typeof jobId !== 'string') return;

  // Simulate a tiny amount of async work so timing telemetry is non-zero
  // and the queue can briefly back up under N=6 jobs / 2 workers.
  await new Promise((resolve) => setTimeout(resolve, 5));

  parentPort.postMessage({
    jobId,
    file: {
      filePath: filePath ?? '',
      language: language ?? 'unknown',
      sizeBytes: sizeBytes ?? (typeof content === 'string' ? content.length : 0),
      symbols: [],
    },
  });
});
