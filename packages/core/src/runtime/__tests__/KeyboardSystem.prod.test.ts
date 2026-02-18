/**
 * KeyboardSystem Production Tests
 *
 * Virtual keyboard: focus management, key insertion, backspace, cursor
 * movement (LEFT/RIGHT), SPACE, focus switching, and no-focus guard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyboardSystem } from '../KeyboardSystem';

// =============================================================================
// MOCK RUNTIME
// =============================================================================

function makeRuntime() {
  const nodes: Record<string, any> = {};
  const runtime: any = {
    findInstanceById: vi.fn((id: string) => nodes[id] ?? null),
    updateNodeProperty: vi.fn((id: string, prop: string, value: any) => {
      if (nodes[id]) nodes[id].node.properties[prop] = value;
    }),
    _setNode(id: string, node: any) {
      nodes[id] = node;
    },
  };
  return runtime;
}

function makeInput(id: string, text = '') {
  return {
    node: { id, type: 'input', properties: { text, tag: undefined } },
    children: [
      { node: { id: `${id}_text`, type: 'text', properties: { text } } },
      { node: { id: `${id}_cursor`, type: 'box', properties: { tag: 'cursor', visible: false, position: { x: 0, y: 0, z: 0 } } } },
    ],
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('KeyboardSystem — Production', () => {
  let runtime: any;
  let kb: KeyboardSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = makeRuntime();
    kb = new KeyboardSystem(runtime);
  });

  describe('focus', () => {
    it('focuses an input on press', () => {
      const input = makeInput('my_input', 'hello');
      runtime._setNode('my_input', input);

      kb.handleEvent('ui_press_end', { nodeId: 'my_input' });

      // Cursor should be visible
      expect(runtime.updateNodeProperty).toHaveBeenCalledWith(
        'my_input_cursor', 'visible', true,
      );
    });

    it('no-op when event is not ui_press_end', () => {
      kb.handleEvent('random_event', { nodeId: 'abc' });
      expect(runtime.findInstanceById).not.toHaveBeenCalled();
    });
  });

  describe('typing', () => {
    it('inserts a character', () => {
      const input = makeInput('search_input', '');
      runtime._setNode('search_input', input);

      // Focus the input
      kb.handleEvent('ui_press_end', { nodeId: 'search_input' });
      // Type 'A'
      kb.handleEvent('ui_press_end', { nodeId: 'kb_key_A' });

      // text should be updated to 'A'
      expect(runtime.updateNodeProperty).toHaveBeenCalledWith('search_input', 'text', 'A');
    });

    it('handles SPACE', () => {
      const input = makeInput('search_input', 'ab');
      runtime._setNode('search_input', input);

      kb.handleEvent('ui_press_end', { nodeId: 'search_input' });
      kb.handleEvent('ui_press_end', { nodeId: 'kb_key_SPACE' });

      expect(runtime.updateNodeProperty).toHaveBeenCalledWith('search_input', 'text', 'ab ');
    });

    it('handles BACKSPACE', () => {
      const input = makeInput('search_input', 'abc');
      runtime._setNode('search_input', input);

      kb.handleEvent('ui_press_end', { nodeId: 'search_input' });
      kb.handleEvent('ui_press_end', { nodeId: 'kb_key_BACKSPACE' });

      expect(runtime.updateNodeProperty).toHaveBeenCalledWith('search_input', 'text', 'ab');
    });

    it('ignores key press without focus', () => {
      kb.handleEvent('ui_press_end', { nodeId: 'kb_key_X' });
      expect(runtime.updateNodeProperty).not.toHaveBeenCalled();
    });
  });

  describe('cursor movement', () => {
    it('LEFT moves cursor back', () => {
      const input = makeInput('inp_input', 'abc');
      runtime._setNode('inp_input', input);

      kb.handleEvent('ui_press_end', { nodeId: 'inp_input' });
      // cursor is at 3 (end)
      kb.handleEvent('ui_press_end', { nodeId: 'kb_key_LEFT' });

      // Now insert 'X' at position 2 → "abXc"
      kb.handleEvent('ui_press_end', { nodeId: 'kb_key_X' });
      expect(runtime.updateNodeProperty).toHaveBeenCalledWith('inp_input', 'text', 'abXc');
    });

    it('RIGHT does not go past end', () => {
      const input = makeInput('inp_input', 'ab');
      runtime._setNode('inp_input', input);

      kb.handleEvent('ui_press_end', { nodeId: 'inp_input' });
      kb.handleEvent('ui_press_end', { nodeId: 'kb_key_RIGHT' }); // already at end
      kb.handleEvent('ui_press_end', { nodeId: 'kb_key_Z' });

      expect(runtime.updateNodeProperty).toHaveBeenCalledWith('inp_input', 'text', 'abZ');
    });
  });
});
