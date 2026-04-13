/**
 * TenantContext Production Tests
 *
 * createContext, validateAccess, withTenantContext, getCurrentContext, requireContext.
 */

import { describe, it, expect } from 'vitest';
import {
  createContext,
  validateAccess,
  withTenantContext,
  getCurrentContext,
  requireContext,
} from '@holoscript/core';

describe('TenantContext — Production', () => {
  describe('createContext', () => {
    it('creates with tenantId', () => {
      const ctx = createContext('tenant-1');
      expect(ctx.tenantId).toBe('tenant-1');
      expect(ctx.permissions).toEqual(['read']);
    });

    it('trims tenantId', () => {
      const ctx = createContext('  tenant-2  ');
      expect(ctx.tenantId).toBe('tenant-2');
    });

    it('throws on empty tenantId', () => {
      expect(() => createContext('')).toThrow('tenantId is required');
      expect(() => createContext('   ')).toThrow('tenantId is required');
    });

    it('includes userId and permissions', () => {
      const ctx = createContext('t1', 'user1', ['read', 'write']);
      expect(ctx.userId).toBe('user1');
      expect(ctx.permissions).toEqual(['read', 'write']);
    });

    it('generates unique session ids', () => {
      const a = createContext('t1');
      const b = createContext('t1');
      expect(a.sessionId).not.toBe(b.sessionId);
    });
  });

  describe('validateAccess', () => {
    it('grants same-tenant read', () => {
      const ctx = createContext('t1', 'u1', ['read']);
      const resource = { tenantId: 't1', type: 'file', name: 'doc.txt' };
      expect(validateAccess(ctx, resource, 'read')).toBe(true);
    });

    it('denies cross-tenant access', () => {
      const ctx = createContext('t1', 'u1', ['read', 'write', 'admin']);
      const resource = { tenantId: 't2', type: 'file', name: 'doc.txt' };
      expect(validateAccess(ctx, resource, 'read')).toBe(false);
    });

    it('denies missing permission', () => {
      const ctx = createContext('t1', 'u1', ['read']);
      const resource = { tenantId: 't1', type: 'file', name: 'doc.txt' };
      expect(validateAccess(ctx, resource, 'write')).toBe(false);
    });

    it('admin grants all', () => {
      const ctx = createContext('t1', 'u1', ['admin']);
      const resource = { tenantId: 't1', type: 'file', name: 'doc.txt' };
      expect(validateAccess(ctx, resource, 'write')).toBe(true);
      expect(validateAccess(ctx, resource, 'delete')).toBe(true);
    });
  });

  describe('withTenantContext / getCurrentContext / requireContext', () => {
    it('provides context during execution', () => {
      const ctx = createContext('t1', 'u1');
      const result = withTenantContext(ctx, () => {
        const current = getCurrentContext();
        return current?.tenantId;
      });
      expect(result).toBe('t1');
    });

    it('getCurrentContext returns undefined outside scope', () => {
      expect(getCurrentContext()).toBeUndefined();
    });

    it('requireContext throws outside scope', () => {
      expect(() => requireContext()).toThrow('No tenant context is active');
    });

    it('requireContext returns context inside scope', () => {
      const ctx = createContext('t1');
      withTenantContext(ctx, () => {
        const got = requireContext();
        expect(got.tenantId).toBe('t1');
      });
    });
  });
});
