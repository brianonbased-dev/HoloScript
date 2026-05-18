/**
 * @fileoverview Express API routes for the Plugin Marketplace
 *
 * Provides REST endpoints for the plugin lifecycle:
 *   - Publishing and unpublishing plugins
 *   - Search and discovery
 *   - Version management
 *   - Download tracking
 *   - Ratings and reviews
 *   - Signing key management
 *   - Author profiles
 *
 * @module marketplace-api/pluginRoutes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { PluginMarketplaceService } from './PluginMarketplaceService.js';
import type { PluginCategory, PluginSearchQuery } from './PluginPackageSpec.js';
import type { Platform } from './types.js';
import type { x402PaymentService } from './x402PaymentService.js';
import type { PluginPublishRequest } from './PluginPackageSpec.js';

/** Express request extended with middleware-injected fields. */
interface AuthenticatedRequest extends Request {
  token?: string;
  validated?: unknown;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const pluginSearchQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  platform: z.string().optional(),
  author: z.string().optional(),
  keywords: z
    .string()
    .optional()
    .transform((v) => v?.split(',').filter(Boolean)),
  pricingModel: z.enum(['free', 'paid', 'freemium', 'subscription']).optional(),
  maxPrice: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  verified: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  signed: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  permission: z.string().optional(),
  excludeDeprecated: z
    .string()
    .optional()
    .transform((v) => (v === 'false' ? false : true)),
  minRating: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : undefined)),
  minDownloads: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  sortBy: z
    .enum(['relevance', 'downloads', 'rating', 'updated', 'created', 'price', 'name'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(v ? parseInt(v, 10) : 20, 100)),
});

const pluginPublishSchema = z.object({
  manifest: z.object({
    id: z
      .string()
      .min(3)
      .regex(/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-_.]*$/),
    name: z.string().min(2).max(100),
    version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/),
    description: z.string().min(10).max(200),
    author: z.object({
      name: z.string().min(1),
      email: z.string().email().optional(),
      url: z.string().url().optional(),
      verified: z.boolean().optional(),
    }),
    license: z.string(),
    category: z.string(),
    keywords: z.array(z.string()).min(1).max(20),
    entrypoint: z.object({
      main: z.string().min(1),
      types: z.string().optional(),
      styles: z.string().optional(),
      worker: z.string().optional(),
    }),
    security: z.object({
      permissions: z.array(z.string()),
      trustLevel: z.enum(['sandboxed', 'trusted']),
      networkPolicy: z
        .object({
          allowedDomains: z.array(z.string()),
          allowLocalhost: z.boolean().optional(),
        })
        .optional(),
      memoryBudget: z.number().min(1).max(256).optional(),
      cpuBudget: z.number().min(1).optional(),
    }),
    compatibility: z.object({
      studioVersion: z.string(),
      platforms: z.array(z.string()).optional(),
      requiredFeatures: z.array(z.string()).optional(),
      apiVersion: z.string().optional(),
    }),
    dependencies: z.record(z.string(), z.string()).optional(),
    peerDependencies: z.record(z.string(), z.string()).optional(),
    contributions: z.any().optional(),
    pricing: z
      .object({
        model: z.enum(['free', 'paid', 'freemium', 'subscription']),
        price: z.number().optional(),
        monthlyPrice: z.number().optional(),
        annualPrice: z.number().optional(),
        trialDays: z.number().optional(),
      })
      .optional(),
    screenshots: z
      .array(
        z.object({
          path: z.string(),
          alt: z.string(),
          caption: z.string().optional(),
          featured: z.boolean().optional(),
        })
      )
      .optional(),
    icon: z.string().optional(),
    readme: z.string().optional(),
    changelog: z.string().optional(),
    tags: z.array(z.string()).optional(),
    repository: z.string().url().optional(),
    homepage: z.string().url().optional(),
    bugs: z.string().url().optional(),
  }),
  bundle: z.string().min(1),
  signature: z
    .object({
      signature: z.string(),
      publicKey: z.string(),
      keyId: z.string().optional(),
    })
    .optional(),
  readme: z.string().optional(),
  changelog: z.string().optional(),
  releaseNotes: z.string().optional(),
});

const pluginRatingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z
    .object({
      title: z.string().max(200).optional(),
      body: z.string().max(5000).optional(),
    })
    .optional(),
});

const registerKeySchema = z.object({
  publicKey: z.string().min(1),
  label: z.string().max(100).optional(),
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

function getToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return undefined;
}

function requireAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = getToken(req);
    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }
    (req as AuthenticatedRequest).token = token;
    next();
  };
}

function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.flatten(),
        },
      });
      return;
    }
    (req as AuthenticatedRequest).validated = result.data;
    next();
  };
}

function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: result.error.flatten(),
        },
      });
      return;
    }
    (req as AuthenticatedRequest).validated = result.data;
    next();
  };
}

function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('Plugin API Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
  });
}

// =============================================================================
// ROUTE FACTORY
// =============================================================================

/**
 * Creates the plugin marketplace API routes.
 *
 * Mount at /api/plugins on your Express app:
 * ```typescript
 * app.use('/api', createPluginMarketplaceRoutes(pluginMarketplace));
 * ```
 */
export function createPluginMarketplaceRoutes(
  marketplace: PluginMarketplaceService,
  paymentService?: x402PaymentService
): Router {
  const router = Router();

  // ── Plugin Discovery ────────────────────────────────────────────────────

  /** GET /plugins - Search plugins */
  router.get(
    '/plugins',
    validateQuery(pluginSearchQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = (req as AuthenticatedRequest).validated as PluginSearchQuery;
        const results = await marketplace.searchPlugins(query);
        res.json({ success: true, data: results });
      } catch (err) {
        next(err);
      }
    }
  );

  /** GET /plugins/home - Marketplace home page data */
  router.get('/plugins/home', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await marketplace.getMarketplaceHome();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /plugins/featured - Featured plugins */
  router.get('/plugins/featured', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const data = await marketplace.getFeaturedPlugins(limit);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /plugins/popular - Popular plugins */
  router.get('/plugins/popular', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = req.query.category as PluginCategory | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const data = await marketplace.getPopularPlugins(category, limit);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /plugins/recent - Recently published plugins */
  router.get('/plugins/recent', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const data = await marketplace.getRecentPlugins(limit);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /plugins/trending - Trending plugins */
  router.get('/plugins/trending', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const data = await marketplace.getTrendingPlugins(limit);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ── Plugin CRUD ─────────────────────────────────────────────────────────

  /** POST /plugins - Publish a new plugin */
  router.post(
    '/plugins',
    requireAuth(),
    validate(pluginPublishSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = (req as AuthenticatedRequest).token;
        const request = (req as AuthenticatedRequest).validated as PluginPublishRequest;
        const result = await marketplace.publishPlugin(request, token!);

        if (result.success) {
          res.status(201).json({ success: true, data: result });
        } else {
          res.status(400).json({
            success: false,
            error: {
              code: 'PUBLISH_FAILED',
              message: result.errors?.join(', ') ?? 'Publish failed',
            },
            warnings: result.warnings,
          });
        }
      } catch (err) {
        next(err);
      }
    }
  );

  /** GET /plugins/:id - Get plugin detail */
  router.get('/plugins/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const { version } = req.query;
      const data = await marketplace.getPlugin(id, version as string | undefined);
      res.json({ success: true, data });
    } catch (err) {
      if ((err as Error).message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: (err as Error).message },
        });
        return;
      }
      next(err);
    }
  });

  /** DELETE /plugins/:id - Unpublish plugin */
  router.delete(
    '/plugins/:id',
    requireAuth(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = (req as AuthenticatedRequest).token;
        const { id } = req.params as { id: string };
        const { version } = req.query;
        await marketplace.unpublishPlugin(id, version as string | undefined, token);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  /** POST /plugins/:id/deprecate - Deprecate plugin */
  router.post(
    '/plugins/:id/deprecate',
    requireAuth(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = (req as AuthenticatedRequest).token;
        const { id } = req.params as { id: string };
        const { message, replacement } = req.body;
        await marketplace.deprecatePlugin(id, message, replacement, token);
        res.json({ success: true, data: { deprecated: true } });
      } catch (err) {
        next(err);
      }
    }
  );

  // ── Versions ────────────────────────────────────────────────────────────

  /** GET /plugins/:id/versions - Get all versions */
  router.get('/plugins/:id/versions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const versions = await marketplace.getPluginVersions(id);
      res.json({ success: true, data: versions });
    } catch (err) {
      next(err);
    }
  });

  // ── Download ────────────────────────────────────────────────────────────

  /** GET /plugins/:id/download - Download plugin package (gated for paid plugins) */
  router.get('/plugins/:id/download', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const { version } = req.query;

      // Check plugin pricing before allowing download
      const plugin = await marketplace.getPlugin(id, version as string | undefined);
      const isPaid = plugin.manifest.pricing && plugin.manifest.pricing.model !== 'free';

      if (isPaid && paymentService) {
        const paymentId = req.headers['x-payment-id'];
        if (typeof paymentId === 'string' && paymentId) {
          const receipt = await paymentService.verifyPayment(paymentId);
          if (!receipt || !receipt.access_granted) {
            return res.status(402).json({
              success: false,
              error: { code: 'PAYMENT_REQUIRED', message: 'Valid payment receipt required for this plugin' },
              pricing: plugin.manifest.pricing,
            });
          }
        } else {
          return res.status(402).json({
            success: false,
            error: { code: 'PAYMENT_REQUIRED', message: 'Payment required. Use POST /plugins/:id/purchase to initiate payment.' },
            pricing: plugin.manifest.pricing,
          });
        }
      }

      const downloadInfo = await marketplace.downloadPlugin(id, version as string | undefined);

      // Record download
      const v = (version as string) ?? 'latest';
      await marketplace.recordPluginDownload(id, v);

      res.json({ success: true, data: downloadInfo });
    } catch (err) {
      if ((err as Error).message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: (err as Error).message },
        });
        return;
      }
      next(err);
    }
  });

  // ── Stats ───────────────────────────────────────────────────────────────

  /** GET /plugins/:id/stats - Get download stats */
  router.get('/plugins/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const stats = await marketplace.getPluginStats(id);
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  });

  // ── Provenance ──────────────────────────────────────────────────────────

  /** GET /plugins/:id/provenance - Get plugin provenance audit trail */
  router.get('/plugins/:id/provenance', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const provenance = await marketplace.getPluginProvenance(id);
      res.json({ success: true, data: provenance });
    } catch (err) {
      if ((err as Error).message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: (err as Error).message },
        });
        return;
      }
      next(err);
    }
  });

  // ── Install Plan ──────────────────────────────────────────────────────────

  const installPlanSchema = z.object({
    version: z.string().optional(),
    targetStudioVersion: z.string().optional(),
    targetPlatform: z.string().optional(),
    installDependencies: z.boolean().optional().default(true),
  });

  /** POST /plugins/:id/install-plan - Server-side install plan with compatibility warnings */
  router.post(
    '/plugins/:id/install-plan',
    validate(installPlanSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params as { id: string };
        const { version, targetStudioVersion, targetPlatform, installDependencies } = (req as AuthenticatedRequest).validated as {
          version?: string;
          targetStudioVersion?: string;
          targetPlatform?: string;
          installDependencies?: boolean;
        };

        const plugin = await marketplace.getPlugin(id, version);
        const manifest = plugin.manifest;

        // Resolve dependencies if requested
        let dependencies: { resolved: Array<{ pluginId: string; version: string }>; conflicts: string[] } | undefined;
        if (installDependencies) {
          dependencies = await marketplace.resolvePluginDependencies(id, version);
        }

        // Build compatibility warnings
        const compatibilityWarnings: string[] = [];
        const compatibilityErrors: string[] = [];

        if (targetStudioVersion) {
          const required = manifest.compatibility.studioVersion;
          // Simple semver-like check: if target < required major.minor, warn
          const targetMatch = targetStudioVersion.match(/^(\d+)\.(\d+)/);
          const requiredMatch = required.match(/^(?:>=)?(\d+)\.(\d+)/);
          if (targetMatch && requiredMatch) {
            const targetMajor = parseInt(targetMatch[1], 10);
            const targetMinor = parseInt(targetMatch[2], 10);
            const reqMajor = parseInt(requiredMatch[1], 10);
            const reqMinor = parseInt(requiredMatch[2], 10);
            if (targetMajor < reqMajor || (targetMajor === reqMajor && targetMinor < reqMinor)) {
              compatibilityErrors.push(
                `Studio version ${targetStudioVersion} is below the required ${required}`
              );
            }
          }
        }

        if (targetPlatform && manifest.compatibility.platforms) {
          const supported = manifest.compatibility.platforms;
          if (!supported.includes('all') && !supported.includes(targetPlatform as Platform)) {
            compatibilityWarnings.push(
              `Platform '${targetPlatform}' is not in the plugin's supported platforms: ${supported.join(', ')}`
            );
          }
        }

        // Signature status
        const signatureStatus = plugin.versions.find((v) => v.version === manifest.version)?.signatureStatus ?? 'unsigned';

        // Provenance summary
        const provenance = await marketplace.getPluginProvenance(id);

        res.json({
          success: true,
          data: {
            pluginId: id,
            version: manifest.version,
            name: manifest.name,
            manifest: {
              id: manifest.id,
              name: manifest.name,
              version: manifest.version,
              description: manifest.description,
              author: manifest.author,
              license: manifest.license,
              category: manifest.category,
              security: manifest.security,
              compatibility: manifest.compatibility,
              pricing: manifest.pricing,
            },
            dependencies,
            compatibility: {
              compatible: compatibilityErrors.length === 0,
              warnings: compatibilityWarnings,
              errors: compatibilityErrors,
            },
            signatureStatus,
            provenance: {
              eventCount: provenance.events.length,
              latestSignature: provenance.latestSignature,
              authorKeyCount: provenance.authorKeys.length,
            },
          },
        });
      } catch (err) {
        if ((err as Error).message.includes('not found')) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: (err as Error).message },
          });
          return;
        }
        next(err);
      }
    }
  );

  // ── Purchase ────────────────────────────────────────────────────────────

  /** POST /plugins/:id/purchase - Initiate x402 payment for a paid plugin */
  router.post('/plugins/:id/purchase', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const plugin = await marketplace.getPlugin(id);

      if (!plugin.manifest.pricing || plugin.manifest.pricing.model === 'free') {
        res.status(400).json({
          success: false,
          error: { code: 'FREE_PLUGIN', message: 'This plugin is free; no purchase required.' },
        });
        return;
      }

      if (!paymentService) {
        res.status(503).json({
          success: false,
          error: { code: 'PAYMENT_UNAVAILABLE', message: 'Payment service is not configured.' },
        });
        return;
      }

      const price = plugin.manifest.pricing.price ?? 0;
      const priceDollars = price / 100;

      paymentService.return402Response(res, {
        payment_id: `x402_plugin_${id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        price: priceDollars,
        asset: 'USDC',
        network: 'base',
        facilitator: 'https://cdp.coinbase.com/x402',
        content_id: id,
      });
    } catch (err) {
      next(err);
    }
  });

  /** GET /plugins/:id/purchase-status - Check whether a payer has an active purchase */
  router.get('/plugins/:id/purchase-status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const payerAddress = req.query.payerAddress as string | undefined;

      if (!payerAddress) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_PAYER', message: 'Query parameter payerAddress is required.' },
        });
        return;
      }

      if (!paymentService) {
        res.status(503).json({
          success: false,
          error: { code: 'PAYMENT_UNAVAILABLE', message: 'Payment service is not configured.' },
        });
        return;
      }

      const subscription = await paymentService.checkSubscription(payerAddress, id);
      res.json({
        success: true,
        data: {
          purchased: subscription !== null,
          subscription: subscription ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ── Ratings & Reviews ───────────────────────────────────────────────────

  /** GET /plugins/:id/ratings - Get plugin ratings */
  router.get('/plugins/:id/ratings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const page = parseInt(req.query.page as string) || 1;
      const data = await marketplace.getPluginRatings(id, page);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** POST /plugins/:id/ratings - Rate a plugin */
  router.post(
    '/plugins/:id/ratings',
    requireAuth(),
    validate(pluginRatingSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = (req as AuthenticatedRequest).token;
        const { id } = req.params as { id: string };
        const { rating, review } = (req as AuthenticatedRequest).validated as { rating: number; review?: { title?: string; body?: string } };
        await marketplace.ratePlugin(id, rating, review, token);
        res.status(201).json({ success: true, data: { rated: true } });
      } catch (err) {
        next(err);
      }
    }
  );

  // ── Dependencies ────────────────────────────────────────────────────────

  /** POST /plugins/resolve-deps - Resolve plugin dependencies */
  router.post('/plugins/resolve-deps', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pluginId, version } = req.body;
      const result = await marketplace.resolvePluginDependencies(pluginId, version);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  // ── Signing Keys ────────────────────────────────────────────────────────

  /** POST /keys - Register a signing key */
  router.post(
    '/keys',
    requireAuth(),
    validate(registerKeySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = (req as AuthenticatedRequest).token;
        const { publicKey } = (req as AuthenticatedRequest).validated as { publicKey: string; label?: string };
        const result = await marketplace.registerSigningKey(publicKey, token!);
        res.status(201).json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  /** DELETE /keys/:keyId - Revoke a signing key */
  router.delete(
    '/keys/:keyId',
    requireAuth(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = (req as AuthenticatedRequest).token;
        const { keyId } = req.params as { keyId: string };
        await marketplace.revokeSigningKey(keyId, token!);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  // ── Author Profiles ─────────────────────────────────────────────────────

  /** GET /authors/:id - Get author profile */
  router.get('/authors/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const data = await marketplace.getAuthorProfile(id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ── Health ──────────────────────────────────────────────────────────────

  /** GET /plugins-health - Plugin marketplace health check */
  router.get('/plugins-health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const health = await marketplace.getHealth();
      const statusCode = health.status === 'ok' ? 200 : 503;
      res.status(statusCode).json({ success: true, data: health });
    } catch (err) {
      next(err);
    }
  });

  // Error handler
  router.use(errorHandler);

  return router;
}
