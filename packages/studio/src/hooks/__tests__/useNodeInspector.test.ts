// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNodeInspector } from '../useNodeInspector';
import { useSceneStore } from '@/lib/stores';

vi.mock('@/lib/stores', () => ({
  useSceneStore: vi.fn(),
}));

describe('useNodeInspector', () => {
  let mockCode: string;
  let mockSetCode: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCode = '';
    mockSetCode = vi.fn((newCode) => {
      mockCode = newCode;
    });

    (useSceneStore as any).mockImplementation((selector: any) => {
      const state = { code: mockCode, setCode: mockSetCode };
      return selector(state);
    });
  });

  describe('Initial State', () => {
    it('should return null when objectName is null', () => {
      const { result } = renderHook(() => useNodeInspector(null));

      expect(result.current.objectName).toBeNull();
      expect(result.current.objectType).toBeNull();
      expect(result.current.groups).toEqual([]);
      expect(result.current.lineRange).toBeNull();
    });

    it('should return null when object not found', () => {
      mockCode = 'scene "Main" {\n}';
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('nonexistent'));

      expect(result.current.objectName).toBe('nonexistent');
      expect(result.current.groups).toEqual([]);
      expect(result.current.lineRange).toBeNull();
    });

    it('should return empty groups for object without traits', () => {
      mockCode = `object "box1" {
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      expect(result.current.objectType).toBe('object');
      expect(result.current.groups).toEqual([]);
    });
  });

  describe('Object Block Parsing', () => {
    it('should find object block with line range', () => {
      mockCode = `scene "Main" {
}
object "box1" {
  @transform {
    position: [0, 0, 0]
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      expect(result.current.lineRange).toEqual([3, 7]);
    });

    it('should detect object type correctly', () => {
      mockCode = `scene "Main" {
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('Main'));

      expect(result.current.objectType).toBe('scene');
    });

    it('should detect group type correctly', () => {
      mockCode = `group "enemies" {
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('enemies'));

      expect(result.current.objectType).toBe('group');
    });
  });

  describe('Transform Trait Parsing', () => {
    it('should parse transform position', () => {
      mockCode = `object "box1" {
  @transform {
    position: [10, 20, 30]
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      expect(result.current.groups).toHaveLength(1);
      expect(result.current.groups[0].trait).toBe('transform');
      const positionProp = result.current.groups[0].props.find((p) => p.key === 'position');
      expect(positionProp?.value).toEqual([10, 20, 30]);
    });

    it('should parse transform rotation', () => {
      mockCode = `object "box1" {
  @transform {
    rotation: [45, 90, 180]
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      const rotationProp = result.current.groups[0].props.find((p) => p.key === 'rotation');
      expect(rotationProp?.value).toEqual([45, 90, 180]);
      expect(rotationProp?.min).toBe(-360);
      expect(rotationProp?.max).toBe(360);
    });

    it('should parse transform scale', () => {
      mockCode = `object "box1" {
  @transform {
    scale: [2, 2, 2]
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      const scaleProp = result.current.groups[0].props.find((p) => p.key === 'scale');
      expect(scaleProp?.value).toEqual([2, 2, 2]);
    });

    it('should use default values for missing transform properties', () => {
      mockCode = `object "box1" {
  @transform {
    position: [1, 2, 3]
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      const rotationProp = result.current.groups[0].props.find((p) => p.key === 'rotation');
      const scaleProp = result.current.groups[0].props.find((p) => p.key === 'scale');
      expect(rotationProp?.value).toEqual([0, 0, 0]);
      expect(scaleProp?.value).toEqual([0, 0, 0]);
    });
  });

  describe('Material Trait Parsing', () => {
    it('should parse material albedo color', () => {
      mockCode = `object "box1" {
  @material {
    albedo: "#ff0000"
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      const materialGroup = result.current.groups.find((g) => g.trait === 'material');
      const albedoProp = materialGroup?.props.find((p) => p.key === 'albedo');
      expect(albedoProp?.value).toBe('#ff0000');
      expect(albedoProp?.type).toBe('color');
    });

    it('should parse material metallic and roughness', () => {
      mockCode = `object "box1" {
  @material {
    metallic: 0.8
    roughness: 0.3
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      const materialGroup = result.current.groups.find((g) => g.trait === 'material');
      const metallicProp = materialGroup?.props.find((p) => p.key === 'metallic');
      const roughnessProp = materialGroup?.props.find((p) => p.key === 'roughness');
      expect(metallicProp?.value).toBe(0.8);
      expect(roughnessProp?.value).toBe(0.3);
    });

    it('should parse material opacity', () => {
      mockCode = `object "box1" {
  @material {
    opacity: 0.5
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      const materialGroup = result.current.groups.find((g) => g.trait === 'material');
      const opacityProp = materialGroup?.props.find((p) => p.key === 'opacity');
      expect(opacityProp?.value).toBe(0.5);
    });
  });

  describe('Light Trait Parsing', () => {
    it('should parse light type enum', () => {
      mockCode = `light "sun" {
  @light {
    type: "directional"
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('sun'));

      const lightGroup = result.current.groups.find((g) => g.trait === 'light');
      const typeProp = lightGroup?.props.find((p) => p.key === 'type');
      expect(typeProp?.value).toBe('directional');
      expect(typeProp?.type).toBe('enum');
      expect(typeProp?.options).toContain('directional');
    });

    it('should parse light color and intensity', () => {
      mockCode = `light "lamp" {
  @light {
    color: "#ffffff"
    intensity: 5.5
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('lamp'));

      const lightGroup = result.current.groups.find((g) => g.trait === 'light');
      const colorProp = lightGroup?.props.find((p) => p.key === 'color');
      const intensityProp = lightGroup?.props.find((p) => p.key === 'intensity');
      expect(colorProp?.value).toBe('#ffffff');
      expect(intensityProp?.value).toBe(5.5);
    });

    it('should parse light castShadow boolean', () => {
      mockCode = `light "spot" {
  @light {
    castShadow: true
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('spot'));

      const lightGroup = result.current.groups.find((g) => g.trait === 'light');
      const castShadowProp = lightGroup?.props.find((p) => p.key === 'castShadow');
      expect(castShadowProp?.value).toBe(true);
      expect(castShadowProp?.type).toBe('boolean');
    });
  });

  describe('Physics Trait Parsing', () => {
    it('should parse physics type', () => {
      mockCode = `object "crate" {
  @physics {
    type: "dynamic"
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('crate'));

      const physicsGroup = result.current.groups.find((g) => g.trait === 'physics');
      const typeProp = physicsGroup?.props.find((p) => p.key === 'type');
      expect(typeProp?.value).toBe('dynamic');
    });

    it('should parse physics mass', () => {
      mockCode = `object "boulder" {
  @physics {
    mass: 150.5
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('boulder'));

      const physicsGroup = result.current.groups.find((g) => g.trait === 'physics');
      const massProp = physicsGroup?.props.find((p) => p.key === 'mass');
      expect(massProp?.value).toBe(150.5);
    });
  });

  describe('Multiple Traits', () => {
    it('should parse multiple traits in same object', () => {
      mockCode = `object "box1" {
  @transform {
    position: [0, 0, 0]
  }
  @material {
    albedo: "#ff0000"
  }
  @physics {
    mass: 10
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      expect(result.current.groups).toHaveLength(3);
      expect(result.current.groups.map((g) => g.trait)).toEqual(
        expect.arrayContaining(['transform', 'material', 'physics'])
      );
    });

    it('should include trait icons and labels', () => {
      mockCode = `object "box1" {
  @transform {
    position: [0, 0, 0]
  }
  @material {
    albedo: "#ffffff"
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      const transformGroup = result.current.groups.find((g) => g.trait === 'transform');
      const materialGroup = result.current.groups.find((g) => g.trait === 'material');
      expect(transformGroup?.label).toBe('Transform');
      expect(transformGroup?.icon).toBe('↔');
      expect(materialGroup?.label).toBe('Material');
      expect(materialGroup?.icon).toBe('🎨');
    });
  });

  describe('setProperty Function', () => {
    it('should update existing property value', () => {
      mockCode = `object "box1" {
  @transform {
    position: [0, 0, 0]
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      act(() => {
        result.current.setProperty('transform', 'position', [10, 20, 30]);
      });

      expect(mockSetCode).toHaveBeenCalled();
      const newCode = mockSetCode.mock.calls[0][0];
      expect(newCode).toContain('position: [10.000, 20.000, 30.000]');
    });

    it('should format vec3 values correctly', () => {
      mockCode = `object "box1" {
  @transform {
    scale: [1, 1, 1]
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      act(() => {
        result.current.setProperty('transform', 'scale', [2.5, 2.5, 2.5]);
      });

      const newCode = mockSetCode.mock.calls[0][0];
      expect(newCode).toContain('[2.500, 2.500, 2.500]');
    });

    it('should format color values with quotes', () => {
      mockCode = `object "box1" {
  @material {
    albedo: "#000000"
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      act(() => {
        result.current.setProperty('material', 'albedo', '#ff0000');
      });

      const newCode = mockSetCode.mock.calls[0][0];
      expect(newCode).toContain('albedo: "#ff0000"');
    });

    it('should format boolean values without quotes', () => {
      mockCode = `light "lamp" {
  @light {
    castShadow: false
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('lamp'));

      act(() => {
        result.current.setProperty('light', 'castShadow', true);
      });

      const newCode = mockSetCode.mock.calls[0][0];
      expect(newCode).toContain('castShadow: true');
    });

    it('should format float values without quotes', () => {
      mockCode = `object "box1" {
  @material {
    metallic: 0.0
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      act(() => {
        result.current.setProperty('material', 'metallic', 0.75);
      });

      const newCode = mockSetCode.mock.calls[0][0];
      expect(newCode).toContain('metallic: 0.75');
    });

    it('should not modify code when objectName is null', () => {
      mockCode = 'object "box1" {}';
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector(null));

      act(() => {
        result.current.setProperty('transform', 'position', [1, 2, 3]);
      });

      expect(mockSetCode).not.toHaveBeenCalled();
    });

    it('should not modify code for unknown trait', () => {
      mockCode = 'object "box1" {}';
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      act(() => {
        result.current.setProperty('unknownTrait', 'prop', 'value');
      });

      expect(mockSetCode).not.toHaveBeenCalled();
    });

    it('should not modify code for unknown property key', () => {
      mockCode = `object "box1" {
  @transform {}
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      act(() => {
        result.current.setProperty('transform', 'unknownProp', 123);
      });

      expect(mockSetCode).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty code', () => {
      mockCode = '';
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      expect(result.current.groups).toEqual([]);
      expect(result.current.lineRange).toBeNull();
    });

    it('should handle null code from store', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: null, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      expect(result.current.groups).toEqual([]);
    });

    it('should handle malformed trait syntax', () => {
      mockCode = `object "box1" {
  @transform
    position [0, 0, 0]
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box1'));

      // Should not crash, may return empty groups
      expect(Array.isArray(result.current.groups)).toBe(true);
    });

    it('should handle object names with special characters', () => {
      mockCode = `object "box-1_v2.0" {
  @transform {
    position: [0, 0, 0]
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result } = renderHook(() => useNodeInspector('box-1_v2.0'));

      expect(result.current.groups).toHaveLength(1);
    });

    it('should memoize parsed result when code does not change', () => {
      mockCode = `object "box1" {
  @transform {
    position: [0, 0, 0]
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result, rerender } = renderHook(() => useNodeInspector('box1'));

      const firstGroups = result.current.groups;

      rerender();

      expect(result.current.groups).toBe(firstGroups);
    });

    it('should recompute when objectName changes', () => {
      mockCode = `object "box1" {
  @transform {
    position: [1, 0, 0]
  }
}
object "box2" {
  @transform {
    position: [2, 0, 0]
  }
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode, setCode: mockSetCode };
        return selector(state);
      });

      const { result, rerender } = renderHook(({ name }) => useNodeInspector(name), {
        initialProps: { name: 'box1' },
      });

      expect(result.current.groups).toHaveLength(1);
      const box1Pos = result.current.groups[0].props.find((p) => p.key === 'position')?.value;
      expect(box1Pos).toEqual([1, 0, 0]);

      rerender({ name: 'box2' });

      expect(result.current.groups).toHaveLength(1);
      const box2Pos = result.current.groups[0].props.find((p) => p.key === 'position')?.value;
      expect(box2Pos).toEqual([2, 0, 0]);
    });
  });
});
