/**
 * HoloScript Cloud — Service Layer
 *
 * Provides authenticated access to HoloScript's cloud-hosted AI models and services.
 * Three-tier revenue model:
 *
 * **Free (email sign-up):**
 * - Brittney AI assistant (try before you buy)
 * - All manual studio tools (scene builder, character customizer, animation, etc.)
 * - Community assets and templates
 * - Marketplace publishing and selling (revenue share — HoloScript takes commission)
 * - Everything works — no paywalls on core functionality
 *
 * **Cloud Service (token-based billing):**
 * - Pay-per-token usage when using Brittney via HoloScript Cloud
 * - Scene generation, code assistance, asset recommendations
 * - Primary revenue driver
 *
 * **Pro Subscription:**
 * - Vision model access for AI generation (characters, creatures, scenes, etc.)
 * - Priority processing and higher rate limits
 * - Premium asset library
 * - Reduced marketplace commission rates
 */

// ─── Account & Subscription Types ───────────────────────────────────────────

export type SubscriptionTier = 'free' | 'pro';

export interface AccountStatus {
  email: string;
  tier: SubscriptionTier;
  active: boolean;
  expiresAt: string | null;
  tokenBalance: TokenBalance;
  usageThisMonth: UsageMetrics;
  limits: UsageLimits;
}

/** @deprecated Use AccountStatus instead */
export type SubscriptionStatus = AccountStatus;

export interface TokenBalance {
  available: number;             // tokens remaining
  used: number;                  // tokens used this billing period
  billingPeriodStart: string;
  billingPeriodEnd: string;
}

export interface UsageMetrics {
  tokenUsage: number;            // total tokens consumed
  aiGenerations: number;         // vision model generations (Pro)
  storageBytes: number;
  marketplaceListings: number;
}

export interface UsageLimits {
  maxTokensPerMonth: number;     // cloud Brittney token cap (free tier has a trial allowance)
  maxAiGenerations: number;      // vision model generations per month (Pro only)
  maxStorageBytes: number;       // cloud storage
  maxMarketplaceListings: number; // all tiers can publish (revenue share model)
}

// ─── AI Generation Types ────────────────────────────────────────────────────

export type GenerationDomain =
  | 'character'
  | 'creature'
  | 'avatar'
  | 'scene'
  | 'animation'
  | 'shader'
  | 'texture'
  | 'asset';

export interface CloudGenerationRequest {
  domain: GenerationDomain;
  prompt: string;
  referenceImages?: string[];    // base64 or URLs
  style?: string;
  parameters?: Record<string, unknown>;
}

export interface CloudGenerationResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  domain: GenerationDomain;
  outputUrl?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// ─── Marketplace Types ──────────────────────────────────────────────────────

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  currency: 'USD' | 'ETH';
  creatorAddress: string;
  thumbnailUrl: string;
  assetUrl: string;
  downloads: number;
  rating: number;
  tags: string[];
  createdAt: string;
}

// ─── Character Data Types ───────────────────────────────────────────────────

export interface CharacterData {
  id: string;
  name: string;
  modelUrl: string;
  thumbnailUrl: string;
  morphTargets: Record<string, number>;
  skinColor: string;
  wardrobeItems: string[];       // item IDs
  animations: string[];          // clip IDs
  vrm?: {
    version: '1.0';
    meta: Record<string, unknown>;
  };
  createdAt: string;
  updatedAt: string;
}

// ─── Creature Factory Types ─────────────────────────────────────────────────

export interface CreatureConfig {
  baseSpecies: string;
  bodyPlan: 'biped' | 'quadruped' | 'serpentine' | 'avian' | 'custom';
  traits: string[];
  scale: number;
  colorPalette: string[];
  behaviorPreset?: string;
}

// ─── Service Client ─────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://cloud.holoscript.dev/api/v1';

export interface HoloScriptCloudConfig {
  baseUrl?: string;
  apiKey?: string;
}

export class HoloScriptCloudClient {
  private baseUrl: string;
  private apiKey: string | null;

  constructor(config: HoloScriptCloudConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.apiKey = config.apiKey ?? null;
  }

  /** Get current account status (tier, tokens, usage) */
  async getAccount(): Promise<AccountStatus> {
    return this.request<AccountStatus>('/account');
  }

  /** @deprecated Use getAccount() instead */
  async getSubscription(): Promise<AccountStatus> {
    return this.getAccount();
  }

  /** Check if user has Pro access */
  async isPro(): Promise<boolean> {
    const account = await this.getAccount();
    return account.tier === 'pro' && account.active;
  }

  /** Get current token balance */
  async getTokenBalance(): Promise<TokenBalance> {
    const account = await this.getAccount();
    return account.tokenBalance;
  }

  /** Submit an AI generation request (any domain) */
  async generate(request: CloudGenerationRequest): Promise<CloudGenerationResult> {
    return this.request<CloudGenerationResult>('/generate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /** Poll generation status */
  async getGenerationStatus(id: string): Promise<CloudGenerationResult> {
    return this.request<CloudGenerationResult>(`/generate/${id}`);
  }

  /** List marketplace items */
  async listMarketplace(params?: {
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: MarketplaceItem[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    return this.request(`/marketplace?${query.toString()}`);
  }

  /** Publish an asset to the marketplace (all tiers — revenue share model) */
  async publishToMarketplace(item: Omit<MarketplaceItem, 'id' | 'downloads' | 'rating' | 'createdAt'>): Promise<MarketplaceItem> {
    return this.request<MarketplaceItem>('/marketplace', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HoloScript Cloud error ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }
}
