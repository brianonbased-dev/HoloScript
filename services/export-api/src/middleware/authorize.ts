/**
 * Authorization Middleware
 *
 * Role-based access control (RBAC) for API endpoints.
 * SOC 2 CC6.3: Authorization based on least privilege.
 *
 * Role hierarchy:
 * - admin:     Full access (CRUD on all resources, admin endpoints)
 * - developer: Compile, validate, view targets, view own jobs
 * - viewer:    View targets, view own jobs (read-only)
 * - service:   Machine-to-machine access (compile, validate)
 *
 * ADR-006: Unauthorized returns 404 to prevent enumeration.
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthIdentity } from './authenticate.js';
import { logSecurityEvent } from '../utils/logger.js';

/** Available roles */
export type Role = AuthIdentity['role'];

/** Permission definitions */
export const PERMISSIONS: Record<string, Role[]> = {
  'compile:submit': ['admin', 'developer', 'service'],
  'compile:status': ['admin', 'developer', 'service', 'viewer'],
  'compile:download': ['admin', 'developer', 'service'],
  'validate:submit': ['admin', 'developer', 'service'],
  'targets:list': ['admin', 'developer', 'service', 'viewer'],
  'admin:keys': ['admin'],
  'admin:audit': ['admin'],
  'admin:usage': ['admin'],
};

/**
 * Create an authorization middleware that checks the user's role
 * against the required permission.
 *
 * @param permission - Required permission string (e.g., 'compile:submit')
 */
export function authorize(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.identity) {
      // ADR-006: Return 404 to prevent enumeration
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const allowedRoles = PERMISSIONS[permission];
    if (!allowedRoles) {
      // Unknown permission - deny by default (fail closed)
      logSecurityEvent('unknown_permission', {
        requestId: req.requestId,
        permission,
        role: req.identity.role,
      }, 'error');
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (!allowedRoles.includes(req.identity.role)) {
      logSecurityEvent('authorization_denied', {
        requestId: req.requestId,
        permission,
        role: req.identity.role,
        sub: req.identity.sub,
        path: req.path,
        ip: req.ip,
      }, 'warn');

      // ADR-006: Return 404 to prevent enumeration
      res.status(404).json({ error: 'Not found' });
      return;
    }

    next();
  };
}

/**
 * Check if a role has a specific permission (for programmatic use).
 */
export function hasPermission(role: Role, permission: string): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles ? allowedRoles.includes(role) : false;
}
