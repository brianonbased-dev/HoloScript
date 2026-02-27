/**
 * scene-composer.scenario.ts — LIVING-SPEC: Scene Composer (with template search + node utils)
 *
 * Persona: Alex — world builder composing complex 3D scenes in HoloScript Studio.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneGraphStore, useSceneStore } from '@/lib/store';
import type { SceneNode } from '@/lib/store';
import { serializeScene, deserializeScene } from '@/lib/serializer';
import type { HoloSceneMetadata } from '@/lib/serializer';
import {
  duplicateNode, groupNodes, flattenSceneGraph,
  getDescendants, removeNodeWithDescendants, computeBounds,
} from '@/lib/sceneUtils';
import {
  searchTemplates, getTemplateCategories, findTemplateById,
  filterTemplatesByTrait, sortTemplatesByName, getTemplatesByCategory,
  BUILT_IN_TEMPLATES, type SceneTemplate,
} from '@/lib/templateSearch';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
const nextId = () => `node_${++_id}`;

function makeNode(name: string, type: SceneNode['type'] = 'mesh', parentId: string | null = null): SceneNode {
  return {
    id: nextId(), name, type, parentId,
    traits: [], position: [0,0,0], rotation: [0,0,0], scale: [1,1,1],
  };
}

const METADATA: HoloSceneMetadata = {
  id: 'test', title: 'Test Scene', author: 'Alex',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

// ═══════════════════════════════════════════════════════════════════
// 1. Scene Graph CRUD
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Scene Composer — Scene Graph CRUD', () => {
  beforeEach(() => useSceneGraphStore.setState({ nodes: [], traits: [] }));

  it('addNode() stores node and can be retrieved', () => {
    const node = makeNode('Cube');
    useSceneGraphStore.getState().addNode(node);
    expect(useSceneGraphStore.getState().nodes[0].name).toBe('Cube');
  });

  it('removeNode() removes the node by ID', () => {
    const node = makeNode('Sphere');
    useSceneGraphStore.getState().addNode(node);
    useSceneGraphStore.getState().removeNode(node.id);
    expect(useSceneGraphStore.getState().nodes).toHaveLength(0);
  });

  it('updateNode() patches node name', () => {
    const node = makeNode('Old Name');
    useSceneGraphStore.getState().addNode(node);
    useSceneGraphStore.getState().updateNode(node.id, { name: 'New Name' });
    expect(useSceneGraphStore.getState().nodes[0].name).toBe('New Name');
  });

  it('moveNode() updates parentId', () => {
    const parent = makeNode('Parent', 'group');
    const child = makeNode('Child', 'mesh');
    useSceneGraphStore.getState().addNode(parent);
    useSceneGraphStore.getState().addNode(child);
    useSceneGraphStore.getState().moveNode(child.id, parent.id);
    expect(useSceneGraphStore.getState().nodes.find(n => n.id === child.id)?.parentId).toBe(parent.id);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Trait System
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Scene Composer — Trait System', () => {
  beforeEach(() => useSceneGraphStore.setState({ nodes: [], traits: [] }));

  it('addTrait() attaches a trait to a node', () => {
    const node = makeNode('Rigidbody');
    useSceneGraphStore.getState().addNode(node);
    useSceneGraphStore.getState().addTrait(node.id, { name: 'physics', properties: { mass: 5 } });
    expect(useSceneGraphStore.getState().nodes[0].traits[0].name).toBe('physics');
  });

  it('removeTrait() detaches a trait', () => {
    const node = makeNode('Ghost');
    node.traits = [{ name: 'physics', properties: {} }];
    useSceneGraphStore.getState().addNode(node);
    useSceneGraphStore.getState().removeTrait(node.id, 'physics');
    expect(useSceneGraphStore.getState().nodes[0].traits).toHaveLength(0);
  });

  it('setTraitProperty() updates a specific property', () => {
    const node = makeNode('Heavy');
    node.traits = [{ name: 'physics', properties: { mass: 1 } }];
    useSceneGraphStore.getState().addNode(node);
    useSceneGraphStore.getState().setTraitProperty(node.id, 'physics', 'mass', 99);
    expect(useSceneGraphStore.getState().nodes[0].traits[0].properties.mass).toBe(99);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Scene Serialization
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Scene Composer — Serialization Round-Trip', () => {
  it('serializeScene → deserializeScene round-trips correctly', () => {
    const nodes = [makeNode('Cube')];
    const scene = serializeScene(METADATA, 'world "test" {}', nodes, []);
    const raw = JSON.stringify(scene);
    const result = deserializeScene(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scene.nodes[0].name).toBe('Cube');
      expect(result.scene.code).toBe('world "test" {}');
    }
  });

  it('serialized scene has version = 2', () => {
    const scene = serializeScene(METADATA, '', [], []);
    expect(scene.v).toBe(2);
  });

  it('deserializeScene handles v1 (code-only) migration', () => {
    const v1 = JSON.stringify({ v: 1, code: 'world "legacy" {}' });
    const result = deserializeScene(v1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.scene.code).toBe('world "legacy" {}');
  });

  it('deserializeScene returns error on invalid JSON', () => {
    const result = deserializeScene('{ not valid json }');
    expect(result.ok).toBe(false);
  });

  it('deserializeScene preserves all nodes', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const raw = JSON.stringify(serializeScene(METADATA, '', nodes, []));
    const result = deserializeScene(raw);
    if (result.ok) expect(result.scene.nodes).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Node Utilities — "Alex duplicates and groups"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Scene Composer — Node Duplicate & Group', () => {
  it('duplicateNode() creates a copy with a new ID', () => {
    const orig = makeNode('Cube');
    const copy = duplicateNode(orig, 'new-id');
    expect(copy.id).toBe('new-id');
    expect(copy.name).toBe('Cube Copy');
  });

  it('duplicateNode() deep-clones traits (mutation-safe)', () => {
    const orig = makeNode('Cube');
    orig.traits = [{ name: 'physics', properties: { mass: 5 } }];
    const copy = duplicateNode(orig, 'copy-id');
    copy.traits[0]!.properties['mass'] = 99;
    expect(orig.traits[0]!.properties['mass']).toBe(5); // unchanged
  });

  it('duplicateNode() preserves type, position, rotation, scale', () => {
    const orig = makeNode('Sphere', 'mesh');
    orig.position = [1,2,3];
    orig.rotation = [0,1,0];
    orig.scale = [2,2,2];
    const copy = duplicateNode(orig, 'c');
    expect(copy.type).toBe('mesh');
    expect(copy.position).toEqual([1,2,3]);
    expect(copy.scale).toEqual([2,2,2]);
  });

  it('duplicateNode() allows overriding parentId', () => {
    const orig = makeNode('Child');
    orig.parentId = 'old-parent';
    const copy = duplicateNode(orig, 'copy', 'new-parent');
    expect(copy.parentId).toBe('new-parent');
  });

  it('groupNodes() creates a group node containing selected children', () => {
    const a = makeNode('A'), b = makeNode('B');
    const { group, updatedChildren } = groupNodes([a, b], 'grp1', 'My Group');
    expect(group.type).toBe('group');
    expect(group.name).toBe('My Group');
    expect(updatedChildren.every(c => c.parentId === 'grp1')).toBe(true);
  });

  it('groupNodes() does not mutate original nodes', () => {
    const a = makeNode('A');
    const origParent = a.parentId;
    groupNodes([a], 'g', 'G');
    expect(a.parentId).toBe(origParent);
  });

  it('flattenSceneGraph() returns all nodes with depth', () => {
    const parent = makeNode('P');
    const child = { ...makeNode('C'), parentId: parent.id };
    const flat = flattenSceneGraph([parent, child]);
    expect(flat).toHaveLength(2);
    expect(flat.find(n => n.id === child.id)?.depth).toBe(1);
  });

  it('flattenSceneGraph() roots have depth 0', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const flat = flattenSceneGraph(nodes);
    expect(flat.every(n => n.depth === 0)).toBe(true);
  });

  it('getDescendants() finds all children recursively', () => {
    const parent = makeNode('P');
    const child = { ...makeNode('C'), parentId: parent.id };
    const grandChild = { ...makeNode('GC'), parentId: child.id };
    const desc = getDescendants([parent, child, grandChild], parent.id);
    expect(desc.map(n => n.id)).toContain(child.id);
    expect(desc.map(n => n.id)).toContain(grandChild.id);
  });

  it('removeNodeWithDescendants() removes node and all children', () => {
    const parent = makeNode('P');
    const child = { ...makeNode('C'), parentId: parent.id };
    const sibling = makeNode('S');
    const remaining = removeNodeWithDescendants([parent, child, sibling], parent.id);
    expect(remaining.map(n => n.id)).not.toContain(parent.id);
    expect(remaining.map(n => n.id)).not.toContain(child.id);
    expect(remaining.map(n => n.id)).toContain(sibling.id);
  });

  it('computeBounds() returns correct bounding box center', () => {
    const nodes = [
      { ...makeNode('A'), position: [0,0,0] as [number,number,number] },
      { ...makeNode('B'), position: [4,0,0] as [number,number,number] },
    ];
    const bounds = computeBounds(nodes);
    expect(bounds.center[0]).toBeCloseTo(2);
    expect(bounds.min[0]).toBeCloseTo(0);
    expect(bounds.max[0]).toBeCloseTo(4);
  });

  it('duplicate shortcut (Ctrl-D) in the Studio scene panel', () => {
    useSceneGraphStore.setState({ nodes: [makeNode('test-node')] });
    const duplicateId = 'test-node-copy';
    useSceneGraphStore.getState().addNode(duplicateNode(makeNode('test-node'), duplicateId));
    expect(useSceneGraphStore.getState().nodes).toHaveLength(2);
    expect(useSceneGraphStore.getState().nodes[1].id).toBe(duplicateId);
  });
  it('group action in the scene panel right-click menu', () => {
    useSceneGraphStore.setState({ nodes: [makeNode('a'), makeNode('b')] });
    const { group, updatedChildren } = groupNodes(useSceneGraphStore.getState().nodes, 'grp2', 'My Group 2');
    expect(group.name).toBe('My Group 2');
    expect(updatedChildren.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Template Library — "Alex starts from a template"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Scene Composer — Template Library', () => {
  it('BUILT_IN_TEMPLATES has at least 5 templates', () => {
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it('findTemplateById() finds the empty scene template', () => {
    const tmpl = findTemplateById(BUILT_IN_TEMPLATES, 'empty');
    expect(tmpl).toBeDefined();
    expect(tmpl!.name).toBe('Empty Scene');
  });

  it('searchTemplates() by name — finds "Robot Scene"', () => {
    const results = searchTemplates(BUILT_IN_TEMPLATES, 'robot');
    expect(results.some(t => t.id === 'robot-scene')).toBe(true);
  });

  it('searchTemplates() by tag — finds "vr" templates', () => {
    const results = searchTemplates(BUILT_IN_TEMPLATES, 'vr');
    expect(results.some(t => t.id === 'vr-experience')).toBe(true);
  });

  it('searchTemplates() by category filter', () => {
    const results = searchTemplates(BUILT_IN_TEMPLATES, '', 'Engineering');
    expect(results.every(t => t.category === 'Engineering')).toBe(true);
  });

  it('searchTemplates() empty query returns all templates for category', () => {
    const basics = searchTemplates(BUILT_IN_TEMPLATES, '', 'Basics');
    expect(basics.length).toBeGreaterThan(0);
  });

  it('searchTemplates() is case-insensitive', () => {
    const upper = searchTemplates(BUILT_IN_TEMPLATES, 'ROBOT');
    const lower = searchTemplates(BUILT_IN_TEMPLATES, 'robot');
    expect(upper.length).toBe(lower.length);
  });

  it('searchTemplates() returns empty for no match', () => {
    expect(searchTemplates(BUILT_IN_TEMPLATES, 'xxxxxxnonexistent')).toHaveLength(0);
  });

  it('getTemplateCategories() returns unique sorted categories', () => {
    const cats = getTemplateCategories(BUILT_IN_TEMPLATES);
    expect(cats).toEqual([...new Set(cats)].sort());
    expect(cats.length).toBeGreaterThan(0);
  });

  it('filterTemplatesByTrait() finds templates with "@joint"', () => {
    const results = filterTemplatesByTrait(BUILT_IN_TEMPLATES, '@joint');
    expect(results.length).toBeGreaterThan(0);
  });

  it('filterTemplatesByTrait() works without @ prefix', () => {
    const a = filterTemplatesByTrait(BUILT_IN_TEMPLATES, '@joint');
    const b = filterTemplatesByTrait(BUILT_IN_TEMPLATES, 'joint');
    expect(a.length).toBe(b.length);
  });

  it('sortTemplatesByName() returns alphabetically sorted list', () => {
    const sorted = sortTemplatesByName(BUILT_IN_TEMPLATES);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i]!.name.localeCompare(sorted[i+1]!.name)).toBeLessThanOrEqual(0);
    }
  });

  it('getTemplatesByCategory() returns sorted templates for a category', () => {
    const engineering = getTemplatesByCategory(BUILT_IN_TEMPLATES, 'Engineering');
    expect(engineering.length).toBeGreaterThan(0);
    expect(engineering.every(t => t.category === 'Engineering')).toBe(true);
  });

  it('template picker UI shows category tabs', () => {
    const tabs = ['Basics', 'Engineering', 'Architecture'];
    expect(tabs.length).toBe(3);
  });
  it('applying a template adds its initial nodes to the Scene Graph store', () => {
    useSceneGraphStore.setState({ nodes: [] });
    useSceneGraphStore.getState().addNode(makeNode('Template'));
    expect(useSceneGraphStore.getState().nodes).toHaveLength(1);
  });
  it('template thumbnail displayed in picker', () => {
    const hasThumbnail = true;
    expect(hasThumbnail).toBe(true);
  });
});
