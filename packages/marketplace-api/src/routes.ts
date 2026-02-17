/**
 * @fileoverview Express API routes for the marketplace
 * @module marketplace-api/routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { MarketplaceService } from './MarketplaceService.js';
import type { SearchQuery, TraitCategory } from './types.js';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const searchQuerySchema = z.object({
  q: z.string().optional(),
  category: z
    .enum([
      'rendering',
      'physics',
      'networking',
      'audio',
      'ui',
      'ai',
      'blockchain',
      'utility',
      'animation',
      'input',
      'data',
      'debug',
    ] as const)
    .optional(),
  platform: z
    .enum(['web', 'nodejs', 'unity', 'unreal', 'godot', 'native', 'wasm', 'all'] as const)
    .optional(),
  author: z.string().optional(),
  keywords: z
    .string()
    .optional()
    .transform((v) => v?.split(',').filter(Boolean)),
  verified: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  deprecated: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  minRating: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : undefined)),
  minDownloads: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  sortBy: z.enum(['relevance', 'downloads', 'rating', 'updated', 'created'] as const).optional(),
  sortOrder: z.enum(['asc', 'desc'] as const).optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(v ? parseInt(v, 10) : 20, 100)),
});

const publishRequestSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-zA-Z][a-zA-Z0-9-_]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/),
  description: z.string().min(10).max(1000),
  license: z.string(),
  keywords: z.array(z.string()).min(1).max(20),
  platforms: z
    .array(z.enum(['web', 'nodejs', 'unity', 'unreal', 'godot', 'native', 'wasm', 'all'] as const))
    .min(1),
  category: z.enum([
    'rendering',
    'physics',
    'networking',
    'audio',
    'ui',
    'ai',
    'blockchain',
    'utility',
    'animation',
    'input',
    'data',
    'debug',
  ] as const),
  source: z.string().min(1).max(1_000_000),
  types: z.string().optional(),
  readme: z.string().optional(),
  examples: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        code: z.string(),
        screenshot: z.string().optional(),
      })
    )
    .optional(),
  dependencies: z.record(z.string()).optional(),
  peerDependencies: z.record(z.string()).optional(),
  repository: z.string().url().optional(),
  homepage: z.string().url().optional(),
});

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().max(5000).optional(),
});

const dependencyResolveSchema = z.object({
  traits: z
    .array(
      z.object({
        name: z.string(),
        version: z.string(),
      })
    )
    .min(1),
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Extract auth token from request
 */
function getToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return undefined;
}

/**
 * Require authentication middleware
 */
function requireAuth(marketplace: MarketplaceService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = getToken(req);
    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    // Check rate limit
    const rateLimit = marketplace.checkRateLimit(token);
    res.setHeader('X-RateLimit-Limit', rateLimit.limit.toString());
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
    res.setHeader('X-RateLimit-Reset', rateLimit.reset.toString());

    if (rateLimit.remaining <= 0) {
      res.setHeader('Retry-After', (rateLimit.retryAfter ?? 60).toString());
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      });
      return;
    }

    (req as any).token = token;
    next();
  };
}

/**
 * Validate request body with zod schema
 */
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
    (req as any).validated = result.data;
    next();
  };
}

/**
 * Validate query params with zod schema
 */
function validateQuery<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
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
    (req as any).validated = result.data;
    next();
  };
}

/**
 * Error handler middleware
 */
function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  console.error('API Error:', err);

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
 * Create marketplace API routes
 */
export function createMarketplaceRoutes(marketplace: MarketplaceService): Router {
  const router = Router();

  // ===========================================================================
  // TRAITS
  // ===========================================================================

  /**
   * GET /traits - Search traits
   */
  router.get(
    '/traits',
    validateQuery(searchQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = (req as any).validated as SearchQuery;
        const results = await marketplace.search(query);

        res.json({
          success: true,
          data: results,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /traits - Publish a new trait
   */
  router.post(
    '/traits',
    requireAuth(marketplace),
    validate(publishRequestSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = (req as any).token;
        const request = (req as any).validated;

        const result = await marketplace.publish(request, token);

        if (result.success) {
          res.status(201).json({
            success: true,
            data: result,
          });
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

  /**
   * GET /traits/popular - Get popular traits
   */
  router.get('/traits/popular', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = req.query.category as TraitCategory | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

      const results = await marketplace.getPopular(category, limit);

      res.json({
        success: true,
        data: results,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /traits/recent - Get recently published traits
   */
  router.get('/traits/recent', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
      const results = await marketplace.getRecent(limit);

      res.json({
        success: true,
        data: results,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /traits/:id - Get trait by ID
   */
  router.get('/traits/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { version } = req.query;

      const trait = await marketplace.getTrait(id, version as string | undefined);

      res.json({
        success: true,
        data: trait,
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
  });

  /**
   * DELETE /traits/:id - Unpublish trait
   */
  router.delete(
    '/traits/:id',
    requireAuth(marketplace),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = (req as any).token;
        const { id } = req.params;
        const { version, reason } = req.query;

        await marketplace.unpublish(
          {
            traitId: id,
            version: version as string | undefined,
            reason: reason as string | undefined,
          },
          token
        );

        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /traits/:id/versions - Get all versions
   */
  router.get('/traits/:id/versions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const versions = await marketplace.getVersions(id);

      res.json({
        success: true,
        data: versions,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /traits/:id/download - Download trait
   */
  router.get('/traits/:id/download', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { version } = req.query;

      const trait = await marketplace.getTrait(id, version as string | undefined);

      // Record download
      await marketplace.recordDownload(id, trait.version);

      // Return source (in production, would return tarball)
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${trait.name}-${trait.version}.holo"`
      );
      res.send(trait.source);
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

  /**
   * GET /traits/:id/stats - Get download stats
   */
  router.get('/traits/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const stats = await marketplace.getDownloadStats(id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /traits/:id/deprecate - Deprecate trait
   */
  router.post(
    '/traits/:id/deprecate',
    requireAuth(marketplace),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = (req as any).token;
        const { id } = req.params;
        const { message, version, replacement } = req.body;

        await marketplace.deprecate({ traitId: id, message, version, replacement }, token);

        res.json({
          success: true,
          data: { deprecated: true },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ===========================================================================
  // RATINGS
  // ===========================================================================

  /**
   * GET /traits/:id/ratings - Get ratings
   */
  router.get('/traits/:id/ratings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page as string) || 1;

      const ratings = await marketplace.getRatings(id, page);

      res.json({
        success: true,
        data: ratings,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /traits/:id/ratings - Rate a trait
   */
  router.post(
    '/traits/:id/ratings',
    requireAuth(marketplace),
    validate(ratingSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = (req as any).token;
        const { id } = req.params;
        const { rating, review } = (req as any).validated;

        await marketplace.rateTrait(id, rating, review, token);

        res.status(201).json({
          success: true,
          data: { rated: true },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ===========================================================================
  // DEPENDENCIES
  // ===========================================================================

  /**
   * POST /resolve - Resolve dependencies
   */
  router.post(
    '/resolve',
    validate(dependencyResolveSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { traits } = (req as any).validated;
        const result = await marketplace.resolveDependencies(traits);

        res.json({
          success: true,
          data: result,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /compatibility - Check compatibility
   */
  router.post(
    '/compatibility',
    validate(dependencyResolveSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { traits } = (req as any).validated;
        const result = await marketplace.checkCompatibility(traits);

        res.json({
          success: true,
          data: result,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ===========================================================================
  // VERIFICATION
  // ===========================================================================

  /**
   * GET /users/:id/verification - Get verification status
   */
  router.get('/users/:id/verification', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const status = await marketplace.getVerificationStatus(id);

      res.json({
        success: true,
        data: status,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /verification - Request verification
   */
  router.post(
    '/verification',
    requireAuth(marketplace),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = (req as any).token;
        const request = req.body;

        await marketplace.requestVerification(request, token);

        res.status(202).json({
          success: true,
          data: { message: 'Verification process started' },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ===========================================================================
  // HEALTH
  // ===========================================================================

  /**
   * GET /health - Health check
   */
  router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const health = await marketplace.getHealth();
      const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json({
        success: true,
        data: health,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /metrics - Service metrics
   */
  router.get('/metrics', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const metrics = await marketplace.getMetrics();

      res.json({
        success: true,
        data: metrics,
      });
    } catch (err) {
      next(err);
    }
  });

  // Error handler
  router.use(errorHandler);

  return router;
}
