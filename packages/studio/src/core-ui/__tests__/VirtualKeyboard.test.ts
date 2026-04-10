import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVirtualKeyboard } from '../VirtualKeyboard';
import { KeyboardSystem } from '../KeyboardSystem';

describe('VirtualKeyboard', () => {
  let context: any;
  let system: KeyboardSystem;
  let nodes: Map<string, any>;

  beforeEach(() => {
    nodes = new Map();
    context = {
      getNode: (id: string) => nodes.get(id),
      emit: vi.fn(), // Mock emit
    };
    system = new KeyboardSystem(context);
  });

  it('generates correct layout', () => {
    const kb = createVirtualKeyboard('kb1', { scale: 1 });
    expect(kb.type).toBe('object'); // Panel or object

    // Assert keys exist
    const buttons = kb.children || [];
    expect(buttons.length).toBeGreaterThan(30);

    // Check for 'A' key
    const aKey = buttons.find((b) => b.children?.[0]?.properties?.data?.key === 'A');
    expect(aKey).toBeDefined();
  });

  it('handles key press', () => {
    // Setup nodes — key node has data on properties.data
    const keyNode = {
      id: 'key_A',
      properties: {
        data: { key: 'A', type: 'keyboard_key' },
      },
    };
    // Focused text input node needs properties.data with text and inputType
    const textNode = {
      id: 'input1',
      properties: {
        data: { text: '', inputType: 'text', cursorIndex: 0, selectionStart: 0, selectionEnd: 0 },
      },
    };
    nodes.set('key_A', keyNode);
    nodes.set('input1', textNode);

    // Focus
    system.setFocus('input1');

    // Simulate Press
    system.handleEvent('ui_press_start', { nodeId: 'key_A' });

    expect(textNode.properties.data.text).toBe('a'); // Lowercase default
  });

  it('handles shift', () => {
    const shiftNode = { id: 'shift', properties: { data: { key: 'Shift', type: 'keyboard_key' } } };
    const aNode = { id: 'key_A', properties: { data: { key: 'A', type: 'keyboard_key' } } };
    const textNode = {
      id: 'input1',
      properties: {
        data: { text: '', inputType: 'text', cursorIndex: 0, selectionStart: 0, selectionEnd: 0 },
      },
    };

    nodes.set('shift', shiftNode);
    nodes.set('key_A', aNode);
    nodes.set('input1', textNode);

    system.setFocus('input1');

    // Shift Press
    system.handleEvent('ui_press_start', { nodeId: 'shift' });

    // 'A' Press
    system.handleEvent('ui_press_start', { nodeId: 'key_A' });

    expect(textNode.properties.data.text).toBe('A');
  });

  it('handles backspace', () => {
    const backspaceNode = {
      id: 'bs',
      properties: { data: { key: 'Backspace', type: 'keyboard_key' } },
    };
    const textNode = {
      id: 'input1',
      properties: {
        data: {
          text: 'Hello',
          inputType: 'text',
          cursorIndex: 5,
          selectionStart: 5,
          selectionEnd: 5,
        },
      },
    };

    nodes.set('bs', backspaceNode);
    nodes.set('input1', textNode);

    system.setFocus('input1');

    system.handleEvent('ui_press_start', { nodeId: 'bs' });

    expect(textNode.properties.data.text).toBe('Hell');
  });
});
