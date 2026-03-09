/**
 * Tests for Studio wardrobeItems data
 *
 * Validates structural integrity of wardrobe (avatar customization) items.
 */

import { describe, it, expect } from 'vitest';
import { BUILTIN_ITEMS } from './wardrobeItems';

describe('BUILTIN_ITEMS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(BUILTIN_ITEMS)).toBe(true);
    expect(BUILTIN_ITEMS.length).toBeGreaterThan(0);
  });

  it('all items have required fields', () => {
    for (const item of BUILTIN_ITEMS) {
      expect(item.id, `missing id`).toBeTruthy();
      expect(item.name, `${item.id} missing name`).toBeTruthy();
      expect(item.category, `${item.id} missing category`).toBeTruthy();
      expect(item.slot, `${item.id} missing slot`).toBeTruthy();
      expect(item.thumbnail, `${item.id} missing thumbnail`).toBeTruthy();
    }
  });

  it('all item IDs are unique', () => {
    const ids = BUILTIN_ITEMS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers expected slot types', () => {
    const slots = new Set(BUILTIN_ITEMS.map((w) => w.slot));
    expect(slots.has('hair')).toBe(true);
    expect(slots.has('top')).toBe(true);
    expect(slots.has('bottom')).toBe(true);
    expect(slots.has('shoes')).toBe(true);
  });

  it('has at least 15 items', () => {
    expect(BUILTIN_ITEMS.length).toBeGreaterThanOrEqual(15);
  });
});
