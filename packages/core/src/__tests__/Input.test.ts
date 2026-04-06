import { describe, it, expect } from 'vitest';
import { InputManager } from '@holoscript/engine/input/InputManager';
import { InputBindings } from '@holoscript/engine/input/InputBindings';
import { GestureRecognizer } from '@holoscript/engine/input/GestureRecognizer';

describe('Cycle 116: Input System', () => {
  // -------------------------------------------------------------------------
  // InputManager
  // -------------------------------------------------------------------------

  it('should track keyboard state', () => {
    const input = new InputManager();
    input.keyDown('Space');
    expect(input.isKeyPressed('Space')).toBe(true);
    expect(input.isKeyJustPressed('Space')).toBe(true);

    input.update(0.016);
    expect(input.isKeyJustPressed('Space')).toBe(false);
    expect(input.isKeyPressed('Space')).toBe(true);

    input.keyUp('Space');
    expect(input.isKeyJustReleased('Space')).toBe(true);
  });

  it('should track mouse position and buttons', () => {
    const input = new InputManager();
    input.setMousePosition(100, 200);
    expect(input.getMousePosition()).toEqual({ x: 100, y: 200 });

    input.setMousePosition(110, 205);
    expect(input.getMouseDelta()).toEqual({ x: 10, y: 5 });

    input.mouseButtonDown(0);
    expect(input.isMouseButtonPressed(0)).toBe(true);
  });

  it('should map actions to keys', () => {
    const input = new InputManager();
    input.mapAction('jump', ['Space', 'KeyW']);
    input.keyDown('Space');
    input.update(0.016);

    expect(input.isActionPressed('jump')).toBe(true);
    expect(input.isActionJustPressed('jump')).toBe(true);
  });

  it('should apply gamepad dead zones', () => {
    const input = new InputManager();
    input.connectGamepad(0, 'Xbox Controller');
    input.setGamepadAxis(0, 0, 0.05); // Below default 0.15 dead zone
    expect(input.getGamepadAxis(0, 0)).toBe(0);

    input.setGamepadAxis(0, 0, 0.5); // Above dead zone
    expect(input.getGamepadAxis(0, 0)).toBe(0.5);
  });

  // -------------------------------------------------------------------------
  // InputBindings
  // -------------------------------------------------------------------------

  it('should manage binding profiles', () => {
    const bindings = new InputBindings();
    bindings.createProfile('gamepad', 'Gamepad');
    expect(bindings.getProfileCount()).toBe(2); // default + gamepad

    bindings.setActiveProfile('gamepad');
    expect(bindings.getActiveProfile()!.id).toBe('gamepad');
  });

  it('should bind actions and detect conflicts', () => {
    const bindings = new InputBindings();
    bindings.bind('jump', 'key', 'Space');
    bindings.bind('dodge', 'key', 'Space');

    const conflicts = bindings.detectConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].action1).toBe('jump');
    expect(conflicts[0].action2).toBe('dodge');
  });

  it('should resolve composite axes', () => {
    const bindings = new InputBindings();
    bindings.addCompositeAxis('horizontal', 'KeyD', 'KeyA');

    const keys = new Map<string, boolean>([
      ['KeyD', true],
      ['KeyA', false],
    ]);
    expect(bindings.resolveComposite('horizontal', keys)).toBe(1);

    keys.set('KeyD', false);
    keys.set('KeyA', true);
    expect(bindings.resolveComposite('horizontal', keys)).toBe(-1);

    keys.set('KeyD', true);
    expect(bindings.resolveComposite('horizontal', keys)).toBe(0); // Cancel out
  });

  // -------------------------------------------------------------------------
  // GestureRecognizer
  // -------------------------------------------------------------------------

  it('should recognize tap gesture', () => {
    const gestures = new GestureRecognizer({ tapMaxDuration: 500, tapMaxDistance: 20 });
    const events: string[] = [];
    gestures.on('tap', () => events.push('tap'));

    gestures.touchStart(0, 100, 100);
    gestures.touchEnd(0, 100, 100);

    expect(events).toContain('tap');
  });

  it('should recognize swipe gesture', () => {
    const gestures = new GestureRecognizer({ swipeMinDistance: 30, swipeMinVelocity: 0.1 });
    const events: Array<{ type: string; dir?: string }> = [];
    gestures.on('swipe', (e) => events.push({ type: 'swipe', dir: e.direction }));

    gestures.touchStart(0, 100, 100);
    // Simulate fast swipe right (large distance = meets min distance, will compute velocity)
    gestures.touchEnd(0, 300, 100);

    expect(events.length).toBeGreaterThan(0);
    if (events.length > 0) {
      expect(events[0].dir).toBe('right');
    }
  });

  it('should track gesture history', () => {
    const gestures = new GestureRecognizer({ tapMaxDuration: 500, tapMaxDistance: 20 });
    gestures.touchStart(0, 50, 50);
    gestures.touchEnd(0, 50, 50);
    gestures.touchStart(1, 200, 200);
    gestures.touchEnd(1, 200, 200);

    const history = gestures.getGestureHistory();
    expect(history.length).toBeGreaterThanOrEqual(2);
  });
});
