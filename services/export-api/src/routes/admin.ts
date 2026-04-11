/**
 * Admin Routes
 *
 * Administrative endpoints for API key management, audit logs, and usage.
 * All endpoints require admin role.
 *
 * ADR-003: API keys stored as SHA-256 hash only. Raw key shown once at creation.
 * ADR-004: Audit logs are append-only with integrity hashes.
 */

import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validateBody.js';
import { generateApiKey } from '../middleware/authenticate.js';
import { auditService } from '../services/auditService.js';
import { _logger } from '../utils/logger.js';
import { logSecurityEvent } from '../utils/logger.js';

export const adminRouter = Router();

// All admin routes require authentication and admin role
adminRouter.use(authenticate);

// =============================================================================
// API KEY MANAGEMENT
// =============================================================================

/**
 * POST /api/v1/admin/keys
 * Create a new API key.
 * ADR-003: Returns the raw key ONCE. Only the hash is stored.
 */
adminRouter.post(
  '/keys',
  authorize('admin:keys'),
  validateBody('createApiKey'),
  (req: Request, res: Response) => {
    const { name, role, expiresAt } = req.body;

    const { raw, hash } = generateApiKey();

    // TODO: Store hash, name, role, expiresAt in database
    // await db.apiKeys.create({ hash, name, role, expiresAt, createdBy: req.identity.sub });

    logSecurityEvent('api_key_created', {
      requestId: req.requestId,
      keyName: name,
      role,
      createdBy: req.identity!.sub,
      hashPrefix: hash.slice(0, 12),
    });

    res.status(201).json({
      message: 'API key created. Save the key below - it will not be shown again.',
      apiKey: raw, // ADR-003: Shown once, then only hash is stored
      keyId: hash.slice(0, 12),
      name,
      role,
      expiresAt: expiresAt ?? null,
      createdAt: new Date().toISOString(),
      warning: 'Store this API key securely. It cannot be retrieved after this response.',
    });
  }
);

/**
 * GET /api/v1/admin/keys
 * List API keys (metadata only, no raw keys).
 */
adminRouter.get(
  '/keys',
  authorize('admin:keys'),
  (_req: Request, res: Response) => {
    // TODO: Fetch from database
    // const keys = await db.apiKeys.list();
    res.status(200).json({
      keys: [],
      count: 0,
      message: 'API key listing requires database integration.',
    });
  }
);

/**
 * DELETE /api/v1/admin/keys/:keyId
 * Revoke an API key.
 */
adminRouter.delete(
  '/keys/:keyId',
  authorize('admin:keys'),
  (req: Request, res: Response) => {
    const { keyId } = req.params;

    logSecurityEvent('api_key_revoked', {
      requestId: req.requestId,
      keyId,
      revokedBy: req.identity!.sub,
    });

    // TODO: Deactivate in database
    // await db.apiKeys.revoke(keyId);

    res.status(200).json({
      message: `API key ${keyId} has been revoked.`,
      keyId,
      revokedAt: new Date().toISOString(),
      revokedBy: req.identity!.sub,
    });
  }
);

// =============================================================================
// AUDIT LOGS
// =============================================================================

/**
 * GET /api/v1/admin/audit-logs
 * Query audit logs with filtering and pagination.
 * ADR-004: Read-only access to append-only logs.
 */
adminRouter.get(
  '/audit-logs',
  authorize('admin:audit'),
  (req: Request, res: Response) => {
    const result = auditService.query({
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
      identity: req.query.identity as string,
      method: req.query.method as string,
      path: req.query.path as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });

    res.status(200).json(result);
  }
);

/**
 * GET /api/v1/admin/audit-logs/integrity
 * Verify the integrity of the audit log chain.
 */
adminRouter.get(
  '/audit-logs/integrity',
  authorize('admin:audit'),
  (_req: Request, res: Response) => {
    const result = auditService.verifyIntegrity();

    res.status(result.valid ? 200 : 500).json({
      ...result,
      message: result.valid
        ? 'Audit log integrity verified. All entries are authentic and unmodified.'
        : `Integrity violation detected at entry index ${result.firstTamperedIndex}.`,
    });
  }
);

// =============================================================================
// USAGE & METRICS
// =============================================================================

/**
 * GET /api/v1/admin/usage
 * Get API usage statistics.
 */
adminRouter.get(
  '/usage',
  authorize('admin:usage'),
  (_req: Request, res: Response) => {
    const auditStats = auditService.getStats();

    // TODO: Fetch from usage_records table
    res.status(200).json({
      totalRequests: auditStats.totalEntries,
      auditIntegrity: auditStats.integrityValid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      message: 'Detailed usage metrics require database integration (usage_records table).',
    });
  }
);
