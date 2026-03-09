import { describe, it, expect, beforeEach } from 'vitest';
import { HierarchyPanel, HierarchyNode } from '../../editor/HierarchyPanel';

function makeNode(overrides: Partial<HierarchyNode> = {}): HierarchyNode {
  return {
    id: 'n1',
    name: 'Node',
    parentId: null,
    childIds: [],
    visible: true,
    locked: false,
    expanded: true,
    type: 'entity',
    ...overrides,
  };
}

describe('HierarchyPanel — Production Tests', () => {
  let hp: HierarchyPanel;

  beforeEach(() => {
    hp = new HierarchyPanel();
  });

  describe('addNode()', () => {
    it('adds a root node', () => {
      hp.addNode(makeNode({ id: 'root' }));
      expect(hp.getCount()).toBe(1);
      expect(hp.getNode('root')).toBeDefined();
    });

    it('registers child in parent childIds', () => {
      hp.addNode(makeNode({ id: 'parent', childIds: [] }));
      hp.addNode(makeNode({ id: 'child', parentId: 'parent', childIds: [] }));
      const parent = hp.getNode('parent')!;
      expect(parent.childIds).toContain('child');
    });

    it('does not duplicate childId when added repeatedly', () => {
      hp.addNode(makeNode({ id: 'parent', childIds: [] }));
      hp.addNode(makeNode({ id: 'child', parentId: 'parent', childIds: [] }));
      hp.addNode(makeNode({ id: 'child', parentId: 'parent', childIds: [] })); // re-add
      expect(hp.getNode('parent')!.childIds.filter((c) => c === 'child').length).toBe(1);
    });
  });

  describe('removeNode()', () => {
    it('removes a node', () => {
      hp.addNode(makeNode({ id: 'x' }));
      hp.removeNode('x');
      expect(hp.getNode('x')).toBeUndefined();
      expect(hp.getCount()).toBe(0);
    });

    it('is a no-op for non-existent node', () => {
      expect(() => hp.removeNode('ghost')).not.toThrow();
    });

    it('removes node from parent childIds', () => {
      hp.addNode(makeNode({ id: 'p', childIds: [] }));
      hp.addNode(makeNode({ id: 'c', parentId: 'p', childIds: [] }));
      hp.removeNode('c');
      expect(hp.getNode('p')!.childIds).not.toContain('c');
    });

    it('reparents children to grandparent on removal', () => {
      hp.addNode(makeNode({ id: 'gp', childIds: [] }));
      hp.addNode(makeNode({ id: 'p', parentId: 'gp', childIds: [] }));
      hp.addNode(makeNode({ id: 'c', parentId: 'p', childIds: [] }));
      hp.removeNode('p');
      const child = hp.getNode('c')!;
      expect(child.parentId).toBe('gp');
    });

    it('deselects removed node', () => {
      hp.addNode(makeNode({ id: 'x' }));
      hp.select('x');
      hp.removeNode('x');
      expect(hp.getSelection()).not.toContain('x');
    });
  });

  describe('reparent()', () => {
    it('moves node to a new parent', () => {
      hp.addNode(makeNode({ id: 'a', childIds: [] }));
      hp.addNode(makeNode({ id: 'b', childIds: [] }));
      hp.addNode(makeNode({ id: 'c', parentId: 'a', childIds: [] }));
      hp.reparent('c', 'b');
      expect(hp.getNode('c')!.parentId).toBe('b');
      expect(hp.getNode('b')!.childIds).toContain('c');
      expect(hp.getNode('a')!.childIds).not.toContain('c');
    });

    it('ignores reparent to self', () => {
      hp.addNode(makeNode({ id: 'a', childIds: [] }));
      hp.reparent('a', 'a');
      expect(hp.getNode('a')!.parentId).toBeNull();
    });

    it('ignores reparent into own descendant', () => {
      hp.addNode(makeNode({ id: 'p', childIds: [] }));
      hp.addNode(makeNode({ id: 'c', parentId: 'p', childIds: [] }));
      hp.reparent('p', 'c');
      expect(hp.getNode('p')!.parentId).toBeNull(); // unchanged
    });

    it('inserts at specific index', () => {
      hp.addNode(makeNode({ id: 'parent', childIds: [] }));
      hp.addNode(makeNode({ id: 'x', parentId: 'parent', childIds: [] }));
      hp.addNode(makeNode({ id: 'y', parentId: 'parent', childIds: [] }));
      hp.addNode(makeNode({ id: 'z', childIds: [] }));
      hp.reparent('z', 'parent', 0);
      expect(hp.getNode('parent')!.childIds[0]).toBe('z');
    });

    it('clears redo stack on new reparent', () => {
      hp.addNode(makeNode({ id: 'a', childIds: [] }));
      hp.addNode(makeNode({ id: 'b', childIds: [] }));
      hp.reparent('a', 'b');
      hp.undo();
      hp.reparent('a', 'b');
      // redo stack cleared; undo again should work
      hp.undo();
      expect(hp.getNode('a')!.parentId).toBeNull();
    });
  });

  describe('isDescendant()', () => {
    it('returns true for direct child', () => {
      hp.addNode(makeNode({ id: 'p', childIds: [] }));
      hp.addNode(makeNode({ id: 'c', parentId: 'p', childIds: [] }));
      expect(hp.isDescendant('c', 'p')).toBe(true);
    });

    it('returns true for grandchild', () => {
      hp.addNode(makeNode({ id: 'gp', childIds: [] }));
      hp.addNode(makeNode({ id: 'p', parentId: 'gp', childIds: [] }));
      hp.addNode(makeNode({ id: 'c', parentId: 'p', childIds: [] }));
      expect(hp.isDescendant('c', 'gp')).toBe(true);
    });

    it('returns false for unrelated node', () => {
      hp.addNode(makeNode({ id: 'a', childIds: [] }));
      hp.addNode(makeNode({ id: 'b', childIds: [] }));
      expect(hp.isDescendant('b', 'a')).toBe(false);
    });
  });

  describe('toggle visibility / locked / expanded', () => {
    it('toggleVisibility flips visible flag', () => {
      hp.addNode(makeNode({ id: 'x', visible: true }));
      hp.toggleVisibility('x');
      expect(hp.getNode('x')!.visible).toBe(false);
    });

    it('toggleLocked flips locked flag', () => {
      hp.addNode(makeNode({ id: 'x', locked: false }));
      hp.toggleLocked('x');
      expect(hp.getNode('x')!.locked).toBe(true);
    });

    it('toggleExpanded flips expanded flag', () => {
      hp.addNode(makeNode({ id: 'x', expanded: true }));
      hp.toggleExpanded('x');
      expect(hp.getNode('x')!.expanded).toBe(false);
    });
  });

  describe('selection', () => {
    it('select() replaces selection by default', () => {
      hp.addNode(makeNode({ id: 'a' }));
      hp.addNode(makeNode({ id: 'b' }));
      hp.select('a');
      hp.select('b');
      expect(hp.getSelection()).toEqual(['b']);
    });

    it('select() is additive when additive=true', () => {
      hp.select('a');
      hp.select('b', true);
      expect(hp.getSelection()).toContain('a');
      expect(hp.getSelection()).toContain('b');
    });

    it('deselect() removes a node from selection', () => {
      hp.select('a');
      hp.deselect('a');
      expect(hp.getSelection()).not.toContain('a');
    });

    it('clearSelection() empties selection', () => {
      hp.select('a');
      hp.select('b', true);
      hp.clearSelection();
      expect(hp.getSelection().length).toBe(0);
    });
  });

  describe('filter()', () => {
    beforeEach(() => {
      hp.addNode(
        makeNode({ id: 'a', name: 'Alpha', type: 'entity', visible: true, locked: false })
      );
      hp.addNode(makeNode({ id: 'b', name: 'Beta', type: 'light', visible: false, locked: false }));
      hp.addNode(
        makeNode({ id: 'c', name: 'Camera Main', type: 'camera', visible: true, locked: true })
      );
    });

    it('filters by name query (case-insensitive)', () => {
      const results = hp.filter({ query: 'alpha' });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('a');
    });

    it('filters by type', () => {
      const results = hp.filter({ types: ['light', 'camera'] });
      expect(results.length).toBe(2);
    });

    it('filters visible only', () => {
      const results = hp.filter({ visibleOnly: true });
      expect(results.every((n) => n.visible)).toBe(true);
    });

    it('filters unlocked only', () => {
      const results = hp.filter({ unlockedOnly: true });
      expect(results.every((n) => !n.locked)).toBe(true);
    });

    it('returns all nodes with empty filter', () => {
      expect(hp.filter({})).toHaveLength(3);
    });
  });

  describe('getRoots() / getChildren()', () => {
    it('getRoots returns nodes with no parent', () => {
      hp.addNode(makeNode({ id: 'root1', childIds: [] }));
      hp.addNode(makeNode({ id: 'root2', childIds: [] }));
      hp.addNode(makeNode({ id: 'child', parentId: 'root1', childIds: [] }));
      expect(hp.getRoots().length).toBe(2);
    });

    it('getChildren returns children of a node', () => {
      hp.addNode(makeNode({ id: 'p', childIds: [] }));
      hp.addNode(makeNode({ id: 'c1', parentId: 'p', childIds: [] }));
      hp.addNode(makeNode({ id: 'c2', parentId: 'p', childIds: [] }));
      expect(hp.getChildren('p').length).toBe(2);
    });

    it('getChildren returns [] for missing node', () => {
      expect(hp.getChildren('ghost')).toEqual([]);
    });
  });

  describe('getFlatTree()', () => {
    it('includes root and visible children (DFS)', () => {
      hp.addNode(makeNode({ id: 'r', expanded: true, childIds: [] }));
      hp.addNode(makeNode({ id: 'c', parentId: 'r', expanded: false, childIds: [] }));
      hp.addNode(makeNode({ id: 'gc', parentId: 'c', childIds: [] }));
      const flat = hp.getFlatTree();
      expect(flat.map((n) => n.id)).toEqual(['r', 'c']); // gc not visible (c collapsed)
    });
  });

  describe('undo() / getUndoCount()', () => {
    it('undoes a reparent operation', () => {
      hp.addNode(makeNode({ id: 'a', childIds: [] }));
      hp.addNode(makeNode({ id: 'b', childIds: [] }));
      hp.reparent('a', 'b');
      expect(hp.getNode('a')!.parentId).toBe('b');
      hp.undo();
      expect(hp.getNode('a')!.parentId).toBeNull();
    });

    it('getUndoCount tracks stack size', () => {
      hp.addNode(makeNode({ id: 'a', childIds: [] }));
      hp.addNode(makeNode({ id: 'b', childIds: [] }));
      hp.reparent('a', 'b');
      expect(hp.getUndoCount()).toBe(1);
      hp.undo();
      expect(hp.getUndoCount()).toBe(0);
    });

    it('is a no-op when undo stack is empty', () => {
      expect(() => hp.undo()).not.toThrow();
    });
  });
});
