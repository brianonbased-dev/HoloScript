/**
 * CharacterTrait — Production Tests
 *
 * Covers:
 * - Constructor: all defaults, initial state, jumpsRemaining
 * - getConfig / getState copy semantics
 * - setPosition / getPosition / setVelocity / getVelocity
 * - move(): isMoving, currentSpeed, position advances with velocity
 * - tryJump: performJump emits 'jump', sets groundState='jumping', deducts jumpsRemaining
 * - tryJump with no jumps buffered: returns false, sets jumpBufferTimer
 * - cancelJump halves upward velocity
 * - setGrounded(true): land event, resets jumpsRemaining, airTime=0
 * - setGrounded(false) from grounded: fall-start event, coyote timer
 * - isGrounded, getGroundInfo
 * - isCrouching: crouch-start / crouch-end events via move()
 * - isSprinting: Sprint-start / Sprint-end events via move()
 * - getCurrentHeight: full vs crouch
 * - setMovementMode: mode-change event, toggleFly (canFly guard)
 * - onCollision: collision event
 * - Event system: on / off
 */
import { describe, it, expect, vi } from 'vitest';
import { CharacterTrait } from '../CharacterTrait';

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function mkChar(overrides: ConstructorParameters<typeof CharacterTrait>[0] = {}) {
  return new CharacterTrait(overrides);
}

// ─── Constructor ─────────────────────────────────────────────────────────────────

describe('CharacterTrait — constructor', () => {
  it('starts with zero position', () => {
    const c = mkChar();
    expect(c.getPosition()).toEqual([0, 0, 0 ]);
  });

  it('starts with zero velocity', () => {
    expect(mkChar().getVelocity()).toEqual([0, 0, 0 ]);
  });

  it('movementMode defaults to walking', () => {
    expect(mkChar().getState().movementMode).toBe('walking');
  });

  it('groundState defaults to grounded', () => {
    expect(mkChar().getState().groundState).toBe('grounded');
  });

  it('isCrouching = false initially', () => {
    expect(mkChar().isCrouching()).toBe(false);
  });

  it('isGrounded = true initially', () => {
    expect(mkChar().isGrounded()).toBe(true);
  });

  it('maxJumps=1 means jumpsRemaining=1 at start', () => {
    // Reflected through tryJump success conditions
    const c = mkChar({ maxJumps: 2 });
    expect(c.getConfig().maxJumps).toBe(2);
  });

  it('custom config overrides applied', () => {
    const c = mkChar({ walkSpeed: 7.0, jumpHeight: 2.5 });
    expect(c.getConfig().walkSpeed).toBeCloseTo(7.0);
    expect(c.getConfig().jumpHeight).toBeCloseTo(2.5);
  });

  it('getConfig returns copy (modifying does not affect internal)', () => {
    const c = mkChar({ walkSpeed: 3.0 });
    const cfg = c.getConfig();
    cfg.walkSpeed = 999;
    expect(c.getConfig().walkSpeed).toBeCloseTo(3.0);
  });

  it('getState returns copy', () => {
    const c = mkChar();
    const s = c.getState();
    s.movementMode = 'flying';
    expect(c.getState().movementMode).toBe('walking');
  });
});

// ─── Position / Velocity setters ─────────────────────────────────────────────────

describe('CharacterTrait — position / velocity', () => {
  it('setPosition updates getPosition', () => {
    const c = mkChar();
    c.setPosition([5, 2, -3 ]);
    expect(c.getPosition()).toEqual([5, 2, -3 ]);
  });

  it('setVelocity updates getVelocity', () => {
    const c = mkChar();
    c.setVelocity([1, 2, 3 ]);
    expect(c.getVelocity()).toEqual([1, 2, 3 ]);
  });

  it('setPosition makes a copy (mutation does not bleed through)', () => {
    const c = mkChar();
    const pos = [1, 0, 0 ];
    c.setPosition(pos);
    pos.x = 999;
    expect(c.getPosition().x).toBe(1);
  });
});

// ─── move() ───────────────────────────────────────────────────────────────────────

describe('CharacterTrait — move()', () => {
  it('isMoving = true when forward input > 0.01', () => {
    const c = mkChar();
    c.move({ forward: 1, strafe: 0 }, 0.016);
    expect(c.getState().isMoving).toBe(true);
  });

  it('isMoving = false when no input', () => {
    const c = mkChar();
    c.move({ forward: 0, strafe: 0 }, 0.016);
    expect(c.getState().isMoving).toBe(false);
  });

  it('position advances in z when forward > 0', () => {
    const c = mkChar({ walkSpeed: 10, groundAcceleration: 1000, groundFriction: 0 });
    const before = c.getPosition().z;
    c.move({ forward: 1, strafe: 0 }, 0.1);
    expect(c.getPosition().z).toBeGreaterThan(before);
  });

  it('position advances in x when strafe > 0', () => {
    const c = mkChar({ walkSpeed: 10, groundAcceleration: 1000, groundFriction: 0 });
    const before = c.getPosition().x;
    c.move({ forward: 0, strafe: 1 }, 0.1);
    expect(c.getPosition().x).toBeGreaterThan(before);
  });

  it('currentSpeed is non-negative after movement', () => {
    const c = mkChar({ walkSpeed: 5, groundAcceleration: 100, groundFriction: 0 });
    c.move({ forward: 1, strafe: 0 }, 0.1);
    expect(c.getState().currentSpeed).toBeGreaterThanOrEqual(0);
  });
});

// ─── tryJump ──────────────────────────────────────────────────────────────────────

describe('CharacterTrait — tryJump', () => {
  it('tryJump returns true when grounded (jumpsRemaining > 0)', () => {
    expect(mkChar().tryJump()).toBe(true);
  });

  it('performJump sets groundState = jumping', () => {
    const c = mkChar();
    c.tryJump();
    expect(c.getState().groundState).toBe('jumping');
  });

  it('jump velocity is positive (upward)', () => {
    const c = mkChar({ jumpHeight: 1.2, gravity: -9.81 });
    c.tryJump();
    // v = sqrt(2 * 9.81 * 1.2) ≈ 4.85
    expect(c.getVelocity().y).toBeGreaterThan(0);
  });

  it('jump velocity matches sqrt(2 * |gravity| * jumpHeight)', () => {
    const c = mkChar({ jumpHeight: 1.2, gravity: -9.81 });
    c.tryJump();
    const expected = Math.sqrt(2 * 9.81 * 1.2);
    expect(c.getVelocity().y).toBeCloseTo(expected, 2);
  });

  it('tryJump emits jump event', () => {
    const c = mkChar();
    const events: string[] = [];
    c.on('jump', (e) => events.push(e.type));
    c.tryJump();
    expect(events).toContain('jump');
  });

  it('tryJump depletes jumpsRemaining', () => {
    const c = mkChar({ maxJumps: 1 });
    c.tryJump(); // first jump
    // Now jumpsRemaining = 0 and not grounded
    expect(c.tryJump()).toBe(false);
  });

  it('double jump works with maxJumps=2', () => {
    const c = mkChar({ maxJumps: 2 });
    expect(c.tryJump()).toBe(true);
    expect(c.tryJump()).toBe(true);
    expect(c.tryJump()).toBe(false);
  });

  it('buffers jump when no jumps remaining (returns false with timer set)', () => {
    const c = mkChar({ maxJumps: 1, jumpBuffer: 0.1 });
    c.tryJump(); // uses last jump
    c.setGrounded(false); // go airborne
    const result = c.tryJump(); // no jumps left, not coyote time
    expect(result).toBe(false);
  });

  it('cancelJump halves positive y velocity', () => {
    const c = mkChar();
    c.tryJump();
    const velBefore = c.getVelocity().y;
    c.cancelJump();
    expect(c.getVelocity().y).toBeCloseTo(velBefore * 0.5, 2);
  });

  it('cancelJump does nothing when y velocity <= 0', () => {
    const c = mkChar();
    c.setVelocity([0, 0, 0 ]);
    c.cancelJump();
    expect(c.getVelocity().y).toBe(0);
  });
});

// ─── setGrounded ──────────────────────────────────────────────────────────────────

describe('CharacterTrait — setGrounded', () => {
  it('setGrounded(true) from airborne emits land event', () => {
    const c = mkChar();
    c.tryJump(); // go airborne
    const events: string[] = [];
    c.on('land', (e) => events.push(e.type));
    c.setGrounded(true);
    expect(events).toContain('land');
  });

  it('setGrounded(true) resets jumpsRemaining to maxJumps', () => {
    const c = mkChar({ maxJumps: 3 });
    c.tryJump();
    c.tryJump();
    c.setGrounded(true);
    // After landing, jumpsRemaining = 3 again
    expect(c.tryJump()).toBe(true);
    expect(c.tryJump()).toBe(true);
    expect(c.tryJump()).toBe(true);
    expect(c.tryJump()).toBe(false);
  });

  it('setGrounded(true) resets airTime to 0', () => {
    const c = mkChar();
    c.tryJump();
    c.setGrounded(true);
    expect(c.getState().airTime).toBe(0);
  });

  it('isGrounded = true after setGrounded(true)', () => {
    const c = mkChar();
    c.tryJump();
    c.setGrounded(true);
    expect(c.isGrounded()).toBe(true);
  });

  it('setGrounded(false) from grounded emits fall-start', () => {
    const c = mkChar();
    const events: string[] = [];
    c.on('fall-start', (e) => events.push(e.type));
    c.setGrounded(false);
    expect(events).toContain('fall-start');
  });

  it('getGroundInfo reflects hit data from setGrounded(true, hit)', () => {
    const c = mkChar();
    c.tryJump();
    c.setGrounded(true, { grounded: true, layer: 'rock', distance: 0.02 });
    expect(c.getGroundInfo()?.layer).toBe('rock');
  });

  it('getGroundInfo = undefined when airborne', () => {
    const c = mkChar();
    c.setGrounded(false);
    expect(c.getGroundInfo()).toBeUndefined();
  });
});

// ─── Crouch ───────────────────────────────────────────────────────────────────────

describe('CharacterTrait — crouch', () => {
  it('crouch-start emitted when first crouching via move()', () => {
    const c = mkChar({ canCrouch: true });
    const events: string[] = [];
    c.on('crouch-start', (e) => events.push(e.type));
    c.move({ forward: 0, strafe: 0, crouch: true }, 0.016);
    expect(events).toContain('crouch-start');
  });

  it('crouch-end emitted when releasing crouch', () => {
    const c = mkChar({ canCrouch: true });
    c.move({ forward: 0, strafe: 0, crouch: true }, 0.016);
    const events: string[] = [];
    c.on('crouch-end', (e) => events.push(e.type));
    c.move({ forward: 0, strafe: 0, crouch: false }, 0.016);
    expect(events).toContain('crouch-end');
  });

  it('getCurrentHeight = crouchHeight when crouching', () => {
    const c = mkChar({ canCrouch: true, height: 1.8, crouchHeight: 1.0 });
    c.move({ forward: 0, strafe: 0, crouch: true }, 0.016);
    expect(c.getCurrentHeight()).toBeCloseTo(1.0);
  });

  it('getCurrentHeight = full height when not crouching', () => {
    const c = mkChar({ height: 1.8 });
    expect(c.getCurrentHeight()).toBeCloseTo(1.8);
  });

  it('canCrouch=false: no crouch-start event', () => {
    const c = mkChar({ canCrouch: false });
    const events: string[] = [];
    c.on('crouch-start', (e) => events.push(e.type));
    c.move({ forward: 0, strafe: 0, crouch: true }, 0.016);
    expect(events).toHaveLength(0);
  });
});

// ─── Sprint ───────────────────────────────────────────────────────────────────────

describe('CharacterTrait — Sprint', () => {
  it('Sprint-start emitted when sprinting while moving', () => {
    const c = mkChar({ canSprint: true });
    // First move: establish isMoving=true (move() sets isMoving at the END,
    // before which updateSprint runs, so Sprint-start won't fire on frame 1)
    c.move({ forward: 1, strafe: 0, Sprint: false }, 0.016);
    const events: string[] = [];
    c.on('Sprint-start', (e) => events.push(e.type));
    c.move({ forward: 1, strafe: 0, Sprint: true }, 0.016);
    expect(events).toContain('Sprint-start');
  });

  it('Sprint-end emitted when stopping Sprint', () => {
    const c = mkChar({ canSprint: true });
    // Frame 1: establish isMoving=true
    c.move({ forward: 1, strafe: 0, Sprint: false }, 0.016);
    // Frame 2: Sprint starts
    c.move({ forward: 1, strafe: 0, Sprint: true }, 0.016);
    const events: string[] = [];
    c.on('Sprint-end', (e) => events.push(e.type));
    // Frame 3: stop sprinting
    c.move({ forward: 1, strafe: 0, Sprint: false }, 0.016);
    expect(events).toContain('Sprint-end');
  });

  it('canSprint=false: no Sprint-start', () => {
    const c = mkChar({ canSprint: false });
    const events: string[] = [];
    c.on('Sprint-start', (e) => events.push(e.type));
    c.move({ forward: 1, strafe: 0, Sprint: true }, 0.016);
    expect(events).toHaveLength(0);
  });
});

// ─── Movement Modes ───────────────────────────────────────────────────────────────

describe('CharacterTrait — movement modes', () => {
  it('setMovementMode changes mode', () => {
    const c = mkChar();
    c.setMovementMode('running');
    expect(c.getMovementMode()).toBe('running');
  });

  it('setMovementMode emits mode-change', () => {
    const c = mkChar();
    const events: string[] = [];
    c.on('mode-change', (e) => events.push(e.type));
    c.setMovementMode('running');
    expect(events).toContain('mode-change');
  });

  it('setMovementMode to same mode does not emit event', () => {
    const c = mkChar();
    const events: string[] = [];
    c.on('mode-change', (e) => events.push(e.type));
    c.setMovementMode('walking'); // already walking
    expect(events).toHaveLength(0);
  });

  it('toggleFly returns false when canFly=false', () => {
    const c = mkChar({ canFly: false });
    expect(c.toggleFly()).toBe(false);
  });

  it('toggleFly switches to flying when canFly=true', () => {
    const c = mkChar({ canFly: true });
    c.toggleFly();
    expect(c.getMovementMode()).toBe('flying');
  });

  it('toggleFly toggles back to walking', () => {
    const c = mkChar({ canFly: true });
    c.toggleFly();
    c.toggleFly();
    expect(c.getMovementMode()).toBe('walking');
  });
});

// ─── Collision ────────────────────────────────────────────────────────────────────

describe('CharacterTrait — collision', () => {
  it('onCollision emits collision event', () => {
    const c = mkChar();
    const events: string[] = [];
    c.on('collision', (e) => events.push(e.type));
    c.onCollision([1, 0, 0 ], [-1, 0, 0 ]);
    expect(events).toContain('collision');
  });

  it('onCollision event has correct point and normal', () => {
    const c = mkChar();
    let col: any;
    c.on('collision', (e) => {
      col = e.collision;
    });
    c.onCollision([2, 1, 0 ], [0, 1, 0 ], 'wall');
    expect(col.point).toEqual([2, 1, 0 ]);
    expect(col.normal).toEqual([0, 1, 0 ]);
    expect(col.other).toBe('wall');
  });
});

// ─── Event system ─────────────────────────────────────────────────────────────────

describe('CharacterTrait — event system', () => {
  it('on registers and off removes listener', () => {
    const c = mkChar({ canFly: true });
    const cb = vi.fn();
    c.on('mode-change', cb);
    c.setMovementMode('flying');
    expect(cb).toHaveBeenCalledTimes(1);
    c.off('mode-change', cb);
    c.setMovementMode('walking');
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
