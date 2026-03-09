import { describe, it, expect, beforeEach } from 'vitest';
import { HierarchyPanel } from '../editor/HierarchyPanel';
import { PropertyGrid } from '../editor/PropertyGrid';
import { ToolManager } from '../editor/ToolManager';

describe('World Editor Polish (Cycle 169)', () => {
  // ===========================================================================
  // HierarchyPanel
  // ===========================================================================
  describe('HierarchyPanel', () => {
    let panel: HierarchyPanel;

    beforeEach(() => {
      panel = new HierarchyPanel();
      panel.addNode({
        id: 'root',
        name: 'Scene',
        parentId: null,
        childIds: [],
        visible: true,
        locked: false,
        expanded: true,
        type: 'group',
      });
      panel.addNode({
        id: 'cube',
        name: 'MyCube',
        parentId: 'root',
        childIds: [],
        visible: true,
        locked: false,
        expanded: false,
        type: 'entity',
      });
      panel.addNode({
        id: 'light',
        name: 'SunLight',
        parentId: 'root',
        childIds: [],
        visible: true,
        locked: false,
        expanded: false,
        type: 'light',
      });
    });

    it('should add and retrieve nodes', () => {
      expect(panel.getCount()).toBe(3);
      expect(panel.getNode('cube')?.name).toBe('MyCube');
    });

    it('should get root nodes', () => {
      const roots = panel.getRoots();
      expect(roots).toHaveLength(1);
      expect(roots[0].id).toBe('root');
    });

    it('should reparent nodes with undo', () => {
      panel.addNode({
        id: 'group2',
        name: 'Group2',
        parentId: null,
        childIds: [],
        visible: true,
        locked: false,
        expanded: true,
        type: 'group',
      });
      panel.reparent('cube', 'group2');
      expect(panel.getNode('cube')?.parentId).toBe('group2');
      expect(panel.getChildren('group2').map((n) => n.id)).toContain('cube');

      panel.undo();
      expect(panel.getNode('cube')?.parentId).toBe('root');
    });

    it('should filter nodes by search query', () => {
      const results = panel.filter({ query: 'sun' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('light');
    });

    it('should filter by type', () => {
      const lights = panel.filter({ types: ['light'] });
      expect(lights).toHaveLength(1);
    });

    it('should toggle visibility and lock', () => {
      panel.toggleVisibility('cube');
      expect(panel.getNode('cube')?.visible).toBe(false);
      panel.toggleLocked('cube');
      expect(panel.getNode('cube')?.locked).toBe(true);
    });

    it('should manage selection', () => {
      panel.select('cube');
      expect(panel.getSelection()).toEqual(['cube']);
      panel.select('light', true); // additive
      expect(panel.getSelection()).toHaveLength(2);
      panel.clearSelection();
      expect(panel.getSelection()).toHaveLength(0);
    });

    it('should build flat tree with expand/collapse', () => {
      const flat = panel.getFlatTree();
      expect(flat.map((n) => n.id)).toEqual(['root', 'cube', 'light']);

      panel.toggleExpanded('root');
      const collapsed = panel.getFlatTree();
      expect(collapsed.map((n) => n.id)).toEqual(['root']); // children hidden
    });
  });

  // ===========================================================================
  // PropertyGrid
  // ===========================================================================
  describe('PropertyGrid', () => {
    let grid: PropertyGrid;

    beforeEach(() => {
      grid = new PropertyGrid();
      grid.registerDescriptors('Transform', [
        { key: 'x', type: 'number', min: -100, max: 100, group: 'Position' },
        { key: 'y', type: 'number', min: -100, max: 100, group: 'Position' },
        { key: 'visible', type: 'boolean', group: 'Display' },
        { key: 'mode', type: 'enum', enumValues: ['static', 'dynamic'], group: 'Physics' },
      ]);
      grid.setValues('entity1', { x: 0, y: 5, visible: true, mode: 'static' });
    });

    it('should register and retrieve descriptors', () => {
      expect(grid.getDescriptors('Transform')).toHaveLength(4);
    });

    it('should set values with undo history', () => {
      grid.setValue('entity1', 'x', 10);
      expect(grid.getValues('entity1')?.x).toBe(10);
      expect(grid.getHistoryCount()).toBe(1);

      const undone = grid.undo();
      expect(undone?.oldValue).toBe(0);
      expect(grid.getValues('entity1')?.x).toBe(0);
    });

    it('should batch edit across targets', () => {
      grid.setValues('entity2', { x: 3, y: 7, visible: false, mode: 'dynamic' });
      const count = grid.batchSetValue(['entity1', 'entity2'], 'visible', false);
      expect(count).toBe(2);
      expect(grid.getValues('entity1')?.visible).toBe(false);
      expect(grid.getValues('entity2')?.visible).toBe(false);
    });

    it('should validate property values', () => {
      const desc = grid.getDescriptors('Transform')[0]; // x, min=-100, max=100
      expect(grid.validate(desc, 50).valid).toBe(true);
      expect(grid.validate(desc, 200).valid).toBe(false);
      expect(grid.validate(desc, 'bad').valid).toBe(false);
    });

    it('should organize descriptors by group', () => {
      const grouped = grid.getGroupedDescriptors('Transform');
      expect(grouped.get('Position')).toHaveLength(2);
      expect(grouped.get('Display')).toHaveLength(1);
    });
  });

  // ===========================================================================
  // ToolManager
  // ===========================================================================
  describe('ToolManager', () => {
    let manager: ToolManager;
    const activateLog: string[] = [];

    beforeEach(() => {
      activateLog.length = 0;
      manager = new ToolManager();
      manager.registerTool({
        id: 'select',
        name: 'Select',
        category: 'select',
        shortcut: 'q',
        onActivate: () => activateLog.push('select:on'),
        onDeactivate: () => activateLog.push('select:off'),
      });
      manager.registerTool({
        id: 'move',
        name: 'Move',
        category: 'transform',
        shortcut: 'w',
        onActivate: () => activateLog.push('move:on'),
      });
      manager.registerTool({
        id: 'rotate',
        name: 'Rotate',
        category: 'transform',
        shortcut: 'e',
      });
    });

    it('should register and list tools', () => {
      expect(manager.getToolCount()).toBe(3);
      expect(manager.getToolsByCategory('transform')).toHaveLength(2);
    });

    it('should activate and deactivate tools', () => {
      manager.activateTool('select');
      expect(manager.getActiveToolId()).toBe('select');

      manager.activateTool('move');
      expect(manager.getActiveToolId()).toBe('move');
      expect(activateLog).toContain('select:off');
      expect(activateLog).toContain('move:on');
    });

    it('should handle keyboard shortcuts', () => {
      manager.handleKeyEvent('w');
      expect(manager.getActiveToolId()).toBe('move');
      manager.handleKeyEvent('e');
      expect(manager.getActiveToolId()).toBe('rotate');
    });

    it('should revert to previous tool', () => {
      manager.activateTool('select');
      manager.activateTool('move');
      manager.revertToPreviousTool();
      expect(manager.getActiveToolId()).toBe('select');
    });

    it('should track tool history', () => {
      manager.activateTool('select');
      manager.activateTool('move');
      manager.activateTool('rotate');
      const history = manager.getToolHistory();
      expect(history).toEqual(['select', 'move', 'rotate']);
    });
  });
});
