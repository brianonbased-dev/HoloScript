/**
 * Browser entry for the Paper-3 WebGPU determinism harness.
 *
 * Bundled by `pnpm --filter @holoscript/engine run build:webgpu-determinism-harness`
 * and loaded by `scripts/webgpu-determinism-harness.html`.
 */

import { runDeterminismHarness, type AdapterTag } from './WebGPUDeterminismHarness';
import type { CAELTrace } from '../simulation/CAELTrace';

declare global {
  interface Window {
    __WEBGPU_HARNESS_MOCK__?: boolean;
    __WEBGPU_DETERMINISM_ARTIFACT__?: Awaited<ReturnType<typeof runDeterminismHarness>>;
    __WEBGPU_DETERMINISM_ERROR__?: {
      name: string;
      message: string;
      stack?: string;
    };
  }
}

const ADAPTER_TAGS = new Set<AdapterTag>([
  'intel-uhd',
  'nvidia-rtx3060',
  'apple-m',
  'amd-rdna',
  'qualcomm-adreno',
  'swiftshader',
]);

const smokeTrace: CAELTrace = [
  {
    version: 'cael.v1',
    runId: 'webgpu-determinism-smoke',
    index: 0,
    event: 'init',
    timestamp: 0,
    simTime: 0,
    prevHash: 'cael.genesis',
    hash: 'init-smoke-hash',
    payload: {
      scenario: 'crdt-spatial-dispute',
      seed: 1337,
      bodies: 3,
    },
  },
  {
    version: 'cael.v1',
    runId: 'webgpu-determinism-smoke',
    index: 1,
    event: 'interaction',
    timestamp: 16,
    simTime: 0.016,
    prevHash: 'init-smoke-hash',
    hash: 'agent-a-edit-hash',
    payload: {
      agent: 'agent-a',
      op: 'set-position',
      objectId: 'shared-anchor',
      position: [1.25, 0.5, -0.75],
    },
  },
  {
    version: 'cael.v1',
    runId: 'webgpu-determinism-smoke',
    index: 2,
    event: 'interaction',
    timestamp: 17,
    simTime: 0.017,
    prevHash: 'agent-a-edit-hash',
    hash: 'agent-b-edit-hash',
    payload: {
      agent: 'agent-b',
      op: 'set-position',
      objectId: 'shared-anchor',
      position: [1.25, 0.5, -0.75],
    },
  },
  {
    version: 'cael.v1',
    runId: 'webgpu-determinism-smoke',
    index: 3,
    event: 'solve',
    timestamp: 32,
    simTime: 0.032,
    prevHash: 'agent-b-edit-hash',
    hash: 'resolve-dispute-hash',
    payload: {
      resolver: 'lww-register',
      winner: 'agent-b',
      vectorClock: { 'agent-a': 1, 'agent-b': 2 },
    },
  },
  {
    version: 'cael.v1',
    runId: 'webgpu-determinism-smoke',
    index: 4,
    event: 'final',
    timestamp: 48,
    simTime: 0.048,
    prevHash: 'resolve-dispute-hash',
    hash: 'final-state-hash',
    payload: {
      sharedAnchor: [1.25, 0.5, -0.75],
      converged: true,
    },
  },
];

function boolParam(query: URLSearchParams, name: string, defaultValue = false): boolean {
  const raw = query.get(name);
  if (raw == null) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function intParam(query: URLSearchParams, name: string, defaultValue: number): number {
  const raw = query.get(name);
  if (raw == null) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function adapterTagParam(query: URLSearchParams): AdapterTag {
  const raw = query.get('adapterTag') ?? 'swiftshader';
  return ADAPTER_TAGS.has(raw as AdapterTag) ? (raw as AdapterTag) : 'swiftshader';
}

async function main(): Promise<void> {
  const query = new URLSearchParams(window.location.search);
  if (boolParam(query, 'mock')) {
    window.__WEBGPU_HARNESS_MOCK__ = true;
  }

  window.__WEBGPU_DETERMINISM_ARTIFACT__ = await runDeterminismHarness({
    traces: {
      'cael-crdt-smoke': smokeTrace,
    },
    replications: intParam(query, 'replications', 2),
    adapterTag: adapterTagParam(query),
    host: query.get('host') ?? window.location.hostname ?? 'browser-file',
    captureFields: boolParam(query, 'captureFields', true),
    protocolCommit: query.get('protocolCommit') ?? 'local',
    productionEvidence: boolParam(query, 'productionEvidence'),
  });
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  window.__WEBGPU_DETERMINISM_ERROR__ = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
  console.error('[webgpu-determinism] failed', err);
});
