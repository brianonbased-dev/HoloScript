// @vitest-environment jsdom
/**
 * Tests for sceneGraphStore trait CRUD (Sprint 17 P6)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { SceneNode } from '@/lib/stores';

const { useSceneGraphStore } = await import('@/lib/stores/sceneGraphStore');

function reset() {
  useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
}

const baseNode: SceneNode = {
  id: 'trait-node',
  name: 'TraitTest',
  type: 'mesh',
  parentId: null,
  traits: [],
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

describe('sceneGraphStore — addTrait', () => {
  beforeEach(reset);

  it('adds a trait to a node', () => {
    useSceneGraphStore.getState().addNode({ ...baseNode });
    useSceneGraphStore.getState().addTrait('trait-node', {
      name: 'physics',
      properties: { mass: 5, restitution: 0.3 },
    });
    const node = useSceneGraphStore.getState().nodes[0];
    expect(node.traits).toHaveLength(1);
    expect(node.traits[0].name).toBe('physics');
    expect(node.traits[0].properties.mass).toBe(5);
  });

  it('replaces trait with same name', () => {
    useSceneGraphStore.getState().addNode({
      ...baseNode,
      traits: [{ name: 'physics', properties: { mass: 1 } }],
    });
    useSceneGraphStore.getState().addTrait('trait-node', {
      name: 'physics',
      properties: { mass: 99 },
    });
    const node = useSceneGraphStore.getState().nodes[0];
    expect(node.traits).toHaveLength(1);
    expect(node.traits[0].properties.mass).toBe(99);
  });

  it('adds multiple different traits', () => {
    useSceneGraphStore.getState().addNode({ ...baseNode });
    useSceneGraphStore.getState().addTrait('trait-node', {
      name: 'physics',
      properties: { mass: 5 },
    });
    useSceneGraphStore.getState().addTrait('trait-node', {
      name: 'audio',
      properties: { clip: 'sound.mp3' },
    });
    useSceneGraphStore.getState().addTrait('trait-node', {
      name: 'render',
      properties: { color: 'red' },
    });
    expect(useSceneGraphStore.getState().nodes[0].traits).toHaveLength(3);
  });
});

describe('sceneGraphStore — removeTrait', () => {
  beforeEach(reset);

  it('removes a trait by name', () => {
    useSceneGraphStore.getState().addNode({
      ...baseNode,
      traits: [
        { name: 'physics', properties: { mass: 5 } },
        { name: 'audio', properties: { clip: 'x.mp3' } },
      ],
    });
    useSceneGraphStore.getState().removeTrait('trait-node', 'physics');
    const node = useSceneGraphStore.getState().nodes[0];
    expect(node.traits).toHaveLength(1);
    expect(node.traits[0].name).toBe('audio');
  });

  it('no-op for non-existent trait', () => {
    useSceneGraphStore.getState().addNode({
      ...baseNode,
      traits: [{ name: 'physics', properties: {} }],
    });
    useSceneGraphStore.getState().removeTrait('trait-node', 'nonexistent');
    expect(useSceneGraphStore.getState().nodes[0].traits).toHaveLength(1);
  });
});

describe('sceneGraphStore — setTraitProperty deep', () => {
  beforeEach(reset);

  it('updates nested property value', () => {
    useSceneGraphStore.getState().addNode({
      ...baseNode,
      traits: [{ name: 'material', properties: { albedo: '#fff', roughness: 0.5 } }],
    });
    useSceneGraphStore.getState().setTraitProperty('trait-node', 'material', 'roughness', 0.8);
    const props = useSceneGraphStore.getState().nodes[0].traits[0].properties;
    expect(props.roughness).toBe(0.8);
    expect(props.albedo).toBe('#fff'); // preserved
  });

  it('adds new property to existing trait', () => {
    useSceneGraphStore.getState().addNode({
      ...baseNode,
      traits: [{ name: 'material', properties: { albedo: '#000' } }],
    });
    useSceneGraphStore.getState().setTraitProperty('trait-node', 'material', 'metallic', 0.9);
    const props = useSceneGraphStore.getState().nodes[0].traits[0].properties;
    expect(props.metallic).toBe(0.9);
  });

  it('handles boolean property values', () => {
    useSceneGraphStore.getState().addNode({
      ...baseNode,
      traits: [{ name: 'render', properties: { visible: true } }],
    });
    useSceneGraphStore.getState().setTraitProperty('trait-node', 'render', 'visible', false);
    expect(useSceneGraphStore.getState().nodes[0].traits[0].properties.visible).toBe(false);
  });

  it('handles array property values', () => {
    useSceneGraphStore.getState().addNode({
      ...baseNode,
      traits: [{ name: 'animation', properties: { frames: [1, 2, 3] } }],
    });
    useSceneGraphStore.getState().setTraitProperty('trait-node', 'animation', 'frames', [4, 5, 6]);
    expect(useSceneGraphStore.getState().nodes[0].traits[0].properties.frames).toEqual([4, 5, 6]);
  });
});
