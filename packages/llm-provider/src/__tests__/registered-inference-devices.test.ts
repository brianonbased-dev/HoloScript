import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listRegisteredInferenceCapabilities,
  probeRegisteredInferenceDevices,
} from '../registered-inference-devices';
import type { FetchLike } from '../fleet-router';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function registry(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'registered-inference-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(body), 'utf8');
  }
  return dir;
}

/** A llama-server that is up, serving `model`, with `busy` busy slots of 1. */
function llamaServer(model: string, busy = false): Record<string, unknown> {
  return {
    '/health': { status: 'ok' },
    '/props': { default_generation_settings: { model, n_ctx: 4096 }, total_slots: 1 },
    '/slots': [{ id: 0, is_processing: busy }],
  };
}

function fakeFetch(
  servers: Record<string, Record<string, unknown>>,
  calls: string[] = []
): FetchLike {
  return async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const server = servers[u.origin];
    const body = server?.[u.pathname];
    if (body === undefined) throw new Error('fetch failed');
    return { ok: true, json: async () => body };
  };
}

describe('registered inference devices', () => {
  it('keeps only text-model capabilities that are live, owned, and OpenAI-compatible', async () => {
    const dir = registry({
      laptop: {
        capabilities: [
          {
            id: 'local-llm',
            status: 'retired',
            backend: 'llama.cpp',
            endpoint: 'http://192.168.0.23:11434',
          },
          {
            id: 'holollama-fara',
            status: 'available',
            backend: 'llama.cpp',
            model: 'fara-7b',
            endpoint: 'http://127.0.0.1:18080',
          },
          {
            id: 'holorunner-s0-holollama',
            status: 'proven',
            backend: 'llama.cpp',
            endpoint: 'http://127.0.0.1:18081',
          },
          {
            id: 'desktop-automation',
            status: 'available',
            model: 'fara:7b',
            endpoint: 'http://127.0.0.1:18080',
          },
          { id: 'quantum-sim', status: 'proven' },
        ],
      },
      jetson: {
        capabilities: [
          {
            id: 'local-llm',
            status: 'available',
            backend: 'llama.cpp',
            endpoint: 'http://holojetson.local:18080',
            endpoint_ip: 'http://192.168.0.119:18080',
          },
          {
            id: 'local-holoserve',
            status: 'planned',
            backend: 'pytorch-holo',
            endpoint: 'http://holojetson.local:8099',
          },
        ],
      },
      'not-json': 'garbage',
    });
    writeFileSync(join(dir, 'broken.json'), '{ not json', 'utf8');

    const { capabilities } = await listRegisteredInferenceCapabilities(dir);
    expect(capabilities.map((c) => `${c.handle}/${c.capabilityId}`)).toEqual([
      'jetson/local-llm',
      'laptop/holollama-fara',
    ]);
    // The numeric address is tried before the mDNS name (mDNS does not resolve on Windows).
    expect(capabilities[0].endpoints).toEqual([
      'http://192.168.0.119:18080',
      'http://holojetson.local:18080',
    ]);
  });

  it('orders local before fleet, idle before busy, and says why a device was skipped', async () => {
    const dir = registry({
      // Registry order puts the fleet devices first; routing must still try local first.
      'a-jetson': {
        capabilities: [
          {
            id: 'local-llm',
            status: 'available',
            backend: 'llama.cpp',
            endpoint: 'http://192.168.0.119:18080',
          },
        ],
      },
      'b-desk': {
        capabilities: [
          {
            id: 'local-llm',
            status: 'available',
            backend: 'llama.cpp',
            endpoint: 'http://192.168.0.50:18080',
          },
        ],
      },
      'c-laptop': {
        capabilities: [
          {
            id: 'holollama-fara',
            status: 'available',
            backend: 'llama.cpp',
            endpoint: 'http://127.0.0.1:18080',
          },
          {
            id: 'holollama-big',
            status: 'available',
            backend: 'llama.cpp',
            endpoint: 'http://127.0.0.1:18090',
          },
        ],
      },
      'd-jetson-dup': {
        capabilities: [
          {
            id: 'local-llm',
            status: 'proven',
            backend: 'llama.cpp',
            endpoint: 'http://192.168.0.119:18080',
          },
        ],
      },
      'e-remote': {
        capabilities: [
          {
            id: 'local-llm',
            status: 'available',
            backend: 'llama.cpp',
            endpoint: 'https://gpu.example.com',
          },
        ],
      },
    });
    const calls: string[] = [];
    const fetchImpl = fakeFetch(
      {
        'http://192.168.0.119:18080': llamaServer('brittney-edge', true), // single slot, busy
        'http://192.168.0.50:18080': llamaServer('qwen3-8b'),
        'http://127.0.0.1:18090': llamaServer('qwen3-14b'),
        // 127.0.0.1:18080 is down.
      },
      calls
    );

    const probe = await probeRegisteredInferenceDevices({ registryDir: dir, fetchImpl });

    expect(probe.routes.map((r) => `${r.tier}:${r.handle}/${r.capabilityId}:${r.model}`)).toEqual([
      'local:c-laptop/holollama-big:qwen3-14b',
      'fleet:b-desk/local-llm:qwen3-8b',
      'fleet:a-jetson/local-llm:brittney-edge',
    ]);
    const skipped = Object.fromEntries(
      probe.skipped.map((s) => [`${s.handle}/${s.capabilityId}`, s.reason])
    );
    expect(skipped['c-laptop/holollama-fara']).toContain('not serving');
    expect(skipped['e-remote/local-llm']).toContain('not on this machine or its local network');
    // The public endpoint is never contacted; the Jetson server is probed once.
    expect(calls.some((u) => u.includes('example.com'))).toBe(false);
    expect(calls.filter((u) => u === 'http://192.168.0.119:18080/health')).toHaveLength(1);
  });

  it('skips a HoloServe that serves a typed-decision model instead of prose', async () => {
    const dir = registry({
      'laptop-holoserve': {
        capabilities: [
          {
            id: 'local-llm',
            status: 'available',
            backend: 'pytorch-holo',
            endpoint: 'http://127.0.0.1:8099',
          },
        ],
      },
    });
    const fetchImpl = fakeFetch({
      'http://127.0.0.1:8099': {
        '/health': { status: 'ok', typed_decision_protocol: { enabled: true } },
      },
    });

    const probe = await probeRegisteredInferenceDevices({ registryDir: dir, fetchImpl });
    expect(probe.routes).toEqual([]);
    expect(probe.skipped[0].reason).toContain('typed-decision model');
  });

  it('returns nothing (and does not throw) when the registry folder is missing', async () => {
    const probe = await probeRegisteredInferenceDevices({
      registryDir: join(tmpdir(), 'no-such-registry-dir-xyz'),
      fetchImpl: fakeFetch({}),
    });
    expect(probe.routes).toEqual([]);
    expect(probe.skipped).toEqual([]);
  });
});
