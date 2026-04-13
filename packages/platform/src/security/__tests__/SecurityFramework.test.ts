import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  secureHashToken,
  verifyToken,
  generateRandomToken,
  encryptData,
  decryptData,
  RateLimiter,
  Permission,
  ROLES,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  AuditLogger,
  validateInput,
  secureRandom,
  validateSignature,
  generateSignature,
  SceneSchema,
  UserSchema,
  APIRequestSchema,
} from '@holoscript/core';
import { z } from 'zod';

// ============================================================================
// Crypto utilities
// ============================================================================

describe('secureHashToken', () => {
  it('produces hash and salt', () => {
    const { hash, salt } = secureHashToken('my-token', undefined, 1000);
    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(hash.length).toBeGreaterThan(0);
  });

  it('same token + same salt produces same hash', () => {
    const saltBuf = Buffer.from('abcdef1234567890abcdef1234567890', 'hex');
    const r1 = secureHashToken('token', saltBuf, 1000);
    const r2 = secureHashToken('token', saltBuf, 1000);
    expect(r1.hash).toBe(r2.hash);
  });

  it('different tokens produce different hashes', () => {
    const saltBuf = Buffer.from('abcdef1234567890abcdef1234567890', 'hex');
    const r1 = secureHashToken('token-a', saltBuf, 1000);
    const r2 = secureHashToken('token-b', saltBuf, 1000);
    expect(r1.hash).not.toBe(r2.hash);
  });
});

describe('verifyToken', () => {
  it('verifies correct token', () => {
    const { hash, salt } = secureHashToken('secret', undefined, 1000);
    expect(verifyToken('secret', hash, salt, 1000)).toBe(true);
  });

  it('rejects wrong token', () => {
    const { hash, salt } = secureHashToken('secret', undefined, 1000);
    expect(verifyToken('wrong', hash, salt, 1000)).toBe(false);
  });

  it('returns false for corrupt salt', () => {
    expect(verifyToken('a', 'b', 'not-hex!!!', 1000)).toBe(false);
  });
});

describe('generateRandomToken', () => {
  it('default length is 64 hex chars (32 bytes)', () => {
    const t = generateRandomToken();
    expect(t.length).toBe(64);
  });

  it('custom length', () => {
    const t = generateRandomToken(8);
    expect(t.length).toBe(16); // 8 bytes = 16 hex chars
  });

  it('each call is unique', () => {
    expect(generateRandomToken()).not.toBe(generateRandomToken());
  });
});

describe('encrypt/decrypt roundtrip', () => {
  const key = 'my-encryption-key-2024';

  it('roundtrips text', () => {
    const original = 'Hello, encrypted world!';
    const { encrypted, iv, authTag } = encryptData(original, key);
    const decrypted = decryptData(encrypted, key, iv, authTag);
    expect(decrypted).toBe(original);
  });

  it('throws on wrong key', () => {
    const { encrypted, iv, authTag } = encryptData('secret', key);
    expect(() => decryptData(encrypted, 'wrong-key', iv, authTag)).toThrow();
  });

  it('throws on tampered authTag', () => {
    const { encrypted, iv } = encryptData('secret', key);
    expect(() => decryptData(encrypted, key, iv, 'beefbeefbeefbeefbeefbeefbeefbeef')).toThrow();
  });
});

// ============================================================================
// Zod Schemas
// ============================================================================

describe('Zod schemas', () => {
  it('SceneSchema validates correct input', () => {
    const scene = SceneSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'My Scene',
      owner: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(scene.visibility).toBe('private');
  });

  it('SceneSchema rejects invalid input', () => {
    expect(() => SceneSchema.parse({ id: 'not-uuid' })).toThrow();
  });

  it('UserSchema validates correct input', () => {
    const user = UserSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@test.com',
      username: 'alice',
      passwordHash: 'hash',
      passwordSalt: 'salt',
    });
    expect(user.role).toBe('user');
  });

  it('UserSchema rejects invalid email', () => {
    expect(() =>
      UserSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'not-email',
        username: 'alice',
        passwordHash: 'h',
        passwordSalt: 's',
      })
    ).toThrow();
  });

  it('APIRequestSchema validates', () => {
    const req = APIRequestSchema.parse({
      method: 'POST',
      path: '/api/scenes',
      timestamp: Date.now(),
    });
    expect(req.method).toBe('POST');
  });

  it('APIRequestSchema rejects bad method', () => {
    expect(() =>
      APIRequestSchema.parse({
        method: 'INVALID',
        path: '/',
        timestamp: 0,
      })
    ).toThrow();
  });
});

describe('validateInput', () => {
  it('returns parsed value', () => {
    const schema = z.object({ name: z.string() });
    const result = validateInput<{ name: string }>(schema, { name: 'test' });
    expect(result.name).toBe('test');
  });

  it('throws descriptive error', () => {
    const schema = z.object({ age: z.number() });
    expect(() => validateInput(schema, { age: 'not-number' })).toThrow('Validation failed');
  });
});

// ============================================================================
// Rate Limiter
// ============================================================================

describe('RateLimiter', () => {
  it('allows requests within capacity', () => {
    const limiter = new RateLimiter({ capacity: 5, refillRate: 0 });
    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed('test')).toBe(true);
    }
  });

  it('rejects when capacity exceeded', () => {
    const limiter = new RateLimiter({ capacity: 2, refillRate: 0 });
    expect(limiter.isAllowed('test')).toBe(true);
    expect(limiter.isAllowed('test')).toBe(true);
    expect(limiter.isAllowed('test')).toBe(false);
  });

  it('tracks separate keys independently', () => {
    const limiter = new RateLimiter({ capacity: 1, refillRate: 0 });
    expect(limiter.isAllowed('a')).toBe(true);
    expect(limiter.isAllowed('b')).toBe(true);
    expect(limiter.isAllowed('a')).toBe(false);
  });

  it('getRemainingTokens returns capacity for new keys', () => {
    const limiter = new RateLimiter({ capacity: 10 });
    expect(limiter.getRemainingTokens('new')).toBe(10);
  });

  it('reset restores capacity', () => {
    const limiter = new RateLimiter({ capacity: 1, refillRate: 0 });
    limiter.isAllowed('x');
    expect(limiter.isAllowed('x')).toBe(false);
    limiter.reset('x');
    expect(limiter.isAllowed('x')).toBe(true);
  });

  it('clearAll clears all buckets', () => {
    const limiter = new RateLimiter({ capacity: 1, refillRate: 0 });
    limiter.isAllowed('a');
    limiter.isAllowed('b');
    limiter.clearAll();
    expect(limiter.isAllowed('a')).toBe(true);
    expect(limiter.isAllowed('b')).toBe(true);
  });
});

// ============================================================================
// RBAC
// ============================================================================

describe('RBAC', () => {
  it('user has scene permissions', () => {
    expect(hasPermission('user', Permission.CREATE_SCENE)).toBe(true);
    expect(hasPermission('user', Permission.VIEW_SCENE)).toBe(true);
  });

  it('user lacks admin permissions', () => {
    expect(hasPermission('user', Permission.MANAGE_SYSTEM)).toBe(false);
    expect(hasPermission('user', Permission.ADMIN_ALL)).toBe(false);
  });

  it('admin has all permissions', () => {
    expect(hasPermission('admin', Permission.CREATE_SCENE)).toBe(true);
    expect(hasPermission('admin', Permission.MANAGE_SYSTEM)).toBe(true);
    expect(hasPermission('admin', Permission.ADMIN_ALL)).toBe(true);
  });

  it('moderator has VIEW_LOGS but not MANAGE_SYSTEM', () => {
    expect(hasPermission('moderator', Permission.VIEW_LOGS)).toBe(true);
    expect(hasPermission('moderator', Permission.MANAGE_SYSTEM)).toBe(false);
  });

  it('unknown role has no permissions', () => {
    expect(hasPermission('unknown', Permission.VIEW_SCENE)).toBe(false);
  });

  it('hasAllPermissions checks AND', () => {
    expect(hasAllPermissions('user', [Permission.CREATE_SCENE, Permission.EDIT_SCENE])).toBe(true);
    expect(hasAllPermissions('user', [Permission.CREATE_SCENE, Permission.MANAGE_SYSTEM])).toBe(
      false
    );
  });

  it('hasAnyPermission checks OR', () => {
    expect(hasAnyPermission('user', [Permission.CREATE_SCENE, Permission.MANAGE_SYSTEM])).toBe(
      true
    );
    expect(hasAnyPermission('user', [Permission.MANAGE_SYSTEM, Permission.ADMIN_ALL])).toBe(false);
  });
});

// ============================================================================
// AuditLogger
// ============================================================================

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger();
  });

  it('logs entry with id and timestamp', () => {
    const entry = logger.log({
      userId: 'u1',
      action: 'create',
      resource: 'scene',
      resourceId: 's1',
      result: 'success',
    });
    expect(entry.id).toMatch(/^audit_/);
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  it('query filters by userId', () => {
    logger.log({
      userId: 'u1',
      action: 'create',
      resource: 'scene',
      resourceId: 's1',
      result: 'success',
    });
    logger.log({
      userId: 'u2',
      action: 'delete',
      resource: 'scene',
      resourceId: 's2',
      result: 'success',
    });
    expect(logger.query({ userId: 'u1' })).toHaveLength(1);
  });

  it('query filters by action', () => {
    logger.log({
      userId: 'u1',
      action: 'create',
      resource: 'scene',
      resourceId: 's1',
      result: 'success',
    });
    logger.log({
      userId: 'u1',
      action: 'delete',
      resource: 'scene',
      resourceId: 's2',
      result: 'success',
    });
    expect(logger.query({ action: 'delete' })).toHaveLength(1);
  });

  it('getRecent returns last N entries', () => {
    for (let i = 0; i < 10; i++) {
      logger.log({
        userId: 'u1',
        action: `a${i}`,
        resource: 'r',
        resourceId: 'r1',
        result: 'success',
      });
    }
    expect(logger.getRecent(3)).toHaveLength(3);
  });

  it('export produces JSON', () => {
    logger.log({
      userId: 'u1',
      action: 'test',
      resource: 'r',
      resourceId: 'r1',
      result: 'success',
    });
    const json = logger.export();
    expect(JSON.parse(json)).toHaveLength(1);
  });

  it('clear removes all entries', () => {
    logger.log({
      userId: 'u1',
      action: 'test',
      resource: 'r',
      resourceId: 'r1',
      result: 'success',
    });
    logger.clear();
    expect(logger.getRecent()).toHaveLength(0);
  });
});

// ============================================================================
// Security Utilities
// ============================================================================

describe('secureRandom', () => {
  it('returns number in range', () => {
    for (let i = 0; i < 20; i++) {
      const n = secureRandom(0, 100);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
    }
  });
});

describe('Signature utilities', () => {
  const secret = 'my-api-secret';
  const payload = '{"action":"test"}';

  it('generate + validate roundtrip', () => {
    const sig = generateSignature(payload, secret);
    expect(validateSignature(payload, sig, secret)).toBe(true);
  });

  it('rejects wrong secret', () => {
    const sig = generateSignature(payload, secret);
    expect(validateSignature(payload, sig, 'wrong')).toBe(false);
  });

  it('rejects tampered payload', () => {
    const sig = generateSignature(payload, secret);
    expect(validateSignature('tampered', sig, secret)).toBe(false);
  });
});
