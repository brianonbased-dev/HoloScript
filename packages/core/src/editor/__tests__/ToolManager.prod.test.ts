import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolManager, EditorTool, PointerEvent3D } from '../../editor/ToolManager';

function makeTool(overrides: Partial<EditorTool> = {}): EditorTool {
  return {
    id: 'test-tool',
    name: 'Test Tool',
    category: 'transform',
    ...overrides,
  };
}

const mockPointerEvent: PointerEvent3D = {
  x: 1,
  y: 2,
  z: 0,
  button: 0,
  shiftKey: false,
  ctrlKey: false,
};

describe('ToolManager — Production Tests', () => {
  let tm: ToolManager;

  beforeEach(() => {
    tm = new ToolManager();
  });

  describe('registerTool()', () => {
    it('registers a tool', () => {
      const tool = makeTool();
      tm.registerTool(tool);
      expect(tm.getToolCount()).toBe(1);
    });

    it('multiple tools are all registered', () => {
      tm.registerTool(makeTool({ id: 'a' }));
      tm.registerTool(makeTool({ id: 'b' }));
      expect(tm.getToolCount()).toBe(2);
    });

    it('tool with shortcut registers shortcut binding', () => {
      tm.registerTool(makeTool({ id: 'move', shortcut: 'g' }));
      const shortcuts = tm.getShortcuts();
      expect(shortcuts.some((s) => s.key === 'g' && s.toolId === 'move')).toBe(true);
    });
  });

  describe('unregisterTool()', () => {
    it('removes a registered tool', () => {
      tm.registerTool(makeTool({ id: 'x' }));
      tm.unregisterTool('x');
      expect(tm.getToolCount()).toBe(0);
    });

    it('returns false for non-existent tool', () => {
      expect(tm.unregisterTool('ghost')).toBe(false);
    });

    it('deactivates tool if it was active on unregister', () => {
      tm.registerTool(makeTool({ id: 'r' }));
      tm.activateTool('r');
      tm.unregisterTool('r');
      // Tool is deleted from map, so getActiveTool() returns null
      expect(tm.getActiveTool()).toBeNull();
    });

    it('removes shortcut bindings when tool unregistered', () => {
      tm.registerTool(makeTool({ id: 'move', shortcut: 'g' }));
      tm.unregisterTool('move');
      const shortcuts = tm.getShortcuts();
      expect(shortcuts.some((s) => s.toolId === 'move')).toBe(false);
    });
  });

  describe('activateTool()', () => {
    it('activates a registered tool', () => {
      tm.registerTool(makeTool({ id: 'select' }));
      const result = tm.activateTool('select');
      expect(result).toBe(true);
      expect(tm.getActiveToolId()).toBe('select');
    });

    it('returns false for non-existent tool', () => {
      expect(tm.activateTool('ghost')).toBe(false);
    });

    it('calls onActivate when tool is activated', () => {
      const onActivate = vi.fn();
      tm.registerTool(makeTool({ id: 'a', onActivate }));
      tm.activateTool('a');
      expect(onActivate).toHaveBeenCalledOnce();
    });

    it('calls onDeactivate on previously active tool', () => {
      const onDeactivate = vi.fn();
      tm.registerTool(makeTool({ id: 'a', onDeactivate }));
      tm.registerTool(makeTool({ id: 'b' }));
      tm.activateTool('a');
      tm.activateTool('b');
      expect(onDeactivate).toHaveBeenCalledOnce();
    });

    it('marks old tool as isActive=false after switch', () => {
      tm.registerTool(makeTool({ id: 'a' }));
      tm.registerTool(makeTool({ id: 'b' }));
      tm.activateTool('a');
      tm.activateTool('b');
      const toolA = tm.getTools().find((t) => t.id === 'a')!;
      expect(toolA.isActive).toBe(false);
    });

    it('records tool history', () => {
      tm.registerTool(makeTool({ id: 'a' }));
      tm.registerTool(makeTool({ id: 'b' }));
      tm.activateTool('a');
      tm.activateTool('b');
      expect(tm.getToolHistory()).toEqual(['a', 'b']);
    });
  });

  describe('getActiveTool()', () => {
    it('returns null before any activation', () => {
      expect(tm.getActiveTool()).toBeNull();
    });

    it('returns active tool after activation', () => {
      tm.registerTool(makeTool({ id: 'scale' }));
      tm.activateTool('scale');
      expect(tm.getActiveTool()?.id).toBe('scale');
    });
  });

  describe('revertToPreviousTool()', () => {
    it('switches back to previous tool', () => {
      tm.registerTool(makeTool({ id: 'a' }));
      tm.registerTool(makeTool({ id: 'b' }));
      tm.activateTool('a');
      tm.activateTool('b');
      tm.revertToPreviousTool();
      expect(tm.getActiveToolId()).toBe('a');
    });

    it('returns false if no previous tool', () => {
      expect(tm.revertToPreviousTool()).toBe(false);
    });
  });

  describe('getToolsByCategory()', () => {
    it('filters tools by category', () => {
      tm.registerTool(makeTool({ id: 'move', category: 'transform' }));
      tm.registerTool(makeTool({ id: 'box', category: 'create' }));
      tm.registerTool(makeTool({ id: 'rotate', category: 'transform' }));
      const transforms = tm.getToolsByCategory('transform');
      expect(transforms.length).toBe(2);
      expect(transforms.every((t) => t.category === 'transform')).toBe(true);
    });
  });

  describe('handleKeyEvent()', () => {
    it('activates tool bound to key', () => {
      tm.registerTool(makeTool({ id: 'move', shortcut: 'g' }));
      const result = tm.handleKeyEvent('g');
      expect(result).toBe(true);
      expect(tm.getActiveToolId()).toBe('move');
    });

    it('is case-insensitive for key matching', () => {
      tm.registerTool(makeTool({ id: 'move', shortcut: 'G' }));
      const result = tm.handleKeyEvent('g');
      expect(result).toBe(true);
    });

    it('returns false for unbound key', () => {
      expect(tm.handleKeyEvent('z')).toBe(false);
    });

    it('calls custom handler shortcut', () => {
      const handler = vi.fn();
      tm.registerShortcut({ key: 'ctrl+z', modifiers: ['ctrl'], handler });
      tm.handleKeyEvent('ctrl+z', ['ctrl']);
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('pointer event forwarding', () => {
    it('forwards pointerDown to active tool', () => {
      const onPointerDown = vi.fn();
      tm.registerTool(makeTool({ id: 'draw', onPointerDown }));
      tm.activateTool('draw');
      tm.handlePointerDown(mockPointerEvent);
      expect(onPointerDown).toHaveBeenCalledWith(mockPointerEvent);
    });

    it('forwards pointerMove to active tool', () => {
      const onPointerMove = vi.fn();
      tm.registerTool(makeTool({ id: 'draw', onPointerMove }));
      tm.activateTool('draw');
      tm.handlePointerMove(mockPointerEvent);
      expect(onPointerMove).toHaveBeenCalledWith(mockPointerEvent);
    });

    it('forwards pointerUp to active tool', () => {
      const onPointerUp = vi.fn();
      tm.registerTool(makeTool({ id: 'draw', onPointerUp }));
      tm.activateTool('draw');
      tm.handlePointerUp(mockPointerEvent);
      expect(onPointerUp).toHaveBeenCalledWith(mockPointerEvent);
    });

    it('does not throw when no tool is active', () => {
      expect(() => tm.handlePointerDown(mockPointerEvent)).not.toThrow();
      expect(() => tm.handlePointerMove(mockPointerEvent)).not.toThrow();
      expect(() => tm.handlePointerUp(mockPointerEvent)).not.toThrow();
    });
  });
});
