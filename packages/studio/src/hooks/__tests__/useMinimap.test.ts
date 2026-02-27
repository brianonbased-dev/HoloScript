// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMinimap } from '../useMinimap';
import { useSceneStore } from '@/lib/store';

vi.mock('@/lib/store', () => ({
  useSceneStore: vi.fn(),
}));

describe('useMinimap', () => {
  let mockCode = '';

  beforeEach(() => {
    mockCode = '';
    (useSceneStore as any).mockImplementation((selector: any) => {
      const state = { code: mockCode };
      return selector(state);
    });
  });

  describe('Initial State', () => {
    it('should return empty objects array with no code', () => {
      mockCode = '';

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects).toEqual([]);
    });

    it('should return default bounds with no objects', () => {
      mockCode = '';

      const { result } = renderHook(() => useMinimap());

      expect(result.current.bounds).toEqual({
        minX: -10,
        maxX: 10,
        minZ: -10,
        maxZ: 10,
      });
    });
  });

  describe('Object Parsing', () => {
    it('should parse object with position', () => {
      mockCode = `
        object "box1" {
          @transform(position: [5, 2, 3])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects).toHaveLength(1);
      expect(result.current.objects[0]).toMatchObject({
        name: 'box1',
        x: 5,
        z: 3,
        type: 'object',
      });
    });

    it('should parse object with scale', () => {
      mockCode = `
        object "box1" {
          @transform(position: [0, 0, 0], scale: [2, 1, 3])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects[0].w).toBeCloseTo(1.6, 1); // 2 * 0.8
      expect(result.current.objects[0].h).toBeCloseTo(2.4, 1); // 3 * 0.8
    });

    it('should parse object with color', () => {
      mockCode = `
        object "box1" {
          @material(color: "#ff0000")
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects[0]).toMatchObject({
        color: '#ff0000',
      });
    });

    it('should use default color for objects without color', () => {
      mockCode = `
        object "box1" {
          @transform(position: [0, 0, 0])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects[0].color).toBe('#6688cc');
    });

    it('should parse multiple objects', () => {
      mockCode = `
        object "box1" {
          @transform(position: [1, 0, 2])
        }
        object "box2" {
          @transform(position: [3, 0, 4])
        }
        object "box3" {
          @transform(position: [5, 0, 6])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects).toHaveLength(3);
      expect(result.current.objects[0].name).toBe('box1');
      expect(result.current.objects[1].name).toBe('box2');
      expect(result.current.objects[2].name).toBe('box3');
    });
  });

  describe('Light Parsing', () => {
    it('should identify pointLight as light', () => {
      mockCode = `
        object "light1" {
          @pointLight(intensity: 1.0)
          @transform(position: [0, 5, 0])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects[0]).toMatchObject({
        name: 'light1',
        type: 'light',
        color: '#ffee44',
      });
    });

    it('should identify directionalLight as light', () => {
      mockCode = `
        object "sun" {
          @directionalLight(intensity: 2.0)
          @transform(position: [0, 10, 0])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects[0]).toMatchObject({
        type: 'light',
        color: '#ffee44',
      });
    });

    it('should identify spotLight as light', () => {
      mockCode = `
        object "spot" {
          @spotLight(angle: 45)
          @transform(position: [0, 5, 0])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects[0]).toMatchObject({
        type: 'light',
        color: '#ffee44',
      });
    });
  });

  describe('Default Values', () => {
    it('should use default position when not specified', () => {
      mockCode = `
        object "box1" {
          @material(color: "#ff0000")
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects[0]).toMatchObject({
        x: 0,
        z: 0,
      });
    });

    it('should use default scale when not specified', () => {
      mockCode = `
        object "box1" {
          @transform(position: [1, 2, 3])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      // When no scale is specified, parseArr returns [0, 0, 0], resulting in minimum scale
      expect(result.current.objects[0]).toMatchObject({
        w: 0.2, // Math.max(0.2, 0 * 0.8)
        h: 0.2, // Math.max(0.2, 0 * 0.8)
      });
    });

    it('should enforce minimum scale of 0.2', () => {
      mockCode = `
        object "box1" {
          @transform(scale: [0.1, 0.1, 0.1])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects[0]).toMatchObject({
        w: 0.2,
        h: 0.2,
      });
    });
  });

  describe('Bounds Calculation', () => {
    it('should calculate bounds for single object', () => {
      mockCode = `
        object "box1" {
          @transform(position: [10, 0, 20], scale: [2, 1, 4])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      // Object at x=10, z=20, w=1.6, h=3.2
      // Bounds: x ± w/2, z ± h/2, + 3 padding
      expect(result.current.bounds.minX).toBeLessThan(10);
      expect(result.current.bounds.maxX).toBeGreaterThan(10);
      expect(result.current.bounds.minZ).toBeLessThan(20);
      expect(result.current.bounds.maxZ).toBeGreaterThan(20);
    });

    it('should calculate bounds for multiple objects', () => {
      mockCode = `
        object "box1" {
          @transform(position: [0, 0, 0])
        }
        object "box2" {
          @transform(position: [10, 0, 10])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.bounds.minX).toBeLessThan(0);
      expect(result.current.bounds.maxX).toBeGreaterThan(10);
      expect(result.current.bounds.minZ).toBeLessThan(0);
      expect(result.current.bounds.maxZ).toBeGreaterThan(10);
    });

    it('should include padding in bounds', () => {
      mockCode = `
        object "box1" {
          @transform(position: [5, 0, 5], scale: [1, 1, 1])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      // 3 units of padding
      const pad = 3;
      expect(result.current.bounds.minX).toBeLessThanOrEqual(5 - 0.4 - pad);
      expect(result.current.bounds.maxX).toBeGreaterThanOrEqual(5 + 0.4 + pad);
    });
  });

  describe('Edge Cases', () => {
    it('should handle object with no traits', () => {
      mockCode = `
        object "empty" {
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects).toHaveLength(1);
      expect(result.current.objects[0]).toMatchObject({
        name: 'empty',
        x: 0,
        z: 0,
        color: '#6688cc',
      });
    });

    it('should handle malformed position values', () => {
      mockCode = `
        object "box1" {
          @transform(position: [abc, def, ghi])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects[0]).toMatchObject({
        x: 0,
        z: 0,
      });
    });

    it('should handle incomplete position arrays', () => {
      mockCode = `
        object "box1" {
          @transform(position: [5])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects[0]).toMatchObject({
        x: 5,
        z: 0,
      });
    });

    it('should handle null code from store', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: null };
        return selector(state);
      });

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects).toEqual([]);
    });

    it('should handle code with no object declarations', () => {
      mockCode = `
        scene Main {
          background(#000000);
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects).toEqual([]);
    });

    it('should handle nested braces in object body', () => {
      mockCode = `
        object "complex" {
          @transform(position: [1, 2, 3])
          @custom({ nested: { value: 10 } })
        }
      `;

      const { result } = renderHook(() => useMinimap());

      expect(result.current.objects).toHaveLength(1);
      expect(result.current.objects[0].name).toBe('complex');
    });

    it('should handle objects with both light and color', () => {
      mockCode = `
        object "coloredLight" {
          @pointLight(intensity: 1.0)
          @material(color: "#00ff00")
          @transform(position: [0, 5, 0])
        }
      `;

      const { result } = renderHook(() => useMinimap());

      // Material color takes precedence over light color
      expect(result.current.objects[0]).toMatchObject({
        type: 'light',
        color: '#00ff00', // Material color used, not light default
      });
    });

    it('should memoize results when code does not change', () => {
      mockCode = `
        object "box1" {
          @transform(position: [1, 0, 2])
        }
      `;

      const { result, rerender } = renderHook(() => useMinimap());

      const firstObjects = result.current.objects;
      const firstBounds = result.current.bounds;

      rerender();

      expect(result.current.objects).toBe(firstObjects);
      expect(result.current.bounds).toBe(firstBounds);
    });

    it('should recompute when code changes', () => {
      mockCode = `
        object "box1" {
          @transform(position: [1, 0, 2])
        }
      `;

      const { result, rerender } = renderHook(() => useMinimap());

      const firstObjects = result.current.objects;

      mockCode = `
        object "box2" {
          @transform(position: [3, 0, 4])
        }
      `;

      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode };
        return selector(state);
      });

      rerender();

      expect(result.current.objects).not.toBe(firstObjects);
      expect(result.current.objects[0].name).toBe('box2');
    });
  });
});
