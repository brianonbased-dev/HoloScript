/**
 * Universal sovereign-first resolution tests (founder directive 2026-06-10):
 * sovereign serving (fleet → cloud → ollama) before any BYOK frontier key,
 * one policy for HoloClaw, the fleet supervisor, and Brittney.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveSovereignProvider,
  resolveSovereignProviderAsync,
} from '../sovereign-resolver';
import { BrittneyCloudAdapter } from '../adapters/brittney-cloud';
import { LocalLLMAdapter } from '../adapters/local-llm';
import { AnthropicAdapter } from '../adapters/anthropic';
import { OpenAICompatibleAdapter } from '../adapters/openai-compatible';

const ENV_KEYS = [
  'HOLO_LLM_PROVIDER',
  'HOLO_LLM_SERVICE_URL',
  'HOLO_LLM_SERVICE_KEY',
  'HOLO_LLM_MODEL',
  'HOLO_LLM_MAX_TOKENS',
  'HOLO_LLM_TIER',
  'HOLO_LLM_LANE',
  'HOLO_LLM_FLEET_MODEL',
  'HOLO_LLM_FLEET_ORCH_URL',
  'HOLO_LLM_FLEET_RESOLVE_KEY',
  'BRITTNEY_PROVIDER',
  'BRITTNEY_SERVICE_URL',
  'BRITTNEY_API_KEY',
  'BRITTNEY_MODEL',
  'BRITTNEY_MAX_TOKENS',
  'BRITTNEY_TIER',
  'BRITTNEY_LANE',
  'BRITTNEY_FLEET_MODEL',
  'BRITTNEY_FLEET_ORCH_URL',
  'BRITTNEY_FLEET_RESOLVE_KEY',
  'OLLAMA_HOST',
  'OLLAMA_BASE_URL',
  'OLLAMA_URL',
  'ANTHROPIC_API_KEY',
  'XAI_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'FLEET_INFERENCE_KEY',
  'SERVE_INFERENCE_KEY',
  'MCP_ORCHESTRATOR_URL',
  'HOLOSCRIPT_API_KEY',
];

beforeEach(() => {
  for (const k of ENV_KEYS) vi.stubEnv(k, '');
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

  it('falls to BYOK anthropic LAST among sync providers', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const r = resolveSovereignProvider();
    expect(r.providerName).toBe('anthropic');
    expect(r.provider).toBeInstanceOf(AnthropicAdapter);
    expect(r.model).toBe('claude-sonnet-4-6');
  });

  it('falls through anthropic -> xai -> openai by key presence', () => {
    vi.stubEnv('XAI_API_KEY', 'xk-test');
    expect(resolveSovereignProvider().providerName).toBe('xai');
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

  it('throws a sovereign-first message when nothing is configured', () => {
    expect(() => resolveSovereignProvider()).toThrow(/sovereign by default/i);
  });

  it('rejects unknown explicit providers', () => {
    expect(() => resolveSovereignProvider({ explicit: 'gpt5-turbo' })).toThrow(/Unknown/i);
  });
});

describe('resolveSovereignProviderAsync (fleet dynamic-resolve)', () => {
  it('resolves the fleet when the orchestrator reports a warm box', async () => {
    vi.stubEnv('HOLO_LLM_FLEET_MODEL', 'qwen2.5-coder:1.5b');
    vi.stubEnv('FLEET_INFERENCE_KEY', 'fk-test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: 'warm', url: 'http://1.2.3.4:18000' }),
      }))
    );
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('fleet');
    expect(r.provider).toBeInstanceOf(OpenAICompatibleAdapter);
    expect(r.model).toBe('qwen2.5-coder:1.5b');
  });

  it('falls back to the sync chain when the fleet is cold', async () => {
    vi.stubEnv('FLEET_INFERENCE_KEY', 'fk-test');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ status: 'cold' }) }))
    );
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('anthropic');
  });

  it('surfaces the fleet cold error when no fallback is configured', async () => {
    vi.stubEnv('FLEET_INFERENCE_KEY', 'fk-test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    );
    await expect(resolveSovereignProviderAsync()).rejects.toThrow(/cold/i);
  });

  it('skips the fleet entirely when no fleet env is present', async () => {
    vi.stubEnv('OLLAMA_HOST', 'http://box:11434');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('ollama');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('explicit non-fleet provider bypasses fleet even with fleet env present', async () => {
    vi.stubEnv('FLEET_INFERENCE_KEY', 'fk-test');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    vi.stubEnv('HOLO_LLM_PROVIDER', 'anthropic');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await resolveSovereignProviderAsync();
    expect(r.providerName).toBe('anthropic');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
