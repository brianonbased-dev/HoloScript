/**
 * Metered LLM Provider — Wraps any LLM provider with token counting and credit deduction.
 *
 * Used only for absorb-service operations (paid users). Internal daemon system
 * uses the unwrapped provider directly.
 */

import type { LLMProvider } from '../pipeline/layerExecutors';
import { deductCredits } from './creditService';
import { LLM_COSTS_PER_MTOK, LLM_MARKUP } from './pricing';

export class MeteredLLMProvider implements LLMProvider {
  constructor(
    private inner: LLMProvider,
    private providerName: string,
    private userId: string,
    private projectId: string
  ) {}

  async chat(params: {
    system: string;
    prompt: string;
    maxTokens: number;
  }): Promise<{ text: string }> {
    const estimatedInputTokens = Math.ceil((params.system.length + params.prompt.length) / 4);

    const result = await this.inner.chat(params);

    const estimatedOutputTokens = Math.ceil(result.text.length / 4);

    const costs = LLM_COSTS_PER_MTOK[this.providerName] ?? LLM_COSTS_PER_MTOK.ollama;
    const inputCostCents = (estimatedInputTokens / 1_000_000) * costs.input * 100 * LLM_MARKUP;
    const outputCostCents = (estimatedOutputTokens / 1_000_000) * costs.output * 100 * LLM_MARKUP;
    const totalCostCents = Math.ceil(inputCostCents + outputCostCents);

    if (totalCostCents > 0) {
      await deductCredits(this.userId, totalCostCents, `LLM tokens (${this.providerName})`, {
        provider: this.providerName,
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        projectId: this.projectId,
      });
    }

    return result;
  }
}
