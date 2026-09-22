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

  // FREE BY FOUNDER RULING, and they were tiered 'cloud' here until review
  // caught it. These five DO call a paid adapter — Anthropic, OpenAI or
  // OpenRouter, resolved from a real key — so they cost US money. They charge
  // the customer nothing, and that is deliberate:
  //
  //   /founder ruling 2026-06-06, sug_1780713253111_g54z: the orchestrator PAYG
  //   HoloCredit wallet is the metered-credit AUTHORITY, not a parallel
  //   absorb-service credit system.
  //
  // creditGate.ts says so in a section header three lines above the code I read
  // to "verify" the tier: "Metered lane (currently UNREACHED) — every
  // StudioOperation above is in FREE_OPERATIONS, so this absorb-credits call is
  // presently dead for all defined operations", and it posts to
  // /api/credits/check and /api/credits/deduct, which exist only on mcp-server
  // and not on the deployed absorb host. So nothing was ever collected.
  //
  // I priced them at 1-5c and wrote on the public pricing page that these five
  // are the ones "we can account for line by line". They were the only rows on
  // the table contradicting a founder decision, and I had marked them verified.
  // Zero is what the customer actually pays; the price was the fiction.
  //
  // When metered Studio work is added it deducts against the orchestrator
  // wallet — creditGate's comment says explicitly: do NOT extend the absorb
  // credits path. Until then these stay here, free and labelled.
  studio_autocomplete: { baseCostCents: 0, tier: 'unbilled', description: 'Code autocomplete (free; we pay the model)' },
  studio_generate: { baseCostCents: 0, tier: 'unbilled', description: 'Code generation (free; we pay the model)' },
  studio_chat: { baseCostCents: 0, tier: 'unbilled', description: 'Brittney chat message (free; we pay the model)' },
  studio_material: {
    baseCostCents: 0,
    tier: 'unbilled',
    description: 'Material/asset generation (free; we pay the model)',
  },
  studio_voice_to_holo: {
    baseCostCents: 0,
    tier: 'unbilled',
    description: 'Voice utterance → HoloScript (free; we pay the model)',
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
  }
> = {
  free: {
    freeCredits: 100,
    // RESTORED to what the pricing page has always shown. This one field went
    // the OTHER way from the price table, and the difference is the point:
    // for prices the server WINS because the server is what charges, so a
    // disagreement means customers were quoted something untrue. Nothing
    // enforces maxProjectsActive anywhere -- its only consumer is the "Active
    // projects" row of PricingSection -- so the displayed number IS the whole
    // meaning of the field, and syncing it down to the server's inert copy cut
    // a published figure (Pro 100 -> 10) with no mechanism behind either value
    // and no decision recorded. Review caught it; the fix is to restore what
    // was published, not to pick the smaller number because it happened to sit
    // in the file that usually wins.
    maxProjectsActive: 3,
    maxAbsorbDepth: 'shallow',
    pipelineEnabled: false,
  },
  pro: {
    freeCredits: 0,
    maxProjectsActive: 100,
    maxAbsorbDepth: 'deep',
    pipelineEnabled: true,
  },
  enterprise: {
    freeCredits: 0,
    maxProjectsActive: 1000,
    maxAbsorbDepth: 'deep',
    pipelineEnabled: true,
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
  openrouter: { input: 3.0, output: 15.0 }, // priced same as anthropic (typical routed model)
  anthropic: { input: 3.0, output: 15.0 },
  xai: { input: 2.0, output: 10.0 },
  openai: { input: 2.5, output: 10.0 },
  gemini: { input: 0.5, output: 1.5 },
  ollama: { input: 0, output: 0 },
  // Our own hardware. Free by the same rule that makes local operations free:
  // we are not billed for it, so neither is the customer.
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
