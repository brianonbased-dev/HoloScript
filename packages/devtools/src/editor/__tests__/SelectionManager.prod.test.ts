import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager } from '../../editor/SelectionManager';

describe('SelectionManager — Production Tests', () => {
  let sm: SelectionManager;

  beforeEach(() => {
    sm = new SelectionManager();
  });

  describe('initial state', () => {
    it('starts with empty selection', () => {
      expect(sm.selected.size).toBe(0);
      expect(sm.primary).toBeUndefined();
    });
  });

  describe('select()', () => {
    it('selects a single entity', () => {
      sm.select(1);
      expect(sm.selected.size).toBe(1);
      expect(sm.selected.has(1)).toBe(true);
    });

    it('replaces selection by default (non-additive)', () => {
      sm.select(1);
      sm.select(2);
      expect(sm.selected.size).toBe(1);
      expect(sm.selected.has(2)).toBe(true);
      expect(sm.selected.has(1)).toBe(false);
    });

    it('adds to existing selection in additive mode', () => {
      sm.select(1);
      sm.select(2, true);
      expect(sm.selected.size).toBe(2);
      expect(sm.selected.has(1)).toBe(true);
      expect(sm.selected.has(2)).toBe(true);
    });

    it('does not duplicate already selected entity in additive mode', () => {
      sm.select(1);
      sm.select(1, true);
      expect(sm.selected.size).toBe(1);
    });

    it('does not trigger change if same single entity selected again', () => {
      sm.select(5);
      // selecting same entity non-additively should not change (size stays 1, has(5) stays true)
      sm.select(5);
      expect(sm.selected.size).toBe(1);
      expect(sm.selected.has(5)).toBe(true);
    });
  });

  describe('deselect()', () => {
    it('removes a selected entity', () => {
      sm.select(1);
      sm.deselect(1);
      expect(sm.selected.has(1)).toBe(false);
      expect(sm.selected.size).toBe(0);
    });

    it('is a no-op for non-selected entity', () => {
      sm.select(1);
      sm.deselect(99);
      expect(sm.selected.size).toBe(1);
    });
  });

  describe('toggle()', () => {
    it('selects entity when not selected', () => {
      sm.toggle(3);
      expect(sm.selected.has(3)).toBe(true);
    });

    it('deselects entity when already selected', () => {
      sm.select(3);
      sm.toggle(3);
      expect(sm.selected.has(3)).toBe(false);
    });
  });

  describe('clear()', () => {
    it('removes all selected entities', () => {
      sm.select(1);
      sm.select(2, true);
      sm.clear();
      expect(sm.selected.size).toBe(0);
    });

    it('is a no-op on empty selection', () => {
      expect(() => sm.clear()).not.toThrow();
    });
  });

  describe('isSelected()', () => {
    it('returns true for selected entity', () => {
      sm.select(10);
      expect(sm.isSelected(10)).toBe(true);
    });

    it('returns false for non-selected entity', () => {
      expect(sm.isSelected(10)).toBe(false);
    });
  });

  describe('primary', () => {
    it('returns last inserted entity as primary', () => {
      sm.select(1);
      sm.select(2, true);
      sm.select(3, true);
      expect(sm.primary).toBe(3);
    });

    it('returns single entity as primary', () => {
      sm.select(7);
      expect(sm.primary).toBe(7);
    });

    it('returns undefined when empty', () => {
      expect(sm.primary).toBeUndefined();
    });

    it('updates primary after clear()', () => {
      sm.select(5);
      sm.clear();
      expect(sm.primary).toBeUndefined();
    });

    it('updates primary after deselect()', () => {
      sm.select(1, false);
      sm.deselect(1);
      expect(sm.primary).toBeUndefined();
    });
  });

  describe('selected (ReadonlySet)', () => {
    it('selected is a ReadonlySet matching internal state', () => {
      sm.select(10);
      sm.select(20, true);
      expect([...sm.selected]).toEqual(expect.arrayContaining([10, 20]));
    });
  });
});
