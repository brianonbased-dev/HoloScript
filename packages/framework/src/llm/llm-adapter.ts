/**
 * Provider-Agnostic LLM Adapter
 *
 * Thin wrapper that dispatches to Anthropic, OpenAI, xAI, or OpenRouter.
 * Each agent can use a different provider/model.
 *
 * Migrated (B1b) from inline fetch() calls to @holoscript/llm-provider
 * adapters, which inherit withRetry from BaseLLMAdapter — exponential
 * backoff + Retry-After honoring on 429/5xx.
 */

import type { ModelConfig } from '../types';
import {
  AnthropicAdapter,
  OpenAIAdapter,
  OpenRouterAdapter,
  XAIAdapter,
} from '@holoscript/llm-provider';

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
  const adapter = new AnthropicAdapter({
    apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
    defaultModel: config.model,
  });
  const result = await adapter.complete({
    messages: messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
    maxTokens,
    temperature,
  });
  return {
    content: result.content,
    model: config.model,
    provider: 'anthropic',
    tokensUsed: result.usage?.completionTokens,
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

  if (isXAI) {
    const adapter = new XAIAdapter({ apiKey, defaultModel: config.model });
    const result = await adapter.complete({
      messages: messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
      maxTokens,
      temperature,
    });
    return {
      content: result.content,
      model: config.model,
      provider: 'xai',
      tokensUsed: result.usage?.completionTokens,
    };
  }

  const adapter = new OpenAIAdapter({
    apiKey,
    defaultModel: config.model,
  });
  const result = await adapter.complete({
    messages: messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
    maxTokens,
    temperature,
  });
  return {
    content: result.content,
    model: config.model,
    provider: config.provider,
    tokensUsed: result.usage?.completionTokens,
  };
}

async function callOpenRouter(
  config: ModelConfig,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const adapter = new OpenRouterAdapter({
    apiKey: config.apiKey || process.env.OPENROUTER_API_KEY || '',
    defaultModel: config.model,
  });
  const result = await adapter.complete({
    messages: messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
    maxTokens,
    temperature,
  });
  return {
    content: result.content,
    model: config.model,
    provider: 'openrouter',
    tokensUsed: result.usage?.completionTokens,
  };
}
