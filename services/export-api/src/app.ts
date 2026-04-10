/**
 * Express Application Setup
 *
 * Configures the Express app with the full middleware stack (8 layers)
 * and route handlers per the SOC 2 compliance design.
 *
 * Middleware stack order (per research):
 * 1. Security headers (Helmet + custom)
 * 2. Request ID generation (UUID v4)
 * 3. Body size limiting (1MB default)
 * 4. CORS
 * 5. Authentication (JWT + API key)
 * 6. Rate limiting (sliding window per identity)
 * 7. Input validation (AJV + OpenAPI schemas)
 * 8. Audit logging (immutable, append-only)
 *
 * Note: Auth, rate limiting, and validation are applied per-route,
 * not globally, for flexibility. Security headers, request ID,
 * body parsing, CORS, and audit logging are global.
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { config } from './config.js';

// Middleware
import { requestIdMiddleware } from './middleware/requestId.js';
import { securityHeadersMiddleware, customSecurityHeaders } from './middleware/securityHeaders.js';
import { rateLimiterMiddleware } from './middleware/rateLimiter.js';
import { auditLogMiddleware } from './middleware/auditLog.js';

// Routes
import { healthRouter } from './routes/health.js';
import { compileRouter } from './routes/compile.js';
import { validateRouter } from './routes/validate.js';
import { targetsRouter } from './routes/targets.js';
import { adminRouter } from './routes/admin.js';

import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();

  // ==========================================================================
  // GLOBAL MIDDLEWARE (applied in order)
  // ==========================================================================

  // 1. Security headers (Helmet + custom)
  app.use(securityHeadersMiddleware);
  app.use(customSecurityHeaders);

  // 2. Request ID generation
  app.use(requestIdMiddleware);

  // 3. Body parsing with size limit
  app.use(express.json({ limit: config.maxBodySize }));
  app.use(express.urlencoded({ extended: false, limit: config.maxBodySize }));

  // 4. CORS
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-API-Key',
        'X-Request-Id',
        'X-Idempotency-Key',
      ],
      exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
      credentials: true,
      maxAge: 86400, // 24 hours
    })
  );

  // 5. Compression
  app.use(compression());

  // 6. Global rate limiter (per-endpoint rate limits are in routes)
  app.use(rateLimiterMiddleware);

  // 7. Audit logging (on all routes)
  app.use(auditLogMiddleware);

  // ==========================================================================
  // ROUTES
  // ==========================================================================

  // Health checks (no auth required, no API prefix)
  app.use(healthRouter);

  // API v1 routes
  app.use(`${config.apiPrefix}/compile`, compileRouter);
  app.use(`${config.apiPrefix}/validate`, validateRouter);
  app.use(`${config.apiPrefix}/targets`, targetsRouter);
  app.use(`${config.apiPrefix}/admin`, adminRouter);

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  // 404 handler for unmatched routes
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Global error handler
  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      logger.error(
        {
          requestId: req.requestId,
          error: err.message,
          stack: config.env === 'development' ? err.stack : undefined,
        },
        'Unhandled error'
      );

      res.status(500).json({
        error: 'Internal server error',
        requestId: req.requestId,
        // Only include details in development
        ...(config.env === 'development' && { message: err.message }),
      });
    }
  );

  return app;
}
