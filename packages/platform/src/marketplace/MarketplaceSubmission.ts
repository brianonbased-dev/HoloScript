/**
 * Marketplace submission/runtime API is owned by @holoscript/marketplace-api.
 * Platform re-exports it here for backward compatibility.
 */
// See MarketplaceRegistry.ts for rationale on deep-relative vs. barrel import.
export * from '../../../marketplace-api/src/core-marketplace/MarketplaceSubmission.js';
