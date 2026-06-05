/**
 * Brittney provider resolution tests — D.025 Phase 3
 *
 * Pins the BRITTNEY_PROVIDER env gate behavior (native-default, BYOK fallback —
 * founder directive 2026-06-05):
 *   - explicit anthropic → AnthropicAdapter with correct model/maxTokens
 *   - explicit ollama → LocalLLMAdapter with Ollama host
 *   - auto-detect order: cloud (sovereign) → ollama (sovereign) → anthropic (BYOK)
 *   - auto-detect: only ANTHROPIC_API_KEY present → anthropic (BYOK fallback)
 *   - neither configured → clear error
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveBrittneyProvider, resolveBrittneyProviderAsync } from '../provider';

describe('resolveBrittneyProvider', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.BRITTNEY_PROVIDER;
    delete process.env.BRITTNEY_MODEL;
    delete process.env.BRITTNEY_MAX_TOKENS;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.BRITTNEY_SERVICE_URL;
  });

  afterEach(() => {
    process.env = { ...origEnv };
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
    expect(result.model).toBe('brittney-qwen-v23:latest');
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

  it('auto-detects anthropic when ANTHROPIC_API_KEY present', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-auto-detect';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('anthropic');
  });

  it('auto-detects ollama when only OLLAMA_HOST present', () => {
    process.env.OLLAMA_HOST = 'http://192.168.1.100:11434';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
  });

  it('throws clear error when no provider is configured', () => {
    expect(() => resolveBrittneyProvider()).toThrow(/No Brittney provider configured/);
  });

  it('throws clear error when BRITTNEY_PROVIDER=anthropic but no API key', () => {
    process.env.BRITTNEY_PROVIDER = 'anthropic';
    expect(() => resolveBrittneyProvider()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('prefers ollama (sovereign) over anthropic (BYOK) when both configured (auto-detect)', () => {
    // Native-default: a sovereign backend wins over the BYOK frontier fallback.
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.OLLAMA_HOST = 'http://host.docker.internal:11434';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
  });

  it('prefers cloud (sovereign serving) over anthropic (BYOK) when both configured (auto-detect)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.BRITTNEY_SERVICE_URL = 'https://brittney.holoscript.net';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('cloud');
  });

  it('prefers cloud over ollama when both sovereign backends configured (auto-detect)', () => {
    process.env.BRITTNEY_SERVICE_URL = 'https://brittney.holoscript.net';
    process.env.OLLAMA_HOST = 'http://host.docker.internal:11434';
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

  it('recognizes OLLAMA_BASE_URL as alternative to OLLAMA_HOST', () => {
    process.env.OLLAMA_BASE_URL = 'http://custom-host:11434';
    const result = resolveBrittneyProvider();
    expect(result.providerName).toBe('ollama');
  });
});

describe('resolveBrittneyProviderAsync — fleet (sovereign serving)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    for (const k of ['BRITTNEY_PROVIDER', 'BRITTNEY_MODEL', 'BRITTNEY_MAX_TOKENS',
      'ANTHROPIC_API_KEY', 'OLLAMA_HOST', 'OLLAMA_BASE_URL', 'BRITTNEY_SERVICE_URL',
      'BRITTNEY_FLEET_MODEL', 'FLEET_INFERENCE_KEY', 'BRITTNEY_FLEET_ORCH_URL',
      'BRITTNEY_FLEET_RESOLVE_KEY', 'HOLOSCRIPT_API_KEY']) delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...origEnv };
    vi.unstubAllGlobals();
  });

  const stubResolve = (resp: unknown, ok = true) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => resp })));

  it('resolves fleet when warm (BRITTNEY_PROVIDER=fleet)', async () => {
    process.env.BRITTNEY_PROVIDER = 'fleet';
    process.env.FLEET_INFERENCE_KEY = 'serve-key';
    stubResolve({ status: 'warm', url: 'http://1.2.3.4:40188' });
    const result = await resolveBrittneyProviderAsync();
    expect(result.providerName).toBe('fleet');
    expect(result.model).toBe('qwen2.5-coder:1.5b');
  });

  it('falls back to anthropic (BYOK) when fleet is cold', async () => {
    process.env.BRITTNEY_PROVIDER = 'fleet';
    process.env.ANTHROPIC_API_KEY = 'sk-byok-fallback';
    stubResolve({ status: 'cold', model: 'qwen2.5-coder:1.5b' });
    const result = await resolveBrittneyProviderAsync();
    expect(result.providerName).toBe('anthropic');
  });

  it('surfaces the cold error when fleet is cold and no fallback configured', async () => {
    process.env.BRITTNEY_PROVIDER = 'fleet';
    stubResolve({ status: 'cold' });
    await expect(resolveBrittneyProviderAsync()).rejects.toThrow(/cold/i);
  });

  it('auto-detects fleet when BRITTNEY_FLEET_MODEL set and no explicit provider', async () => {
    process.env.BRITTNEY_FLEET_MODEL = 'qwen2.5-coder:1.5b';
    process.env.FLEET_INFERENCE_KEY = 'serve-key';
    stubResolve({ status: 'warm', url: 'http://1.2.3.4:40188' });
    const result = await resolveBrittneyProviderAsync();
    expect(result.providerName).toBe('fleet');
  });

  it('delegates to sync resolution when fleet not configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const result = await resolveBrittneyProviderAsync();
    expect(result.providerName).toBe('anthropic');
  });
});