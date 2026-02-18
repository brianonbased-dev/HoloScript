/**
 * @fileoverview Type definitions for HoloScript Trait Marketplace
 * @module marketplace-api/types
 */

// =============================================================================
// TRAIT PACKAGE TYPES
// =============================================================================

/**
 * Trait category for organization and discovery
 */
export type TraitCategory =
  | 'rendering'
  | 'physics'
  | 'networking'
  | 'audio'
  | 'ui'
  | 'ai'
  | 'blockchain'
  | 'utility'
  | 'animation'
  | 'input'
  | 'data'
  | 'debug';

/**
 * Supported platforms for traits
 */
export type Platform = 'web' | 'nodejs' | 'unity' | 'unreal' | 'godot' | 'native' | 'wasm' | 'all';

/**
 * License types commonly used
 */
export type LicenseType =
  | 'MIT'
  | 'Apache-2.0'
  | 'GPL-3.0'
  | 'BSD-3-Clause'
  | 'CC-BY-4.0'
  | 'Proprietary'
  | 'UNLICENSED'
  | string;

/**
 * Author information
 */
export interface Author {
  name: string;
  email?: string;
  url?: string;
  verified: boolean;
  avatarUrl?: string;
}

/**
 * Example code for trait documentation
 */
export interface TraitExample {
  name: string;
  description?: string;
  code: string;
  screenshot?: string;
}

/**
 * Full trait package definition
 */
export interface TraitPackage {
  // Identity
  id: string;
  name: string;
  version: string;

  // Metadata
  description: string;
  author: Author;
  license: LicenseType;
  keywords: string[];
  repository?: string;
  homepage?: string;
  bugs?: string;

  // Dependencies
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  devDependencies?: Record<string, string>;

  // Content
  source: string;
  types?: string;
  readme?: string;
  examples?: TraitExample[];
  changelog?: string;

  // Classification
  platforms: Platform[];
  category: TraitCategory;
  subcategory?: string;
  tags?: string[];

  // Status
  verified: boolean;
  deprecated: boolean;
  deprecationMessage?: string;

  // Stats (populated by marketplace)
  downloads: number;
  weeklyDownloads?: number;
  rating: number;
  ratingCount: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date;
}

/**
 * Version information for a trait
 */
export interface VersionInfo {
  version: string;
  publishedAt: Date;
  publishedBy: string;
  downloads: number;
  deprecated: boolean;
  tarballUrl: string;
  shasum: string;
  size: number;
}

/**
 * Summarized trait info for listings
 */
export interface TraitSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  author: Pick<Author, 'name' | 'verified'>;
  category: TraitCategory;
  platforms: Platform[];
  downloads: number;
  rating: number;
  verified: boolean;
  deprecated: boolean;
  updatedAt: Date;
}

// =============================================================================
// SEARCH & DISCOVERY TYPES
// =============================================================================

/**
 * Search query parameters
 */
export interface SearchQuery {
  q?: string;
  category?: TraitCategory;
  platform?: Platform;
  author?: string;
  keywords?: string[];
  verified?: boolean;
  deprecated?: boolean;
  minRating?: number;
  minDownloads?: number;
  sortBy?: 'relevance' | 'downloads' | 'rating' | 'updated' | 'created';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * Search result with pagination
 */
export interface SearchResult {
  results: TraitSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  query: SearchQuery;
  facets?: SearchFacets;
}

/**
 * Faceted search aggregations
 */
export interface SearchFacets {
  categories: FacetCount[];
  platforms: FacetCount[];
  licenses: FacetCount[];
  authors: FacetCount[];
}

export interface FacetCount {
  value: string;
  count: number;
}

// =============================================================================
// PUBLISHING TYPES
// =============================================================================

/**
 * Request to publish a new trait version
 */
export interface PublishRequest {
  name: string;
  version: string;
  description: string;
  license: LicenseType;
  keywords: string[];
  platforms: Platform[];
  category: TraitCategory;

  // Content
  source: string;
  types?: string;
  readme?: string;
  examples?: TraitExample[];

  // Dependencies
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;

  // Optional metadata
  repository?: string;
  homepage?: string;
}

/**
 * Result of publishing operation
 */
export interface PublishResult {
  success: boolean;
  traitId: string;
  version: string;
  tarballUrl: string;
  shasum: string;
  warnings?: string[];
  errors?: string[];
}

/**
 * Unpublish request
 */
export interface UnpublishRequest {
  traitId: string;
  version?: string; // If omitted, unpublishes all versions
  reason?: string;
}

/**
 * Deprecation request
 */
export interface DeprecateRequest {
  traitId: string;
  version?: string;
  message: string;
  replacement?: string; // Suggested replacement trait
}

// =============================================================================
// DEPENDENCY RESOLUTION TYPES
// =============================================================================

/**
 * Trait reference with version constraint
 */
export interface TraitRef {
  name: string;
  version: string; // Semver range
}

/**
 * Resolved dependency tree
 */
export interface DependencyTree {
  root: TraitRef;
  resolved: ResolvedDependency[];
  conflicts: DependencyConflict[];
  warnings: string[];
}

/**
 * A resolved dependency with exact version
 */
export interface ResolvedDependency {
  name: string;
  version: string; // Exact version
  requestedBy: string[];
  depth: number;
  platform?: Platform;
}

/**
 * Dependency version conflict
 */
export interface DependencyConflict {
  name: string;
  requestedVersions: { version: string; requestedBy: string }[];
  resolved?: string;
  resolution?: 'highest' | 'lowest' | 'unresolved';
}

/**
 * Compatibility check result
 */
export interface CompatibilityReport {
  compatible: boolean;
  issues: CompatibilityIssue[];
  suggestions: string[];
}

export interface CompatibilityIssue {
  type: 'version' | 'platform' | 'peer' | 'deprecated';
  trait: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

// =============================================================================
// DOWNLOAD STATS TYPES
// =============================================================================

/**
 * Download statistics for a trait
 */
export interface DownloadStats {
  traitId: string;
  total: number;
  lastDay: number;
  lastWeek: number;
  lastMonth: number;
  lastYear: number;
  history: DailyDownloads[];
}

export interface DailyDownloads {
  date: string; // ISO date string
  count: number;
}

/**
 * Rating for a trait
 */
export interface TraitRating {
  traitId: string;
  userId: string;
  rating: number; // 1-5
  review?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// =============================================================================
// VERIFICATION TYPES
// =============================================================================

/**
 * Verification request for author or trait
 */
export interface VerificationRequest {
  type: 'author' | 'trait';
  targetId: string;
  evidence: VerificationEvidence[];
  requestedAt: Date;
}

export interface VerificationEvidence {
  type: 'github' | 'email' | 'domain' | 'manual';
  value: string;
  verified: boolean;
}

/**
 * Verification status
 */
export interface VerificationStatus {
  verified: boolean;
  verifiedAt?: Date;
  verifiedBy?: string;
  badge?: string;
  level?: 'none' | 'basic' | 'verified' | 'trusted' | 'official';
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  duration: number;
}

// =============================================================================
// RATE LIMITING TYPES
// =============================================================================

/**
 * Rate limit info returned in headers
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  retryAfter?: number; // Seconds until retry allowed
}

/**
 * Rate limit tier based on auth status
 */
export type RateLimitTier = 'anonymous' | 'authenticated' | 'verified' | 'premium';

/**
 * Rate limits per tier (requests per hour)
 */
export const RATE_LIMITS: Record<RateLimitTier, number> = {
  anonymous: 100,
  authenticated: 1000,
  verified: 5000,
  premium: 20000,
};

// =============================================================================
// AGENT PACKAGE TYPES
// =============================================================================

/**
 * Scene pool IDs from TrainingMonkey's canonical scene-pools.ts.
 * Used to tag agent specialization domains for discovery.
 */
export type ScenePoolId =
  | 'game_rpg'
  | 'game_action'
  | 'social_commerce'
  | 'education'
  | 'creative_arts'
  | 'nature_biome'
  | 'scifi_tech'
  | 'architecture'
  | 'ai_agents'
  | 'xr_platform'
  | 'vfx_lighting'
  | 'maker_fabrication'
  | 'general_vr'
  | 'scientific_computing';

/**
 * Pricing model for agent packages
 */
export type AgentPricingModel = 'one_time' | 'subscription';

/**
 * Base model used for fine-tuning
 */
export type BaseAgentModel =
  | 'brittney-qwen-v23'
  | 'qwen2.5-7b'
  | 'qwen2.5-3b'
  | 'llama3.2-3b'
  | string; // Allow future models

/**
 * A trained AI agent package — extends marketplace listing with model artifacts.
 * Agents are sold as Modelfile + GGUF weights stored on Cloudflare R2.
 */
export interface AgentPackage {
  // Identity (mirrors TraitPackage)
  id: string;
  name: string;
  version: string;
  description: string;
  author: Author;
  license: LicenseType;
  keywords: string[];
  repository?: string;

  // Model artifacts
  modelFile: string;          // Full Ollama Modelfile content
  baseModel: BaseAgentModel;  // Which model was fine-tuned
  ggufUrl: string;            // R2 presigned or permanent download URL
  ggufSizeBytes: number;      // File size for display (typically ~4.1GB for Q4_K_M)
  quantization: 'Q4_K_M' | 'Q5_K_M' | 'Q8_0' | 'F16';

  // Training metadata
  exampleCount: number;        // Training examples used
  trainingJobId?: string;      // Reference to GPU fine-tune job
  baseModelVersion?: string;   // Exact version of base model fine-tuned

  // Quality gate (computed by platform, not submitter)
  evalScore: number;           // 0–30 — HoloScript Score from automated 30-prompt eval
  evalPassThreshold: number;   // Minimum to publish (default: 20)
  evalPassedAt?: Date;

  // Discovery
  scenePools: ScenePoolId[];  // Which scene domains this agent specializes in
  tags?: string[];

  // Pricing
  pricingModel: AgentPricingModel;
  price: number;               // One-time price in USD cents (e.g., 999 = $9.99)
  subscriptionPrice?: number;  // Monthly price in USD cents (if pricingModel === 'subscription')

  // Status
  verified: boolean;
  published: boolean;

  // Stats
  downloads: number;
  rating: number;
  ratingCount: number;

  // Royalty
  contributorRoyaltyPercent?: number; // % of each sale distributed to example contributors

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

/**
 * Summarized agent info for marketplace listing cards.
 * Shown in search results and category pages.
 */
export interface AgentSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  author: Pick<Author, 'name' | 'verified'>;
  baseModel: BaseAgentModel;
  evalScore: number;           // Displayed as "HoloScript Score: XX/30"
  exampleCount: number;
  scenePools: ScenePoolId[];
  pricingModel: AgentPricingModel;
  price: number;
  subscriptionPrice?: number;
  ggufSizeBytes: number;
  downloads: number;
  rating: number;
  verified: boolean;
  publishedAt?: Date;
  updatedAt: Date;
}

/**
 * Request to start a GPU fine-tune job.
 * Submitted via POST /api/agents/train.
 */
export interface TrainAgentRequest {
  name: string;                 // Agent display name
  description: string;
  baseModel: BaseAgentModel;
  scenePools: ScenePoolId[];    // Domain specialization tags
  pricingModel: AgentPricingModel;
  price: number;                // In USD cents
  subscriptionPrice?: number;
  keywords?: string[];
  // Training data is sourced from the user's submitted examples in the pool
  // Optional: include extra inline examples for this fine-tune only
  extraExamples?: Array<{ instruction: string; output: string }>;
  webhookUrl?: string;          // Called on job completion/failure
}

/**
 * Status of a GPU fine-tune job.
 * Polled via GET /api/agents/jobs/:jobId/status.
 */
export interface TrainJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'eval_running' | 'publishing' | 'done' | 'failed';
  progressPercent: number;      // 0–100
  currentStep?: string;         // Human-readable: "Epoch 2/3", "Running eval harness", etc.
  evalScore?: number;           // Set once eval completes
  evalPassed?: boolean;
  agentId?: string;             // Set once published
  errorMessage?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedCompletionAt?: Date;
}

/**
 * Request to publish a completed agent to the marketplace.
 * Usually called automatically by the pipeline after eval pass.
 */
export interface AgentPublishRequest {
  jobId: string;
  name: string;
  description: string;
  scenePools: ScenePoolId[];
  pricingModel: AgentPricingModel;
  price: number;
  subscriptionPrice?: number;
  keywords?: string[];
  license?: LicenseType;
}

/**
 * Result of agent publish operation
 */
export interface AgentPublishResult {
  success: boolean;
  agentId: string;
  name: string;
  ggufUrl: string;
  evalScore: number;
  warnings?: string[];
  errors?: string[];
}

/**
 * Search query parameters for agent discovery
 */
export interface AgentSearchQuery {
  q?: string;
  scenePools?: ScenePoolId[];
  baseModel?: BaseAgentModel;
  minEvalScore?: number;        // Filter by HoloScript Score
  maxPrice?: number;            // In USD cents
  pricingModel?: AgentPricingModel;
  verified?: boolean;
  minDownloads?: number;
  sortBy?: 'relevance' | 'downloads' | 'rating' | 'eval_score' | 'price' | 'updated';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * Agent search result with pagination
 */
export interface AgentSearchResult {
  results: AgentSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  query: AgentSearchQuery;
}

/**
 * Training example submitted by a user to the shared pool
 */
export interface TrainingExample {
  instruction: string;          // Natural language prompt
  output: string;               // Expected HoloScript DSL output
  scenePool: ScenePoolId;       // Domain tag
  contributorId: string;        // User who submitted
  validationScore?: number;     // From @holoscript/ai-validator (0–1)
  approvedAt?: Date;
}

/**
 * Royalty record: tracks contributor earnings per model download
 */
export interface RoyaltyRecord {
  contributorId: string;
  agentId: string;
  exampleCount: number;         // Their examples used in this model
  totalExamplesInModel: number; // All examples in the model
  sharePercent: number;         // exampleCount / totalExamplesInModel
  earnedPerDownload: number;    // In USD cents
  totalEarned: number;          // Cumulative earnings
  lastUpdatedAt: Date;
}

// =============================================================================
// MARKETPLACE API INTERFACE
// =============================================================================

/**
 * Main marketplace API interface (trait packages)
 */
export interface IMarketplaceAPI {
  // Publishing
  publish(trait: PublishRequest, token: string): Promise<PublishResult>;
  unpublish(request: UnpublishRequest, token: string): Promise<void>;
  deprecate(request: DeprecateRequest, token: string): Promise<void>;

  // Discovery
  search(query: SearchQuery): Promise<SearchResult>;
  getTrait(traitId: string, version?: string): Promise<TraitPackage>;
  getVersions(traitId: string): Promise<VersionInfo[]>;
  getPopular(category?: TraitCategory, limit?: number): Promise<TraitSummary[]>;
  getRecent(limit?: number): Promise<TraitSummary[]>;

  // Dependencies
  resolveDependencies(traits: TraitRef[]): Promise<DependencyTree>;
  checkCompatibility(traits: TraitRef[]): Promise<CompatibilityReport>;

  // Stats
  getDownloadStats(traitId: string): Promise<DownloadStats>;
  recordDownload(traitId: string, version: string): Promise<void>;

  // Ratings
  rateTrait(traitId: string, rating: number, review?: string, token?: string): Promise<void>;
  getRatings(traitId: string, page?: number): Promise<TraitRating[]>;

  // Verification
  requestVerification(request: VerificationRequest, token: string): Promise<void>;
  getVerificationStatus(targetId: string): Promise<VerificationStatus>;
}

/**
 * Agent marketplace API interface.
 * Extends the trait marketplace with AI agent training and distribution.
 *
 * Routes:
 *   POST   /api/agents/train         → trainAgent()
 *   GET    /api/agents/jobs/:id      → getTrainJobStatus()
 *   POST   /api/agents/publish       → publishAgent()
 *   GET    /api/agents/search        → searchAgents()
 *   GET    /api/agents/:id           → getAgent()
 *   GET    /api/agents/:id/download  → getDownloadUrl()
 *   POST   /api/agents/examples      → submitTrainingExample()
 *   GET    /api/agents/royalties     → getRoyalties()
 */
export interface IAgentMarketplaceAPI {
  // Training pipeline
  trainAgent(request: TrainAgentRequest, token: string): Promise<{ jobId: string }>;
  getTrainJobStatus(jobId: string, token: string): Promise<TrainJobStatus>;
  cancelTrainJob(jobId: string, token: string): Promise<void>;

  // Publishing
  publishAgent(request: AgentPublishRequest, token: string): Promise<AgentPublishResult>;
  unpublishAgent(agentId: string, token: string): Promise<void>;

  // Discovery
  searchAgents(query: AgentSearchQuery): Promise<AgentSearchResult>;
  getAgent(agentId: string): Promise<AgentPackage>;
  getFeaturedAgents(scenePool?: ScenePoolId, limit?: number): Promise<AgentSummary[]>;
  getRecentAgents(limit?: number): Promise<AgentSummary[]>;
  getTopAgents(sortBy: 'downloads' | 'eval_score' | 'rating', limit?: number): Promise<AgentSummary[]>;

  // Purchase & download
  purchaseAgent(agentId: string, token: string): Promise<{ downloadUrl: string; expiresAt: Date }>;
  getDownloadUrl(agentId: string, token: string): Promise<{ url: string; expiresAt: Date }>;

  // Training data contribution
  submitTrainingExample(example: Omit<TrainingExample, 'contributorId' | 'approvedAt'>, token: string): Promise<{ exampleId: string; validationScore: number }>;
  getMyExamples(token: string, page?: number): Promise<TrainingExample[]>;

  // Royalties
  getRoyalties(token: string): Promise<RoyaltyRecord[]>;
  getRoyaltySummary(token: string): Promise<{ totalEarned: number; pendingPayout: number; exampleCount: number }>;

  // Stats
  recordAgentDownload(agentId: string): Promise<void>;
  getAgentDownloadStats(agentId: string): Promise<DownloadStats>;

  // Ratings
  rateAgent(agentId: string, rating: number, review?: string, token?: string): Promise<void>;
  getAgentRatings(agentId: string, page?: number): Promise<TraitRating[]>;
}
