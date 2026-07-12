/**
 * OpenRouter + xAI Adapter Tests
 *
 * Tests for the OpenRouter and xAI provider adapters.
 * Metadata and config tests only — no real API calls.
 *
 * @version 1.0.0
 */

import { describe, it, expect, vi } from 'vitest';

import { OpenRouterAdapter, OPENROUTER_MODELS } from '../adapters/openrouter';
import { XAIAdapter, XAI_MODELS, XAI_MODEL_CAPABILITIES } from '../adapters/xai';
import {
  LLMProviderError,
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMContextLengthError,
  createOpenRouterProvider,
  createXAIProvider,
} from '../index';

const createChatCompletion = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createChatCompletion } };
  },
}));

// =============================================================================
// OpenRouter Adapter Tests
// =============================================================================

describe('OpenRouterAdapter', () => {
  it('has correct provider name', () => {
    const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });
    expect(adapter.name).toBe('openrouter');
  });

  it('has expected available models', () => {
    const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });
    expect(adapter.models).toContain('anthropic/claude-haiku-4.5');
    expect(adapter.models).toContain('anthropic/claude-sonnet-4');
    expect(adapter.models).toContain('openai/gpt-4o');
    expect(adapter.models).toContain('x-ai/grok-3');
  });

  it('OPENROUTER_MODELS constant is populated', () => {
    expect(OPENROUTER_MODELS.length).toBeGreaterThan(0);
    expect(OPENROUTER_MODELS).toContain('anthropic/claude-sonnet-4');
  });

  it('uses anthropic/claude-sonnet-4 as default HoloScript model', () => {
    const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });
    expect(adapter.defaultHoloScriptModel).toBe('anthropic/claude-sonnet-4');
  });

  it('respects custom defaultModel in config', () => {
    const adapter = new OpenRouterAdapter({
      apiKey: 'test-key',
      defaultModel: 'openai/gpt-4o',
    });
    expect(adapter.defaultHoloScriptModel).toBe('openai/gpt-4o');
  });

  it('sets default referer and title headers', () => {
    const adapter = new OpenRouterAdapter({ apiKey: 'test-key' });
    // The referer and title are private, but we can verify the constructor
    // doesn't throw and the adapter is usable
    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('openrouter');
  });

  it('accepts custom referer and title', () => {
    const adapter = new OpenRouterAdapter({
      apiKey: 'test-key',
      referer: 'https://myapp.com',
      title: 'My App',
    });
    expect(adapter).toBeDefined();
  });

  it('accepts custom baseURL override', () => {
    const adapter = new OpenRouterAdapter({
      apiKey: 'test-key',
      baseURL: 'https://custom-router.example.com/v1',
    });
    expect(adapter).toBeDefined();
  });

  it('inherits retry behavior from BaseLLMAdapter', () => {
    const adapter = new OpenRouterAdapter({ apiKey: 'test-key', maxRetries: 1 });
    // Should not throw on construction; retry behavior tested in base-adapter-retry.test.ts
    expect(adapter).toBeDefined();
  });

  it('forwards required native tools and parses the tool call response', async () => {
    createChatCompletion.mockResolvedValueOnce({
      id: 'generation-test-1',
      model: 'anthropic/claude-haiku-4.5',
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call-plan-1',
                type: 'function',
                function: {
                  name: 'submit_agent_plan',
                  arguments: '{"summary":"One bounded plan"}',
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    });
    const adapter = new OpenRouterAdapter({ apiKey: 'test-key', maxRetries: 0 });
    const signal = new AbortController().signal;

    const response = await adapter.complete(
      {
        messages: [{ role: 'user', content: 'Plan one action.' }],
        maxTokens: 100,
        tools: [
          {
            name: 'submit_agent_plan',
            description: 'Submit one bounded plan',
            input_schema: {
              type: 'object',
              properties: { summary: { type: 'string' } },
              required: ['summary'],
            },
          },
        ],
        provider: {
          openai: { toolChoice: 'required', parallelToolCalls: false },
        },
      },
      'anthropic/claude-haiku-4.5',
      { signal }
    );

    expect(createChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-haiku-4.5',
        tool_choice: 'required',
        parallel_tool_calls: false,
        tools: [
          expect.objectContaining({
            type: 'function',
            function: expect.objectContaining({ name: 'submit_agent_plan' }),
          }),
        ],
      }),
      { signal }
    );
    expect(response.finishReason).toBe('tool_use');
    expect(response.provider).toBe('openrouter');
    expect(response.requestId).toBe('generation-test-1');
    expect(response.toolUses).toEqual([
      {
        type: 'tool_use',
        id: 'call-plan-1',
        name: 'submit_agent_plan',
        input: { summary: 'One bounded plan' },
      },
    ]);
  });

  it('maps OpenAI-compatible error status codes correctly', () => {
    // Verify the error mapping infrastructure exists — actual error
    // creation from API responses is tested via integration.
    const authErr = new LLMAuthenticationError('openrouter');
    expect(authErr.provider).toBe('openrouter');
    expect(authErr.retryable).toBe(false);

    const rateLimitErr = new LLMRateLimitError('openrouter', 5000);
    expect(rateLimitErr.provider).toBe('openrouter');
    expect(rateLimitErr.retryable).toBe(true);
    expect(rateLimitErr.retryAfterMs).toBe(5000);

    const contextErr = new LLMContextLengthError('openrouter', 100000);
    expect(contextErr.provider).toBe('openrouter');
    expect(contextErr.retryable).toBe(false);
  });
});

// =============================================================================
// xAI Adapter Tests
// =============================================================================

describe('XAIAdapter', () => {
  it('has correct provider name', () => {
    const adapter = new XAIAdapter({ apiKey: 'test-key' });
    expect(adapter.name).toBe('xai');
  });

  it('has expected available models', () => {
    const adapter = new XAIAdapter({ apiKey: 'test-key' });
    expect(adapter.models).toContain('grok-4.3');
    expect(adapter.models).toContain('grok-4.5');
    expect(adapter.models).toContain('grok-build-0.1');
    expect(adapter.models).toContain('grok-4.20-0309-reasoning');
    expect(adapter.models).toContain('grok-4.20-0309-non-reasoning');
    expect(adapter.models).toContain('grok-4.20-multi-agent-0309');
  });

  it('XAI_MODELS constant is populated', () => {
    expect(XAI_MODELS.length).toBeGreaterThan(0);
    expect(XAI_MODELS).toContain('grok-4.3');
    expect(XAI_MODELS).toContain('grok-4.5');
    expect(XAI_MODELS).toContain('grok-build-0.1');
    expect(XAI_MODELS).toContain('grok-4.20-0309-reasoning');
  });

  it('uses grok-4.3 as default HoloScript model', () => {
    const adapter = new XAIAdapter({ apiKey: 'test-key' });
    expect(adapter.defaultHoloScriptModel).toBe('grok-4.3');
  });

  it('respects custom defaultModel in config', () => {
    const adapter = new XAIAdapter({
      apiKey: 'test-key',
      defaultModel: 'grok-build-0.1',
    });
    expect(adapter.defaultHoloScriptModel).toBe('grok-build-0.1');
  });

  it('keeps retired Grok 2/3 ids out of the active xAI model set', () => {
    expect(XAI_MODELS).not.toContain('grok-3');
    expect(XAI_MODELS).not.toContain('grok-3-mini');
    expect(XAI_MODELS).not.toContain('grok-2');
    expect(XAI_MODELS).not.toContain('grok-2-mini');
    expect(XAI_MODELS).not.toContain('grok-4-0709');
    expect(XAI_MODELS).not.toContain('grok-4-fast-reasoning');
    expect(XAI_MODELS).not.toContain('grok-4-fast-non-reasoning');
    expect(XAI_MODELS.every((model) => !/^grok-[23]/.test(model))).toBe(true);
  });

  it('declares non-zero model windows and current per-model pricing', () => {
    expect(XAI_MODEL_CAPABILITIES['grok-4.3']).toMatchObject({
      contextWindow: 1_000_000,
      maxOutput: 0,
      longContextThreshold: 200_000,
      costPerMillion: {
        input: 1.25,
        inputLongContext: 2.5,
        cachedInput: 0.2,
        output: 2.5,
      },
      status: 'active',
      lastVerified: '2026-07-10',
    });
    // Launched 2026-07-08; pricing credential-verified 2026-07-10 via
    // /v1/language-models ($2/$6 per MTok, $0.50/M cached input, 2x above
    // the 200K long-context threshold).
    expect(XAI_MODEL_CAPABILITIES['grok-4.5']).toMatchObject({
      contextWindow: 500_000,
      maxOutput: 0,
      longContextThreshold: 200_000,
      costPerMillion: {
        input: 2.0,
        inputLongContext: 4.0,
        cachedInput: 0.5,
        output: 6.0,
      },
      status: 'active',
      lastVerified: '2026-07-10',
    });
    expect(XAI_MODEL_CAPABILITIES['grok-build-0.1']).toMatchObject({
      contextWindow: 256_000,
      maxOutput: 0,
      longContextThreshold: 200_000,
      costPerMillion: {
        input: 1.0,
        inputLongContext: 2.0,
        cachedInput: 0.2,
        output: 2.0,
      },
      status: 'active',
      lastVerified: '2026-07-10',
    });
    expect(XAI_MODEL_CAPABILITIES['grok-4.20-0309-reasoning']).toMatchObject({
      contextWindow: 1_000_000,
      maxOutput: 0,
      longContextThreshold: 200_000,
      costPerMillion: {
        input: 1.25,
        inputLongContext: 2.5,
        cachedInput: 0.2,
        output: 2.5,
      },
      status: 'active',
      lastVerified: '2026-07-10',
    });
    for (const model of XAI_MODELS) {
      expect(XAI_MODEL_CAPABILITIES[model].contextWindow).toBeGreaterThan(0);
      // maxOutput is 0 for models where xAI has not published a hard cap;
      // we only assert it's non-negative (0 = "not published").
      expect(XAI_MODEL_CAPABILITIES[model].maxOutput).toBeGreaterThanOrEqual(0);
    }
  });

  it('accepts custom baseURL override', () => {
    const adapter = new XAIAdapter({
      apiKey: 'test-key',
      baseURL: 'https://custom-xai.example.com/v1',
    });
    expect(adapter).toBeDefined();
  });

  it('inherits retry behavior from BaseLLMAdapter', () => {
    const adapter = new XAIAdapter({ apiKey: 'test-key', maxRetries: 1 });
    expect(adapter).toBeDefined();
  });

  it('maps error status codes correctly', () => {
    const authErr = new LLMAuthenticationError('xai');
    expect(authErr.provider).toBe('xai');
    expect(authErr.retryable).toBe(false);

    const rateLimitErr = new LLMRateLimitError('xai');
    expect(rateLimitErr.provider).toBe('xai');
    expect(rateLimitErr.retryable).toBe(true);
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createOpenRouterProvider', () => {
  it('throws when no API key is available', () => {
    const originalEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      expect(() => createOpenRouterProvider()).toThrow('OpenRouter API key required');
    } finally {
      process.env.OPENROUTER_API_KEY = originalEnv;
    }
  });

  it('creates adapter from env var', () => {
    const originalEnv = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    try {
      const adapter = createOpenRouterProvider();
      expect(adapter.name).toBe('openrouter');
      expect(adapter.defaultHoloScriptModel).toBe('anthropic/claude-sonnet-4');
    } finally {
      process.env.OPENROUTER_API_KEY = originalEnv;
    }
  });

  it('creates adapter with custom config', () => {
    const adapter = createOpenRouterProvider({
      apiKey: 'direct-key',
      defaultModel: 'openai/gpt-4o',
      referer: 'https://custom.app',
      title: 'Custom App',
    });
    expect(adapter.name).toBe('openrouter');
    expect(adapter.defaultHoloScriptModel).toBe('openai/gpt-4o');
  });
});

describe('createXAIProvider', () => {
  it('throws when no API key is available', () => {
    const originalEnv = process.env.XAI_API_KEY;
    delete process.env.XAI_API_KEY;
    try {
      expect(() => createXAIProvider()).toThrow('xAI API key required');
    } finally {
      process.env.XAI_API_KEY = originalEnv;
    }
  });

  it('creates adapter from env var', () => {
    const originalEnv = process.env.XAI_API_KEY;
    process.env.XAI_API_KEY = 'test-xai-key';
    try {
      const adapter = createXAIProvider();
      expect(adapter.name).toBe('xai');
      expect(adapter.defaultHoloScriptModel).toBe('grok-4.3');
    } finally {
      process.env.XAI_API_KEY = originalEnv;
    }
  });

  it('creates adapter with custom config', () => {
    const adapter = createXAIProvider({
      apiKey: 'direct-key',
      defaultModel: 'grok-build-0.1',
    });
    expect(adapter.name).toBe('xai');
    expect(adapter.defaultHoloScriptModel).toBe('grok-build-0.1');
  });
});
