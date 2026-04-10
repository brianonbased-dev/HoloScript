// @vitest-environment jsdom
/**
 * Tests for sceneGraphStore CRUD operations (Sprint 16 P2)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { SceneNode } from '@/lib/stores';

const { useSceneGraphStore } = await import('@/lib/stores/sceneGraphStore');

function reset() {
  useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
}

function makeNode(overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: overrides.id ?? `node-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name ?? 'TestNode',
    type: overrides.type ?? 'mesh',
    parentId: overrides.parentId ?? null,
    traits: overrides.traits ?? [],
    position: overrides.position ?? [0, 0, 0],
    rotation: overrides.rotation ?? [0, 0, 0],
    scale: overrides.scale ?? [1, 1, 1],
  };
}

describe('sceneGraphStore — addNode', () => {
  beforeEach(reset);

  it('adds a node to empty graph', () => {
    const node = makeNode({ id: 'a', name: 'Cube' });
    useSceneGraphStore.getState().addNode(node);
    expect(useSceneGraphStore.getState().nodes).toHaveLength(1);
    expect(useSceneGraphStore.getState().nodes[0].name).toBe('Cube');
  });

  it('adds multiple nodes', () => {
    useSceneGraphStore.getState().addNode(makeNode({ id: 'a' }));
    useSceneGraphStore.getState().addNode(makeNode({ id: 'b' }));
    useSceneGraphStore.getState().addNode(makeNode({ id: 'c' }));
    expect(useSceneGraphStore.getState().nodes).toHaveLength(3);
  });

  it('preserves node traits', () => {
    const node = makeNode({
      id: 'x',
      traits: [{ name: 'physics', properties: { mass: 5 } }],
    });
    useSceneGraphStore.getState().addNode(node);
    expect(useSceneGraphStore.getState().nodes[0].traits[0].properties.mass).toBe(5);
  });
});

describe('sceneGraphStore — removeNode', () => {
  beforeEach(reset);

  it('removes a node by ID', () => {
    useSceneGraphStore.getState().addNode(makeNode({ id: 'a' }));
    useSceneGraphStore.getState().addNode(makeNode({ id: 'b' }));
    useSceneGraphStore.getState().removeNode('a');
    expect(useSceneGraphStore.getState().nodes).toHaveLength(1);
    expect(useSceneGraphStore.getState().nodes[0].id).toBe('b');
  });

  it('no-op when ID not found', () => {
    useSceneGraphStore.getState().addNode(makeNode({ id: 'a' }));
    useSceneGraphStore.getState().removeNode('nonexistent');
    expect(useSceneGraphStore.getState().nodes).toHaveLength(1);
  });
});

describe('sceneGraphStore — moveNode', () => {
  beforeEach(reset);

  it('reparents a node', () => {
    useSceneGraphStore.getState().addNode(makeNode({ id: 'parent' }));
    useSceneGraphStore.getState().addNode(makeNode({ id: 'child', parentId: null }));
    useSceneGraphStore.getState().moveNode('child', 'parent');
    const child = useSceneGraphStore.getState().nodes.find((n) => n.id === 'child');
    expect(child?.parentId).toBe('parent');
  });

  it('unparents a node', () => {
    useSceneGraphStore.getState().addNode(makeNode({ id: 'child', parentId: 'parent' }));
    useSceneGraphStore.getState().moveNode('child', null);
    const child = useSceneGraphStore.getState().nodes.find((n) => n.id === 'child');
    expect(child?.parentId).toBeNull();
  });
});

describe('sceneGraphStore — updateNodeTransform', () => {
  beforeEach(reset);

  it('updates position', () => {
    useSceneGraphStore.getState().addNode(makeNode({ id: 'n1' }));
    useSceneGraphStore.getState().updateNodeTransform('n1', { position: [10, 20, 30] });
    const node = useSceneGraphStore.getState().nodes.find((n) => n.id === 'n1');
    expect(node?.position).toEqual([10, 20, 30]);
  });

  it('updates rotation without affecting position', () => {
    useSceneGraphStore.getState().addNode(makeNode({ id: 'n1', position: [5, 5, 5] }));
    useSceneGraphStore.getState().updateNodeTransform('n1', { rotation: [1, 2, 3] });
    const node = useSceneGraphStore.getState().nodes.find((n) => n.id === 'n1');
    expect(node?.rotation).toEqual([1, 2, 3]);
    expect(node?.position).toEqual([5, 5, 5]);
  });

  it('updates scale', () => {
    useSceneGraphStore.getState().addNode(makeNode({ id: 'n1' }));
    useSceneGraphStore.getState().updateNodeTransform('n1', { scale: [2, 3, 4] });
    const node = useSceneGraphStore.getState().nodes.find((n) => n.id === 'n1');
    expect(node?.scale).toEqual([2, 3, 4]);
  });
});

describe('sceneGraphStore — setTraitProperty', () => {
  beforeEach(reset);

  it('sets a trait property value', () => {
    useSceneGraphStore.getState().addNode(
      makeNode({
        id: 'n1',
        traits: [{ name: 'render', properties: { color: 'red' } }],
      })
    );
    useSceneGraphStore.getState().setTraitProperty('n1', 'render', 'color', 'blue');
    const node = useSceneGraphStore.getState().nodes.find((n) => n.id === 'n1');
    expect(node?.traits[0].properties.color).toBe('blue');
  });

  it('adds a new property to existing trait', () => {
    useSceneGraphStore.getState().addNode(
      makeNode({
        id: 'n1',
        traits: [{ name: 'render', properties: { color: 'red' } }],
      })
    );
    useSceneGraphStore.getState().setTraitProperty('n1', 'render', 'opacity', 0.5);
    const node = useSceneGraphStore.getState().nodes.find((n) => n.id === 'n1');
    expect(node?.traits[0].properties.opacity).toBe(0.5);
    expect(node?.traits[0].properties.color).toBe('red');
  });
});
