/**
 * UndoManager Production Tests
 *
 * Undo/redo stacks: push, undo/redo, clear, temporal pruning, stack depth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UndoManager } from '../UndoManager';

describe('UndoManager — Production', () => {
  let mgr: UndoManager<string>;

  beforeEach(() => {
    mgr = new UndoManager<string>();
  });

  describe('push', () => {
    it('adds to undo stack', () => {
      mgr.push('undo-A', 'redo-A');
      expect(mgr.getStackDepth()).toBe(1);
    });

    it('clears redo stack on push', () => {
      mgr.push('u1', 'r1');
      mgr.undo();
      mgr.push('u2', 'r2');
      expect(mgr.redo()).toBeNull(); // redo cleared
    });
  });

  describe('undo / redo', () => {
    it('undo returns last step', () => {
      mgr.push('u1', 'r1');
      const step = mgr.undo();
      expect(step?.undo).toBe('u1');
      expect(step?.redo).toBe('r1');
    });

    it('redo returns undone step', () => {
      mgr.push('u1', 'r1');
      mgr.undo();
      const step = mgr.redo();
      expect(step?.redo).toBe('r1');
    });

    it('undo returns null when empty', () => {
      expect(mgr.undo()).toBeNull();
    });

    it('redo returns null when empty', () => {
      expect(mgr.redo()).toBeNull();
    });

    it('multiple undo/redo', () => {
      mgr.push('u1', 'r1');
      mgr.push('u2', 'r2');
      expect(mgr.undo()?.undo).toBe('u2');
      expect(mgr.undo()?.undo).toBe('u1');
      expect(mgr.redo()?.redo).toBe('r1');
    });
  });

  describe('clear', () => {
    it('empties both stacks', () => {
      mgr.push('u1', 'r1');
      mgr.undo();
      mgr.clear();
      expect(mgr.getStackDepth()).toBe(0);
      expect(mgr.undo()).toBeNull();
      expect(mgr.redo()).toBeNull();
    });
  });

  describe('temporal pruning', () => {
    it('prunes steps older than 5 seconds', () => {
      // Mock Date.now to control time
      const originalNow = Date.now;
      let mockTime = 10000;
      vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

      mgr.push('u1', 'r1'); // at 10000
      mockTime = 11000;
      mgr.push('u2', 'r2'); // at 11000
      mockTime = 16000; // 6s later — u1 should be pruned
      mgr.push('u3', 'r3'); // triggers prune

      expect(mgr.getStackDepth()).toBe(2); // u1 pruned, u2 + u3 remain

      vi.spyOn(Date, 'now').mockRestore();
    });
  });
});
