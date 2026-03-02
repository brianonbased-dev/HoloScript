/**
 * @fileoverview Plugin Package Format Specification for HoloScript Plugin Marketplace
 *
 * Defines the canonical package format for distributing HoloScript Studio plugins
 * through the marketplace. A plugin package (.hspkg) is a signed archive containing:
 *
 *   1. plugin.manifest.json  - Package metadata, permissions, dependencies
 *   2. dist/                 - Compiled plugin code (JS bundle)
 *   3. assets/               - Icons, screenshots, media
 *   4. README.md             - Documentation
 *   5. CHANGELOG.md          - Version history
 *   6. LICENSE               - License file
 *   7. .signature            - Ed25519 digital signature of package contents
 *
 * The manifest is the single source of truth for marketplace indexing, permission
 * gating, and sandbox configuration.
 *
 * @module marketplace-api/PluginPackageSpec
 */

import type { SandboxPermission, NetworkPolicy } from '@holoscript/studio-plugin-sdk/sandbox/types';
import type { TraitCategory, Platform, LicenseType, Author } from './types.js';

// =============================================================================
// PLUGIN PACKAGE MANIFEST (plugin.manifest.json)
// =============================================================================

/**
 * Plugin category extends trait categories with plugin-specific groupings
 */
export type PluginCategory =
  | TraitCategory
  | 'editor'           // Editor extensions (panels, toolbars, themes)
  | 'workflow'          // Workflow automation and node types
  | 'export'           // Export target plugins
  | 'collaboration'    // Real-time collaboration tools
  | 'analytics'        // Telemetry, profiling, analytics
  | 'accessibility'    // A11y tools and audits
  | 'marketplace'      // Marketplace extensions (themes, templates)
  | 'integration';     // Third-party service integrations

/**
 * Plugin pricing model
 */
export type PluginPricingModel = 'free' | 'paid' | 'freemium' | 'subscription';

/**
 * Plugin pricing configuration
 */
export interface PluginPricing {
  /** Pricing model */
  model: PluginPricingModel;
  /** One-time price in USD cents (e.g., 999 = $9.99). Required for 'paid' model. */
  price?: number;
  /** Monthly subscription price in USD cents. Required for 'subscription' model. */
  monthlyPrice?: number;
  /** Annual subscription price in USD cents (discount vs monthly). */
  annualPrice?: number;
  /** Free trial duration in days (for paid/subscription models) */
  trialDays?: number;
}

/**
 * Plugin entrypoint specification
 */
export interface PluginEntrypoint {
  /** Main JS bundle file path relative to package root (e.g., "dist/index.js") */
  main: string;
  /** TypeScript type declarations (e.g., "dist/index.d.ts") */
  types?: string;
  /** CSS stylesheet (e.g., "dist/styles.css") */
  styles?: string;
  /** Worker script for background tasks (e.g., "dist/worker.js") */
  worker?: string;
}

/**
 * Plugin UI contribution declarations.
 * Declares what UI extensions the plugin registers without needing to load it.
 * Used by Studio to show plugin contributions in menus/palettes before activation.
 */
export interface PluginContributions {
  /** Custom panel declarations */
  panels?: PluginPanelContribution[];
  /** Custom toolbar button declarations */
  toolbarButtons?: PluginToolbarContribution[];
  /** Custom menu item declarations */
  menuItems?: PluginMenuContribution[];
  /** Custom node type declarations */
  nodeTypes?: PluginNodeContribution[];
  /** Custom content type declarations */
  contentTypes?: PluginContentTypeContribution[];
  /** Keyboard shortcut declarations */
  shortcuts?: PluginShortcutContribution[];
  /** MCP server declarations */
  mcpServers?: PluginMCPServerContribution[];
}

export interface PluginPanelContribution {
  id: string;
  label: string;
  icon?: string;
  position?: 'left' | 'right' | 'bottom' | 'modal';
}

export interface PluginToolbarContribution {
  id: string;
  label: string;
  icon?: string;
  tooltip?: string;
  position?: 'left' | 'center' | 'right';
}

export interface PluginMenuContribution {
  id: string;
  label: string;
  path: string;
  icon?: string;
}

export interface PluginNodeContribution {
  type: string;
  label: string;
  category?: string;
  icon?: string;
  domain: 'workflow' | 'behaviorTree';
}

export interface PluginContentTypeContribution {
  type: string;
  label: string;
  extension: string;
  icon?: string;
}

export interface PluginShortcutContribution {
  id: string;
  keys: string;
  description: string;
  scope?: 'global' | 'editor' | 'panel';
}

export interface PluginMCPServerContribution {
  id: string;
  name: string;
  description?: string;
}

/**
 * Compatibility requirements for the plugin
 */
export interface PluginCompatibility {
  /** Minimum HoloScript Studio version required (semver range, e.g., ">=3.40.0") */
  studioVersion: string;
  /** Supported platforms (default: ['all']) */
  platforms?: Platform[];
  /** Required Studio features/APIs */
  requiredFeatures?: string[];
  /** Plugin API version this plugin targets */
  apiVersion?: string;
}

/**
 * Plugin sandbox security configuration.
 * Extends the base PluginSandboxManifest with marketplace-specific fields.
 */
export interface PluginSecurityManifest {
  /** Permissions requested by the plugin */
  permissions: SandboxPermission[];

  /** Network access policy (required if network permissions requested) */
  networkPolicy?: NetworkPolicy;

  /**
   * Trust level:
   * - 'sandboxed': Full iframe isolation (default, required for third-party)
   * - 'trusted': Runs in main thread (first-party only, requires HoloScript Team signing)
   */
  trustLevel: 'sandboxed' | 'trusted';

  /** Maximum memory budget in MB (default: 64, max: 256) */
  memoryBudget?: number;

  /** Maximum CPU time per frame in ms (default: 16) */
  cpuBudget?: number;

  /** Content Security Policy overrides */
  csp?: Record<string, string[]>;
}

/**
 * Plugin screenshot/media for marketplace listing
 */
export interface PluginScreenshot {
  /** Path relative to package root (e.g., "assets/screenshot-1.png") */
  path: string;
  /** Alt text for accessibility */
  alt: string;
  /** Caption/description */
  caption?: string;
  /** Whether this is the primary/featured screenshot */
  featured?: boolean;
}

/**
 * The complete plugin package manifest (plugin.manifest.json).
 * This is the single source of truth for marketplace indexing, permission
 * gating, and sandbox configuration.
 */
export interface PluginPackageManifest {
  /** Schema version for forward compatibility */
  $schema: 'https://holoscript.dev/schemas/plugin-manifest/v1';

  // ── Identity ────────────────────────────────────────────────────────────
  /** Unique plugin identifier (scoped, e.g., "@author/plugin-name") */
  id: string;
  /** Display name */
  name: string;
  /** Semantic version */
  version: string;
  /** Brief description (max 200 chars) */
  description: string;

  // ── Author & License ────────────────────────────────────────────────────
  /** Author information */
  author: Author;
  /** SPDX license identifier */
  license: LicenseType;
  /** Repository URL */
  repository?: string;
  /** Homepage URL */
  homepage?: string;
  /** Bug tracker URL */
  bugs?: string;

  // ── Classification ──────────────────────────────────────────────────────
  /** Primary category */
  category: PluginCategory;
  /** Subcategory for finer grouping */
  subcategory?: string;
  /** Search keywords (max 20) */
  keywords: string[];
  /** Tags for additional discovery (e.g., "spatial-audio", "vr-only") */
  tags?: string[];

  // ── Entrypoints ─────────────────────────────────────────────────────────
  /** Plugin code entrypoints */
  entrypoint: PluginEntrypoint;

  // ── Security & Sandbox ──────────────────────────────────────────────────
  /** Security manifest (required for marketplace plugins) */
  security: PluginSecurityManifest;

  // ── Dependencies ────────────────────────────────────────────────────────
  /** Runtime dependencies (other plugins or traits, semver ranges) */
  dependencies?: Record<string, string>;
  /** Peer dependencies (must be installed separately) */
  peerDependencies?: Record<string, string>;

  // ── Contributions ───────────────────────────────────────────────────────
  /** UI contributions declared by this plugin */
  contributions?: PluginContributions;

  // ── Compatibility ───────────────────────────────────────────────────────
  /** Compatibility requirements */
  compatibility: PluginCompatibility;

  // ── Marketplace Listing ─────────────────────────────────────────────────
  /** Detailed description / README content (markdown) */
  readme?: string;
  /** Changelog content (markdown) */
  changelog?: string;
  /** Screenshots and media for marketplace listing */
  screenshots?: PluginScreenshot[];
  /** Icon path relative to package root (e.g., "assets/icon.png") */
  icon?: string;
  /** Pricing configuration */
  pricing?: PluginPricing;

  // ── Marketplace Metadata (populated by server, not by author) ───────────
  /** Total download count */
  downloads?: number;
  /** Average rating (1-5) */
  rating?: number;
  /** Number of ratings */
  ratingCount?: number;
  /** Whether the plugin is verified by HoloScript team */
  verified?: boolean;
  /** Whether the plugin is deprecated */
  deprecated?: boolean;
  /** Deprecation message */
  deprecationMessage?: string;

  // ── Timestamps (populated by server) ────────────────────────────────────
  /** When the plugin was first published */
  createdAt?: Date;
  /** When this version was last updated */
  updatedAt?: Date;
  /** When this version was published */
  publishedAt?: Date;
}

// =============================================================================
// PLUGIN PACKAGE ARCHIVE (.hspkg)
// =============================================================================

/**
 * Plugin package archive structure.
 * The .hspkg file is a gzipped tarball containing these entries.
 */
export interface PluginPackageArchive {
  /** The parsed manifest */
  manifest: PluginPackageManifest;
  /** SHA-256 hash of the archive contents (excluding signature) */
  contentHash: string;
  /** Ed25519 digital signature of contentHash */
  signature?: PluginSignature;
  /** Total archive size in bytes */
  size: number;
  /** Individual file entries in the archive */
  files: PluginPackageFile[];
}

/**
 * A single file entry in the plugin package archive
 */
export interface PluginPackageFile {
  /** File path relative to package root */
  path: string;
  /** File size in bytes */
  size: number;
  /** SHA-256 hash of file contents */
  hash: string;
}

// =============================================================================
// DIGITAL SIGNATURE
// =============================================================================

/**
 * Ed25519 digital signature for package integrity and author verification.
 *
 * Signing flow:
 *   1. Author generates Ed25519 keypair (private key stays local)
 *   2. Author registers public key with marketplace (tied to their account)
 *   3. On publish, author signs the contentHash with their private key
 *   4. Marketplace verifies signature against registered public key
 *   5. On install, client verifies signature against marketplace's copy of public key
 *
 * This provides:
 *   - Package integrity (content has not been tampered with)
 *   - Author authentication (only the registered author could have signed)
 *   - Non-repudiation (author cannot deny publishing the package)
 */
export interface PluginSignature {
  /** Signature algorithm identifier */
  algorithm: 'Ed25519';
  /** Base64-encoded Ed25519 signature of the contentHash */
  signature: string;
  /** Base64-encoded Ed25519 public key of the signer */
  publicKey: string;
  /** Key fingerprint (SHA-256 of public key, hex-encoded, first 16 chars) */
  keyFingerprint: string;
  /** ISO timestamp of when the signature was created */
  signedAt: string;
  /** Optional: key ID registered with marketplace (for key rotation) */
  keyId?: string;
}

/**
 * Result of signature verification
 */
export interface SignatureVerificationResult {
  /** Whether the signature is valid */
  valid: boolean;
  /** Whether the signing key is registered and trusted */
  trusted: boolean;
  /** The verified author identity (if trusted) */
  author?: string;
  /** Key fingerprint that was used to sign */
  keyFingerprint: string;
  /** Verification errors (if any) */
  errors: string[];
  /** Verification warnings (e.g., key about to expire) */
  warnings: string[];
}

// =============================================================================
// PLUGIN VERSION INFO
// =============================================================================

/**
 * Version information for a plugin (marketplace listing)
 */
export interface PluginVersionInfo {
  /** Semantic version */
  version: string;
  /** When this version was published */
  publishedAt: Date;
  /** Who published this version */
  publishedBy: string;
  /** Download count for this version */
  downloads: number;
  /** Whether this version is deprecated */
  deprecated: boolean;
  /** Download URL for the .hspkg archive */
  packageUrl: string;
  /** SHA-256 hash of the .hspkg archive */
  shasum: string;
  /** Archive size in bytes */
  size: number;
  /** Signature verification status */
  signatureStatus: 'signed' | 'unsigned' | 'invalid';
  /** Minimum Studio version required */
  studioVersion: string;
  /** Release notes for this version */
  releaseNotes?: string;
}

// =============================================================================
// PLUGIN SUMMARY (for marketplace listing cards)
// =============================================================================

/**
 * Summarized plugin info for marketplace listing cards.
 * Lightweight representation for search results and category pages.
 */
export interface PluginSummary {
  /** Plugin ID */
  id: string;
  /** Display name */
  name: string;
  /** Latest version */
  version: string;
  /** Brief description */
  description: string;
  /** Author info (name + verified status) */
  author: Pick<Author, 'name' | 'verified' | 'avatarUrl'>;
  /** Primary category */
  category: PluginCategory;
  /** Search keywords */
  keywords: string[];
  /** Icon URL (resolved from CDN) */
  iconUrl?: string;
  /** Pricing info */
  pricing?: PluginPricing;
  /** Total downloads */
  downloads: number;
  /** Average rating */
  rating: number;
  /** Number of ratings */
  ratingCount: number;
  /** Whether verified by HoloScript team */
  verified: boolean;
  /** Whether deprecated */
  deprecated: boolean;
  /** Signature status of latest version */
  signatureStatus: 'signed' | 'unsigned' | 'invalid';
  /** Supported platforms */
  platforms: Platform[];
  /** Required permissions (for transparency) */
  permissions: SandboxPermission[];
  /** Last updated date */
  updatedAt: Date;
  /** First published date */
  createdAt: Date;
}

// =============================================================================
// PLUGIN SEARCH
// =============================================================================

/**
 * Search query parameters for plugin discovery
 */
export interface PluginSearchQuery {
  /** Full-text search query */
  q?: string;
  /** Filter by category */
  category?: PluginCategory;
  /** Filter by platform */
  platform?: Platform;
  /** Filter by author */
  author?: string;
  /** Filter by keywords */
  keywords?: string[];
  /** Filter by pricing model */
  pricingModel?: PluginPricingModel;
  /** Maximum price in USD cents (for paid plugins) */
  maxPrice?: number;
  /** Filter by verification status */
  verified?: boolean;
  /** Filter by signature status */
  signed?: boolean;
  /** Filter by specific permission (show only plugins requesting this permission) */
  permission?: SandboxPermission;
  /** Exclude deprecated plugins (default: true) */
  excludeDeprecated?: boolean;
  /** Minimum rating filter */
  minRating?: number;
  /** Minimum downloads filter */
  minDownloads?: number;
  /** Sort by */
  sortBy?: 'relevance' | 'downloads' | 'rating' | 'updated' | 'created' | 'price' | 'name';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** Page number (1-indexed) */
  page?: number;
  /** Results per page (max 100) */
  limit?: number;
}

/**
 * Plugin search result with pagination
 */
export interface PluginSearchResult {
  /** Matching plugins */
  results: PluginSummary[];
  /** Total matching count */
  total: number;
  /** Current page */
  page: number;
  /** Results per page */
  limit: number;
  /** Whether more results exist */
  hasMore: boolean;
  /** The query that produced these results */
  query: PluginSearchQuery;
  /** Faceted search aggregations */
  facets?: PluginSearchFacets;
}

/**
 * Faceted search aggregations for plugin search
 */
export interface PluginSearchFacets {
  categories: Array<{ value: string; count: number }>;
  platforms: Array<{ value: string; count: number }>;
  pricingModels: Array<{ value: string; count: number }>;
  permissions: Array<{ value: string; count: number }>;
  authors: Array<{ value: string; count: number }>;
}

// =============================================================================
// PLUGIN PUBLISH REQUEST
// =============================================================================

/**
 * Request to publish a new plugin version to the marketplace
 */
export interface PluginPublishRequest {
  /** The plugin package manifest */
  manifest: Omit<PluginPackageManifest,
    | '$schema'
    | 'downloads'
    | 'rating'
    | 'ratingCount'
    | 'verified'
    | 'deprecated'
    | 'deprecationMessage'
    | 'createdAt'
    | 'updatedAt'
    | 'publishedAt'
  >;
  /** Base64-encoded plugin source bundle */
  bundle: string;
  /** Ed25519 signature of the bundle hash */
  signature?: {
    signature: string;
    publicKey: string;
    keyId?: string;
  };
  /** README content (markdown) */
  readme?: string;
  /** Changelog content (markdown) */
  changelog?: string;
  /** Release notes for this specific version */
  releaseNotes?: string;
}

/**
 * Result of a plugin publish operation
 */
export interface PluginPublishResult {
  /** Whether the publish succeeded */
  success: boolean;
  /** Plugin ID */
  pluginId: string;
  /** Published version */
  version: string;
  /** Download URL for the package */
  packageUrl: string;
  /** SHA-256 hash of the package */
  shasum: string;
  /** Signature verification result (if signature was provided) */
  signatureVerification?: SignatureVerificationResult;
  /** Warnings (non-fatal issues) */
  warnings?: string[];
  /** Errors (fatal issues, publish failed) */
  errors?: string[];
}

// =============================================================================
// PLUGIN INSTALL TYPES
// =============================================================================

/**
 * Plugin installation state (client-side)
 */
export type PluginInstallState =
  | 'not_installed'
  | 'downloading'
  | 'verifying'         // Signature + integrity check
  | 'extracting'
  | 'resolving_deps'    // Resolving and installing dependencies
  | 'installing'        // Running install hooks
  | 'installed'
  | 'enabled'
  | 'disabled'
  | 'update_available'
  | 'error';

/**
 * Installed plugin record (stored locally by Studio)
 */
export interface InstalledPlugin {
  /** Plugin ID */
  pluginId: string;
  /** Installed version */
  version: string;
  /** Installation state */
  state: PluginInstallState;
  /** Whether the plugin is currently enabled */
  enabled: boolean;
  /** Local path to extracted plugin files */
  installPath: string;
  /** Manifest from the installed package */
  manifest: PluginPackageManifest;
  /** Permissions granted by the user */
  grantedPermissions: SandboxPermission[];
  /** Signature verification result from install time */
  signatureVerification?: SignatureVerificationResult;
  /** When the plugin was installed */
  installedAt: Date;
  /** When the plugin was last updated */
  updatedAt: Date;
  /** When the plugin was last enabled */
  enabledAt?: Date;
  /** Error message (if state is 'error') */
  error?: string;
  /** Available update version (if state is 'update_available') */
  availableUpdate?: string;
}

/**
 * Plugin install request (client-side)
 */
export interface PluginInstallRequest {
  /** Plugin ID to install */
  pluginId: string;
  /** Specific version to install (default: latest) */
  version?: string;
  /** Whether to automatically enable after install (default: true) */
  autoEnable?: boolean;
  /** Whether to install dependencies automatically (default: true) */
  installDependencies?: boolean;
  /** Permissions to pre-grant (skips permission prompt for these) */
  preGrantPermissions?: SandboxPermission[];
}

/**
 * Result of a plugin install operation (client-side)
 */
export interface PluginInstallResult {
  /** Whether the install succeeded */
  success: boolean;
  /** Installed plugin record */
  plugin?: InstalledPlugin;
  /** Dependencies that were also installed */
  installedDependencies?: InstalledPlugin[];
  /** Errors encountered */
  errors?: string[];
  /** Warnings (non-fatal) */
  warnings?: string[];
}

// =============================================================================
// MARKETPLACE UI DATA TYPES
// =============================================================================

/**
 * Plugin detail page data (full marketplace listing)
 */
export interface PluginDetailData {
  /** Full plugin manifest */
  manifest: PluginPackageManifest;
  /** All published versions */
  versions: PluginVersionInfo[];
  /** README rendered as HTML */
  readmeHtml?: string;
  /** Changelog rendered as HTML */
  changelogHtml?: string;
  /** Download statistics */
  stats: PluginDownloadStats;
  /** User ratings */
  ratings: PluginRatingData;
  /** Related/similar plugins */
  relatedPlugins: PluginSummary[];
  /** Installation state (client-side, if Studio is connected) */
  installState?: PluginInstallState;
  /** Current installed version (if installed) */
  installedVersion?: string;
}

/**
 * Download statistics for marketplace display
 */
export interface PluginDownloadStats {
  /** Total all-time downloads */
  total: number;
  /** Downloads in the last 24 hours */
  lastDay: number;
  /** Downloads in the last 7 days */
  lastWeek: number;
  /** Downloads in the last 30 days */
  lastMonth: number;
  /** Daily download history (last 90 days) */
  history: Array<{ date: string; count: number }>;
}

/**
 * Rating data for marketplace display
 */
export interface PluginRatingData {
  /** Average rating (1-5) */
  average: number;
  /** Total number of ratings */
  count: number;
  /** Distribution (how many 1-star, 2-star, etc.) */
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  /** Recent reviews */
  reviews: PluginReview[];
}

/**
 * A user review of a plugin
 */
export interface PluginReview {
  /** Review ID */
  id: string;
  /** Reviewer user ID */
  userId: string;
  /** Reviewer display name */
  userName: string;
  /** Reviewer avatar URL */
  userAvatarUrl?: string;
  /** Star rating (1-5) */
  rating: number;
  /** Review title */
  title?: string;
  /** Review body */
  body?: string;
  /** Plugin version that was reviewed */
  pluginVersion: string;
  /** When the review was posted */
  createdAt: Date;
  /** When the review was last edited */
  updatedAt?: Date;
  /** Number of "helpful" votes */
  helpfulCount: number;
}

/**
 * Marketplace home page data
 */
export interface MarketplaceHomeData {
  /** Featured/curated plugins */
  featured: PluginSummary[];
  /** Most popular plugins */
  popular: PluginSummary[];
  /** Recently published plugins */
  recent: PluginSummary[];
  /** Trending plugins (fastest growing in downloads) */
  trending: PluginSummary[];
  /** Category overview with counts */
  categories: Array<{
    category: PluginCategory;
    label: string;
    icon: string;
    count: number;
  }>;
  /** Total plugin count */
  totalPlugins: number;
  /** Total author count */
  totalAuthors: number;
}

/**
 * Author profile page data
 */
export interface AuthorProfileData {
  /** Author information */
  author: Author;
  /** Verification status */
  verificationLevel: 'none' | 'basic' | 'verified' | 'trusted' | 'official';
  /** Plugins published by this author */
  plugins: PluginSummary[];
  /** Total downloads across all plugins */
  totalDownloads: number;
  /** Average rating across all plugins */
  averageRating: number;
  /** Member since date */
  memberSince: Date;
}

// =============================================================================
// PLUGIN MARKETPLACE API INTERFACE
// =============================================================================

/**
 * Plugin marketplace API interface.
 * Extends the trait marketplace with Studio plugin distribution.
 *
 * Routes:
 *   POST   /api/plugins              -> publishPlugin()
 *   GET    /api/plugins              -> searchPlugins()
 *   GET    /api/plugins/featured     -> getFeaturedPlugins()
 *   GET    /api/plugins/popular      -> getPopularPlugins()
 *   GET    /api/plugins/recent       -> getRecentPlugins()
 *   GET    /api/plugins/trending     -> getTrendingPlugins()
 *   GET    /api/plugins/home         -> getMarketplaceHome()
 *   GET    /api/plugins/:id          -> getPlugin()
 *   GET    /api/plugins/:id/versions -> getPluginVersions()
 *   GET    /api/plugins/:id/download -> downloadPlugin()
 *   GET    /api/plugins/:id/stats    -> getPluginStats()
 *   POST   /api/plugins/:id/ratings  -> ratePlugin()
 *   GET    /api/plugins/:id/ratings  -> getPluginRatings()
 *   DELETE /api/plugins/:id          -> unpublishPlugin()
 *   POST   /api/plugins/:id/deprecate -> deprecatePlugin()
 *   POST   /api/plugins/verify-signature -> verifyPluginSignature()
 *   POST   /api/plugins/resolve-deps    -> resolvePluginDependencies()
 *   GET    /api/authors/:id          -> getAuthorProfile()
 *   POST   /api/keys                 -> registerSigningKey()
 *   DELETE /api/keys/:keyId          -> revokeSigningKey()
 */
export interface IPluginMarketplaceAPI {
  // ── Publishing ────────────────────────────────────────────────────────────
  publishPlugin(request: PluginPublishRequest, token: string): Promise<PluginPublishResult>;
  unpublishPlugin(pluginId: string, version?: string, token?: string): Promise<void>;
  deprecatePlugin(pluginId: string, message: string, replacement?: string, token?: string): Promise<void>;

  // ── Discovery ─────────────────────────────────────────────────────────────
  searchPlugins(query: PluginSearchQuery): Promise<PluginSearchResult>;
  getPlugin(pluginId: string, version?: string): Promise<PluginDetailData>;
  getPluginVersions(pluginId: string): Promise<PluginVersionInfo[]>;
  getFeaturedPlugins(limit?: number): Promise<PluginSummary[]>;
  getPopularPlugins(category?: PluginCategory, limit?: number): Promise<PluginSummary[]>;
  getRecentPlugins(limit?: number): Promise<PluginSummary[]>;
  getTrendingPlugins(limit?: number): Promise<PluginSummary[]>;
  getMarketplaceHome(): Promise<MarketplaceHomeData>;

  // ── Download & Install ────────────────────────────────────────────────────
  downloadPlugin(pluginId: string, version?: string): Promise<{ downloadUrl: string; shasum: string; size: number }>;
  recordPluginDownload(pluginId: string, version: string): Promise<void>;

  // ── Signature Verification ────────────────────────────────────────────────
  verifyPluginSignature(pluginId: string, version: string): Promise<SignatureVerificationResult>;
  registerSigningKey(publicKey: string, token: string): Promise<{ keyId: string; fingerprint: string }>;
  revokeSigningKey(keyId: string, token: string): Promise<void>;

  // ── Dependencies ──────────────────────────────────────────────────────────
  resolvePluginDependencies(pluginId: string, version?: string): Promise<{
    resolved: Array<{ pluginId: string; version: string }>;
    conflicts: string[];
  }>;

  // ── Ratings & Reviews ─────────────────────────────────────────────────────
  ratePlugin(pluginId: string, rating: number, review?: { title?: string; body?: string }, token?: string): Promise<void>;
  getPluginRatings(pluginId: string, page?: number): Promise<PluginRatingData>;

  // ── Stats ─────────────────────────────────────────────────────────────────
  getPluginStats(pluginId: string): Promise<PluginDownloadStats>;

  // ── Author ────────────────────────────────────────────────────────────────
  getAuthorProfile(authorId: string): Promise<AuthorProfileData>;
}
