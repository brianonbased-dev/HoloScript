/**
 * UITextInput Production Tests
 *
 * createUITextInput factory: defaults, text, placeholder, children, cursor.
 */

import { describe, it, expect } from 'vitest';
import { createUITextInput } from '../UITextInput';

describe('createUITextInput — Production', () => {
  it('returns node with correct id and type', () => {
    const node = createUITextInput('inp1');
    expect(node.id).toBe('inp1');
    expect(node.type).toBe('ui_text_input');
  });

  it('has default dimensions', () => {
    const node = createUITextInput('inp1');
    expect(node.properties.width).toBeCloseTo(0.4);
    expect(node.properties.height).toBeCloseTo(0.06);
  });

  it('applies custom dimensions', () => {
    const node = createUITextInput('inp1', { width: 0.6, height: 0.08 });
    expect(node.properties.width).toBeCloseTo(0.6);
  });

  it('default placeholder', () => {
    const node = createUITextInput('inp1');
    expect(node.properties.data.placeholder).toBe('Enter text...');
  });

  it('custom placeholder', () => {
    const node = createUITextInput('inp1', { placeholder: 'Type here' });
    expect(node.properties.data.placeholder).toBe('Type here');
  });

  it('sets initial text in data', () => {
    const node = createUITextInput('inp1', { text: 'hello' });
    expect(node.properties.data.text).toBe('hello');
    expect(node.properties.data.cursorIndex).toBe(5);
  });

  it('creates text child and cursor child', () => {
    const node = createUITextInput('inp1');
    expect(node.children).toHaveLength(2);
    expect(node.children![0].id).toBe('inp1_text');
    expect(node.children![1].id).toBe('inp1_cursor');
  });

  it('text child shows placeholder when empty', () => {
    const node = createUITextInput('inp1');
    expect(node.children![0].properties.text).toBe('Enter text...');
    expect(node.children![0].properties.color).toBe('#888888'); // dimmed
  });

  it('text child shows actual text when provided', () => {
    const node = createUITextInput('inp1', { text: 'world' });
    expect(node.children![0].properties.text).toBe('world');
  });

  it('cursor is hidden by default', () => {
    const node = createUITextInput('inp1');
    expect(node.children![1].properties.visible).toBe(false);
  });

  it('has pressable trait', () => {
    const node = createUITextInput('inp1');
    expect(node.traits).toBeDefined();
    const traits = node.traits as Map<string, any>;
    expect(traits.has('pressable')).toBe(true);
  });
});
