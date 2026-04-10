/**
 * Tests for BrittneyTools — scene manipulation tools + executeTool
 */

import { describe, it, expect, vi } from 'vitest';
import { BRITTNEY_TOOLS, executeTool } from '../BrittneyTools';
import type { ToolResult } from '../BrittneyTools';
import type { SceneNode, TraitConfig } from '@/lib/stores';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: 'node-1',
    name: 'TestCube',
    type: 'mesh',
    parentId: null,
    traits: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...overrides,
  };
}

function makeStore(nodes: SceneNode[] = [], code = '') {
  let currentCode = code;
  return {
    nodes,
    addTrait: vi.fn((nodeId: string, trait: TraitConfig) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) node.traits.push(trait);
    }),
    removeTrait: vi.fn((nodeId: string, traitName: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) node.traits = node.traits.filter((t) => t.name !== traitName);
    }),
    setTraitProperty: vi.fn(),
    addNode: vi.fn((node: SceneNode) => nodes.push(node)),
    removeNode: vi.fn((id: string) => {
      const idx = nodes.findIndex((n) => n.id === id);
      if (idx >= 0) nodes.splice(idx, 1);
    }),
    updateNode: vi.fn((id: string, patch: Partial<SceneNode>) => {
      const node = nodes.find((n) => n.id === id);
      if (node) Object.assign(node, patch);
    }),
    getCode: () => currentCode,
    setCode: (c: string) => { currentCode = c; },
  };
}

// ─── Tool schema definitions ────────────────────────────────────────────────

describe('BRITTNEY_TOOLS schema', () => {
  it('has at least 14 tools (6 original + 8 new)', () => {
    expect(BRITTNEY_TOOLS.length).toBeGreaterThanOrEqual(14);
  });

  it('all tool names are unique', () => {
    const names = BRITTNEY_TOOLS.map((t) => t.function.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('includes all 8 new scene tools', () => {
    const names = BRITTNEY_TOOLS.map((t) => t.function.name);
    const expected = [
      'delete_object',
      'move_object',
      'rotate_object',
      'scale_object',
      'rename_object',
      'duplicate_object',
      'list_objects',
      'get_object',
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('every tool has correct structure', () => {
    for (const tool of BRITTNEY_TOOLS) {
      expect(tool.type).toBe('function');
      expect(typeof tool.function.name).toBe('string');
      expect(typeof tool.function.description).toBe('string');
      expect(tool.function.parameters.type).toBe('object');
    }
  });

  it('tool names use underscore convention', () => {
    for (const tool of BRITTNEY_TOOLS) {
      expect(tool.function.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

// ─── delete_object ──────────────────────────────────────────────────────────

describe('executeTool: delete_object', () => {
  it('removes an existing object', () => {
    const node = makeNode();
    const store = makeStore([node], 'object "TestCube" {\n  position: [0, 0, 0]\n}');
    const result = executeTool('delete_object', { object_name: 'TestCube' }, store);
    expect(result.success).toBe(true);
    expect(store.removeNode).toHaveBeenCalledWith('node-1');
    expect(store.getCode()).not.toContain('TestCube');
  });

  it('returns error for missing object', () => {
    const store = makeStore([], '');
    const result = executeTool('delete_object', { object_name: 'NonExistent' }, store);
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('matches object name case-insensitively', () => {
    const node = makeNode({ name: 'MyCube' });
    const store = makeStore([node], 'object "MyCube" {\n}');
    const result = executeTool('delete_object', { object_name: 'mycube' }, store);
    expect(result.success).toBe(true);
  });
});

// ─── move_object ────────────────────────────────────────────────────────────

describe('executeTool: move_object', () => {
  it('updates position in store and code', () => {
    const node = makeNode();
    const store = makeStore([node], 'object "TestCube" {\n  position: [0, 0, 0]\n}');
    const result = executeTool('move_object', { object_name: 'TestCube', position: [1, 2, 3] }, store);
    expect(result.success).toBe(true);
    expect(store.updateNode).toHaveBeenCalledWith('node-1', { position: [1, 2, 3] });
    expect(store.getCode()).toContain('position: [1, 2, 3]');
  });

  it('inserts position line if missing', () => {
    const node = makeNode();
    const store = makeStore([node], 'object "TestCube" {\n}');
    const result = executeTool('move_object', { object_name: 'TestCube', position: [5, 0, 5] }, store);
    expect(result.success).toBe(true);
    expect(store.getCode()).toContain('position: [5, 0, 5]');
  });

  it('returns error for missing object', () => {
    const store = makeStore([], '');
    const result = executeTool('move_object', { object_name: 'Ghost', position: [0, 0, 0] }, store);
    expect(result.success).toBe(false);
  });
});

// ─── rotate_object ──────────────────────────────────────────────────────────

describe('executeTool: rotate_object', () => {
  it('updates rotation in store and code', () => {
    const node = makeNode();
    const store = makeStore([node], 'object "TestCube" {\n  rotation: [0, 0, 0]\n}');
    const result = executeTool('rotate_object', { object_name: 'TestCube', rotation: [1.57, 0, 0] }, store);
    expect(result.success).toBe(true);
    expect(store.updateNode).toHaveBeenCalledWith('node-1', { rotation: [1.57, 0, 0] });
    expect(store.getCode()).toContain('rotation: [1.57, 0, 0]');
  });

  it('returns error for missing object', () => {
    const store = makeStore([], '');
    const result = executeTool('rotate_object', { object_name: 'Ghost', rotation: [0, 0, 0] }, store);
    expect(result.success).toBe(false);
  });
});

// ─── scale_object ───────────────────────────────────────────────────────────

describe('executeTool: scale_object', () => {
  it('updates scale in store and code', () => {
    const node = makeNode();
    const store = makeStore([node], 'object "TestCube" {\n  scale: [1, 1, 1]\n}');
    const result = executeTool('scale_object', { object_name: 'TestCube', scale: [2, 2, 2] }, store);
    expect(result.success).toBe(true);
    expect(store.updateNode).toHaveBeenCalledWith('node-1', { scale: [2, 2, 2] });
    expect(store.getCode()).toContain('scale: [2, 2, 2]');
  });

  it('returns error for missing object', () => {
    const store = makeStore([], '');
    const result = executeTool('scale_object', { object_name: 'Ghost', scale: [1, 1, 1] }, store);
    expect(result.success).toBe(false);
  });
});

// ─── rename_object ──────────────────────────────────────────────────────────

describe('executeTool: rename_object', () => {
  it('renames in store and code', () => {
    const node = makeNode({ name: 'OldName' });
    const store = makeStore([node], 'object "OldName" {\n}');
    const result = executeTool('rename_object', { object_name: 'OldName', new_name: 'NewName' }, store);
    expect(result.success).toBe(true);
    expect(store.updateNode).toHaveBeenCalledWith('node-1', { name: 'NewName' });
    expect(store.getCode()).toContain('"NewName"');
    expect(store.getCode()).not.toContain('"OldName"');
  });

  it('returns error for missing object', () => {
    const store = makeStore([], '');
    const result = executeTool('rename_object', { object_name: 'Ghost', new_name: 'Friendly' }, store);
    expect(result.success).toBe(false);
  });
});

// ─── duplicate_object ───────────────────────────────────────────────────────

describe('executeTool: duplicate_object', () => {
  it('clones an existing object with new name', () => {
    const node = makeNode({
      name: 'Original',
      traits: [{ name: 'physics', properties: { mass: 10 } }],
      position: [1, 2, 3],
    });
    const store = makeStore([node], 'object "Original" {\n  position: [1, 2, 3]\n  @physics {\n    mass: 10\n  }\n}');
    const result = executeTool('duplicate_object', { object_name: 'Original', new_name: 'Clone' }, store);
    expect(result.success).toBe(true);
    expect(store.addNode).toHaveBeenCalledTimes(1);
    const addedNode = (store.addNode as ReturnType<typeof vi.fn>).mock.calls[0][0] as SceneNode;
    expect(addedNode.name).toBe('Clone');
    expect(addedNode.position).toEqual([1, 2, 3]);
    expect(addedNode.traits).toHaveLength(1);
    expect(addedNode.traits[0].name).toBe('physics');
    // Code should contain new object
    expect(store.getCode()).toContain('"Clone"');
  });

  it('returns error for missing object', () => {
    const store = makeStore([], '');
    const result = executeTool('duplicate_object', { object_name: 'Ghost', new_name: 'Clone' }, store);
    expect(result.success).toBe(false);
  });

  it('deep-copies traits so mutations are independent', () => {
    const node = makeNode({
      traits: [{ name: 'glow', properties: { intensity: 5 } }],
    });
    const store = makeStore([node], 'object "TestCube" {\n  @glow {\n    intensity: 5\n  }\n}');
    executeTool('duplicate_object', { object_name: 'TestCube', new_name: 'Clone' }, store);
    const addedNode = (store.addNode as ReturnType<typeof vi.fn>).mock.calls[0][0] as SceneNode;
    // Mutate clone trait — original should be unchanged
    addedNode.traits[0].properties.intensity = 99;
    expect(node.traits[0].properties.intensity).toBe(5);
  });
});

// ─── list_objects ───────────────────────────────────────────────────────────

describe('executeTool: list_objects', () => {
  it('returns all scene objects', () => {
    const nodes = [
      makeNode({ id: 'a', name: 'Cube', type: 'mesh', position: [0, 0, 0] }),
      makeNode({ id: 'b', name: 'Light1', type: 'light', position: [0, 5, 0], traits: [{ name: 'point_light', properties: {} }] }),
    ];
    const store = makeStore(nodes, '');
    const result = executeTool('list_objects', {}, store);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.message) as Array<{ name: string; type: string; traits: string[]; position: number[] }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('Cube');
    expect(parsed[1].name).toBe('Light1');
    expect(parsed[1].traits).toEqual(['point_light']);
  });

  it('returns empty array when scene is empty', () => {
    const store = makeStore([], '');
    const result = executeTool('list_objects', {}, store);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.message) as unknown[];
    expect(parsed).toEqual([]);
  });
});

// ─── get_object ─────────────────────────────────────────────────────────────

describe('executeTool: get_object', () => {
  it('returns full object details', () => {
    const node = makeNode({
      name: 'MyCube',
      type: 'mesh',
      position: [1, 2, 3],
      rotation: [0.5, 0, 0],
      scale: [2, 2, 2],
      traits: [{ name: 'physics', properties: { mass: 5 } }],
    });
    const store = makeStore([node], '');
    const result = executeTool('get_object', { object_name: 'MyCube' }, store);
    expect(result.success).toBe(true);
    const detail = JSON.parse(result.message) as {
      name: string;
      type: string;
      traits: TraitConfig[];
      position: number[];
      rotation: number[];
      scale: number[];
    };
    expect(detail.name).toBe('MyCube');
    expect(detail.type).toBe('mesh');
    expect(detail.position).toEqual([1, 2, 3]);
    expect(detail.rotation).toEqual([0.5, 0, 0]);
    expect(detail.scale).toEqual([2, 2, 2]);
    expect(detail.traits).toHaveLength(1);
    expect(detail.traits[0].name).toBe('physics');
  });

  it('returns error for missing object', () => {
    const store = makeStore([], '');
    const result = executeTool('get_object', { object_name: 'Ghost' }, store);
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('matches case-insensitively', () => {
    const node = makeNode({ name: 'MyLight' });
    const store = makeStore([node], '');
    const result = executeTool('get_object', { object_name: 'mylight' }, store);
    expect(result.success).toBe(true);
  });
});

// ─── Existing tools still work ──────────────────────────────────────────────

describe('executeTool: existing tools regression', () => {
  it('create_object still works', () => {
    const store = makeStore([], '');
    const result = executeTool('create_object', { name: 'Sphere', type: 'mesh', position: [0, 1, 0] }, store);
    expect(result.success).toBe(true);
    expect(store.addNode).toHaveBeenCalledTimes(1);
    expect(store.getCode()).toContain('"Sphere"');
  });

  it('add_trait still works', () => {
    const node = makeNode();
    const store = makeStore([node], 'object "TestCube" {\n}');
    const result = executeTool('add_trait', { object_name: 'TestCube', trait_name: 'physics', properties: { mass: 1 } }, store);
    expect(result.success).toBe(true);
    expect(store.addTrait).toHaveBeenCalled();
  });

  it('unknown tool returns error', () => {
    const store = makeStore([], '');
    const result = executeTool('nonexistent_tool', {}, store);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown tool');
  });
});
