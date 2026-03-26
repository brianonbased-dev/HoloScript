// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSceneSearch } from '../useSceneSearch';
import { useSceneStore } from '@/lib/stores';

vi.mock('@/lib/stores', () => ({
  useSceneStore: vi.fn(),
}));

describe('useSceneSearch', () => {
  let mockCode = '';

  beforeEach(() => {
    mockCode = '';
    (useSceneStore as any).mockImplementation((selector: any) => {
      const state = { code: mockCode };
      return selector(state);
    });
  });

  describe('Initial State', () => {
    it('should initialize with empty query', () => {
      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.query).toBe('');
    });

    it('should initialize with isOpen false', () => {
      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.isOpen).toBe(false);
    });

    it('should initialize with empty results', () => {
      mockCode = '';

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results).toEqual([]);
    });

    it('should initialize with zero totalObjects', () => {
      mockCode = '';

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.totalObjects).toBe(0);
    });
  });

  describe('Scene Parsing', () => {
    it('should parse scene declarations', () => {
      mockCode = `scene "Main" {
  background(#000000);
}`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0]).toMatchObject({
        name: 'Main',
        type: 'scene',
        traits: [],
        line: 1,
      });
    });

    it('should capture scene snippet', () => {
      mockCode = `scene "TestScene" { /* some content */ }`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results[0].snippet).toContain('scene "TestScene"');
    });
  });

  describe('Object Parsing', () => {
    it('should parse object declarations', () => {
      mockCode = `object "box1" {
  @transform(position: [0, 0, 0])
}`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0]).toMatchObject({
        name: 'box1',
        type: 'object',
        line: 1,
      });
    });

    it('should collect object traits', () => {
      mockCode = `object "box1" {
  @transform(position: [0, 0, 0])
  @material(color: "#ff0000")
  @physics(mass: 10)
}`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results[0].traits).toEqual(['transform', 'material', 'physics']);
    });

    it('should parse multiple objects', () => {
      mockCode = `object "box1" {
  @transform(position: [0, 0, 0])
}
object "box2" {
  @material(color: "#00ff00")
}`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results).toHaveLength(2);
      expect(result.current.results[0].name).toBe('box1');
      expect(result.current.results[1].name).toBe('box2');
    });

    it('should capture correct line numbers', () => {
      mockCode = `scene "Main" {
}
object "box1" {
  @transform(position: [0, 0, 0])
}`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results[0].line).toBe(1); // scene
      expect(result.current.results[1].line).toBe(3); // object
    });
  });

  describe('Light Detection', () => {
    it('should identify pointLight as light', () => {
      mockCode = `object "light1" {
  @pointLight(intensity: 1.0)
  @transform(position: [0, 5, 0])
}`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results[0]).toMatchObject({
        name: 'light1',
        type: 'light',
      });
    });

    it('should identify directionalLight as light', () => {
      mockCode = `object "sun" {
  @directionalLight(intensity: 2.0)
}`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results[0].type).toBe('light');
    });

    it('should identify spotLight as light', () => {
      mockCode = `object "spot" {
  @spotLight(angle: 45)
}`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results[0].type).toBe('light');
    });
  });

  describe('Fuzzy Search', () => {
    beforeEach(() => {
      mockCode = `scene "Main" {
}
object "player" {
  @transform(position: [0, 0, 0])
  @physics(mass: 10)
}
object "enemy" {
  @transform(position: [5, 0, 5])
  @ai(behavior: "aggressive")
}
object "light1" {
  @pointLight(intensity: 1.0)
}`;
    });

    it('should filter by name', () => {
      const { result } = renderHook(() => useSceneSearch());

      act(() => {
        result.current.setQuery('player');
      });

      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0].name).toBe('player');
    });

    it('should filter by trait', () => {
      const { result } = renderHook(() => useSceneSearch());

      act(() => {
        result.current.setQuery('physics');
      });

      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0].name).toBe('player');
    });

    it('should filter by type', () => {
      const { result } = renderHook(() => useSceneSearch());

      act(() => {
        result.current.setQuery('light');
      });

      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0].name).toBe('light1');
    });

    it('should be case insensitive', () => {
      const { result } = renderHook(() => useSceneSearch());

      act(() => {
        result.current.setQuery('PLAYER');
      });

      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0].name).toBe('player');
    });

    it('should return all results with empty query', () => {
      const { result } = renderHook(() => useSceneSearch());

      act(() => {
        result.current.setQuery('');
      });

      expect(result.current.results).toHaveLength(4); // scene + 3 objects
    });

    it('should return no results for non-matching query', () => {
      const { result } = renderHook(() => useSceneSearch());

      act(() => {
        result.current.setQuery('nonexistent');
      });

      expect(result.current.results).toHaveLength(0);
    });

    it('should match partial names', () => {
      const { result } = renderHook(() => useSceneSearch());

      act(() => {
        result.current.setQuery('play');
      });

      expect(result.current.results).toHaveLength(1);
      expect(result.current.results[0].name).toBe('player');
    });
  });

  describe('Open/Close State', () => {
    it('should open search panel', () => {
      const { result } = renderHook(() => useSceneSearch());

      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('should close search panel', () => {
      const { result } = renderHook(() => useSceneSearch());

      act(() => {
        result.current.open();
      });

      act(() => {
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('should clear query on close', () => {
      const { result } = renderHook(() => useSceneSearch());

      act(() => {
        result.current.setQuery('test');
        result.current.close();
      });

      expect(result.current.query).toBe('');
    });
  });

  describe('Total Objects Count', () => {
    it('should count all objects including scenes', () => {
      mockCode = `scene "Main" {
}
object "box1" {
}
object "box2" {
}`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.totalObjects).toBe(3);
    });

    it('should not change when filtering', () => {
      mockCode = `object "box1" {
}
object "box2" {
}`;

      const { result } = renderHook(() => useSceneSearch());

      const totalBefore = result.current.totalObjects;

      act(() => {
        result.current.setQuery('box1');
      });

      expect(result.current.results).toHaveLength(1);
      expect(result.current.totalObjects).toBe(totalBefore);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty code', () => {
      mockCode = '';

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results).toEqual([]);
      expect(result.current.totalObjects).toBe(0);
    });

    it('should handle code with no declarations', () => {
      mockCode = `// Just a comment
const x = 10;`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results).toEqual([]);
    });

    it('should handle object with no traits', () => {
      mockCode = `object "empty" {
}`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results[0]).toMatchObject({
        name: 'empty',
        traits: [],
      });
    });

    it('should handle null code from store', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: null };
        return selector(state);
      });

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results).toEqual([]);
    });

    it('should truncate long snippets to 60 chars', () => {
      mockCode = `object "verylongobjectnamewithlotsofextracontentthatshouldbetruncated" {
}`;

      const { result } = renderHook(() => useSceneSearch());

      expect(result.current.results[0].snippet.length).toBeLessThanOrEqual(60);
    });

    it('should handle objects with malformed braces', () => {
      mockCode = `object "box1" {
  @transform(position: [0, 0, 0])
}
object "box2" {
  @material(color: "#ff0000")`;

      const { result } = renderHook(() => useSceneSearch());

      // Should parse box1 successfully
      expect(result.current.results.length).toBeGreaterThanOrEqual(1);
    });

    it('should memoize results when code does not change', () => {
      mockCode = `object "box1" {
}`;

      const { result, rerender } = renderHook(() => useSceneSearch());

      const firstResults = result.current.results;

      rerender();

      expect(result.current.results).toBe(firstResults);
    });

    it('should recompute when code changes', () => {
      mockCode = `object "box1" {
}`;

      const { result, rerender } = renderHook(() => useSceneSearch());

      const firstResults = result.current.results;

      mockCode = `object "box2" {
}`;

      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode };
        return selector(state);
      });

      rerender();

      expect(result.current.results).not.toBe(firstResults);
      expect(result.current.results[0].name).toBe('box2');
    });
  });
});
