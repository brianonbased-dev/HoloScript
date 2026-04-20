/**
 * Marketplace registry/runtime API is owned by @holoscript/marketplace-api.
 * Platform re-exports it here for backward compatibility.
 */
// Deep-relative so tsup inlines the source at build time rather than emitting
// a runtime require('@holoscript/marketplace-api'). marketplace-api isn't in
// the Docker production image's symlink set; inlining avoids the crash. The
// Dockerfile builder stage must COPY packages/marketplace-api/ so this path
// resolves during the platform build.
export * from '../../../marketplace-api/src/core-marketplace/MarketplaceRegistry.js';
