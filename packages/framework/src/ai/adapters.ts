/**
 * @holoscript/core - Built-in AI Adapters
 *
 * Ready-to-use adapters for popular AI providers.
 * Users just need to provide their API key.
 *
 * Migrated (B1b): callAPI methods now delegate to @holoscript/llm-provider
 * adapters which inherit withRetry from BaseLLMAdapter — exponential
 * backoff + Retry-After honoring on 429/5xx.
 */

import type {
  AIAdapter,
  GenerateResult,
  ExplainResult,
  OptimizeResult,
  FixResult,
  GenerateOptions,
} from './AIAdapter';
import {
  AnthropicAdapter as LLMAnthropicAdapter,
  OpenAIAdapter as LLMOpenAIAdapter,
  OpenRouterAdapter as LLMOpenRouterAdapter,
  XAIAdapter as LLMXAIAdapter,
  GeminiAdapter as LLMGeminiAdapter,
  LocalLLMAdapter as LLMOllamaAdapter,
} from '@holoscript/llm-provider';
/** Shape of API error responses from AI providers. */
interface APIErrorResponse {
  error?: { message?: string };
}

export type {
  AIAdapter,
  GenerateResult,
  ExplainResult,
  OptimizeResult,
  FixResult,
  GenerateOptions,
};

// ============================================================================
// System Prompt for HoloScript Generation
// ============================================================================

const HOLOSCRIPT_SYSTEM_PROMPT = `You are a HoloScript expert. HoloScript is a visual flow language for VR/AR world creation.

Generate valid HoloScript code following this syntax:

COMPOSITIONS:
composition "Scene Name" {
  environment { skybox: "sky_day", ambient: 0.5 }

  template "ObjectType" {
    state { property: value }
    action doSomething() { }
  }

  spatial_group "GroupName" {
    object "Object1" { position: [x, y, z] }
    object "Object2" using "ObjectType" { position: [x, y, z] }
  }

  logic {
    on_event { action() }
    every(1000) { periodic_action() }
  }
}

SHAPES: cube, sphere, cylinder, cone, plane, torus, capsule, pyramid, prism, hexagon, octahedron, icosahedron, ring, tube, spiral, stairs, arch, dome, wedge, ramp

TRAITS: @grabbable, @throwable, @hoverable, @interactive, @collidable, @animatable, @networked

RULES:
1. Use descriptive object names
2. Position objects logically in 3D space (y is up)
3. Include templates for reusable objects
4. Add logic for interactivity
5. Output ONLY valid HoloScript code, no explanations unless asked`;

// ============================================================================
// OpenAI Adapter
// ============================================================================

export interface OpenAIAdapterConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
}

export class OpenAIAdapter implements AIAdapter {
  readonly id = 'openai';
  readonly name = 'OpenAI';

  private config: OpenAIAdapterConfig;
  private model: string;

  constructor(config: OpenAIAdapterConfig) {
    this.config = config;
    this.model = config.model || 'gpt-4o-mini';
  }

  isReady(): boolean {
    return !!this.config.apiKey;
  }

  async generateHoloScript(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    const systemPrompt = this.buildSystemPrompt(options);
    const response = await this.chat('Create a HoloScript scene: ' + prompt, undefined, [
      { role: 'assistant', content: systemPrompt },
    ]);

    return {
      holoScript: this.extractCode(response),
      confidence: 0.85,
    };
  }

  async explainHoloScript(holoScript: string): Promise<ExplainResult> {
    const response = await this.callAPI([
      {
        role: 'system',
        content: 'You are a HoloScript expert. Explain the following code clearly.',
      },
      { role: 'user', content: 'Explain this HoloScript:\n\n' + holoScript },
    ]);

    return { explanation: response };
  }

  async optimizeHoloScript(
    holoScript: string,
    target: 'mobile' | 'desktop' | 'vr' | 'ar'
  ): Promise<OptimizeResult> {
    const response = await this.callAPI([
      {
        role: 'system',
        content:
          'You are a HoloScript optimizer. Optimize for ' +
          target +
          ' platform. Return only the optimized code.',
      },
      { role: 'user', content: holoScript },
    ]);

    return {
      holoScript: this.extractCode(response),
      improvements: ['Optimized for ' + target],
    };
  }

  async fixHoloScript(holoScript: string, errors: string[]): Promise<FixResult> {
    const response = await this.callAPI([
      {
        role: 'system',
        content: 'You are a HoloScript debugger. Fix the errors and return corrected code.',
      },
      {
        role: 'user',
        content: 'Fix these errors:\n' + errors.join('\n') + '\n\nCode:\n' + holoScript,
      },
    ]);

    return {
      holoScript: this.extractCode(response),
      fixes: errors.map((e) => ({ line: 0, issue: e, fix: 'auto-fixed' })),
    };
  }

  async chat(
    message: string,
    holoScript?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
    ];

    if (history) {
      messages.push(...history);
    }

    if (holoScript) {
      messages.push({
        role: 'user',
        content: 'Context (current code):\n' + holoScript + '\n\nQuestion: ' + message,
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    return this.callAPI(messages, history);
  }

  private buildSystemPrompt(options?: GenerateOptions): string {
    let prompt = HOLOSCRIPT_SYSTEM_PROMPT;
    if (options?.style) prompt += '\nStyle: ' + options.style;
    if (options?.complexity) prompt += '\nComplexity: ' + options.complexity;
    if (options?.targetPlatform) prompt += '\nOptimize for: ' + options.targetPlatform;
    return prompt;
  }

  private extractCode(response: string): string {
    // Extract code from markdown code blocks
    const match = response.match(/```(?:holoscript|holo)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : response.trim();
  }

  private async callAPI(
    messages: Array<{ role: string; content: string }>,
    _history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    // Delegate to @holoscript/llm-provider OpenAIAdapter which wraps
    // the call with withRetry — exponential backoff on 429/5xx + Retry-After.
    const adapter = new LLMOpenAIAdapter({
      apiKey: this.config.apiKey,
      defaultModel: this.model,
      ...(this.config.baseUrl && { baseURL: this.config.baseUrl }),
      ...(this.config.organization && { organization: this.config.organization }),
    });
    const result = await adapter.complete({
      messages: messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
      maxTokens: 4096,
      temperature: 0.7,
    });
    return result.content;
  }

  async getEmbeddings(text: string | string[]): Promise<number[][]> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const inputs = Array.isArray(text) ? text : [text];

    const response = await fetch(baseUrl + '/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + this.config.apiKey,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: inputs,
      }),
    });

    if (!response.ok) {
      throw new Error('OpenAI Embeddings API error: ' + response.statusText);
    }

    const data = await response.json();
    return data.data.map((item: { embedding: number[] }) => item.embedding);
  }
}

// ============================================================================
// Anthropic (Claude) Adapter
// ============================================================================

export interface AnthropicAdapterConfig {
  apiKey: string;
  model?: string;
}

export class AnthropicAdapter implements AIAdapter {
  readonly id = 'anthropic';
  readonly name = 'Anthropic Claude';

  private config: AnthropicAdapterConfig;
  private model: string;

  constructor(config: AnthropicAdapterConfig) {
    this.config = config;
    // Default to Opus 4.7 — most capable Claude. Callers override per-instance.
    // NEVER silently downgrade for cost. Retired models removed per
    // docs/strategy/claude-api-migration-checklist.md.
    this.model = config.model || 'claude-opus-4-7';
  }

  isReady(): boolean {
    return !!this.config.apiKey;
  }

  async generateHoloScript(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: 'Create a HoloScript scene: ' + prompt },
    ];
    const response = await this.callAPI(messages, options);

    return {
      holoScript: this.extractCode(response),
      confidence: 0.85,
    };
  }

  async explainHoloScript(holoScript: string): Promise<ExplainResult> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: 'Explain this HoloScript code clearly:\n\n' + holoScript },
    ];
    const response = await this.callAPI(messages);
    return { explanation: response };
  }

  async optimizeHoloScript(
    holoScript: string,
    target: 'mobile' | 'desktop' | 'vr' | 'ar'
  ): Promise<OptimizeResult> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      {
        role: 'user',
        content:
          'Optimize this HoloScript for ' +
          target +
          '. Return only the optimized code:\n\n' +
          holoScript,
      },
    ];
    const response = await this.callAPI(messages);
    return {
      holoScript: this.extractCode(response),
      improvements: ['Optimized for ' + target],
    };
  }

  async fixHoloScript(holoScript: string, errors: string[]): Promise<FixResult> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      {
        role: 'user',
        content:
          'Fix these errors in the HoloScript:\nErrors: ' +
          errors.join(', ') +
          '\n\nCode:\n' +
          holoScript,
      },
    ];
    const response = await this.callAPI(messages);
    return {
      holoScript: this.extractCode(response),
      fixes: errors.map((e) => ({ line: 0, issue: e, fix: 'auto-fixed' })),
    };
  }

  async chat(
    message: string,
    holoScript?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = history
      ? [...history]
      : [];

    if (holoScript) {
      messages.push({
        role: 'user',
        content: 'Context:\n' + holoScript + '\n\nQuestion: ' + message,
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    return this.callAPI(messages);
  }

  private extractCode(response: string): string {
    const match = response.match(/```(?:holoscript|holo)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : response.trim();
  }

  private async callAPI(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    _options?: GenerateOptions
  ): Promise<string> {
    // Delegate to @holoscript/llm-provider AnthropicAdapter (withRetry on 429/5xx).
    const adapter = new LLMAnthropicAdapter({
      apiKey: this.config.apiKey,
      defaultModel: this.model,
    });
    const result = await adapter.complete({
      messages: [
        { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
        ...messages,
      ],
      maxTokens: 4096,
    });
    return result.content;
  }

  async getEmbeddings(text: string | string[]): Promise<number[][]> {
    // Anthropic doesn't have native embeddings API yet, return mock for compatibility
    const inputs = Array.isArray(text) ? text : [text];
    return inputs.map((_) =>
      Array(1024)
        .fill(0.5)
        .map(() => Math.random())
    );
  }
}

// ============================================================================
// Ollama (Local) Adapter
// ============================================================================

export interface OllamaAdapterConfig {
  baseUrl?: string;
  model?: string;
}

export class OllamaAdapter implements AIAdapter {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local)';

  private baseUrl: string;
  private model: string;

  constructor(config: OllamaAdapterConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'brittney-qwen-v23:latest';
  }

  async isReady(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl + '/api/tags');
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateHoloScript(prompt: string, _options?: GenerateOptions): Promise<GenerateResult> {
    const response = await this.callAPI(
      HOLOSCRIPT_SYSTEM_PROMPT,
      'Create a HoloScript scene: ' + prompt
    );

    return {
      holoScript: this.extractCode(response),
      confidence: 0.75,
    };
  }

  async explainHoloScript(holoScript: string): Promise<ExplainResult> {
    const response = await this.callAPI(
      'You are a HoloScript expert. Explain code clearly.',
      'Explain this HoloScript:\n\n' + holoScript
    );
    return { explanation: response };
  }

  async optimizeHoloScript(
    holoScript: string,
    target: 'mobile' | 'desktop' | 'vr' | 'ar'
  ): Promise<OptimizeResult> {
    const response = await this.callAPI(
      'You are a HoloScript optimizer. Optimize for ' + target + '.',
      holoScript
    );
    return {
      holoScript: this.extractCode(response),
      improvements: ['Optimized for ' + target],
    };
  }

  async fixHoloScript(holoScript: string, errors: string[]): Promise<FixResult> {
    const response = await this.callAPI(
      'You are a HoloScript debugger. Fix errors and return corrected code.',
      'Errors: ' + errors.join(', ') + '\n\nCode:\n' + holoScript
    );
    return {
      holoScript: this.extractCode(response),
      fixes: errors.map((e) => ({ line: 0, issue: e, fix: 'auto-fixed' })),
    };
  }

  async chat(
    message: string,
    holoScript?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    // Ollama doesn't support multi-turn natively, but log history for context
    if (history && history.length > 0) {
      const contextMsg = history.map((h) => h.role + ': ' + h.content.slice(0, 100)).join('\n');
      const fullMessage = holoScript
        ? 'History:\n' + contextMsg + '\n\nContext:\n' + holoScript + '\n\nQuestion: ' + message
        : 'History:\n' + contextMsg + '\n\nQuestion: ' + message;
      return this.callAPI(HOLOSCRIPT_SYSTEM_PROMPT, fullMessage);
    }
    const fullMessage = holoScript
      ? 'Context:\n' + holoScript + '\n\nQuestion: ' + message
      : message;
    return this.callAPI(HOLOSCRIPT_SYSTEM_PROMPT, fullMessage);
  }

  private async callAPIWithErrorHandling(apiPath: string, body: RequestInit): Promise<Response> {
    // For Ollama's /api/generate and /api/embeddings endpoints, we still
    // use raw fetch since LocalLLMAdapter's complete() handles /chat/completions
    // but Ollama's native /api/generate endpoint is different. Keep retry
    // delegation for the chat path (callAPI below) and leave this helper
    // for the non-chat paths that LocalLLMAdapter doesn't cover.
    const response = await fetch(this.baseUrl + apiPath, body);

    if (response.status === 429) {
      throw new Error('Ollama rate limited (429) - model may be busy');
    }
    if (response.status === 503) {
      throw new Error('Ollama service unavailable - ensure service is running');
    }
    if (!response.ok) {
      throw new Error('Ollama API error: ' + response.statusText);
    }

    return response;
  }

  private extractCode(response: string): string {
    const match = response.match(/```(?:holoscript|holo)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : response.trim();
  }

  private async callAPI(system: string, prompt: string): Promise<string> {
    // Delegate to @holoscript/llm-provider LocalLLMAdapter (withRetry on 429/5xx).
    const adapter = new LLMOllamaAdapter({
      baseURL: this.baseUrl,
      defaultModel: this.model,
      timeoutMs: 120_000,
    });
    const result = await adapter.complete({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4096,
      temperature: 0.7,
    });
    return result.content;
  }

  async getEmbeddings(text: string | string[]): Promise<number[][]> {
    const inputs = Array.isArray(text) ? text : [text];
    const results: number[][] = [];

    for (const input of inputs) {
      const response = await fetch(this.baseUrl + '/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: input,
        }),
      });

      if (!response.ok) {
        throw new Error('Ollama Embeddings API error: ' + response.statusText);
      }

      const data = await response.json();
      results.push(data.embedding);
    }

    return results;
  }
}

// ============================================================================
// LM Studio Adapter (OpenAI-compatible local)
// ============================================================================

export interface LMStudioAdapterConfig {
  baseUrl?: string;
  model?: string;
}

/**
 * LM Studio adapter - uses OpenAI-compatible API running locally
 */
export class LMStudioAdapter implements AIAdapter {
  readonly id = 'lmstudio';
  readonly name = 'LM Studio (Local)';

  private openaiAdapter: OpenAIAdapter;

  constructor(config: LMStudioAdapterConfig = {}) {
    this.openaiAdapter = new OpenAIAdapter({
      apiKey: 'lm-studio', // LM Studio doesn't require an API key
      baseUrl: config.baseUrl || 'http://localhost:1234/v1',
      model: config.model || 'local-model',
    });
  }

  isReady(): boolean {
    return true; // Assume ready, will fail gracefully if not running
  }

  generateHoloScript(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    return this.openaiAdapter.generateHoloScript(prompt, options);
  }

  explainHoloScript(holoScript: string): Promise<ExplainResult> {
    return this.openaiAdapter.explainHoloScript(holoScript);
  }

  optimizeHoloScript(
    holoScript: string,
    target: 'mobile' | 'desktop' | 'vr' | 'ar'
  ): Promise<OptimizeResult> {
    return this.openaiAdapter.optimizeHoloScript(holoScript, target);
  }

  fixHoloScript(holoScript: string, errors: string[]): Promise<FixResult> {
    return this.openaiAdapter.fixHoloScript(holoScript, errors);
  }

  chat(
    message: string,
    holoScript?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    return this.openaiAdapter.chat(message, holoScript, history);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

import { registerAIAdapter } from './AIAdapter';

/**
 * Create and register an OpenAI adapter
 */
export function useOpenAI(config: OpenAIAdapterConfig): OpenAIAdapter {
  const adapter = new OpenAIAdapter(config);
  registerAIAdapter(adapter, true);
  return adapter;
}

/**
 * Create and register an Anthropic adapter
 */
export function useAnthropic(config: AnthropicAdapterConfig): AnthropicAdapter {
  const adapter = new AnthropicAdapter(config);
  registerAIAdapter(adapter, true);
  return adapter;
}

/**
 * Create and register an Ollama adapter (local)
 */
export function useOllama(config: OllamaAdapterConfig = {}): OllamaAdapter {
  const adapter = new OllamaAdapter(config);
  registerAIAdapter(adapter, true);
  return adapter;
}

/**
 * Create and register an LM Studio adapter (local)
 */
export function useLMStudio(config: LMStudioAdapterConfig = {}): LMStudioAdapter {
  const adapter = new LMStudioAdapter(config);
  registerAIAdapter(adapter, true);
  return adapter;
}

// ============================================================================
// Google Gemini Adapter
// ============================================================================

export interface GeminiAdapterConfig {
  apiKey: string;
  model?: string;
  /** Embedding model (default: text-embedding-004) */
  embeddingModel?: string;
}

export class GeminiAdapter implements AIAdapter {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';

  private config: GeminiAdapterConfig;
  private model: string;
  private embeddingModel: string;

  constructor(config: GeminiAdapterConfig) {
    this.config = config;
    this.model = config.model || 'gemini-2.0-flash';
    this.embeddingModel = config.embeddingModel || 'text-embedding-004';
  }

  isReady(): boolean {
    return !!this.config.apiKey;
  }

  async generateHoloScript(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    const response = await this.callAPI('Create a HoloScript scene: ' + prompt, options);

    return {
      holoScript: this.extractCode(response),
      confidence: 0.85,
    };
  }

  async explainHoloScript(holoScript: string): Promise<ExplainResult> {
    const response = await this.callAPI('Explain this HoloScript code clearly:\n\n' + holoScript);
    return { explanation: response };
  }

  async optimizeHoloScript(
    holoScript: string,
    target: 'mobile' | 'desktop' | 'vr' | 'ar'
  ): Promise<OptimizeResult> {
    const response = await this.callAPI(
      'Optimize this HoloScript for ' +
        target +
        '. Return only the optimized code:\n\n' +
        holoScript
    );
    return {
      holoScript: this.extractCode(response),
      improvements: ['Optimized for ' + target],
    };
  }

  async fixHoloScript(holoScript: string, errors: string[]): Promise<FixResult> {
    const response = await this.callAPI(
      'Fix these errors in the HoloScript:\nErrors: ' +
        errors.join(', ') +
        '\n\nCode:\n' +
        holoScript
    );
    return {
      holoScript: this.extractCode(response),
      fixes: errors.map((e) => ({ line: 0, issue: e, fix: 'auto-fixed' })),
    };
  }

  async chat(
    message: string,
    holoScript?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const fullMessage = holoScript
      ? 'Context:\n' + holoScript + '\n\nQuestion: ' + message
      : message;
    return this.callAPI(fullMessage, undefined, history);
  }

  async getEmbeddings(text: string | string[]): Promise<number[][]> {
    const inputs = Array.isArray(text) ? text : [text];
    const results: number[][] = [];

    for (const input of inputs) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.embeddingModel}:embedContent?key=${this.config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${this.embeddingModel}`,
            content: { parts: [{ text: input }] },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = (errorData as APIErrorResponse)?.error?.message || response.statusText;
        throw new Error('Gemini Embeddings API error: ' + errorMsg);
      }

      const data = await response.json();
      results.push(data.embedding.values);
    }

    return results;
  }

  private extractCode(response: string): string {
    const match = response.match(/```(?:holoscript|holo)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : response.trim();
  }

  private async callAPI(
    message: string,
    _options?: GenerateOptions,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    // Delegate to @holoscript/llm-provider GeminiAdapter (withRetry on 429/5xx).
    const adapter = new LLMGeminiAdapter({
      apiKey: this.config.apiKey,
      defaultModel: this.model,
    });
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
    ];
    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: message });
    const result = await adapter.complete({
      messages,
      maxTokens: 4096,
      temperature: 0.7,
    });
    return result.content;
  }
}

// ============================================================================
// XAI (Grok) Adapter
// ============================================================================

export interface XAIAdapterConfig {
  apiKey: string;
  model?: string;
}

export class XAIAdapter implements AIAdapter {
  readonly id = 'xai';
  readonly name = 'xAI Grok';

  private config: XAIAdapterConfig;
  private model: string;

  constructor(config: XAIAdapterConfig) {
    this.config = config;
    this.model = config.model || 'grok-3';
  }

  isReady(): boolean {
    return !!this.config.apiKey;
  }

  async generateHoloScript(prompt: string, _options?: GenerateOptions): Promise<GenerateResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      { role: 'user', content: 'Create a HoloScript scene: ' + prompt },
    ];
    const response = await this.callAPI(messages);

    return {
      holoScript: this.extractCode(response),
      confidence: 0.85,
    };
  }

  async explainHoloScript(holoScript: string): Promise<ExplainResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      { role: 'user', content: 'Explain this HoloScript code clearly:\n\n' + holoScript },
    ];
    const response = await this.callAPI(messages);
    return { explanation: response };
  }

  async optimizeHoloScript(
    holoScript: string,
    target: 'mobile' | 'desktop' | 'vr' | 'ar'
  ): Promise<OptimizeResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          'Optimize this HoloScript for ' +
          target +
          '. Return only the optimized code:\n\n' +
          holoScript,
      },
    ];
    const response = await this.callAPI(messages);
    return {
      holoScript: this.extractCode(response),
      improvements: ['Optimized for ' + target],
    };
  }

  async fixHoloScript(holoScript: string, errors: string[]): Promise<FixResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          'Fix these errors in the HoloScript:\nErrors: ' +
          errors.join(', ') +
          '\n\nCode:\n' +
          holoScript,
      },
    ];
    const response = await this.callAPI(messages);
    return {
      holoScript: this.extractCode(response),
      fixes: errors.map((e) => ({ line: 0, issue: e, fix: 'auto-fixed' })),
    };
  }

  async chat(
    message: string,
    holoScript?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
    ];

    if (history) {
      messages.push(...history);
    }

    if (holoScript) {
      messages.push({
        role: 'user',
        content: 'Context:\n' + holoScript + '\n\nQuestion: ' + message,
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    return this.callAPI(messages);
  }

  private extractCode(response: string): string {
    const match = response.match(/```(?:holoscript|holo)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : response.trim();
  }

  private async callAPI(messages: Array<{ role: string; content: string }>): Promise<string> {
    // Delegate to @holoscript/llm-provider XAIAdapter (withRetry on 429/5xx).
    const adapter = new LLMXAIAdapter({
      apiKey: this.config.apiKey,
      defaultModel: this.model,
    });
    const result = await adapter.complete({
      messages: messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
      maxTokens: 4096,
      temperature: 0.7,
    });
    return result.content;
  }
}

// ============================================================================
// Together AI Adapter
// ============================================================================

export interface TogetherAdapterConfig {
  apiKey: string;
  model?: string;
}

export class TogetherAdapter implements AIAdapter {
  readonly id = 'together';
  readonly name = 'Together AI';

  private config: TogetherAdapterConfig;
  private model: string;

  constructor(config: TogetherAdapterConfig) {
    this.config = config;
    this.model = config.model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
  }

  async getEmbeddings(text: string | string[]): Promise<number[][]> {
    const inputs = Array.isArray(text) ? text : [text];
    const results: number[][] = [];

    for (const input of inputs) {
      const response = await fetch('https://api.together.xyz/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.config.apiKey,
        },
        body: JSON.stringify({
          model: 'togethercomputer/m2-bert-80M-32k-retrieval',
          input,
        }),
      });

      if (!response.ok) {
        throw new Error('Together Embeddings API error: ' + response.statusText);
      }

      const data = await response.json();
      results.push(data.data[0].embedding);
    }

    return results;
  }

  isReady(): boolean {
    return !!this.config.apiKey;
  }

  async generateHoloScript(prompt: string, _options?: GenerateOptions): Promise<GenerateResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      { role: 'user', content: 'Create a HoloScript scene: ' + prompt },
    ];
    const response = await this.callAPI(messages);

    return {
      holoScript: this.extractCode(response),
      confidence: 0.8,
    };
  }

  async explainHoloScript(holoScript: string): Promise<ExplainResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      { role: 'user', content: 'Explain this HoloScript code clearly:\n\n' + holoScript },
    ];
    const response = await this.callAPI(messages);
    return { explanation: response };
  }

  async optimizeHoloScript(
    holoScript: string,
    target: 'mobile' | 'desktop' | 'vr' | 'ar'
  ): Promise<OptimizeResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          'Optimize this HoloScript for ' +
          target +
          '. Return only the optimized code:\n\n' +
          holoScript,
      },
    ];
    const response = await this.callAPI(messages);
    return {
      holoScript: this.extractCode(response),
      improvements: ['Optimized for ' + target],
    };
  }

  async fixHoloScript(holoScript: string, errors: string[]): Promise<FixResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          'Fix these errors in the HoloScript:\nErrors: ' +
          errors.join(', ') +
          '\n\nCode:\n' +
          holoScript,
      },
    ];
    const response = await this.callAPI(messages);
    return {
      holoScript: this.extractCode(response),
      fixes: errors.map((e) => ({ line: 0, issue: e, fix: 'auto-fixed' })),
    };
  }

  async chat(
    message: string,
    holoScript?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
    ];

    if (history) {
      messages.push(...history);
    }

    if (holoScript) {
      messages.push({
        role: 'user',
        content: 'Context:\n' + holoScript + '\n\nQuestion: ' + message,
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    return this.callAPI(messages);
  }

  private extractCode(response: string): string {
    const match = response.match(/```(?:holoscript|holo)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : response.trim();
  }

  private async callAPI(messages: Array<{ role: string; content: string }>): Promise<string> {
    // Together AI uses OpenAI-compatible API — delegate to OpenAIAdapter with
    // together.xyz baseURL (withRetry on 429/5xx).
    const adapter = new LLMOpenAIAdapter({
      apiKey: this.config.apiKey,
      defaultModel: this.model,
      baseURL: 'https://api.together.xyz/v1',
    });
    const result = await adapter.complete({
      messages: messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
      maxTokens: 4096,
      temperature: 0.7,
    });
    return result.content;
  }
}

// ============================================================================
// Fireworks AI Adapter
// ============================================================================

export interface FireworksAdapterConfig {
  apiKey: string;
  model?: string;
}

export class FireworksAdapter implements AIAdapter {
  readonly id = 'fireworks';
  readonly name = 'Fireworks AI';

  private config: FireworksAdapterConfig;
  private model: string;

  constructor(config: FireworksAdapterConfig) {
    this.config = config;
    this.model = config.model || 'accounts/fireworks/models/llama-v3p1-70b-instruct';
  }

  isReady(): boolean {
    return !!this.config.apiKey;
  }

  async generateHoloScript(prompt: string, _options?: GenerateOptions): Promise<GenerateResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      { role: 'user', content: 'Create a HoloScript scene: ' + prompt },
    ];
    const response = await this.callAPI(messages);

    return {
      holoScript: this.extractCode(response),
      confidence: 0.8,
    };
  }

  async explainHoloScript(holoScript: string): Promise<ExplainResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      { role: 'user', content: 'Explain this HoloScript code clearly:\n\n' + holoScript },
    ];
    const response = await this.callAPI(messages);
    return { explanation: response };
  }

  async optimizeHoloScript(
    holoScript: string,
    target: 'mobile' | 'desktop' | 'vr' | 'ar'
  ): Promise<OptimizeResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          'Optimize this HoloScript for ' +
          target +
          '. Return only the optimized code:\n\n' +
          holoScript,
      },
    ];
    const response = await this.callAPI(messages);
    return {
      holoScript: this.extractCode(response),
      improvements: ['Optimized for ' + target],
    };
  }

  async fixHoloScript(holoScript: string, errors: string[]): Promise<FixResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          'Fix these errors in the HoloScript:\nErrors: ' +
          errors.join(', ') +
          '\n\nCode:\n' +
          holoScript,
      },
    ];
    const response = await this.callAPI(messages);
    return {
      holoScript: this.extractCode(response),
      fixes: errors.map((e) => ({ line: 0, issue: e, fix: 'auto-fixed' })),
    };
  }

  async chat(
    message: string,
    holoScript?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
    ];

    if (history) {
      messages.push(...history);
    }

    if (holoScript) {
      messages.push({
        role: 'user',
        content: 'Context:\n' + holoScript + '\n\nQuestion: ' + message,
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    return this.callAPI(messages);
  }

  private extractCode(response: string): string {
    const match = response.match(/```(?:holoscript|holo)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : response.trim();
  }

  private async callAPI(messages: Array<{ role: string; content: string }>): Promise<string> {
    // Fireworks uses OpenAI-compatible API — delegate to OpenAIAdapter with
    // fireworks.ai baseURL (withRetry on 429/5xx).
    const adapter = new LLMOpenAIAdapter({
      apiKey: this.config.apiKey,
      defaultModel: this.model,
      baseURL: 'https://api.fireworks.ai/inference/v1',
    });
    const result = await adapter.complete({
      messages: messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
      maxTokens: 4096,
      temperature: 0.7,
    });
    return result.content;
  }

  async getEmbeddings(text: string | string[]): Promise<number[][]> {
    const inputs = Array.isArray(text) ? text : [text];
    const results: number[][] = [];

    for (const input of inputs) {
      const response = await fetch('https://api.fireworks.ai/inference/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.config.apiKey,
        },
        body: JSON.stringify({
          model: 'nomic-ai/nomic-embed-text-v1',
          input,
        }),
      });

      if (!response.ok) {
        throw new Error('Fireworks Embeddings API error: ' + response.statusText);
      }

      const data = await response.json();
      results.push(data.data[0].embedding);
    }

    return results;
  }
}

// ============================================================================
// NVIDIA NIM Adapter
// ============================================================================

export interface NVIDIAAdapterConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class NVIDIAAdapter implements AIAdapter {
  readonly id = 'nvidia';
  readonly name = 'NVIDIA NIM';

  private config: NVIDIAAdapterConfig;
  private model: string;
  private baseUrl: string;

  constructor(config: NVIDIAAdapterConfig) {
    this.config = config;
    this.model = config.model || 'meta/llama-3.1-70b-instruct';
    this.baseUrl = config.baseUrl || 'https://integrate.api.nvidia.com/v1';
  }

  isReady(): boolean {
    return !!this.config.apiKey;
  }

  async generateHoloScript(prompt: string, _options?: GenerateOptions): Promise<GenerateResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      { role: 'user', content: 'Create a HoloScript scene: ' + prompt },
    ];
    const response = await this.callAPI(messages);

    return {
      holoScript: this.extractCode(response),
      confidence: 0.85,
    };
  }

  async explainHoloScript(holoScript: string): Promise<ExplainResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      { role: 'user', content: 'Explain this HoloScript code clearly:\n\n' + holoScript },
    ];
    const response = await this.callAPI(messages);
    return { explanation: response };
  }

  async optimizeHoloScript(
    holoScript: string,
    target: 'mobile' | 'desktop' | 'vr' | 'ar'
  ): Promise<OptimizeResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          'Optimize this HoloScript for ' +
          target +
          '. Return only the optimized code:\n\n' +
          holoScript,
      },
    ];
    const response = await this.callAPI(messages);
    return {
      holoScript: this.extractCode(response),
      improvements: ['Optimized for ' + target],
    };
  }

  async fixHoloScript(holoScript: string, errors: string[]): Promise<FixResult> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          'Fix these errors in the HoloScript:\nErrors: ' +
          errors.join(', ') +
          '\n\nCode:\n' +
          holoScript,
      },
    ];
    const response = await this.callAPI(messages);
    return {
      holoScript: this.extractCode(response),
      fixes: errors.map((e) => ({ line: 0, issue: e, fix: 'auto-fixed' })),
    };
  }

  async chat(
    message: string,
    holoScript?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: HOLOSCRIPT_SYSTEM_PROMPT },
    ];

    if (history) {
      messages.push(...history);
    }

    if (holoScript) {
      messages.push({
        role: 'user',
        content: 'Context:\n' + holoScript + '\n\nQuestion: ' + message,
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    return this.callAPI(messages);
  }

  private extractCode(response: string): string {
    const match = response.match(/```(?:holoscript|holo)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : response.trim();
  }

  private async callAPI(messages: Array<{ role: string; content: string }>): Promise<string> {
    // NVIDIA NIM uses OpenAI-compatible API — delegate to OpenAIAdapter with
    // configurable baseURL (withRetry on 429/5xx).
    const adapter = new LLMOpenAIAdapter({
      apiKey: this.config.apiKey,
      defaultModel: this.model,
      baseURL: this.baseUrl,
    });
    const result = await adapter.complete({
      messages: messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
      maxTokens: 4096,
      temperature: 0.7,
    });
    return result.content;
  }

  async getEmbeddings(text: string | string[]): Promise<number[][]> {
    const inputs = Array.isArray(text) ? text : [text];
    const results: number[][] = [];

    for (const input of inputs) {
      const response = await fetch(this.baseUrl + '/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.config.apiKey,
        },
        body: JSON.stringify({
          model: 'nvidia/nvembed-v1',
          input,
        }),
      });

      if (!response.ok) {
        throw new Error('NVIDIA Embeddings API error: ' + response.statusText);
      }

      const data = await response.json();
      results.push(data.data[0].embedding);
    }

    return results;
  }
}

// ============================================================================
// Additional Factory Functions
// ============================================================================

/**
 * Create and register a Gemini adapter
 */
export function useGemini(config: GeminiAdapterConfig): GeminiAdapter {
  const adapter = new GeminiAdapter(config);
  registerAIAdapter(adapter, true);
  return adapter;
}

/**
 * Create and register an xAI (Grok) adapter
 */
export function useXAI(config: XAIAdapterConfig): XAIAdapter {
  const adapter = new XAIAdapter(config);
  registerAIAdapter(adapter, true);
  return adapter;
}

/** Alias for useXAI */
export const useGrok = useXAI;

/**
 * Create and register a Together AI adapter
 */
export function useTogether(config: TogetherAdapterConfig): TogetherAdapter {
  const adapter = new TogetherAdapter(config);
  registerAIAdapter(adapter, true);
  return adapter;
}

/**
 * Create and register a Fireworks AI adapter
 */
export function useFireworks(config: FireworksAdapterConfig): FireworksAdapter {
  const adapter = new FireworksAdapter(config);
  registerAIAdapter(adapter, true);
  return adapter;
}

/**
 * Create and register an NVIDIA NIM adapter
 */
export function useNVIDIA(config: NVIDIAAdapterConfig): NVIDIAAdapter {
  const adapter = new NVIDIAAdapter(config);
  registerAIAdapter(adapter, true);
  return adapter;
}
