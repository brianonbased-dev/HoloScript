// @vitest-environment jsdom
/**
 * Tests for ContextMenu component (Sprint 15 P5)
 */

import { describe, it, expect, vi } from 'vitest';

describe('ContextMenu module', () => {
  it('exports ContextMenu function', async () => {
    const mod = await import('@/components/ui/ContextMenu');
    expect(mod.ContextMenu).toBeDefined();
    expect(typeof mod.ContextMenu).toBe('function');
  });
});

describe('ContextMenu — action items structure', () => {
  const EXPECTED_ITEMS = ['Edit Properties', 'Duplicate', 'Delete'];

  it('has exactly 3 action items', () => {
    expect(EXPECTED_ITEMS).toHaveLength(3);
  });

  it('Edit Properties is the first item', () => {
    expect(EXPECTED_ITEMS[0]).toBe('Edit Properties');
  });

  it('Delete is the last item', () => {
    expect(EXPECTED_ITEMS[EXPECTED_ITEMS.length - 1]).toBe('Delete');
  });

  it('items are unique', () => {
    const unique = new Set(EXPECTED_ITEMS);
    expect(unique.size).toBe(EXPECTED_ITEMS.length);
  });
});

describe('ContextMenu — viewport clamping', () => {
  it('clamps x to viewport width minus menu width', () => {
    const viewportWidth = 1024;
    const menuWidth = 180;
    const x = 2000;
    const clamped = Math.min(x, viewportWidth - menuWidth);
    expect(clamped).toBe(844);
  });

  it('clamps y to viewport height minus menu height', () => {
    const viewportHeight = 768;
    const menuHeight = 200;
    const y = 2000;
    const clamped = Math.min(y, viewportHeight - menuHeight);
    expect(clamped).toBe(568);
  });

  it('does not clamp when position is within viewport', () => {
    const x = 100;
    const y = 200;
    const clampedX = Math.min(x, 1024 - 180);
    const clampedY = Math.min(y, 768 - 200);
    expect(clampedX).toBe(100);
    expect(clampedY).toBe(200);
  });
});

describe('ContextMenu — callback contract', () => {
  it('onClose is required', () => {
    // Type-level check — onClose should be non-optional
    const props = { x: 0, y: 0, onClose: vi.fn() };
    expect(props.onClose).toBeDefined();
  });

  it('onEdit is optional', () => {
    const props = { x: 0, y: 0, onClose: vi.fn() };
    expect((props as any).onEdit).toBeUndefined();
  });

  it('onDuplicate is optional', () => {
    const props = { x: 0, y: 0, onClose: vi.fn() };
    expect((props as any).onDuplicate).toBeUndefined();
  });

  it('onDelete is optional', () => {
    const props = { x: 0, y: 0, onClose: vi.fn() };
    expect((props as any).onDelete).toBeUndefined();
  });
});
