/**
 * MCPMe Billing Bridge
 *
 * Connects the HoloScript marketplace to the MCPMe billing/metering
 * backend on the MCP Orchestrator. This bridge handles:
 *
 *  1. Tier validation — checks if a user's MCPMe plan allows access
 *  2. Agent catalog — fetches the uAA2++ agent catalog from /marketplace/*
 *  3. Usage metering — tracks downloads against the user's rate limits
 *
 * The orchestrator exposes:
 *   GET  /catalog                → Service catalog + plan tiers
 *   GET  /marketplace/search     → Agent template search
 *   GET  /marketplace/featured   → Featured agent templates
 *   GET  /marketplace/stats      → Marketplace stats
 *   GET  /marketplace/:id        → Template detail
 *   POST /marketplace/:id/install → Install agent (returns uAAL program)
 *   POST /marketplace/publish    → Publish new template
 *   POST /marketplace/:id/review → Review a template
 */

// =============================================================================
// Types
// =============================================================================

export type MCPMeTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface MCPMeUser {
  /** MCPMe API key */
  apiKey: string;
  /** Current subscription tier */
  tier: MCPMeTier;
  /** Usage this billing period */
  usage: {
    apiCalls: number;
    premiumCalls: number;
    computeUnits: number;
  };
  /** Limits for current tier */
  limits: {
    apiCalls: number;       // -1 = unlimited
    premiumCalls: number;
    computeUnits: number;
  };
}

export interface MCPMeServiceEntry {
  id: string;
  name: string;
  description: string;
  tier: MCPMeTier;
  tools: string[];
  computeMultiplier: number;
}

export interface MCPMePlan {
  tier: MCPMeTier;
  name: string;
  price: number;
  features: string[];
}

export interface MCPMeAgentTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  version: string;
  author: string;
  category: string;
  tags: string[];
  capabilities: string[];
  tier: MCPMeTier;
  computeMultiplier: number;
  installs: number;
  rating: number;
  ratingCount: number;
  official: boolean;
}

export interface TierCheckResult {
  allowed: boolean;
  reason?: string;
  requiredTier?: MCPMeTier;
  currentTier: MCPMeTier;
}

// =============================================================================
// Tier hierarchy
// =============================================================================

const TIER_RANK: Record<MCPMeTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

export function tierAllows(userTier: MCPMeTier, requiredTier: MCPMeTier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[requiredTier];
}

// =============================================================================
// Bridge
// =============================================================================

export class MCPMeBillingBridge {
  private orchestratorUrl: string;
  private apiKey: string;
  private cachedCatalog: { services: MCPMeServiceEntry[]; plans: MCPMePlan[] } | null = null;
  private cacheExpiry = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(options: {
    orchestratorUrl?: string;
    apiKey?: string;
  } = {}) {
    this.orchestratorUrl = options.orchestratorUrl
      || process.env.MCP_ORCHESTRATOR_PUBLIC_URL
      || process.env.MCP_ORCHESTRATOR_URL
      || 'http://localhost:5567';
    this.apiKey = options.apiKey || process.env.MCPME_API_KEY || '';
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.orchestratorUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        'x-mcp-api-key': this.apiKey,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`MCPMe API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(new URL(path, this.orchestratorUrl).toString(), {
      method: 'POST',
      headers: {
        'x-mcp-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`MCPMe API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Catalog ───────────────────────────────────────────────────────────

  /**
   * Get the full service catalog (cached for 5 minutes)
   */
  async getCatalog(): Promise<{ services: MCPMeServiceEntry[]; plans: MCPMePlan[] }> {
    if (this.cachedCatalog && Date.now() < this.cacheExpiry) {
      return this.cachedCatalog;
    }

    try {
      const data = await this.get<{ services: MCPMeServiceEntry[]; plans: MCPMePlan[] }>('/catalog');
      this.cachedCatalog = data;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      return data;
    } catch {
      // Offline fallback
      return {
        services: [],
        plans: [
          { tier: 'free', name: 'Free', price: 0, features: ['Open source packages'] },
          { tier: 'starter', name: 'Starter', price: 19, features: ['HoloLand Platform'] },
          { tier: 'pro', name: 'Pro', price: 99, features: ['AI Gateway', 'Brittney AI'] },
          { tier: 'enterprise', name: 'Enterprise', price: 499, features: ['Unlimited'] },
        ],
      };
    }
  }

  // ── Tier Checking ─────────────────────────────────────────────────────

  /**
   * Check if user's tier allows access to a service/content
   */
  checkTier(userTier: MCPMeTier, requiredTier: MCPMeTier): TierCheckResult {
    if (tierAllows(userTier, requiredTier)) {
      return { allowed: true, currentTier: userTier };
    }
    return {
      allowed: false,
      reason: `Requires ${requiredTier} tier (current: ${userTier})`,
      requiredTier,
      currentTier: userTier,
    };
  }

  /**
   * Check if user can access a specific service by ID
   */
  async checkServiceAccess(userTier: MCPMeTier, serviceId: string): Promise<TierCheckResult> {
    const catalog = await this.getCatalog();
    const service = catalog.services.find(s => s.id === serviceId);
    if (!service) {
      return { allowed: false, reason: 'Service not found', currentTier: userTier };
    }
    return this.checkTier(userTier, service.tier);
  }

  // ── Agent Marketplace ─────────────────────────────────────────────────

  /**
   * Search agent templates on the orchestrator
   */
  async searchAgents(options: {
    query?: string;
    category?: string;
    tier?: string;
    sort?: 'popular' | 'recent' | 'rating';
    limit?: number;
    offset?: number;
  } = {}): Promise<{ templates: MCPMeAgentTemplate[]; total: number }> {
    const params: Record<string, string> = {};
    if (options.query) params.q = options.query;
    if (options.category) params.category = options.category;
    if (options.tier) params.tier = options.tier;
    if (options.sort) params.sort = options.sort;
    if (options.limit) params.limit = String(options.limit);
    if (options.offset) params.offset = String(options.offset);

    return this.get('/marketplace/search', params);
  }

  /**
   * Get featured agent templates (official first-party)
   */
  async getFeaturedAgents(): Promise<MCPMeAgentTemplate[]> {
    const data = await this.get<{ templates: MCPMeAgentTemplate[] }>('/marketplace/featured');
    return data.templates;
  }

  /**
   * Get an agent template by ID (includes reviews)
   */
  async getAgentTemplate(id: string): Promise<{
    template: MCPMeAgentTemplate;
    reviews: unknown[];
  }> {
    return this.get(`/marketplace/${id}`);
  }

  /**
   * Install an agent template (returns uAAL program + config)
   * Checks tier before installing
   */
  async installAgent(id: string, userTier: MCPMeTier): Promise<{
    success: boolean;
    error?: string;
    templateId?: string;
    templateName?: string;
    program?: string;
    programType?: 'intent' | 'bytecode';
    config?: { cognitiveHz: number; capabilities: string[] };
  }> {
    // First check the template's tier
    const detail = await this.getAgentTemplate(id);
    const tierCheck = this.checkTier(userTier, detail.template.tier);
    if (!tierCheck.allowed) {
      return {
        success: false,
        error: `Upgrade to ${detail.template.tier} tier to install "${detail.template.name}"`,
      };
    }

    return this.post(`/marketplace/${id}/install`, {});
  }

  /**
   * Marketplace statistics
   */
  async getMarketplaceStats(): Promise<{
    total: number;
    totalInstalls: number;
    categories: number;
    avgRating: number;
  }> {
    return this.get('/marketplace/stats');
  }
}

// =============================================================================
// Singleton
// =============================================================================

let bridge: MCPMeBillingBridge | null = null;

export function getMCPMeBillingBridge(options?: ConstructorParameters<typeof MCPMeBillingBridge>[0]): MCPMeBillingBridge {
  if (!bridge) bridge = new MCPMeBillingBridge(options);
  return bridge;
}
