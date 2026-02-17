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
// MARKETPLACE API INTERFACE
// =============================================================================

/**
 * Main marketplace API interface
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
