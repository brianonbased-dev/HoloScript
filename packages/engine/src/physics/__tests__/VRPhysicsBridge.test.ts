import type { Vector3 } from '@holoscript/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VRPhysicsBridge } from '..';

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
        velocity: [0, 0, 0 ],
        position: config.transform?.position,
      });
      return config.id;
    }),
    getBody: vi.fn((id: string) => bodies.get(id) || null),
    getContacts: vi.fn(() => contacts),
    setPosition: vi.fn((id: string, position: any) => {
      if (bodies.has(id)) bodies.get(id).position = [...position  ];
    }),
    setLinearVelocity: vi.fn((id: string, velocity: any) => {
      if (bodies.has(id)) bodies.get(id).velocity = [...velocity  ];
    }),
    _bodies: bodies,
    _contacts: contacts,
  };
}

function mockHand(pos: Vector3): any {
  return {
    position: [...pos  ],
    rotation: [0, 0, 0 ],
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
          left: mockHand([0, 1, 0 ]),
          right: mockHand([0.5, 1, 0 ]),
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
        left: mockHand([0, 1, 0 ]),
        right: mockHand([0.5, 1, 0 ]),
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
          left: mockHand([0, 1, 0 ]),
          right: null,
        },
      },
      0.016
    );

    const body = world._bodies.get('hand_left');
    expect(body.position[0]).toBe(0);
    expect(body.position[1]).toBe(1);

    // Move hand
    bridge.update(
      {
        hands: {
          left: mockHand([1, 2, 3 ]),
          right: null,
        },
      },
      0.016
    );

    expect(body.position[0]).toBe(1);
    expect(body.position[1]).toBe(2);
    expect(body.position[2]).toBe(3);
  });

  it('calculates smoothed velocity from position changes', () => {
    bridge.update(
      {
        hands: {
          left: mockHand([0, 0, 0 ]),
          right: null,
        },
      },
      0.016
    );

    bridge.update(
      {
        hands: {
          left: mockHand([1, 0, 0 ]),
          right: null,
        },
      },
      0.016
    );

    const body = world._bodies.get('hand_left');
    // Velocity should be non-zero in X direction
    expect(body.velocity[0]).not.toBe(0);
    expect(body.velocity[1]).toBe(0);
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
          left: mockHand([0, 0, 0 ]),
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
          right: mockHand([0, 0, 0 ]),
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
          left: mockHand([0, 0, 0 ]),
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
          left: mockHand([0, 0, 0 ]),
          right: null,
        },
      },
      0.016
    );

    expect(bridge.getHandBodyId('left')).toBe('hand_left');
    expect(bridge.getHandBodyId('right')).toBeNull();
  });
});
