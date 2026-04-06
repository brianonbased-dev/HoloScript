/**
 * UIRenderer Production Tests
 *
 * Retained-mode UI tree: node creation, hierarchy (add/remove),
 * hit testing, world rect, focus management, dirty tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UIRenderer } from '../UIRenderer';

describe('UIRenderer — Production', () => {
  let ui: UIRenderer;

  beforeEach(() => {
    ui = new UIRenderer();
  });

  describe('construction', () => {
    it('creates with root node', () => {
      const root = ui.getRoot();
      expect(root).toBeDefined();
      expect(root.type).toBe('container');
      expect(root.rect.width).toBe(1920);
    });

    it('starts with 1 node (root)', () => {
      expect(ui.getNodeCount()).toBe(1);
    });
  });

  describe('createNode', () => {
    it('creates button node', () => {
      const btn = ui.createNode('button', 'submit');
      expect(btn.type).toBe('button');
      expect(btn.tag).toBe('submit');
      expect(btn.interactive).toBe(true);
      expect(btn.focusable).toBe(true);
    });

    it('creates text node (not interactive)', () => {
      const text = ui.createNode('text');
      expect(text.interactive).toBe(false);
      expect(text.focusable).toBe(false);
    });

    it('increments node count', () => {
      ui.createNode('button');
      ui.createNode('slider');
      expect(ui.getNodeCount()).toBe(3); // root + 2
    });
  });

  describe('hierarchy', () => {
    it('addChild parents correctly', () => {
      const root = ui.getRoot();
      const btn = ui.createNode('button');
      ui.addChild(root, btn);
      expect(root.children).toContain(btn);
      expect(btn.parent).toBe(root);
    });

    it('removeChild detaches', () => {
      const root = ui.getRoot();
      const btn = ui.createNode('button');
      ui.addChild(root, btn);
      ui.removeChild(root, btn);
      expect(root.children).not.toContain(btn);
      expect(btn.parent).toBeNull();
    });

    it('removeNode removes node and descendants', () => {
      const root = ui.getRoot();
      const panel = ui.createNode('container');
      const btn1 = ui.createNode('button');
      const btn2 = ui.createNode('button');
      ui.addChild(root, panel);
      ui.addChild(panel, btn1);
      ui.addChild(panel, btn2);
      expect(ui.getNodeCount()).toBe(4);

      ui.removeNode(panel.id);
      expect(ui.getNodeCount()).toBe(1); // only root
    });

    it('removeNode returns false for missing', () => {
      expect(ui.removeNode('nope')).toBe(false);
    });
  });

  describe('findByTag', () => {
    it('finds node by tag', () => {
      const btn = ui.createNode('button', 'save');
      ui.addChild(ui.getRoot(), btn);
      expect(ui.findByTag('save')).toBe(btn);
    });

    it('returns undefined for missing tag', () => {
      expect(ui.findByTag('missing')).toBeUndefined();
    });
  });

  describe('hit testing', () => {
    it('hits interactive node', () => {
      const root = ui.getRoot();
      const btn = ui.createNode('button');
      btn.rect = { x: 100, y: 100, width: 200, height: 50 };
      ui.addChild(root, btn);

      const result = ui.hitTest(150, 120);
      expect(result).not.toBeNull();
      expect(result!.node).toBe(btn);
    });

    it('misses hidden node', () => {
      const root = ui.getRoot();
      const btn = ui.createNode('button');
      btn.rect = { x: 100, y: 100, width: 200, height: 50 };
      btn.style.visible = false;
      ui.addChild(root, btn);

      const result = ui.hitTest(150, 120);
      expect(result).toBeNull();
    });

    it('returns local coordinates', () => {
      const root = ui.getRoot();
      const btn = ui.createNode('button');
      btn.rect = { x: 50, y: 50, width: 100, height: 40 };
      ui.addChild(root, btn);

      const result = ui.hitTest(70, 60);
      expect(result).not.toBeNull();
      expect(result!.localX).toBe(20); // 70 - 50
      expect(result!.localY).toBe(10); // 60 - 50
    });
  });

  describe('getWorldRect', () => {
    it('accumulates parent positions', () => {
      const root = ui.getRoot();
      const panel = ui.createNode('container');
      panel.rect = { x: 100, y: 200, width: 400, height: 300 };
      const btn = ui.createNode('button');
      btn.rect = { x: 10, y: 20, width: 80, height: 30 };
      ui.addChild(root, panel);
      ui.addChild(panel, btn);

      const wr = ui.getWorldRect(btn);
      expect(wr.x).toBe(110); // 100 + 10
      expect(wr.y).toBe(220); // 200 + 20
    });
  });

  describe('focus management', () => {
    it('setFocus returns true for focusable', () => {
      const btn = ui.createNode('button');
      ui.addChild(ui.getRoot(), btn);
      expect(ui.setFocus(btn.id)).toBe(true);
      expect(ui.getFocusedNode()).toBe(btn);
    });

    it('setFocus returns false for non-focusable', () => {
      const text = ui.createNode('text');
      ui.addChild(ui.getRoot(), text);
      expect(ui.setFocus(text.id)).toBe(false);
    });

    it('focusNext cycles through focusable', () => {
      const btn1 = ui.createNode('button');
      const btn2 = ui.createNode('slider');
      ui.addChild(ui.getRoot(), btn1);
      ui.addChild(ui.getRoot(), btn2);

      const first = ui.focusNext();
      expect(first).toBe(btn1);
      const second = ui.focusNext();
      expect(second).toBe(btn2);
      const wrap = ui.focusNext();
      expect(wrap).toBe(btn1); // wraps
    });

    it('focusPrevious cycles backward', () => {
      const btn1 = ui.createNode('button');
      const btn2 = ui.createNode('slider');
      ui.addChild(ui.getRoot(), btn1);
      ui.addChild(ui.getRoot(), btn2);

      const last = ui.focusPrevious();
      expect(last).toBe(btn2);
    });

    it('clearFocus clears', () => {
      const btn = ui.createNode('button');
      ui.addChild(ui.getRoot(), btn);
      ui.setFocus(btn.id);
      ui.clearFocus();
      expect(ui.getFocusedNode()).toBeNull();
    });
  });

  describe('dirty tracking', () => {
    it('markDirty tracks nodes', () => {
      ui.markDirty('some-id');
      expect(ui.getDirtyNodes()).toContain('some-id');
    });

    it('clearDirty clears all', () => {
      ui.markDirty('a');
      ui.markDirty('b');
      ui.clearDirty();
      expect(ui.getDirtyNodes()).toEqual([]);
    });
  });
});
