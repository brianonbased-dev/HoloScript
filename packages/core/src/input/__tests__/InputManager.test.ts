import { describe, it, expect, beforeEach } from 'vitest';
import { InputManager } from '../InputManager';

describe('InputManager', () => {
  let input: InputManager;

  beforeEach(() => {
    input = new InputManager();
  });

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  it('keyDown registers pressed state', () => {
    input.keyDown('Space');
    expect(input.isKeyPressed('Space')).toBe(true);
  });

  it('keyUp clears pressed state', () => {
    input.keyDown('Space');
    input.keyUp('Space');
    expect(input.isKeyPressed('Space')).toBe(false);
  });

  it('justPressed is true on first frame', () => {
    input.keyDown('w');
    expect(input.isKeyJustPressed('w')).toBe(true);
  });

  it('justReleased is true after keyUp', () => {
    input.keyDown('a');
    input.keyUp('a');
    expect(input.isKeyJustReleased('a')).toBe(true);
  });

  it('held duration increases during update', () => {
    input.keyDown('w');
    input.update(0.1);
    expect(input.getKeyHeldDuration('w')).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Mouse
  // ---------------------------------------------------------------------------

  it('setMousePosition tracks position', () => {
    input.setMousePosition(100, 200);
    const pos = input.getMousePosition();
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(200);
  });

  it('mouse delta tracks movement', () => {
    input.setMousePosition(50, 50);
    input.setMousePosition(60, 70);
    const delta = input.getMouseDelta();
    expect(delta.x).toBe(10);
    expect(delta.y).toBe(20);
  });

  it('mouseButtonDown / isMouseButtonPressed', () => {
    input.mouseButtonDown(0);
    expect(input.isMouseButtonPressed(0)).toBe(true);
  });

  it('mouseButtonUp clears state', () => {
    input.mouseButtonDown(0);
    input.mouseButtonUp(0);
    expect(input.isMouseButtonPressed(0)).toBe(false);
  });

  it('setScrollDelta stores value', () => {
    input.setScrollDelta(3);
    const snap = input.getSnapshot();
    expect(snap.mouse.scrollDelta).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Gamepad
  // ---------------------------------------------------------------------------

  it('connectGamepad registers gamepad', () => {
    input.connectGamepad(0, 'Xbox', 4);
    const snap = input.getSnapshot();
    expect(snap.gamepads.has(0)).toBe(true);
  });

  it('disconnectGamepad marks gamepad disconnected', () => {
    input.connectGamepad(0, 'PS5', 4);
    input.disconnectGamepad(0);
    const snap = input.getSnapshot();
    expect(snap.gamepads.get(0)?.connected).toBe(false);
  });

  it('setGamepadAxis stores axis value', () => {
    input.connectGamepad(0, 'controller', 4);
    input.setGamepadAxis(0, 0, 0.75);
    expect(input.getGamepadAxis(0, 0)).toBeCloseTo(0.75, 1);
  });

  it('deadZone filters small axis values', () => {
    input.connectGamepad(0, 'controller', 4);
    input.setDeadZone(0.2);
    input.setGamepadAxis(0, 0, 0.1);
    expect(input.getGamepadAxis(0, 0)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Action Mapping
  // ---------------------------------------------------------------------------

  it('mapAction creates action from keys', () => {
    input.mapAction('jump', ['Space', 'w']);
    input.keyDown('Space');
    input.update(0);
    expect(input.isActionPressed('jump')).toBe(true);
  });

  it('unmapAction removes action', () => {
    input.mapAction('fire', ['f']);
    input.unmapAction('fire');
    expect(input.getAction('fire')).toBeUndefined();
  });

  it('isActionJustPressed detects first frame', () => {
    input.mapAction('attack', ['x']);
    input.keyDown('x');
    input.update(0);
    expect(input.isActionJustPressed('attack')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Buffering
  // ---------------------------------------------------------------------------

  it('buffered action returns recent press', () => {
    input.mapAction('dodge', ['d']);
    input.keyDown('d');
    input.update(0.01);
    input.keyUp('d');
    input.update(0.01);
    expect(input.getBufferedAction('dodge', 100)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Snapshot & Reset
  // ---------------------------------------------------------------------------

  it('getSnapshot returns current state', () => {
    input.keyDown('a');
    const snap = input.getSnapshot();
    expect(snap.keys).toBeDefined();
    expect(snap.mouse).toBeDefined();
    expect(snap.timestamp).toBeDefined();
  });

  it('reset clears all state', () => {
    input.keyDown('a');
    input.mouseButtonDown(0);
    input.reset();
    expect(input.isKeyPressed('a')).toBe(false);
    expect(input.isMouseButtonPressed(0)).toBe(false);
  });
});
