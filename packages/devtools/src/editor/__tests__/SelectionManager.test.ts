import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ReactiveState to avoid actual reactive system dependency
vi.mock('../../state/ReactiveState', () => ({
  track: vi.fn(),
  trigger: vi.fn(),
}));

import { SelectionManager } from '../SelectionManager';

describe('SelectionManager', () => {
  let sm: SelectionManager;

  beforeEach(() => {
    sm = new SelectionManager();
  });

  it('starts with empty selection', () => {
    expect(sm.selected.size).toBe(0);
  });

  it('select adds entity', () => {
    sm.select(1);
    expect(sm.selected.has(1)).toBe(true);
    expect(sm.selected.size).toBe(1);
  });

  it('select replaces by default', () => {
    sm.select(1);
    sm.select(2); // replace
    expect(sm.selected.has(1)).toBe(false);
    expect(sm.selected.has(2)).toBe(true);
    expect(sm.selected.size).toBe(1);
  });

  it('select additive keeps existing', () => {
    sm.select(1);
    sm.select(2, true);
    expect(sm.selected.size).toBe(2);
    expect(sm.selected.has(1)).toBe(true);
    expect(sm.selected.has(2)).toBe(true);
  });

  it('select same entity is idempotent', () => {
    sm.select(5);
    sm.select(5); // same, replaces but no-op because set matches
    expect(sm.selected.size).toBe(1);
  });

  it('deselect removes entity', () => {
    sm.select(1);
    sm.select(2, true);
    sm.deselect(1);
    expect(sm.selected.has(1)).toBe(false);
    expect(sm.selected.has(2)).toBe(true);
  });

  it('deselect absent entity does nothing', () => {
    sm.select(1);
    sm.deselect(99);
    expect(sm.selected.size).toBe(1);
  });

  it('toggle adds then removes', () => {
    sm.toggle(3);
    expect(sm.selected.has(3)).toBe(true);
    sm.toggle(3);
    expect(sm.selected.has(3)).toBe(false);
  });

  it('clear empties selection', () => {
    sm.select(1);
    sm.select(2, true);
    sm.clear();
    expect(sm.selected.size).toBe(0);
  });

  it('clear on empty is no-op', () => {
    sm.clear(); // should not throw
    expect(sm.selected.size).toBe(0);
  });

  it('isSelected checks membership', () => {
    sm.select(10);
    expect(sm.isSelected(10)).toBe(true);
    expect(sm.isSelected(20)).toBe(false);
  });

  it('primary returns last inserted entity', () => {
    sm.select(1);
    sm.select(2, true);
    sm.select(3, true);
    expect(sm.primary).toBe(3);
  });

  it('primary returns undefined for empty selection', () => {
    expect(sm.primary).toBeUndefined();
  });

  it('primary returns single entity', () => {
    sm.select(42);
    expect(sm.primary).toBe(42);
  });
});
