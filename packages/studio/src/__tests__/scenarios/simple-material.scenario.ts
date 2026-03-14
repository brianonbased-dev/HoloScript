/**
 * simple-material.scenario.ts — SimpleMaterialPanel Trait Logic
 *
 * Persona: Dev — verifying that sceneGraphStore's material trait operations
 * work correctly as consumed by SimpleMaterialPanel.
 *
 * Tests the store-level contract (setTraitProperty, applyTransientMaterial shape)
 * with a synthetic scene node, not the full React component.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneGraphStore } from '@/lib/stores';
import type { SceneNode } from '@/lib/stores';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(id: string, withMaterial = false): SceneNode {
  return {
    id,
    name: 'TestMesh',
    type: 'mesh',
    parentId: null,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    traits: withMaterial
      ? [{ name: 'material', properties: { color: '#ffffff', roughness: 0.5, metalness: 0.0, opacity: 1.0 } }]
      : [],
  };
}

function resetStore() {
  useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Scenario: Simple Material Panel — trait read/write', () => {
  beforeEach(resetStore);

  it('reads default material values from a node with a material trait', () => {
    const node = makeNode('n1', true);
    useSceneGraphStore.getState().addNode(node);

    const nodes = useSceneGraphStore.getState().nodes;
    const mat = nodes[0].traits.find((t) => t.name === 'material');
    expect(mat?.properties.color).toBe('#ffffff');
    expect(mat?.properties.roughness).toBe(0.5);
    expect(mat?.properties.metalness).toBe(0.0);
    expect(mat?.properties.opacity).toBe(1.0);
  });

  it('setTraitProperty updates a single material property', () => {
    useSceneGraphStore.getState().addNode(makeNode('n2', true));
    useSceneGraphStore.getState().setTraitProperty('n2', 'material', 'roughness', 0.85);

    const mat = useSceneGraphStore.getState().nodes[0].traits.find((t) => t.name === 'material');
    expect(mat?.properties.roughness).toBe(0.85);
    // Other properties remain unchanged
    expect(mat?.properties.color).toBe('#ffffff');
  });

  it('setTraitProperty adds new property to existing trait', () => {
    useSceneGraphStore.getState().addNode(makeNode('n3', true));
    useSceneGraphStore.getState().setTraitProperty('n3', 'material', 'emissive', '#ff0000');

    const mat = useSceneGraphStore.getState().nodes[0].traits.find((t) => t.name === 'material');
    expect(mat?.properties.emissive).toBe('#ff0000');
  });

  it('addTrait adds material trait to a node that has none', () => {
    useSceneGraphStore.getState().addNode(makeNode('n4', false));
    useSceneGraphStore.getState().addTrait('n4', {
      name: 'material',
      properties: { color: '#3333ff', roughness: 0.7, metalness: 0.2 },
    });

    const mat = useSceneGraphStore.getState().nodes[0].traits.find((t) => t.name === 'material');
    expect(mat).toBeDefined();
    expect(mat?.properties.color).toBe('#3333ff');
  });

  it('addTrait replaces an existing material trait (upsert behavior)', () => {
    useSceneGraphStore.getState().addNode(makeNode('n5', true));
    useSceneGraphStore.getState().addTrait('n5', {
      name: 'material',
      properties: { color: '#00ff00', roughness: 0.1 },
    });

    const mats = useSceneGraphStore.getState().nodes[0].traits.filter((t) => t.name === 'material');
    // Should have exactly one material trait (deduped)
    expect(mats).toHaveLength(1);
    expect(mats[0].properties.color).toBe('#00ff00');
  });

  it('removeNode also cleans nodeRefs (P4 leak fix)', () => {
    useSceneGraphStore.getState().addNode(makeNode('n6', true));
    // Simulate a Three.js ref registration
    useSceneGraphStore.getState().setNodeRef('n6', { isMesh: true } as any);
    expect(useSceneGraphStore.getState().nodeRefs['n6']).toBeDefined();

    useSceneGraphStore.getState().removeNode('n6');
    expect(useSceneGraphStore.getState().nodeRefs['n6']).toBeUndefined();
  });
});
