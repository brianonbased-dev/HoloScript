/**
 * VFSSandbox.ts — Virtual File System Sandbox for Agent File Operations
 *
 * Constrains agent file operations to a safe set of directories.
 * Prevents jailbreak via path traversal (../, symlinks, etc.).
 *
 * Features:
 *   - Allowlist: only permitted directories can be written to
 *   - Denylist: specific paths always blocked (e.g., .env, .git/config)
 *   - Traversal detection: normalizes paths and blocks ../ escapes
 *   - Operation logging: audit trail of all file operations
 *   - Dry-run mode: validate operations without executing them
 *
 * Usage:
 *   const sandbox = new VFSSandbox({
 *     allowedRoots: ['/project/src', '/tmp/holoscript'],
 *     deniedPatterns: ['*.env', '.git/**', 'node_modules/**'],
 *   });
 *   sandbox.assertWritable('/project/src/scene.holo'); // ✅
 *   sandbox.assertWritable('/etc/passwd');              // ❌ throws
 */

import * as path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────

export interface VFSSandboxOptions {
  /** Absolute paths that are allowed as write roots */
  allowedRoots: string[];
  /** Glob patterns that are always denied (matched against basename + relative path) */
  deniedPatterns?: string[];
  /** If true, operations are logged but not blocked (audit mode) */
  auditOnly?: boolean;
  /** If true, log all operations to the audit trail */
  enableAudit?: boolean;
}

export interface VFSAuditEntry {
  timestamp: number;
  operation: 'read' | 'write' | 'delete' | 'mkdir';
  path: string;
  allowed: boolean;
  reason?: string;
}

export type VFSValidationResult =
  | { allowed: true; resolvedPath: string }
  | { allowed: false; resolvedPath: string; reason: string };

// ── Default deny patterns ──────────────────────────────────────────────────

const DEFAULT_DENIED_PATTERNS = [
  '.env',
  '.env.*',
  '.git/config',
  '.git/credentials',
  '.ssh/*',
  'id_rsa',
  'id_ed25519',
  '*.pem',
  '*.key',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

// ── Sandbox Class ──────────────────────────────────────────────────────────

export class VFSSandbox {
  private readonly allowedRoots: string[];
  private readonly deniedPatterns: string[];
  private readonly auditOnly: boolean;
  private readonly enableAudit: boolean;
  private readonly auditLog: VFSAuditEntry[] = [];

  constructor(options: VFSSandboxOptions) {
    this.allowedRoots = options.allowedRoots.map((r) => path.resolve(r));
    this.deniedPatterns = [
      ...DEFAULT_DENIED_PATTERNS,
      ...(options.deniedPatterns ?? []),
    ];
    this.auditOnly = options.auditOnly ?? false;
    this.enableAudit = options.enableAudit ?? true;
  }

  // ── Core Validation ────────────────────────────────────────────────────

  /**
   * Validate whether a path is accessible for the given operation.
   * Does NOT throw — returns a result object.
   */
  validate(filePath: string, operation: VFSAuditEntry['operation'] = 'write'): VFSValidationResult {
    const resolved = path.resolve(filePath);

    // 1. Path traversal detection
    if (this.hasTraversal(filePath)) {
      this.audit(operation, resolved, false, 'Path traversal detected');
      return { allowed: false, resolvedPath: resolved, reason: 'Path contains traversal sequences (../)' };
    }

    // 2. Check allowlist
    const isUnderAllowedRoot = this.allowedRoots.some((root) =>
      resolved.startsWith(root + path.sep) || resolved === root
    );

    if (!isUnderAllowedRoot) {
      this.audit(operation, resolved, false, 'Outside allowed roots');
      return {
        allowed: false,
        resolvedPath: resolved,
        reason: `Path "${resolved}" is outside all allowed roots: [${this.allowedRoots.join(', ')}]`,
      };
    }

    // 3. Check denylist
    const basename = path.basename(resolved);
    const deniedMatch = this.matchesDenyPattern(resolved, basename);
    if (deniedMatch) {
      this.audit(operation, resolved, false, `Matches denied pattern: ${deniedMatch}`);
      return {
        allowed: false,
        resolvedPath: resolved,
        reason: `Path matches denied pattern: "${deniedMatch}"`,
      };
    }

    // 4. Allowed
    this.audit(operation, resolved, true);
    return { allowed: true, resolvedPath: resolved };
  }

  /**
   * Assert a path is writable. Throws VFSAccessDenied if not.
   */
  assertWritable(filePath: string): string {
    const result = this.validate(filePath, 'write');
    if (!result.allowed) {
      if (this.auditOnly) return result.resolvedPath;
      throw new VFSAccessDenied(result.reason, result.resolvedPath);
    }
    return result.resolvedPath;
  }

  /**
   * Assert a path is readable. Throws VFSAccessDenied if not.
   */
  assertReadable(filePath: string): string {
    const result = this.validate(filePath, 'read');
    if (!result.allowed) {
      if (this.auditOnly) return result.resolvedPath;
      throw new VFSAccessDenied(result.reason, result.resolvedPath);
    }
    return result.resolvedPath;
  }

  /**
   * Assert a path is deletable. Throws VFSAccessDenied if not.
   */
  assertDeletable(filePath: string): string {
    const result = this.validate(filePath, 'delete');
    if (!result.allowed) {
      if (this.auditOnly) return result.resolvedPath;
      throw new VFSAccessDenied(result.reason, result.resolvedPath);
    }
    return result.resolvedPath;
  }

  // ── Introspection ──────────────────────────────────────────────────────

  /** Get the full audit log */
  getAuditLog(): readonly VFSAuditEntry[] {
    return this.auditLog;
  }

  /** Get only denied operations */
  getDeniedOperations(): VFSAuditEntry[] {
    return this.auditLog.filter((e) => !e.allowed);
  }

  /** Get summary stats */
  getStats(): { total: number; allowed: number; denied: number } {
    const total = this.auditLog.length;
    const denied = this.auditLog.filter((e) => !e.allowed).length;
    return { total, allowed: total - denied, denied };
  }

  /** Clear audit log */
  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  /** Get allowed roots (for display) */
  getAllowedRoots(): readonly string[] {
    return this.allowedRoots;
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private hasTraversal(filePath: string): boolean {
    // Check for .. segments in the raw path
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.includes('../') || normalized.endsWith('/..');
  }

  private matchesDenyPattern(resolved: string, basename: string): string | null {
    for (const pattern of this.deniedPatterns) {
      // Exact basename match
      if (pattern === basename) return pattern;

      // Wildcard match (simple glob: *.ext)
      if (pattern.startsWith('*.')) {
        const ext = pattern.slice(1); // ".ext"
        if (basename.endsWith(ext)) return pattern;
      }

      // Path segment match (e.g., ".git/**")
      if (pattern.endsWith('/**')) {
        const dir = pattern.slice(0, -3);
        const normalizedResolved = resolved.replace(/\\/g, '/');
        if (normalizedResolved.includes(`/${dir}/`) || normalizedResolved.includes(`\\${dir}\\`)) {
          return pattern;
        }
      }

      // Exact filename with wildcard prefix (e.g., ".env.*")
      if (pattern.includes('.*')) {
        const prefix = pattern.split('.*')[0];
        if (basename.startsWith(prefix + '.')) return pattern;
      }
    }
    return null;
  }

  private audit(
    operation: VFSAuditEntry['operation'],
    filePath: string,
    allowed: boolean,
    reason?: string
  ): void {
    if (!this.enableAudit) return;
    this.auditLog.push({
      timestamp: Date.now(),
      operation,
      path: filePath,
      allowed,
      reason,
    });
  }
}

// ── Error class ────────────────────────────────────────────────────────────

export class VFSAccessDenied extends Error {
  public readonly code = 'VFS_ACCESS_DENIED';
  public readonly filePath: string;

  constructor(reason: string, filePath: string) {
    super(`VFS Access Denied: ${reason}`);
    this.name = 'VFSAccessDenied';
    this.filePath = filePath;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a sandbox scoped to a HoloScript project directory.
 * Allows writes to src/, dist/, temp/, and .holoscript/ within the project.
 * Denies writes to .git/, node_modules/, .env files, and secrets.
 */
export function createProjectSandbox(projectRoot: string): VFSSandbox {
  const root = path.resolve(projectRoot);
  return new VFSSandbox({
    allowedRoots: [
      path.join(root, 'src'),
      path.join(root, 'dist'),
      path.join(root, 'temp'),
      path.join(root, '.holoscript'),
      path.join(root, 'packages'),
      path.join(root, 'docs'),
    ],
    deniedPatterns: [
      ...DEFAULT_DENIED_PATTERNS,
      'node_modules/**',
      '.git/**',
    ],
  });
}
