/**
 * Tests for @holoscript/auth shared authentication library
 *
 * Covers:
 * - Token generation and verification
 * - Token extraction from headers
 * - Authentication flow
 * - Role-based access control (RBAC)
 * - Permission checks
 * - Operation authorization
 * - Public operation detection
 * - AuthError structured errors
 */

import { describe, it, expect } from 'vitest';
import {
  AuthService,
  AuthError,
  PERMISSIONS,
  ROLES,
  type UserPayload,
} from './index.js';

describe('AuthService', () => {
  const service = new AuthService({
    jwtSecret: 'test-secret-key-for-testing-only',
    jwtExpiresIn: '1h',
    requireAuth: false,
    publicOperations: ['listTargets', 'getTargetInfo'],
  });

  const testUser: UserPayload = {
    id: 'user-1',
    email: 'test@holoscript.dev',
    roles: ['user'],
    permissions: ['parse:read', 'compile:write'],
  };

  describe('generateToken', () => {
    it('generates a JWT string', () => {
      const token = service.generateToken(testUser);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('verifyToken', () => {
    it('verifies and decodes valid token', () => {
      const token = service.generateToken(testUser);
      const decoded = service.verifyToken(token);
      expect(decoded.id).toBe('user-1');
      expect(decoded.email).toBe('test@holoscript.dev');
      expect(decoded.roles).toContain('user');
    });

    it('throws AuthError for invalid token', () => {
      expect(() => service.verifyToken('invalid.token.here')).toThrow(AuthError);
    });

    it('throws AuthError with INVALID_TOKEN code', () => {
      try {
        service.verifyToken('invalid.token.here');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).code).toBe('INVALID_TOKEN');
      }
    });

    it('throws for tampered token', () => {
      const token = service.generateToken(testUser);
      const tampered = token.substring(0, token.length - 5) + 'xxxxx';
      expect(() => service.verifyToken(tampered)).toThrow();
    });
  });

  describe('extractToken', () => {
    it('extracts from Bearer header', () => {
      expect(service.extractToken('Bearer my-token-123')).toBe('my-token-123');
    });

    it('extracts plain token', () => {
      expect(service.extractToken('plain-token')).toBe('plain-token');
    });

    it('returns null for undefined', () => {
      expect(service.extractToken(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(service.extractToken('')).toBeNull();
    });
  });

  describe('authenticate', () => {
    it('authenticates valid Bearer token', () => {
      const token = service.generateToken(testUser);
      const ctx = service.authenticate(`Bearer ${token}`);
      expect(ctx.isAuthenticated).toBe(true);
      expect(ctx.user?.id).toBe('user-1');
    });

    it('returns unauthenticated for missing header', () => {
      const ctx = service.authenticate(undefined);
      expect(ctx.isAuthenticated).toBe(false);
      expect(ctx.user).toBeNull();
    });

    it('returns unauthenticated for invalid token', () => {
      const ctx = service.authenticate('Bearer invalid-garbage');
      expect(ctx.isAuthenticated).toBe(false);
      expect(ctx.user).toBeNull();
    });
  });

  describe('isPublicOperation', () => {
    it('identifies public operations', () => {
      expect(service.isPublicOperation('listTargets')).toBe(true);
      expect(service.isPublicOperation('getTargetInfo')).toBe(true);
    });

    it('identifies non-public operations', () => {
      expect(service.isPublicOperation('compile')).toBe(false);
      expect(service.isPublicOperation('batchCompile')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(service.isPublicOperation(undefined)).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('returns true for matching role', () => {
      expect(service.hasRole(testUser, 'user')).toBe(true);
    });

    it('returns false for non-matching role', () => {
      expect(service.hasRole(testUser, 'admin')).toBe(false);
    });

    it('returns false for null user', () => {
      expect(service.hasRole(null, 'user')).toBe(false);
    });
  });

  describe('hasPermission', () => {
    it('returns true for matching permission', () => {
      expect(service.hasPermission(testUser, 'parse:read')).toBe(true);
      expect(service.hasPermission(testUser, 'compile:write')).toBe(true);
    });

    it('returns false for non-matching permission', () => {
      expect(service.hasPermission(testUser, 'admin:*')).toBe(false);
    });

    it('returns false for null user', () => {
      expect(service.hasPermission(null, 'parse:read')).toBe(false);
    });
  });

  describe('canPerformOperation', () => {
    it('allows public operations without auth', () => {
      expect(service.canPerformOperation(null, 'listTargets')).toBe(true);
    });

    it('allows operations with correct permissions', () => {
      expect(service.canPerformOperation(testUser, 'compile')).toBe(true);
    });

    it('allows admin users for any operation', () => {
      const admin: UserPayload = {
        id: 'admin-1',
        roles: ['admin'],
        permissions: ['admin:*'],
      };
      expect(service.canPerformOperation(admin, 'compile')).toBe(true);
    });
  });

  describe('requireAuth mode', () => {
    const strictService = new AuthService({
      jwtSecret: 'strict-secret',
      requireAuth: true,
    });

    it('blocks unauthenticated users on protected operations', () => {
      expect(strictService.canPerformOperation(null, 'compile')).toBe(false);
    });

    it('allows authenticated users', () => {
      expect(strictService.canPerformOperation(testUser, 'unknownOp')).toBe(true);
    });
  });
});

describe('AuthError', () => {
  it('is an instance of Error', () => {
    const err = new AuthError('test', 'TOKEN_EXPIRED');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AuthError);
  });

  it('exposes structured code', () => {
    const err = new AuthError('test', 'INVALID_TOKEN');
    expect(err.code).toBe('INVALID_TOKEN');
    expect(err.message).toBe('test');
    expect(err.name).toBe('AuthError');
  });
});

describe('PERMISSIONS', () => {
  it('defines expected permission constants', () => {
    expect(PERMISSIONS.PARSE_READ).toBe('parse:read');
    expect(PERMISSIONS.COMPILE_WRITE).toBe('compile:write');
    expect(PERMISSIONS.ADMIN_ALL).toBe('admin:*');
  });
});

describe('ROLES', () => {
  it('defines expected role structures', () => {
    expect(ROLES.ANONYMOUS.name).toBe('anonymous');
    expect(ROLES.USER.permissions).toContain('parse:read');
    expect(ROLES.ADMIN.permissions).toContain('admin:*');
    expect(ROLES.POWER_USER.permissions).toContain('compile:batch');
  });
});
