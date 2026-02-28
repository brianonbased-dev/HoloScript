/**
 * Authentication Service
 * Week 4: JWT-based authentication for GraphQL API
 */

import jwt from 'jsonwebtoken';
import { GraphQLError } from 'graphql';

/**
 * User payload in JWT token
 */
export interface UserPayload {
  id: string;
  email?: string;
  roles: string[];
  permissions: string[];
}

/**
 * Extended GraphQL context with user authentication
 */
export interface AuthContext {
  user: UserPayload | null;
  isAuthenticated: boolean;
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  /**
   * JWT secret key (REQUIRED in production)
   * Default: Uses environment variable JWT_SECRET
   */
  jwtSecret?: string;

  /**
   * JWT expiration time
   * Default: 24 hours
   */
  jwtExpiresIn?: string | number;

  /**
   * Whether to require authentication by default
   * Default: false (allows anonymous access)
   */
  requireAuth?: boolean;

  /**
   * Public operations (no auth required)
   * Default: ['listTargets', 'getTargetInfo']
   */
  publicOperations?: string[];
}

const DEFAULT_JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const DEFAULT_JWT_EXPIRES_IN = '24h';
const DEFAULT_PUBLIC_OPERATIONS = ['listTargets', 'getTargetInfo', '__schema', '__type'];

/**
 * Authentication service for JWT token management
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

    if (this.jwtSecret === 'dev-secret-change-in-production' && process.env.NODE_ENV === 'production') {
      console.error(
        '[AUTH ERROR] Using default JWT secret in production! Set JWT_SECRET environment variable.'
      );
    }
  }

  /**
   * Generate a JWT token for a user
   */
  generateToken(user: UserPayload): string {
    return jwt.sign(user, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): UserPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as UserPayload;
      return decoded;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new GraphQLError('Token expired. Please log in again.', {
          extensions: { code: 'TOKEN_EXPIRED' },
        });
      } else if (error.name === 'JsonWebTokenError') {
        throw new GraphQLError('Invalid token. Please log in again.', {
          extensions: { code: 'INVALID_TOKEN' },
        });
      }
      throw new GraphQLError('Authentication failed.', {
        extensions: { code: 'AUTH_FAILED' },
      });
    }
  }

  /**
   * Extract token from Authorization header
   * Supports: "Bearer <token>" or just "<token>"
   */
  extractToken(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    // Support "Bearer <token>" format
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Support plain token
    return authHeader;
  }

  /**
   * Authenticate a request and return auth context
   */
  authenticate(authHeader: string | undefined): AuthContext {
    const token = this.extractToken(authHeader);

    if (!token) {
      return {
        user: null,
        isAuthenticated: false,
      };
    }

    try {
      const user = this.verifyToken(token);
      return {
        user,
        isAuthenticated: true,
      };
    } catch (error) {
      // Token verification failed
      return {
        user: null,
        isAuthenticated: false,
      };
    }
  }

  /**
   * Check if operation requires authentication
   */
  isPublicOperation(operationName: string | undefined): boolean {
    if (!operationName) {
      return false;
    }
    return this.publicOperations.has(operationName);
  }

  /**
   * Verify user has required role
   */
  hasRole(user: UserPayload | null, role: string): boolean {
    return user?.roles.includes(role) ?? false;
  }

  /**
   * Verify user has required permission
   */
  hasPermission(user: UserPayload | null, permission: string): boolean {
    return user?.permissions.includes(permission) ?? false;
  }

  /**
   * Check if user can perform operation
   */
  canPerformOperation(user: UserPayload | null, operationName: string): boolean {
    // Public operations always allowed
    if (this.isPublicOperation(operationName)) {
      return true;
    }

    // Require authentication if configured
    if (this.requireAuth && !user) {
      return false;
    }

    // Operation-specific permission checks
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

    // Default: allow if authenticated (for requireAuth mode)
    return !this.requireAuth || !!user;
  }
}

/**
 * Global auth service instance
 */
export const authService = new AuthService({
  jwtSecret: process.env.JWT_SECRET,
  requireAuth: process.env.REQUIRE_AUTH === 'true',
  publicOperations: process.env.PUBLIC_OPERATIONS?.split(',') || DEFAULT_PUBLIC_OPERATIONS,
});

/**
 * Permission definitions for role-based access control
 */
export const PERMISSIONS = {
  // Read permissions
  PARSE_READ: 'parse:read',
  VALIDATE_READ: 'validate:read',
  TARGETS_READ: 'targets:read',

  // Write permissions
  COMPILE_WRITE: 'compile:write',
  BATCH_COMPILE_WRITE: 'compile:batch',

  // Admin permissions
  ADMIN_ALL: 'admin:*',
} as const;

/**
 * Role definitions with permissions
 */
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
