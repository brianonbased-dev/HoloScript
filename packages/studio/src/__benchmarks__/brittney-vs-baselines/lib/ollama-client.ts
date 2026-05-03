import type { TokenUsage } from '../types';

/**
 * Minimal Ollama Cloud client using the OpenAI-compatible /v1/chat/completions API.
 *
 * Supports non-streaming tool-calling and JSON-mode for the judge.
 */

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OllamaToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface OllamaChatResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: OllamaToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export interface OllamaClientOptions {
  apiKey: string;
  baseURL?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export class OllamaClient {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private fetchImpl: typeof fetch;

  constructor(opts: OllamaClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseURL = (opts.baseURL ?? 'https://ollama.com/v1').replace(/\/$/, '');
    this.model = opts.model ?? 'qwen3.5:397b';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async chat({
    messages,
    tools,
    tool_choice,
    max_tokens,
    temperature,
    response_format,
    signal,
    extra,
  }: {
    messages: OllamaMessage[];
    tools?: OllamaTool[];
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    max_tokens?: number;
    temperature?: number;
    response_format?: { type: 'json_object' };
    signal?: AbortSignal;
    extra?: Record<string, unknown>;
  }): Promise<OllamaChatResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
    }
    if (tool_choice) {
      body.tool_choice =
        typeof tool_choice === 'string'
          ? tool_choice
          : { type: 'function', function: { name: tool_choice.function.name } };
    }
    if (max_tokens) body.max_tokens = max_tokens;
    if (temperature !== undefined) body.temperature = temperature;
    if (response_format) body.response_format = response_format;
    if (extra) Object.assign(body, extra);

    const res = await this.fetchImpl(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    return (await res.json()) as OllamaChatResponse;
  }

  estimateTokens(chars: number): number {
    return Math.max(0, Math.ceil(chars / 4));
  }
}
