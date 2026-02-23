/**
 * LocalLLMTrait.test.ts — v4.0
 * Tests aligned with the actual LocalLLMTrait API.
 *
 * Key API facts:
 *  - onAttach calls fetch(modelsEndpoint) -> emits 'llm_model_loaded' or 'llm_error'
 *  - Events: llm_prompt / llm_chat -> emits llm_started, llm_complete (or llm_token stream)
 *  - llm_switch_model -> changes activeModel, emits llm_model_loaded
 *  - llm_list_models -> emits llm_models_listed
 *  - llm_cancel -> emits llm_cancelled
 *  - onDetach -> emits llm_stopped
 *  - Config: { model, backend: 'ollama'|'lmstudio'|'llamacpp'|'openai', base_url, temperature, max_tokens, stream, system_prompt, ... }
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { localLLMHandler } from '../LocalLLMTrait';
import type { LocalLLMConfig } from '../LocalLLMTrait';

function makeCtx() {
  const events: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => events.push({ type, payload }),
    events,
    of: (type: string) => events.filter(e => e.type === type),
  };
}

const BASE_CONFIG: LocalLLMConfig = {
  backend: 'ollama',
  base_url: 'http://localhost:11434',
  model: 'llama3',
  temperature: 0.7,
  max_tokens: 2048,
  stream: false,
  context_length: 4096,
  system_prompt: 'You are a helpful spatial AI agent.',
  timeout_ms: 30000,
  fallback_to_remote: false,
  fallback_model: 'gpt-4o-mini',
  fallback_api_key: '',
};

const MODELS_RESPONSE = { ok: true, json: async () => ({ models: [{ name: 'llama3' }, { name: 'gemma2' }] }), body: null };
const CHAT_RESPONSE   = { ok: true, json: async () => ({ message: { content: 'Hello, spatial world!' }, eval_count: 42 }), body: null };

/** Attach using a mocked models endpoint, then restore the spy. */
async function attach(extra: Partial<LocalLLMConfig> = {}) {
  const node = {} as any;
  const ctx = makeCtx();
  const config = { ...BASE_CONFIG, ...extra };
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(MODELS_RESPONSE as any);
  await localLLMHandler.onAttach(node, config, ctx);
  spy.mockRestore();
  return { node, ctx, config };
}

// --- onAttach ----------------------------------------------------------------

describe('LocalLLMTrait - onAttach', () => {
  it('emits llm_model_loaded on successful attach', async () => {
    const { ctx } = await attach();
    expect(ctx.of('llm_model_loaded').length).toBe(1);
  });

  it('reports backend and model in llm_model_loaded', async () => {
    const { ctx } = await attach();
    const loaded = ctx.of('llm_model_loaded')[0].payload as any;
    expect(loaded.backend).toBe('ollama');
    expect(loaded.model).toBe('llama3');
  });

  it('populates availableModels from endpoint', async () => {
    const { node } = await attach();
    expect(node.__localLLMState.availableModels).toContain('llama3');
    expect(node.__localLLMState.availableModels).toContain('gemma2');
  });

  it('initializes state with zero counters', async () => {
    const { node } = await attach();
    const s = node.__localLLMState;
    expect(s.totalTokens).toBe(0);
    expect(s.totalRequests).toBe(0);
    expect(s.isReady).toBe(true);
  });

  it('emits llm_error when local server unreachable (no fallback)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const node = {} as any;
    const ctx = makeCtx();
    await localLLMHandler.onAttach(node, BASE_CONFIG, ctx);
    expect(ctx.of('llm_error').length).toBe(1);
    fetchSpy.mockRestore();
  });

  it('emits llm_model_loaded with fallback=true when fallback configured and local fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const node = {} as any;
    const ctx = makeCtx();
    await localLLMHandler.onAttach(node, { ...BASE_CONFIG, fallback_to_remote: true, fallback_api_key: 'sk-xxx' }, ctx);
    const loaded = ctx.of('llm_model_loaded')[0]?.payload as any;
    expect(loaded?.fallback).toBe(true);
    fetchSpy.mockRestore();
  });
});

// --- llm_prompt (mocked fetch) -----------------------------------------------
//
// Strategy: use mockResolvedValueOnce to handle:
//   [0] models endpoint call from onAttach
//   [1+] chat completion calls from _exec
//
describe('LocalLLMTrait - llm_prompt (mocked fetch)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let node: any, ctx: any, config: LocalLLMConfig;

  beforeEach(async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(MODELS_RESPONSE as any)
      .mockResolvedValue(CHAT_RESPONSE as any);

    node = {} as any;
    ctx = makeCtx();
    config = { ...BASE_CONFIG };
    await localLLMHandler.onAttach(node, config, ctx);
    ctx.events.length = 0; // clear attach events
  });

  afterEach(() => fetchSpy.mockRestore());

  it('emits llm_started synchronously', () => {
    localLLMHandler.onEvent(node, config, ctx, { type: 'llm_prompt', payload: { prompt: 'Create a neon forest scene', requestId: 'req1' } });
    expect(ctx.of('llm_started').length).toBe(1);
    expect((ctx.of('llm_started')[0].payload as any).requestId).toBe('req1');
  });

  it('emits llm_complete with response text', async () => {
    localLLMHandler.onEvent(node, config, ctx, { type: 'llm_prompt', payload: { prompt: 'Make a VR city', requestId: 'req2' } });
    await new Promise(r => setTimeout(r, 200));
    const complete = ctx.of('llm_complete');
    expect(complete.length).toBe(1);
    const r = complete[0].payload as any;
    expect(r.requestId).toBe('req2');
    expect(typeof r.text).toBe('string');
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('includes duration_ms and tokens in llm_complete', async () => {
    localLLMHandler.onEvent(node, config, ctx, { type: 'llm_prompt', payload: { prompt: 'Test', requestId: 'req3' } });
    await new Promise(r => setTimeout(r, 200));
    const r = ctx.of('llm_complete')[0].payload as any;
    expect(typeof r.duration_ms).toBe('number');
    expect(typeof r.tokens).toBe('number');
    expect(r.tokens).toBe(42);
  });

  it('uses system_prompt in request body', async () => {
    localLLMHandler.onEvent(node, config, ctx, { type: 'llm_prompt', payload: { prompt: 'Hi' } });
    await new Promise(r => setTimeout(r, 100));
    // calls[0] = models endpoint (from onAttach), calls[1] = chat endpoint
    const chatCall = fetchSpy.mock.calls[1];
    const body = JSON.parse((chatCall[1] as any).body);
    const sysMsg = body.messages.find((m: any) => m.role === 'system');
    expect(sysMsg?.content).toBe('You are a helpful spatial AI agent.');
  });

  it('increments totalRequests', async () => {
    localLLMHandler.onEvent(node, config, ctx, { type: 'llm_prompt', payload: { prompt: 'a' } });
    localLLMHandler.onEvent(node, config, ctx, { type: 'llm_prompt', payload: { prompt: 'b' } });
    await new Promise(r => setTimeout(r, 300));
    expect(node.__localLLMState.totalRequests).toBe(2);
  });
});

// --- Error handling ----------------------------------------------------------

describe('LocalLLMTrait - error handling', () => {
  it('emits llm_error on network failure during chat', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(MODELS_RESPONSE as any)
      .mockRejectedValue(new Error('Connection refused'));
    const node = {} as any;
    const ctx = makeCtx();
    const config = { ...BASE_CONFIG };
    await localLLMHandler.onAttach(node, config, ctx);
    localLLMHandler.onEvent(node, config, ctx, { type: 'llm_prompt', payload: { prompt: 'crash', requestId: 'err1' } });
    await new Promise(r => setTimeout(r, 200));
    const errs = ctx.of('llm_error').filter((e: any) => e.payload?.requestId === 'err1');
    expect(errs.length).toBe(1);
    fetchSpy.mockRestore();
  });

  it('emits llm_error on non-OK HTTP status (503)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(MODELS_RESPONSE as any)
      .mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable', body: null } as any);
    const node = {} as any;
    const ctx = makeCtx();
    const config = { ...BASE_CONFIG };
    await localLLMHandler.onAttach(node, config, ctx);
    localLLMHandler.onEvent(node, config, ctx, { type: 'llm_prompt', payload: { prompt: 'fail', requestId: 'err2' } });
    await new Promise(r => setTimeout(r, 200));
    const errs = ctx.of('llm_error').filter((e: any) => e.payload?.requestId === 'err2');
    expect(errs.length).toBe(1);
    expect((errs[0].payload as any).error).toContain('503');
    fetchSpy.mockRestore();
  });

  it('ignores llm_chat event without messages', async () => {
    const { node, ctx, config } = await attach();
    localLLMHandler.onEvent(node, config, ctx, { type: 'llm_chat', payload: { messages: [] } });
    expect(ctx.of('llm_started').length).toBe(0);
  });
});

// --- llm_switch_model --------------------------------------------------------

describe('LocalLLMTrait - llm_switch_model', () => {
  it('changes activeModel and emits llm_model_loaded', async () => {
    const { node, ctx, config } = await attach();
    localLLMHandler.onEvent(node, config, ctx, { type: 'llm_switch_model', payload: { model: 'gemma2' } });
    expect(node.__localLLMState.activeModel).toBe('gemma2');
    const reloads = ctx.of('llm_model_loaded');
    const changed = reloads.find((e: any) => e.payload?.model === 'gemma2');
    expect(changed).toBeDefined();
  });
});

// --- llm_list_models ---------------------------------------------------------

describe('LocalLLMTrait - llm_list_models', () => {
  it('emits llm_models_listed with available models', async () => {
    const { node, ctx, config } = await attach();
    localLLMHandler.onEvent(node, config, ctx, { type: 'llm_list_models' });
    const listed = ctx.of('llm_models_listed');
    expect(listed.length).toBe(1);
    expect((listed[0].payload as any).models).toContain('llama3');
  });
});

// --- Backend variants --------------------------------------------------------

describe('LocalLLMTrait - backend variants', () => {
  it('supports lmstudio backend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'mistral' }] }),
      body: null,
    } as any);
    const node = {} as any;
    const ctx = makeCtx();
    await localLLMHandler.onAttach(node, { ...BASE_CONFIG, backend: 'lmstudio', base_url: 'http://localhost:1234' }, ctx);
    const loaded = ctx.of('llm_model_loaded')[0]?.payload as any;
    expect(loaded?.backend).toBe('lmstudio');
    fetchSpy.mockRestore();
  });

  it('supports llamacpp backend', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'llama3.1' }] }),
      body: null,
    } as any);
    const node = {} as any;
    const ctx = makeCtx();
    await localLLMHandler.onAttach(node, { ...BASE_CONFIG, backend: 'llamacpp', base_url: 'http://localhost:8080' }, ctx);
    const loaded = ctx.of('llm_model_loaded')[0]?.payload as any;
    expect(loaded?.backend).toBe('llamacpp');
    fetchSpy.mockRestore();
  });
});

// --- onDetach ----------------------------------------------------------------

describe('LocalLLMTrait - onDetach', () => {
  it('emits llm_stopped and clears state', async () => {
    const { node, ctx, config } = await attach();
    localLLMHandler.onDetach(node, config, ctx);
    expect(ctx.of('llm_stopped').length).toBe(1);
    expect(node.__localLLMState).toBeUndefined();
  });
});
