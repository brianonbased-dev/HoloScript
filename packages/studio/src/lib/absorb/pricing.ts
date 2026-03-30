/**
 * Absorb Service — Pricing configuration.
 * Local shadow copy for Studio to prevent cross-workspace Next.js bundling issues.
 */

// ─── Operation Costs ─────────────────────────────────────────────────────────

export const OPERATION_COSTS = {
  absorb_shallow: { baseCostCents: 10, description: 'Shallow codebase scan' },
  absorb_deep: { baseCostCents: 50, description: 'Deep codebase scan with full graph' },
  daemon_quick: { baseCostCents: 100, description: 'Quick fix cycle (1 cycle)' },
  daemon_balanced: { baseCostCents: 250, description: 'Balanced improvement (2 cycles)' },
  daemon_deep: { baseCostCents: 500, description: 'Deep improvement (3 cycles)' },
  pipeline_l0: { baseCostCents: 200, description: 'L0 Code Fixer pipeline' },
  pipeline_l1: { baseCostCents: 100, description: 'L1 Strategy Optimizer' },
  pipeline_l2: { baseCostCents: 150, description: 'L2 Meta-Strategist' },
  skill_generate: { baseCostCents: 75, description: 'Generate HoloClaw skill' },
  query_basic: { baseCostCents: 5, description: 'Semantic codebase search' },
  query_with_llm: {
    baseCostCents: 15,
    description: 'AI-powered codebase query (+ metered LLM tokens)',
  },
  screenshot: { baseCostCents: 3, description: 'Render scene to PNG/JPEG/WebP' },
  pdf_export: { baseCostCents: 5, description: 'Render scene to PDF' },
  semantic_diff: { baseCostCents: 2, description: 'Compare two project versions' },
} as const;

export type OperationType = keyof typeof OPERATION_COSTS;

// ─── Credit Packages ─────────────────────────────────────────────────────────

export const CREDIT_PACKAGES = [
  { id: 'starter', label: 'Starter', credits: 500, priceCents: 500, popular: false },
  { id: 'builder', label: 'Builder', credits: 2500, priceCents: 2000, popular: true },
  { id: 'pro', label: 'Pro', credits: 10000, priceCents: 7500, popular: false },
  { id: 'enterprise', label: 'Enterprise', credits: 50000, priceCents: 35000, popular: false },
] as const;

export type CreditPackageId = (typeof CREDIT_PACKAGES)[number]['id'];

// ─── Tier Limits ─────────────────────────────────────────────────────────────

export type Tier = 'free' | 'pro' | 'enterprise';

export const TIER_LIMITS: Record<
  Tier,
  {
    freeCredits: number;
    maxProjectsActive: number;
    maxAbsorbDepth: 'shallow' | 'deep';
    pipelineEnabled: boolean;
  }
> = {
  free: {
    freeCredits: 100,
    maxProjectsActive: 1,
    maxAbsorbDepth: 'shallow',
    pipelineEnabled: false,
  },
  pro: {
    freeCredits: 0,
    maxProjectsActive: 10,
    maxAbsorbDepth: 'deep',
    pipelineEnabled: true,
  },
  enterprise: {
    freeCredits: 0,
    maxProjectsActive: 100,
    maxAbsorbDepth: 'deep',
    pipelineEnabled: true,
  },
};

// ─── LLM Markup ──────────────────────────────────────────────────────────────

export const LLM_MARKUP = 1.15;

export const LLM_COSTS_PER_MTOK: Record<string, { input: number; output: number }> = {
  anthropic: { input: 3.0, output: 15.0 },
  xai: { input: 2.0, output: 10.0 },
  openai: { input: 2.5, output: 10.0 },
  ollama: { input: 0, output: 0 },
};

export function estimateLLMCostCents(
  provider: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = LLM_COSTS_PER_MTOK[provider] ?? LLM_COSTS_PER_MTOK.ollama;
  const inputCostCents = (inputTokens / 1_000_000) * costs.input * 100 * LLM_MARKUP;
  const outputCostCents = (outputTokens / 1_000_000) * costs.output * 100 * LLM_MARKUP;
  return Math.ceil(inputCostCents + outputCostCents);
}
