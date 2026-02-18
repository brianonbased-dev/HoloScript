/**
 * UIWidget Tree Production Tests
 *
 * Widget tree management: create, addChild, removeWidget (recursive),
 * setStyle, setVisible, setText, getRenderOrder (z-sort), hitTest, getRoot.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UIWidget } from '../UIWidget';

describe('UIWidget — Production', () => {
  let tree: UIWidget;

  beforeEach(() => {
    tree = new UIWidget();
  });

  describe('createWidget', () => {
    it('creates widget with defaults', () => {
      const w = tree.createWidget('root', 'panel');
      expect(w.id).toBe('root');
      expect(w.type).toBe('panel');
      expect(w.width).toBe(100);
      expect(w.height).toBe(40);
      expect(w.visible).toBe(true);
    });

    it('button and input are interactive by default', () => {
      const btn = tree.createWidget('btn', 'button');
      const inp = tree.createWidget('inp', 'input');
      const lbl = tree.createWidget('lbl', 'label');
      expect(btn.interactive).toBe(true);
      expect(inp.interactive).toBe(true);
      expect(lbl.interactive).toBe(false);
    });

    it('first root-level widget becomes root', () => {
      tree.createWidget('r', 'panel');
      expect(tree.getRoot()?.id).toBe('r');
    });

    it('custom options', () => {
      const w = tree.createWidget('w', 'label', { x: 10, y: 20, width: 200, text: 'hello', zIndex: 5 });
      expect(w.x).toBe(10);
      expect(w.width).toBe(200);
      expect(w.text).toBe('hello');
      expect(w.zIndex).toBe(5);
    });
  });

  describe('addChild', () => {
    it('parents child widget', () => {
      tree.createWidget('parent', 'panel');
      tree.createWidget('child', 'label');
      expect(tree.addChild('parent', 'child')).toBe(true);
      expect(tree.getWidget('child')?.parentId).toBe('parent');
      expect(tree.getWidget('parent')?.children).toContain('child');
    });

    it('returns false for missing widgets', () => {
      expect(tree.addChild('missing', 'also_missing')).toBe(false);
    });
  });

  describe('removeWidget', () => {
    it('removes widget and unlinks from parent', () => {
      tree.createWidget('parent', 'panel');
      tree.createWidget('child', 'label', { parentId: 'parent' });
      expect(tree.getWidgetCount()).toBe(2);
      tree.removeWidget('child');
      expect(tree.getWidgetCount()).toBe(1);
      expect(tree.getWidget('parent')?.children).toEqual([]);
    });

    it('recursively removes children', () => {
      tree.createWidget('root', 'panel');
      tree.createWidget('child', 'label', { parentId: 'root' });
      tree.createWidget('grandchild', 'button', { parentId: 'child' });
      expect(tree.getWidgetCount()).toBe(3);
      tree.removeWidget('child');
      expect(tree.getWidgetCount()).toBe(1); // only root
    });

    it('returns false for missing widget', () => {
      expect(tree.removeWidget('nope')).toBe(false);
    });
  });

  describe('setStyle / setVisible / setText', () => {
    it('setStyle merges styles', () => {
      tree.createWidget('w', 'panel', { style: { backgroundColor: '#000' } });
      tree.setStyle('w', { borderColor: '#fff' });
      expect(tree.getWidget('w')?.style.backgroundColor).toBe('#000');
      expect(tree.getWidget('w')?.style.borderColor).toBe('#fff');
    });

    it('setVisible toggles visibility', () => {
      tree.createWidget('w', 'panel');
      tree.setVisible('w', false);
      expect(tree.getWidget('w')?.visible).toBe(false);
    });

    it('setText updates text', () => {
      tree.createWidget('w', 'label');
      tree.setText('w', 'Updated');
      expect(tree.getWidget('w')?.text).toBe('Updated');
    });
  });

  describe('getRenderOrder', () => {
    it('returns visible widgets sorted by z-index', () => {
      tree.createWidget('a', 'panel', { zIndex: 2 });
      tree.createWidget('b', 'panel', { zIndex: 0 });
      tree.createWidget('c', 'panel', { zIndex: 1 });
      const order = tree.getRenderOrder();
      expect(order[0].id).toBe('b');
      expect(order[2].id).toBe('a');
    });

    it('excludes hidden widgets', () => {
      tree.createWidget('a', 'panel', { visible: true });
      tree.createWidget('b', 'panel', { visible: false });
      expect(tree.getRenderOrder()).toHaveLength(1);
    });
  });

  describe('hitTest', () => {
    it('returns top interactive widget at point', () => {
      tree.createWidget('btn', 'button', { x: 0, y: 0, width: 100, height: 50, zIndex: 1 });
      tree.createWidget('bg', 'panel', { x: 0, y: 0, width: 200, height: 200, zIndex: 0 });
      const hit = tree.hitTest(50, 25);
      expect(hit?.id).toBe('btn');
    });

    it('returns null for miss', () => {
      tree.createWidget('btn', 'button', { x: 0, y: 0, width: 10, height: 10 });
      expect(tree.hitTest(999, 999)).toBeNull();
    });

    it('skips non-interactive widgets', () => {
      tree.createWidget('lbl', 'label', { x: 0, y: 0, width: 100, height: 50 });
      expect(tree.hitTest(10, 10)).toBeNull();
    });
  });
});
