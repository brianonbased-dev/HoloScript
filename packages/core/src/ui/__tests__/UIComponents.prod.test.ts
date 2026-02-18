/**
 * UIComponents Production Tests
 *
 * Factory functions: createButton, createSlider, createPanel, createTextInput, createScrollView.
 */

import { describe, it, expect } from 'vitest';
import { createButton, createSlider, createPanel, createTextInput, createScrollView } from '../UIComponents';

describe('UIComponents — Production', () => {
  describe('createButton', () => {
    it('returns entity with pressable trait', () => {
      const node = createButton({ text: 'Go' });
      expect(node.type).toBe('entity');
      expect((node.traits as Map<string, any>).has('pressable')).toBe(true);
    });

    it('has text child', () => {
      const node = createButton({ text: 'Go' });
      expect(node.children).toHaveLength(1);
      expect(node.children![0].properties.text).toBe('Go');
    });

    it('uses custom dimensions', () => {
      const node = createButton({ text: 'X', width: 0.5, height: 0.2, depth: 0.05 });
      const renderTrait = (node.traits as Map<string, any>).get('render');
      expect(renderTrait.size[0]).toBeCloseTo(0.5);
    });
  });

  describe('createSlider', () => {
    it('returns entity with track + knob child', () => {
      const node = createSlider({});
      expect(node.type).toBe('entity');
      expect(node.children).toHaveLength(1);
    });

    it('knob has slidable + grabbable traits', () => {
      const node = createSlider({});
      const knob = node.children![0];
      const traits = knob.traits as Map<string, any>;
      expect(traits.has('slidable')).toBe(true);
      expect(traits.has('grabbable')).toBe(true);
    });
  });

  describe('createPanel', () => {
    it('returns entity with render + collider', () => {
      const node = createPanel({});
      const traits = node.traits as Map<string, any>;
      expect(traits.has('render')).toBe(true);
      expect(traits.has('collider')).toBe(true);
    });

    it('includes children', () => {
      const child: any = { id: 'child1', type: 'entity', properties: {} };
      const node = createPanel({ children: [child] });
      expect(node.children).toHaveLength(1);
    });
  });

  describe('createTextInput', () => {
    it('returns entity with text + cursor children', () => {
      const node = createTextInput({});
      expect(node.children).toHaveLength(2);
    });

    it('has pressable trait', () => {
      const node = createTextInput({});
      expect((node.traits as Map<string, any>).has('pressable')).toBe(true);
    });

    it('uses placeholder text', () => {
      const node = createTextInput({ placeholder: 'Search...' });
      expect(node.properties.placeholder).toBe('Search...');
    });
  });

  describe('createScrollView', () => {
    it('returns entity with scrollable trait', () => {
      const node = createScrollView({});
      const traits = node.traits as Map<string, any>;
      expect(traits.has('scrollable')).toBe(true);
    });

    it('applies viewport/content settings', () => {
      const node = createScrollView({ viewportHeight: 0.8, contentHeight: 3.0 });
      const scroll = (node.traits as Map<string, any>).get('scrollable');
      expect(scroll.viewportHeight).toBe(0.8);
      expect(scroll.contentHeight).toBe(3.0);
    });
  });
});
