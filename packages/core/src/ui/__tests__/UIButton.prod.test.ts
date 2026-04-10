/**
 * UIButton Production Tests
 *
 * createUIButton factory: defaults, custom config, nested children.
 */

import { describe, it, expect } from 'vitest';
import { createUIButton } from '../UIButton';

describe('createUIButton — Production', () => {
  it('returns an HSPlusNode with base id', () => {
    const node = createUIButton('btn1', {});
    expect(node.id).toBe('btn1_base');
    expect(node.type).toBe('object');
  });

  it('applies default dimensions', () => {
    const node = createUIButton('btn1', {});
    expect(node.properties.scale.x).toBeCloseTo(0.2);
    expect(node.properties.scale.y).toBeCloseTo(0.1);
  });

  it('applies custom dimensions', () => {
    const node = createUIButton('btn1', { width: 0.4, height: 0.2, depth: 0.1 });
    expect(node.properties.scale.x).toBeCloseTo(0.4);
    expect(node.properties.scale.y).toBeCloseTo(0.2);
  });

  it('creates button child', () => {
    const node = createUIButton('btn1', {});
    expect(node.children).toHaveLength(1);
    expect(node.children![0].id).toBe('btn1_button');
  });

  it('creates text grandchild', () => {
    const node = createUIButton('btn1', { text: 'Click Me' });
    const btn = node.children![0];
    expect(btn.children).toHaveLength(1);
    expect(btn.children![0].id).toBe('btn1_text');
    expect(btn.children![0].properties.text).toBe('Click Me');
  });

  it('applies default text', () => {
    const node = createUIButton('btn1', {});
    const text = node.children![0].children![0];
    expect(text.properties.text).toBe('Button');
  });

  it('applies custom color', () => {
    const node = createUIButton('btn1', { color: '#FF0000' });
    expect(node.children![0].properties.color).toBe('#FF0000');
  });

  it('applies custom textColor', () => {
    const node = createUIButton('btn1', { textColor: '#00FF00' });
    expect(node.children![0].children![0].properties.color).toBe('#00FF00');
  });

  it('applies position and rotation', () => {
    const pos = { x: 1, y: 2, z: 3 };
    const rot = { x: 10, y: 20, z: 30 };
    const node = createUIButton('btn1', { position: pos, rotation: rot });
    expect(node.properties.position).toEqual(pos);
    expect(node.properties.rotation).toEqual(rot);
  });

  it('button child has pressable trait', () => {
    const node = createUIButton('btn1', {});
    const btn = node.children![0];
    expect(btn.traits).toBeDefined();
    expect(btn.traits!.some((t: any) => t.name === 'pressable')).toBe(true);
  });
});
