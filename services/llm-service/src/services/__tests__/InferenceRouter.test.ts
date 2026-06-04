import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FleetProvider, InferenceRouter } from '../InferenceRouter';

const FLEET_ENV_KEYS = [
  'FLEET_PROVIDER_URL',
  'FLEET_MODEL',
  'FLEET_REGISTRY_URL',
  'FLEET_REGISTRY_KEY',
  'FLEET_INFERENCE_KEY',
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of FLEET_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of FLEET_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FleetProvider', () => {
  it('is dormant by default: isAvailable() is false when FLEET_PROVIDER_URL is unset', async () => {
    // Critical safety invariant — the kill-switch. No env var => no fleet traffic,
    // and crucially NO network call is made at all.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new FleetProvider();
    expect(provider.name).toBe('fleet');
    await expect(provider.isAvailable()).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed: isAvailable() is false when the fleet health check rejects (preemption)', async () => {
    process.env.FLEET_PROVIDER_URL = 'http://fleet.invalid:9000';
    // Simulate a dead/preempted endpoint — fetch rejects.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    const provider = new FleetProvider();
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it('fails closed: isAvailable() is false when health and /v1/models both return non-200', async () => {
    process.env.FLEET_PROVIDER_URL = 'http://fleet.invalid:9000';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response)),
    );

    const provider = new FleetProvider();
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it('is available when FLEET_PROVIDER_URL is set and /health returns 200', async () => {
    process.env.FLEET_PROVIDER_URL = 'http://fleet.local:9000';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)),
    );

    const provider = new FleetProvider();
    await expect(provider.isAvailable()).resolves.toBe(true);
  });
});

describe('FleetProvider — dynamic registry (scale-to-zero serving)', () => {
  it('resolves a WARM endpoint from the registry, then health-checks it', async () => {
    process.env.FLEET_REGISTRY_URL = 'http://orchestrator.local';
    process.env.FLEET_REGISTRY_KEY = 'test-key';
    process.env.FLEET_MODEL = 'Qwen/Qwen2.5-Coder-7B-Instruct';
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(url);
        if (url.includes('/serve/resolve')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'warm', url: 'http://1.2.3.4:41234' }),
          } as Response);
        }
        // data-plane health check on the resolved box
        return Promise.resolve({ ok: true, status: 200 } as Response);
      }),
    );

    const provider = new FleetProvider();
    await expect(provider.isAvailable()).resolves.toBe(true);
    // resolve was called (which bumps demand) AND the data-plane URL was health-checked.
    expect(calls.some((c) => c.includes('/serve/resolve?model=Qwen'))).toBe(true);
    expect(calls.some((c) => c.startsWith('http://1.2.3.4:41234'))).toBe(true);
  });

  it('fails closed when the model is COLD — but still records demand (the wake signal)', async () => {
    process.env.FLEET_REGISTRY_URL = 'http://orchestrator.local';
    process.env.FLEET_REGISTRY_KEY = 'test-key';
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(url);
        // registry reports cold; no warm box yet
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'cold' }),
        } as Response);
      }),
    );

    const provider = new FleetProvider();
    await expect(provider.isAvailable()).resolves.toBe(false);
    // The resolve (demand bump) still fired — that's what wakes the autoscaler —
    // and NO data-plane health check was attempted (there's no box to check).
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/serve/resolve');
  });

  it('sends the shared serving key as a Bearer token on inference (closes the open-endpoint hole)', async () => {
    process.env.FLEET_PROVIDER_URL = 'http://box:8000';
    process.env.FLEET_INFERENCE_KEY = 'shared-serving-key';
    let authHeader: string | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/v1/chat/completions')) {
          authHeader = (init?.headers as Record<string, string>)?.Authorization;
          // minimal valid SSE body so parseOpenAIStream completes
          return Promise.resolve({
            ok: true,
            body: new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                c.close();
              },
            }),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200 } as Response);
      }),
    );

    const provider = new FleetProvider();
    // drain the stream
    for await (const _ of provider.stream({ messages: [{ role: 'user', content: 'hi' }] })) {
      /* consume */
    }
    expect(authHeader).toBe('Bearer shared-serving-key');
  });

  it('omits Authorization when no serving key is set (dev / unauthenticated box)', async () => {
    process.env.FLEET_PROVIDER_URL = 'http://box:8000';
    let sawAuth = true;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/v1/chat/completions')) {
          sawAuth = 'Authorization' in ((init?.headers as Record<string, string>) ?? {});
          return Promise.resolve({
            ok: true,
            body: new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                c.close();
              },
            }),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200 } as Response);
      }),
    );

    const provider = new FleetProvider();
    for await (const _ of provider.stream({ messages: [{ role: 'user', content: 'hi' }] })) {
      /* consume */
    }
    expect(sawAuth).toBe(false);
  });

  it('static FLEET_PROVIDER_URL wins over the registry (manual pin, no resolve call)', async () => {
    process.env.FLEET_PROVIDER_URL = 'http://pinned.box:8000';
    process.env.FLEET_REGISTRY_URL = 'http://orchestrator.local';
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(url);
        return Promise.resolve({ ok: true, status: 200 } as Response);
      }),
    );

    const provider = new FleetProvider();
    await expect(provider.isAvailable()).resolves.toBe(true);
    // No registry round-trip — the pin short-circuits resolveUrl().
    expect(calls.every((c) => !c.includes('/serve/resolve'))).toBe(true);
    expect(calls.some((c) => c.startsWith('http://pinned.box:8000'))).toBe(true);
  });
});

describe('InferenceRouter provider chain', () => {
  it('registers fleet in the overflow position: Fireworks -> Fleet -> Together -> Ollama', async () => {
    // Force every provider unavailable so getStatus() reports the static chain
    // without making real network calls.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    const router = new InferenceRouter();
    const status = await router.getStatus();
    const standardOrder = status.filter((s) => s.tier === 'standard').map((s) => s.provider);

    expect(standardOrder).toEqual(['fireworks', 'fleet', 'together', 'ollama']);
    // Fleet sits AFTER the default (fireworks), BEFORE the serverless fallback (together).
    expect(standardOrder.indexOf('fleet')).toBe(standardOrder.indexOf('fireworks') + 1);
    expect(standardOrder.indexOf('fleet')).toBeLessThan(standardOrder.indexOf('together'));
  });

  it('keeps fireworks as the default standard-tier provider', () => {
    const router = new InferenceRouter();
    expect(router.getPreferredProvider()).toBe('fireworks');
  });
});
