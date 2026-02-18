import { describe, it, expect, vi } from 'vitest';
import { ToolManager, type EditorTool, type PointerEvent3D } from '../ToolManager';

function makeTool(id: string, opts: Partial<EditorTool> = {}): EditorTool {
  return { id, name: `Tool ${id}`, category: 'transform', ...opts };
}

describe('ToolManager', () => {
  it('registerTool adds tool', () => {
    const mgr = new ToolManager();
    mgr.registerTool(makeTool('move'));
    expect(mgr.getToolCount()).toBe(1);
    expect(mgr.getTools()[0].id).toBe('move');
  });

  it('registerTool with shortcut auto-registers binding', () => {
    const mgr = new ToolManager();
    mgr.registerTool(makeTool('move', { shortcut: 'w' }));
    expect(mgr.getShortcuts().length).toBe(1);
    expect(mgr.getShortcuts()[0].key).toBe('w');
  });

  it('unregisterTool removes tool and shortcut', () => {
    const mgr = new ToolManager();
    mgr.registerTool(makeTool('move', { shortcut: 'w' }));
    mgr.unregisterTool('move');
    expect(mgr.getToolCount()).toBe(0);
    expect(mgr.getShortcuts().length).toBe(0);
  });

  it('activateTool sets active', () => {
    const mgr = new ToolManager();
    const onActivate = vi.fn();
    mgr.registerTool(makeTool('move', { onActivate }));
    expect(mgr.activateTool('move')).toBe(true);
    expect(mgr.getActiveToolId()).toBe('move');
    expect(onActivate).toHaveBeenCalled();
  });

  it('activateTool returns false for unknown', () => {
    const mgr = new ToolManager();
    expect(mgr.activateTool('nope')).toBe(false);
  });

  it('activateTool deactivates previous', () => {
    const mgr = new ToolManager();
    const onDeactivate = vi.fn();
    mgr.registerTool(makeTool('move', { onDeactivate }));
    mgr.registerTool(makeTool('rotate'));
    mgr.activateTool('move');
    mgr.activateTool('rotate');
    expect(onDeactivate).toHaveBeenCalled();
    expect(mgr.getActiveToolId()).toBe('rotate');
  });

  it('deactivateCurrentTool clears active', () => {
    const mgr = new ToolManager();
    mgr.registerTool(makeTool('move'));
    mgr.activateTool('move');
    mgr.deactivateCurrentTool();
    expect(mgr.getActiveTool()?.isActive).toBe(false);
  });

  it('revertToPreviousTool switches back', () => {
    const mgr = new ToolManager();
    mgr.registerTool(makeTool('move'));
    mgr.registerTool(makeTool('rotate'));
    mgr.activateTool('move');
    mgr.activateTool('rotate');
    expect(mgr.revertToPreviousTool()).toBe(true);
    expect(mgr.getActiveToolId()).toBe('move');
  });

  it('revertToPreviousTool returns false without history', () => {
    const mgr = new ToolManager();
    expect(mgr.revertToPreviousTool()).toBe(false);
  });

  it('getToolsByCategory filters', () => {
    const mgr = new ToolManager();
    mgr.registerTool(makeTool('move', { category: 'transform' }));
    mgr.registerTool(makeTool('paint', { category: 'sculpt' }));
    mgr.registerTool(makeTool('select', { category: 'select' }));
    expect(mgr.getToolsByCategory('transform').length).toBe(1);
    expect(mgr.getToolsByCategory('sculpt').length).toBe(1);
  });

  it('handleKeyEvent activates tool by shortcut', () => {
    const mgr = new ToolManager();
    mgr.registerTool(makeTool('move', { shortcut: 'w' }));
    expect(mgr.handleKeyEvent('w')).toBe(true);
    expect(mgr.getActiveToolId()).toBe('move');
  });

  it('handleKeyEvent is case-insensitive', () => {
    const mgr = new ToolManager();
    mgr.registerTool(makeTool('move', { shortcut: 'w' }));
    expect(mgr.handleKeyEvent('W')).toBe(true);
  });

  it('handleKeyEvent executes custom handler', () => {
    const mgr = new ToolManager();
    const handler = vi.fn();
    mgr.registerShortcut({ key: 'z', modifiers: ['ctrl'], handler });
    expect(mgr.handleKeyEvent('z', ['ctrl'])).toBe(true);
    expect(handler).toHaveBeenCalled();
  });

  it('handleKeyEvent returns false for no match', () => {
    const mgr = new ToolManager();
    expect(mgr.handleKeyEvent('x')).toBe(false);
  });

  it('handlePointerDown forwards to active tool', () => {
    const mgr = new ToolManager();
    const onPointerDown = vi.fn();
    mgr.registerTool(makeTool('move', { onPointerDown }));
    mgr.activateTool('move');
    const evt: PointerEvent3D = { x: 1, y: 2, z: 3, button: 0, shiftKey: false, ctrlKey: false };
    mgr.handlePointerDown(evt);
    expect(onPointerDown).toHaveBeenCalledWith(evt);
  });

  it('getToolHistory tracks activations', () => {
    const mgr = new ToolManager();
    mgr.registerTool(makeTool('move'));
    mgr.registerTool(makeTool('rotate'));
    mgr.activateTool('move');
    mgr.activateTool('rotate');
    mgr.activateTool('move');
    expect(mgr.getToolHistory()).toEqual(['move', 'rotate', 'move']);
  });

  it('tool history is capped', () => {
    const mgr = new ToolManager();
    for (let i = 0; i < 25; i++) {
      const id = `tool${i}`;
      mgr.registerTool(makeTool(id));
      mgr.activateTool(id);
    }
    expect(mgr.getToolHistory().length).toBe(20);
  });
});
