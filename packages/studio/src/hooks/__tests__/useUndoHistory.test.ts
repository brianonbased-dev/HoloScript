// @vitest-environment jsdom
/**
 * useUndoHistory.test.ts
 * Tests for undo/redo history hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUndoHistory } from '../useUndoHistory';
import { useTemporalStore } from '@/lib/historyStore';
import { useSceneStore } from '@/lib/store';

// Mock the temporal store
vi.mock('@/lib/historyStore', () => ({
  useTemporalStore: vi.fn(),
}));

describe('useUndoHistory', () => {
  const mockUndo = vi.fn();
  const mockRedo = vi.fn();

  beforeEach(() => {
    // Reset scene store
    useSceneStore.setState({ code: 'scene Current { object "Box" {} }' });

    // Reset mocks
    mockUndo.mockClear();
    mockRedo.mockClear();

    // Default temporal store mock (empty history)
    (useTemporalStore as any).mockImplementation((selector: any) => {
      const state = {
        pastStates: [],
        futureStates: [],
        undo: mockUndo,
        redo: mockRedo,
      };
      return selector(state);
    });
  });

  describe('History Entries', () => {
    it('should return current state with no history', () => {
      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]).toMatchObject({
        index: 0,
        label: expect.stringContaining('Current'),
        isCurrent: true,
      });
      expect(result.current.currentIndex).toBe(0);
    });

    it('should include past states in entries', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [
            { code: 'scene Old { object "Sphere" {} }' },
            { code: 'scene Middle { object "Cube" {} }' },
          ],
          futureStates: [],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries).toHaveLength(3); // 2 past + 1 current
      expect(result.current.entries[0].isCurrent).toBe(false);
      expect(result.current.entries[1].isCurrent).toBe(false);
      expect(result.current.entries[2].isCurrent).toBe(true);
      expect(result.current.currentIndex).toBe(2);
    });

    it('should include future states in entries', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [{ code: 'scene Past {}' }],
          futureStates: [
            { code: 'scene Future1 {}' },
            { code: 'scene Future2 {}' },
          ],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries).toHaveLength(4); // 1 past + 1 current + 2 future
      expect(result.current.entries[2].label).toContain('Redo 1');
      expect(result.current.entries[3].label).toContain('Redo 2');
    });
  });

  describe('Entry Labels', () => {
    it('should label entries based on object count', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [
            { code: 'scene Test { object "A" {} object "B" {} }' },
          ],
          futureStates: [],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].label).toContain('2 objects');
    });

    it('should use singular form for single object', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [
            { code: 'scene Test { object "Single" {} }' },
          ],
          futureStates: [],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].label).toContain('1 object');
      expect(result.current.entries[0].label).not.toContain('objects');
    });

    it('should label multiline code without objects', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [
            { code: 'scene Test {\n  // comment\n}' },
          ],
          futureStates: [],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].label).toContain('multiline');
    });

    it('should label single line code without objects', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [
            { code: 'scene Empty {}' },
          ],
          futureStates: [],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].label).toBe('Edit');
    });

    it('should label current state with object count', () => {
      useSceneStore.setState({
        code: 'scene Current { object "A" {} object "B" {} object "C" {} }',
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].label).toContain('Current');
      expect(result.current.entries[0].label).toContain('3 objects');
    });

    it('should label current state as scene when no objects', () => {
      useSceneStore.setState({ code: 'scene Empty {}' });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].label).toContain('scene');
    });
  });

  describe('Entry Previews', () => {
    it('should include code preview (first 60 chars)', () => {
      const longCode = 'scene Test { object "VeryLongObjectNameThatExceedsThePreviewLimit" {} }';
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [{ code: longCode }],
          futureStates: [],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].preview).toHaveLength(60);
      expect(result.current.entries[0].preview).toBe(longCode.slice(0, 60));
    });

    it('should trim whitespace from preview', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [{ code: '  scene Test {}  ' }],
          futureStates: [],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].preview).toBe('scene Test {}');
    });

    it('should handle empty code', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [{ code: '' }],
          futureStates: [],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].preview).toBe('');
    });

    it('should handle undefined code', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [{}],
          futureStates: [],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].preview).toBe('');
    });
  });

  describe('Jump To History Point', () => {
    beforeEach(() => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [
            { code: 'scene Past1 {}' },
            { code: 'scene Past2 {}' },
            { code: 'scene Past3 {}' },
          ],
          futureStates: [
            { code: 'scene Future1 {}' },
            { code: 'scene Future2 {}' },
          ],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });
    });

    it('should call undo when jumping to past state', () => {
      const { result } = renderHook(() => useUndoHistory());

      // Current index is 3 (3 past states), jump to index 1
      result.current.jumpTo(1);

      expect(mockUndo).toHaveBeenCalledWith(2); // 3 - 1 = 2 steps back
    });

    it('should call redo when jumping to future state', () => {
      const { result } = renderHook(() => useUndoHistory());

      // Current index is 3, jump to index 4 (first future state)
      result.current.jumpTo(4);

      expect(mockRedo).toHaveBeenCalledWith(1); // 4 - 3 = 1 step forward
    });

    it('should not call undo/redo when jumping to current index', () => {
      const { result } = renderHook(() => useUndoHistory());

      // Current index is 3
      result.current.jumpTo(3);

      expect(mockUndo).not.toHaveBeenCalled();
      expect(mockRedo).not.toHaveBeenCalled();
    });

    it('should handle jumping to oldest state', () => {
      const { result } = renderHook(() => useUndoHistory());

      result.current.jumpTo(0); // Jump to first past state

      expect(mockUndo).toHaveBeenCalledWith(3);
    });

    it('should handle jumping to furthest future state', () => {
      const { result } = renderHook(() => useUndoHistory());

      result.current.jumpTo(5); // Jump to last future state (index 3 + 2)

      expect(mockRedo).toHaveBeenCalledWith(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing undo function gracefully', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [{ code: 'scene Past {}' }],
          futureStates: [],
          undo: undefined, // No undo function
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      // Should not throw
      expect(() => result.current.jumpTo(0)).not.toThrow();
      expect(mockUndo).not.toHaveBeenCalled();
    });

    it('should handle missing redo function gracefully', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [{ code: 'scene Past {}' }],
          futureStates: [{ code: 'scene Future {}' }],
          undo: mockUndo,
          redo: undefined, // No redo function
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      // Should not throw
      expect(() => result.current.jumpTo(2)).not.toThrow();
      expect(mockRedo).not.toHaveBeenCalled();
    });

    it('should handle undefined pastStates array', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: undefined,
          futureStates: [],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries).toHaveLength(1); // Only current state
      expect(result.current.currentIndex).toBe(0);
    });

    it('should handle undefined futureStates array', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [],
          futureStates: undefined,
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries).toHaveLength(1); // Only current state
    });

    it('should handle null current code', () => {
      useSceneStore.setState({ code: null as any });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].preview).toBe('');
    });
  });

  describe('Entry Indices', () => {
    it('should assign sequential indices', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [
            { code: 'scene 1 {}' },
            { code: 'scene 2 {}' },
          ],
          futureStates: [
            { code: 'scene 3 {}' },
          ],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].index).toBe(0);
      expect(result.current.entries[1].index).toBe(1);
      expect(result.current.entries[2].index).toBe(2); // Current
      expect(result.current.entries[3].index).toBe(3); // Future
    });

    it('should mark only current state as isCurrent', () => {
      (useTemporalStore as any).mockImplementation((selector: any) => {
        const state = {
          pastStates: [{ code: 'scene Past {}' }],
          futureStates: [{ code: 'scene Future {}' }],
          undo: mockUndo,
          redo: mockRedo,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useUndoHistory());

      expect(result.current.entries[0].isCurrent).toBe(false); // Past
      expect(result.current.entries[1].isCurrent).toBe(true);  // Current
      expect(result.current.entries[2].isCurrent).toBe(false); // Future
    });
  });
});
