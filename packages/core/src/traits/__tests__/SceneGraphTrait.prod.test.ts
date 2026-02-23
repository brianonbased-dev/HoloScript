/**
 * SceneGraphTrait — Production Test Suite
 *
 * sceneGraphHandler stores state on node.__sceneGraphState.
 *
 * Key behaviours:
 * 1. defaultConfig — 6 fields
 * 2. onAttach — registers root node with identity transform, emits scene_graph_init
 * 3. onDetach — emits scene_graph_destroy, removes state
 * 4. onUpdate — no-op when !isDirty; when isDirty: recalculates nodeCount+depth,
 *               clears dirty, emits scene_graph_updated
 * 5. onEvent — add_node: adds to Map + parent children array, sets dirty, emits on_node_added;
 *              skip_existing: ignores duplicate ids;
 *              replace: removes old first then adds
 *              remove_node: recursive removal, dirty
 *              reparent: moves node to new parent, dirty
 *              set_transform: updates position/rotation/scale, emits scene_graph_transform_updated
 *              get_children: emits scene_graph_children_result
 *              export: emits scene_graph_generate_export with all nodes
 *              import: bulk-adds nodes, dirty, emits on_scene_composed
 *              query: emits scene_graph_info snapshot
 */
import { describe, it, expect, vi } from 'vitest';
import { sceneGraphHandler } from '../SceneGraphTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(id = 'root_node') {
  return { id, properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof sceneGraphHandler.defaultConfig> = {}, nodeId = 'root_node') {
  const node = makeNode(nodeId);
  const ctx = makeCtx();
  const config = { ...sceneGraphHandler.defaultConfig!, ...cfg };
  sceneGraphHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

function addNode(node: any, ctx: any, config: any, childId: string, parentId?: string) {
  sceneGraphHandler.onEvent!(node, config, ctx, { type: 'scene_graph_add_node', childId, parentId });
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('sceneGraphHandler.defaultConfig', () => {
  const d = sceneGraphHandler.defaultConfig!;
  it('root_node=""', () => expect(d.root_node).toBe(''));
  it('instancing=true', () => expect(d.instancing).toBe(true));
  it('merge_strategy=merge', () => expect(d.merge_strategy).toBe('merge'));
  it('coordinate_system=y_up', () => expect(d.coordinate_system).toBe('y_up'));
  it('unit_scale=1.0', () => expect(d.unit_scale).toBe(1.0));
  it('flatten_on_export=false', () => expect(d.flatten_on_export).toBe(false));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('sceneGraphHandler.onAttach', () => {
  it('initialises __sceneGraphState', () => {
    const { node } = attach();
    expect((node as any).__sceneGraphState).toBeDefined();
  });

  it('rootId=node.id', () => {
    const { node } = attach({}, 'my_root');
    expect((node as any).__sceneGraphState.rootId).toBe('my_root');
  });

  it('nodeCount=1 (self)', () => {
    const { node } = attach();
    expect((node as any).__sceneGraphState.nodeCount).toBe(1);
  });

  it('isDirty=false initially', () => {
    const { node } = attach();
    expect((node as any).__sceneGraphState.isDirty).toBe(false);
  });

  it('root node registered in nodes Map', () => {
    const { node } = attach({}, 'root_node');
    const state = (node as any).__sceneGraphState;
    expect(state.nodes.has('root_node')).toBe(true);
  });

  it('root node has identity transform', () => {
    const { node } = attach({}, 'root_node');
    const rootSG = (node as any).__sceneGraphState.nodes.get('root_node');
    expect(rootSG.localTransform.position).toEqual([0, 0, 0]);
    expect(rootSG.localTransform.rotation).toEqual([0, 0, 0, 1]);
    expect(rootSG.localTransform.scale).toEqual([1, 1, 1]);
  });

  it('root node name uses config.root_node if set', () => {
    const { node } = attach({ root_node: 'MyRoot' }, 'root_node');
    const rootSG = (node as any).__sceneGraphState.nodes.get('root_node');
    expect(rootSG.name).toBe('MyRoot');
  });

  it('emits scene_graph_init with coordinateSystem', () => {
    const { ctx } = attach({ coordinate_system: 'z_up' });
    expect(ctx.emit).toHaveBeenCalledWith('scene_graph_init', expect.objectContaining({ coordinateSystem: 'z_up' }));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('sceneGraphHandler.onDetach', () => {
  it('emits scene_graph_destroy', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    sceneGraphHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('scene_graph_destroy', expect.any(Object));
  });

  it('removes __sceneGraphState', () => {
    const { node, ctx, config } = attach();
    sceneGraphHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__sceneGraphState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('sceneGraphHandler.onUpdate', () => {
  it('no-op when isDirty=false', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    sceneGraphHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('clears isDirty and emits scene_graph_updated', () => {
    const { node, ctx, config } = attach();
    (node as any).__sceneGraphState.isDirty = true;
    ctx.emit.mockClear();
    sceneGraphHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node as any).__sceneGraphState.isDirty).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('scene_graph_updated', expect.objectContaining({ nodeCount: 1 }));
  });

  it('recalculates nodeCount after add_node', () => {
    const { node, ctx, config } = attach();
    addNode(node as any, ctx, config, 'child1');
    ctx.emit.mockClear();
    sceneGraphHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    // root + child1 = 2 nodes
    const call = ctx.emit.mock.calls.find(([ev]: string[]) => ev === 'scene_graph_updated');
    expect(call![1].nodeCount).toBe(2);
  });

  it('recalculates depth=1 after adding one child', () => {
    const { node, ctx, config } = attach();
    addNode(node as any, ctx, config, 'child1');
    sceneGraphHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node as any).__sceneGraphState.depth).toBe(1);
  });

  it('recalculates depth=2 for root→child→grandchild', () => {
    const { node, ctx, config } = attach();
    addNode(node as any, ctx, config, 'child1', 'root_node');
    addNode(node as any, ctx, config, 'grandchild1', 'child1');
    sceneGraphHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node as any).__sceneGraphState.depth).toBe(2);
  });
});

// ─── onEvent — add_node ───────────────────────────────────────────────────────

describe('sceneGraphHandler.onEvent — add_node', () => {
  it('adds node to nodes Map', () => {
    const { node, ctx, config } = attach();
    addNode(node as any, ctx, config, 'child1');
    expect((node as any).__sceneGraphState.nodes.has('child1')).toBe(true);
  });

  it('adds childId to parent children array', () => {
    const { node, ctx, config } = attach({}, 'root_node');
    addNode(node as any, ctx, config, 'child1', 'root_node');
    const root = (node as any).__sceneGraphState.nodes.get('root_node');
    expect(root.children).toContain('child1');
  });

  it('sets isDirty=true', () => {
    const { node, ctx, config } = attach();
    addNode(node as any, ctx, config, 'child1');
    expect((node as any).__sceneGraphState.isDirty).toBe(true);
  });

  it('emits on_node_added', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    addNode(node as any, ctx, config, 'child1', 'root_node');
    expect(ctx.emit).toHaveBeenCalledWith('on_node_added', expect.objectContaining({ childId: 'child1', parentId: 'root_node' }));
  });

  it('merge_strategy=skip_existing: ignores duplicate childId', () => {
    const { node, ctx, config } = attach({ merge_strategy: 'skip_existing' });
    addNode(node as any, ctx, config, 'child1');
    const before = (node as any).__sceneGraphState.nodes.size;
    addNode(node as any, ctx, config, 'child1'); // duplicate
    expect((node as any).__sceneGraphState.nodes.size).toBe(before);
  });

  it('merge_strategy=replace: removes old and adds new', () => {
    const { node, ctx, config } = attach({ merge_strategy: 'replace' }, 'root_node');
    addNode(node as any, ctx, config, 'child1', 'root_node');
    // Replace child1
    addNode(node as any, ctx, config, 'child1', 'root_node');
    const state = (node as any).__sceneGraphState;
    // child1 should still exist once
    expect(state.nodes.has('child1')).toBe(true);
    const rootChildren = state.nodes.get('root_node')!.children;
    // root should have child1 exactly once (old removed, new added)
    expect(rootChildren.filter((c: string) => c === 'child1')).toHaveLength(1);
  });
});

// ─── onEvent — remove_node ────────────────────────────────────────────────────

describe('sceneGraphHandler.onEvent — remove_node', () => {
  it('removes node from Map', () => {
    const { node, ctx, config } = attach({}, 'root_node');
    addNode(node as any, ctx, config, 'child1', 'root_node');
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, { type: 'scene_graph_remove_node', nodeId: 'child1' });
    expect((node as any).__sceneGraphState.nodes.has('child1')).toBe(false);
  });

  it('removes childId from parent children array', () => {
    const { node, ctx, config } = attach({}, 'root_node');
    addNode(node as any, ctx, config, 'child1', 'root_node');
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, { type: 'scene_graph_remove_node', nodeId: 'child1' });
    const root = (node as any).__sceneGraphState.nodes.get('root_node');
    expect(root.children).not.toContain('child1');
  });

  it('recursively removes grandchildren', () => {
    const { node, ctx, config } = attach({}, 'root_node');
    addNode(node as any, ctx, config, 'child1', 'root_node');
    addNode(node as any, ctx, config, 'grandchild1', 'child1');
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, { type: 'scene_graph_remove_node', nodeId: 'child1' });
    const state = (node as any).__sceneGraphState;
    expect(state.nodes.has('child1')).toBe(false);
    expect(state.nodes.has('grandchild1')).toBe(false);
  });

  it('sets isDirty=true', () => {
    const { node, ctx, config } = attach();
    addNode(node as any, ctx, config, 'child1');
    (node as any).__sceneGraphState.isDirty = false;
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, { type: 'scene_graph_remove_node', nodeId: 'child1' });
    expect((node as any).__sceneGraphState.isDirty).toBe(true);
  });
});

// ─── onEvent — reparent ───────────────────────────────────────────────────────

describe('sceneGraphHandler.onEvent — reparent', () => {
  it('moves node to new parent', () => {
    const { node, ctx, config } = attach({}, 'root_node');
    addNode(node as any, ctx, config, 'p1', 'root_node');
    addNode(node as any, ctx, config, 'p2', 'root_node');
    addNode(node as any, ctx, config, 'child1', 'p1');
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, { type: 'scene_graph_reparent', nodeId: 'child1', newParentId: 'p2' });
    const state = (node as any).__sceneGraphState;
    expect(state.nodes.get('p1').children).not.toContain('child1');
    expect(state.nodes.get('p2').children).toContain('child1');
    expect(state.nodes.get('child1').parent).toBe('p2');
  });

  it('sets isDirty=true', () => {
    const { node, ctx, config } = attach({}, 'root_node');
    addNode(node as any, ctx, config, 'p1', 'root_node');
    addNode(node as any, ctx, config, 'p2', 'root_node');
    addNode(node as any, ctx, config, 'child1', 'p1');
    (node as any).__sceneGraphState.isDirty = false;
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, { type: 'scene_graph_reparent', nodeId: 'child1', newParentId: 'p2' });
    expect((node as any).__sceneGraphState.isDirty).toBe(true);
  });
});

// ─── onEvent — set_transform ──────────────────────────────────────────────────

describe('sceneGraphHandler.onEvent — set_transform', () => {
  it('updates position', () => {
    const { node, ctx, config } = attach({}, 'root_node');
    addNode(node as any, ctx, config, 'child1', 'root_node');
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, {
      type: 'scene_graph_set_transform', nodeId: 'child1', transform: { position: [1, 2, 3] },
    });
    expect((node as any).__sceneGraphState.nodes.get('child1').localTransform.position).toEqual([1, 2, 3]);
  });

  it('emits scene_graph_transform_updated', () => {
    const { node, ctx, config } = attach({}, 'root_node');
    addNode(node as any, ctx, config, 'child1', 'root_node');
    ctx.emit.mockClear();
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, {
      type: 'scene_graph_set_transform', nodeId: 'child1', transform: { scale: [2, 2, 2] },
    });
    expect(ctx.emit).toHaveBeenCalledWith('scene_graph_transform_updated', expect.objectContaining({ nodeId: 'child1' }));
  });
});

// ─── onEvent — get_children / export / import / query ────────────────────────

describe('sceneGraphHandler.onEvent — data events', () => {
  it('get_children emits scene_graph_children_result', () => {
    const { node, ctx, config } = attach({}, 'root_node');
    addNode(node as any, ctx, config, 'child1', 'root_node');
    ctx.emit.mockClear();
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, {
      type: 'scene_graph_get_children', parentId: 'root_node', callbackId: 'cb1',
    });
    expect(ctx.emit).toHaveBeenCalledWith('scene_graph_children_result', expect.objectContaining({ children: ['child1'], callbackId: 'cb1' }));
  });

  it('export emits scene_graph_generate_export with flatten flag', () => {
    const { node, ctx, config } = attach({ flatten_on_export: true, coordinate_system: 'z_up' });
    ctx.emit.mockClear();
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, { type: 'scene_graph_export', format: 'gltf' });
    expect(ctx.emit).toHaveBeenCalledWith('scene_graph_generate_export', expect.objectContaining({
      format: 'gltf', flatten: true, coordinateSystem: 'z_up',
    }));
  });

  it('import adds all nodes and emits on_scene_composed', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    const importedNodes = [
      { id: 'n1', name: 'Node1', parent: null, children: [], localTransform: { position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] } },
      { id: 'n2', name: 'Node2', parent: 'n1', children: [], localTransform: { position: [1,0,0], rotation: [0,0,0,1], scale: [1,1,1] } },
    ];
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, { type: 'scene_graph_import', data: importedNodes });
    const state = (node as any).__sceneGraphState;
    expect(state.nodes.has('n1')).toBe(true);
    expect(state.nodes.has('n2')).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('on_scene_composed', expect.objectContaining({ importedCount: 2 }));
  });

  it('query emits scene_graph_info snapshot', () => {
    const { node, ctx, config } = attach({ coordinate_system: 'z_up', unit_scale: 0.01 });
    ctx.emit.mockClear();
    sceneGraphHandler.onEvent!(node as any, config, ctx as any, { type: 'scene_graph_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith('scene_graph_info', expect.objectContaining({
      queryId: 'q1',
      coordinateSystem: 'z_up',
      unitScale: 0.01,
    }));
  });
});
