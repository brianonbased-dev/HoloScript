/**
 * UIPanel + UIButton + VirtualKeyboard Factory Production Tests
 *
 * Pure factory functions: node hierarchy, properties, children, defaults.
 */

import { describe, it, expect } from 'vitest';
import { createUIPanel } from '../UIPanel';
import { createUIButton } from '../UIButton';
import { createVirtualKeyboard } from '../VirtualKeyboard';

describe('createUIPanel — Production', () => {
  it('creates panel with defaults', () => {
    const panel = createUIPanel('test', {});
    expect(panel.id).toBe('test');
    expect(panel.type).toBe('object');
    expect(panel.properties?.geometry).toBe('box');
  });

  it('custom dimensions and color', () => {
    const panel = createUIPanel('p', { width: 1.0, height: 0.5, color: '#ff0000' });
    expect((panel.properties?.scale as number[])?.[0]).toBe(1.0);
    expect((panel.properties?.scale as number[])?.[1]).toBe(0.5);
    expect(panel.properties?.color).toBe('#ff0000');
  });

  it('passes through children', () => {
    const child = createUIButton('btn', { text: 'OK' });
    const panel = createUIPanel('p', {}, [child]);
    expect(panel.children).toHaveLength(1);
    expect(panel.children![0].id).toContain('btn');
  });
});

describe('createUIButton — Production', () => {
  it('creates button with base + button + text hierarchy', () => {
    const btn = createUIButton('myBtn', { text: 'Click' });
    expect(btn.id).toBe('myBtn_base');
    expect(btn.children).toHaveLength(1);
    const innerBtn = btn.children![0];
    expect(innerBtn.id).toBe('myBtn_button');
    expect(innerBtn.children).toHaveLength(1);
    expect(innerBtn.children![0].properties?.text).toBe('Click');
  });

  it('button child has pressable trait', () => {
    const btn = createUIButton('b', {});
    const traits = btn.children![0].traits as any[];
    const traitNames = traits.map((t: any) => t.name);
    expect(traitNames).toContain('pressable');
  });

  it('custom colors', () => {
    const btn = createUIButton('b', { color: '#00ff00', textColor: '#000' });
    expect(btn.children![0].properties?.color).toBe('#00ff00');
    expect(btn.children![0].children![0].properties?.color).toBe('#000');
  });

  it('custom dimensions', () => {
    const btn = createUIButton('b', { width: 0.5, height: 0.2, depth: 0.1 });
    // Base width
    expect((btn.properties?.scale as number[])?.[0]).toBe(0.5);
    // Inner button width scaled to 0.9
    expect((btn.children![0].properties?.scale as number[])?.[0]).toBeCloseTo(0.45);
  });
});

describe('createVirtualKeyboard — Production', () => {
  it('creates keyboard with children (key buttons)', () => {
    const kb = createVirtualKeyboard('kb', {});
    expect(kb.id).toBe('kb');
    expect(kb.children!.length).toBeGreaterThan(30); // ~47 keys
  });

  it('has number row + letter rows + space', () => {
    const kb = createVirtualKeyboard('kb', {});
    const keyTexts = kb
      .children!.map((c: any) => {
        // Each child is a UIButton with innerBtn > text child
        const innerBtn = c.children?.[0];
        const textNode = innerBtn?.children?.[0];
        return textNode?.properties?.text;
      })
      .filter(Boolean);
    expect(keyTexts).toContain('Q');
    expect(keyTexts).toContain('Space');
    expect(keyTexts).toContain('Enter');
    expect(keyTexts).toContain('Backspace');
  });

  it('custom scale adjusts key size', () => {
    const kb1 = createVirtualKeyboard('kb1', { scale: 1.0 });
    const kb2 = createVirtualKeyboard('kb2', { scale: 2.0 });
    // Larger scale = larger panel
    expect((kb2.properties?.scale as number[])?.[0]).toBeGreaterThan(
      (kb1.properties?.scale as number[])?.[0]
    );
  });
});
