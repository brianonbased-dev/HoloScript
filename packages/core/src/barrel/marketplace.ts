// ═══════════════════════════════════════════════════════════════════
// Marketplace Pipeline
// ═══════════════════════════════════════════════════════════════════
//
// Marketplace submission/registry symbols are NO LONGER re-exported from
// core (L0). They live in @holoscript/marketplace-api (L4), which depends
// ON core — re-exporting them here would recreate the L0→L4 cycle that
// commit 43fa03c90 broke (the @holoscript/platform marketplace shim was
// deleted, so these exports were already dangling at runtime).
//
// Consumers import these directly from '@holoscript/marketplace-api':
//   createSubmission, verifySubmission, publishSubmission, submissionSummary,
//   MarketplaceRegistry, and the associated types (MarketplacePackage,
//   MarketplaceSubmission, PackageMetadata, Publisher, ContentCategory,
//   SemanticVersion, SubmissionStatus, SubmissionConfig, PackageListing,
//   SearchFilters, SearchResult, InstallManifest).
//
// This file intentionally re-exports nothing.
export {};
