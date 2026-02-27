// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSnapshotDiff } from '../useSnapshotDiff';
import { useTemporalStore } from '@/lib/historyStore';
import { useSceneStore } from '@/lib/store';

vi.mock('@/lib/historyStore', () => ({
  useTemporalStore: vi.fn(),
}));

vi.mock('@/lib/store', () => ({
  useSceneStore: vi.fn(),
}));

describe('useSnapshotDiff', () => {
  let mockTemporal: any;
  let mockCurrentCode: string;

  beforeEach(() => {
    // Reset to defaults
    mockTemporal = {
      pastStates: [],
      futureStates: [],
    };
    mockCurrentCode = '';

    (useTemporalStore as any).mockImplementation((selector: any) => {
      return selector(mockTemporal);
    });

    (useSceneStore as any).mockImplementation((selector: any) => {
      const state = { code: mockCurrentCode };
      return selector(state);
    });
  });

  describe('Initial State', () => {
    it('should initialize with empty diff when no snapshots', () => {
      const { result } = renderHook(() => useSnapshotDiff());

      // Empty code strings result in one 'same' line with empty text
      expect(result.current.diff).toEqual([
        { type: 'same', text: '', lineA: 1, lineB: 1 },
      ]);
    });

    it('should initialize with indexA = 0 and indexB = 0 when no past states', () => {
      const { result } = renderHook(() => useSnapshotDiff());

      expect(result.current.indexA).toBe(0);
      expect(result.current.indexB).toBe(0);
    });

    it('should initialize with correct currentIndex', () => {
      mockTemporal.pastStates = [{ code: 'a' }, { code: 'b' }];
      mockCurrentCode = 'c';

      const { result } = renderHook(() => useSnapshotDiff());

      expect(result.current.currentIndex).toBe(2);
    });

    it('should initialize with indexA = currentIndex - 1 and indexB = currentIndex', () => {
      mockTemporal.pastStates = [{ code: 'scene Main {}' }, { code: 'scene Main { box(); }' }];
      mockCurrentCode = 'scene Main { box(); sphere(); }';

      const { result } = renderHook(() => useSnapshotDiff());

      expect(result.current.indexA).toBe(1); // currentIndex - 1
      expect(result.current.indexB).toBe(2); // currentIndex
    });

    it('should initialize with empty stats', () => {
      const { result } = renderHook(() => useSnapshotDiff());

      expect(result.current.stats).toEqual({
        added: 0,
        removed: 0,
      });
    });
  });

  describe('All Codes Array', () => {
    it('should build allCodes from past, current, and future states', () => {
      mockTemporal.pastStates = [{ code: 'a' }, { code: 'b' }];
      mockCurrentCode = 'c';
      mockTemporal.futureStates = [{ code: 'd' }];

      const { result } = renderHook(() => useSnapshotDiff());

      expect(result.current.allCodes).toEqual(['a', 'b', 'c', 'd']);
    });

    it('should handle missing code properties as empty string', () => {
      mockTemporal.pastStates = [{ code: 'a' }, {}];
      mockCurrentCode = 'b';

      const { result } = renderHook(() => useSnapshotDiff());

      expect(result.current.allCodes).toEqual(['a', '', 'b']);
    });
  });

  describe('Diff Computation - Same Lines', () => {
    it('should mark identical lines as "same"', () => {
      mockTemporal.pastStates = [{ code: 'line1\nline2' }];
      mockCurrentCode = 'line1\nline2';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      expect(result.current.diff).toEqual([
        { type: 'same', text: 'line1', lineA: 1, lineB: 1 },
        { type: 'same', text: 'line2', lineA: 2, lineB: 2 },
      ]);
    });
  });

  describe('Diff Computation - Added Lines', () => {
    it('should mark new lines as "added"', () => {
      mockTemporal.pastStates = [{ code: 'line1' }];
      mockCurrentCode = 'line1\nline2';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      expect(result.current.diff).toEqual([
        { type: 'same', text: 'line1', lineA: 1, lineB: 1 },
        { type: 'added', text: 'line2', lineB: 2 },
      ]);
    });

    it('should handle multiple added lines', () => {
      mockTemporal.pastStates = [{ code: 'line1' }];
      mockCurrentCode = 'line1\nline2\nline3';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      expect(result.current.diff).toEqual([
        { type: 'same', text: 'line1', lineA: 1, lineB: 1 },
        { type: 'added', text: 'line2', lineB: 2 },
        { type: 'added', text: 'line3', lineB: 3 },
      ]);
    });
  });

  describe('Diff Computation - Removed Lines', () => {
    it('should mark deleted lines as "removed"', () => {
      mockTemporal.pastStates = [{ code: 'line1\nline2' }];
      mockCurrentCode = 'line1';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      expect(result.current.diff).toEqual([
        { type: 'same', text: 'line1', lineA: 1, lineB: 1 },
        { type: 'removed', text: 'line2', lineA: 2 },
      ]);
    });

    it('should handle multiple removed lines', () => {
      mockTemporal.pastStates = [{ code: 'line1\nline2\nline3' }];
      mockCurrentCode = 'line1';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      expect(result.current.diff).toEqual([
        { type: 'same', text: 'line1', lineA: 1, lineB: 1 },
        { type: 'removed', text: 'line2', lineA: 2 },
        { type: 'removed', text: 'line3', lineA: 3 },
      ]);
    });
  });

  describe('Diff Computation - Mixed Changes', () => {
    it('should handle both added and removed lines', () => {
      mockTemporal.pastStates = [{ code: 'line1\nline2\nline3' }];
      mockCurrentCode = 'line1\nline4\nline3';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      const diff = result.current.diff;
      expect(diff[0]).toEqual({ type: 'same', text: 'line1', lineA: 1, lineB: 1 });
      expect(diff.some(d => d.type === 'removed' && d.text === 'line2')).toBe(true);
      expect(diff.some(d => d.type === 'added' && d.text === 'line4')).toBe(true);
      expect(diff.some(d => d.type === 'same' && d.text === 'line3')).toBe(true);
    });

    it('should handle complete replacement', () => {
      mockTemporal.pastStates = [{ code: 'old1\nold2' }];
      mockCurrentCode = 'new1\nnew2';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      // LCS algorithm may order added/removed differently based on traversal
      expect(result.current.diff).toEqual([
        { type: 'added', text: 'new1', lineB: 1 },
        { type: 'added', text: 'new2', lineB: 2 },
        { type: 'removed', text: 'old1', lineA: 1 },
        { type: 'removed', text: 'old2', lineA: 2 },
      ]);
    });
  });

  describe('Stats Calculation', () => {
    it('should count added lines correctly', () => {
      mockTemporal.pastStates = [{ code: 'line1' }];
      mockCurrentCode = 'line1\nline2\nline3';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      expect(result.current.stats.added).toBe(2);
    });

    it('should count removed lines correctly', () => {
      mockTemporal.pastStates = [{ code: 'line1\nline2\nline3' }];
      mockCurrentCode = 'line1';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      expect(result.current.stats.removed).toBe(2);
    });

    it('should have zero stats for identical code', () => {
      mockTemporal.pastStates = [{ code: 'same code' }];
      mockCurrentCode = 'same code';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      expect(result.current.stats).toEqual({
        added: 0,
        removed: 0,
      });
    });

    it('should count both added and removed in mixed changes', () => {
      mockTemporal.pastStates = [{ code: 'a\nb\nc' }];
      mockCurrentCode = 'a\nd\ne';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      expect(result.current.stats.added).toBeGreaterThan(0);
      expect(result.current.stats.removed).toBeGreaterThan(0);
    });
  });

  describe('Snapshot Navigation', () => {
    beforeEach(() => {
      mockTemporal.pastStates = [
        { code: 'version 0' },
        { code: 'version 1' },
        { code: 'version 2' },
      ];
      mockCurrentCode = 'version 3';
    });

    it('should allow setting indexA', () => {
      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
      });

      expect(result.current.indexA).toBe(0);
    });

    it('should allow setting indexB', () => {
      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexB(3);
      });

      expect(result.current.indexB).toBe(3);
    });

    it('should recompute diff when indexA changes', () => {
      const { result } = renderHook(() => useSnapshotDiff());

      const diffBefore = result.current.diff;

      act(() => {
        result.current.setIndexA(0);
      });

      expect(result.current.diff).not.toBe(diffBefore);
    });

    it('should recompute diff when indexB changes', () => {
      const { result } = renderHook(() => useSnapshotDiff());

      const diffBefore = result.current.diff;

      act(() => {
        result.current.setIndexB(1);
      });

      expect(result.current.diff).not.toBe(diffBefore);
    });

    it('should compare any two snapshots', () => {
      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0); // 'version 0'
        result.current.setIndexB(2); // 'version 2'
      });

      expect(result.current.diff.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty code strings', () => {
      mockTemporal.pastStates = [{ code: '' }];
      mockCurrentCode = '';

      const { result } = renderHook(() => useSnapshotDiff());

      expect(result.current.diff).toEqual([
        { type: 'same', text: '', lineA: 1, lineB: 1 },
      ]);
    });

    it('should handle single line code', () => {
      mockTemporal.pastStates = [{ code: 'single line' }];
      mockCurrentCode = 'single line';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      expect(result.current.diff).toEqual([
        { type: 'same', text: 'single line', lineA: 1, lineB: 1 },
      ]);
    });

    it('should handle code with only newlines', () => {
      mockTemporal.pastStates = [{ code: '\n\n' }];
      mockCurrentCode = '\n\n';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      expect(result.current.diff).toEqual([
        { type: 'same', text: '', lineA: 1, lineB: 1 },
        { type: 'same', text: '', lineA: 2, lineB: 2 },
        { type: 'same', text: '', lineA: 3, lineB: 3 },
      ]);
    });

    it('should handle null code as empty string', () => {
      mockTemporal.pastStates = [{ code: undefined as any }];
      mockCurrentCode = null as any;

      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: null };
        return selector(state);
      });

      const { result } = renderHook(() => useSnapshotDiff());

      expect(result.current.allCodes[0]).toBe('');
      expect(result.current.allCodes[1]).toBe('');
    });

    it('should truncate at MAX_LINES_FOR_DIFF (500 lines)', () => {
      // Create code with 600 lines
      const longCode = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join('\n');
      mockTemporal.pastStates = [{ code: longCode }];
      mockCurrentCode = longCode;

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      // Should only process first 500 lines
      expect(result.current.diff.length).toBeLessThanOrEqual(500);
    });

    it('should memoize diff when dependencies do not change', () => {
      mockTemporal.pastStates = [{ code: 'test' }];
      mockCurrentCode = 'test';

      const { result, rerender } = renderHook(() => useSnapshotDiff());

      const firstDiff = result.current.diff;

      rerender();

      expect(result.current.diff).toBe(firstDiff);
    });

    it('should recompute diff when allCodes changes', () => {
      mockTemporal.pastStates = [{ code: 'old' }];
      mockCurrentCode = 'new';

      const { result, rerender } = renderHook(() => useSnapshotDiff());

      const firstDiff = result.current.diff;

      // Change the code
      mockCurrentCode = 'changed';
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCurrentCode };
        return selector(state);
      });

      rerender();

      expect(result.current.diff).not.toBe(firstDiff);
    });

    it('should handle comparing same snapshot with itself', () => {
      mockTemporal.pastStates = [{ code: 'same' }];
      mockCurrentCode = 'different';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(0);
      });

      expect(result.current.diff).toEqual([
        { type: 'same', text: 'same', lineA: 1, lineB: 1 },
      ]);
      expect(result.current.stats).toEqual({
        added: 0,
        removed: 0,
      });
    });

    it('should handle rapid index changes', () => {
      mockTemporal.pastStates = [
        { code: 'v0' },
        { code: 'v1' },
        { code: 'v2' },
      ];
      mockCurrentCode = 'v3';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      act(() => {
        result.current.setIndexA(1);
        result.current.setIndexB(2);
      });

      act(() => {
        result.current.setIndexA(2);
        result.current.setIndexB(3);
      });

      expect(result.current.indexA).toBe(2);
      expect(result.current.indexB).toBe(3);
    });
  });

  describe('LCS Algorithm Verification', () => {
    it('should correctly identify common subsequences', () => {
      mockTemporal.pastStates = [{ code: 'a\nb\nc\nd' }];
      mockCurrentCode = 'a\nx\nc\ny';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      const sameLines = result.current.diff.filter(d => d.type === 'same');
      expect(sameLines.map(d => d.text)).toEqual(['a', 'c']);
    });

    it('should handle no common lines', () => {
      mockTemporal.pastStates = [{ code: 'a\nb' }];
      mockCurrentCode = 'x\ny';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      const sameLines = result.current.diff.filter(d => d.type === 'same');
      expect(sameLines).toHaveLength(0);
      expect(result.current.stats.removed).toBe(2);
      expect(result.current.stats.added).toBe(2);
    });

    it('should handle all common lines', () => {
      mockTemporal.pastStates = [{ code: 'a\nb\nc' }];
      mockCurrentCode = 'a\nb\nc';

      const { result } = renderHook(() => useSnapshotDiff());

      act(() => {
        result.current.setIndexA(0);
        result.current.setIndexB(1);
      });

      const sameLines = result.current.diff.filter(d => d.type === 'same');
      expect(sameLines).toHaveLength(3);
      expect(result.current.stats.removed).toBe(0);
      expect(result.current.stats.added).toBe(0);
    });
  });
});
