import { describe, it, expect, beforeEach } from 'vitest';
import { InputManager } from '@holoscript/engine/input/InputManager';

// =============================================================================
// C289 — Input Manager
// =============================================================================

describe('InputManager', () => {
  let im: InputManager;
  beforeEach(() => {
    im = new InputManager();
  });

  it('tracks key down/up', () => {
    im.keyDown('w');
    expect(im.isKeyPressed('w')).toBe(true);
    expect(im.isKeyJustPressed('w')).toBe(true);
    im.keyUp('w');
    expect(im.isKeyPressed('w')).toBe(false);
    expect(im.isKeyJustReleased('w')).toBe(true);
  });

  it('clears justPressed after update', () => {
    im.keyDown('a');
    im.update(0.016);
    expect(im.isKeyJustPressed('a')).toBe(false);
  });

  it('tracks held duration', () => {
    im.keyDown('space');
    im.update(0.016);
    im.keyDown('space'); // re-fire – still held
    im.update(0.016);
    expect(im.getKeyHeldDuration('space')).toBeCloseTo(0.032, 3);
  });

  it('tracks mouse position and delta', () => {
    im.setMousePosition(100, 200);
    expect(im.getMousePosition()).toEqual({ x: 100, y: 200 });
    im.setMousePosition(110, 210);
    expect(im.getMouseDelta()).toEqual({ x: 10, y: 10 });
  });

  it('tracks mouse buttons', () => {
    im.mouseButtonDown(0);
    expect(im.isMouseButtonPressed(0)).toBe(true);
    im.mouseButtonUp(0);
    expect(im.isMouseButtonPressed(0)).toBe(false);
  });

  it('connects and reads gamepad axis with dead zone', () => {
    im.connectGamepad(0, 'pad1');
    im.setGamepadAxis(0, 0, 0.1); // below default 0.15
    expect(im.getGamepadAxis(0, 0)).toBe(0);
    im.setGamepadAxis(0, 0, 0.5);
    expect(im.getGamepadAxis(0, 0)).toBe(0.5);
  });

  it('disconnects gamepad', () => {
    im.connectGamepad(0, 'pad1');
    im.disconnectGamepad(0);
    // axis reads still work but gamepad flagged as disconnected
    expect(im.getGamepadAxis(0, 0)).toBe(0);
  });

  it('maps and resolves actions', () => {
    im.mapAction('jump', ['space']);
    im.keyDown('space');
    im.update(0.016);
    expect(im.isActionPressed('jump')).toBe(true);
    expect(im.getAction('jump')?.value).toBe(1);
  });

  it('detects action just pressed and just released', () => {
    im.mapAction('fire', ['f']);
    im.keyDown('f');
    im.update(0.016);
    expect(im.getAction('fire')?.justPressed).toBe(true);
    im.update(0.016);
    expect(im.getAction('fire')?.justPressed).toBe(false);
    im.keyUp('f');
    im.update(0.016);
    expect(im.getAction('fire')?.justReleased).toBe(true);
  });

  it('unmaps an action', () => {
    im.mapAction('dash', ['d']);
    im.unmapAction('dash');
    expect(im.getAction('dash')).toBeUndefined();
  });

  it('buffers actions', () => {
    im.mapAction('atk', ['x']);
    im.keyDown('x');
    im.update(0.016);
    expect(im.getBufferedAction('atk')).toBe(true);
  });

  it('creates a snapshot', () => {
    im.keyDown('w');
    const snap = im.getSnapshot();
    expect(snap.keys.get('w')?.pressed).toBe(true);
    expect(snap.timestamp).toBeGreaterThan(0);
  });

  it('reset clears all state', () => {
    im.keyDown('w');
    im.mapAction('walk', ['w']);
    im.update(0.016);
    im.reset();
    expect(im.isKeyPressed('w')).toBe(false);
    expect(im.isActionPressed('walk')).toBe(false);
  });
});
