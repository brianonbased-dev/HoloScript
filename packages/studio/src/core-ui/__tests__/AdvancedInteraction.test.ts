import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyboardSystem } from '../KeyboardSystem';
import { createUITextInput } from '../UITextInput';

describe('AdvancedInteraction - Text Cursor & Selection', () => {
  let context: any;
  let system: KeyboardSystem;
  let textInputNode: any;
  let textNode: any;
  let cursorNode: any;

  beforeEach(() => {
    textInputNode = createUITextInput('input_1', { text: 'Hello' });
    textNode = textInputNode.children[0];
    cursorNode = textInputNode.children[1];

    context = {
      getNode: vi.fn((id) => {
        if (id === 'input_1') return textInputNode;
        if (id === 'input_1_text') return textNode;
        if (id === 'input_1_cursor') return cursorNode;
        if (id.startsWith('key_'))
          return { properties: { data: { type: 'keyboard_key', key: id.replace('key_', '') } } };
        return null;
      }),
      emit: vi.fn(),
    };

    system = new KeyboardSystem(context);
    system.setFocus('input_1');
  });

  it('selects text with Shift+Arrow', () => {
    // Cursor at 5 ('Hello|')
    // Shift+Left -> Select 'o', Cursor at 4 ('Hell|o')

    // 1. Press Shift
    system.handleEvent('ui_press_start', { nodeId: 'key_Shift' });

    // 2. Press Left
    system.handleEvent('ui_press_start', { nodeId: 'key_ArrowLeft' });

    expect(textInputNode.properties.data.cursorIndex).toBe(4);
    expect(textInputNode.properties.data.selectionStart).toBe(4);
    expect(textInputNode.properties.data.selectionEnd).toBe(5);
    // Anchor should be 5
    expect(textInputNode.properties.data.selectionAnchor).toBe(5);

    // 3. Press Left again -> Select 'lo' ('Hel|lo')
    system.handleEvent('ui_press_start', { nodeId: 'key_ArrowLeft' });
    expect(textInputNode.properties.data.cursorIndex).toBe(3);
    expect(textInputNode.properties.data.selectionStart).toBe(3);
    expect(textInputNode.properties.data.selectionEnd).toBe(5);
  });

  it('clears selection on arrow without Shift', () => {
    // Setup selection [3, 5]
    textInputNode.properties.data.cursorIndex = 3;
    textInputNode.properties.data.selectionStart = 3;
    textInputNode.properties.data.selectionEnd = 5;
    textInputNode.properties.data.selectionAnchor = 5;

    // Press Right (no shift)
    system.handleEvent('ui_press_start', { nodeId: 'key_ArrowRight' });

    // Should move cursor to 4, clear selection
    expect(textInputNode.properties.data.cursorIndex).toBe(4);
    expect(textInputNode.properties.data.selectionStart).toBe(4);
    expect(textInputNode.properties.data.selectionEnd).toBe(4);
  });

  it('deletes selection range', () => {
    // 'Hello' -> Select 'll' -> 'Heo'
    // Indices: H(0)e(1)l(2)l(3)o(4)
    // Select [2, 4] -> 'l','l'
    textInputNode.properties.data.selectionStart = 2;
    textInputNode.properties.data.selectionEnd = 4;
    textInputNode.properties.data.cursorIndex = 2;

    system.handleEvent('ui_press_start', { nodeId: 'key_Backspace' });

    expect(textInputNode.properties.data.text).toBe('Heo');
    expect(textInputNode.properties.data.cursorIndex).toBe(2);
    // Selection cleared
    expect(textInputNode.properties.data.selectionStart).toBe(2);
    expect(textInputNode.properties.data.selectionEnd).toBe(2);
  });

  it('replaces selection with input', () => {
    // 'Hello' -> Select 'll' -> Type 'y' -> 'Heyo'
    textInputNode.properties.data.selectionStart = 2;
    textInputNode.properties.data.selectionEnd = 4;

    system.handleEvent('ui_press_start', { nodeId: 'key_y' });

    expect(textInputNode.properties.data.text).toBe('Heyo');
    expect(textInputNode.properties.data.cursorIndex).toBe(3);
  });
});
