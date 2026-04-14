import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HoloScriptPlusRuntimeImpl } from '@holoscript/engine/runtime/HoloScriptPlusRuntime';
import { createVirtualKeyboard } from '../ui/VirtualKeyboard';
import { createTextInput } from '../ui/UIComponents';

// Mock Physics logic
vi.mock('@holoscript/engine/physics/PhysicsWorldImpl', () => {
  return {
    PhysicsWorldImpl: class {
      constructor() {}
      step = vi.fn();
      addBody = vi.fn();
      getBody = vi.fn().mockReturnValue({ velocity: [0, 0, 0 ] });
      addConstraint = vi.fn();
      removeConstraints = vi.fn();
      getContacts = vi.fn().mockReturnValue([]);
      raycast = vi.fn();
      getStates = vi.fn().mockReturnValue({});
    },
  };
});
vi.mock('@holoscript/engine/rendering/webgpu/WebGPURenderer', () => {

describe('Advanced Interaction System', () => {
  let runtime: HoloScriptPlusRuntimeImpl;

  beforeEach(() => {
    const mockAST = {
      root: { type: 'composition', id: 'root', children: [], traits: new Map(), properties: {} },
      imports: [],
      version: 1,
    };
    runtime = new HoloScriptPlusRuntimeImpl(mockAST as any, { vrEnabled: true });

    if (!(runtime as any).rootInstance) {
      (runtime as any).rootInstance = {
        id: 'root',
        children: [],
        traits: new Map(),
        properties: {},
        lifecycleHandlers: new Map(),
        node: { id: 'root', type: 'composition', children: [], traits: new Map(), properties: {} },
      };
    }
  });

  it('Handles Cursor Navigation and Insertion', () => {
    const inputNode = createTextInput({ id: 'cursor_input', text: 'Hello' });
    const root = (runtime as any).rootInstance;

    const instantiate = (node: any) => ({
      __holo_id: node.id,
      node: node,
      properties: node.properties || {},
      children: (node.children || []).map(instantiate),
      lifecycleHandlers: new Map(),
      parent: root,
    });
    root.children.push(instantiate(inputNode));

    // Focus (Cursor should be at end: 5)
    (runtime as any).emit('ui_press_end', { nodeId: 'cursor_input' });

    // Move Left (Index -> 4)
    (runtime as any).emit('ui_press_end', { nodeId: 'kb_key_LEFT' });

    // Type 'X' (Insert at 4 -> "HellXo")
    (runtime as any).emit('ui_press_end', { nodeId: 'kb_key_X' });

    const inputInstance = (runtime as any).findInstanceById('cursor_input');
    expect(inputInstance.node.properties.text).toBe('HellXo');

    // Move Right (Index -> 6, end)
    (runtime as any).emit('ui_press_end', { nodeId: 'kb_key_RIGHT' });
    // Right again (Index -> 6, clamped)
    (runtime as any).emit('ui_press_end', { nodeId: 'kb_key_RIGHT' });

    // Type 'Y' (Append -> "HellXoY")
    (runtime as any).emit('ui_press_end', { nodeId: 'kb_key_Y' });
    expect(inputInstance.node.properties.text).toBe('HellXoY');
  });

  it('Handles Backspace at Cursor', () => {
    const inputNode = createTextInput({ id: 'bs_input', text: 'ABC' });
    const root = (runtime as any).rootInstance;

    const instantiate = (node: any) => ({
      __holo_id: node.id,
      node: node,
      properties: node.properties || {},
      children: (node.children || []).map(instantiate),
      lifecycleHandlers: new Map(),
      parent: root,
    });
    root.children.push(instantiate(inputNode));

    // Focus (Index 3)
    (runtime as any).emit('ui_press_end', { nodeId: 'bs_input' });

    // Move Left (Index 2, between B and C)
    (runtime as any).emit('ui_press_end', { nodeId: 'kb_key_LEFT' });

    // Backspace (Remove B -> "AC")
    (runtime as any).emit('ui_press_end', { nodeId: 'kb_key_BACKSPACE' });

    const inputInstance = (runtime as any).findInstanceById('bs_input');
    expect(inputInstance.node.properties.text).toBe('AC');

    // Type 'D' -> "ADC"
    (runtime as any).emit('ui_press_end', { nodeId: 'kb_key_D' });
    expect(inputInstance.node.properties.text).toBe('ADC');
  });
});
