/**
 * UIWidget Production Tests
 *
 * Widget tree: create, addChild, removeWidget, setStyle, setVisible, setText,
 * getRenderOrder, hitTest, getRoot, getWidgetCount.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UIWidget } from '../UIWidget';

describe('UIWidget — Production', () => {
  let ui: UIWidget;

  beforeEach(() => {
    ui = new UIWidget();
  });

  describe('createWidget', () => {
    it('creates with defaults', () => {
      const w = ui.createWidget('w1', 'panel');
      expect(w.id).toBe('w1');
      expect(w.type).toBe('panel');
      expect(w.width).toBe(100);
      expect(w.height).toBe(40);
      expect(w.visible).toBe(true);
    });

    it('button is interactive by default', () => {
      const w = ui.createWidget('btn', 'button');
      expect(w.interactive).toBe(true);
    });

    it('panel is not interactive by default', () => {
      const w = ui.createWidget('p', 'panel');
      expect(w.interactive).toBe(false);
    });

    it('first parentless widget becomes root', () => {
      ui.createWidget('root', 'container');
      expect(ui.getRoot()?.id).toBe('root');
    });
  });

  describe('addChild', () => {
    it('links parent and child', () => {
      ui.createWidget('parent', 'panel');
      ui.createWidget('child', 'label');
      expect(ui.addChild('parent', 'child')).toBe(true);
      expect(ui.getWidget('parent')?.children).toContain('child');
      expect(ui.getWidget('child')?.parentId).toBe('parent');
    });

    it('returns false for missing ids', () => {
      expect(ui.addChild('nope', 'nah')).toBe(false);
    });
  });

  describe('removeWidget', () => {
    it('removes widget and updates parent', () => {
      ui.createWidget('parent', 'panel');
      ui.createWidget('child', 'label', { parentId: 'parent' });
      expect(ui.removeWidget('child')).toBe(true);
      expect(ui.getWidget('child')).toBeUndefined();
      expect(ui.getWidget('parent')?.children).not.toContain('child');
    });

    it('recursively removes children', () => {
      ui.createWidget('root', 'panel');
      ui.createWidget('mid', 'panel', { parentId: 'root' });
      ui.createWidget('leaf', 'label', { parentId: 'mid' });
      ui.removeWidget('mid');
      expect(ui.getWidget('mid')).toBeUndefined();
      expect(ui.getWidget('leaf')).toBeUndefined();
    });
  });

  describe('setStyle / setVisible / setText', () => {
    it('setStyle merges', () => {
      ui.createWidget('w1', 'panel', { style: { opacity: 1 } });
      ui.setStyle('w1', { backgroundColor: '#FF0000' });
      expect(ui.getWidget('w1')?.style.backgroundColor).toBe('#FF0000');
      expect(ui.getWidget('w1')?.style.opacity).toBe(1);
    });

    it('setVisible toggles', () => {
      ui.createWidget('w1', 'panel');
      ui.setVisible('w1', false);
      expect(ui.getWidget('w1')?.visible).toBe(false);
    });

    it('setText updates', () => {
      ui.createWidget('lbl', 'label');
      ui.setText('lbl', 'Hello');
      expect(ui.getWidget('lbl')?.text).toBe('Hello');
    });
  });

  describe('getRenderOrder', () => {
    it('sorts by zIndex ascending', () => {
      ui.createWidget('back', 'panel', { zIndex: 0 });
      ui.createWidget('front', 'panel', { zIndex: 10 });
      ui.createWidget('mid', 'panel', { zIndex: 5 });
      const order = ui.getRenderOrder().map((w) => w.id);
      expect(order).toEqual(['back', 'mid', 'front']);
    });

    it('excludes hidden widgets', () => {
      ui.createWidget('a', 'panel', { visible: true });
      ui.createWidget('b', 'panel', { visible: false });
      expect(ui.getRenderOrder()).toHaveLength(1);
    });
  });

  describe('hitTest', () => {
    it('returns topmost interactive widget at point', () => {
      ui.createWidget('bg', 'panel', { x: 0, y: 0, width: 200, height: 200, zIndex: 0 });
      ui.createWidget('btn', 'button', { x: 50, y: 50, width: 100, height: 40, zIndex: 5 });
      const hit = ui.hitTest(75, 60);
      expect(hit?.id).toBe('btn');
    });

    it('returns null for miss', () => {
      ui.createWidget('btn', 'button', { x: 50, y: 50, width: 100, height: 40 });
      expect(ui.hitTest(0, 0)).toBeNull();
    });

    it('skips non-interactive', () => {
      ui.createWidget('lbl', 'label', { x: 0, y: 0, width: 100, height: 100 });
      expect(ui.hitTest(50, 50)).toBeNull();
    });
  });

  describe('counts', () => {
    it('getWidgetCount', () => {
      ui.createWidget('a', 'panel');
      ui.createWidget('b', 'label');
      expect(ui.getWidgetCount()).toBe(2);
    });
  });
});
