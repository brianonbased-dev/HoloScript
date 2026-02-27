// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSceneOutliner } from '../useSceneOutliner';
import { useSceneStore, useEditorStore } from '@/lib/store';

vi.mock('@/lib/store', () => ({
  useSceneStore: vi.fn(),
  useEditorStore: vi.fn(),
}));

describe('useSceneOutliner', () => {
  let mockCode: string;
  let mockSelectedObjectId: string | null;

  beforeEach(() => {
    mockCode = '';
    mockSelectedObjectId = null;

    (useSceneStore as any).mockImplementation((selector: any) => {
      const state = { code: mockCode };
      return selector(state);
    });

    (useEditorStore as any).mockImplementation((selector: any) => {
      const state = { selectedObjectId: mockSelectedObjectId };
      return selector(state);
    });
  });

  describe('Initial State', () => {
    it('should return empty tree for empty code', () => {
      mockCode = '';

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree).toEqual([]);
    });

    it('should return empty allNodes for empty code', () => {
      mockCode = '';

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.allNodes).toEqual([]);
    });

    it('should return null selectedNode when no selection', () => {
      mockCode = `scene "Main" {
}`;
      mockSelectedObjectId = null;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.selectedNode).toBeNull();
    });
  });

  describe('Scene Parsing', () => {
    it('should parse scene node', () => {
      mockCode = `scene "Main" {
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree).toHaveLength(1);
      expect(result.current.tree[0]).toMatchObject({
        name: 'Main',
        type: 'scene',
        line: 1,
        depth: 0,
        traits: [],
        children: [],
      });
    });

    it('should assign unique id to scene node', () => {
      mockCode = `scene "Main" {
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree[0].id).toBe('node-1');
    });

    it('should parse multiple scenes', () => {
      mockCode = `scene "Scene1" {
}
scene "Scene2" {
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree).toHaveLength(2);
      expect(result.current.tree[0].name).toBe('Scene1');
      expect(result.current.tree[1].name).toBe('Scene2');
    });
  });

  describe('Object Parsing', () => {
    it('should parse object node', () => {
      mockCode = `object "box1" {
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree).toHaveLength(1);
      expect(result.current.tree[0]).toMatchObject({
        name: 'box1',
        type: 'object',
        line: 1,
      });
    });

    it('should collect traits from object', () => {
      mockCode = `object "box1" {
  @transform(position: [0, 0, 0])
  @material(color: "#ff0000")
  @physics(mass: 10)
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree[0].traits).toEqual([
        'transform',
        'material',
        'physics',
      ]);
    });

    it('should handle object without traits', () => {
      mockCode = `object "empty" {
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree[0].traits).toEqual([]);
    });
  });

  describe('Light/Camera/Group Parsing', () => {
    it('should detect light nodes', () => {
      mockCode = `light "sun" {
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree[0].type).toBe('light');
    });

    it('should detect camera nodes', () => {
      mockCode = `camera "main-cam" {
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree[0].type).toBe('camera');
    });

    it('should detect group nodes', () => {
      mockCode = `group "enemies" {
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree[0].type).toBe('group');
    });
  });

  describe('Nesting and Depth', () => {
    it('should parse nested objects', () => {
      mockCode = `scene "Main" {
  object "parent" {
    object "child" {
    }
  }
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree).toHaveLength(1);
      expect(result.current.tree[0].children).toHaveLength(1);
      expect(result.current.tree[0].children[0].children).toHaveLength(1);
    });

    it('should set correct depth for nested nodes', () => {
      mockCode = `scene "Main" {
  object "level1" {
    object "level2" {
      object "level3" {
      }
    }
  }
}`;

      const { result } = renderHook(() => useSceneOutliner());

      const scene = result.current.tree[0];
      const level1 = scene.children[0];
      const level2 = level1.children[0];
      const level3 = level2.children[0];

      expect(scene.depth).toBe(0);
      expect(level1.depth).toBe(1);
      expect(level2.depth).toBe(2);
      expect(level3.depth).toBe(3);
    });

    it('should handle multiple children at same level', () => {
      mockCode = `scene "Main" {
  object "child1" {
  }
  object "child2" {
  }
  object "child3" {
  }
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree[0].children).toHaveLength(3);
      expect(result.current.tree[0].children.map(c => c.name)).toEqual([
        'child1',
        'child2',
        'child3',
      ]);
    });
  });

  describe('Flattening (allNodes)', () => {
    it('should flatten nested structure into allNodes', () => {
      mockCode = `scene "Main" {
  object "parent" {
    object "child" {
    }
  }
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.allNodes).toHaveLength(3);
      expect(result.current.allNodes.map(n => n.name)).toEqual([
        'Main',
        'parent',
        'child',
      ]);
    });

    it('should include all nodes from multiple trees', () => {
      mockCode = `scene "Scene1" {
  object "obj1" {
  }
}
scene "Scene2" {
  object "obj2" {
  }
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.allNodes).toHaveLength(4);
    });
  });

  describe('Selection', () => {
    beforeEach(() => {
      mockCode = `scene "Main" {
  object "box1" {
  }
  object "box2" {
  }
}`;
    });

    it('should return selectedNode when selection matches', () => {
      mockSelectedObjectId = 'node-2';

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.selectedNode).not.toBeNull();
      expect(result.current.selectedNode?.name).toBe('box1');
    });

    it('should return null when selection does not match', () => {
      mockSelectedObjectId = 'non-existent-id';

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.selectedNode).toBeNull();
    });

  });

  describe('Line Numbers', () => {
    it('should track correct line numbers', () => {
      mockCode = `scene "Main" {
}
object "box1" {
}
object "box2" {
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.allNodes[0].line).toBe(1); // Main
      expect(result.current.allNodes[1].line).toBe(3); // box1
      expect(result.current.allNodes[2].line).toBe(5); // box2
    });

    it('should handle empty lines', () => {
      mockCode = `

scene "Main" {
}

object "box1" {
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree[0].line).toBe(3); // Main on line 3
      expect(result.current.tree[1].line).toBe(6); // box1 on line 6
    });
  });

  describe('Edge Cases', () => {
    it('should handle code with only whitespace', () => {
      mockCode = '   \n\t\n  ';

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree).toEqual([]);
    });

    it('should handle blocks without closing braces', () => {
      mockCode = `scene "Main" {
  object "box1" {
  }
  object "box2" {`;

      const { result } = renderHook(() => useSceneOutliner());

      // Should parse what it can
      expect(result.current.tree).toHaveLength(1);
      expect(result.current.tree[0].children).toHaveLength(2);
    });

    it('should handle extra closing braces', () => {
      mockCode = `scene "Main" {
}
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree).toHaveLength(1);
    });

    it('should handle inline opening brace', () => {
      mockCode = 'scene "Main" {';

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree[0].name).toBe('Main');
    });

    it('should handle block declaration without brace on same line', () => {
      mockCode = `scene "Main"
{
}`;

      const { result } = renderHook(() => useSceneOutliner());

      // Actually regex allows optional { so "scene Main" without brace will match
      expect(result.current.tree).toHaveLength(1);
      expect(result.current.tree[0].name).toBe('Main');
    });

    it('should ignore non-block lines', () => {
      mockCode = `// comment
scene "Main" {
  const x = 10;
  some random text;
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree).toHaveLength(1);
      expect(result.current.tree[0].name).toBe('Main');
    });

    it('should handle names with special characters', () => {
      mockCode = `object "box-1_v2.0" {
}`;

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree[0].name).toBe('box-1_v2.0');
    });

    it('should handle null code from store', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: null };
        return selector(state);
      });

      const { result } = renderHook(() => useSceneOutliner());

      expect(result.current.tree).toEqual([]);
    });

    it('should memoize tree when code does not change', () => {
      mockCode = `scene "Main" {
}`;

      const { result, rerender } = renderHook(() => useSceneOutliner());

      const firstTree = result.current.tree;

      rerender();

      expect(result.current.tree).toBe(firstTree);
    });

    it('should recompute tree when code changes', () => {
      mockCode = `scene "Main" {
}`;

      const { result, rerender } = renderHook(() => useSceneOutliner());

      const firstTree = result.current.tree;

      mockCode = `scene "Changed" {
}`;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: mockCode };
        return selector(state);
      });

      rerender();

      expect(result.current.tree).not.toBe(firstTree);
      expect(result.current.tree[0].name).toBe('Changed');
    });
  });
});
