/**
 * @fileoverview HoloScript Trait Marketplace API - Main exports
 * @module @holoscript/marketplace-api
 */

// Types
export * from './types.js';

// Core services
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

// API
export { createMarketplaceRoutes } from './routes.js';
export { createApp, startServer } from './server.js';
export type { ServerConfig } from './server.js';
