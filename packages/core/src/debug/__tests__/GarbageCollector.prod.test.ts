/**
 * GarbageCollector Production Tests
 *
 * Mark-sweep, generational, finalization, defragmentation, promotion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GarbageCollector } from '../GarbageCollector';

describe('GarbageCollector — Production', () => {
  let gc: GarbageCollector;

  beforeEach(() => {
    gc = new GarbageCollector();
  });

  describe('allocate', () => {
    it('creates object with ID', () => {
      const id = gc.allocate(256);
      expect(gc.getObject(id)).toBeDefined();
      expect(gc.getObjectCount()).toBe(1);
    });
  });

  describe('mark-sweep', () => {
    it('collects unreachable objects', () => {
      gc.allocate(100); // unreachable — no root
      const rootId = gc.allocate(200);
      gc.addRoot(rootId);
      const stats = gc.collectFull();
      expect(stats.collected).toBe(1);
      expect(stats.survived).toBe(1);
    });

    it('preserves referenced chains', () => {
      const a = gc.allocate(100);
      const b = gc.allocate(200);
      gc.addRoot(a);
      gc.addReference(a, b);
      const stats = gc.collectFull();
      expect(stats.collected).toBe(0);
      expect(gc.getObjectCount()).toBe(2);
    });
  });

  describe('generational', () => {
    it('collectYoung only sweeps young', () => {
      gc.allocate(100, 'young');
      const oldId = gc.allocate(200, 'old');
      gc.addRoot(oldId);
      const stats = gc.collectYoung();
      expect(stats.collected).toBe(1);
      expect(gc.getObject(oldId)).toBeDefined();
    });

    it('promotes young → old after threshold', () => {
      const id = gc.allocate(100, 'young');
      gc.addRoot(id);
      gc.collectYoung(); // age 1
      gc.collectYoung(); // age 2
      gc.collectYoung(); // age 3 → promoted
      expect(gc.getObject(id)!.generation).toBe('old');
    });

    it('permanent never collected', () => {
      gc.allocate(100, 'permanent');
      const stats = gc.collectFull();
      expect(stats.collected).toBe(0);
    });
  });

  describe('finalization', () => {
    it('calls onFinalize when collected', () => {
      const finalizer = vi.fn();
      gc.allocate(100, 'young', finalizer);
      gc.collectYoung();
      expect(finalizer).toHaveBeenCalled();
    });
  });

  describe('defragment', () => {
    it('compacts and returns stats', () => {
      gc.allocate(100);
      gc.allocate(200);
      const result = gc.defragment();
      expect(result.movedCount).toBe(2);
      expect(result.bytesMoved).toBe(300);
    });
  });

  describe('queries', () => {
    it('getTotalSize', () => {
      gc.allocate(100);
      gc.allocate(200);
      expect(gc.getTotalSize()).toBe(300);
    });

    it('getGenerationCount', () => {
      gc.allocate(100, 'young');
      gc.allocate(200, 'old');
      gc.allocate(300, 'young');
      expect(gc.getGenerationCount('young')).toBe(2);
      expect(gc.getGenerationCount('old')).toBe(1);
    });

    it('getRootCount', () => {
      const id = gc.allocate(100);
      gc.addRoot(id);
      expect(gc.getRootCount()).toBe(1);
    });
  });
});
