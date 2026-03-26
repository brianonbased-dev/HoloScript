// @vitest-environment jsdom
/**
 * Tests for useGlobalHotkeys hook (Sprint 15 P3)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Stable mock fns for undo/redo
const mockUndo = vi.fn();
const mockRedo = vi.fn();

vi.mock('../lib/historyStore', () => ({
  useHistoryStore: {
    temporal: {
      getState: () => ({
        undo: mockUndo,
        redo: mockRedo,
      }),
    },
  },
}));

const { useGlobalHotkeys } = await import('@/hooks/useGlobalHotkeys');

function fireKey(
  key: string,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {},
) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    bubbles: true,
  });
  window.dispatchEvent(event);
}

describe('useGlobalHotkeys', () => {
  let result: ReturnType<typeof renderHook>;

  beforeEach(() => {
    vi.clearAllMocks();
    result = renderHook(() => useGlobalHotkeys());
  });

  afterEach(() => {
    result.unmount();
  });

  it('Ctrl+Z triggers undo', () => {
    fireKey('z', { ctrlKey: true });
    expect(mockUndo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+Z triggers redo', () => {
    fireKey('Z', { ctrlKey: true, shiftKey: true });
    expect(mockRedo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Y triggers redo', () => {
    fireKey('y', { ctrlKey: true });
    expect(mockRedo).toHaveBeenCalledTimes(1);
  });

  it('unmodified Z does not trigger undo', () => {
    fireKey('z');
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('cleans up listener on unmount', () => {
    const spy = vi.spyOn(window, 'removeEventListener');
    result.unmount();
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    spy.mockRestore();
  });

  it('does not crash when no options provided', () => {
    const { unmount } = renderHook(() => useGlobalHotkeys());
    expect(() => unmount()).not.toThrow();
  });
});
