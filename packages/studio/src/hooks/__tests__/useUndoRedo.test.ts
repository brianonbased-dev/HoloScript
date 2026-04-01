// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useUndoRedo } from '../useUndoRedo';
import { useTemporalStore } from '@/lib/historyStore';

vi.mock('@/lib/historyStore', () => ({
  useTemporalStore: vi.fn(),
}));

describe('useUndoRedo', () => {
  const mockUndo = vi.fn();
  const mockRedo = vi.fn();

  beforeEach(() => {
    mockUndo.mockClear();
    mockRedo.mockClear();

    (useTemporalStore as any).mockImplementation((selector: any) => {
      const state = { undo: mockUndo, redo: mockRedo };
      return selector(state);
    });
  });

  afterEach(() => {
    // Clean up any event listeners
    const handlers = (window as any)._listeners?.keydown || [];
    handlers.forEach((handler: any) => {
      window.removeEventListener('keydown', handler);
    });
  });

  describe('Hook Setup', () => {
    it('should set up keyboard event listener on mount', () => {
      const listenerSpy = vi.spyOn(window, 'addEventListener');

      renderHook(() => useUndoRedo());

      expect(listenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should clean up event listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useUndoRedo());
      unmount();

      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });

  describe('Undo Shortcut (Ctrl+Z)', () => {
    it('should call undo on Ctrl+Z', () => {
      renderHook(() => useUndoRedo());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(mockUndo).toHaveBeenCalledTimes(1);
      expect(mockRedo).not.toHaveBeenCalled();
    });

    it('should call undo on Meta+Z (Mac)', () => {
      renderHook(() => useUndoRedo());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(mockUndo).toHaveBeenCalledTimes(1);
    });

    it('should prevent default on Ctrl+Z', () => {
      renderHook(() => useUndoRedo());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      Object.defineProperty(event, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('Redo Shortcuts', () => {
    it('should call redo on Ctrl+Shift+Z', () => {
      renderHook(() => useUndoRedo());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(mockRedo).toHaveBeenCalledTimes(1);
      expect(mockUndo).not.toHaveBeenCalled();
    });

    it('should call redo on Ctrl+Y (Windows convention)', () => {
      renderHook(() => useUndoRedo());

      const event = new KeyboardEvent('keydown', {
        key: 'y',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(mockRedo).toHaveBeenCalledTimes(1);
      expect(mockUndo).not.toHaveBeenCalled();
    });

    it('should prevent default on Ctrl+Shift+Z', () => {
      renderHook(() => useUndoRedo());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      Object.defineProperty(event, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent default on Ctrl+Y', () => {
      renderHook(() => useUndoRedo());

      const event = new KeyboardEvent('keydown', {
        key: 'y',
        ctrlKey: true,
        bubbles: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      Object.defineProperty(event, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('Input Element Prevention', () => {
    it('should skip undo when focused on INPUT', () => {
      renderHook(() => useUndoRedo());

      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: input,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(mockUndo).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('should skip undo when focused on TEXTAREA', () => {
      renderHook(() => useUndoRedo());

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: textarea,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(mockUndo).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });

    it('should skip undo when focused on contentEditable element', () => {
      renderHook(() => useUndoRedo());

      const div = document.createElement('div');
      div.contentEditable = 'true';
      // Explicitly set isContentEditable for jsdom
      Object.defineProperty(div, 'isContentEditable', {
        value: true,
        writable: false,
      });
      document.body.appendChild(div);

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: div,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(mockUndo).not.toHaveBeenCalled();

      document.body.removeChild(div);
    });

    it('should skip redo when focused on INPUT', () => {
      renderHook(() => useUndoRedo());

      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', {
        key: 'y',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: input,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(mockRedo).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });
  });

  describe('Non-Ctrl Keys', () => {
    it('should not trigger undo on Z without Ctrl', () => {
      renderHook(() => useUndoRedo());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(mockUndo).not.toHaveBeenCalled();
    });

    it('should not trigger redo on Y without Ctrl', () => {
      renderHook(() => useUndoRedo());

      const event = new KeyboardEvent('keydown', {
        key: 'y',
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(mockRedo).not.toHaveBeenCalled();
    });

    it('should ignore other Ctrl+Key combinations', () => {
      renderHook(() => useUndoRedo());

      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', {
        value: document.body,
        writable: false,
      });

      window.dispatchEvent(event);

      expect(mockUndo).not.toHaveBeenCalled();
      expect(mockRedo).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid mount/unmount', () => {
      const { unmount } = renderHook(() => useUndoRedo());
      unmount();

      const { unmount: unmount2 } = renderHook(() => useUndoRedo());
      unmount2();
    });

    it('should handle multiple undo calls', () => {
      renderHook(() => useUndoRedo());

      for (let i = 0; i < 5; i++) {
        const event = new KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          bubbles: true,
        });
        Object.defineProperty(event, 'target', {
          value: document.body,
          writable: false,
        });

        window.dispatchEvent(event);
      }

      expect(mockUndo).toHaveBeenCalledTimes(5);
    });

    it('should handle multiple redo calls', () => {
      renderHook(() => useUndoRedo());

      for (let i = 0; i < 3; i++) {
        const event = new KeyboardEvent('keydown', {
          key: 'y',
          ctrlKey: true,
          bubbles: true,
        });
        Object.defineProperty(event, 'target', {
          value: document.body,
          writable: false,
        });

        window.dispatchEvent(event);
      }

      expect(mockRedo).toHaveBeenCalledTimes(3);
    });

    it('should not crash on events without target', () => {
      renderHook(() => useUndoRedo());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });

      expect(() => window.dispatchEvent(event)).not.toThrow();
    });
  });
});
