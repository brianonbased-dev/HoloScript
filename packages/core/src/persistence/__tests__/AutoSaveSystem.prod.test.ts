/**
 * AutoSaveSystem Production Tests
 *
 * Save/load, checkAutoSave, slot management, quota, eviction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoSaveSystem } from '../AutoSaveSystem';

describe('AutoSaveSystem — Production', () => {
  let sys: AutoSaveSystem;

  beforeEach(() => {
    sys = new AutoSaveSystem(3, 1000, 100000);
  });

  describe('save / load', () => {
    it('saves and loads', () => {
      expect(sys.save('s1', 'Manual', { hp: 100 })).toBe(true);
      expect(sys.load('s1')).toEqual({ hp: 100 });
    });

    it('returns null for missing', () => {
      expect(sys.load('nope')).toBeNull();
    });

    it('calls onSave callback', () => {
      const cb = vi.fn();
      sys.onSave(cb);
      sys.save('s1', 'Test', { a: 1 });
      expect(cb).toHaveBeenCalledOnce();
    });
  });

  describe('quota enforcement', () => {
    it('rejects save exceeding quota', () => {
      const bigData: Record<string, unknown> = { data: 'x'.repeat(20000) };
      expect(sys.save('s1', 'Big', bigData)).toBe(true);
      expect(sys.save('s2', 'Big2', bigData)).toBe(true);
      expect(sys.save('s3', 'Big3', bigData)).toBe(false);
    });

    it('tracks usedBytes', () => {
      sys.save('s1', 'A', { x: 1 });
      expect(sys.getUsedBytes()).toBeGreaterThan(0);
    });
  });

  describe('max slots / eviction', () => {
    it('evicts oldest autosave when max reached', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      sys.save('auto1', 'Auto1', { a: 1 }, true);
      vi.spyOn(Date, 'now').mockReturnValue(2000);
      sys.save('auto2', 'Auto2', { b: 2 }, true);
      vi.spyOn(Date, 'now').mockReturnValue(3000);
      sys.save('auto3', 'Auto3', { c: 3 }, true);
      vi.spyOn(Date, 'now').mockReturnValue(4000);
      // This triggers eviction of auto1 (oldest)
      sys.save('auto4', 'Auto4', { d: 4 }, true);
      expect(sys.load('auto1')).toBeNull();
      expect(sys.getSlotCount()).toBe(3);
      vi.restoreAllMocks();
    });
  });

  describe('checkAutoSave', () => {
    it('auto saves when interval elapsed', () => {
      const getData = () => ({ level: 1 });
      const result = sys.checkAutoSave(2000, getData);
      expect(result).toBe(true);
      expect(sys.getSlotCount()).toBe(1);
    });

    it('skips if interval not elapsed', () => {
      sys.checkAutoSave(1000, () => ({ a: 1 }));
      const result = sys.checkAutoSave(1500, () => ({ a: 1 }));
      expect(result).toBe(false);
    });

    it('skips if disabled', () => {
      sys.setEnabled(false);
      expect(sys.checkAutoSave(2000, () => ({ a: 1 }))).toBe(false);
    });
  });

  describe('deleteSlot', () => {
    it('deletes and frees bytes', () => {
      sys.save('s1', 'Test', { hp: 100 });
      const before = sys.getUsedBytes();
      sys.deleteSlot('s1');
      expect(sys.getUsedBytes()).toBeLessThan(before);
    });
  });

  describe('getSlots', () => {
    it('returns sorted by timestamp desc', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      sys.save('s1', 'First', { a: 1 });
      vi.spyOn(Date, 'now').mockReturnValue(2000);
      sys.save('s2', 'Second', { b: 2 });
      const slots = sys.getSlots();
      expect(slots[0].label).toBe('Second');
      vi.restoreAllMocks();
    });
  });

  describe('getQuota', () => {
    it('returns configured quota', () => {
      expect(sys.getQuota()).toBe(100000);
    });
  });
});
