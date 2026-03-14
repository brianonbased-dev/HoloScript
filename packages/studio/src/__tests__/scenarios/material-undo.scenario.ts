/**
 * material-undo.scenario.ts — P5 Sprint 11
 *
 * Persona: Dev — verifying that material property changes can be reverted
 * via a manual undo stack attached to sceneGraphStore.
 *
 * The undo mechanism demonstrated here is the pattern recommended by the
 * stores-audit.md for P5: callers push to a local undo stack before calling
 * applyTransientMaterial. This test verifies the round-trip restore logic,
 * independent of any UI undo hook.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneGraphStore } from '@/lib/stores';
import type { SceneNode } from '@/lib/stores';

// ─── Minimal undo stack helper (documents the P5 pattern) ────────────────────

interface MaterialSnapshot {
  nodeId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

function makeNode(id: string): SceneNode {
  return {
    id, name: 'Cube', type: 'mesh',
    parentId: null,
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
    traits: [{ name: 'material', properties: { color: '#ffffff', roughness: 0.5 } }],
  };
}

function getMaterialProps(nodeId: string): Record<string, unknown> {
  const node = useSceneGraphStore.getState().nodes.find((n) => n.id === nodeId);
  const mat = node?.traits.find((t) => t.name === 'material');
  return { ...(mat?.properties ?? {}) };
}

function resetStore() {
  useSceneGraphStore.setState({ nodes: [], nodeRefs: {} });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Scenario: Material Undo — round-trip restore', () => {
  beforeEach(resetStore);

  it('snapshotting before+after allows restoring the previous color', () => {
    useSceneGraphStore.getState().addNode(makeNode('m1'));
    const undoStack: MaterialSnapshot[] = [];

    // Snapshot before
    const before = getMaterialProps('m1');
    // Apply change
    useSceneGraphStore.getState().applyTransientMaterial('m1', { color: '#ff0000', roughness: 0.9 });
    const after = getMaterialProps('m1');

    undoStack.push({ nodeId: 'm1', before, after });

    // Verify change applied
    expect(getMaterialProps('m1').color).toBe('#ff0000');

    // Undo: restore 'before'
    const { before: restore } = undoStack.pop()!;
    useSceneGraphStore.getState().applyTransientMaterial('m1', restore);

    expect(getMaterialProps('m1').color).toBe('#ffffff');
    expect(getMaterialProps('m1').roughness).toBe(0.5);
  });

  it('multiple undo steps restore each previous state in order', () => {
    useSceneGraphStore.getState().addNode(makeNode('m2'));
    const undoStack: MaterialSnapshot[] = [];

    // Step 1: → red
    const snap1Before = getMaterialProps('m2');
    useSceneGraphStore.getState().applyTransientMaterial('m2', { color: '#ff0000' });
    undoStack.push({ nodeId: 'm2', before: snap1Before, after: getMaterialProps('m2') });

    // Step 2: → blue
    const snap2Before = getMaterialProps('m2');
    useSceneGraphStore.getState().applyTransientMaterial('m2', { color: '#0000ff' });
    undoStack.push({ nodeId: 'm2', before: snap2Before, after: getMaterialProps('m2') });

    expect(getMaterialProps('m2').color).toBe('#0000ff');

    // Undo step 2 → red
    useSceneGraphStore.getState().applyTransientMaterial('m2', undoStack.pop()!.before);
    expect(getMaterialProps('m2').color).toBe('#ff0000');

    // Undo step 1 → white
    useSceneGraphStore.getState().applyTransientMaterial('m2', undoStack.pop()!.before);
    expect(getMaterialProps('m2').color).toBe('#ffffff');
  });

  it('redo: restoring the after snapshot re-applies the change', () => {
    useSceneGraphStore.getState().addNode(makeNode('m3'));
    const history: MaterialSnapshot[] = [];

    const before = getMaterialProps('m3');
    useSceneGraphStore.getState().applyTransientMaterial('m3', { roughness: 0.95 });
    const after = getMaterialProps('m3');
    history.push({ nodeId: 'm3', before, after });

    // Undo
    useSceneGraphStore.getState().applyTransientMaterial('m3', history[0].before);
    expect(getMaterialProps('m3').roughness).toBe(0.5);

    // Redo: restore after
    useSceneGraphStore.getState().applyTransientMaterial('m3', history[0].after);
    expect(getMaterialProps('m3').roughness).toBe(0.95);
  });
});
