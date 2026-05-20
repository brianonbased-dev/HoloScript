/**
 * Receipt Capability Registry tests
 *
 * Validates the receipt capability router: query, lookup, listing, subject enumeration.
 *
 * Created: task_1779157196014_yx3r
 */

import { describe, it, expect } from 'vitest';
import {
  RECEIPT_CAPABILITY_REGISTRY,
  queryReceiptCapabilities,
  getReceiptCapability,
  listReceiptCapabilities,
  listReceiptSubjects,
  receiptCapabilityCount,
  type ReceiptCapabilityEntry,
} from '../receipt-capability-registry';

describe('Receipt Capability Registry', () => {
  describe('RECEIPT_CAPABILITY_REGISTRY', () => {
    it('has at least 20 capability entries (one per receipt module)', () => {
      expect(RECEIPT_CAPABILITY_REGISTRY.length).toBeGreaterThanOrEqual(20);
    });

    it('every entry has required fields', () => {
      for (const entry of RECEIPT_CAPABILITY_REGISTRY) {
        expect(entry.capability).toBeTruthy();
        expect(entry.description).toBeTruthy();
        expect(entry.receiptType).toBeTruthy();
        expect(entry.module).toBeTruthy();
        expect(entry.exportName).toBeTruthy();
        expect(entry.validateFn).toBeTruthy();
        expect(typeof entry.capability).toBe('string');
        expect(typeof entry.description).toBe('string');
        expect(typeof entry.receiptType).toBe('string');
        expect(typeof entry.module).toBe('string');
        expect(typeof entry.exportName).toBe('string');
        expect(typeof entry.validateFn).toBe('string');
      }
    });

    it('capabilities are unique', () => {
      const caps = RECEIPT_CAPABILITY_REGISTRY.map((e) => e.capability);
      expect(new Set(caps).size).toBe(caps.length);
    });
  });

  describe('queryReceiptCapabilities', () => {
    it('returns all entries when called without arguments', () => {
      const results = queryReceiptCapabilities();
      expect(results.length).toBe(RECEIPT_CAPABILITY_REGISTRY.length);
    });

    it('finds entries by exact capability name', () => {
      const results = queryReceiptCapabilities('hardware');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].capability).toBe('hardware');
    });

    it('finds entries by partial capability match', () => {
      const results = queryReceiptCapabilities('device');
      expect(results.length).toBeGreaterThanOrEqual(1);
      // Should match 'device-safety' which contains 'device'
      expect(results.some((r) => r.capability === 'device-safety')).toBe(true);
    });

    it('finds entries by tag match', () => {
      const results = queryReceiptCapabilities('holoshell');
      expect(results.length).toBeGreaterThanOrEqual(5);
      // All should be tagged with 'holoshell'
      for (const entry of results) {
        expect((entry.tags ?? []).some((t) => t.includes('holoshell'))).toBe(true);
      }
    });

    it('finds entries by description match', () => {
      const results = queryReceiptCapabilities('browser automation');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.capability === 'browser')).toBe(true);
    });

    it('returns empty array for non-matching query', () => {
      const results = queryReceiptCapabilities('xyznonexistent');
      expect(results).toEqual([]);
    });

    it('filters by subject', () => {
      const results = queryReceiptCapabilities(undefined, 'nir');
      expect(results.length).toBeGreaterThanOrEqual(1);
      // Qualcomm NIR is under 'hardware' and 'qualcomm-nir'
      expect(results.some((r) => r.capability === 'hardware')).toBe(true);
      expect(results.some((r) => r.capability === 'qualcomm-nir')).toBe(true);
    });

    it('combines capability and subject filters', () => {
      const results = queryReceiptCapabilities('device', 'consent');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].capability).toBe('device-safety');
    });

    it('finds physical actuation by safe-stop subject', () => {
      const results = queryReceiptCapabilities('physical', 'safe-stop');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].capability).toBe('physical-actuation');
    });
  });

  describe('getReceiptCapability', () => {
    it('returns entry by exact capability name', () => {
      const entry = getReceiptCapability('browser');
      expect(entry).toBeDefined();
      expect(entry!.capability).toBe('browser');
      expect(entry!.receiptType).toBe('BrowserAbsorptionReceipt');
    });

    it('returns undefined for unknown capability', () => {
      const entry = getReceiptCapability('nonexistent');
      expect(entry).toBeUndefined();
    });
  });

  describe('listReceiptCapabilities', () => {
    it('returns all capability keywords', () => {
      const caps = listReceiptCapabilities();
      expect(caps.length).toBe(RECEIPT_CAPABILITY_REGISTRY.length);
      expect(caps).toContain('hardware');
      expect(caps).toContain('browser');
      expect(caps).toContain('device-safety');
      expect(caps).toContain('physical-actuation');
    });
  });

  describe('listReceiptSubjects', () => {
    it('returns deduplicated sorted subjects', () => {
      const subjects = listReceiptSubjects();
      expect(subjects.length).toBeGreaterThan(0);
      // Verify sorted
      for (let i = 1; i < subjects.length; i++) {
        expect(subjects[i].localeCompare(subjects[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('includes expected subjects', () => {
      const subjects = listReceiptSubjects();
      expect(subjects).toContain('gpu');
      expect(subjects).toContain('consent');
      expect(subjects).toContain('safe-stop');
    });
  });

  describe('receiptCapabilityCount', () => {
    it('matches registry length', () => {
      expect(receiptCapabilityCount()).toBe(RECEIPT_CAPABILITY_REGISTRY.length);
    });
  });
});
