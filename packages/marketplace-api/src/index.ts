/**
 * @fileoverview HoloScript Marketplace API - Main exports
 *
 * This module re-exports both the original Trait Marketplace and the new
 * Plugin Marketplace infrastructure:
 *
 *   Trait Marketplace  - Community-authored VR traits (original)
 *   Plugin Marketplace - Studio plugins with signatures, install pipeline, sandboxing
 *
 * @module @holoscript/marketplace-api
 */

// ─── Shared Types ────────────────────────────────────────────────────────────
export * from './types.js';

// ─── Trait Marketplace (original) ────────────────────────────────────────────
export { TraitRegistry, InMemoryTraitDatabase } from './TraitRegistry.js';
export type { ITraitDatabase } from './TraitRegistry.js';
export { PostgresTraitDatabase } from './PostgresTraitDatabase.js';

export { MarketplaceService, DownloadStatsTracker, RatingService } from './MarketplaceService.js';

export {
  x402PaymentService,
  type x402PaymentServiceOptions,
  type x402PaymentRequest,
  type x402PaymentReceipt,
} from './x402PaymentService.js';

export {
  DependencyResolver,
  parseVersionRequirement,
  satisfies,
  compareVersions,
  getLatestVersion,
} from './DependencyResolver.js';

export {
  VerificationService,
  RateLimiter,
  SpamDetector,
  VERIFICATION_REQUIREMENTS,
  VERIFICATION_BADGES,
} from './VerificationService.js';
export type { VerificationLevel } from './VerificationService.js';

export { createMarketplaceRoutes } from './routes.js';
export { createApp, startServer } from './server.js';
export type { ServerConfig } from './server.js';

// ─── Plugin Package Specification ────────────────────────────────────────────
export type {
  PluginCategory,
  PluginPricingModel,
  PluginPricing,
  PluginEntrypoint,
  PluginContributions,
  PluginPanelContribution,
  PluginToolbarContribution,
  PluginMenuContribution,
  PluginNodeContribution,
  PluginContentTypeContribution,
  PluginShortcutContribution,
  PluginMCPServerContribution,
  PluginCompatibility,
  PluginSecurityManifest,
  PluginScreenshot,
  PluginPackageManifest,
  PluginPackageArchive,
  PluginPackageFile,
  PluginSignature,
  SignatureVerificationResult,
  PluginVersionInfo,
  PluginSummary,
  PluginSearchQuery,
  PluginSearchResult,
  PluginSearchFacets,
  PluginPublishRequest,
  PluginPublishResult,
  PluginInstallState,
  InstalledPlugin,
  PluginInstallRequest,
  PluginInstallResult,
  PluginDetailData,
  PluginDownloadStats,
  PluginRatingData,
  PluginReview,
  MarketplaceHomeData,
  AuthorProfileData,
  IPluginMarketplaceAPI,
} from './PluginPackageSpec.js';

// ─── Plugin Signature Service ────────────────────────────────────────────────
export { PluginSignatureService } from './PluginSignatureService.js';
export type { RegisteredSigningKey } from './PluginSignatureService.js';

// ─── Plugin Marketplace Service ──────────────────────────────────────────────
export {
  PluginMarketplaceService,
  InMemoryPluginDatabase,
  PluginDownloadStatsTracker,
  PluginRatingService,
} from './PluginMarketplaceService.js';
export type { IPluginDatabase } from './PluginMarketplaceService.js';

// ─── Plugin Install Pipeline ─────────────────────────────────────────────────
export { PluginInstallPipeline } from './PluginInstallPipeline.js';
export type {
  InstallPipelineEvent,
  InstallEventListener,
  InstallPipelineOptions,
} from './PluginInstallPipeline.js';

// ─── Plugin Marketplace Routes ───────────────────────────────────────────────
export { createPluginMarketplaceRoutes } from './pluginRoutes.js';

// ─── Skill Marketplace ──────────────────────────────────────────────────────
export {
  SkillMarketplaceService,
  InMemorySkillDatabase,
  SkillDownloadStatsTracker,
  SkillRatingService,
} from './SkillMarketplaceService.js';
export type { ISkillDatabase } from './SkillMarketplaceService.js';

// ─── Skill Marketplace Routes ────────────────────────────────────────────────
export { createSkillMarketplaceRoutes } from './skillRoutes.js';

// ─── MCPMe Billing Bridge ────────────────────────────────────────────────────
export { MCPMeBillingBridge, getMCPMeBillingBridge, tierAllows } from './MCPMeBillingBridge.js';
export type {
  MCPMeTier,
  MCPMeUser,
  MCPMeServiceEntry,
  MCPMePlan,
  MCPMeAgentTemplate,
  TierCheckResult,
} from './MCPMeBillingBridge.js';
