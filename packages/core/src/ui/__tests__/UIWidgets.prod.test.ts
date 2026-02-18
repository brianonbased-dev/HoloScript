/**
 * UISlider + UITextInput Factory Production Tests
 *
 * createUISlider: node hierarchy, track/handle, axis, traits.
 * createUITextInput: node hierarchy, text/cursor children, data properties.
 */

import { describe, it, expect } from 'vitest';
import { createUISlider } from '../UISlider';
import { createUITextInput } from '../UITextInput';

describe('createUISlider — Production', () => {
  it('creates slider with track and handle', () => {
    const slider = createUISlider('vol', {});
    expect(slider.id).toContain('vol');
    expect(slider.type).toBe('object');
    expect(slider.children).toHaveLength(1);
  });

  it('handle has slidable + grabbable traits', () => {
    const slider = createUISlider('vol', {});
    const handle = slider.children![0];
    expect(handle.traits).toBeDefined();
    const traitNames = (handle.traits as any[]).map((t: any) => t.name);
    expect(traitNames).toContain('slidable');
    expect(traitNames).toContain('grabbable');
  });

  it('respects axis config', () => {
    const slider = createUISlider('vol', { axis: 'y', length: 0.5 });
    // The track scale should reflect the axis
    expect(slider.properties?.scale?.y).toBe(0.5);
  });

  it('default axis is x', () => {
    const slider = createUISlider('vol', {});
    expect(slider.properties?.scale?.x).toBe(0.3); // default length
  });

  it('custom colors', () => {
    const slider = createUISlider('vol', { trackColor: '#ff0000', handleColor: '#00ff00' });
    expect(slider.properties?.color).toBe('#ff0000');
    expect(slider.children![0].properties?.color).toBe('#00ff00');
  });
});

describe('createUITextInput — Production', () => {
  it('creates input with text and cursor children', () => {
    const input = createUITextInput('name', {});
    expect(input.id).toBe('name');
    expect(input.type).toBe('ui_text_input');
    expect(input.children).toHaveLength(2);
  });

  it('has text child and cursor child', () => {
    const input = createUITextInput('name', {});
    expect(input.children![0].id).toBe('name_text');
    expect(input.children![1].id).toBe('name_cursor');
  });

  it('sets data with placeholder', () => {
    const input = createUITextInput('name', { placeholder: 'Type here...' });
    expect(input.properties?.data?.placeholder).toBe('Type here...');
  });

  it('sets initial text', () => {
    const input = createUITextInput('name', { text: 'Hello' });
    expect(input.properties?.data?.text).toBe('Hello');
    expect(input.properties?.data?.cursorIndex).toBe(5);
  });

  it('default dimensions', () => {
    const input = createUITextInput('name', {});
    expect(input.properties?.width).toBe(0.4);
    expect(input.properties?.height).toBe(0.06);
  });

  it('custom colors', () => {
    const input = createUITextInput('name', { color: '#111', textColor: '#aaa', text: 'hi' });
    expect(input.properties?.color).toBe('#111');
    expect(input.children![0].properties?.color).toBe('#aaa');
  });

  it('has pressable trait', () => {
    const input = createUITextInput('name', {});
    expect(input.traits).toBeDefined();
    // traits is a Map
    expect(input.traits instanceof Map).toBe(true);
    expect((input.traits as Map<string, any>).has('pressable')).toBe(true);
  });
});
