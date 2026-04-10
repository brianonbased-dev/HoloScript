/**
 * UndoManager Unit Tests
 *
 * Tests undo/redo stack, temporal pruning, clear, and depth queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UndoManager } from '../UndoManager';

describe('UndoManager', () => {
  let manager: UndoManager<string>;

  beforeEach(() => {
    manager = new UndoManager<string>();
  });

  describe('push / undo / redo', () => {
    it('should push and undo a step', () => {
      manager.push('undo-op', 'redo-op');
      const step = manager.undo();
      expect(step).not.toBeNull();
      expect(step!.undo).toBe('undo-op');
      expect(step!.redo).toBe('redo-op');
    });

    it('should track stack depth', () => {
      manager.push('u1', 'r1');
      manager.push('u2', 'r2');
      expect(manager.getStackDepth()).toBe(2);
    });

    it('should redo after undo', () => {
      manager.push('u1', 'r1');
      manager.undo();
      const step = manager.redo();
      expect(step).not.toBeNull();
      expect(step!.redo).toBe('r1');
    });

    it('should return null when nothing to undo', () => {
      expect(manager.undo()).toBeNull();
    });

    it('should return null when nothing to redo', () => {
      expect(manager.redo()).toBeNull();
    });

    it('should clear redo stack on new push', () => {
      manager.push('u1', 'r1');
      manager.undo();
      manager.push('u2', 'r2');
      expect(manager.redo()).toBeNull();
    });
  });

  describe('clear', () => {
    it('should empty both stacks', () => {
      manager.push('u1', 'r1');
      manager.push('u2', 'r2');
      manager.clear();
      expect(manager.getStackDepth()).toBe(0);
      expect(manager.undo()).toBeNull();
      expect(manager.redo()).toBeNull();
    });
  });

  describe('temporal pruning', () => {
    it('should prune old steps on push', () => {
      vi.useFakeTimers();
      manager.push('u1', 'r1');
      vi.advanceTimersByTime(6000); // > 5s buffer
      manager.push('u2', 'r2');
      // u1 should be pruned
      expect(manager.getStackDepth()).toBe(1);
      vi.useRealTimers();
    });
  });
});
