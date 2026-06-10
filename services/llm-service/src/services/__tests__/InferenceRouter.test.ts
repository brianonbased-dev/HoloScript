import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FleetProvider,
  InferenceRouter,
  applyLaneRouting,
  detectLane,
  type ChatRequest,
} from '../InferenceRouter';

const FLEET_ENV_KEYS = [
  'FLEET_PROVIDER_URL',
  'FLEET_MODEL',
  'FLEET_REGISTRY_URL',
  'FLEET_REGISTRY_KEY',
  'FLEET_INFERENCE_KEY',
  'BRITTNEY_LANE_OPERATOR_MODEL',
  'BRITTNEY_LANE_CODE_MODEL',
  'BRITTNEY_LANE_VISION_MODEL',
  'BRITTNEY_LANE_REASONING_MODEL',
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

describe('Lane routing — task-type modulation', () => {
  const user = (content: string): ChatRequest['messages'] => [{ role: 'user', content }];
  const aTool = {
    type: 'function' as const,
    function: { name: 'apply_trait', description: 'apply a trait', parameters: {} },
  };

  describe('detectLane', () => {
    it('honors an explicit request.lane over every heuristic', () => {
      expect(
        detectLane({ messages: user('add @physics to the cube'), tools: [aTool], lane: 'operator' }),
      ).toBe('operator');
    });

    it('classifies tool-bearing requests as the code lane', () => {
      expect(detectLane({ messages: user('make it glow'), tools: [aTool] })).toBe('code');
    });

    it('classifies short tool-less turns as operator traffic', () => {
      expect(detectLane({ messages: user('what is the scene status?') })).toBe('operator');
    });

    it('classifies long tool-less prompts as code (the pre-lane default)', () => {
      expect(detectLane({ messages: user('x'.repeat(500)) })).toBe('code');
    });

    it('classifies screenshot mentions as the vision lane', () => {
      expect(detectLane({ messages: user('here is a screenshot of my scene, why is it dark?') })).toBe(
        'vision',
      );
    });
  });

  describe('applyLaneRouting', () => {
    it('is byte-identical to pre-lane routing when no lane env and no explicit lane are set', () => {
      const raw: ChatRequest = { messages: user('make it glow'), tools: [aTool] };
      const { request, lane } = applyLaneRouting(raw);
      expect(lane).toBe('code');
      expect(request.model).toBeUndefined();
      expect(request.tier).toBeUndefined();
    });

    it('applies the env-configured per-lane model override', () => {
      process.env.BRITTNEY_LANE_OPERATOR_MODEL = 'qwen3.5:4b';
      const { request, lane } = applyLaneRouting({ messages: user('status?') });
      expect(lane).toBe('operator');
      expect(request.model).toBe('qwen3.5:4b');
    });

    it('never overrides an explicit request.model with the lane env model', () => {
      process.env.BRITTNEY_LANE_OPERATOR_MODEL = 'qwen3.5:4b';
      const { request } = applyLaneRouting({ messages: user('status?'), model: 'pinned-model' });
      expect(request.model).toBe('pinned-model');
    });

    it('promotes an EXPLICIT reasoning lane to the pro tier when no tier is pinned', () => {
      const { request } = applyLaneRouting({ messages: user('why?'), lane: 'reasoning' });
      expect(request.tier).toBe('pro');
    });

    it('respects a pinned tier even for an explicit vision lane', () => {
      const { request } = applyLaneRouting({
        messages: user('look at this'),
        lane: 'vision',
        tier: 'standard',
      });
      expect(request.tier).toBe('standard');
    });

    it('does NOT promote tier from heuristic detection (cost safety)', () => {
      // Detected (not explicit) vision lane must not silently move the request
      // onto the more expensive pro tier.
      const { request, lane } = applyLaneRouting({
        messages: user('here is a screenshot of my scene'),
      });
      expect(lane).toBe('vision');
      expect(request.tier).toBeUndefined();
    });
  });
});
