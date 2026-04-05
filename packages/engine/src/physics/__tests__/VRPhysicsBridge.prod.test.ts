import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VRPhysicsBridge } from '@holoscript/core';
import type { IPhysicsWorld, IVector3, IQuaternion } from '@holoscript/core';
import type { VRHand } from '@holoscript/core';

// =============================================================================
// MOCK IPhysicsWorld
// =============================================================================

type ContactEvent = { type: 'begin' | 'end'; bodyA: string; bodyB: string };

function makeWorld(initialBodies: Record<string, any> = {}) {
  const bodies: Record<string, any> = { ...initialBodies };
  const contacts: ContactEvent[] = [];

  return {
    createBody(config: any) {
      bodies[config.id] = { ...config, velocity: { x: 0, y: 0, z: 0 }, position: config.transform?.position };
      return config.id;
    },
    setPosition(id: string, position: IVector3) {
      if (bodies[id]) bodies[id].position = { ...position };
    },
    setLinearVelocity(id: string, velocity: IVector3) {
      if (bodies[id]) bodies[id].velocity = { ...velocity };
    },
    getBody(id: string) {
      return bodies[id] ?? null;
    },
    removeBody(id: string) {
      delete bodies[id];
    },
    getContacts() {
      return contacts;
    },
    // test helpers
    _bodies: bodies,
    _contacts: contacts,
  } as unknown as IPhysicsWorld & {
    _bodies: Record<string, any>;
    _contacts: ContactEvent[];
  };
}

function makeHand(x: number, y = 0, z = 0): VRHand {
  return { position: { x, y, z }, rotation: { x: 0, y: 0, z: 0 } } as VRHand;
}

function makeContext(left: VRHand | null, right: VRHand | null) {
  return { hands: { left, right } };
}

// =============================================================================
// TESTS
// =============================================================================

describe('VRPhysicsBridge — Production Tests', () => {
  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('instantiates without errors', () => {
      const world = makeWorld();
      expect(() => new VRPhysicsBridge(world as any)).not.toThrow();
    });

    it('accepts an onHaptic callback', () => {
      const world = makeWorld();
      const haptic = vi.fn();
      expect(() => new VRPhysicsBridge(world as any, haptic)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // updateHand — body creation
  // -------------------------------------------------------------------------
  describe('updateHand — body creation', () => {
    it('creates a kinematic body for a tracked hand', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(makeHand(1, 2, 3), 'left', 0.016);
      expect(world._bodies['hand_left']).toBeDefined();
    });

    it('body type is kinematic', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(makeHand(0, 0, 0), 'right', 0.016);
      expect(world._bodies['hand_right'].type).toBe('kinematic');
    });

    it('body position matches hand position', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(makeHand(1.5, 2.5, 0.5), 'left', 0.016);
      const body = world._bodies['hand_left'];
      expect(body.position.x).toBeCloseTo(1.5);
      expect(body.position.y).toBeCloseTo(2.5);
      expect(body.position.z).toBeCloseTo(0.5);
    });

    it('body shape is a sphere', () => {
      const world = makeWorld();
      new VRPhysicsBridge(world as any).updateHand(makeHand(0, 0, 0), 'left', 0.016);
      expect(world._bodies['hand_left'].shape.type).toBe('sphere');
    });

    it('does not re-create body on second update', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(makeHand(0), 'left', 0.016);
      const firstBody = world._bodies['hand_left'];
      bridge.updateHand(makeHand(1), 'left', 0.016);
      // Body reference should be the same object (not recreated)
      expect(world._bodies['hand_left']).toBe(firstBody);
    });

    it('creates separate bodies for left and right hands', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(makeHand(0), 'left', 0.016);
      bridge.updateHand(makeHand(1), 'right', 0.016);
      expect(world._bodies['hand_left']).toBeDefined();
      expect(world._bodies['hand_right']).toBeDefined();
    });

    it('no-ops when hand is null (lost tracking)', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(null, 'left', 0.016);
      expect(world._bodies['hand_left']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // updateHand — velocity calculation
  // -------------------------------------------------------------------------
  describe('updateHand — velocity calculation', () => {
    it('computes non-zero velocity after position change', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(makeHand(0), 'left', 0.016);
      bridge.updateHand(makeHand(1), 'left', 0.016); // moved 1m in 16ms
      const vel = world._bodies['hand_left'].velocity;
      expect(Math.abs(vel.x)).toBeGreaterThan(0);
    });

    it('velocity is zero when hand has not moved', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(makeHand(1), 'left', 0.016);
      bridge.updateHand(makeHand(1), 'left', 0.016);
      const vel = world._bodies['hand_left'].velocity;
      // With smoothingFactor=0.5, velocity should be very close to 0
      expect(Math.abs(vel.x)).toBeLessThan(0.01);
    });

    it('applies smoothing (velocity magnitude < raw)', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(makeHand(0), 'left', 0.016);
      // Large jump: raw velocity would be 100/s
      bridge.updateHand(makeHand(1), 'left', 0.01);
      const rawExpected = 1 / 0.01; // 100
      const smoothed = world._bodies['hand_left'].velocity.x;
      // With smoothing factor 0.5, first frame: smoothed = 0*0.5 + 100*0.5 = 50
      expect(smoothed).toBeLessThan(rawExpected);
    });

    it('uses safe delta when delta is very small', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(makeHand(0), 'left', 0.016);
      // Very small delta — should use 0.016 fallback, not divide by ~0
      expect(() => bridge.updateHand(makeHand(0.001), 'left', 0.0001)).not.toThrow();
      const body = world._bodies['hand_left'];
      expect(isFinite(body.velocity.x)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // update() — full context
  // -------------------------------------------------------------------------
  describe('update()', () => {
    it('updates both hands from context', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.update(makeContext(makeHand(0), makeHand(1)), 0.016);
      expect(world._bodies['hand_left']).toBeDefined();
      expect(world._bodies['hand_right']).toBeDefined();
    });

    it('does not throw when both hands are null', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      expect(() => bridge.update(makeContext(null, null), 0.016)).not.toThrow();
    });

    it('does not throw when one hand is null', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      expect(() => bridge.update(makeContext(makeHand(0), null), 0.016)).not.toThrow();
      expect(() => bridge.update(makeContext(null, makeHand(1)), 0.016)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Collision / Haptics
  // -------------------------------------------------------------------------
  describe('collision haptics', () => {
    it('fires haptic for left hand on contact begin', () => {
      const haptic = vi.fn();
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any, haptic);
      world._contacts.push({ type: 'begin', bodyA: 'hand_left', bodyB: 'cube_1' });
      bridge.update(makeContext(makeHand(0), makeHand(1)), 0.016);
      expect(haptic).toHaveBeenCalledWith('left', expect.any(Number), expect.any(Number));
    });

    it('fires haptic for right hand on contact begin', () => {
      const haptic = vi.fn();
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any, haptic);
      world._contacts.push({ type: 'begin', bodyA: 'box', bodyB: 'hand_right' });
      bridge.update(makeContext(makeHand(0), makeHand(1)), 0.016);
      expect(haptic).toHaveBeenCalledWith('right', expect.any(Number), expect.any(Number));
    });

    it('does NOT fire haptic for non-hand contact', () => {
      const haptic = vi.fn();
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any, haptic);
      world._contacts.push({ type: 'begin', bodyA: 'box_a', bodyB: 'box_b' });
      bridge.update(makeContext(makeHand(0), makeHand(1)), 0.016);
      expect(haptic).not.toHaveBeenCalled();
    });

    it('does NOT fire haptic for contact end events', () => {
      const haptic = vi.fn();
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any, haptic);
      world._contacts.push({ type: 'end', bodyA: 'hand_left', bodyB: 'cube' });
      bridge.update(makeContext(makeHand(0), makeHand(1)), 0.016);
      expect(haptic).not.toHaveBeenCalled();
    });

    it('uses default no-op haptic when not provided', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      world._contacts.push({ type: 'begin', bodyA: 'hand_left', bodyB: 'cube' });
      expect(() => bridge.update(makeContext(makeHand(0), makeHand(1)), 0.016)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getHandBodyId
  // -------------------------------------------------------------------------
  describe('getHandBodyId', () => {
    it('returns null before hand is tracked', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      expect(bridge.getHandBodyId('left')).toBeNull();
    });

    it('returns body ID after hand is updated', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(makeHand(0), 'left', 0.016);
      expect(bridge.getHandBodyId('left')).toBe('hand_left');
    });

    it('returns correct ID for right hand', () => {
      const world = makeWorld();
      const bridge = new VRPhysicsBridge(world as any);
      bridge.updateHand(makeHand(0), 'right', 0.016);
      expect(bridge.getHandBodyId('right')).toBe('hand_right');
    });
  });
});
