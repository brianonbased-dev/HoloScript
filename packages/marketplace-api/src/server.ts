/**
 * @fileoverview Express server for HoloScript Trait Marketplace API
 * @module marketplace-api/server
 */

import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createMarketplaceRoutes } from './routes.js';
import { MarketplaceService } from './MarketplaceService.js';
import { TraitRegistry } from './TraitRegistry.js';
import { PostgresTraitDatabase } from './PostgresTraitDatabase.js';

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins?: string[];
  trustProxy?: boolean;
}

const DEFAULT_CONFIG: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  trustProxy: process.env.TRUST_PROXY === 'true',
};

// =============================================================================
// SERVER FACTORY
// =============================================================================

/**
 * Create configured Express application
 */
export function createApp(
  marketplace?: MarketplaceService,
  config?: Partial<ServerConfig>
): Express {
  const app = express();
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const service = marketplace ?? new MarketplaceService();

  // Trust proxy if behind reverse proxy (e.g., nginx, load balancer)
  if (cfg.trustProxy) {
    app.set('trust proxy', 1);
  }

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allow inline scripts for API docs
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS
  app.use(
    cors({
      origin: cfg.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Retry-After',
      ],
    })
  );

  // Compression
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- compression() returns RequestHandler but types diverge between packages
  app.use(compression() as unknown as express.RequestHandler);

  // Body parsing
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Request ID middleware
  app.use((req, res, next) => {
    const requestId =
      (req.headers['x-request-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
  });

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'HoloScript Trait Marketplace API',
      version: '1.0.0',
      documentation: '/docs',
      endpoints: {
        traits: '/api/v1/traits',
        resolve: '/api/v1/resolve',
        compatibility: '/api/v1/compatibility',
        health: '/api/v1/health',
      },
    });
  });

  // API routes
  app.use('/api/v1', createMarketplaceRoutes(service));

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
      },
    });
  });

  // Global error handler
  app.use(
    (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('Unhandled error:', err);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
        },
      });
    }
  );

  return app;
}

/**
 * Start the server
 */
export async function startServer(
  config?: Partial<ServerConfig>
): Promise<{ app: Express; port: number }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Use PostgreSQL when DATABASE_URL is set (Railway production), else in-memory (dev)
  let registry: TraitRegistry;
  if (process.env.DATABASE_URL) {
    console.log('[db] Connecting to PostgreSQL...');
    const pgDb = new PostgresTraitDatabase(process.env.DATABASE_URL);
    await pgDb.initSchema();
    console.log('[db] PostgreSQL ready');
    registry = new TraitRegistry(pgDb);
  } else {
    console.log('[db] Using in-memory database (set DATABASE_URL for persistence)');
    registry = new TraitRegistry();
  }

  const marketplace = new MarketplaceService({ registry });
  const app = createApp(marketplace, cfg);

  return new Promise((resolve, reject) => {
    const server = app.listen(cfg.port, cfg.host, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   HoloScript Trait Marketplace API                         ║
║                                                            ║
║   Server running at http://${cfg.host}:${cfg.port}                ║
║                                                            ║
║   Endpoints:                                               ║
║   - GET  /api/v1/traits         Search traits              ║
║   - POST /api/v1/traits         Publish trait              ║
║   - GET  /api/v1/traits/:id     Get trait                  ║
║   - POST /api/v1/resolve        Resolve dependencies       ║
║   - GET  /api/v1/health         Health check               ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      `);
      resolve({ app, port: cfg.port });
    });

    server.on('error', reject);
  });
}

// =============================================================================
// CLI ENTRY POINT
// =============================================================================

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
