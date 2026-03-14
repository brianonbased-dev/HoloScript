// @vitest-environment jsdom
/**
 * Snapshot regression tests for scene serialization (Sprint 17 P8)
 */

import { describe, it, expect, beforeEach } from 'vitest';

const { useSceneGraphStore } = await import('@/lib/stores/sceneGraphStore');

function reset() {
  useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
}

describe('scene serialization — format stability', () => {
  beforeEach(reset);

  it('empty scene has version and empty nodes', () => {
    const json = useSceneGraphStore.getState().serializeScene();
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty('version', 1);
    expect(parsed).toHaveProperty('nodes');
    expect(parsed.nodes).toEqual([]);
    expect(Object.keys(parsed)).toEqual(['version', 'nodes']);
  });

  it('node has all required fields', () => {
    useSceneGraphStore.getState().addNode({
      id: 'snap-1',
      name: 'SnapshotNode',
      type: 'mesh',
      parentId: null,
      traits: [{ name: 'physics', properties: { mass: 1 } }],
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [1, 1, 1],
    });

    const json = useSceneGraphStore.getState().serializeScene();
    const node = JSON.parse(json).nodes[0];

    // Verify all expected fields exist
    expect(node).toHaveProperty('id', 'snap-1');
    expect(node).toHaveProperty('name', 'SnapshotNode');
    expect(node).toHaveProperty('type', 'mesh');
    expect(node).toHaveProperty('parentId', null);
    expect(node).toHaveProperty('traits');
    expect(node).toHaveProperty('position');
    expect(node).toHaveProperty('rotation');
    expect(node).toHaveProperty('scale');
  });

  it('traits preserve property types', () => {
    useSceneGraphStore.getState().addNode({
      id: 't1',
      name: 'TypeTest',
      type: 'mesh',
      parentId: null,
      traits: [
        {
          name: 'mixed',
          properties: {
            str: 'hello',
            num: 42,
            bool: true,
            arr: [1, 2, 3],
            nested: { key: 'value' },
          },
        },
      ],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    const exported = useSceneGraphStore.getState().serializeScene();
    useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
    useSceneGraphStore.getState().loadScene(exported);

    const props = useSceneGraphStore.getState().nodes[0].traits[0].properties;
    expect(typeof props.str).toBe('string');
    expect(typeof props.num).toBe('number');
    expect(typeof props.bool).toBe('boolean');
    expect(Array.isArray(props.arr)).toBe(true);
    expect(typeof props.nested).toBe('object');
    expect((props.nested as Record<string, unknown>).key).toBe('value');
  });

  it('parent-child relationships survive roundtrip', () => {
    useSceneGraphStore.getState().addNode({
      id: 'parent',
      name: 'Parent',
      type: 'mesh',
      parentId: null,
      traits: [],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
    useSceneGraphStore.getState().addNode({
      id: 'child',
      name: 'Child',
      type: 'mesh',
      parentId: 'parent',
      traits: [],
      position: [5, 5, 5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    const exported = useSceneGraphStore.getState().serializeScene();
    useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
    useSceneGraphStore.getState().loadScene(exported);

    const nodes = useSceneGraphStore.getState().nodes;
    const child = nodes.find((n) => n.id === 'child');
    expect(child?.parentId).toBe('parent');
  });

  it('multiple node types survive roundtrip', () => {
    const types = ['mesh', 'light', 'camera', 'group'] as const;
    for (const type of types) {
      useSceneGraphStore.getState().addNode({
        id: `node-${type}`,
        name: `${type}Node`,
        type,
        parentId: null,
        traits: [],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      });
    }

    const exported = useSceneGraphStore.getState().serializeScene();
    useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
    useSceneGraphStore.getState().loadScene(exported);

    expect(useSceneGraphStore.getState().nodes).toHaveLength(4);
    for (const type of types) {
      const node = useSceneGraphStore.getState().nodes.find((n) => n.id === `node-${type}`);
      expect(node?.type).toBe(type);
    }
  });
});
