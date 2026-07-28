/**
 * Universal sovereign-first resolution tests (founder directive 2026-06-10):
 * sovereign serving (fleet → cloud → ollama) before any BYOK frontier key,
 * one policy for HoloClaw, the fleet supervisor, and Brittney.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSovereignProvider, resolveSovereignProviderAsync } from '../sovereign-resolver';
import { __clearLocalModelPickerCache } from '../local-model-picker';
import { BrittneyCloudAdapter } from '../adapters/brittney-cloud';
import { LocalLLMAdapter } from '../adapters/local-llm';
import { AnthropicAdapter } from '../adapters/anthropic';
import { VastServerlessAdapter } from '../adapters/vast-serverless';
import { admitHoloServeHealth } from '../fleet-router';

const resolveLocalFleetMock = vi.hoisted(() => vi.fn());

vi.mock('../fleet-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../fleet-router')>();
  return { ...actual, resolveLocalFleet: resolveLocalFleetMock };
});

const HOLOSERVE_REGISTRY_SCHEMA = 'holoscript.holoserve-model-artifact-registry.v0.1.0';
const HOLOSERVE_BINDING_SCHEMA = 'holoscript.holoserve-model-artifact-binding.v0.1.0';
const HOLOSERVE_BINS_SCHEMA = 'holoscript.holoserve-bins-binding.v0.1.0';
const TOKENIZER_SHA256 = `sha256:${'2'.repeat(64)}`;
const META_SHA256 = `sha256:${'3'.repeat(64)}`;

function testHoloServeHealth(model: string, checkpointDigit = '1'): Record<string, unknown> {
  const files = { 'meta.json': META_SHA256, 'tokenizer.json': TOKENIZER_SHA256 };
  const binsPayload = { files, schema: HOLOSERVE_BINS_SCHEMA };
  const binsBindingSha256 = `sha256:${createHash('sha256').update(JSON.stringify(binsPayload), 'utf8').digest('hex')}`;
  const binding = {
    schema: HOLOSERVE_BINDING_SCHEMA,
    available: true,
    checkpointSha256: `sha256:${checkpointDigit.repeat(64)}`,
    tokenizerSha256: TOKENIZER_SHA256,
    bins: { schema: HOLOSERVE_BINS_SCHEMA, files, bindingSha256: binsBindingSha256 },
  };
  return {
    status: 'ok',
    backend: 'pytorch-holo',
    sovereign: true,
    llama_cpp: false,
    gguf: false,
    model: { name: model, params_millions: 85 },
    models: [model],
    model_artifact_bindings: {
      schema: HOLOSERVE_REGISTRY_SCHEMA,
      defaultModel: model,
      models: { [model]: binding },
    },
  };
}

function bindingSha256For(health: Record<string, unknown>, model: string): string {
  const admission = admitHoloServeHealth(health, model);
  if (!admission) throw new Error('invalid HoloServe test fixture');
  return admission.bindingSha256;
}

const ENV_KEYS = [
  'HOLO_LLM_PROVIDER',
  'HOLO_LLM_SERVICE_URL',
  'HOLO_LLM_SERVICE_KEY',
  'HOLO_LLM_MODEL',
  'HOLO_LLM_MAX_TOKENS',
  'HOLO_LLM_TIER',
  'HOLO_LLM_LANE',
  'HOLO_LLM_FLEET_MODEL',
  'HOLO_LLM_FLEET_BRAIN',
  'FLEET_PROVIDER_ENDPOINT',
  'BRITTNEY_PROVIDER',
  'BRITTNEY_SERVICE_URL',
  'BRITTNEY_API_KEY',
  'BRITTNEY_MODEL',
  'BRITTNEY_MAX_TOKENS',
  'BRITTNEY_TIER',
  'BRITTNEY_LANE',
  'BRITTNEY_FLEET_MODEL',
  'FLEET_MODEL',
  'VAST_QWEN_ENDPOINT_NAME',
  'VAST_QWEN_MODEL',
  'VAST_SERVERLESS_COST',
  'VAST_SERVERLESS_MAX_WAIT_S',
  'VAST_SERVERLESS_POLL_INTERVAL_MS',
  'HOLOLLAMA_URL',
  'HOLOLLAMA_ENDPOINT',
  'HOLOSERVE_URL',
  'HOLOSERVE_ENDPOINT',
  'HOLOSERVE_MODEL',
  'HOLOSERVE_PARITY_PINS',
  'HOLOSERVE_PARITY_REGISTRY',
  'OLLAMA_HOST',
  'OLLAMA_BASE_URL',
  'OLLAMA_URL',
  'ANTHROPIC_API_KEY',
  'XAI_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'VAST_API_KEY',
];

beforeEach(() => {
  for (const k of ENV_KEYS) vi.stubEnv(k, '');
  resolveLocalFleetMock.mockReset().mockResolvedValue(null);
  __clearLocalModelPickerCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('resolveSovereignProvider (sync, sovereign-first auto-detect)', () => {
  it('prefers the sovereign cloud endpoint over everything sync', () => {
    vi.stubEnv('HOLO_LLM_SERVICE_URL', 'https://serve.example.com');
    vi.stubEnv('OLLAMA_HOST', 'http://box:11434');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const r = resolveSovereignProvider();
    expect(r.providerName).toBe('cloud');
    expect(r.provider).toBeInstanceOf(BrittneyCloudAdapter);
    expect(r.model).toBe('brittney-standard');
  });

  it('falls to local ollama when no cloud endpoint is set', () => {
    vi.stubEnv('OLLAMA_HOST', 'http://box:11434');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const r = resolveSovereignProvider();
    expect(r.providerName).toBe('ollama');
    expect(r.provider).toBeInstanceOf(LocalLLMAdapter);
  });

  it('prefers HoloLlama over legacy Ollama when HOLOLLAMA_URL is set (D.117)', () => {
    vi.stubEnv('HOLOLLAMA_URL', 'http://box:18080');
    vi.stubEnv('OLLAMA_HOST', 'http://box:11434');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const r = resolveSovereignProvider();
    expect(r.providerName).toBe('holollama');
    expect(r.provider).toBeInstanceOf(LocalLLMAdapter);
  });

  it("honors explicit provider 'holollama'", () => {
    const r = resolveSovereignProvider({ explicit: 'holollama' });
    expect(r.providerName).toBe('holollama');
    expect(r.provider).toBeInstanceOf(LocalLLMAdapter);
  });

  it('prefers HoloServe over HoloLlama when HOLOSERVE_URL is set (D.118: no llama.cpp for HOLO-arch)', () => {
    vi.stubEnv('HOLOSERVE_URL', 'http://box:8099');
    vi.stubEnv('HOLOLLAMA_URL', 'http://box:18080');
    vi.stubEnv('OLLAMA_HOST', 'http://box:11434');
    const r = resolveSovereignProvider();
    expect(r.providerName).toBe('holoserve');
    expect(r.provider).toBeInstanceOf(LocalLLMAdapter);
    expect(r.model).toBe('holorunner-s0');
  });

  it("honors explicit provider 'holoserve' with the registry-node default port", () => {
    const r = resolveSovereignProvider({ explicit: 'holoserve' });
    expect(r.providerName).toBe('holoserve');
    expect(r.provider).toBeInstanceOf(LocalLLMAdapter);
  });

  it('falls to BYOK anthropic LAST among sync providers', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const r = resolveSovereignProvider();
    expect(r.providerName).toBe('anthropic');
    expect(r.provider).toBeInstanceOf(AnthropicAdapter);
    expect(r.model).toBe('claude-sonnet-4-6');
  });

  it('falls through anthropic -> xai -> openai by key presence', () => {
    vi.stubEnv('XAI_API_KEY', 'xk-test');
    const xai = resolveSovereignProvider();
    expect(xai.providerName).toBe('xai');
    expect(xai.model).toBe('grok-4.3');
    vi.stubEnv('XAI_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'ok-test');
    expect(resolveSovereignProvider().providerName).toBe('openai');
  });

  it('honors explicit provider override over auto-detect', () => {
    vi.stubEnv('HOLO_LLM_SERVICE_URL', 'https://serve.example.com');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    vi.stubEnv('HOLO_LLM_PROVIDER', 'anthropic');
    expect(resolveSovereignProvider().providerName).toBe('anthropic');
    // opts.explicit beats env
    expect(resolveSovereignProvider({ explicit: 'cloud' }).providerName).toBe('cloud');
  });

  it("treats explicit 'sovereign'/'auto' as auto-detect", () => {
    vi.stubEnv('OLLAMA_HOST', 'http://box:11434');
    expect(resolveSovereignProvider({ explicit: 'sovereign' }).providerName).toBe('ollama');
    expect(resolveSovereignProvider({ explicit: 'auto' }).providerName).toBe('ollama');
  });

  it('supports BRITTNEY_* env names as compat aliases', () => {
    vi.stubEnv('BRITTNEY_SERVICE_URL', 'https://serve.example.com');
    const r = resolveSovereignProvider();
    expect(r.providerName).toBe('cloud');
  });

  it('applies model and maxTokens overrides', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    vi.stubEnv('HOLO_LLM_MODEL', 'claude-opus-4-8');
    vi.stubEnv('HOLO_LLM_MAX_TOKENS', '2048');
    const r = resolveSovereignProvider();
    expect(r.model).toBe('claude-opus-4-8');
    expect(r.maxTokens).toBe(2048);
    // opts beat env
    expect(resolveSovereignProvider({ model: 'claude-fable-5' }).model).toBe('claude-fable-5');
  });

  it('uses the BYOK anthropic key override when provided', () => {
    const r = resolveSovereignProvider({ anthropicKey: 'sk-byok' });
    expect(r.providerName).toBe('anthropic');
  });

  it('explicit fleet in sync mode throws with async guidance', () => {
    vi.stubEnv('HOLO_LLM_PROVIDER', 'fleet');
    expect(() => resolveSovereignProvider()).toThrow(/async/i);
  });

  it('defaults to the HoloLlama sovereign local (:18080) when nothing is configured — no throw (D.117)', () => {
    const r = resolveSovereignProvider();
    expect(r.providerName).toBe('holollama');
    expect(r.provider).toBeInstanceOf(LocalLLMAdapter);
  });

  it('rejects unknown explicit providers', () => {
    expect(() => resolveSovereignProvider({ explicit: 'gpt5-turbo' })).toThrow(/Unknown/i);
  });
});

describe('resolveSovereignProviderAsync (owned local fleet)', () => {
  it('consumes a pytorch-holo route through the OpenAI-compatible chat path', async () => {
    vi.stubEnv('HOLO_LLM_FLEET_BRAIN', 'C:/fleet/model-fleet.hsplus');
    resolveLocalFleetMock.mockResolvedValue({
      baseURL: 'http://127.0.0.1:8099',
      model: 'holorunner-s0',
      backend: 'pytorch-holo',
      route: {
        handle: 'laptop-holoserve',
        baseURL: 'http://127.0.0.1:8099',
        model: 'holorunner-s0',
        warm: true,
        loadScore: 0,
        backend: 'pytorch-holo',
        reason: 'test route',
        candidates: [],
      },
    });

    const r = await resolveSovereignProviderAsync();
    expect(resolveLocalFleetMock).toHaveBeenCalledWith({
      brainPath: 'C:/fleet/model-fleet.hsplus',
      model: undefined,
    });
    expect(r.providerName).toBe('local-fleet');
    expect(r.model).toBe('holorunner-s0');
    expect(r.provider).toBeInstanceOf(LocalLLMAdapter);

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'holorunner-s0',
        choices: [{ message: { content: 'owned-metal reply' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchSpy);

    await r.provider.complete({ messages: [{ role: 'user', content: 'status?' }] }, r.model);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8099/v1/chat/completions');
  });

  it('keeps HoloLlama as the GGUF carrier when an auto local-fleet route is unavailable', async () => {
    vi.stubEnv('HOLO_LLM_FLEET_BRAIN', 'C:/fleet/model-fleet.hsplus');
    vi.stubEnv('HOLOLLAMA_URL', 'http://127.0.0.1:18080');

    const r = await resolveSovereignProviderAsync();

    expect(resolveLocalFleetMock).toHaveBeenCalledOnce();
    expect(r.providerName).toBe('holollama');
    expect(r.provider).toBeInstanceOf(LocalLLMAdapter);
  });

  it('fails closed when local-fleet is explicitly required but no route is admitted', async () => {
    vi.stubEnv('HOLO_LLM_PROVIDER', 'local-fleet');
    vi.stubEnv('HOLO_LLM_FLEET_BRAIN', 'C:/fleet/model-fleet.hsplus');

    await expect(resolveSovereignProviderAsync()).rejects.toThrow(
      /no admitted owned local fleet route/i
    );
  });
});

describe('resolveSovereignProviderAsync (Vast serverless fleet)', () => {
  it('resolves the fleet when the Vast route reports a ready worker', async () => {
    vi.stubEnv('HOLO_LLM_FLEET_MODEL', 'qwen3-coder:30b');
    vi.stubEnv('VAST_API_KEY', 'vast-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ url: 'http://worker.test:8000', signature: 'sig123' }),
      }))
    );
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('fleet');
    expect(r.provider).toBeInstanceOf(VastServerlessAdapter);
    expect(r.model).toBe('qwen3-coder:30b');
  });

  it('falls back to the sync chain when the fleet is cold', async () => {
    vi.stubEnv('VAST_API_KEY', 'vast-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: { ready: 0, total: 1 } }),
      }))
    );
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('anthropic');
  });

  it('fleet-cold fallback still verifies a configured HoloServe before returning it', async () => {
    vi.stubEnv('VAST_API_KEY', 'vast-key');
    vi.stubEnv('HOLOSERVE_URL', 'http://box:8099');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).endsWith('/health')) throw new Error('ECONNREFUSED');
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: { ready: 0, total: 1 } }),
        };
      })
    );
    await expect(resolveSovereignProviderAsync()).rejects.toThrow(/HoloServe.*unreachable/u);
  });

  it('falls back to the HoloLlama sovereign default when the fleet is cold and nothing else is set (D.117)', async () => {
    vi.stubEnv('VAST_API_KEY', 'vast-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: { ready: 0, total: 1 } }),
      }))
    );
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('holollama');
  });

  it('skips the fleet entirely when no fleet env is present', async () => {
    vi.stubEnv('OLLAMA_HOST', 'http://box:11434');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('ollama');
    // Local-model DISCOVERY may probe the ollama box, but the Vast route must
    // never be consulted without fleet env.
    const fleetCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes('run.vast.ai/route')
    );
    expect(fleetCalls.length).toBe(0);
  });

  it('upgrades the ollama model by discovery when no model is pinned', async () => {
    vi.stubEnv('OLLAMA_HOST', 'http://box:11434');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/api/tags')) {
          return {
            ok: true,
            json: async () => ({
              models: [
                { name: 'old-coder:7b', details: { parameter_size: '7.6B' } },
                { name: 'fresh:4b', details: { parameter_size: '4.7B' } },
              ],
            }),
          };
        }
        if (u.endsWith('/api/show')) {
          const model = JSON.parse(String(init?.body ?? '{}')).model as string;
          return {
            ok: true,
            json: async () => ({
              capabilities:
                model === 'fresh:4b'
                  ? ['completion', 'tools', 'thinking']
                  : ['completion', 'tools'],
            }),
          };
        }
        if (u.endsWith('/v1/chat/completions')) {
          const model = JSON.parse(String(init?.body ?? '{}')).model as string;
          return {
            ok: true,
            json: async () => ({
              choices: [
                {
                  message:
                    model === 'fresh:4b'
                      ? {
                          tool_calls: [
                            {
                              function: {
                                name: 'create_object',
                                arguments: '{"name":"orb-probe","radius":2,"position":[1,2,3]}',
                              },
                            },
                          ],
                        }
                      : { content: '{"name":"create_object"}' },
                },
              ],
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      })
    );
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('ollama');
    expect(r.model).toBe('fresh:4b');
  });

  it('discovery never overrides an explicitly pinned model', async () => {
    vi.stubEnv('OLLAMA_HOST', 'http://box:11434');
    vi.stubEnv('HOLO_LLM_MODEL', 'pinned:1b');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await resolveSovereignProviderAsync();
    expect(r.model).toBe('pinned:1b');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('explicit non-fleet provider bypasses fleet even with fleet env present', async () => {
    vi.stubEnv('VAST_API_KEY', 'vast-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    vi.stubEnv('HOLO_LLM_PROVIDER', 'anthropic');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('anthropic');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('resolveSovereignProviderAsync — HoloServe sovereignty gate (D.118/W.832)', () => {
  const healthResponse = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as Response;

  it('resolves holoserve only with the exact canonical artifact registry', async () => {
    vi.stubEnv('HOLOSERVE_URL', 'http://box:8099');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => healthResponse(testHoloServeHealth('holorunner-s0')))
    );
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('holoserve');
  });

  it('REFUSES a reachable impostor whose /health lacks the invariant — never silent fallback', async () => {
    vi.stubEnv('HOLOSERVE_URL', 'http://box:8099');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => healthResponse({ sovereign: false, llama_cpp: true }))
    );
    await expect(resolveSovereignProviderAsync()).rejects.toThrow(/REFUSING non-sovereign/);
  });

  it('REFUSES a sovereign-labelled server with no artifact binding registry', async () => {
    vi.stubEnv('HOLOSERVE_URL', 'http://box:8099');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        healthResponse({
          status: 'ok',
          backend: 'pytorch-holo',
          sovereign: true,
          llama_cpp: false,
          gguf: false,
        })
      )
    );
    await expect(resolveSovereignProviderAsync()).rejects.toThrow(/artifact-unbound/);
  });

  it('REFUSES a registry that does not bind the requested model', async () => {
    vi.stubEnv('HOLOSERVE_URL', 'http://box:8099');
    vi.stubEnv('HOLO_LLM_MODEL', 'expected-model');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => healthResponse(testHoloServeHealth('wrong-model')))
    );
    await expect(resolveSovereignProviderAsync()).rejects.toThrow(/expected-model is required/);
  });

  it('REFUSES a non-canonical nested bins binding hash', async () => {
    vi.stubEnv('HOLOSERVE_URL', 'http://box:8099');
    const health = testHoloServeHealth('holorunner-s0');
    const registry = health.model_artifact_bindings as {
      models: Record<string, { bins: { bindingSha256: string } }>;
    };
    registry.models['holorunner-s0'].bins.bindingSha256 = `sha256:${'f'.repeat(64)}`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => healthResponse(health))
    );
    await expect(resolveSovereignProviderAsync()).rejects.toThrow(/artifact-unbound/);
  });

  it('an unreachable configured HoloServe throws with the start hint (URL = commitment)', async () => {
    vi.stubEnv('HOLOSERVE_URL', 'http://box:8099');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );
    await expect(resolveSovereignProviderAsync()).rejects.toThrow(
      /unreachable.*--model-name.*--ckpt.*--bins.*--snapshot-dir.*--custody-receipt.*--expected-custody-sha256/s
    );
  });
});

describe('per-model HoloServe parity pin (dependency-sovereignty-ladder, 2026-07-16)', () => {
  let registryDir: string | null = null;
  const inlinePin = (model: string, bindingSha256 = `sha256:${'a'.repeat(64)}`) =>
    `${model}@${bindingSha256}`;

  afterEach(() => {
    if (registryDir) {
      rmSync(registryDir, { recursive: true, force: true });
      registryDir = null;
    }
  });

  function writeRegistry(
    pins: Record<string, { verdict: string; bindingSha256?: string }>
  ): string {
    registryDir = mkdtempSync(join(tmpdir(), 'holoserve-parity-'));
    const path = join(registryDir, 'pinned-models.json');
    writeFileSync(
      path,
      JSON.stringify({ schema: 'holoserve-parity-pin-registry/v0', pins }, null, 2)
    );
    return path;
  }

  it('a synchronous parity pin requires the async live-binding admission path', () => {
    vi.stubEnv('HOLOSERVE_PARITY_PINS', inlinePin('brittney-edge-v0-5'));
    vi.stubEnv('HOLOLLAMA_URL', 'http://box:18080');
    vi.stubEnv('HOLO_LLM_MODEL', 'brittney-edge-v0-5');
    expect(() => resolveSovereignProvider()).toThrow(/requires resolveSovereignProviderAsync/u);
  });

  it('direct configured and explicit HoloServe sync routes cannot bypass a parity pin', () => {
    vi.stubEnv('HOLOSERVE_PARITY_PINS', inlinePin('pinned-model'));
    vi.stubEnv('HOLO_LLM_MODEL', 'pinned-model');
    vi.stubEnv('HOLOSERVE_URL', 'http://box:8099');
    expect(() => resolveSovereignProvider()).toThrow(/requires resolveSovereignProviderAsync/u);
    expect(() => resolveSovereignProvider({ explicit: 'holoserve' })).toThrow(
      /requires resolveSovereignProviderAsync/u
    );
  });

  it("explicit 'holollama' cannot reach llama-server for a pinned model (the strangler ruling)", () => {
    vi.stubEnv('HOLOSERVE_PARITY_PINS', inlinePin('holorunner-s0-custody'));
    expect(() =>
      resolveSovereignProvider({ explicit: 'holollama', model: 'holorunner-s0-custody' })
    ).toThrow(/requires resolveSovereignProviderAsync/u);
  });

  it('pins apply on the TERMINAL HoloLlama default path too (nothing else configured)', () => {
    vi.stubEnv('HOLOSERVE_PARITY_PINS', inlinePin('pinned-model'));
    vi.stubEnv('HOLO_LLM_MODEL', 'pinned-model');
    expect(() => resolveSovereignProvider()).toThrow(/requires resolveSovereignProviderAsync/u);
  });

  it('a model WITHOUT a receipt keeps behavior exactly unchanged (fail-open)', () => {
    vi.stubEnv('HOLOSERVE_PARITY_PINS', inlinePin('some-other-model'));
    vi.stubEnv('HOLOLLAMA_URL', 'http://box:18080');
    vi.stubEnv('HOLO_LLM_MODEL', 'unpinned-model');
    const r = resolveSovereignProvider();
    expect(r.providerName).toBe('holollama');
    expect(r.model).toBe('unpinned-model');
  });

  it('a legacy name-only inline pin cannot strangle without an artifact binding hash', () => {
    vi.stubEnv('HOLOSERVE_PARITY_PINS', 'name-only-model');
    const r = resolveSovereignProvider({ explicit: 'holollama', model: 'name-only-model' });
    expect(r.providerName).toBe('holollama');
  });

  it('registry file: verdict "pass" pins, any other verdict does not', () => {
    const path = writeRegistry({
      'model-pass': { verdict: 'pass', bindingSha256: `sha256:${'a'.repeat(64)}` },
      'legacy-name-only': { verdict: 'pass' },
      'model-fail': { verdict: 'fail' },
    });
    vi.stubEnv('HOLOSERVE_PARITY_REGISTRY', path);
    expect(() => resolveSovereignProvider({ explicit: 'holollama', model: 'model-pass' })).toThrow(
      /requires resolveSovereignProviderAsync/u
    );
    expect(
      resolveSovereignProvider({ explicit: 'holollama', model: 'model-fail' }).providerName
    ).toBe('holollama');
    expect(
      resolveSovereignProvider({ explicit: 'holollama', model: 'legacy-name-only' }).providerName
    ).toBe('holollama');
  });

  it('a missing or unreadable registry file pins NOTHING (fail-open, never throws)', () => {
    vi.stubEnv('HOLOSERVE_PARITY_REGISTRY', join(tmpdir(), 'does-not-exist', 'registry.json'));
    const r = resolveSovereignProvider({ explicit: 'holollama', model: 'model-pass' });
    expect(r.providerName).toBe('holollama');
  });

  it('async resolution of a pinned model still enforces the HoloServe sovereignty invariant', async () => {
    const health = testHoloServeHealth('pinned-model');
    vi.stubEnv(
      'HOLOSERVE_PARITY_PINS',
      inlinePin('pinned-model', bindingSha256For(health, 'pinned-model'))
    );
    vi.stubEnv('HOLO_LLM_MODEL', 'pinned-model');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => health,
      }))
    );
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('holoserve');
    expect(r.model).toBe('pinned-model');
  });

  it('async resolution refuses checkpoint replacement under a parity-pinned model name', async () => {
    const testedHealth = testHoloServeHealth('pinned-model', '1');
    const replacementHealth = testHoloServeHealth('pinned-model', '4');
    vi.stubEnv(
      'HOLOSERVE_PARITY_PINS',
      inlinePin('pinned-model', bindingSha256For(testedHealth, 'pinned-model'))
    );
    vi.stubEnv('HOLO_LLM_MODEL', 'pinned-model');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => replacementHealth,
      }))
    );
    await expect(resolveSovereignProviderAsync()).rejects.toThrow(/parity-artifact drift/u);
  });

  it('configured and explicit HoloServe async routes retain the parity binding hash', async () => {
    const testedHealth = testHoloServeHealth('pinned-model', '1');
    const replacementHealth = testHoloServeHealth('pinned-model', '4');
    vi.stubEnv(
      'HOLOSERVE_PARITY_PINS',
      inlinePin('pinned-model', bindingSha256For(testedHealth, 'pinned-model'))
    );
    vi.stubEnv('HOLO_LLM_MODEL', 'pinned-model');
    vi.stubEnv('HOLOSERVE_URL', 'http://box:8099');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => replacementHealth,
      }))
    );
    await expect(resolveSovereignProviderAsync()).rejects.toThrow(/parity-artifact drift/u);
    await expect(resolveSovereignProviderAsync({ explicit: 'holoserve' })).rejects.toThrow(
      /parity-artifact drift/u
    );
  });

  it('fleet-cold parity fallback cannot bypass the exact artifact binding pin', async () => {
    const testedHealth = testHoloServeHealth('pinned-model', '1');
    const replacementHealth = testHoloServeHealth('pinned-model', '4');
    vi.stubEnv('VAST_API_KEY', 'vast-key');
    vi.stubEnv(
      'HOLOSERVE_PARITY_PINS',
      inlinePin('pinned-model', bindingSha256For(testedHealth, 'pinned-model'))
    );
    vi.stubEnv('HOLO_LLM_MODEL', 'pinned-model');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).endsWith('/health')) {
          return { ok: true, status: 200, json: async () => replacementHealth };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: { ready: 0, total: 1 } }),
        };
      })
    );
    await expect(resolveSovereignProviderAsync()).rejects.toThrow(/parity-artifact drift/u);
  });
});
