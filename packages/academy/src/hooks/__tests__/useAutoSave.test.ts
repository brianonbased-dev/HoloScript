// @vitest-environment jsdom
/**
 * useAutoSave.test.ts
 * Tests for auto-save functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';
import { useShaderGraph } from '../useShaderGraph';

// Mock the shader graph hook
vi.mock('../useShaderGraph', () => ({
  useShaderGraph: vi.fn(),
}));

describe('useAutoSave', () => {
  const mockSerializeGraph = vi.fn(() => '{"nodes":[],"edges":[]}');
  const mockMarkClean = vi.fn();
  let isDirty = false;

  beforeEach(() => {
    vi.useFakeTimers();

    // Reset mocks
    mockSerializeGraph.mockClear();
    mockMarkClean.mockClear();
    isDirty = false;

    // Mock useShaderGraph store
    (useShaderGraph as any).mockImplementation((selector: any) => {
      const state = {
        isDirty,
        serializeGraph: mockSerializeGraph,
        markClean: mockMarkClean,
      };
      return selector(state);
    });

    // Clear localStorage
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('should return loadAutoSave and clearAutoSave functions', () => {
      const { result } = renderHook(() => useAutoSave());

      expect(typeof result.current.loadAutoSave).toBe('function');
      expect(typeof result.current.clearAutoSave).toBe('function');
    });

    it('should not save when not dirty', () => {
      renderHook(() => useAutoSave());

      act(() => {
        vi.advanceTimersByTime(35000); // 35 seconds
      });

      expect(mockSerializeGraph).not.toHaveBeenCalled();
      expect(localStorage.getItem('holoscript_shader_editor_autosave')).toBeNull();
    });
  });

  describe('Auto-Save Trigger', () => {
    it('should save after 30 seconds when dirty', () => {
      // Start with hook and immediately make dirty
      const { rerender } = renderHook(() => useAutoSave());

      isDirty = true;
      rerender();

      // First save happens immediately (lastSaveRef is 0)
      expect(mockSerializeGraph).toHaveBeenCalled();
      mockSerializeGraph.mockClear();
      mockMarkClean.mockClear();

      // Make clean
      isDirty = false;
      rerender();

      // Advance time by 10 seconds
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Make dirty again (should schedule save for 20s later)
      isDirty = true;
      rerender();

      // Should NOT save immediately (only 10s passed, need 30s)
      expect(mockSerializeGraph).not.toHaveBeenCalled();

      // Advance time by 20 seconds to reach 30s total
      act(() => {
        vi.advanceTimersByTime(20000);
      });

      expect(mockSerializeGraph).toHaveBeenCalled();
      expect(localStorage.getItem('holoscript_shader_editor_autosave')).toBe(
        '{"nodes":[],"edges":[]}'
      );
      expect(mockMarkClean).toHaveBeenCalled();
    });

    it('should save immediately if last save was > 30s ago', () => {
      isDirty = true;

      renderHook(() => useAutoSave());

      // First save (immediate because no previous save)
      expect(mockSerializeGraph).toHaveBeenCalled();
      expect(mockMarkClean).toHaveBeenCalled();

      mockSerializeGraph.mockClear();
      mockMarkClean.mockClear();

      // Wait 31 seconds
      act(() => {
        vi.advanceTimersByTime(31000);
      });

      // Make dirty again
      isDirty = true;
      const { rerender } = renderHook(() => useAutoSave());
      rerender();

      // Should save immediately since > 30s passed
      expect(mockSerializeGraph).toHaveBeenCalled();
      expect(mockMarkClean).toHaveBeenCalled();
    });

    it('should schedule save if last save was < 30s ago', () => {
      const { rerender } = renderHook(() => useAutoSave());

      // Make dirty to trigger first save
      isDirty = true;
      rerender();

      // First save (immediate because no previous save)
      expect(mockSerializeGraph).toHaveBeenCalled();

      mockSerializeGraph.mockClear();
      mockMarkClean.mockClear();
      isDirty = false;
      rerender();

      // Advance time by 10 seconds
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Make dirty again
      isDirty = true;
      rerender();

      // Should NOT save immediately (only 10s passed from last save, need 30s)
      expect(mockSerializeGraph).not.toHaveBeenCalled();

      // Advance time by remaining 20 seconds
      act(() => {
        vi.advanceTimersByTime(20000);
      });

      // Now it should save
      expect(mockSerializeGraph).toHaveBeenCalled();
      expect(mockMarkClean).toHaveBeenCalled();
    });

    it('should save timestamp along with data', () => {
      isDirty = true;
      const fixedTime = 1609459200000; // 2021-01-01

      vi.setSystemTime(fixedTime);

      renderHook(() => useAutoSave());

      expect(localStorage.getItem('holoscript_shader_editor_autosave_timestamp')).toBe(
        fixedTime.toString()
      );
    });

    it('should serialize current graph state', () => {
      mockSerializeGraph.mockReturnValue('{"nodes":["node1"],"edges":["edge1"]}');
      isDirty = true;

      renderHook(() => useAutoSave());

      expect(localStorage.getItem('holoscript_shader_editor_autosave')).toBe(
        '{"nodes":["node1"],"edges":["edge1"]}'
      );
    });
  });

  describe('Load Auto-Save', () => {
    it('should load saved data and timestamp', () => {
      const savedData = '{"nodes":["test"],"edges":[]}';
      const savedTimestamp = '1609459200000';

      localStorage.setItem('holoscript_shader_editor_autosave', savedData);
      localStorage.setItem('holoscript_shader_editor_autosave_timestamp', savedTimestamp);

      const { result } = renderHook(() => useAutoSave());

      const loaded = result.current.loadAutoSave();

      expect(loaded).toEqual({
        data: savedData,
        timestamp: 1609459200000,
      });
    });

    it('should return null when no saved data', () => {
      const { result } = renderHook(() => useAutoSave());

      const loaded = result.current.loadAutoSave();

      expect(loaded).toBeNull();
    });

    it('should return null when data exists but timestamp missing', () => {
      localStorage.setItem('holoscript_shader_editor_autosave', '{"nodes":[]}');

      const { result } = renderHook(() => useAutoSave());

      const loaded = result.current.loadAutoSave();

      expect(loaded).toBeNull();
    });

    it('should return null when timestamp exists but data missing', () => {
      localStorage.setItem('holoscript_shader_editor_autosave_timestamp', '1609459200000');

      const { result } = renderHook(() => useAutoSave());

      const loaded = result.current.loadAutoSave();

      expect(loaded).toBeNull();
    });

    it('should parse timestamp as integer', () => {
      localStorage.setItem('holoscript_shader_editor_autosave', '{}');
      localStorage.setItem('holoscript_shader_editor_autosave_timestamp', '123456789');

      const { result } = renderHook(() => useAutoSave());

      const loaded = result.current.loadAutoSave();

      expect(loaded?.timestamp).toBe(123456789);
      expect(typeof loaded?.timestamp).toBe('number');
    });
  });

  describe('Clear Auto-Save', () => {
    it('should remove saved data and timestamp', () => {
      localStorage.setItem('holoscript_shader_editor_autosave', '{"nodes":[]}');
      localStorage.setItem('holoscript_shader_editor_autosave_timestamp', '1609459200000');

      const { result } = renderHook(() => useAutoSave());

      result.current.clearAutoSave();

      expect(localStorage.getItem('holoscript_shader_editor_autosave')).toBeNull();
      expect(localStorage.getItem('holoscript_shader_editor_autosave_timestamp')).toBeNull();
    });

    it('should work when no data exists', () => {
      const { result } = renderHook(() => useAutoSave());

      expect(() => result.current.clearAutoSave()).not.toThrow();
    });
  });

  describe('Timer Management', () => {
    it('should cancel pending save when component unmounts', () => {
      const { unmount, rerender } = renderHook(() => useAutoSave());

      // Make dirty after initial render
      isDirty = true;
      rerender();

      // First save happens immediately
      mockSerializeGraph.mockClear();
      isDirty = false;
      rerender();

      // Advance time and make dirty again
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      isDirty = true;
      rerender();

      // Timer should be scheduled (20s remaining)
      expect(mockSerializeGraph).not.toHaveBeenCalled();

      // Unmount before timer fires
      unmount();

      // Advance time
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      // Should not have saved
      expect(mockSerializeGraph).not.toHaveBeenCalled();
    });

    it('should reset timer when isDirty changes', () => {
      isDirty = true;

      const { rerender } = renderHook(() => useAutoSave());

      // First render triggers immediate save
      expect(mockSerializeGraph).toHaveBeenCalledTimes(1);

      mockSerializeGraph.mockClear();

      // Advance time partially
      act(() => {
        vi.advanceTimersByTime(15000); // 15 seconds
      });

      // Make dirty again (should schedule new timer)
      isDirty = false;
      rerender();

      isDirty = true;
      rerender();

      // Should schedule new timer (20s from now)
      expect(mockSerializeGraph).not.toHaveBeenCalled();

      // Advance by 20 more seconds
      act(() => {
        vi.advanceTimersByTime(20000);
      });

      // Should have saved now
      expect(mockSerializeGraph).toHaveBeenCalled();
    });

    it('should not create multiple timers', () => {
      const { rerender } = renderHook(() => useAutoSave());

      // Make dirty to trigger first save
      isDirty = true;
      rerender();

      mockSerializeGraph.mockClear();
      isDirty = false;
      rerender();

      // Advance time partially
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Make dirty and rerender multiple times quickly
      isDirty = true;
      rerender();
      rerender();
      rerender();

      // Advance time to trigger timer
      act(() => {
        vi.advanceTimersByTime(20000);
      });

      // Should only save once (one timer active)
      expect(mockSerializeGraph).toHaveBeenCalledTimes(1);
    });
  });

  describe('Mark Clean', () => {
    it('should mark clean after save', () => {
      isDirty = true;

      renderHook(() => useAutoSave());

      expect(mockMarkClean).toHaveBeenCalled();
    });

    it('should not mark clean when not saving', () => {
      isDirty = false;

      renderHook(() => useAutoSave());

      expect(mockMarkClean).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty serialized data', () => {
      mockSerializeGraph.mockReturnValue('');
      isDirty = true;

      renderHook(() => useAutoSave());

      expect(localStorage.getItem('holoscript_shader_editor_autosave')).toBe('');
    });

    it('should handle very large serialized data', () => {
      const largeData = '{"nodes":' + JSON.stringify(new Array(10000).fill({ id: 'node' })) + '}';
      mockSerializeGraph.mockReturnValue(largeData);
      isDirty = true;

      renderHook(() => useAutoSave());

      expect(localStorage.getItem('holoscript_shader_editor_autosave')).toBe(largeData);
    });

    it('should handle invalid timestamp in loadAutoSave', () => {
      localStorage.setItem('holoscript_shader_editor_autosave', '{}');
      localStorage.setItem('holoscript_shader_editor_autosave_timestamp', 'invalid');

      const { result } = renderHook(() => useAutoSave());

      const loaded = result.current.loadAutoSave();

      expect(loaded?.timestamp).toBeNaN();
    });

    it('should handle rapid dirty state changes', () => {
      isDirty = false;
      const { rerender } = renderHook(() => useAutoSave());

      // Rapidly toggle dirty state
      for (let i = 0; i < 10; i++) {
        isDirty = !isDirty;
        rerender();
      }

      act(() => {
        vi.advanceTimersByTime(30000);
      });

      // Should have saved at least once
      expect(mockSerializeGraph).toHaveBeenCalled();
    });
  });

  describe('LocalStorage Integration', () => {
    it('should use correct localStorage keys', () => {
      isDirty = true;

      renderHook(() => useAutoSave());

      expect(localStorage.getItem('holoscript_shader_editor_autosave')).toBeDefined();
      expect(localStorage.getItem('holoscript_shader_editor_autosave_timestamp')).toBeDefined();
    });

    it('should handle localStorage quota exceeded', () => {
      // Mock localStorage to throw quota exceeded error
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      isDirty = true;

      // Should not throw
      expect(() => renderHook(() => useAutoSave())).not.toThrow();

      setItemSpy.mockRestore();
    });
  });
});
