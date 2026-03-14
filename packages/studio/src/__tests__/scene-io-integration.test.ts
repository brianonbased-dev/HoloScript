// @vitest-environment jsdom
/**
 * Tests for scene I/O export/import (Sprint 15 P1 verification)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { useSceneGraphStore } = await import('@/lib/stores/sceneGraphStore');

function reset() {
  useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
}

describe('scene I/O integration', () => {
  beforeEach(reset);

  it('export produces valid .holoscript.json content', () => {
    useSceneGraphStore.getState().addNode({
      id: 'test-mesh',
      name: 'TestCube',
      type: 'mesh',
      parentId: null,
      traits: [{ name: 'render', properties: { material: 'pbr' } }],
      position: [1, 2, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    const json = useSceneGraphStore.getState().serializeScene();
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(1);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0].name).toBe('TestCube');
    expect(parsed.nodes[0].traits[0].name).toBe('render');
  });

  it('import replaces entire scene graph', () => {
    // Add initial node
    useSceneGraphStore.getState().addNode({
      id: 'a',
      name: 'A',
      type: 'mesh',
      parentId: null,
      traits: [],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    // Import a different scene
    const newScene = {
      version: 1,
      nodes: [
        { id: 'b', name: 'B', type: 'light', parentId: null, traits: [], position: [5, 5, 5], rotation: [0, 0, 0], scale: [1, 1, 1] },
        { id: 'c', name: 'C', type: 'camera', parentId: null, traits: [], position: [0, 10, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      ]
    };

    useSceneGraphStore.getState().loadScene(JSON.stringify(newScene));
    const nodes = useSceneGraphStore.getState().nodes;

    expect(nodes).toHaveLength(2);
    expect(nodes[0].id).toBe('b');
    expect(nodes[1].id).toBe('c');
  });

  it('import empty scene clears all nodes', () => {
    useSceneGraphStore.getState().addNode({
      id: 'x',
      name: 'X',
      type: 'mesh',
      parentId: null,
      traits: [],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    useSceneGraphStore.getState().loadScene(JSON.stringify({ version: 1, nodes: [] }));
    expect(useSceneGraphStore.getState().nodes).toHaveLength(0);
  });

  it('handles complex trait data in roundtrip', () => {
    const complexNode = {
      id: 'complex',
      name: 'Complex',
      type: 'mesh' as const,
      parentId: null,
      traits: [
        { name: 'physics', properties: { mass: 5.5, restitution: 0.3, friction: 0.7 } },
        { name: 'audio', properties: { clip: 'ambient.mp3', volume: 0.8, spatial: true } },
      ],
      position: [10, 20, 30] as [number, number, number],
      rotation: [0.5, 1.0, 1.5] as [number, number, number],
      scale: [2, 2, 2] as [number, number, number],
    };

    useSceneGraphStore.getState().addNode(complexNode);
    const exported = useSceneGraphStore.getState().serializeScene();

    useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
    useSceneGraphStore.getState().loadScene(exported);

    const loaded = useSceneGraphStore.getState().nodes[0];
    expect(loaded.traits).toHaveLength(2);
    expect(loaded.traits[0].properties.mass).toBe(5.5);
    expect(loaded.traits[1].properties.spatial).toBe(true);
    expect(loaded.scale).toEqual([2, 2, 2]);
  });
});
