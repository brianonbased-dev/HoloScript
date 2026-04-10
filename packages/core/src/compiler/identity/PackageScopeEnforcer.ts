/**
 * HoloScript Package Scope Enforcer
 *
 * Enforces per-package write-access boundaries for agent operations.
 * Integrates with AgentRBAC to add filesystem-level path restriction
 * on top of role-based permissions.
 *
 * Prevents:
 * - Agents writing outside their authorized package scope
 * - Path traversal attacks via normalized path comparison
 * - Cross-package contamination from misconfigured agents
 *
 * @version 1.0.0
 */

import * as path from 'path';
import { AgentRole } from './AgentIdentity';
import { AgentTokenIssuer, getTokenIssuer } from './AgentTokenIssuer';
import {
  PackageTier,
  PackagePermission,
  PACKAGE_PERMISSION_MANIFEST,
} from './PackagePermissionManifest';

/**
 * Scope enforcement decision
 */
export interface ScopeDecision {
  allowed: boolean;
  reason: string;
  packageName?: string;
  packageTier?: PackageTier;
  agentRole?: AgentRole;
  requestedPath?: string;
}

/**
 * Scope enforcement audit entry
 */
export interface ScopeAuditEntry {
  timestamp: number;
  agentRole: AgentRole;
  operation: 'read' | 'write';
  targetPath: string;
  packageName: string | null;
  allowed: boolean;
  reason: string;
}

/**
 * Package Scope Enforcer configuration
 */
export interface ScopeEnforcerConfig {
  /** Repository root path (absolute) */
  repositoryRoot: string;

  /** Token issuer for agent verification */
  tokenIssuer?: AgentTokenIssuer;

  /** Enable audit logging */
  enableAudit?: boolean;

  /** Maximum audit log size */
  maxAuditEntries?: number;

  /** Whether to allow operations outside any known package */
  allowUnknownPaths?: boolean;
}

/**
 * Package Scope Enforcer
 *
 * Validates that agent file operations respect per-package boundaries.
 * Uses the PackagePermissionManifest to determine access rights.
 *
 * @example
 * ```typescript
 * const enforcer = new PackageScopeEnforcer({
 *   repositoryRoot: '/path/to/HoloScript',
 * });
 *
 * // Check if syntax_analyzer can write to core package
 * const decision = enforcer.checkWriteAccess(
 *   agentToken,
 *   '/path/to/HoloScript/packages/core/src/parser.ts'
 * );
 *
 * if (!decision.allowed) {
 *   throw new Error(`Write denied: ${decision.reason}`);
 * }
 * ```
 */
export class PackageScopeEnforcer {
  private config: Required<ScopeEnforcerConfig>;
  private auditLog: ScopeAuditEntry[] = [];
  private tokenIssuer: AgentTokenIssuer;

  constructor(config: ScopeEnforcerConfig) {
    this.config = {
      repositoryRoot: path.normalize(config.repositoryRoot),
      tokenIssuer: config.tokenIssuer || getTokenIssuer(),
      enableAudit: config.enableAudit ?? true,
      maxAuditEntries: config.maxAuditEntries ?? 10000,
      allowUnknownPaths: config.allowUnknownPaths ?? false,
    };
    this.tokenIssuer = this.config.tokenIssuer;
  }

  /**
   * Resolve a file path to its owning package
   */
  resolvePackage(filePath: string): PackagePermission | null {
    const normalizedPath = path.normalize(filePath);
    const repoRoot = this.config.repositoryRoot;

    // Ensure path is within repository
    if (!normalizedPath.startsWith(repoRoot)) {
      return null;
    }

    // Get relative path from repo root
    const relativePath = path.relative(repoRoot, normalizedPath);

    // Normalize separators for comparison
    const normalizedRelative = relativePath.replace(/\\/g, '/');

    // Find matching package by path prefix
    for (const pkg of PACKAGE_PERMISSION_MANIFEST) {
      if (normalizedRelative.startsWith(pkg.path + '/') || normalizedRelative === pkg.path) {
        return pkg;
      }
    }

    return null;
  }

  /**
   * Check if an agent can WRITE to a specific file path
   */
  checkWriteAccess(token: string, filePath: string): ScopeDecision {
    // Step 1: Verify token and extract role
    const tokenResult = this.tokenIssuer.verifyToken(token);
    if (!tokenResult.valid || !tokenResult.payload) {
      return this.makeDenied(`Token verification failed: ${tokenResult.error}`, filePath);
    }

    const agentRole = tokenResult.payload.agent_role;
    const normalizedPath = path.normalize(filePath);

    // Step 2: Prevent path traversal - must be within repository
    if (!normalizedPath.startsWith(this.config.repositoryRoot)) {
      const decision = this.makeDenied(
        `Path outside repository root: ${normalizedPath}`,
        filePath,
        agentRole
      );
      this.audit(agentRole, 'write', filePath, null, false, decision.reason);
      return decision;
    }

    // Step 3: Detect path traversal sequences
    const relativePath = path.relative(this.config.repositoryRoot, normalizedPath);
    if (relativePath.includes('..')) {
      const decision = this.makeDenied(
        `Path traversal detected: ${relativePath}`,
        filePath,
        agentRole
      );
      this.audit(agentRole, 'write', filePath, null, false, decision.reason);
      return decision;
    }

    // Step 4: Resolve target package
    const pkg = this.resolvePackage(normalizedPath);

    if (!pkg) {
      if (!this.config.allowUnknownPaths) {
        const decision = this.makeDenied(
          `Path does not belong to any known package: ${relativePath}`,
          filePath,
          agentRole
        );
        this.audit(agentRole, 'write', filePath, null, false, decision.reason);
        return decision;
      }
      // Allow unknown paths if configured (e.g., top-level scripts, docs)
      const decision: ScopeDecision = {
        allowed: true,
        reason: 'Path outside known packages, allowUnknownPaths=true',
        agentRole,
        requestedPath: filePath,
      };
      this.audit(agentRole, 'write', filePath, null, true, decision.reason);
      return decision;
    }

    // Step 5: Check if agent role is in the package's write-roles
    if (!pkg.writeRoles.includes(agentRole)) {
      const decision: ScopeDecision = {
        allowed: false,
        reason:
          `Role '${agentRole}' cannot write to ${pkg.tier}-tier package '${pkg.name}'. ` +
          `Allowed write roles: [${pkg.writeRoles.join(', ')}]`,
        packageName: pkg.name,
        packageTier: pkg.tier,
        agentRole,
        requestedPath: filePath,
      };
      this.audit(agentRole, 'write', filePath, pkg.name, false, decision.reason);
      return decision;
    }

    // Step 6: Verify token scope matches package path (if scope is set)
    if (tokenResult.payload.scope) {
      const tokenScope = path.normalize(tokenResult.payload.scope);
      const packageFullPath = path.join(this.config.repositoryRoot, pkg.path);
      if (!packageFullPath.startsWith(tokenScope) && !tokenScope.startsWith(packageFullPath)) {
        const decision: ScopeDecision = {
          allowed: false,
          reason: `Token scope '${tokenResult.payload.scope}' does not cover package '${pkg.name}'`,
          packageName: pkg.name,
          packageTier: pkg.tier,
          agentRole,
          requestedPath: filePath,
        };
        this.audit(agentRole, 'write', filePath, pkg.name, false, decision.reason);
        return decision;
      }
    }

    // Access granted
    const decision: ScopeDecision = {
      allowed: true,
      reason: `Write access granted: role '${agentRole}' to ${pkg.tier}-tier package '${pkg.name}'`,
      packageName: pkg.name,
      packageTier: pkg.tier,
      agentRole,
      requestedPath: filePath,
    };
    this.audit(agentRole, 'write', filePath, pkg.name, true, decision.reason);
    return decision;
  }

  /**
   * Check if an agent can READ from a specific file path
   */
  checkReadAccess(token: string, filePath: string): ScopeDecision {
    // Step 1: Verify token
    const tokenResult = this.tokenIssuer.verifyToken(token);
    if (!tokenResult.valid || !tokenResult.payload) {
      return this.makeDenied(`Token verification failed: ${tokenResult.error}`, filePath);
    }

    const agentRole = tokenResult.payload.agent_role;
    const normalizedPath = path.normalize(filePath);

    // Step 2: Must be within repository
    if (!normalizedPath.startsWith(this.config.repositoryRoot)) {
      const decision = this.makeDenied(
        `Path outside repository root: ${normalizedPath}`,
        filePath,
        agentRole
      );
      this.audit(agentRole, 'read', filePath, null, false, decision.reason);
      return decision;
    }

    // Step 3: All authenticated agents can read all packages
    const pkg = this.resolvePackage(normalizedPath);
    const decision: ScopeDecision = {
      allowed: true,
      reason: pkg
        ? `Read access granted: role '${agentRole}' from package '${pkg.name}'`
        : `Read access granted: role '${agentRole}' from non-package path`,
      packageName: pkg?.name,
      packageTier: pkg?.tier,
      agentRole,
      requestedPath: filePath,
    };
    this.audit(agentRole, 'read', filePath, pkg?.name || null, true, decision.reason);
    return decision;
  }

  /**
   * Bulk check: which packages can an agent role write to?
   */
  getWritablePackagesForRole(role: AgentRole): PackagePermission[] {
    return PACKAGE_PERMISSION_MANIFEST.filter((pkg) => pkg.writeRoles.includes(role));
  }

  /**
   * Get audit log entries
   */
  getAuditLog(filter?: {
    agentRole?: AgentRole;
    operation?: 'read' | 'write';
    allowed?: boolean;
    packageName?: string;
    since?: number;
  }): ScopeAuditEntry[] {
    let entries = [...this.auditLog];

    if (filter) {
      if (filter.agentRole) entries = entries.filter((e) => e.agentRole === filter.agentRole);
      if (filter.operation) entries = entries.filter((e) => e.operation === filter.operation);
      if (filter.allowed !== undefined)
        entries = entries.filter((e) => e.allowed === filter.allowed);
      if (filter.packageName) entries = entries.filter((e) => e.packageName === filter.packageName);
      if (filter.since !== undefined) {
        const since = filter.since;
        entries = entries.filter((e) => e.timestamp >= since);
      }
    }

    return entries;
  }

  /**
   * Get denied access attempts (security incidents)
   */
  getDeniedAttempts(): ScopeAuditEntry[] {
    return this.auditLog.filter((e) => !e.allowed);
  }

  /**
   * Get access statistics
   */
  getAccessStats(): {
    totalChecks: number;
    allowed: number;
    denied: number;
    byPackage: Record<string, { reads: number; writes: number; denials: number }>;
    byRole: Record<string, { allowed: number; denied: number }>;
  } {
    const stats = {
      totalChecks: this.auditLog.length,
      allowed: 0,
      denied: 0,
      byPackage: {} as Record<string, { reads: number; writes: number; denials: number }>,
      byRole: {} as Record<string, { allowed: number; denied: number }>,
    };

    for (const entry of this.auditLog) {
      if (entry.allowed) {
        stats.allowed++;
      } else {
        stats.denied++;
      }

      // By package
      const pkgName = entry.packageName || '_unknown_';
      if (!stats.byPackage[pkgName]) {
        stats.byPackage[pkgName] = { reads: 0, writes: 0, denials: 0 };
      }
      if (!entry.allowed) {
        stats.byPackage[pkgName].denials++;
      } else if (entry.operation === 'read') {
        stats.byPackage[pkgName].reads++;
      } else {
        stats.byPackage[pkgName].writes++;
      }

      // By role
      const roleName = entry.agentRole;
      if (!stats.byRole[roleName]) {
        stats.byRole[roleName] = { allowed: 0, denied: 0 };
      }
      if (entry.allowed) {
        stats.byRole[roleName].allowed++;
      } else {
        stats.byRole[roleName].denied++;
      }
    }

    return stats;
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private makeDenied(reason: string, filePath: string, agentRole?: AgentRole): ScopeDecision {
    return {
      allowed: false,
      reason,
      agentRole,
      requestedPath: filePath,
    };
  }

  private audit(
    agentRole: AgentRole,
    operation: 'read' | 'write',
    targetPath: string,
    packageName: string | null,
    allowed: boolean,
    reason: string
  ): void {
    if (!this.config.enableAudit) return;

    this.auditLog.push({
      timestamp: Date.now(),
      agentRole,
      operation,
      targetPath,
      packageName,
      allowed,
      reason,
    });

    // Trim log if too large
    if (this.auditLog.length > this.config.maxAuditEntries) {
      this.auditLog = this.auditLog.slice(-this.config.maxAuditEntries);
    }
  }
}

/**
 * Global enforcer instance
 */
let globalEnforcer: PackageScopeEnforcer | null = null;

/**
 * Get or create global scope enforcer
 */
export function getScopeEnforcer(config?: ScopeEnforcerConfig): PackageScopeEnforcer {
  if (!globalEnforcer && config) {
    globalEnforcer = new PackageScopeEnforcer(config);
  }
  if (!globalEnforcer) {
    throw new Error(
      'PackageScopeEnforcer not initialized. Call getScopeEnforcer(config) with repository root path first.'
    );
  }
  return globalEnforcer;
}

/**
 * Reset global enforcer (for testing)
 */
export function resetScopeEnforcer(): void {
  globalEnforcer = null;
}
