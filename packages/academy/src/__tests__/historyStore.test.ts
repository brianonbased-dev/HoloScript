// @vitest-environment jsdom
/**
 * Tests for historyStore undo/redo (Sprint 16 P3)
 */

import { describe, it, expect, beforeEach } from 'vitest';

const { useHistoryStore, setNextHistoryLabel, getLastHistoryLabel } =
  await import('@/lib/historyStore');

function reset() {
  useHistoryStore.setState({ nodes: [] });
  useHistoryStore.temporal.getState().clear();
}

const testNode = {
  id: 'h1',
  name: 'HistCube',
  type: 'mesh' as const,
  parentId: null,
  traits: [{ name: 'physics', properties: { mass: 1 } }],
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: [1, 1, 1] as [number, number, number],
};

describe('historyStore — mutations', () => {
  beforeEach(reset);

  it('addNode adds a node', () => {
    useHistoryStore.getState().addNode(testNode);
    expect(useHistoryStore.getState().nodes).toHaveLength(1);
  });

  it('removeNode removes by ID', () => {
    useHistoryStore.getState().addNode(testNode);
    useHistoryStore.getState().removeNode('h1');
    expect(useHistoryStore.getState().nodes).toHaveLength(0);
  });

  it('moveNode changes parentId', () => {
    useHistoryStore.getState().addNode(testNode);
    useHistoryStore.getState().addNode({ ...testNode, id: 'h2', name: 'Parent' });
    useHistoryStore.getState().moveNode('h1', 'h2');
    expect(useHistoryStore.getState().nodes.find((n) => n.id === 'h1')?.parentId).toBe('h2');
  });

  it('updateNodeTransform updates transform', () => {
    useHistoryStore.getState().addNode(testNode);
    useHistoryStore.getState().updateNodeTransform('h1', { position: [10, 20, 30] });
    expect(useHistoryStore.getState().nodes[0].position).toEqual([10, 20, 30]);
  });

  it('addTrait adds a trait', () => {
    useHistoryStore.getState().addNode({ ...testNode, traits: [] });
    useHistoryStore.getState().addTrait('h1', { name: 'render', properties: { color: 'red' } });
    expect(useHistoryStore.getState().nodes[0].traits).toHaveLength(1);
    expect(useHistoryStore.getState().nodes[0].traits[0].name).toBe('render');
  });

  it('removeTrait removes a trait', () => {
    useHistoryStore.getState().addNode(testNode);
    useHistoryStore.getState().removeTrait('h1', 'physics');
    expect(useHistoryStore.getState().nodes[0].traits).toHaveLength(0);
  });

  it('setTraitProperty updates trait property', () => {
    useHistoryStore.getState().addNode(testNode);
    useHistoryStore.getState().setTraitProperty('h1', 'physics', 'mass', 10);
    expect(useHistoryStore.getState().nodes[0].traits[0].properties.mass).toBe(10);
  });
});

describe('historyStore — undo/redo', () => {
  beforeEach(reset);

  it('undo reverts the last action', () => {
    useHistoryStore.getState().addNode(testNode);
    expect(useHistoryStore.getState().nodes).toHaveLength(1);
    useHistoryStore.temporal.getState().undo();
    expect(useHistoryStore.getState().nodes).toHaveLength(0);
  });

  it('redo restores the undone action', () => {
    useHistoryStore.getState().addNode(testNode);
    useHistoryStore.temporal.getState().undo();
    useHistoryStore.temporal.getState().redo();
    expect(useHistoryStore.getState().nodes).toHaveLength(1);
  });

  it('multiple undos work correctly', () => {
    useHistoryStore.getState().addNode(testNode);
    useHistoryStore.getState().addNode({ ...testNode, id: 'h2', name: 'Second' });
    expect(useHistoryStore.getState().nodes).toHaveLength(2);
    useHistoryStore.temporal.getState().undo();
    expect(useHistoryStore.getState().nodes).toHaveLength(1);
    useHistoryStore.temporal.getState().undo();
    expect(useHistoryStore.getState().nodes).toHaveLength(0);
  });

  it('undo then new action clears redo stack', () => {
    useHistoryStore.getState().addNode(testNode);
    useHistoryStore.temporal.getState().undo();
    useHistoryStore.getState().addNode({ ...testNode, id: 'h3', name: 'New' });
    useHistoryStore.temporal.getState().redo();
    // Redo should do nothing since we branched
    expect(useHistoryStore.getState().nodes).toHaveLength(1);
    expect(useHistoryStore.getState().nodes[0].id).toBe('h3');
  });
});

describe('historyStore — labels', () => {
  beforeEach(reset);

  it('setNextHistoryLabel sets the label', () => {
    setNextHistoryLabel('Test Label');
    expect(getLastHistoryLabel()).toBe('Test Label');
  });

  it('addNode sets label to Add "<name>"', () => {
    useHistoryStore.getState().addNode(testNode);
    expect(getLastHistoryLabel()).toBe('Add "HistCube"');
  });

  it('addTrait sets label to Add trait @<name>', () => {
    useHistoryStore.getState().addNode({ ...testNode, traits: [] });
    useHistoryStore.getState().addTrait('h1', { name: 'audio', properties: {} });
    expect(getLastHistoryLabel()).toBe('Add trait @audio');
  });
});

describe('historyStore — clear', () => {
  beforeEach(reset);

  it('clear removes all history entries', () => {
    useHistoryStore.getState().addNode(testNode);
    useHistoryStore.getState().addNode({ ...testNode, id: 'h2' });
    useHistoryStore.temporal.getState().clear();
    const temporal = useHistoryStore.temporal.getState();
    expect(temporal.pastStates).toHaveLength(0);
    expect(temporal.futureStates).toHaveLength(0);
  });
});
