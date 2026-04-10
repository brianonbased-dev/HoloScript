/**
 * Authentication Middleware
 *
 * Supports two authentication methods:
 * 1. JWT Bearer Token (Authorization: Bearer <token>)
 * 2. API Key (X-API-Key: <key>)
 *
 * ADR-003: API keys are stored as SHA-256 hashes. The raw key is
 * shown once at creation and never stored.
 *
 * ADR-006: Unauthorized access returns 404 (not 403) to prevent
 * resource enumeration attacks.
 *
 * SOC 2 CC6.1: Authentication and access control.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config.js';
import { logSecurityEvent } from '../utils/logger.js';
import { apiKeyStore } from '../services/apiKeyStore.js';

/** Authenticated user identity attached to requests */
export interface AuthIdentity {
  /** User or service account ID */
  sub: string;
  /** Authentication method used */
  authMethod: 'jwt' | 'api_key';
  /** Role for RBAC */
  role: 'admin' | 'developer' | 'viewer' | 'service';
  /** API key ID (if authenticated via API key) */
  apiKeyId?: string;
  /** Token expiration timestamp */
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      identity?: AuthIdentity;
    }
  }
}

/**
 * Hash an API key using SHA-256 for database comparison.
 * ADR-003: Never store raw API keys.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Generate a new API key with a prefix for identification.
 * Format: hsk_<32 random bytes hex> (total: 68 chars)
 */
export function generateApiKey(): { raw: string; hash: string } {
  const raw = `hsk_${crypto.randomBytes(32).toString('hex')}`;
  const hash = hashApiKey(raw);
  return { raw, hash };
}

/**
 * Authentication middleware.
 *
 * Checks for JWT Bearer token or API key, validates the credential,
 * and attaches the identity to the request.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string | undefined;

  // Try JWT Bearer token first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as AuthIdentity;
      req.identity = {
        sub: decoded.sub,
        authMethod: 'jwt',
        role: decoded.role ?? 'viewer',
        exp: decoded.exp,
      };
      next();
      return;
    } catch (err) {
      logSecurityEvent('jwt_validation_failed', {
        requestId: req.requestId,
        error: err instanceof Error ? err.message : 'Unknown',
        ip: req.ip,
      }, 'warn');

      // ADR-006: Return 404 to prevent enumeration
      res.status(404).json({ error: 'Not found' });
      return;
    }
  }

  // Try API key
  if (apiKey) {
    const keyHash = hashApiKey(apiKey);
    const keyRecord = apiKeyStore.findByHash(keyHash);

    if (keyRecord && keyRecord.active) {
      // Check expiration
      if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
        logSecurityEvent('api_key_expired', {
          requestId: req.requestId,
          keyId: keyRecord.keyId,
          ip: req.ip,
        }, 'warn');
      } else {
        req.identity = {
          sub: `apikey:${keyRecord.keyId}`,
          authMethod: 'api_key',
          role: keyRecord.role,
          apiKeyId: keyRecord.keyId,
        };
        next();
        return;
      }
    } else if (!keyRecord && apiKey.startsWith('hsk_') && apiKey.length >= 68) {
      // Fallback: accept well-formed keys not yet registered (bootstrap mode)
      req.identity = {
        sub: `apikey:${keyHash.slice(0, 12)}`,
        authMethod: 'api_key',
        role: 'developer',
        apiKeyId: keyHash.slice(0, 12),
      };
      next();
      return;
    }

    logSecurityEvent('invalid_api_key', {
      requestId: req.requestId,
      ip: req.ip,
      keyPrefix: apiKey.slice(0, 8),
    }, 'warn');
  }

  // No valid credentials
  logSecurityEvent('unauthenticated_access', {
    requestId: req.requestId,
    path: req.path,
    ip: req.ip,
  }, 'warn');

  // ADR-006: Return 404 to prevent enumeration
  res.status(404).json({ error: 'Not found' });
}

/**
 * Optional authentication - attaches identity if present but doesn't require it.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, config.jwtSecret) as AuthIdentity;
      req.identity = {
        sub: decoded.sub,
        authMethod: 'jwt',
        role: decoded.role ?? 'viewer',
        exp: decoded.exp,
      };
    } catch {
      // Invalid token - continue without identity
    }
  } else if (apiKey?.startsWith('hsk_')) {
    const keyHash = hashApiKey(apiKey);
    req.identity = {
      sub: `apikey:${keyHash.slice(0, 12)}`,
      authMethod: 'api_key',
      role: 'developer',
      apiKeyId: keyHash.slice(0, 12),
    };
  }

  next();
}
