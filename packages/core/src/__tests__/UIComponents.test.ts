import { describe, it, expect } from 'vitest';
import { createUIButton, UIButtonConfig } from '../ui/UIButton';
import { createUISlider, UISliderConfig } from '../ui/UISlider';
import { createUITextInput, UITextInputConfig } from '../ui/UITextInput';

// =============================================================================
// UI BUTTON
// =============================================================================

describe('createUIButton', () => {
  it('creates a valid node hierarchy', () => {
    const btn = createUIButton('test-btn', { text: 'Click Me' });
    expect(btn.id).toBe('test-btn_base');
    expect(btn.children).toBeDefined();
    expect(btn.children!.length).toBeGreaterThanOrEqual(1);
  });

  it('uses default dimensions when none specified', () => {
    const btn = createUIButton('btn', {});
    expect(btn.properties.scale.x).toBe(0.2); // Default width
    expect(btn.properties.scale.y).toBe(0.1); // Default height
  });

  it('applies custom config', () => {
    const config: UIButtonConfig = {
      text: 'Submit',
      width: 0.3,
      height: 0.15,
      depth: 0.08,
      color: '#FF0000',
      textColor: '#000000',
      position: { x: 1, y: 2, z: 3 },
    };
    const btn = createUIButton('custom', config);
    expect(btn.properties.position).toEqual({ x: 1, y: 2, z: 3 });

    const buttonChild = btn.children![0];
    expect(buttonChild.properties.color).toBe('#FF0000');

    const textChild = buttonChild.children![0];
    expect(textChild.properties.text).toBe('Submit');
    expect(textChild.properties.color).toBe('#000000');
  });

  it('attaches pressable trait to button child', () => {
    const btn = createUIButton('btn', {});
    const buttonChild = btn.children![0];
    expect(buttonChild.traits).toBeDefined();
    expect(buttonChild.traits!.some((t: any) => t.name === 'pressable')).toBe(true);
  });

  it('sets physics type correctly (base=kinematic, button=dynamic)', () => {
    const btn = createUIButton('btn', {});
    expect(btn.properties.physics.type).toBe('kinematic');
    expect(btn.children![0].properties.physics.type).toBe('dynamic');
  });
});

// =============================================================================
// UI SLIDER
// =============================================================================

describe('createUISlider', () => {
  it('creates track and handle hierarchy', () => {
    const slider = createUISlider('vol', {});
    expect(slider.id).toBe('vol_track');
    expect(slider.children).toBeDefined();
    expect(slider.children!.length).toBe(1);
    expect(slider.children![0].id).toBe('vol_handle');
  });

  it('applies correct axis to track scale', () => {
    const slider = createUISlider('s', { axis: 'y', length: 0.5 });
    expect(slider.properties.scale.y).toBe(0.5);
    expect(slider.properties.scale.x).toBe(0.01); // Other axes stay thin
  });

  it('defaults to x axis and 0.3m length', () => {
    const slider = createUISlider('s', {});
    expect(slider.properties.scale.x).toBe(0.3);
  });

  it('attaches slidable + grabbable traits to handle', () => {
    const slider = createUISlider('s', {});
    const handle = slider.children![0];
    const traitNames = handle.traits!.map((t: any) => t.name);
    expect(traitNames).toContain('slidable');
    expect(traitNames).toContain('grabbable');
  });

  it('passes axis and length to slidable trait', () => {
    const slider = createUISlider('s', { axis: 'z', length: 0.4 });
    const handle = slider.children![0];
    const slidableTrait = handle.traits!.find((t: any) => t.name === 'slidable');
    expect(slidableTrait.properties.axis).toBe('z');
    expect(slidableTrait.properties.length).toBe(0.4);
  });

  it('uses custom colors', () => {
    const slider = createUISlider('s', { trackColor: '#111', handleColor: '#EEE' });
    expect(slider.properties.color).toBe('#111');
    expect(slider.children![0].properties.color).toBe('#EEE');
  });
});

// =============================================================================
// UI TEXT INPUT
// =============================================================================

describe('createUITextInput', () => {
  it('creates a text input with cursor and text children', () => {
    const input = createUITextInput('name-field');
    expect(input.id).toBe('name-field');
    expect(input.type).toBe('ui_text_input');
    expect(input.children!.length).toBe(2); // text + cursor
  });

  it('uses placeholder when no text provided', () => {
    const input = createUITextInput('field', { placeholder: 'Type here...' });
    const textChild = input.children![0];
    expect(textChild.properties.text).toBe('Type here...');
    expect(textChild.properties.color).toBe('#888888'); // Dim color for placeholder
  });

  it('uses actual text when provided', () => {
    const input = createUITextInput('field', { text: 'Hello' });
    const textChild = input.children![0];
    expect(textChild.properties.text).toBe('Hello');
  });

  it('sets up cursor data in properties', () => {
    const input = createUITextInput('field', { text: 'abc' });
    expect(input.properties.data.cursorIndex).toBe(3); // End of text
    expect(input.properties.data.isFocused).toBe(false);
  });

  it('respects custom dimensions', () => {
    const input = createUITextInput('field', { width: 0.6, height: 0.1 });
    expect(input.properties.width).toBe(0.6);
    expect(input.properties.height).toBe(0.1);
  });

  it('cursor is hidden by default', () => {
    const input = createUITextInput('field');
    const cursor = input.children!.find((c: any) => c.type === 'ui_cursor');
    expect(cursor).toBeDefined();
    expect(cursor!.properties.visible).toBe(false);
  });

  it('applies custom colors', () => {
    const input = createUITextInput('field', { color: '#333', textColor: '#FFF', text: 'hi' });
    expect(input.properties.color).toBe('#333');
    const textChild = input.children![0];
    expect(textChild.properties.color).toBe('#FFF');
  });

  it('has pressable trait for focus detection', () => {
    const input = createUITextInput('field');
    expect(input.traits).toBeDefined();
    // traits is a Map
    expect(input.traits.has('pressable')).toBe(true);
  });
});
