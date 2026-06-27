import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FleetProvider,
  InferenceRouter,
  applyLaneRouting,
  detectLane,
  type ChatRequest,
  type InferenceProvider,
  type StreamEvent,
} from '../InferenceRouter';

const ROUTE_URL = 'https://run.vast.ai/route/';

const ENV_KEYS = [
  'VAST_API_KEY',
  'FLEET_PROVIDER_ENDPOINT',
  'FLEET_MODEL',
  'VAST_QWEN_ENDPOINT_NAME',
  'VAST_QWEN_MODEL',
  'VAST_SERVERLESS_COST',
  'VAST_SERVERLESS_MAX_WAIT_S',
  'VAST_SERVERLESS_POLL_INTERVAL_MS',
  'VAST_SERVERLESS_WAIT_FOR_COLD_START',
  'FLEET_WAIT_FOR_COLD_START',
  'BRITTNEY_PROVIDER',
  'FIREWORKS_API_KEY',
  'FIREWORKS_MODEL',
  'TOGETHER_API_KEY',
  'TOGETHER_MODEL',
  'OLLAMA_URL',
  'OLLAMA_MODEL',
  'BRITTNEY_LANE_OPERATOR_MODEL',
  'BRITTNEY_LANE_CODE_MODEL',
  'BRITTNEY_LANE_VISION_MODEL',
  'BRITTNEY_LANE_REASONING_MODEL',
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

describe('FleetProvider', () => {
  it('is dormant by default: isAvailable() is false when VAST_API_KEY is unset', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new FleetProvider();
    expect(provider.name).toBe('fleet');
    await expect(provider.isAvailable()).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('route-probes once with cost 100 and returns false while the serverless pool wakes', async () => {
    process.env.VAST_API_KEY = 'vast-key';
    process.env.FLEET_PROVIDER_ENDPOINT = 'holoscript-qwen-coder';
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
        });
        return jsonResponse({ status: { ready: 0, total: 1 }, request_idx: 0 });
      }),
    );

    const provider = new FleetProvider();
    await expect(provider.isAvailable()).resolves.toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ROUTE_URL);
    expect(calls[0].body).toMatchObject({
      endpoint: 'holoscript-qwen-coder',
      api_key: 'vast-key',
      cost: 100,
      request_idx: 0,
      replay_timeout: 60,
    });
  });

  it('treats a cold Vast pool as available when fleet is explicitly preferred', async () => {
    process.env.VAST_API_KEY = 'vast-key';
    process.env.BRITTNEY_PROVIDER = 'fleet';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: { ready: 0, total: 1 }, request_idx: 0 })),
    );

    const provider = new FleetProvider();
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it('does not mask deleted or unauthorized Vast endpoints as cold-startable', async () => {
    process.env.VAST_API_KEY = 'vast-key';
    process.env.BRITTNEY_PROVIDER = 'fleet';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error_msg: 'endpoint 0 not found or unauthorized' })),
    );

    const provider = new FleetProvider();
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it('is available when the Vast route returns a ready worker URL', async () => {
    process.env.VAST_API_KEY = 'vast-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ url: 'http://worker.test:8000', signature: 'sig123' })),
    );

    const provider = new FleetProvider();
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it('streams through the Vast worker envelope when a worker is ready', async () => {
    process.env.VAST_API_KEY = 'vast-key';
    process.env.FLEET_MODEL = 'qwen3-coder:30b';
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const telemetry: Array<{
      provider: string;
      endpoint?: string;
      model?: string;
      requestId?: string;
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
        });
        if (url === ROUTE_URL) {
          return jsonResponse({ url: 'http://worker.test:8000', signature: 'sig123', request_idx: 0 });
        }
        return sseResponse([
          'data: {"choices":[{"delta":{"content":"fleet ok"}}],"model":"qwen3-coder:30b"}\n',
          'data: {"choices":[{"delta":{}}],"model":"qwen3-coder:30b","usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n',
          'data: [DONE]\n',
        ]);
      }),
    );

    const provider = new FleetProvider();
    const events: StreamEvent[] = [];
    for await (const event of provider.stream({
      messages: [{ role: 'user', content: 'hi' }],
      onTelemetry: (next) => telemetry.push(next),
    })) {
      events.push(event);
    }

    expect(calls[0].url).toBe(ROUTE_URL);
    expect(calls[1].url).toBe('http://worker.test:8000/v1/chat/completions');
    expect(calls[1].body.auth_data).toMatchObject({ signature: 'sig123' });
    expect(calls[1].body.session_id).toBeNull();
    expect(calls[1].body.payload).toMatchObject({ model: 'qwen3-coder:30b', stream: true });
    expect(events).toContainEqual({ type: 'text', payload: 'fleet ok' });
    expect(events[events.length - 1]).toEqual({ type: 'done', payload: null });
    expect(telemetry[0]).toMatchObject({
      provider: 'fleet',
      endpoint: 'vast-serverless:holoscript-qwen-coder',
      model: 'qwen3-coder:30b',
    });
    expect(telemetry[telemetry.length - 1]).toMatchObject({
      provider: 'fleet',
      endpoint: 'vast-serverless:holoscript-qwen-coder',
      model: 'qwen3-coder:30b',
      requestId: 'vast:holoscript-qwen-coder:0',
      usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
    });
  });
});

describe('InferenceRouter provider chain', () => {
  it('registers fleet in the overflow position: Fireworks -> Fleet -> Together -> Ollama', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    const router = new InferenceRouter();
    const status = await router.getStatus();
    const standardOrder = status.filter((s) => s.tier === 'standard').map((s) => s.provider);

    expect(standardOrder).toEqual(['fireworks', 'fleet', 'together', 'ollama']);
    expect(standardOrder.indexOf('fleet')).toBe(standardOrder.indexOf('fireworks') + 1);
    expect(standardOrder.indexOf('fleet')).toBeLessThan(standardOrder.indexOf('together'));
  });

  it('keeps fireworks as the default standard-tier provider', () => {
    const router = new InferenceRouter();
    expect(router.getPreferredProvider()).toBe('fireworks');
  });

  it('falls through to Together after a cold Vast probe wakes the fleet pool', async () => {
    process.env.BRITTNEY_PROVIDER = 'fleet';
    const router = new InferenceRouter();
    const attempts: string[] = [];
    const coldFleet: InferenceProvider = {
      name: 'fleet',
      async isAvailable() {
        attempts.push('fleet');
        return false;
      },
      async *stream() {
        throw new Error('cold fleet should not stream');
      },
    };
    const together: InferenceProvider = {
      name: 'together',
      async isAvailable() {
        attempts.push('together');
        return true;
      },
      async *stream() {
        yield { type: 'text', payload: 'together fallback' };
        yield { type: 'done', payload: null };
      },
    };
    (router as unknown as { providers: InferenceProvider[] }).providers = [coldFleet, together];

    const events: StreamEvent[] = [];
    for await (const event of router.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
      events.push(event);
    }

    expect(attempts).toEqual(['fleet', 'fleet', 'together']);
    expect(events).toContainEqual({ type: 'text', payload: 'together fallback' });
    expect(events[events.length - 1]).toEqual({ type: 'done', payload: null });
  });
});

describe('Lane routing - task-type modulation', () => {
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
      const { request, lane } = applyLaneRouting({
        messages: user('here is a screenshot of my scene'),
      });
      expect(lane).toBe('vision');
      expect(request.tier).toBeUndefined();
    });
  });
});
