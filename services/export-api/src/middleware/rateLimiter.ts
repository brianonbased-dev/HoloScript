/**
 * Rate Limiting Middleware
 *
 * Sliding window rate limiting per authenticated identity.
 * SOC 2 CC6.6: System boundaries and rate controls.
 *
 * Rate limits are applied per-identity:
 * - admin:     500 requests/minute
 * - developer: 100 requests/minute
 * - viewer:    50 requests/minute
 * - service:   200 requests/minute
 * - anonymous: 10 requests/minute
 */

import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { config } from '../config.js';

/** Rate limits by role */
const ROLE_LIMITS: Record<string, number> = {
  admin: 500,
  developer: 100,
  viewer: 50,
  service: 200,
  anonymous: 10,
};

/**
 * Create the rate limiting middleware.
 *
 * Uses a sliding window counter keyed by the authenticated identity
 * (or IP address for anonymous requests).
 */
export const rateLimiterMiddleware = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: (req: Request) => {
    const role = req.identity?.role ?? 'anonymous';
    return ROLE_LIMITS[role] ?? config.rateLimitMax;
  },
  keyGenerator: (req: Request) => {
    // Key by identity for authenticated users, IP for anonymous
    return req.identity?.sub ?? req.ip ?? 'unknown';
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers

  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please retry after the rate limit window.',
    retryAfterMs: config.rateLimitWindowMs,
  },

  handler: (req, res, _next, options) => {
    res.status(429).json(options.message);
  },
});

/**
 * Stricter rate limit for compile endpoints (resource-intensive).
 */
export const compileRateLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: (req: Request) => {
    const role = req.identity?.role ?? 'anonymous';
    switch (role) {
      case 'admin': return 50;
      case 'developer': return 10;
      case 'service': return 20;
      default: return 2;
    }
  },
  keyGenerator: (req: Request) => {
    return req.identity?.sub ?? req.ip ?? 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many compile requests',
    message: 'Compile rate limit exceeded. Please wait before submitting another compilation.',
  },
});
