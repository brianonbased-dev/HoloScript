/**
 * TenantContext Production Tests
 *
 * createContext, validateAccess, withTenantContext, requireContext.
 */

import { describe, it, expect } from 'vitest';
import {
  createContext, validateAccess, withTenantContext,
  getCurrentContext, requireContext,
} from '../TenantContext';

describe('TenantContext — Production', () => {
  describe('createContext', () => {
    it('creates context with defaults', () => {
      const ctx = createContext('tenant-1');
      expect(ctx.tenantId).toBe('tenant-1');
      expect(ctx.permissions).toContain('read');
      expect(ctx.sessionId).toMatch(/^sess_/);
    });

    it('accepts custom permissions', () => {
      const ctx = createContext('t', 'u1', ['read', 'write']);
      expect(ctx.permissions).toEqual(['read', 'write']);
      expect(ctx.userId).toBe('u1');
    });

    it('throws for empty tenantId', () => {
      expect(() => createContext('')).toThrow();
    });
  });

  describe('validateAccess', () => {
    it('allows same-tenant with permission', () => {
      const ctx = createContext('t1', undefined, ['read']);
      expect(validateAccess(ctx, { tenantId: 't1', type: 'file', name: 'a' }, 'read')).toBe(true);
    });

    it('denies cross-tenant access', () => {
      const ctx = createContext('t1', undefined, ['read', 'write', 'admin']);
      expect(validateAccess(ctx, { tenantId: 't2', type: 'file', name: 'a' }, 'read')).toBe(false);
    });

    it('admin grants all access', () => {
      const ctx = createContext('t1', undefined, ['admin']);
      expect(validateAccess(ctx, { tenantId: 't1', type: 'file', name: 'a' }, 'write')).toBe(true);
    });

    it('denies without matching permission', () => {
      const ctx = createContext('t1', undefined, ['read']);
      expect(validateAccess(ctx, { tenantId: 't1', type: 'file', name: 'a' }, 'write')).toBe(false);
    });
  });

  describe('withTenantContext', () => {
    it('makes context available via getCurrentContext', () => {
      const ctx = createContext('t1');
      withTenantContext(ctx, () => {
        expect(getCurrentContext()?.tenantId).toBe('t1');
      });
    });
  });

  describe('requireContext', () => {
    it('throws outside context', () => {
      expect(() => requireContext()).toThrow();
    });

    it('returns context inside scope', () => {
      const ctx = createContext('t1');
      withTenantContext(ctx, () => {
        expect(requireContext().tenantId).toBe('t1');
      });
    });
  });
});
