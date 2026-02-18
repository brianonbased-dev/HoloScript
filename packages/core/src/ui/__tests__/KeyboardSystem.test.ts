import { describe, it, expect, beforeEach } from 'vitest';
import { KeyboardSystem } from '../KeyboardSystem';

function createKBContext() {
  const nodes: Record<string, any> = {};
  const events: Array<{ event: string; data: any }> = [];
  return {
    getNode: (id: string) => nodes[id] ?? null,
    emit: (event: string, data: any) => events.push({ event, data }),
    _nodes: nodes,
    _events: events,
  };
}

function makeTextInput(id: string, text: string = '', cursorIndex?: number) {
  return {
    id,
    properties: {
      data: {
        inputType: 'text',
        text,
        cursorIndex: cursorIndex ?? text.length,
        selectionStart: cursorIndex ?? text.length,
        selectionEnd: cursorIndex ?? text.length,
      },
      width: 0.4,
      textColor: '#ffffff',
    },
  };
}

function makeKey(id: string, key: string) {
  return {
    id,
    properties: {
      data: { type: 'keyboard_key', key },
    },
  };
}

describe('KeyboardSystem', () => {
  let ctx: ReturnType<typeof createKBContext>;
  let kb: KeyboardSystem;

  beforeEach(() => {
    ctx = createKBContext();
    kb = new KeyboardSystem(ctx);
  });

  it('constructs without errors', () => {
    expect(kb).toBeDefined();
  });

  it('setFocus focuses a text input', () => {
    const input = makeTextInput('input1', 'hello');
    ctx._nodes['input1'] = input;
    ctx._nodes['input1_cursor'] = { properties: { visible: false, position: {} } };
    ctx._nodes['input1_text'] = { properties: { text: '', color: '' } };

    kb.setFocus('input1');
    expect(ctx._nodes['input1_cursor'].properties.visible).toBe(true);
  });

  it('handleEvent with ui_press_start on keyboard key types character', () => {
    const input = makeTextInput('input1', '', 0);
    ctx._nodes['input1'] = input;
    ctx._nodes['input1_cursor'] = { properties: { visible: false, position: {} } };
    ctx._nodes['input1_text'] = { properties: { text: '', color: '' } };
    ctx._nodes['key_a'] = makeKey('key_a', 'a');

    kb.setFocus('input1');
    kb.handleEvent('ui_press_start', { nodeId: 'key_a' });

    expect(input.properties.data.text).toBe('a');
    expect(input.properties.data.cursorIndex).toBe(1);
  });

  it('Shift toggles uppercase', () => {
    const input = makeTextInput('input1', '', 0);
    ctx._nodes['input1'] = input;
    ctx._nodes['input1_cursor'] = { properties: { visible: false, position: {} } };
    ctx._nodes['input1_text'] = { properties: { text: '', color: '' } };
    ctx._nodes['key_shift'] = makeKey('key_shift', 'Shift');
    ctx._nodes['key_a'] = makeKey('key_a', 'a');

    kb.setFocus('input1');
    kb.handleEvent('ui_press_start', { nodeId: 'key_shift' });
    kb.handleEvent('ui_press_start', { nodeId: 'key_a' });

    expect(input.properties.data.text).toBe('A');
  });

  it('Backspace deletes character', () => {
    const input = makeTextInput('input1', 'abc', 3);
    ctx._nodes['input1'] = input;
    ctx._nodes['input1_cursor'] = { properties: { visible: false, position: {} } };
    ctx._nodes['input1_text'] = { properties: { text: '', color: '' } };
    ctx._nodes['key_bs'] = makeKey('key_bs', 'Backspace');

    kb.setFocus('input1');
    kb.handleEvent('ui_press_start', { nodeId: 'key_bs' });

    expect(input.properties.data.text).toBe('ab');
    expect(input.properties.data.cursorIndex).toBe(2);
  });

  it('ArrowLeft moves cursor', () => {
    const input = makeTextInput('input1', 'hello', 3);
    ctx._nodes['input1'] = input;
    ctx._nodes['input1_cursor'] = { properties: { visible: false, position: {} } };
    ctx._nodes['input1_text'] = { properties: { text: '', color: '' } };
    ctx._nodes['key_left'] = makeKey('key_left', 'ArrowLeft');

    kb.setFocus('input1');
    kb.handleEvent('ui_press_start', { nodeId: 'key_left' });

    expect(input.properties.data.cursorIndex).toBe(2);
  });

  it('ArrowRight moves cursor', () => {
    const input = makeTextInput('input1', 'hello', 2);
    ctx._nodes['input1'] = input;
    ctx._nodes['input1_cursor'] = { properties: { visible: false, position: {} } };
    ctx._nodes['input1_text'] = { properties: { text: '', color: '' } };
    ctx._nodes['key_right'] = makeKey('key_right', 'ArrowRight');

    kb.setFocus('input1');
    kb.handleEvent('ui_press_start', { nodeId: 'key_right' });

    expect(input.properties.data.cursorIndex).toBe(3);
  });

  it('clicking on text input focuses it', () => {
    const input = makeTextInput('input1', 'test');
    ctx._nodes['input1'] = input;
    ctx._nodes['input1_cursor'] = { properties: { visible: false, position: {} } };
    ctx._nodes['input1_text'] = { properties: { text: '', color: '' } };

    kb.handleEvent('ui_press_start', { nodeId: 'input1' });

    expect(ctx._nodes['input1_cursor'].properties.visible).toBe(true);
  });

  it('Enter inserts newline', () => {
    const input = makeTextInput('input1', 'line1', 5);
    ctx._nodes['input1'] = input;
    ctx._nodes['input1_cursor'] = { properties: { visible: false, position: {} } };
    ctx._nodes['input1_text'] = { properties: { text: '', color: '' } };
    ctx._nodes['key_enter'] = makeKey('key_enter', 'Enter');

    kb.setFocus('input1');
    kb.handleEvent('ui_press_start', { nodeId: 'key_enter' });

    expect(input.properties.data.text).toBe('line1\n');
  });
});
