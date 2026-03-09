/**
 * Security Headers Middleware
 *
 * Applies security headers via Helmet with custom additions.
 * SOC 2 CC6.1: Network protection controls.
 *
 * Headers applied:
 * - Content-Security-Policy: restrict script/style sources
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - X-XSS-Protection: 0 (modern browsers, CSP preferred)
 * - Strict-Transport-Security: HSTS
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: disable unnecessary APIs
 */

import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

export const securityHeadersMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xContentTypeOptions: true,
  xDnsPrefetchControl: true,
  xDownloadOptions: true,
  xFrameOptions: { action: 'deny' },
  xPermittedCrossDomainPolicies: true,
  xPoweredBy: false,
  xXssProtection: false, // CSP is preferred over X-XSS-Protection
});

/**
 * Additional custom security headers not covered by Helmet.
 */
export function customSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Disable browser caching for API responses (prevent sensitive data caching)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Permissions Policy: disable unnecessary browser APIs
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  next();
}
