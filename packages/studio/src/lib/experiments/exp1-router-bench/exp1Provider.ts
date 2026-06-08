/**
 * EXP-1 provider resolution — SOVEREIGN BY DEFAULT.
 *
 * The thesis is a lite, portable, LOCAL model with no external dependency. The
 * experiment must dogfood that: it runs on a local Ollama model by default and
 * NEVER silently reaches for a paid frontier vendor. A frontier model is allowed
 * only as an EXPLICIT opt-in baseline (the bar "small local matches big frontier"
 * must beat) — that is the one place EXP-1 may bill, and only when asked.
 *
 * This replaces the earlier `resolveBrittneyProvider()` default, which resolved
 * to Anthropic whenever ANTHROPIC_API_KEY was set — the exact external dependency
 * (and cost) the thesis exists to remove. (D.014 local-first, D.012 lights-out,
 * P.004/P.005 self-host fleet.)
 */

import { LocalLLMAdapter, type ILLMProvider } from '@holoscript/llm-provider';
import { resolveBrittneyProvider } from '../../brittney/provider';

/** Sovereign baseline model (the bigger local model, Arms A/B). P.005 ship candidate. */
export const SOVEREIGN_BASELINE_MODEL = process.env.EXP1_BASELINE_MODEL || 'qwen2.5-coder:7b';
/** Sovereign lite model (the smaller local model, Arm C). */
export const SOVEREIGN_LITE_MODEL = process.env.EXP1_LITE_MODEL || 'qwen2.5-coder:1.5b';

export interface Exp1Provider {
  provider: ILLMProvider;
  model: string;
  maxTokens: number;
  providerName: string;
}

/**
 * Local sovereign provider (Ollama) — no credits, no external dependency.
 * Construction does not connect; a missing local model fails loudly at call time
 * with a connection error (never a billing one). The EXP-1 default.
 */
export function localProvider(model: string, ollamaHost?: string): Exp1Provider {
  const baseURL =
    ollamaHost ||
    process.env.OLLAMA_HOST ||
    process.env.OLLAMA_BASE_URL ||
    'http://localhost:11434';
  return {
    provider: new LocalLLMAdapter({ baseURL, model, timeoutMs: 300_000 }),
    model,
    maxTokens: Number(process.env.BRITTNEY_MAX_TOKENS) || 4096,
    providerName: 'ollama',
  };
}

/**
 * Frontier baseline (the bar to beat) — EXPLICIT opt-in ONLY. This is the single
 * place EXP-1 is permitted to use a paid external vendor, and only when the caller
 * sets frontierBaseline:true. Resolves via the app's Brittney provider (env).
 */
export function frontierBaselineProvider(): Exp1Provider {
  const r = resolveBrittneyProvider();
  return {
    provider: r.provider,
    model: r.model,
    maxTokens: r.maxTokens,
    providerName: r.providerName,
  };
}
