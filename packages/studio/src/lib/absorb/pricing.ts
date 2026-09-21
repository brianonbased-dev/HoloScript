/**
 * Absorb Service — Pricing configuration.
 *
 * SHADOW COPY. The original is packages/absorb-service/src/credits/pricing.ts;
 * this duplicate exists only because Studio cannot import across the workspace
 * without Next.js bundling problems. It is not a place to make decisions.
 *
 * The two drifted for months and nobody could see it: on 2026-09-21 eight of the
 * fourteen shared operations disagreed, and in every case Studio SHOWED MORE
 * than the server CHARGED — daemon_balanced quoted 250c against 100c taken,
 * query_basic 5c against 2c. Customers were being quoted prices that were not
 * real. pricing.test.ts now fails if the OPERATION_COSTS block here is not
 * byte-identical to the original, so the copy can be wrong only deliberately.
 *
 * Edit the original, then paste its OPERATION_COSTS block here.
 */

export type ExecutionTier = 'cloud' | 'local' | 'unbilled' | 'unverified';

export const OPERATION_COSTS = {
  // Local graph scan. No outbound call on this path; charged today at the site
  // below. Left priced pending a founder call on whether our metal counts as
  // cloud: services/absorb-service/src/routes/absorb.ts charges it.
  absorb_shallow: { baseCostCents: 10, tier: 'unverified', description: 'Shallow codebase scan' },
  absorb_deep: { baseCostCents: 50, tier: 'unverified', description: 'Deep codebase scan with full graph' },

  daemon_quick: { baseCostCents: 50, tier: 'unverified', description: 'Quick fix cycle (1 cycle)' },
  daemon_balanced: { baseCostCents: 100, tier: 'unverified', description: 'Balanced improvement (2 cycles)' },
  daemon_deep: { baseCostCents: 250, tier: 'unverified', description: 'Deep improvement (3 cycles)' },

  // UNBILLED: no charge site anywhere in the workspace. Studio displays these;
  // nothing takes them. Kept at their historical numbers because each plausibly
  // drives a paid model and deleting a product's price is a founder decision,
  // not a cleanup — but the fiction is now labelled instead of silent.
  pipeline_l0: { baseCostCents: 100, tier: 'unbilled', description: 'L0 Code Fixer pipeline' },
  pipeline_l1: { baseCostCents: 75, tier: 'unbilled', description: 'L1 Strategy Optimizer' },
  pipeline_l2: { baseCostCents: 150, tier: 'unbilled', description: 'L2 Meta-Strategist' },
  skill_generate: { baseCostCents: 50, tier: 'unbilled', description: 'Generate HoloClaw skill' },

  // LOCAL, and unbilled besides: rendering and diffing run on the machine that
  // already has the scene. No charge site exists for any of the three, so the
  // price was never taken — it was only ever shown. Showing a price we do not
  // charge, for work that costs us nothing, is the rule broken twice over.
  screenshot: { baseCostCents: 0, tier: 'local', description: 'Render scene to PNG/JPEG/WebP' },
  pdf_export: { baseCostCents: 0, tier: 'local', description: 'Render scene to PDF' },
  semantic_diff: { baseCostCents: 0, tier: 'local', description: 'Compare two project versions' },

  // LOCAL. Both are embedding search over the absorbed graph. The query route
  // builds an EmbeddingIndex and calls index.search(); there is no LLM call on
  // the path at all, despite the name and the old description. The default
  // provider is 'structural' — zero-dependency, no API key, no model download —
  // and F.106 forbids the factory from ever auto-selecting a paid one. Nothing
  // about this costs us money, so nothing about it may cost the customer.
  query_basic: { baseCostCents: 0, tier: 'local', description: 'Semantic codebase search (local, keyless)' },
  query_with_llm: {
    baseCostCents: 0,
    tier: 'local',
    description: 'Semantic codebase query over the absorbed graph (local embeddings, keyless)',
  },

  semantic_dedup: { baseCostCents: 1, tier: 'unverified', description: 'Agent semantic deduplication evaluation' },
  knowledge_query: { baseCostCents: 0, tier: 'local', description: 'Knowledge search (free entries)' },
  knowledge_query_premium: {
    baseCostCents: 5,
    tier: 'unverified',
    description: 'Premium knowledge access (provenance-signed)',
  },
  knowledge_publish: {
    baseCostCents: 0,
    tier: 'local',
    description: 'Publish knowledge entry (free for authors)',
  },

  // CLOUD. Each of these resolves a real API key and calls a paid adapter
  // (Anthropic / OpenAI / OpenRouter). Verified at the route, not assumed —
  // packages/studio/src/app/api/autocomplete/route.ts:53-94 is the pattern.
  studio_autocomplete: { baseCostCents: 1, tier: 'cloud', description: 'Code autocomplete (up to 256 tokens)' },
  studio_generate: { baseCostCents: 5, tier: 'cloud', description: 'Code generation (up to 4096 tokens)' },
  studio_chat: { baseCostCents: 3, tier: 'cloud', description: 'Brittney chat message (up to 2048 tokens)' },
  studio_material: {
    baseCostCents: 2,
    tier: 'cloud',
    description: 'Material/asset generation (up to 512 tokens)',
  },
  studio_voice_to_holo: {
    baseCostCents: 4,
    tier: 'cloud',
    description: 'Voice utterance → HoloScript (Haiku, up to 2 turns)',
  },
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
