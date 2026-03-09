/**
 * Security Framework Tests
 *
 * Tests for cryptographic utilities, validation, rate limiting, and RBAC
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
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
  SceneSchema,
  UserSchema,
  Permission,
} from './SecurityFramework';

describe('SecurityFramework', () => {
  describe('Cryptographic Utilities', () => {
    it('should hash and verify tokens securely', () => {
      const token = 'my-secret-token-123';
      const { hash, salt } = secureHashToken(token);

      expect(hash).toBeDefined();
      expect(salt).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
      expect(salt.length).toBeGreaterThan(0);
    });

    it('should verify correct token', () => {
      const token = 'test-token';
      const { hash, salt } = secureHashToken(token);

      const isValid = verifyToken(token, hash, salt);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect token', () => {
      const token = 'test-token';
      const { hash, salt } = secureHashToken(token);

      const isValid = verifyToken('wrong-token', hash, salt);
      expect(isValid).toBe(false);
    });

    it('should generate random tokens', () => {
      const token1 = generateRandomToken(32);
      const token2 = generateRandomToken(32);

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2); // Should be different
      expect(token1.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should encrypt and decrypt data', () => {
      const plaintext = 'sensitive data here';
      const encryptionKey = 'my-encryption-key';

      const { encrypted, iv, authTag } = encryptData(plaintext, encryptionKey);

      expect(encrypted).toBeDefined();
      expect(iv).toBeDefined();
      expect(authTag).toBeDefined();

      // Decrypt
      const decrypted = decryptData(encrypted, encryptionKey, iv, authTag);
      expect(decrypted).toBe(plaintext);
    });

    it('should fail decryption with wrong key', () => {
      const plaintext = 'sensitive data';
      const encryptionKey = 'my-key';
      const { encrypted, iv, authTag } = encryptData(plaintext, encryptionKey);

      expect(() => {
        decryptData(encrypted, 'wrong-key', iv, authTag);
      }).toThrow();
    });
  });

  describe('Rate Limiting', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
      limiter = new RateLimiter({
        capacity: 10,
        refillRate: 2, // 2 tokens per second
      });
    });

    it('should allow requests within limit', () => {
      expect(limiter.isAllowed('user-1')).toBe(true);
      expect(limiter.isAllowed('user-1')).toBe(true);
      expect(limiter.isAllowed('user-1')).toBe(true);
    });

    it('should reject requests exceeding limit', () => {
      // Consume all 10 tokens
      for (let i = 0; i < 10; i++) {
        expect(limiter.isAllowed('user-1')).toBe(true);
      }

      // Next request should fail
      expect(limiter.isAllowed('user-1')).toBe(false);
    });

    it('should track separate limits per key', () => {
      limiter.isAllowed('user-1');
      limiter.isAllowed('user-1');

      // user-2 should have fresh limit
      expect(limiter.isAllowed('user-2')).toBe(true);
      expect(limiter.isAllowed('user-2')).toBe(true);
    });

    it('should get remaining tokens', () => {
      limiter.isAllowed('user-1');
      limiter.isAllowed('user-1');
      limiter.isAllowed('user-1');

      const remaining = limiter.getRemainingTokens('user-1');
      expect(remaining).toBe(7); // 10 - 3
    });

    it('should reset bucket for key', () => {
      limiter.isAllowed('user-1');
      limiter.isAllowed('user-1');

      limiter.reset('user-1');

      // Should have full capacity again
      const remaining = limiter.getRemainingTokens('user-1');
      expect(remaining).toBe(10);
    });

    it('should clear all buckets', () => {
      limiter.isAllowed('user-1');
      limiter.isAllowed('user-2');

      limiter.clearAll();

      // Both should have full capacity
      expect(limiter.getRemainingTokens('user-1')).toBe(10);
      expect(limiter.getRemainingTokens('user-2')).toBe(10);
    });
  });

  describe('RBAC - Role-Based Access Control', () => {
    it('should check user permissions', () => {
      expect(hasPermission('user', Permission.CREATE_SCENE)).toBe(true);
      expect(hasPermission('user', Permission.MANAGE_SYSTEM)).toBe(false);
    });

    it('should check moderator permissions', () => {
      expect(hasPermission('moderator', Permission.CREATE_SCENE)).toBe(true);
      expect(hasPermission('moderator', Permission.VIEW_LOGS)).toBe(true);
      expect(hasPermission('moderator', Permission.MANAGE_SYSTEM)).toBe(false);
    });

    it('should grant all permissions to admin', () => {
      expect(hasPermission('admin', Permission.CREATE_SCENE)).toBe(true);
      expect(hasPermission('admin', Permission.MANAGE_SYSTEM)).toBe(true);
      expect(hasPermission('admin', Permission.VIEW_LOGS)).toBe(true);
    });

    it('should check all permissions (AND logic)', () => {
      const permissions = [Permission.CREATE_SCENE, Permission.EDIT_SCENE];

      expect(hasAllPermissions('user', permissions)).toBe(true);
      expect(hasAllPermissions('user', [Permission.CREATE_SCENE, Permission.MANAGE_SYSTEM])).toBe(
        false
      );
    });

    it('should check any permission (OR logic)', () => {
      const permissions = [Permission.MANAGE_SYSTEM, Permission.CREATE_SCENE];

      expect(hasAnyPermission('user', permissions)).toBe(true);
      expect(
        hasAnyPermission('user', [Permission.MANAGE_SYSTEM, Permission.MANAGE_PERMISSIONS])
      ).toBe(false);
    });
  });

  describe('Audit Logging', () => {
    let logger: AuditLogger;

    beforeEach(() => {
      logger = new AuditLogger();
    });

    it('should log audit entries', () => {
      const entry = logger.log({
        userId: 'user-123',
        action: 'DELETE_SCENE',
        resource: 'scene',
        resourceId: 'scene-456',
        result: 'success',
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.userId).toBe('user-123');
    });

    it('should query audit log', () => {
      logger.log({
        userId: 'user-1',
        action: 'CREATE_SCENE',
        resource: 'scene',
        resourceId: 'scene-1',
        result: 'success',
      });

      logger.log({
        userId: 'user-2',
        action: 'DELETE_SCENE',
        resource: 'scene',
        resourceId: 'scene-2',
        result: 'success',
      });

      const results = logger.query({ userId: 'user-1' });
      expect(results.length).toBe(1);
      expect(results[0].userId).toBe('user-1');
    });

    it('should get recent entries', () => {
      for (let i = 0; i < 5; i++) {
        logger.log({
          userId: 'user-1',
          action: 'CREATE_SCENE',
          resource: 'scene',
          resourceId: `scene-${i}`,
          result: 'success',
        });
      }

      const recent = logger.getRecent(3);
      expect(recent.length).toBe(3);
    });

    it('should export to JSON', () => {
      logger.log({
        userId: 'user-1',
        action: 'CREATE_SCENE',
        resource: 'scene',
        resourceId: 'scene-1',
        result: 'success',
      });

      const exported = logger.export();
      expect(typeof exported).toBe('string');
      expect(exported).toContain('user-1');
    });

    it('should clear all entries', () => {
      logger.log({
        userId: 'user-1',
        action: 'CREATE_SCENE',
        resource: 'scene',
        resourceId: 'scene-1',
        result: 'success',
      });

      logger.clear();

      const recent = logger.getRecent();
      expect(recent.length).toBe(0);
    });
  });

  describe('Input Validation', () => {
    it('should validate scene schema', () => {
      const validScene = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Scene',
        owner: '550e8400-e29b-41d4-a716-446655440001',
      };

      const result = validateInput(SceneSchema, validScene);
      expect(result.name).toBe('Test Scene');
    });

    it('should reject invalid scene', () => {
      const invalidScene = {
        id: 'not-a-uuid',
        name: 'Test',
        owner: '550e8400-e29b-41d4-a716-446655440001',
      };

      expect(() => {
        validateInput(SceneSchema, invalidScene);
      }).toThrow();
    });

    it('should validate user schema', () => {
      const validUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@example.com',
        username: 'testuser',
        passwordHash: 'hash123',
        passwordSalt: 'salt123',
      };

      const result = validateInput(UserSchema, validUser);
      expect(result.email).toBe('user@example.com');
    });

    it('should reject invalid email', () => {
      const invalidUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'not-an-email',
        username: 'testuser',
        passwordHash: 'hash123',
        passwordSalt: 'salt123',
      };

      expect(() => {
        validateInput(UserSchema, invalidUser);
      }).toThrow();
    });
  });

  describe('Global Audit Logger', () => {
    it('should have global instance', () => {
      expect(auditLogger).toBeDefined();
    });

    it('should log to global instance', () => {
      auditLogger.log({
        userId: 'test-user',
        action: 'TEST_ACTION',
        resource: 'test',
        resourceId: 'test-id',
        result: 'success',
      });

      const recent = auditLogger.getRecent(1);
      expect(recent[0].action).toBe('TEST_ACTION');

      // Cleanup
      auditLogger.clear();
    });
  });
});
