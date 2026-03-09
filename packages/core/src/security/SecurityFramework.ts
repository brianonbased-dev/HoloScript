/**
 * @holoscript/core Security Framework
 *
 * Production-grade cryptographic and authorization utilities
 *
 * @version 3.1
 * @milestone v3.1 Security Hardening
 */

import * as crypto from 'crypto';
import { z } from 'zod';

// ============================================================================
// Cryptographic Utilities
// ============================================================================

/**
 * Hash a token using PBKDF2 + SHA256
 * Production-grade alternative to simple hashing
 */
export function secureHashToken(
  token: string,
  salt?: Buffer,
  iterations: number = 100000
): { hash: string; salt: string } {
  const tokenSalt = salt || crypto.randomBytes(32);

  const hash = crypto.pbkdf2Sync(token, tokenSalt, iterations, 64, 'sha256');

  return {
    hash: hash.toString('hex'),
    salt: tokenSalt.toString('hex'),
  };
}

/**
 * Verify a token against its hash
 */
export function verifyToken(
  token: string,
  storedHash: string,
  storedSalt: string,
  iterations: number = 100000
): boolean {
  try {
    const salt = Buffer.from(storedSalt, 'hex');
    const hash = crypto.pbkdf2Sync(token, salt, iterations, 64, 'sha256');
    const computed = hash.toString('hex');

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
  } catch (error) {
    return false;
  }
}

/**
 * Generate random token
 */
export function generateRandomToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Encrypt data using AES-256-GCM
 */
export function encryptData(
  data: string,
  encryptionKey: string
): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt data encrypted with encryptData
 */
export function decryptData(
  encrypted: string,
  encryptionKey: string,
  iv: string,
  authTag: string
): string {
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));

  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============================================================================
// Input Validation Schemas (Zod)
// ============================================================================

/**
 * Scene validation schema
 */
export const SceneSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  owner: z.string().uuid(),
  visibility: z.enum(['private', 'shared', 'public']).default('private'),
  objects: z
    .array(
      z.object({
        id: z.string().uuid(),
        type: z.enum(['cube', 'sphere', 'cylinder', 'cone', 'custom']),
        position: z.tuple([z.number(), z.number(), z.number()]),
        rotation: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
        scale: z.number().positive().default(1),
        properties: z.record(z.unknown()).optional(),
      })
    )
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Scene = z.infer<typeof SceneSchema>;

/**
 * User validation schema
 */
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string().min(3).max(50),
  passwordHash: z.string(),
  passwordSalt: z.string(),
  role: z.enum(['user', 'admin', 'moderator']).default('user'),
  permissions: z.array(z.string()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  lastLogin: z.date().optional(),
});

export type User = z.infer<typeof UserSchema>;

/**
 * API request validation
 */
export const APIRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  path: z.string().startsWith('/'),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  timestamp: z.number(),
  signature: z.string().optional(),
});

export type APIRequest = z.infer<typeof APIRequestSchema>;

/**
 * Validate and parse input safely
 */
export function validateInput<T>(schema: z.ZodSchema, input: unknown): T {
  try {
    return schema.parse(input) as T;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation failed: ${error.issues.map((e) => e.message).join(', ')}`);
    }
    throw error;
  }
}

// ============================================================================
// Rate Limiting (Token Bucket)
// ============================================================================

interface TokenBucketConfig {
  capacity: number; // Maximum tokens
  refillRate: number; // Tokens per second
  windowMs: number; // Window size in milliseconds
}

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();
  private config: TokenBucketConfig;

  constructor(config: Partial<TokenBucketConfig> = {}) {
    this.config = {
      capacity: config.capacity || 100,
      refillRate: config.refillRate || 10, // 10 tokens per second
      windowMs: config.windowMs || 60000, // 1 minute
    };
  }

  /**
   * Check if request is allowed
   */
  isAllowed(key: string, tokensNeeded: number = 1): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.config.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      this.config.capacity,
      bucket.tokens + elapsedSeconds * this.config.refillRate
    );
    bucket.lastRefill = now;

    if (bucket.tokens >= tokensNeeded) {
      bucket.tokens -= tokensNeeded;
      return true;
    }

    return false;
  }

  /**
   * Get remaining tokens
   */
  getRemainingTokens(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.config.capacity;

    const now = Date.now();
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    const currentTokens = Math.min(
      this.config.capacity,
      bucket.tokens + elapsedSeconds * this.config.refillRate
    );

    return Math.floor(currentTokens);
  }

  /**
   * Reset bucket for a key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Clear all buckets (on shutdown)
   */
  clearAll(): void {
    this.buckets.clear();
  }
}

// ============================================================================
// Role-Based Access Control (RBAC)
// ============================================================================

/**
 * Permission levels
 */
export enum Permission {
  // Scene operations
  CREATE_SCENE = 'create_scene',
  EDIT_SCENE = 'edit_scene',
  DELETE_SCENE = 'delete_scene',
  VIEW_SCENE = 'view_scene',
  SHARE_SCENE = 'share_scene',

  // User management
  CREATE_USER = 'create_user',
  EDIT_USER = 'edit_user',
  DELETE_USER = 'delete_user',
  VIEW_USER = 'view_user',

  // Admin operations
  MANAGE_PERMISSIONS = 'manage_permissions',
  VIEW_LOGS = 'view_logs',
  MANAGE_SYSTEM = 'manage_system',

  // Higher-tier operations
  ADMIN_ALL = 'admin_all',
}

/**
 * Role definitions with permissions
 */
export const ROLES: Record<string, Permission[]> = {
  user: [
    Permission.CREATE_SCENE,
    Permission.EDIT_SCENE,
    Permission.DELETE_SCENE,
    Permission.VIEW_SCENE,
    Permission.SHARE_SCENE,
  ],
  moderator: [
    Permission.CREATE_SCENE,
    Permission.EDIT_SCENE,
    Permission.DELETE_SCENE,
    Permission.VIEW_SCENE,
    Permission.SHARE_SCENE,
    Permission.VIEW_USER,
    Permission.VIEW_LOGS,
  ],
  admin: [Permission.ADMIN_ALL],
};

/**
 * Check if user has permission
 */
export function hasPermission(userRole: string, permission: Permission): boolean {
  if (userRole === 'admin') {
    return true; // Admins have all permissions
  }

  const rolePermissions = ROLES[userRole] || [];
  return rolePermissions.includes(permission);
}

/**
 * Check multiple permissions (AND logic)
 */
export function hasAllPermissions(userRole: string, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(userRole, p));
}

/**
 * Check multiple permissions (OR logic)
 */
export function hasAnyPermission(userRole: string, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(userRole, p));
}

// ============================================================================
// Audit Logging
// ============================================================================

export interface AuditEntry {
  id: string;
  timestamp: number;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  changes?: Record<string, unknown>;
  result: 'success' | 'failure';
  reason?: string;
  ipAddress?: string;
}

/**
 * Audit logger
 */
export class AuditLogger {
  private entries: AuditEntry[] = [];
  private maxEntries: number = 10000;

  /**
   * Log an action
   */
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const auditEntry: AuditEntry = {
      ...entry,
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    };

    this.entries.push(auditEntry);

    // Keep in-memory size bounded
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    return auditEntry;
  }

  /**
   * Query audit log
   */
  query(filters: {
    userId?: string;
    action?: string;
    resource?: string;
    startTime?: number;
    endTime?: number;
  }): AuditEntry[] {
    return this.entries.filter((entry) => {
      if (filters.userId && entry.userId !== filters.userId) return false;
      if (filters.action && entry.action !== filters.action) return false;
      if (filters.resource && entry.resource !== filters.resource) return false;
      if (filters.startTime && entry.timestamp < filters.startTime) return false;
      if (filters.endTime && entry.timestamp > filters.endTime) return false;
      return true;
    });
  }

  /**
   * Get recent entries
   */
  getRecent(count: number = 100): AuditEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Export to JSON
   */
  export(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
  }
}

/**
 * Global audit logger instance
 */
export const auditLogger = new AuditLogger();

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Generate secure random number between min and max
 */
export function secureRandom(min: number, max: number): number {
  const range = max - min;
  const randomBuffer = crypto.randomBytes(4);
  const randomValue = randomBuffer.readUInt32BE(0) / 0xffffffff;
  return min + randomValue * range;
}

/**
 * Validate API signature
 */
export function validateSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expected = hmac.digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch (error) {
    return false;
  }
}

/**
 * Generate API signature
 */
export function generateSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return hmac.digest('hex');
}

export default {
  secureHashToken,
  verifyToken,
  generateRandomToken,
  encryptData,
  decryptData,
  RateLimiter,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  AuditLogger,
  auditLogger,
  validateInput,
  secureRandom,
  validateSignature,
  generateSignature,
};
