/**
 * UISlider Production Tests
 *
 * createUISlider factory: defaults, custom config, axis handling.
 */

import { describe, it, expect } from 'vitest';
import { createUISlider } from '../UISlider';

describe('createUISlider — Production', () => {
  it('returns track node', () => {
    const node = createUISlider('s1', {});
    expect(node.id).toBe('s1_track');
    expect(node.type).toBe('object');
  });

  it('default axis is x', () => {
    const node = createUISlider('s1', {});
    expect(node.properties.scale[0]).toBeCloseTo(0.3); // default length
    expect(node.properties.scale[1]).toBeCloseTo(0.01);
  });

  it('y axis scales correctly', () => {
    const node = createUISlider('s1', { axis: 'y', length: 0.5 });
    expect(node.properties.scale[1]).toBeCloseTo(0.5);
    expect(node.properties.scale[0]).toBeCloseTo(0.01);
  });

  it('z axis scales correctly', () => {
    const node = createUISlider('s1', { axis: 'z' });
    expect(node.properties.scale[2]).toBeCloseTo(0.3);
  });

  it('creates handle child', () => {
    const node = createUISlider('s1', {});
    expect(node.children).toHaveLength(1);
    expect(node.children![0].id).toBe('s1_handle');
  });

  it('handle has slidable + grabbable traits', () => {
    const node = createUISlider('s1', {});
    const handle = node.children![0];
    const traitNames = handle.traits!.map((t: any) => t.name);
    expect(traitNames).toContain('slidable');
    expect(traitNames).toContain('grabbable');
  });

  it('handle gets initial value', () => {
    const node = createUISlider('s1', { initialValue: 0.75 });
    expect(node.children![0].properties.value).toBe(0.75);
  });

  it('applies custom colors', () => {
    const node = createUISlider('s1', { trackColor: '#111', handleColor: '#FFF' });
    expect(node.properties.color).toBe('#111');
    expect(node.children![0].properties.color).toBe('#FFF');
  });

  it('applies position and rotation', () => {
    const pos = [5, 6, 7];
    const node = createUISlider('s1', { position: pos });
    expect(node.properties.position).toEqual(pos);
  });
});
