import { describe, it, expect, beforeEach } from 'vitest';
import { UIWidget } from '../ui/UIWidget';

// =============================================================================
// C278 — UI Widget
// =============================================================================

describe('UIWidget', () => {
  let ui: UIWidget;
  beforeEach(() => {
    ui = new UIWidget();
  });

  it('createWidget returns widget with defaults', () => {
    const w = ui.createWidget('btn1', 'button');
    expect(w.id).toBe('btn1');
    expect(w.interactive).toBe(true);
    expect(w.width).toBe(100);
    expect(w.height).toBe(40);
  });

  it('first parentless widget becomes root', () => {
    ui.createWidget('root', 'panel');
    expect(ui.getRoot()?.id).toBe('root');
  });

  it('container types are not interactive by default', () => {
    const panel = ui.createWidget('p1', 'panel');
    const label = ui.createWidget('l1', 'label');
    expect(panel.interactive).toBe(false);
    expect(label.interactive).toBe(false);
  });

  it('button, input, slider are interactive by default', () => {
    expect(ui.createWidget('b', 'button').interactive).toBe(true);
    expect(ui.createWidget('i', 'input').interactive).toBe(true);
    expect(ui.createWidget('s', 'slider').interactive).toBe(true);
  });

  it('addChild sets parent-child relationship', () => {
    const parent = ui.createWidget('root', 'panel');
    const child = ui.createWidget('btn', 'button');
    expect(ui.addChild('root', 'btn')).toBe(true);
    expect(parent.children).toContain('btn');
    expect(child.parentId).toBe('root');
  });

  it('removeWidget detaches from parent and removes children recursively', () => {
    ui.createWidget('root', 'panel');
    ui.createWidget('child', 'button', { parentId: 'root' });
    ui.createWidget('grandchild', 'label', { parentId: 'child' });
    expect(ui.removeWidget('child')).toBe(true);
    expect(ui.getWidget('child')).toBeUndefined();
    expect(ui.getWidget('grandchild')).toBeUndefined();
    expect(ui.getWidget('root')!.children).not.toContain('child');
  });

  it('setStyle merges style properties', () => {
    ui.createWidget('btn', 'button');
    ui.setStyle('btn', { backgroundColor: '#ff0', borderRadius: 8 });
    const w = ui.getWidget('btn')!;
    expect(w.style.backgroundColor).toBe('#ff0');
    expect(w.style.borderRadius).toBe(8);
  });

  it('setVisible toggles visibility', () => {
    ui.createWidget('btn', 'button');
    ui.setVisible('btn', false);
    expect(ui.getWidget('btn')!.visible).toBe(false);
  });

  it('setText updates text', () => {
    ui.createWidget('lbl', 'label');
    ui.setText('lbl', 'Hello');
    expect(ui.getWidget('lbl')!.text).toBe('Hello');
  });

  it('getRenderOrder filters invisible and sorts by zIndex', () => {
    ui.createWidget('a', 'button', { zIndex: 2 });
    ui.createWidget('b', 'label', { zIndex: 1 });
    ui.createWidget('c', 'button', { visible: false });
    const order = ui.getRenderOrder();
    expect(order).toHaveLength(2);
    expect(order[0].id).toBe('b');
    expect(order[1].id).toBe('a');
  });

  it('hitTest returns topmost interactive widget', () => {
    ui.createWidget('back', 'panel', { x: 0, y: 0, width: 200, height: 200, zIndex: 0 });
    ui.createWidget('front', 'button', { x: 0, y: 0, width: 200, height: 200, zIndex: 5 });
    const hit = ui.hitTest(50, 50);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('front');
  });

  it('hitTest returns null for miss', () => {
    ui.createWidget('btn', 'button', { x: 100, y: 100, width: 50, height: 50 });
    expect(ui.hitTest(0, 0)).toBeNull();
  });
});
