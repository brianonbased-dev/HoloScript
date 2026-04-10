import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VRPhysicsBridge } from '@holoscript/core';

// =============================================================================
// MOCK PHYSICS WORLD
// =============================================================================

function createMockWorld() {
  const bodies = new Map<string, any>();
  const contacts: any[] = [];
  return {
    createBody: vi.fn((config: any) => {
      bodies.set(config.id, {
        ...config,
        velocity: { x: 0, y: 0, z: 0 },
        position: config.transform?.position,
      });
      return config.id;
    }),
    getBody: vi.fn((id: string) => bodies.get(id) || null),
    getContacts: vi.fn(() => contacts),
    setPosition: vi.fn((id: string, position: any) => {
      if (bodies.has(id)) bodies.get(id).position = { ...position };
    }),
    setLinearVelocity: vi.fn((id: string, velocity: any) => {
      if (bodies.has(id)) bodies.get(id).velocity = { ...velocity };
    }),
    _bodies: bodies,
    _contacts: contacts,
  };
}

function mockHand(pos: { x: number; y: number; z: number }): any {
  return {
    position: { ...pos },
    rotation: { x: 0, y: 0, z: 0 },
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('VRPhysicsBridge', () => {
  let world: ReturnType<typeof createMockWorld>;
  let hapticCallback: ReturnType<typeof vi.fn>;
  let bridge: VRPhysicsBridge;

  beforeEach(() => {
    world = createMockWorld();
    hapticCallback = vi.fn();
    bridge = new VRPhysicsBridge(world as any, hapticCallback);
  });

  it('creates kinematic bodies for hands on first update', () => {
    bridge.update(
      {
        hands: {
          left: mockHand({ x: 0, y: 1, z: 0 }),
          right: mockHand({ x: 0.5, y: 1, z: 0 }),
        },
      },
      0.016
    );

    expect(world.createBody).toHaveBeenCalledTimes(2);
    expect(world.createBody).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hand_left', type: 'kinematic' })
    );
    expect(world.createBody).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hand_right', type: 'kinematic' })
    );
  });

  it('does not recreate bodies on subsequent updates', () => {
    const ctx = {
      hands: {
        left: mockHand({ x: 0, y: 1, z: 0 }),
        right: mockHand({ x: 0.5, y: 1, z: 0 }),
      },
    };
    bridge.update(ctx, 0.016);
    bridge.update(ctx, 0.016);
    // addBody called only once per hand (2 total)
    expect(world.createBody).toHaveBeenCalledTimes(2);
  });

  it('updates body position from hand tracking', () => {
    bridge.update(
      {
        hands: {
          left: mockHand({ x: 0, y: 1, z: 0 }),
          right: null,
        },
      },
      0.016
    );

    const body = world._bodies.get('hand_left');
    expect(body.position.x).toBe(0);
    expect(body.position.y).toBe(1);

    // Move hand
    bridge.update(
      {
        hands: {
          left: mockHand({ x: 1, y: 2, z: 3 }),
          right: null,
        },
      },
      0.016
    );

    expect(body.position.x).toBe(1);
    expect(body.position.y).toBe(2);
    expect(body.position.z).toBe(3);
  });

  it('calculates smoothed velocity from position changes', () => {
    bridge.update(
      {
        hands: {
          left: mockHand({ x: 0, y: 0, z: 0 }),
          right: null,
        },
      },
      0.016
    );

    bridge.update(
      {
        hands: {
          left: mockHand({ x: 1, y: 0, z: 0 }),
          right: null,
        },
      },
      0.016
    );

    const body = world._bodies.get('hand_left');
    // Velocity should be non-zero in X direction
    expect(body.velocity.x).not.toBe(0);
    expect(body.velocity.y).toBe(0);
  });

  it('does not update when hand is null (tracking lost)', () => {
    bridge.update(
      {
        hands: { left: null, right: null },
      },
      0.016
    );

    expect(world.createBody).not.toHaveBeenCalled();
  });

  it('fires haptic feedback on hand collision', () => {
    world._contacts.push({ type: 'begin', bodyA: 'hand_left', bodyB: 'some_object' });

    bridge.update(
      {
        hands: {
          left: mockHand({ x: 0, y: 0, z: 0 }),
          right: null,
        },
      },
      0.016
    );

    expect(hapticCallback).toHaveBeenCalledWith('left', 0.5, 50);
  });

  it('fires haptic on right hand collision', () => {
    world._contacts.push({ type: 'begin', bodyA: 'some_object', bodyB: 'hand_right' });

    bridge.update(
      {
        hands: {
          left: null,
          right: mockHand({ x: 0, y: 0, z: 0 }),
        },
      },
      0.016
    );

    expect(hapticCallback).toHaveBeenCalledWith('right', 0.5, 50);
  });

  it('does not fire haptic on non-begin contacts', () => {
    world._contacts.push({ type: 'end', bodyA: 'hand_left', bodyB: 'some_object' });

    bridge.update(
      {
        hands: {
          left: mockHand({ x: 0, y: 0, z: 0 }),
          right: null,
        },
      },
      0.016
    );

    expect(hapticCallback).not.toHaveBeenCalled();
  });

  it('getHandBodyId returns null when body not created', () => {
    expect(bridge.getHandBodyId('left')).toBeNull();
    expect(bridge.getHandBodyId('right')).toBeNull();
  });

  it('getHandBodyId returns id when body exists', () => {
    bridge.update(
      {
        hands: {
          left: mockHand({ x: 0, y: 0, z: 0 }),
          right: null,
        },
      },
      0.016
    );

    expect(bridge.getHandBodyId('left')).toBe('hand_left');
    expect(bridge.getHandBodyId('right')).toBeNull();
  });
});
