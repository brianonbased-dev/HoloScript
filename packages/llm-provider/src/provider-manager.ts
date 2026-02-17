/**
 * LLM Provider Manager
 *
 * Manages multiple LLM provider adapters and implements provider selection
 * strategies including fallback, cost optimization, and speed optimization.
 *
 * @version 1.0.0
 */

import type {
  ILLMProvider,
  LLMProviderName,
  LLMProviderRegistry,
  ProviderSelectionStrategy,
  LLMCompletionRequest,
  LLMCompletionResponse,
  HoloScriptGenerationRequest,
  HoloScriptGenerationResponse,
} from './types';
import { LLMProviderError } from './types';

export interface ProviderManagerConfig {
  /** Provider registry - register the adapters you want to use */
  providers: LLMProviderRegistry;

  /** Selection strategy */
  strategy?: ProviderSelectionStrategy;
}

/**
 * Manages multiple LLM providers with automatic fallback and strategy selection.
 *
 * @example
 * ```typescript
 * const manager = new LLMProviderManager({
 *   providers: {
 *     anthropic: new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! }),
 *     openai: new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY! }),
 *   },
 *   strategy: {
 *     primary: 'anthropic',
 *     fallback: 'openai',
 *   },
 * });
 *
 * const scene = await manager.generateHoloScript({
 *   prompt: "a futuristic city skyline at sunset",
 * });
 * ```
 */
export class LLMProviderManager {
  private readonly providers: LLMProviderRegistry;
  private readonly strategy: ProviderSelectionStrategy;

  constructor(config: ProviderManagerConfig) {
    this.providers = config.providers;
    this.strategy = config.strategy ?? this.detectDefaultStrategy();
  }

  /**
   * Generate HoloScript code using the configured provider strategy.
   * Falls back to secondary provider if primary fails.
   */
  async generateHoloScript(
    request: HoloScriptGenerationRequest
  ): Promise<HoloScriptGenerationResponse & { attemptedProviders: LLMProviderName[] }> {
    const providersToTry = this.getProviderOrder();
    const attemptedProviders: LLMProviderName[] = [];
    let lastError: Error | undefined;

    for (const providerName of providersToTry) {
      const provider = this.getProvider(providerName);
      if (!provider) continue;

      attemptedProviders.push(providerName);

      try {
        const result = await provider.generateHoloScript(request);
        return { ...result, attemptedProviders };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Only try fallback if this isn't a non-retryable error
        if (err instanceof Error && err.name === 'LLMAuthenticationError') {
          break; // Bad API key - don't try other providers
        }
      }
    }

    throw new LLMProviderError(
      `All providers failed: ${lastError?.message ?? 'Unknown error'}`,
      this.strategy.primary
    );
  }

  /**
   * Send a completion request using the configured primary provider.
   */
  async complete(
    request: LLMCompletionRequest,
    providerName?: LLMProviderName
  ): Promise<LLMCompletionResponse> {
    const name = providerName ?? this.strategy.primary;
    const provider = this.getProvider(name);

    if (!provider) {
      throw new LLMProviderError(
        `Provider '${name}' is not registered`,
        name
      );
    }

    return provider.complete(request);
  }

  /**
   * Run health checks on all registered providers.
   */
  async healthCheckAll(): Promise<Record<LLMProviderName, { ok: boolean; latencyMs: number; error?: string }>> {
    const results: Partial<Record<LLMProviderName, { ok: boolean; latencyMs: number; error?: string }>> = {};

    for (const [name, provider] of Object.entries(this.providers)) {
      if (provider) {
        results[name as LLMProviderName] = await provider.healthCheck();
      }
    }

    return results as Record<LLMProviderName, { ok: boolean; latencyMs: number; error?: string }>;
  }

  /**
   * Get the list of registered provider names.
   */
  getRegisteredProviders(): LLMProviderName[] {
    return Object.entries(this.providers)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k as LLMProviderName);
  }

  /**
   * Get a specific provider by name.
   */
  getProvider(name: LLMProviderName): ILLMProvider | undefined {
    return this.providers[name as keyof LLMProviderRegistry];
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private getProviderOrder(): LLMProviderName[] {
    const order: LLMProviderName[] = [this.strategy.primary];

    if (this.strategy.fallback && this.strategy.fallback !== this.strategy.primary) {
      order.push(this.strategy.fallback);
    }

    return order;
  }

  private detectDefaultStrategy(): ProviderSelectionStrategy {
    const registered = this.getRegisteredProviders();

    if (registered.length === 0) {
      return { primary: 'anthropic' }; // Will fail gracefully
    }

    // Prefer Anthropic → OpenAI → Gemini → Mock as default priority
    const priority: LLMProviderName[] = ['anthropic', 'openai', 'gemini', 'mock'];
    const primary = priority.find((p) => registered.includes(p)) ?? registered[0];
    const fallback = priority.find((p) => registered.includes(p) && p !== primary);

    return { primary, fallback };
  }
}
