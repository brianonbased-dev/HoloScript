import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FleetProvider, InferenceRouter } from '../InferenceRouter';

const FLEET_ENV_KEYS = ['FLEET_PROVIDER_URL', 'FLEET_MODEL'] as const;
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
