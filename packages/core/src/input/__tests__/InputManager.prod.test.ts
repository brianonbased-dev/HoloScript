/**
 * InputManager — Production Test Suite
 *
 * Covers: keyboard, mouse, gamepad state, action mapping,
 * dead zones, held duration, snapshots, reset.
 */
import { describe, it, expect } from 'vitest';
import { InputManager } from '@holoscript/engine/input/InputManager';

describe('InputManager — Production', () => {
  // ─── Keyboard ─────────────────────────────────────────────────────
  it('keyDown registers pressed', () => {
    const im = new InputManager();
    im.keyDown('Space');
    expect(im.isKeyPressed('Space')).toBe(true);
    expect(im.isKeyJustPressed('Space')).toBe(true);
  });

  it('keyUp registers release', () => {
    const im = new InputManager();
    im.keyDown('Space');
    im.keyUp('Space');
    expect(im.isKeyPressed('Space')).toBe(false);
    expect(im.isKeyJustReleased('Space')).toBe(true);
  });

  it('held duration accumulates', () => {
    const im = new InputManager();
    im.keyDown('W');
    im.update(0.5);
    expect(im.getKeyHeldDuration('W')).toBeCloseTo(0.5);
  });

  // ─── Mouse ────────────────────────────────────────────────────────
  it('mouse position and delta', () => {
    const im = new InputManager();
    im.setMousePosition(100, 200);
    expect(im.getMousePosition()).toEqual({ x: 100, y: 200 });
  });

  it('mouse button state', () => {
    const im = new InputManager();
    im.mouseButtonDown(0);
    expect(im.isMouseButtonPressed(0)).toBe(true);
    im.mouseButtonUp(0);
    expect(im.isMouseButtonPressed(0)).toBe(false);
  });

  // ─── Gamepad ──────────────────────────────────────────────────────
  it('gamepad connect and axis', () => {
    const im = new InputManager();
    im.connectGamepad(0, 'Xbox Controller');
    im.setGamepadAxis(0, 0, 0.8);
    expect(im.getGamepadAxis(0, 0)).toBeGreaterThan(0);
  });

  it('dead zone filters small values', () => {
    const im = new InputManager();
    im.connectGamepad(0, 'Xbox');
    im.setDeadZone(0.2);
    im.setGamepadAxis(0, 0, 0.1);
    expect(im.getGamepadAxis(0, 0)).toBe(0);
  });

  // ─── Action Mapping ───────────────────────────────────────────────
  it('mapAction binds keys to action', () => {
    const im = new InputManager();
    im.mapAction('jump', ['Space', 'W']);
    im.keyDown('Space');
    im.update(0);
    expect(im.isActionPressed('jump')).toBe(true);
  });

  it('unmapAction removes binding', () => {
    const im = new InputManager();
    im.mapAction('jump', ['Space']);
    im.unmapAction('jump');
    im.keyDown('Space');
    im.update(0);
    expect(im.isActionPressed('jump')).toBe(false);
  });

  // ─── Snapshot ─────────────────────────────────────────────────────
  it('getSnapshot captures current input state', () => {
    const im = new InputManager();
    im.keyDown('A');
    const snap = im.getSnapshot();
    expect(snap.keys.get('A')?.pressed).toBe(true);
  });

  // ─── Reset ────────────────────────────────────────────────────────
  it('reset clears all input state', () => {
    const im = new InputManager();
    im.keyDown('A');
    im.reset();
    expect(im.isKeyPressed('A')).toBe(false);
  });
});
