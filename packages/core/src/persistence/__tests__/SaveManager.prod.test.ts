/**
 * SaveManager Production Tests
 *
 * Save/load, checksums, corruption detection, autosave, slot management,
 * export/import, listeners, playtime.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaveManager } from '../SaveManager';

describe('SaveManager — Production', () => {
  let mgr: SaveManager;

  beforeEach(() => {
    mgr = new SaveManager({ maxSlots: 3 });
  });

  describe('save / load', () => {
    it('saves and loads data', () => {
      mgr.save('slot1', 'Save 1', { score: 100, level: 5 });
      const data = mgr.load('slot1');
      expect(data?.score).toBe(100);
      expect(data?.level).toBe(5);
    });

    it('deep copies data on save', () => {
      const original = { x: 1 };
      mgr.save('s', 'S', original);
      original.x = 999;
      expect(mgr.load('s')?.x).toBe(1);
    });

    it('returns null for missing slot', () => {
      expect(mgr.load('nope')).toBeNull();
    });
  });

  describe('checksum / corruption', () => {
    it('detects uncorrupted slot', () => {
      mgr.save('s1', 'S1', { hp: 100 });
      expect(mgr.isCorrupted('s1')).toBe(false);
    });

    it('returns true for missing slot', () => {
      expect(mgr.isCorrupted('missing')).toBe(true);
    });
  });

  describe('slot management', () => {
    it('getAllSlots returns sorted by timestamp desc', () => {
      let mockTime = 1000;
      vi.spyOn(Date, 'now').mockImplementation(() => mockTime);
      mgr.save('a', 'A', { v: 1 });
      mockTime = 2000;
      mgr.save('b', 'B', { v: 2 });
      const slots = mgr.getAllSlots();
      expect(slots[0].id).toBe('b');
      vi.restoreAllMocks();
    });

    it('deleteSlot removes slot', () => {
      mgr.save('s1', 'S1', { v: 1 });
      expect(mgr.deleteSlot('s1')).toBe(true);
      expect(mgr.getSlotCount()).toBe(0);
    });

    it('evicts oldest when maxSlots reached', () => {
      mgr.save('s1', 'S1', { v: 1 });
      mgr.save('s2', 'S2', { v: 2 });
      mgr.save('s3', 'S3', { v: 3 });
      mgr.save('s4', 'S4', { v: 4 }); // s1 should be evicted
      expect(mgr.getSlotCount()).toBe(3);
      expect(mgr.getSlot('s1')).toBeUndefined();
    });
  });

  describe('autosave', () => {
    it('triggers autosave on update interval', () => {
      const mgr2 = new SaveManager({ autosaveInterval: 10 });
      mgr2.setCurrentData({ progress: 50 });
      mgr2.update(11); // exceeds interval
      expect(mgr2.getSlot('autosave')).toBeDefined();
    });
  });

  describe('export / import', () => {
    it('exports and imports all slots', () => {
      mgr.save('s1', 'S1', { v: 1 });
      mgr.save('s2', 'S2', { v: 2 });
      const json = mgr.exportAll();
      const mgr2 = new SaveManager();
      expect(mgr2.importAll(json)).toBe(2);
    });
  });

  describe('listeners', () => {
    it('onSave fires', () => {
      const cb = vi.fn();
      mgr.onSave(cb);
      mgr.save('s1', 'S1', { v: 1 });
      expect(cb).toHaveBeenCalled();
    });

    it('onLoad fires', () => {
      const cb = vi.fn();
      mgr.onLoad(cb);
      mgr.save('s1', 'S1', { v: 1 });
      mgr.load('s1');
      expect(cb).toHaveBeenCalled();
    });
  });

  describe('playtime', () => {
    it('tracks cumulative playtime', () => {
      mgr.update(10);
      mgr.update(5);
      expect(mgr.getPlaytime()).toBe(15);
    });
  });
});
