// @vitest-environment jsdom
/**
 * Tests for scene serialization (Sprint 14 P3)
 */

import { describe, it, expect, beforeEach } from 'vitest';

const { useSceneGraphStore } = await import('@/lib/stores');

function reset() {
  useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
}

describe('sceneGraphStore — serialization', () => {
  beforeEach(reset);

  it('serializeScene returns JSON string', () => {
    const json = useSceneGraphStore.getState().serializeScene();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.nodes).toEqual([]);
  });

  it('serializeScene includes all nodes', () => {
    useSceneGraphStore.getState().addNode({
      id: 'n1',
      name: 'Cube',
      type: 'mesh',
      parentId: null,
      traits: [{ name: 'physics', properties: { mass: 1 } }],
      position: [0, 1, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
    useSceneGraphStore.getState().addNode({
      id: 'n2',
      name: 'Light',
      type: 'light',
      parentId: null,
      traits: [],
      position: [5, 10, 5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    const json = useSceneGraphStore.getState().serializeScene();
    const parsed = JSON.parse(json);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes[0].name).toBe('Cube');
    expect(parsed.nodes[1].name).toBe('Light');
  });

  it('loadScene replaces existing nodes', () => {
    useSceneGraphStore.getState().addNode({
      id: 'old',
      name: 'Old',
      type: 'mesh',
      parentId: null,
      traits: [],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    const sceneJson = JSON.stringify({
      version: 1,
      nodes: [
        {
          id: 'new1',
          name: 'Imported',
          type: 'mesh',
          parentId: null,
          traits: [],
          position: [10, 20, 30],
          rotation: [0, 0, 0],
          scale: [2, 2, 2],
        },
      ],
    });

    useSceneGraphStore.getState().loadScene(sceneJson);
    const nodes = useSceneGraphStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('new1');
    expect(nodes[0].name).toBe('Imported');
    expect(nodes[0].position).toEqual([10, 20, 30]);
  });

  it('loadScene clears nodeRefs', () => {
    useSceneGraphStore.setState({
      nodeRefs: { old: { position: { fromArray: () => {} } } },
    });

    useSceneGraphStore.getState().loadScene(JSON.stringify({ version: 1, nodes: [] }));
    expect(useSceneGraphStore.getState().nodeRefs).toEqual({});
  });

  it('roundtrip: serialize then load preserves data', () => {
    const testNode = {
      id: 'rt1',
      name: 'RoundTrip',
      type: 'camera' as const,
      parentId: null,
      traits: [{ name: 'fov', properties: { angle: 75 } }],
      position: [1, 2, 3] as [number, number, number],
      rotation: [0.1, 0.2, 0.3] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    };
    useSceneGraphStore.getState().addNode(testNode);

    const json = useSceneGraphStore.getState().serializeScene();
    useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
    useSceneGraphStore.getState().loadScene(json);

    const nodes = useSceneGraphStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].traits[0].properties.angle).toBe(75);
    expect(nodes[0].rotation).toEqual([0.1, 0.2, 0.3]);
  });

  it('loadScene handles malformed JSON gracefully (no nodes)', () => {
    useSceneGraphStore.getState().loadScene(JSON.stringify({ version: 1 }));
    expect(useSceneGraphStore.getState().nodes).toEqual([]);
  });
});
