/**
 * @holoscript/auth - Shared JWT authentication for HoloScript APIs
 *
 * Provides a framework-agnostic AuthService used by both:
 *   - @holoscript/graphql-api  (Apollo Server plugin)
 *   - @holoscript/marketplace-api (Express middleware)
 *
 * @module @holoscript/auth
 */

import jwt from 'jsonwebtoken';

// =============================================================================
// TYPES
// =============================================================================

/**
 * User payload embedded in JWT tokens.
 */
export interface UserPayload {
  id: string;
  email?: string;
  roles: string[];
  permissions: string[];
}

/**
 * Authentication context produced by {@link AuthService.authenticate}.
 */
export interface AuthContext {
  user: UserPayload | null;
  isAuthenticated: boolean;
}

/**
 * Configuration accepted by {@link AuthService}.
 */
export interface AuthConfig {
  /** JWT signing secret. Defaults to env `JWT_SECRET`. */
  jwtSecret?: string;
  /** JWT expiration (e.g. '24h', 3600). Defaults to '24h'. */
  jwtExpiresIn?: string | number;
  /** Require authentication by default. Defaults to false. */
  requireAuth?: boolean;
  /** Operation names that never require auth. */
  publicOperations?: string[];
}

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Structured auth error thrown when token verification fails.
 * Consumers can map this to their own error type (GraphQLError, HTTP 401, etc.).
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'TOKEN_EXPIRED' | 'INVALID_TOKEN' | 'AUTH_FAILED'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const DEFAULT_JWT_EXPIRES_IN = '24h';
const DEFAULT_PUBLIC_OPERATIONS = ['listTargets', 'getTargetInfo', '__schema', '__type'];

// =============================================================================
// AUTH SERVICE
// =============================================================================

/**
 * Framework-agnostic JWT authentication service.
 *
 * Handles token generation, verification, and role/permission checks.
 * Both the GraphQL API and Marketplace API wrap this with their own
 * middleware / plugin layers.
 */
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string | number;
  private readonly requireAuth: boolean;
  private readonly publicOperations: Set<string>;

  constructor(config: AuthConfig = {}) {
    this.jwtSecret = config.jwtSecret || DEFAULT_JWT_SECRET;
    this.jwtExpiresIn = config.jwtExpiresIn || DEFAULT_JWT_EXPIRES_IN;
    this.requireAuth = config.requireAuth ?? false;
    this.publicOperations = new Set(config.publicOperations || DEFAULT_PUBLIC_OPERATIONS);

    if (
      this.jwtSecret === 'dev-secret-change-in-production' &&
      process.env.NODE_ENV === 'production'
    ) {
      console.error(
        '[AUTH ERROR] Using default JWT secret in production! Set JWT_SECRET environment variable.'
      );
    }
  }

  /** Generate a signed JWT for the given user payload. */
  generateToken(user: UserPayload): string {
    return jwt.sign(user, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn as number | undefined,
    } as jwt.SignOptions);
  }

  /** Verify and decode a JWT. Throws {@link AuthError} on failure. */
  verifyToken(token: string): UserPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as UserPayload;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new AuthError('Token expired. Please log in again.', 'TOKEN_EXPIRED');
      } else if (error instanceof Error && error.name === 'JsonWebTokenError') {
        throw new AuthError('Invalid token. Please log in again.', 'INVALID_TOKEN');
      }
      throw new AuthError('Authentication failed.', 'AUTH_FAILED');
    }
  }

  /**
   * Extract a bearer token from an Authorization header value.
   * Supports `"Bearer <token>"` and plain `"<token>"` formats.
   */
  extractToken(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    if (authHeader.startsWith('Bearer ')) return authHeader.substring(7);
    return authHeader;
  }

  /** Authenticate a request given its Authorization header value. */
  authenticate(authHeader: string | undefined): AuthContext {
    const token = this.extractToken(authHeader);
    if (!token) return { user: null, isAuthenticated: false };

    try {
      const user = this.verifyToken(token);
      return { user, isAuthenticated: true };
    } catch {
      return { user: null, isAuthenticated: false };
    }
  }

  /** Whether the named operation is in the public (no-auth) list. */
  isPublicOperation(operationName: string | undefined): boolean {
    if (!operationName) return false;
    return this.publicOperations.has(operationName);
  }

  /** Check if user has a specific role. */
  hasRole(user: UserPayload | null, role: string): boolean {
    return user?.roles.includes(role) ?? false;
  }

  /** Check if user has a specific permission. */
  hasPermission(user: UserPayload | null, permission: string): boolean {
    return user?.permissions.includes(permission) ?? false;
  }

  /** Determine whether the user can execute the named operation. */
  canPerformOperation(user: UserPayload | null, operationName: string): boolean {
    if (this.isPublicOperation(operationName)) return true;
    if (this.requireAuth && !user) return false;

    const operationPermissions: Record<string, string> = {
      compile: 'compile:write',
      batchCompile: 'compile:write',
      validateCode: 'validate:read',
      parseHoloScript: 'parse:read',
    };

    const requiredPermission = operationPermissions[operationName];
    if (requiredPermission) {
      return this.hasPermission(user, requiredPermission) || this.hasRole(user, 'admin');
    }

    return !this.requireAuth || !!user;
  }
}

// =============================================================================
// PERMISSION & ROLE CONSTANTS
// =============================================================================

/** Permission string constants. */
export const PERMISSIONS = {
  PARSE_READ: 'parse:read',
  VALIDATE_READ: 'validate:read',
  TARGETS_READ: 'targets:read',
  COMPILE_WRITE: 'compile:write',
  BATCH_COMPILE_WRITE: 'compile:batch',
  ADMIN_ALL: 'admin:*',
} as const;

/** Role definitions with their associated permissions. */
export const ROLES = {
  ANONYMOUS: {
    name: 'anonymous',
    permissions: [PERMISSIONS.PARSE_READ, PERMISSIONS.TARGETS_READ],
  },
  USER: {
    name: 'user',
    permissions: [
      PERMISSIONS.PARSE_READ,
      PERMISSIONS.VALIDATE_READ,
      PERMISSIONS.TARGETS_READ,
      PERMISSIONS.COMPILE_WRITE,
    ],
  },
  POWER_USER: {
    name: 'power_user',
    permissions: [
      PERMISSIONS.PARSE_READ,
      PERMISSIONS.VALIDATE_READ,
      PERMISSIONS.TARGETS_READ,
      PERMISSIONS.COMPILE_WRITE,
      PERMISSIONS.BATCH_COMPILE_WRITE,
    ],
  },
  ADMIN: {
    name: 'admin',
    permissions: [PERMISSIONS.ADMIN_ALL],
  },
} as const;

// =============================================================================
// DEFAULT SINGLETON
// =============================================================================

/**
 * Pre-configured singleton driven by environment variables.
 *
 * - `JWT_SECRET` - signing key
 * - `REQUIRE_AUTH` - set to `'true'` to enforce auth globally
 * - `PUBLIC_OPERATIONS` - comma-separated list of public operation names
 */
export const authService = new AuthService({
  jwtSecret: process.env.JWT_SECRET,
  requireAuth: process.env.REQUIRE_AUTH === 'true',
  publicOperations: process.env.PUBLIC_OPERATIONS?.split(',') || DEFAULT_PUBLIC_OPERATIONS,
});
