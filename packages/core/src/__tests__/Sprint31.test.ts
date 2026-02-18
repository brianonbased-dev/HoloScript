/**
 * Sprint31.test.ts — UI + Camera + VR (v3.40.0)
 *
 * ~100 acceptance tests covering:
 *   Feature 1:  ui/UIRenderer
 *   Feature 2:  ui/UIWidgets (UIWidgetFactory)
 *   Feature 3:  ui/UILayout (UILayoutEngine)
 *   Feature 4:  ui/UIEventRouter
 *   Feature 5:  ui/UIDataBinding
 *   Feature 6:  camera/CameraController
 *   Feature 7:  camera/CameraEffects
 *   Feature 8:  camera/CameraShake
 *   Feature 9:  vr/HandTracker
 *   Feature 10: vr/VRLocomotion
 */
import { describe, it, expect, vi } from 'vitest';

import { UIRenderer } from '../ui/UIRenderer.js';
import { UIWidgetFactory } from '../ui/UIWidgets.js';
import { UILayoutEngine } from '../ui/UILayout.js';
import { UIEventRouter } from '../ui/UIEventRouter.js';
import { UIDataBinding } from '../ui/UIDataBinding.js';
import { CameraController } from '../camera/CameraController.js';
import { CameraEffects } from '../camera/CameraEffects.js';
import { CameraShake } from '../camera/CameraShake.js';
import { HandTracker } from '../vr/HandTracker.js';
import { VRLocomotion } from '../vr/VRLocomotion.js';

// =============================================================================
// FEATURE 1: ui/UIRenderer
// =============================================================================
describe('Feature 1: UIRenderer', () => {
  it('getRoot returns a node', () => {
    const ur = new UIRenderer();
    expect(ur.getRoot()).toBeDefined();
  });

  it('getNodeCount is 1 initially (root)', () => {
    expect(new UIRenderer().getNodeCount()).toBeGreaterThanOrEqual(1);
  });

  it('createNode returns a node with id', () => {
    const ur = new UIRenderer();
    const node = ur.createNode('button');
    expect(node.id).toBeDefined();
    expect(node.type).toBe('button');
  });

  it('addChild increases getNodeCount', () => {
    const ur = new UIRenderer();
    const before = ur.getNodeCount();
    const child = ur.createNode('text');
    ur.addChild(ur.getRoot(), child);
    expect(ur.getNodeCount()).toBe(before + 1);
  });

  it('getNode returns the node by id', () => {
    const ur = new UIRenderer();
    const node = ur.createNode('container', 'myBox');
    ur.addChild(ur.getRoot(), node);
    expect(ur.getNode(node.id)).toBeDefined();
  });

  it('findByTag returns node with matching tag', () => {
    const ur = new UIRenderer();
    const node = ur.createNode('image', 'avatar');
    ur.addChild(ur.getRoot(), node);
    expect(ur.findByTag('avatar')).toBeDefined();
  });

  it('hitTest returns null when no interactive nodes', () => {
    expect(new UIRenderer().hitTest(0, 0)).toBeNull();
  });

  it('setFocus returns false for unknown node', () => {
    expect(new UIRenderer().setFocus('ghost')).toBe(false);
  });

  it('getDirtyNodes starts empty', () => {
    expect(new UIRenderer().getDirtyNodes()).toHaveLength(0);
  });

  it('markDirty adds to getDirtyNodes', () => {
    const ur = new UIRenderer();
    const node = ur.createNode('text');
    ur.addChild(ur.getRoot(), node);
    ur.markDirty(node.id);
    expect(ur.getDirtyNodes()).toContain(node.id);
  });
});

// =============================================================================
// FEATURE 2: ui/UIWidgets (UIWidgetFactory)
// =============================================================================
describe('Feature 2: UIWidgetFactory', () => {
  it('getWidgetCount is 0 initially', () => {
    expect(new UIWidgetFactory().getWidgetCount()).toBe(0);
  });

  it('createButton returns a button widget', () => {
    const f = new UIWidgetFactory();
    const btn = f.createButton('Click me');
    expect(btn).toBeDefined();
    expect(btn.id).toBeDefined();
  });

  it('createButton increments getWidgetCount', () => {
    const f = new UIWidgetFactory();
    f.createButton('OK');
    expect(f.getWidgetCount()).toBe(1);
  });

  it('pressButton returns true for existing button', () => {
    const f = new UIWidgetFactory();
    const btn = f.createButton('Press');
    expect(f.pressButton(btn.id)).toBe(true);
  });

  it('pressButton invokes onClick callback', () => {
    const f = new UIWidgetFactory();
    const cb = vi.fn();
    const btn = f.createButton('Fire', cb);
    f.pressButton(btn.id);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('createSlider returns slider widget', () => {
    const f = new UIWidgetFactory();
    const sl = f.createSlider('Volume', 0, 100, 50);
    expect(sl).toBeDefined();
  });

  it('setSliderValue updates the value', () => {
    const f = new UIWidgetFactory();
    const sl = f.createSlider('Vol', 0, 100, 0);
    f.setSliderValue(sl.id, 75);
    const updated = f.getWidget(sl.id) as any;
    expect(updated.value).toBe(75);
  });

  it('createProgressBar returns progress widget', () => {
    const f = new UIWidgetFactory();
    const pb = f.createProgressBar('Loading', 0);
    expect(pb).toBeDefined();
  });

  it('setProgressValue updates the progress', () => {
    const f = new UIWidgetFactory();
    const pb = f.createProgressBar('XP', 0);
    f.setProgressValue(pb.id, 0.5);
    const updated = f.getWidget(pb.id) as any;
    expect(updated.value).toBe(0.5);
  });

  it('removeWidget removes from count', () => {
    const f = new UIWidgetFactory();
    const btn = f.createButton('Del');
    f.removeWidget(btn.id);
    expect(f.getWidgetCount()).toBe(0);
  });
});

// =============================================================================
// FEATURE 3: ui/UILayout (UILayoutEngine)
// =============================================================================
describe('Feature 3: UILayoutEngine', () => {
  it('createNode returns a LayoutNode', () => {
    const le = new UILayoutEngine();
    const node = le.createNode();
    expect(node).toBeDefined();
    expect(node.id).toBeDefined();
  });

  it('addChild does not throw', () => {
    const le = new UILayoutEngine();
    const parent = le.createNode();
    const child = le.createNode();
    expect(() => le.addChild(parent, child)).not.toThrow();
  });

  it('compute sets result dimensions', () => {
    const le = new UILayoutEngine();
    const root = le.createNode({ widthMode: 'fixed', width: 300, heightMode: 'fixed', height: 200 } as any);
    le.compute(root, 800, 600, true);
    expect(root.result.width).toBeGreaterThan(0);
  });

  it('compute with children does not throw', () => {
    const le = new UILayoutEngine();
    const root = le.createNode({ widthMode: 'fixed', width: 200, heightMode: 'fixed', height: 100 } as any);
    const child = le.createNode({ widthMode: 'fill', heightMode: 'fill' } as any);
    le.addChild(root, child);
    expect(() => le.compute(root, 800, 600)).not.toThrow();
  });
});

// =============================================================================
// FEATURE 4: ui/UIEventRouter
// =============================================================================
describe('Feature 4: UIEventRouter', () => {
  it('getFocused is null initially', () => {
    expect(new UIEventRouter().getFocused()).toBeNull();
  });

  it('getHovered is null initially', () => {
    expect(new UIEventRouter().getHovered()).toBeNull();
  });

  it('setFocus changes getFocused', () => {
    const er = new UIEventRouter();
    er.setFocus('btn1');
    expect(er.getFocused()).toBe('btn1');
  });

  it('setHover changes getHovered', () => {
    const er = new UIEventRouter();
    er.setHover('label1');
    expect(er.getHovered()).toBe('label1');
  });

  it('click emits an event', () => {
    const er = new UIEventRouter();
    const event = er.click('myBtn');
    expect(event.type).toBe('click');
    expect(event.targetId).toBe('myBtn');
  });

  it('on registers handler and emit calls it', () => {
    const er = new UIEventRouter();
    const handler = vi.fn();
    er.on('widget1', 'click', handler);
    er.click('widget1');
    expect(handler).toHaveBeenCalled();
  });

  it('getEventLog records events', () => {
    const er = new UIEventRouter();
    er.click('btnA');
    expect(er.getEventLog().length).toBeGreaterThan(0);
  });

  it('clearLog empties the event log', () => {
    const er = new UIEventRouter();
    er.click('x');
    er.clearLog();
    expect(er.getEventLog()).toHaveLength(0);
  });
});

// =============================================================================
// FEATURE 5: ui/UIDataBinding
// =============================================================================
describe('Feature 5: UIDataBinding', () => {
  it('getBindingCount is 0 initially', () => {
    expect(new UIDataBinding().getBindingCount()).toBe(0);
  });

  it('set and get roundtrip', () => {
    const db = new UIDataBinding();
    db.set('player.name', 'Hero');
    expect(db.get('player.name')).toBe('Hero');
  });

  it('bind increments getBindingCount', () => {
    const db = new UIDataBinding();
    db.bind('player.name', 'nameLabel', 'text');
    expect(db.getBindingCount()).toBe(1);
  });

  it('resolve returns a value after set', () => {
    const db = new UIDataBinding();
    db.set('hp', 100);
    const b = db.bind('hp', 'hpBar', 'value');
    const result = db.resolve(b.id);
    expect(result).not.toBeNull();
  });

  it('getBindingsForWidget returns correct bindings', () => {
    const db = new UIDataBinding();
    db.bind('score', 'scoreLabel', 'text');
    db.bind('hp', 'scoreLabel', 'title');
    expect(db.getBindingsForWidget('scoreLabel')).toHaveLength(2);
  });

  it('unbind removes the binding', () => {
    const db = new UIDataBinding();
    const b = db.bind('x', 'w1', 'y');
    db.unbind(b.id);
    expect(db.getBindingCount()).toBe(0);
  });

  it('onChange fires when value changes', () => {
    const db = new UIDataBinding();
    const cb = vi.fn();
    db.onChange('score', cb);
    db.set('score', 500);
    expect(cb).toHaveBeenCalled();
  });
});

// =============================================================================
// FEATURE 6: camera/CameraController
// =============================================================================
describe('Feature 6: CameraController', () => {
  it('getMode returns default mode', () => {
    const cc = new CameraController();
    expect(typeof cc.getMode()).toBe('string');
  });

  it('setMode changes the mode', () => {
    const cc = new CameraController();
    cc.setMode('orbit');
    expect(cc.getMode()).toBe('orbit');
  });

  it('setTarget does not throw', () => {
    const cc = new CameraController();
    expect(() => cc.setTarget(10, 5, 3)).not.toThrow();
  });

  it('getTarget returns coordinates after setTarget', () => {
    const cc = new CameraController();
    cc.setTarget(5, 2, 8);
    const t = cc.getTarget();
    expect(t.x).toBe(5);
    expect(t.y).toBe(2);
    expect(t.z).toBe(8);
  });

  it('zoom changes the zoom level', () => {
    const cc = new CameraController({ mode: 'orbit' });
    const before = cc.getState().zoom;
    cc.zoom(-1);
    const after = cc.getState().zoom;
    expect(after).not.toBe(before);
  });

  it('rotateOrbit does not throw', () => {
    const cc = new CameraController({ mode: 'orbit' });
    expect(() => cc.rotateOrbit(0.5, 0.2)).not.toThrow();
  });

  it('update does not throw', () => {
    const cc = new CameraController();
    expect(() => cc.update(0.016)).not.toThrow();
  });

  it('getState returns position and zoom', () => {
    const state = new CameraController().getState();
    expect(state.position).toBeDefined();
    expect(typeof state.zoom).toBe('number');
  });
});

// =============================================================================
// FEATURE 7: camera/CameraEffects
// =============================================================================
describe('Feature 7: CameraEffects', () => {
  it('getActiveEffectCount is 0 initially', () => {
    expect(new CameraEffects().getActiveEffectCount()).toBe(0);
  });

  it('shake adds an active effect', () => {
    const ce = new CameraEffects();
    ce.shake(0.5, 0.3);
    expect(ce.getActiveEffectCount()).toBe(1);
  });

  it('shake returns an id', () => {
    const ce = new CameraEffects();
    const id = ce.shake(0.5);
    expect(typeof id).toBe('string');
  });

  it('flash returns an id', () => {
    const ce = new CameraEffects();
    const id = ce.flash(0.2);
    expect(typeof id).toBe('string');
  });

  it('cancelEffect removes the effect', () => {
    const ce = new CameraEffects();
    const id = ce.shake(2.0);
    ce.cancelEffect(id);
    expect(ce.getActiveEffectCount()).toBe(0);
  });

  it('cancelAll removes all effects', () => {
    const ce = new CameraEffects();
    ce.shake(1.0);
    ce.flash(0.5);
    ce.cancelAll();
    expect(ce.getActiveEffectCount()).toBe(0);
  });

  it('getShakeOffset returns {x, y}', () => {
    const offset = new CameraEffects().getShakeOffset();
    expect(typeof offset.x).toBe('number');
    expect(typeof offset.y).toBe('number');
  });

  it('update reduces shake over time', () => {
    const ce = new CameraEffects();
    ce.shake(0.1, 1.0);
    ce.update(0.2);
    expect(ce.getActiveEffectCount()).toBe(0);
  });
});

// =============================================================================
// FEATURE 8: camera/CameraShake
// =============================================================================
describe('Feature 8: CameraShake', () => {
  it('isShaking returns false initially', () => {
    expect(new CameraShake().isShaking()).toBe(false);
  });

  it('addLayer does not throw', () => {
    const cs = new CameraShake();
    expect(() => cs.addLayer('main')).not.toThrow();
  });

  it('addTrauma causes isShaking to return true', () => {
    const cs = new CameraShake();
    cs.addLayer('main');
    cs.addTrauma('main', 0.8);
    expect(cs.isShaking()).toBe(true);
  });

  it('getTrauma returns added trauma', () => {
    const cs = new CameraShake();
    cs.addLayer('main');
    cs.setTrauma('main', 0.6);
    expect(cs.getTrauma('main')).toBe(0.6);
  });

  it('update returns ShakeOutput with offsetX, offsetY, rotation', () => {
    const cs = new CameraShake();
    cs.addLayer('base');
    cs.addTrauma('base', 1.0);
    const out = cs.update(0.016);
    expect(typeof out.offsetX).toBe('number');
    expect(typeof out.offsetY).toBe('number');
    expect(typeof out.rotation).toBe('number');
  });

  it('removeLayer does not throw', () => {
    const cs = new CameraShake();
    cs.addLayer('temp');
    expect(() => cs.removeLayer('temp')).not.toThrow();
  });
});

// =============================================================================
// FEATURE 9: vr/HandTracker
// =============================================================================
describe('Feature 9: HandTracker', () => {
  const joints = {
    wrist: { x: 0, y: 0, z: 0 },
    index_tip: { x: 0.05, y: 0.1, z: 0 },
    thumb_tip: { x: -0.02, y: 0.08, z: 0 },
  };

  it('isTracked returns false initially', () => {
    expect(new HandTracker().isTracked('left')).toBe(false);
  });

  it('updateJoints sets isTracked to true', () => {
    const ht = new HandTracker();
    ht.updateJoints('left', joints);
    expect(ht.isTracked('left')).toBe(true);
  });

  it('getGesture returns a gesture type', () => {
    const ht = new HandTracker();
    ht.updateJoints('right', joints);
    const g = ht.getGesture('right');
    expect(typeof g).toBe('string');
  });

  it('getJoint returns joint position', () => {
    const ht = new HandTracker();
    ht.updateJoints('left', joints);
    const j = ht.getJoint('left', 'wrist');
    expect(j).toBeDefined();
    expect(j?.x).toBe(0);
  });

  it('getHand returns hand state', () => {
    const ht = new HandTracker();
    const hand = ht.getHand('right');
    expect(hand.side).toBe('right');
  });

  it('updateStrength does not throw', () => {
    const ht = new HandTracker();
    expect(() => ht.updateStrength('left', 0.9, 0.1)).not.toThrow();
  });

  it('getGestureHistory is initially empty', () => {
    expect(new HandTracker().getGestureHistory()).toHaveLength(0);
  });
});

// =============================================================================
// FEATURE 10: vr/VRLocomotion
// =============================================================================
describe('Feature 10: VRLocomotion', () => {
  it('getPosition returns initial position', () => {
    const vrl = new VRLocomotion();
    const pos = vrl.getPosition();
    expect(pos).toBeDefined();
    expect(typeof pos.x).toBe('number');
  });

  it('teleport moves to valid target', () => {
    const vrl = new VRLocomotion();
    const result = vrl.teleport({ x: 5, y: 0, z: 3, valid: true, normal: { x: 0, y: 1, z: 0 } });
    expect(result).toBe(true);
  });

  it('teleport fails for invalid target', () => {
    const vrl = new VRLocomotion();
    const result = vrl.teleport({ x: 5, y: 0, z: 3, valid: false, normal: { x: 0, y: 1, z: 0 } });
    expect(result).toBe(false);
  });

  it('teleport updates position', () => {
    const vrl = new VRLocomotion({ teleportRange: 20 });
    vrl.teleport({ x: 5, y: 0, z: 0, valid: true, normal: { x: 0, y: 1, z: 0 } });
    expect(vrl.getPosition().x).toBe(5);
  });

  it('move does not throw', () => {
    const vrl = new VRLocomotion({ mode: 'smooth' });
    expect(() => vrl.move(1, 0, 0.016)).not.toThrow();
  });

  it('snapTurn does not throw', () => {
    const vrl = new VRLocomotion();
    expect(() => vrl.snapTurn('left')).not.toThrow();
  });

  it('setMode changes the mode', () => {
    const vrl = new VRLocomotion();
    vrl.setMode('smooth');
    expect(vrl.getConfig().mode).toBe('smooth');
  });

  it('getTeleportHistory records teleports', () => {
    const vrl = new VRLocomotion();
    vrl.teleport({ x: 1, y: 0, z: 1, valid: true, normal: { x: 0, y: 1, z: 0 } });
    expect(vrl.getTeleportHistory()).toHaveLength(1);
  });
});
