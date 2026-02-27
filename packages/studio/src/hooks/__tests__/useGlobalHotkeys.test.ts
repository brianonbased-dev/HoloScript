// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobalHotkeys } from '../useGlobalHotkeys';

// Use vi.hoisted to ensure mocks are available when vi.mock runs
const { mockUndo, mockRedo } = vi.hoisted(() => {
  return {
    mockUndo: vi.fn(),
    mockRedo: vi.fn(),
  };
});

const mockState = {
  undo: mockUndo,
  redo: mockRedo,
};

// Need to match the actual import path from the hook file
vi.mock('../../lib/historyStore', () => ({
  useHistoryStore: {
    temporal: {
      getState: () => mockState,
    },
  },
}));

describe('useGlobalHotkeys', () => {
  let originalPlatform: string;

  beforeEach(() => {
    originalPlatform = navigator.platform;
    mockUndo.mockClear();
    mockRedo.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
    });
  });

  describe('Event Listener Registration', () => {
    it('should add keydown listener on mount', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      renderHook(() => useGlobalHotkeys());

      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should remove keydown listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useGlobalHotkeys());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });

  describe('Undo Shortcut (Ctrl+Z)', () => {
    it('should call undo when Ctrl+Z is pressed on Windows', () => {
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        writable: true,
      });

      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).toHaveBeenCalledTimes(1);
    });

    it('should call undo when Meta+Z is pressed on Mac', () => {
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        writable: true,
      });

      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).toHaveBeenCalledTimes(1);
    });

    it('should prevent default when Ctrl+Z is pressed', () => {
      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      act(() => {
        window.dispatchEvent(event);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not call undo when Shift+Ctrl+Z is pressed', () => {
      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).not.toHaveBeenCalled();
      expect(mockRedo).toHaveBeenCalled();
    });

    it('should handle uppercase Z key', () => {
      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'Z',
        ctrlKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).toHaveBeenCalledTimes(1);
    });
  });

  describe('Redo Shortcuts (Ctrl+Shift+Z, Ctrl+Y)', () => {
    it('should call redo when Ctrl+Shift+Z is pressed', () => {
      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockRedo).toHaveBeenCalledTimes(1);
    });

    it('should call redo when Ctrl+Y is pressed', () => {
      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'y',
        ctrlKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockRedo).toHaveBeenCalledTimes(1);
    });

    it('should prevent default when redo shortcuts are pressed', () => {
      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'y',
        ctrlKey: true,
        bubbles: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      act(() => {
        window.dispatchEvent(event);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should handle uppercase Y key', () => {
      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'Y',
        ctrlKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockRedo).toHaveBeenCalledTimes(1);
    });
  });

  describe('Editable Target Detection', () => {
    it('should not trigger undo when typing in an input', () => {
      renderHook(() => useGlobalHotkeys());

      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input, enumerable: true });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('should not trigger undo when typing in a textarea', () => {
      renderHook(() => useGlobalHotkeys());

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: textarea, enumerable: true });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });

    it('should not trigger undo in contentEditable elements', () => {
      renderHook(() => useGlobalHotkeys());

      const div = document.createElement('div');
      // Need to set contentEditable and also manually set isContentEditable for jsdom
      div.contentEditable = 'true';
      // Force isContentEditable to be true (jsdom may not update it automatically)
      Object.defineProperty(div, 'isContentEditable', {
        value: true,
        writable: false,
        configurable: true,
      });
      document.body.appendChild(div);

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: div, enumerable: true });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).not.toHaveBeenCalled();
      document.body.removeChild(div);
    });

    it('should trigger undo in non-editable elements', () => {
      renderHook(() => useGlobalHotkeys());

      const div = document.createElement('div');
      document.body.appendChild(div);

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: div, enumerable: true });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).toHaveBeenCalledTimes(1);
      document.body.removeChild(div);
    });
  });

  describe('Platform Detection', () => {
    it('should use Ctrl key on Windows', () => {
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        writable: true,
      });

      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: false,
        ctrlKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).toHaveBeenCalled();
    });

    it('should use Meta key on Mac', () => {
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        writable: true,
      });

      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        ctrlKey: false,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).toHaveBeenCalled();
    });

    it('should not trigger on Mac when Ctrl is pressed instead of Meta', () => {
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        writable: true,
      });

      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: false,
        ctrlKey: true,
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle events with null target', () => {
      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });

      // Don't set target, let it default
      expect(() => {
        act(() => {
          window.dispatchEvent(event);
        });
      }).not.toThrow();
    });

    it('should handle multiple rapid undo commands', () => {
      renderHook(() => useGlobalHotkeys());

      act(() => {
        for (let i = 0; i < 5; i++) {
          const event = new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
          });
          window.dispatchEvent(event);
        }
      });

      expect(mockUndo).toHaveBeenCalledTimes(5);
    });

    it('should handle mixed undo and redo commands', () => {
      renderHook(() => useGlobalHotkeys());

      act(() => {
        // Undo
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
          })
        );

        // Redo
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'y',
            ctrlKey: true,
            bubbles: true,
          })
        );

        // Undo again
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
          })
        );
      });

      expect(mockUndo).toHaveBeenCalledTimes(2);
      expect(mockRedo).toHaveBeenCalledTimes(1);
    });

    it('should not interfere with other keyboard events', () => {
      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
        bubbles: true,
      });

      expect(() => {
        act(() => {
          window.dispatchEvent(event);
        });
      }).not.toThrow();

      expect(mockUndo).not.toHaveBeenCalled();
      expect(mockRedo).not.toHaveBeenCalled();
    });

    it('should handle keydown without modifier keys', () => {
      renderHook(() => useGlobalHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        bubbles: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockUndo).not.toHaveBeenCalled();
    });
  });
});
