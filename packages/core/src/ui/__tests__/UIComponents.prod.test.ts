/**
 * UI Factory Production Tests
 *
 * Tests for createUIButton factory function — the primary exported
 * UI component builder. Other UI modules are type-only or internal.
 */

import { describe, it, expect } from 'vitest';
import { createUIButton, type UIButtonConfig } from '../UIButton';

describe('UI Factory Functions — Production', () => {
  describe('createUIButton', () => {
    it('creates button node with default config', () => {
      const node = createUIButton('btn1', {});
      expect(node).toBeDefined();
      expect(node.type).toBe('object');
      expect(node.id).toBe('btn1_base');
    });

    it('applies custom text', () => {
      const node = createUIButton('btn2', { text: 'Submit' });
      // Text is in the nested text child
      const buttonChild = node.children![0];
      const textChild = buttonChild.children![0];
      expect(textChild.properties!.text).toBe('Submit');
    });

    it('applies custom color', () => {
      const node = createUIButton('btn3', { color: '#FF0000' });
      const buttonChild = node.children![0];
      expect(buttonChild.properties!.color).toBe('#FF0000');
    });

    it('applies custom dimensions', () => {
      const node = createUIButton('btn4', { width: 0.5, height: 0.2, depth: 0.1 });
      expect(node.properties!.scale.x).toBe(0.5);
      expect(node.properties!.scale.y).toBe(0.2);
    });

    it('uses default dimensions', () => {
      const node = createUIButton('btn5', {});
      expect(node.properties!.scale.x).toBe(0.2);
      expect(node.properties!.scale.y).toBe(0.1);
    });

    it('applies position', () => {
      const node = createUIButton('btn6', { position: [1, 2, 3] as any });
      expect(node.properties!.position).toEqual([1, 2, 3]);
    });

    it('creates correct child hierarchy', () => {
      const node = createUIButton('btn7', { text: 'OK' });
      expect(node.children).toHaveLength(1);       // button child
      expect(node.children![0].children).toHaveLength(1); // text child
      expect(node.children![0].id).toBe('btn7_button');
      expect(node.children![0].children![0].id).toBe('btn7_text');
    });

    it('button child has pressable trait', () => {
      const node = createUIButton('btn8', { depth: 0.1 });
      const buttonChild = node.children![0];
      expect(buttonChild.traits).toBeDefined();
      expect(buttonChild.traits!.some((t: any) => t.name === 'pressable')).toBe(true);
    });

    it('text child has text type', () => {
      const node = createUIButton('btn9', {});
      const textChild = node.children![0].children![0];
      expect(textChild.type).toBe('text');
    });

    it('default text color is white', () => {
      const node = createUIButton('btn10', {});
      const textChild = node.children![0].children![0];
      expect(textChild.properties!.color).toBe('#FFFFFF');
    });
  });
});
