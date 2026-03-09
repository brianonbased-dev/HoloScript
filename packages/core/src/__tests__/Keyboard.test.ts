import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HoloScriptPlusRuntimeImpl } from '../runtime/HoloScriptPlusRuntime';
import { createVirtualKeyboard } from '../ui/VirtualKeyboard';
import { createTextInput } from '../ui/UIComponents';

// Mock Physics logic with Class structure
vi.mock('../physics/PhysicsWorldImpl', () => {
  return {
    PhysicsWorldImpl: class {
      constructor() {}
      step = vi.fn();
      addBody = vi.fn();
      getBody = vi.fn().mockReturnValue({ velocity: { x: 0, y: 0, z: 0 } });
      addConstraint = vi.fn();
      removeConstraints = vi.fn();
      getContacts = vi.fn().mockReturnValue([]);
      raycast = vi.fn();
      getStates = vi.fn().mockReturnValue({});
    },
  };
});
vi.mock('../render/webgpu/WebGPURenderer', () => ({ WebGPURenderer: vi.fn() }));

describe('Virtual Keyboard System', () => {
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

  it('Updates TextInput when key is pressed', () => {
    const inputNode = createTextInput({ id: 'my_input', text: 'Hello' });
    const keyboardNode = createVirtualKeyboard('kb_1', { x: 0, y: 0, z: 0 }, () => {});

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
    root.children.push(instantiate(keyboardNode));

    // Focus
    (runtime as any).emit('ui_press_end', { nodeId: 'my_input' });

    // Press 'A'
    (runtime as any).emit('ui_press_end', { nodeId: 'kb_1_key_A' });

    const inputInstance = (runtime as any).findInstanceById('my_input');
    expect(inputInstance).toBeDefined();

    // Check updated text
    // Note: The Runtime logic updates the PROPERTY object.
    expect(inputInstance.node.properties.text).toBe('HelloA');

    // Verify child text node update
    const textChild = inputInstance.children.find((c: any) => c.node.type === 'text');
    expect(textChild).toBeDefined();
    expect(textChild.node.properties.text).toBe('HelloA');
  });

  it('Handles Backspace', () => {
    const inputNode = createTextInput({ id: 'input_2', text: 'Hi' });
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

    (runtime as any).emit('ui_press_end', { nodeId: 'input_2' }); // Focus
    (runtime as any).emit('ui_press_end', { nodeId: 'kb_fake_key_BACKSPACE' }); // Press Backspace

    const inputInstance = (runtime as any).findInstanceById('input_2');
    expect(inputInstance.node.properties.text).toBe('H');
  });
});
