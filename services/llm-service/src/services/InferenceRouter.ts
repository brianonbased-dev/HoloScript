/**
 * InferenceRouter — Multi-Provider LLM Inference
 *
 * Routes Brittney chat requests to the best available inference provider.
 * 
 * Tiers:
 *   - pro:      Kimi K2.5 (1T MoE, 32B active) — advanced reasoning, vision, agentic
 *   - standard: Fireworks (Qwen2.5-Coder-7B fine-tuned) — fast, cheap, code-optimized
 *   - fallback: Together AI, Ollama (local dev)
 *
 * All providers implement the same InferenceProvider interface and return
 * an async generator of SSE-compatible events.
 */

import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  sceneContext?: string;
  tools?: ToolDefinition[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tier?: 'pro' | 'standard';
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface StreamEvent {
  type: 'text' | 'tool_call' | 'error' | 'done';
  payload: unknown;
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface InferenceProvider {
  name: string;
  stream(request: ChatRequest): AsyncGenerator<StreamEvent>;
  isAvailable(): Promise<boolean>;
}

// ============================================================================
// Brittney System Prompt
// ============================================================================

const BRITTNEY_SYSTEM_PROMPT = `You are Brittney, the AI Scene Director for HoloScript Studio — a Unity-like spatial editor for HoloScript scenes.

Your role:
- Help users build, edit, and refine their 3D scenes using natural language
- Apply traits (behaviors) to scene objects by calling the provided tools
- Explain what you're doing in a friendly, concise way
- When a user says something vague, pick the most logical interpretation and state what you did

HoloScript trait system:
- Traits are behaviors attached to objects: @physics, @ai_npc, @glow, @gaussian_splat, @llm_agent, etc.
- You compose them: "@HoverCar = @physics + @vehicle + @hover_vehicle"
- Every change you make is immediately visible in the scene

Rules:
- Always use tools to make changes — never just describe what you would do
- After calling a tool, briefly confirm in 1-2 sentences what happened
- If you need more info (e.g. which object to modify), ask once concisely
- Match the user's energy: casual and fast if they're fast, detailed if they ask for it
- Never apologize excessively or pad your responses`;

// ============================================================================
// Fireworks AI Provider
// ============================================================================

class FireworksProvider implements InferenceProvider {
  name = 'fireworks';
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.FIREWORKS_API_KEY || '';
    this.model = process.env.FIREWORKS_MODEL || 'accounts/fireworks/models/llama-v3p1-8b-instruct';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const messages = this.buildMessages(request);

    const body: Record<string, unknown> = {
      model: request.model || this.model,
      stream: true,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
    };

    if (request.tools?.length) {
      body.tools = request.tools;
    }

    const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      yield { type: 'error', payload: `Fireworks error: ${response.status} ${response.statusText}` };
      yield { type: 'done', payload: null };
      return;
    }

    yield* parseOpenAIStream(response.body);
  }

  private buildMessages(request: ChatRequest): ChatMessage[] {
    const systemMsg = request.sceneContext
      ? `${BRITTNEY_SYSTEM_PROMPT}\n\nCurrent scene:\n${request.sceneContext}`
      : BRITTNEY_SYSTEM_PROMPT;
    return [{ role: 'system', content: systemMsg }, ...request.messages];
  }
}

// ============================================================================
// Shared OpenAI-compatible SSE parser (used by Fireworks, Kimi, Together)
// ============================================================================

async function* parseOpenAIStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingToolCall: { name: string; argsBuf: string } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.replace(/^data: /, '').trim();
      if (!trimmed || trimmed === '[DONE]') {
        if (trimmed === '[DONE]') {
          if (pendingToolCall) {
            try {
              yield { type: 'tool_call', payload: { name: pendingToolCall.name, arguments: JSON.parse(pendingToolCall.argsBuf || '{}') } };
            } catch { /* ignore */ }
            pendingToolCall = null;
          }
          yield { type: 'done', payload: null };
        }
        continue;
      }
      try {
        const chunk = JSON.parse(trimmed);
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          yield { type: 'text', payload: delta.content };
        }

        if (delta.tool_calls?.length) {
          for (const tc of delta.tool_calls) {
            if (tc.function?.name) {
              if (pendingToolCall) {
                try {
                  yield { type: 'tool_call', payload: { name: pendingToolCall.name, arguments: JSON.parse(pendingToolCall.argsBuf || '{}') } };
                } catch { /* ignore */ }
              }
              pendingToolCall = { name: tc.function.name, argsBuf: tc.function.arguments ?? '' };
            } else if (pendingToolCall && tc.function?.arguments) {
              pendingToolCall.argsBuf += tc.function.arguments;
            }
          }
        }
      } catch { /* partial line */ }
    }
  }
}

// ============================================================================
// Kimi K2.5 Provider (Brittney Pro — via Fireworks serverless)
// ============================================================================

class KimiProvider implements InferenceProvider {
  name = 'kimi';
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.FIREWORKS_API_KEY || '';
    this.model = process.env.KIMI_MODEL || 'accounts/fireworks/models/kimi-k2p5';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const systemMsg = request.sceneContext
      ? `${BRITTNEY_SYSTEM_PROMPT}\n\nCurrent scene:\n${request.sceneContext}`
      : BRITTNEY_SYSTEM_PROMPT;

    const body: Record<string, unknown> = {
      model: request.model || this.model,
      stream: true,
      messages: [{ role: 'system', content: systemMsg }, ...request.messages],
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    };

    if (request.tools?.length) {
      body.tools = request.tools;
    }

    // Kimi K2.5 is served through Fireworks API (same OpenAI-compatible endpoint)
    const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      yield { type: 'error', payload: `Kimi K2.5 error: ${response.status} ${response.statusText}` };
      yield { type: 'done', payload: null };
      return;
    }

    // Same OpenAI-compatible SSE format
    yield* parseOpenAIStream(response.body);
  }
}

// ============================================================================
// Together AI Provider
// ============================================================================

class TogetherProvider implements InferenceProvider {
  name = 'together';
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.TOGETHER_API_KEY || '';
    this.model = process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.1-8B-Instruct-Turbo';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const systemMsg = request.sceneContext
      ? `${BRITTNEY_SYSTEM_PROMPT}\n\nCurrent scene:\n${request.sceneContext}`
      : BRITTNEY_SYSTEM_PROMPT;

    const body: Record<string, unknown> = {
      model: request.model || this.model,
      stream: true,
      messages: [{ role: 'system', content: systemMsg }, ...request.messages],
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
    };

    if (request.tools?.length) {
      body.tools = request.tools;
    }

    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      yield { type: 'error', payload: `Together error: ${response.status} ${response.statusText}` };
      yield { type: 'done', payload: null };
      return;
    }

    // Together uses the same OpenAI-compatible format
    yield* parseOpenAIStream(response.body);
  }
}

// ============================================================================
// Ollama Provider (local dev)
// ============================================================================

class OllamaLocalProvider implements InferenceProvider {
  name = 'ollama';
  private url: string;
  private model: string;

  constructor() {
    this.url = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'brittney-qwen-v23:latest';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const systemMsg = request.sceneContext
      ? `${BRITTNEY_SYSTEM_PROMPT}\n\nCurrent scene:\n${request.sceneContext}`
      : BRITTNEY_SYSTEM_PROMPT;

    const body: Record<string, unknown> = {
      model: request.model || this.model,
      stream: true,
      messages: [{ role: 'system', content: systemMsg }, ...request.messages],
    };

    if (request.tools?.length) {
      body.tools = request.tools;
    }

    const response = await fetch(`${this.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      yield { type: 'error', payload: `Ollama error: ${response.status} ${response.statusText}` };
      yield { type: 'done', payload: null };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.message?.content) yield { type: 'text', payload: chunk.message.content };
          if (chunk.message?.tool_calls?.length) {
            for (const tc of chunk.message.tool_calls) {
              yield { type: 'tool_call', payload: { name: tc.function?.name ?? tc.name, arguments: tc.function?.arguments ?? tc.arguments ?? {} } };
            }
          }
          if (chunk.done) yield { type: 'done', payload: null };
        } catch { /* partial */ }
      }
    }
  }
}

// ============================================================================
// InferenceRouter
// ============================================================================

export class InferenceRouter {
  private providers: InferenceProvider[];
  private proProvider: InferenceProvider;
  private preferredProvider: string;

  constructor() {
    this.preferredProvider = process.env.BRITTNEY_PROVIDER || 'fireworks';
    this.proProvider = new KimiProvider();
    this.providers = [
      new FireworksProvider(),
      new TogetherProvider(),
      new OllamaLocalProvider(),
    ];
  }

  /**
   * Stream a chat response, routing by tier
   *   - pro:      Kimi K2.5 (falls back to standard if unavailable)
   *   - standard: preferred provider → any available
   */
  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    // Pro tier: route to Kimi K2.5
    if (request.tier === 'pro') {
      if (await this.proProvider.isAvailable()) {
        logger.info(`[InferenceRouter] Pro tier → ${this.proProvider.name}`);
        yield* this.proProvider.stream(request);
        return;
      }
      logger.warn(`[InferenceRouter] Pro tier unavailable, falling back to standard`);
    }

    // Standard tier: try preferred provider first
    const preferred = this.providers.find(p => p.name === this.preferredProvider);
    if (preferred && await preferred.isAvailable()) {
      logger.info(`[InferenceRouter] Using ${preferred.name}`);
      yield* preferred.stream(request);
      return;
    }

    // Try any available provider
    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        logger.info(`[InferenceRouter] Falling back to ${provider.name}`);
        yield* provider.stream(request);
        return;
      }
    }

    yield { type: 'error', payload: 'No inference provider available. Set FIREWORKS_API_KEY, TOGETHER_API_KEY, or start Ollama.' };
    yield { type: 'done', payload: null };
  }

  /**
   * Get status of all providers including pro tier
   */
  async getStatus(): Promise<{ provider: string; available: boolean; tier: string }[]> {
    const results: { provider: string; available: boolean; tier: string }[] = [
      { provider: this.proProvider.name, available: await this.proProvider.isAvailable(), tier: 'pro' },
    ];
    for (const p of this.providers) {
      results.push({ provider: p.name, available: await p.isAvailable(), tier: 'standard' });
    }
    return results;
  }

  getPreferredProvider(): string {
    return this.preferredProvider;
  }
}
