/**
 * Marketplace Integration Trait
 *
 * Trait publishing and asset management through the HoloScript marketplace
 * from within running scenes. Enables creators to package, publish, price,
 * and manage trait bundles without leaving the XR environment.
 *
 * Features:
 *  - Trait packaging with metadata, version, and dependencies
 *  - Publish/unpublish/update lifecycle
 *  - Revenue tracking and analytics
 *  - Version management with semantic versioning
 *  - Install/uninstall of remote traits into the current scene
 *  - Review and rating system
 *
 * @version 1.0.0
 * @sprint Commence All V — Track 4
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type PublishStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'unpublished';
type TraitCategory = 'interaction' | 'visual' | 'audio' | 'physics' | 'ai' | 'networking' | 'utility';
type PricingModel = 'free' | 'one_time' | 'subscription' | 'pay_what_you_want';

interface TraitPackage {
  id: string;
  name: string;
  description: string;
  version: string;
  category: TraitCategory;
  tags: string[];
  author: string;
  pricing: PricingModel;
  price: number;
  currency: string;
  dependencies: string[];
  entryPoint: string;
  fileSize: number;
  createdAt: number;
  updatedAt: number;
  status: PublishStatus;
  downloads: number;
  rating: number;
  reviewCount: number;
  revenue: number;
}

interface InstalledTrait {
  packageId: string;
  name: string;
  version: string;
  installedAt: number;
  enabled: boolean;
}

interface MarketplaceReview {
  id: string;
  packageId: string;
  reviewer: string;
  rating: number; // 1-5
  comment: string;
  createdAt: number;
}

interface MarketplaceIntegrationState {
  publishedPackages: TraitPackage[];
  installedTraits: InstalledTrait[];
  pendingPublications: TraitPackage[];
  reviews: MarketplaceReview[];
  totalRevenue: number;
  totalDownloads: number;
  isAuthenticated: boolean;
  publisherName: string | null;
}

interface MarketplaceIntegrationConfig {
  marketplace_url: string;
  publisher_id: string;
  publisher_name: string;
  default_category: TraitCategory;
  default_pricing: PricingModel;
  default_price: number;
  default_currency: string;
  auto_update_installed: boolean;
  max_package_size_mb: number;
  require_review: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

function validateSemVer(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version);
}

function compareSemVer(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function generatePackageId(): string {
  return `pkg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// =============================================================================
// HANDLER
// =============================================================================

export const marketplaceIntegrationHandler: TraitHandler<MarketplaceIntegrationConfig> = {
  name: 'marketplace_integration' as any,

  defaultConfig: {
    marketplace_url: 'https://marketplace.holoscript.net',
    publisher_id: '',
    publisher_name: '',
    default_category: 'utility',
    default_pricing: 'free',
    default_price: 0,
    default_currency: 'USD',
    auto_update_installed: true,
    max_package_size_mb: 50,
    require_review: true,
  },

  onAttach(node, config, context) {
    const state: MarketplaceIntegrationState = {
      publishedPackages: [],
      installedTraits: [],
      pendingPublications: [],
      reviews: [],
      totalRevenue: 0,
      totalDownloads: 0,
      isAuthenticated: false,
      publisherName: null,
    };
    (node as any).__marketplaceIntegrationState = state;

    // Auto-authenticate if publisher_id is provided
    if (config.publisher_id) {
      state.isAuthenticated = true;
      state.publisherName = config.publisher_name || config.publisher_id;

      context.emit?.('marketplace_authenticated', {
        node,
        publisherId: config.publisher_id,
        publisherName: state.publisherName,
      });
    }

    context.emit?.('marketplace_integration_initialized', {
      node,
      marketplaceUrl: config.marketplace_url,
    });
  },

  onDetach(node, _config, context) {
    context.emit?.('marketplace_integration_disconnected', { node });
    delete (node as any).__marketplaceIntegrationState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__marketplaceIntegrationState as MarketplaceIntegrationState | undefined;
    if (!state) return;

    // Check for auto-updates on installed traits
    if (config.auto_update_installed) {
      for (const trait of state.installedTraits) {
        if (!trait.enabled) continue;
        // In a real implementation, this would check against the marketplace API
        // For now, emit an event so external systems can handle it
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__marketplaceIntegrationState as MarketplaceIntegrationState | undefined;
    if (!state) return;

    // -------------------------------------------------------------------------
    // Publish a trait
    // -------------------------------------------------------------------------
    if (event.type === 'marketplace_publish') {
      if (!state.isAuthenticated) {
        context.emit?.('marketplace_error', {
          node,
          error: 'Not authenticated. Set publisher_id in config.',
        });
        return;
      }

      const name = event.name as string;
      const version = (event.version as string) || '1.0.0';

      if (!validateSemVer(version)) {
        context.emit?.('marketplace_error', {
          node,
          error: `Invalid version format: ${version}. Use semver (e.g., 1.0.0)`,
        });
        return;
      }

      const fileSize = (event.fileSize as number) || 0;
      if (fileSize > config.max_package_size_mb * 1024 * 1024) {
        context.emit?.('marketplace_error', {
          node,
          error: `Package exceeds max size of ${config.max_package_size_mb}MB`,
        });
        return;
      }

      const pkg: TraitPackage = {
        id: generatePackageId(),
        name,
        description: (event.description as string) || '',
        version,
        category: (event.category as TraitCategory) || config.default_category,
        tags: (event.tags as string[]) || [],
        author: state.publisherName!,
        pricing: (event.pricing as PricingModel) || config.default_pricing,
        price: (event.price as number) ?? config.default_price,
        currency: config.default_currency,
        dependencies: (event.dependencies as string[]) || [],
        entryPoint: (event.entryPoint as string) || 'index.ts',
        fileSize,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: config.require_review ? 'pending_review' : 'published',
        downloads: 0,
        rating: 0,
        reviewCount: 0,
        revenue: 0,
      };

      if (pkg.status === 'pending_review') {
        state.pendingPublications.push(pkg);
      } else {
        state.publishedPackages.push(pkg);
      }

      context.emit?.('marketplace_published', {
        node,
        packageId: pkg.id,
        name: pkg.name,
        version: pkg.version,
        status: pkg.status,
      });
    }

    // -------------------------------------------------------------------------
    // Approve/reject pending publication
    // -------------------------------------------------------------------------
    else if (event.type === 'marketplace_review_result') {
      const packageId = event.packageId as string;
      const approved = event.approved as boolean;
      const idx = state.pendingPublications.findIndex((p) => p.id === packageId);

      if (idx === -1) return;

      const pkg = state.pendingPublications[idx];
      state.pendingPublications.splice(idx, 1);

      if (approved) {
        pkg.status = 'published';
        state.publishedPackages.push(pkg);
        context.emit?.('marketplace_approved', { node, packageId, name: pkg.name });
      } else {
        pkg.status = 'rejected';
        context.emit?.('marketplace_rejected', {
          node,
          packageId,
          name: pkg.name,
          reason: event.reason as string,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Unpublish a trait
    // -------------------------------------------------------------------------
    else if (event.type === 'marketplace_unpublish') {
      const packageId = event.packageId as string;
      const pkg = state.publishedPackages.find((p) => p.id === packageId);

      if (pkg) {
        pkg.status = 'unpublished';
        context.emit?.('marketplace_unpublished', { node, packageId, name: pkg.name });
      }
    }

    // -------------------------------------------------------------------------
    // Update version
    // -------------------------------------------------------------------------
    else if (event.type === 'marketplace_update_version') {
      const packageId = event.packageId as string;
      const newVersion = event.version as string;
      const pkg = state.publishedPackages.find((p) => p.id === packageId);

      if (!pkg) return;

      if (!validateSemVer(newVersion)) {
        context.emit?.('marketplace_error', {
          node,
          error: `Invalid version: ${newVersion}`,
        });
        return;
      }

      if (compareSemVer(newVersion, pkg.version) <= 0) {
        context.emit?.('marketplace_error', {
          node,
          error: `New version ${newVersion} must be greater than ${pkg.version}`,
        });
        return;
      }

      pkg.version = newVersion;
      pkg.updatedAt = Date.now();

      context.emit?.('marketplace_version_updated', {
        node,
        packageId,
        version: newVersion,
      });
    }

    // -------------------------------------------------------------------------
    // Install a remote trait
    // -------------------------------------------------------------------------
    else if (event.type === 'marketplace_install') {
      const packageId = event.packageId as string;
      const name = (event.name as string) || packageId;
      const version = (event.version as string) || '1.0.0';

      // Check for duplicate
      if (state.installedTraits.find((t) => t.packageId === packageId)) {
        context.emit?.('marketplace_error', {
          node,
          error: `Trait ${packageId} is already installed`,
        });
        return;
      }

      const installed: InstalledTrait = {
        packageId,
        name,
        version,
        installedAt: Date.now(),
        enabled: true,
      };

      state.installedTraits.push(installed);

      // Track download on own published package
      const ownPkg = state.publishedPackages.find((p) => p.id === packageId);
      if (ownPkg) {
        ownPkg.downloads++;
        state.totalDownloads++;
      }

      context.emit?.('marketplace_installed', {
        node,
        packageId,
        name,
        version,
      });
    }

    // -------------------------------------------------------------------------
    // Uninstall a trait
    // -------------------------------------------------------------------------
    else if (event.type === 'marketplace_uninstall') {
      const packageId = event.packageId as string;
      const idx = state.installedTraits.findIndex((t) => t.packageId === packageId);

      if (idx >= 0) {
        const removed = state.installedTraits.splice(idx, 1)[0];
        context.emit?.('marketplace_uninstalled', {
          node,
          packageId,
          name: removed.name,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Submit review
    // -------------------------------------------------------------------------
    else if (event.type === 'marketplace_submit_review') {
      const packageId = event.packageId as string;
      const rating = Math.max(1, Math.min(5, event.rating as number));

      const review: MarketplaceReview = {
        id: `review_${Date.now()}`,
        packageId,
        reviewer: (event.reviewer as string) || 'anonymous',
        rating,
        comment: (event.comment as string) || '',
        createdAt: Date.now(),
      };

      state.reviews.push(review);

      // Update package rating
      const pkg = state.publishedPackages.find((p) => p.id === packageId);
      if (pkg) {
        const pkgReviews = state.reviews.filter((r) => r.packageId === packageId);
        pkg.reviewCount = pkgReviews.length;
        pkg.rating = pkgReviews.reduce((sum, r) => sum + r.rating, 0) / pkgReviews.length;
      }

      context.emit?.('marketplace_review_submitted', {
        node,
        packageId,
        rating,
        reviewId: review.id,
      });
    }

    // -------------------------------------------------------------------------
    // Record revenue
    // -------------------------------------------------------------------------
    else if (event.type === 'marketplace_revenue') {
      const packageId = event.packageId as string;
      const amount = event.amount as number;
      const pkg = state.publishedPackages.find((p) => p.id === packageId);

      if (pkg) {
        pkg.revenue += amount;
        state.totalRevenue += amount;

        context.emit?.('marketplace_revenue_recorded', {
          node,
          packageId,
          amount,
          totalRevenue: state.totalRevenue,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Query marketplace state
    // -------------------------------------------------------------------------
    else if (event.type === 'marketplace_query') {
      context.emit?.('marketplace_integration_info', {
        node,
        queryId: event.queryId,
        publisherName: state.publisherName,
        isAuthenticated: state.isAuthenticated,
        publishedCount: state.publishedPackages.length,
        installedCount: state.installedTraits.length,
        pendingCount: state.pendingPublications.length,
        totalRevenue: state.totalRevenue,
        totalDownloads: state.totalDownloads,
      });
    }
  },
};

export { validateSemVer, compareSemVer };
export type {
  MarketplaceIntegrationConfig,
  MarketplaceIntegrationState,
  TraitPackage,
  InstalledTrait,
  MarketplaceReview,
  TraitCategory,
  PricingModel,
  PublishStatus,
};
export default marketplaceIntegrationHandler;
