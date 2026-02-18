import { describe, it, expect, beforeEach } from 'vitest';
import { HierarchyPanel, HierarchyNode } from '../HierarchyPanel';

function makeNode(id: string, parentId: string | null = null, opts: Partial<HierarchyNode> = {}): HierarchyNode {
  return {
    id,
    name: opts.name ?? id,
    parentId,
    childIds: [],
    visible: opts.visible ?? true,
    locked: opts.locked ?? false,
    expanded: opts.expanded ?? true,
    type: opts.type ?? 'entity',
  };
}

describe('HierarchyPanel', () => {
  let panel: HierarchyPanel;

  beforeEach(() => {
    panel = new HierarchyPanel();
  });

  // ---- Add / Remove ----

  it('addNode registers a node', () => {
    panel.addNode(makeNode('a'));
    expect(panel.getNode('a')).toBeDefined();
    expect(panel.getCount()).toBe(1);
  });

  it('addNode with parent links child', () => {
    panel.addNode(makeNode('root'));
    panel.addNode(makeNode('child', 'root'));
    const root = panel.getNode('root')!;
    expect(root.childIds).toContain('child');
  });

  it('removeNode reparents children to parent', () => {
    panel.addNode(makeNode('root'));
    panel.addNode(makeNode('mid', 'root'));
    panel.addNode(makeNode('leaf', 'mid'));
    panel.removeNode('mid');
    expect(panel.getNode('leaf')!.parentId).toBe('root');
    expect(panel.getNode('root')!.childIds).toContain('leaf');
    expect(panel.getCount()).toBe(2);
  });

  it('removeNode cleans parent childIds', () => {
    panel.addNode(makeNode('root'));
    panel.addNode(makeNode('child', 'root'));
    panel.removeNode('child');
    expect(panel.getNode('root')!.childIds).not.toContain('child');
  });

  // ---- Reparent ----

  it('reparent moves node to new parent', () => {
    panel.addNode(makeNode('a'));
    panel.addNode(makeNode('b'));
    panel.addNode(makeNode('c', 'a'));
    panel.reparent('c', 'b');
    expect(panel.getNode('c')!.parentId).toBe('b');
    expect(panel.getNode('b')!.childIds).toContain('c');
    expect(panel.getNode('a')!.childIds).not.toContain('c');
  });

  it('reparent at index inserts at position', () => {
    panel.addNode(makeNode('root'));
    panel.addNode(makeNode('a', 'root'));
    panel.addNode(makeNode('b', 'root'));
    panel.addNode(makeNode('x'));
    panel.reparent('x', 'root', 0);
    expect(panel.getNode('root')!.childIds[0]).toBe('x');
  });

  it('reparent prevents cycle (into own descendant)', () => {
    panel.addNode(makeNode('root'));
    panel.addNode(makeNode('child', 'root'));
    panel.reparent('root', 'child');
    // Should be a no-op
    expect(panel.getNode('root')!.parentId).toBe(null);
  });

  it('reparent self is no-op', () => {
    panel.addNode(makeNode('a'));
    panel.reparent('a', 'a');
    expect(panel.getNode('a')!.parentId).toBe(null);
  });

  // ---- Undo ----

  it('undo reverses reparent', () => {
    panel.addNode(makeNode('root'));
    panel.addNode(makeNode('child', 'root'));
    panel.addNode(makeNode('other'));
    panel.reparent('child', 'other');
    panel.undo();
    expect(panel.getNode('child')!.parentId).toBe('root');
    expect(panel.getNode('root')!.childIds).toContain('child');
  });

  it('getUndoCount tracks operations', () => {
    panel.addNode(makeNode('a'));
    panel.addNode(makeNode('b'));
    panel.reparent('a', 'b');
    expect(panel.getUndoCount()).toBe(1);
    panel.reparent('a', null);
    expect(panel.getUndoCount()).toBe(2);
  });

  // ---- Visibility / Lock / Expand ----

  it('toggleVisibility flips visibility', () => {
    panel.addNode(makeNode('a', null, { visible: true }));
    panel.toggleVisibility('a');
    expect(panel.getNode('a')!.visible).toBe(false);
    panel.toggleVisibility('a');
    expect(panel.getNode('a')!.visible).toBe(true);
  });

  it('toggleLocked flips lock', () => {
    panel.addNode(makeNode('a'));
    panel.toggleLocked('a');
    expect(panel.getNode('a')!.locked).toBe(true);
  });

  it('toggleExpanded flips expanded', () => {
    panel.addNode(makeNode('a', null, { expanded: true }));
    panel.toggleExpanded('a');
    expect(panel.getNode('a')!.expanded).toBe(false);
  });

  // ---- Selection ----

  it('select adds to selection', () => {
    panel.addNode(makeNode('a'));
    panel.select('a');
    expect(panel.getSelection()).toEqual(['a']);
  });

  it('select without additive clears previous', () => {
    panel.addNode(makeNode('a'));
    panel.addNode(makeNode('b'));
    panel.select('a');
    panel.select('b');
    expect(panel.getSelection()).toEqual(['b']);
  });

  it('select with additive keeps both', () => {
    panel.addNode(makeNode('a'));
    panel.addNode(makeNode('b'));
    panel.select('a');
    panel.select('b', true);
    expect(panel.getSelection()).toContain('a');
    expect(panel.getSelection()).toContain('b');
  });

  it('deselect removes from selection', () => {
    panel.addNode(makeNode('a'));
    panel.select('a');
    panel.deselect('a');
    expect(panel.getSelection()).toEqual([]);
  });

  it('clearSelection empties selection', () => {
    panel.select('a');
    panel.select('b', true);
    panel.clearSelection();
    expect(panel.getSelection()).toEqual([]);
  });

  // ---- Filter ----

  it('filter by query matches name', () => {
    panel.addNode(makeNode('player', null, { name: 'Player' }));
    panel.addNode(makeNode('enemy', null, { name: 'Enemy' }));
    const results = panel.filter({ query: 'play' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('player');
  });

  it('filter by type', () => {
    panel.addNode(makeNode('l1', null, { type: 'light' }));
    panel.addNode(makeNode('e1', null, { type: 'entity' }));
    const lights = panel.filter({ types: ['light'] });
    expect(lights.length).toBe(1);
  });

  it('filter visibleOnly', () => {
    panel.addNode(makeNode('v', null, { visible: true }));
    panel.addNode(makeNode('h', null, { visible: false }));
    const vis = panel.filter({ visibleOnly: true });
    expect(vis.length).toBe(1);
    expect(vis[0].id).toBe('v');
  });

  // ---- Tree / Roots ----

  it('getRoots returns parentless nodes', () => {
    panel.addNode(makeNode('r1'));
    panel.addNode(makeNode('r2'));
    panel.addNode(makeNode('c', 'r1'));
    expect(panel.getRoots().length).toBe(2);
  });

  it('getChildren returns child nodes', () => {
    panel.addNode(makeNode('root'));
    panel.addNode(makeNode('a', 'root'));
    panel.addNode(makeNode('b', 'root'));
    expect(panel.getChildren('root').length).toBe(2);
  });

  it('getFlatTree respects expanded state', () => {
    panel.addNode(makeNode('root', null, { expanded: false }));
    panel.addNode(makeNode('child', 'root'));
    const flat = panel.getFlatTree();
    expect(flat.length).toBe(1); // root only, collapsed
  });

  it('getFlatTree includes children when expanded', () => {
    panel.addNode(makeNode('root', null, { expanded: true }));
    panel.addNode(makeNode('child', 'root'));
    const flat = panel.getFlatTree();
    expect(flat.length).toBe(2);
  });

  // ---- isDescendant ----

  it('isDescendant returns true for child', () => {
    panel.addNode(makeNode('root'));
    panel.addNode(makeNode('child', 'root'));
    expect(panel.isDescendant('child', 'root')).toBe(true);
  });

  it('isDescendant returns true for grandchild', () => {
    panel.addNode(makeNode('root'));
    panel.addNode(makeNode('mid', 'root'));
    panel.addNode(makeNode('leaf', 'mid'));
    expect(panel.isDescendant('leaf', 'root')).toBe(true);
  });

  it('isDescendant returns false for unrelated', () => {
    panel.addNode(makeNode('a'));
    panel.addNode(makeNode('b'));
    expect(panel.isDescendant('a', 'b')).toBe(false);
  });
});
