/**
 * Provider-Agnostic LLM Adapter
 *
 * Thin wrapper that dispatches to Anthropic, OpenAI, xAI, or OpenRouter.
 * Each agent can use a different provider/model.
 */

import type { ModelConfig } from '../types';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed?: number;
}

export async function callLLM(
  config: ModelConfig,
  messages: LLMMessage[],
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<LLMResponse> {
  const maxTokens = options.maxTokens ?? config.maxTokens ?? 1024;
  const temperature = options.temperature ?? config.temperature ?? 0.7;

  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, messages, maxTokens, temperature);
    case 'openai':
    case 'xai':
      return callOpenAICompatible(config, messages, maxTokens, temperature);
    case 'openrouter':
      return callOpenRouter(config, messages, maxTokens, temperature);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

async function callAnthropic(
  config: ModelConfig,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      system: system || undefined,
      messages: userMessages,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }>; usage?: { output_tokens: number } };

  return {
    content: data.content?.[0]?.text || '',
    model: config.model,
    provider: 'anthropic',
    tokensUsed: data.usage?.output_tokens,
  };
}

async function callOpenAICompatible(
  config: ModelConfig,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const isXAI = config.provider === 'xai';
  const apiKey = config.apiKey || (isXAI ? process.env.XAI_API_KEY : process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error(`${config.provider.toUpperCase()}_API_KEY required`);

  const baseUrl = isXAI ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new Error(`${config.provider} API error: ${res.status}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }>; usage?: { completion_tokens: number } };

  return {
    content: data.choices?.[0]?.message?.content || '',
    model: config.model,
    provider: config.provider,
    tokensUsed: data.usage?.completion_tokens,
  };
}

async function callOpenRouter(
  config: ModelConfig,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY required');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://holoscript.net',
      'X-Title': 'HoloScript Framework',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }>; usage?: { completion_tokens: number } };

  return {
    content: data.choices?.[0]?.message?.content || '',
    model: config.model,
    provider: 'openrouter',
    tokensUsed: data.usage?.completion_tokens,
  };
}
