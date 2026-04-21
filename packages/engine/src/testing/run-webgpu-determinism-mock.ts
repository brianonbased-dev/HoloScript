/**
 * Smoke runner: MOCK WebGPU determinism artifact (no GPU).
 *   pnpm exec tsx packages/engine/src/testing/run-webgpu-determinism-mock.ts
 */
process.env.WEBGPU_HARNESS_MOCK = '1';

import { runDeterminismHarness } from './WebGPUDeterminismHarness';
import type { CAELTrace } from '../simulation/CAELTrace';

const trace: CAELTrace = [
  {
    version: 'cael.v1',
    runId: 'cli-mock',
    index: 0,
    event: 'init',
    timestamp: 0,
    simTime: 0,
    prevHash: '0',
    hash: 'aa',
    payload: {},
  },
  {
    version: 'cael.v1',
    runId: 'cli-mock',
    index: 1,
    event: 'final',
    timestamp: 1,
    simTime: 1,
    prevHash: 'aa',
    hash: 'bb',
    payload: { done: true },
  },
];

const art = await runDeterminismHarness({
  traces: { cli: trace },
  replications: 2,
  adapterTag: 'swiftshader',
  host: 'node-cli',
  captureFields: false,
  protocolCommit: 'mock',
});

console.log(JSON.stringify(art, null, 2));
