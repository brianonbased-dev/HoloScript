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
    /** Monthly cap on free sovereign turns (chat/compile/scene). null = unlimited. */
    maxMonthlyTurns: number | null;
  }
> = {
  free: {
    freeCredits: 100,
    maxProjectsActive: 3,
    maxAbsorbDepth: 'shallow',
    pipelineEnabled: false,
    maxMonthlyTurns: 200,
  },
  pro: {
    freeCredits: 500,
    maxProjectsActive: 100,
    maxAbsorbDepth: 'deep',
    pipelineEnabled: true,
    maxMonthlyTurns: null,
  },
  enterprise: {
    freeCredits: 2000,
    maxProjectsActive: 1000,
    maxAbsorbDepth: 'deep',
    pipelineEnabled: true,
    maxMonthlyTurns: null,
  },
};

// ─── Subscription + per-lane pricing (resource-shape model, D.086) ────────────
// SSOT for the researched numbers (2026-06-06). The monthly subscription + fleet-seat +
// per-receipt BILLING (recurring Stripe, seat metering) is founder business-infra and not
// yet wired — these are the ratified figures it will charge. Flagged numbers need cold
// validation: fleet seat assumes a warm-hour budget then credit draw (never unlimited-warm
// top-card at $25); Diamond launches invite-only; per-receipt needs a design-partner.
export const SUBSCRIPTION_PRICING = {
  studioPro: { priceCentsMonthly: 1500, includedCredits: 500, label: 'Studio Pro' },
  fleetSeat: {
    priceCentsMonthly: 2500,
    volumePriceCents5Plus: 2000,
    label: 'Fleet seat (durable agent)',
  },
  vaultGold: { priceCentsMonthly: 3000, label: 'GOLD vault' },
  vaultDiamond: { priceCentsMonthly: 9900, inviteOnly: true, label: 'Diamond vault' },
  regulatedReceipt: {
    minCents: 25,
    maxCents: 500,
    enterpriseFloorCentsMonthly: 200000,
    label: 'Verified receipt',
  },
} as const;

// ─── LLM Markup ──────────────────────────────────────────────────────────────

export const LLM_MARKUP = 1.15;

export const LLM_COSTS_PER_MTOK: Record<string, { input: number; output: number }> = {
  // Frontier / BYOK providers — real marginal cost, metered with LLM_MARKUP.
  anthropic: { input: 3.0, output: 15.0 },
  xai: { input: 2.0, output: 10.0 },
  openai: { input: 2.5, output: 10.0 },
  gemini: { input: 0.5, output: 1.5 },
  openrouter: { input: 2.5, output: 10.0 },
  // Sovereign serving — self-hosted on our own fleet (scale-to-zero). ~$0 marginal, so
  // the cheap lane is free per the resource-shape pricing model (D.086). ollama = local
  // serving; cloud/fleet = the Brittney sovereign serving endpoint (P.008).
  ollama: { input: 0, output: 0 },
  cloud: { input: 0, output: 0 },
  fleet: { input: 0, output: 0 },
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
