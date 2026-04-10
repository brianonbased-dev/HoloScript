import { describe, it, expect, beforeEach } from 'vitest';
import { sceneGraphHandler } from '../SceneGraphTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('SceneGraphTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    root_node: 'world',
    instancing: true,
    merge_strategy: 'merge' as const,
    coordinate_system: 'y_up' as const,
    unit_scale: 1.0,
    flatten_on_export: false,
  };

  beforeEach(() => {
    node = createMockNode('sg');
    (node as any).id = 'root';
    ctx = createMockContext();
    attachTrait(sceneGraphHandler, node, cfg, ctx);
  });

  it('inits with root node', () => {
    expect(getEventCount(ctx, 'scene_graph_init')).toBe(1);
    const s = (node as any).__sceneGraphState;
    expect(s.nodeCount).toBe(1);
    expect(s.nodes.has('root')).toBe(true);
  });

  it('add node creates child', () => {
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_add_node',
      childId: 'child1',
      parentId: 'root',
      name: 'Child 1',
    });
    const s = (node as any).__sceneGraphState;
    expect(s.nodes.has('child1')).toBe(true);
    expect(s.nodes.get('root').children).toContain('child1');
    expect(getEventCount(ctx, 'on_node_added')).toBe(1);
  });

  it('skip_existing prevents duplicate', () => {
    const c2 = { ...cfg, merge_strategy: 'skip_existing' as const };
    sendEvent(sceneGraphHandler, node, c2, ctx, {
      type: 'scene_graph_add_node',
      childId: 'child1',
      parentId: 'root',
    });
    sendEvent(sceneGraphHandler, node, c2, ctx, {
      type: 'scene_graph_add_node',
      childId: 'child1',
      parentId: 'root',
    });
    expect(getEventCount(ctx, 'on_node_added')).toBe(1);
  });

  it('remove node cleans up', () => {
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_add_node',
      childId: 'child1',
      parentId: 'root',
    });
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_remove_node',
      nodeId: 'child1',
    });
    expect((node as any).__sceneGraphState.nodes.has('child1')).toBe(false);
  });

  it('reparent moves node', () => {
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_add_node',
      childId: 'a',
      parentId: 'root',
    });
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_add_node',
      childId: 'b',
      parentId: 'root',
    });
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_reparent',
      nodeId: 'a',
      newParentId: 'b',
    });
    const s = (node as any).__sceneGraphState;
    expect(s.nodes.get('a').parent).toBe('b');
    expect(s.nodes.get('b').children).toContain('a');
  });

  it('set transform updates node', () => {
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_add_node',
      childId: 'child1',
      parentId: 'root',
    });
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_set_transform',
      nodeId: 'child1',
      transform: { position: [5, 0, 0] },
    });
    expect((node as any).__sceneGraphState.nodes.get('child1').localTransform.position).toEqual([
      5, 0, 0,
    ]);
    expect(getEventCount(ctx, 'scene_graph_transform_updated')).toBe(1);
  });

  it('get children returns list', () => {
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_add_node',
      childId: 'c1',
      parentId: 'root',
    });
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_get_children',
      parentId: 'root',
      callbackId: 'cb1',
    });
    expect(getEventCount(ctx, 'scene_graph_children_result')).toBe(1);
  });

  it('import bulk loads nodes', () => {
    const data = [
      {
        id: 'imp1',
        name: 'Imported',
        parent: null,
        children: [],
        localTransform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
    ];
    sendEvent(sceneGraphHandler, node, cfg, ctx, { type: 'scene_graph_import', data });
    expect((node as any).__sceneGraphState.nodes.has('imp1')).toBe(true);
    expect(getEventCount(ctx, 'on_scene_composed')).toBe(1);
  });

  it('update recalculates depth', () => {
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_add_node',
      childId: 'c1',
      parentId: 'root',
    });
    sendEvent(sceneGraphHandler, node, cfg, ctx, {
      type: 'scene_graph_add_node',
      childId: 'c2',
      parentId: 'c1',
    });
    updateTrait(sceneGraphHandler, node, cfg, ctx, 0.016);
    const s = (node as any).__sceneGraphState;
    expect(s.nodeCount).toBe(3);
    expect(s.depth).toBe(2);
  });

  it('query emits info', () => {
    sendEvent(sceneGraphHandler, node, cfg, ctx, { type: 'scene_graph_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'scene_graph_info')).toBe(1);
  });

  it('detach destroys', () => {
    sceneGraphHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'scene_graph_destroy')).toBe(1);
    expect((node as any).__sceneGraphState).toBeUndefined();
  });
});
