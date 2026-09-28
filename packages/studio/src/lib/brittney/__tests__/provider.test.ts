/**
 * Brittney provider resolution tests — D.025 Phase 3
 *
 * Pins the BRITTNEY_PROVIDER env gate behavior (native-default, gated BYOK —
 * founder directive 2026-06-05, native-inference audit 2026-09-24, D.117 Ollama retired):
 *   - explicit anthropic → AnthropicAdapter with correct model/maxTokens
 *   - explicit ollama → LocalLLMAdapter with Ollama host (someone's own Ollama still works)
 *   - explicit holollama / holoserve → our own servers via the llm-provider resolver
 *   - auto-detect order: cloud (hosted bridge) → holoserve → holollama → anthropic (gated)
 *   - OLLAMA_HOST alone selects nothing; llm-provider says so once per process
 *   - auto-detect: only ANTHROPIC_API_KEY present → refuse unless HOLO_ALLOW_FRONTIER_FALLBACK=1
 *   - neither configured → clear error
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FrontierFallbackRefusedError, HostedOllamaRefusedError } from '@holoscript/llm-provider';
import { resolveBrittneyProvider, resolveBrittneyProviderAsync } from '../provider';

/** Every env name the resolution reads, so a developer's shell cannot leak into a test. */
const PROVIDER_ENV = [
  'BRITTNEY_PROVIDER',
  'BRITTNEY_MODEL',
  'BRITTNEY_MAX_TOKENS',
  'ANTHROPIC_API_KEY',
  'OLLAMA_HOST',
  'OLLAMA_BASE_URL',
  'OLLAMA_URL',
  'HOLOLLAMA_URL',
  'HOLOLLAMA_ENDPOINT',
  'HOLOSERVE_URL',
  'HOLOSERVE_ENDPOINT',
  'HOLOSERVE_MODEL',
  'HOLOSERVE_PARITY_PINS',
  'HOLOSERVE_PARITY_REGISTRY',
  'HOLO_LLM_PROVIDER',
  'HOLO_LLM_MODEL',
  'HOLO_LLM_MAX_TOKENS',
  'HOLO_INFERENCE_PROXY_KEY_NAME',
  'BRITTNEY_SERVICE_URL',
  'HOLO_ALLOW_FRONTIER_FALLBACK',
  'HOLO_ALLOW_HOSTED_OLLAMA',
];

const JETSON_HOLOLLAMA = 'http://192.168.0.119:18080';
const LAPTOP_HOLOSERVE = 'http://127.0.0.1:8099';

/** Stub fetch with a chat reply in both the OpenAI-compat and the Ollama /api/chat shape. */
function stubChatFetch() {
  const fetchMock = vi.fn(async (_url: string, _init?: unknown) => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      message: { content: 'ok' },
    }),
    text: async () => '',
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('resolveBrittneyProvider', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    for (const k of PROVIDER_ENV) delete process.env[k];
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // llm-provider logs the retirement notice once per process. vi.resetModules() re-evaluates
  // it (a workspace package, so vitest inlines it; checked), so this test's position is free.
  it('OLLAMA_HOST alone no longer auto-selects a local model, and the notice says so once', async () => {
    vi.resetModules();
    const fresh = await import('../provider');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.OLLAMA_HOST = 'http://192.168.1.100:11434';
    expect(() => fresh.resolveBrittneyProvider()).toThrow(/No Brittney provider configured/);
    const retired = () =>
      warn.mock.calls.map((c) => String(c[0])).filter((line) => line.includes('OLLAMA RETIRED'));
    expect(retired()).toHaveLength(1);
    expect(retired()[0]).toContain('OLLAMA RETIRED (caller studio brittney provider)');
    expect(retired()[0]).toContain('HOLOLLAMA_URL');

    // OLLAMA_BASE_URL alone selects nothing either, and the notice is not repeated.
    delete process.env.OLLAMA_HOST;
    process.env.OLLAMA_BASE_URL = 'http://custom-host:11434';
    expect(() => fresh.resolveBrittneyProvider()).toThrow(/No Brittney provider configured/);
    expect(retired()).toHaveLength(1);
  }, 30_000);

  it('explicit ollama refuses a hosted Ollama (ollama.com); auto ignores OLLAMA_HOST', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.OLLAMA_HOST = 'https://ollama.com';
    // Auto never looks at Ollama any more, so it neither uses nor refuses the hosted one.
    expect(() => resolveBrittneyProvider()).toThrow(/No Brittney provider configured/);
    const lines = () => warn.mock.calls.map((c) => String(c[0]));
    expect(lines().some((line) => line.includes('HOSTED OLLAMA'))).toBe(false);

    process.env.BRITTNEY_PROVIDER = 'ollama';
    expect(() => resolveBrittneyProvider()).toThrow(HostedOllamaRefusedError);
    const refused = lines().find((line) => line.includes('HOSTED OLLAMA REFUSED'));
    expect(refused).toBeDefined();
    expect(refused).toContain('studio brittney provider');
  });

  it('refuses a cloud-tagged BRITTNEY_MODEL even on a local Ollama', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.BRITTNEY_PROVIDER = 'ollama';
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    process.env.BRITTNEY_MODEL = 'gpt-oss:120b-cloud';
    expect(() => resolveBrittneyProvider()).toThrow(/cloud model/);
  });

  it('explicit ollama uses a hosted Ollama only with HOLO_ALLOW_HOSTED_OLLAMA=1, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.BRITTNEY_PROVIDER = 'ollama';
    process.env.OLLAMA_HOST = 'https://ollama.com';
    process.env.HOLO_ALLOW_HOSTED_OLLAMA = '1';
    expect(resolveBrittneyProvider().providerName).toBe('ollama');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('HOSTED OLLAMA ACTIVE'));
  });

  it('resolves anthropic when BRITTNEY_PROVIDER=anthropic and ANTHROPIC_API_KEY set', () => {
    process.env.BRITTNEY_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('anthropic');
    expect(result.provider.name).toBe('anthropic');
    expect(result.model).toBe('claude-opus-4-7');
    expect(result.maxTokens).toBe(16000);
  });

  it('resolves anthropic with BRITTNEY_MODEL override', () => {
    process.env.BRITTNEY_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
    process.env.BRITTNEY_MODEL = 'claude-sonnet-4-6';
    const result = resolveBrittneyProvider();
    expect(result.model).toBe('claude-sonnet-4-6');
  });

  it('resolves ollama when BRITTNEY_PROVIDER=ollama', () => {
    process.env.BRITTNEY_PROVIDER = 'ollama';
    process.env.OLLAMA_HOST = 'http://host.docker.internal:11434';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
    expect(result.provider.name).toBe('local-llm');
    expect(result.model).toBe('qwen3:4b-instruct-2507'); // LOCAL_DEFAULT_MODEL (SSOT; qwen3.5:4b had the Ollama plain-text-tool-call bug, W.512)
    expect(result.maxTokens).toBe(4096);
  });

  it('resolves ollama with BRITTNEY_MODEL and BRITTNEY_MAX_TOKENS overrides', () => {
    process.env.BRITTNEY_PROVIDER = 'ollama';
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    process.env.BRITTNEY_MODEL = 'llama3:8b';
    process.env.BRITTNEY_MAX_TOKENS = '8192';
    const result = resolveBrittneyProvider();
    expect(result.model).toBe('llama3:8b');
    expect(result.maxTokens).toBe(8192);
  });

  it('resolves ollama with default localhost when OLLAMA_HOST not set', () => {
    process.env.BRITTNEY_PROVIDER = 'ollama';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
  });

  it('refuses auto anthropic unless HOLO_ALLOW_FRONTIER_FALLBACK is exactly 1', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-auto-detect';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => resolveBrittneyProvider()).toThrow(FrontierFallbackRefusedError);
    expect(() => resolveBrittneyProvider()).toThrow(/resolveBrittneyProvider/);
    expect(() => resolveBrittneyProvider()).toThrow(/"anthropic"/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('FRONTIER FALLBACK REFUSED'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('frontier provider "anthropic"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('resolveBrittneyProvider'));

    warn.mockClear();
    process.env.HOLO_ALLOW_FRONTIER_FALLBACK = 'true';
    expect(() => resolveBrittneyProvider()).toThrow(FrontierFallbackRefusedError);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('FRONTIER FALLBACK REFUSED'));
  });

  it('auto-detects anthropic only when HOLO_ALLOW_FRONTIER_FALLBACK=1', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-auto-detect';
    process.env.HOLO_ALLOW_FRONTIER_FALLBACK = '1';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('anthropic');
    expect(result.frontierFallback).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('FRONTIER FALLBACK ACTIVE'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('frontier provider "anthropic"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('resolveBrittneyProvider'));
  });

  it('auto-detects holollama when only HOLOLLAMA_URL is present', () => {
    process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('holollama');
    expect(result.provider.name).toBe('local-llm');
    expect(result.model).toBe('qwen3:4b-instruct-2507');
    expect(result.maxTokens).toBe(4096);
  });

  it('talks to HoloLlama over its OpenAI-compatible chat path, not Ollama /api/chat', async () => {
    process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
    const fetchMock = stubChatFetch();
    const result = resolveBrittneyProvider();
    const reply = await result.provider.complete(
      { messages: [{ role: 'user', content: 'hi' }] },
      result.model
    );
    expect(reply.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${JETSON_HOLOLLAMA}/v1/chat/completions`);
  });

  it('honors BRITTNEY_MAX_TOKENS on our own local server', () => {
    process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
    process.env.BRITTNEY_MAX_TOKENS = '2048';
    expect(resolveBrittneyProvider().maxTokens).toBe(2048);
  });

  it('prefers HOLOSERVE_URL over HOLOLLAMA_URL when both are set (auto-detect)', () => {
    process.env.HOLOSERVE_URL = LAPTOP_HOLOSERVE;
    process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('holoserve');
    expect(result.provider.name).toBe('local-llm');
    expect(result.model).toBe('holorunner-s0');
  });

  it('explicit BRITTNEY_PROVIDER=holollama resolves HoloLlama, even with HoloServe and a key set', () => {
    process.env.BRITTNEY_PROVIDER = 'holollama';
    process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
    process.env.HOLOSERVE_URL = LAPTOP_HOLOSERVE;
    process.env.ANTHROPIC_API_KEY = 'sk-still-present';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('holollama');
    expect(result.model).toBe('qwen3:4b-instruct-2507');
    expect(result.maxTokens).toBe(4096);
  });

  it('explicit BRITTNEY_PROVIDER=holoserve resolves HoloServe, even with HOLOLLAMA_URL set', () => {
    process.env.BRITTNEY_PROVIDER = 'holoserve';
    process.env.HOLOSERVE_URL = LAPTOP_HOLOSERVE;
    process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('holoserve');
    expect(result.model).toBe('holorunner-s0');
  });

  it('explicit holoserve without HOLOSERVE_URL uses the default local HoloServe port', async () => {
    process.env.BRITTNEY_PROVIDER = 'holoserve';
    const fetchMock = stubChatFetch();
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('holoserve');
    await result.provider.complete({ messages: [{ role: 'user', content: 'hi' }] }, result.model);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8099/v1/chat/completions');
  });

  it('explicit holollama without HOLOLLAMA_URL still resolves HoloLlama', () => {
    process.env.BRITTNEY_PROVIDER = 'holollama';
    expect(resolveBrittneyProvider().providerName).toBe('holollama');
  });

  it('throws clear error when no provider is configured', () => {
    expect(() => resolveBrittneyProvider()).toThrow(/No Brittney provider configured/);
    expect(() => resolveBrittneyProvider()).toThrow(/HOLOLLAMA_URL/);
  });

  it('throws clear error when BRITTNEY_PROVIDER=anthropic but no API key', () => {
    process.env.BRITTNEY_PROVIDER = 'anthropic';
    expect(() => resolveBrittneyProvider()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('prefers holollama (sovereign) over anthropic (BYOK) when both configured (auto-detect)', () => {
    // Native-default: a sovereign backend wins over the BYOK frontier fallback.
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('holollama');
  });

  it('prefers cloud (hosted bridge, not sovereign) over anthropic when both configured (auto-detect)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.BRITTNEY_SERVICE_URL = 'https://brittney.holoscript.net';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('cloud');
  });

  it('prefers cloud (hosted bridge) over holollama (sovereign local) when both configured (auto-detect)', () => {
    process.env.BRITTNEY_SERVICE_URL = 'https://brittney.holoscript.net';
    process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('cloud');
  });

  it('explicit BRITTNEY_PROVIDER=ollama overrides auto-detect even when ANTHROPIC_API_KEY present', () => {
    process.env.BRITTNEY_PROVIDER = 'ollama';
    process.env.ANTHROPIC_API_KEY = 'sk-still-present';
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
  });

  it('explicit ollama reads OLLAMA_BASE_URL as an alternative to OLLAMA_HOST', async () => {
    process.env.BRITTNEY_PROVIDER = 'ollama';
    process.env.OLLAMA_BASE_URL = 'http://custom-host:11434';
    const fetchMock = stubChatFetch();
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
    await result.provider.complete({ messages: [{ role: 'user', content: 'hi' }] }, result.model);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://custom-host:11434/api/chat');
  });
});

describe('resolveBrittneyProviderAsync — fleet (sovereign serving)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    for (const k of [
      ...PROVIDER_ENV,
      'BRITTNEY_ALLOW_FRONTIER_FALLBACK',
      'BRITTNEY_FLEET_MODEL',
      'FLEET_INFERENCE_KEY',
      'BRITTNEY_FLEET_ORCH_URL',
      'BRITTNEY_FLEET_RESOLVE_KEY',
      'HOLOSCRIPT_API_KEY',
      'FLEET_SERVERLESS_ENDPOINT',
      'VAST_QWEN_ENDPOINT_NAME',
      'VAST_API_KEY',
    ])
      delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...origEnv };
    vi.unstubAllGlobals();
  });

  const stubResolve = (resp: unknown, ok = true) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok, json: async () => resp }))
    );

  it('resolves fleet when warm (BRITTNEY_PROVIDER=fleet)', async () => {
    process.env.BRITTNEY_PROVIDER = 'fleet';
    process.env.FLEET_INFERENCE_KEY = 'serve-key';
    stubResolve({ status: 'warm', url: 'http://1.2.3.4:40188' });
    const result = await resolveBrittneyProviderAsync();
    expect(result.providerName).toBe('fleet');
    expect(result.model).toBe('qwen3:4b-instruct-2507');
  });

  it('does NOT fall back to a paid frontier API when fleet is cold (founder policy 2026-06-14)', async () => {
    process.env.BRITTNEY_PROVIDER = 'fleet';
    process.env.ANTHROPIC_API_KEY = 'sk-byok-fallback';
    stubResolve({ status: 'cold', model: 'qwen3.5:4b' });
    // Sovereign-only: even with an Anthropic key present, a cold fleet surfaces a
    // warming error — never a silent Anthropic bill.
    await expect(resolveBrittneyProviderAsync()).rejects.toThrow(/warming/i);
  });

  it('a cold fleet falls back to our own HoloLlama server, not the Anthropic key', async () => {
    process.env.BRITTNEY_PROVIDER = 'fleet';
    process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
    process.env.ANTHROPIC_API_KEY = 'sk-byok-fallback';
    stubResolve({ status: 'cold' });
    const result = await resolveBrittneyProviderAsync();
    expect(result.providerName).toBe('holollama');
    expect(result.model).toBe('qwen3:4b-instruct-2507');
  });

  it('a cold fleet no longer lands on Ollama: OLLAMA_HOST alone still means warming', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.BRITTNEY_PROVIDER = 'fleet';
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    stubResolve({ status: 'cold' });
    await expect(resolveBrittneyProviderAsync()).rejects.toThrow(/warming/i);
  });

  it('restores the frontier fallback when BRITTNEY_ALLOW_FRONTIER_FALLBACK=1', async () => {
    process.env.BRITTNEY_PROVIDER = 'fleet';
    process.env.ANTHROPIC_API_KEY = 'sk-byok-fallback';
    process.env.BRITTNEY_ALLOW_FRONTIER_FALLBACK = '1';
    stubResolve({ status: 'cold', model: 'qwen3.5:4b' });
    const result = await resolveBrittneyProviderAsync();
    expect(result.providerName).toBe('anthropic');
  });

  it('surfaces a warming error when fleet is cold and no sovereign fallback configured', async () => {
    process.env.BRITTNEY_PROVIDER = 'fleet';
    stubResolve({ status: 'cold' });
    await expect(resolveBrittneyProviderAsync()).rejects.toThrow(/warming/i);
  });

  it('auto-detects fleet when BRITTNEY_FLEET_MODEL set and no explicit provider', async () => {
    process.env.BRITTNEY_FLEET_MODEL = 'qwen3.5:4b';
    process.env.FLEET_INFERENCE_KEY = 'serve-key';
    stubResolve({ status: 'warm', url: 'http://1.2.3.4:40188' });
    const result = await resolveBrittneyProviderAsync();
    expect(result.providerName).toBe('fleet');
  });

  it('lands on HoloLlama without any network call (no Ollama model discovery)', async () => {
    process.env.HOLOLLAMA_URL = JETSON_HOLOLLAMA;
    const fetchMock = vi.fn(async () => {
      throw new Error('no network call expected while resolving');
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await resolveBrittneyProviderAsync();
    expect(result.providerName).toBe('holollama');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('delegates to sync resolution and refuses a silent anthropic fallback', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(resolveBrittneyProviderAsync()).rejects.toBeInstanceOf(FrontierFallbackRefusedError);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('FRONTIER FALLBACK REFUSED'));
  });

  it('delegates to sync resolution and uses anthropic when HOLO_ALLOW_FRONTIER_FALLBACK=1', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.HOLO_ALLOW_FRONTIER_FALLBACK = '1';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await resolveBrittneyProviderAsync();
    expect(result.providerName).toBe('anthropic');
    expect(result.frontierFallback).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('FRONTIER FALLBACK ACTIVE'));
  });
});
