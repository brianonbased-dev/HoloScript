/**
 * HoloScriptPlus Type Tests
 *
 * Structural conformance tests for the exported types in HoloScriptPlus.ts.
 * Because the module is pure type declarations, tests focus on:
 *   - Valid object construction satisfying each interface
 *   - Optional-field defaults (undefined is accepted)
 *   - Tuple lengths for Vector3 / Quaternion
 *   - HSPlusType exhaustive union
 *   - Discriminated-union / sub-type hierarchy relationships
 */

import { describe, it, expect } from 'vitest';
import type {
  Vector3,
  Color,
  Transform,
  Quaternion,
  VRHand,
  HSPlusRuntime,
  HSPlusBuiltins,
  HSPlusNode,
  HSPlusAST,
  HSPlusType,
  HSPlusStatement,
  HSPlusExpression,
  StateDeclaration,
  ReactiveState,
  ThrowVelocity,
  CollisionEvent,
  BaseTrait,
  GrabbableTrait,
  ThrowableTrait,
  ElasticityTrait,
  BounceTrait,
  StretchableTrait,
  MoldableTrait,
  SkeletonTrait,
  ProactiveTrait,
  ZKPrivateTrait,
  Web3Trait,
  TokenGatedTrait,
  MintableTrait,
  WindTrait,
  PatrolTrait,
  LifecycleHook,
  CoPresenceLifecycleHook,
  AllLifecycleHooks,
} from '../HoloScriptPlus';

// ============================================================================
// Vector3
// ============================================================================

describe('Vector3', () => {
  it('accepts a 3-element number tuple', () => {
    const v: Vector3 = [1, 2, 3];
    expect(v).toHaveLength(3);
    expect(v[0]).toBe(1);
    expect(v[1]).toBe(2);
    expect(v[2]).toBe(3);
  });

  it('accepts negative and float values', () => {
    const v: Vector3 = [-0.5, 0.0, 1e3];
    expect(v[0]).toBe(-0.5);
    expect(v[2]).toBe(1000);
  });
});

// ============================================================================
// Color
// ============================================================================

describe('Color', () => {
  it('accepts r/g/b without alpha', () => {
    const c: Color = { r: 255, g: 128, b: 0 };
    expect(c.a).toBeUndefined();
  });

  it('accepts optional alpha', () => {
    const c: Color = { r: 1, g: 0, b: 0, a: 0.5 };
    expect(c.a).toBe(0.5);
  });
});

// ============================================================================
// Transform
// ============================================================================

describe('Transform', () => {
  it('requires position, rotation, scale as Vector3', () => {
    const t: Transform = {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
    expect(t.position).toEqual([0, 0, 0]);
    expect(t.scale).toEqual([1, 1, 1]);
  });
});

// ============================================================================
// Quaternion
// ============================================================================

describe('Quaternion', () => {
  it('accepts a 4-element tuple', () => {
    const q: Quaternion = [0, 0, 0, 1];
    expect(q).toHaveLength(4);
    expect(q[3]).toBe(1);
  });
});

// ============================================================================
// VRHand
// ============================================================================

describe('VRHand', () => {
  it('accepts a minimal required hand state', () => {
    const hand: VRHand = {
      id: 'left',
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      grip: 0,
      trigger: 0,
    };
    expect(hand.id).toBe('left');
    expect(hand.pinch).toBeUndefined();
    expect(hand.pointing).toBeUndefined();
  });

  it('accepts all optional fields', () => {
    const hand: VRHand = {
      id: 'right',
      position: [0.1, 1.2, -0.3],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      pinch: 0.8,
      pinchStrength: 0.8,
      grip: 0.5,
      gripStrength: 0.5,
      trigger: 0.9,
      pointing: true,
    };
    expect(hand.pinchStrength).toBe(0.8);
    expect(hand.gripStrength).toBe(0.5);
  });
});

// ============================================================================
// HSPlusType union
// ============================================================================

describe('HSPlusType', () => {
  it('covers all known primitive type strings', () => {
    const types: HSPlusType[] = [
      'float',
      'int',
      'bool',
      'string',
      'vec2',
      'vec3',
      'vec4',
      'color',
      'unknown',
    ];
    expect(types).toHaveLength(9);
    types.forEach((t) => expect(typeof t).toBe('string'));
  });

  it('maps correctly to string at runtime', () => {
    const t: HSPlusType = 'vec3';
    expect(t).toBe('vec3');
  });
});

// ============================================================================
// HSPlusNode / HSPlusAST
// ============================================================================

describe('HSPlusNode', () => {
  it('satisfies a minimal AST node (type only)', () => {
    const node: HSPlusNode = { type: 'Object' };
    expect(node.type).toBe('Object');
    expect(node.children).toBeUndefined();
  });

  it('accepts optional stateBlock', () => {
    const node: HSPlusNode = {
      type: 'Object',
      stateBlock: { count: 0, label: 'hello' },
    };
    expect(node.stateBlock?.['count']).toBe(0);
  });

  it('accepts migrations array', () => {
    const node: HSPlusNode = {
      type: 'Object',
      migrations: [{ type: 'rename', fromVersion: 1, body: 'old' }],
    };
    expect(node.migrations).toHaveLength(1);
  });
});

describe('HSPlusAST', () => {
  it('requires type Program, body array, and root node', () => {
    const root: HSPlusNode = { type: 'Root' };
    const ast: HSPlusAST = { type: 'Program', body: [root], root };
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(1);
    expect(ast.root).toBe(root);
  });

  it('accepts optional imports', () => {
    const root: HSPlusNode = { type: 'Root' };
    const ast: HSPlusAST = {
      type: 'Program',
      body: [],
      root,
      imports: [{ source: '@holoscript/core', specifiers: ['Transform'] }],
    };
    expect(ast.imports).toHaveLength(1);
    expect(ast.imports?.[0].source).toBe('@holoscript/core');
  });
});

// HSPlusStatement and HSPlusExpression are type aliases for HSPlusNode —
// verify they are structurally identical at runtime.
describe('HSPlusStatement / HSPlusExpression (type aliases)', () => {
  it('behaves identically to HSPlusNode at runtime', () => {
    const stmt: HSPlusStatement = { type: 'ExpressionStatement' };
    const expr: HSPlusExpression = { type: 'BinaryExpression' };
    expect(stmt.type).toBe('ExpressionStatement');
    expect(expr.type).toBe('BinaryExpression');
  });
});

// ============================================================================
// StateDeclaration
// ============================================================================

describe('StateDeclaration', () => {
  it('accepts name and type with no optional fields', () => {
    const sd: StateDeclaration = { name: 'counter', type: 'int' };
    expect(sd.reactive).toBeUndefined();
    expect(sd.initial).toBeUndefined();
  });

  it('accepts reactive flag and initial value', () => {
    const sd: StateDeclaration = { name: 'active', type: 'bool', initial: false, reactive: true };
    expect(sd.reactive).toBe(true);
    expect(sd.initial).toBe(false);
  });
});

// ============================================================================
// ReactiveState (structural duck-type test via mock)
// ============================================================================

describe('ReactiveState', () => {
  it('a mock object satisfies the interface', () => {
    type S = { count: number };
    let store: S = { count: 0 };
    const rs: ReactiveState<S> = {
      get: (k) => store[k],
      set: (k, v) => {
        store = { ...store, [k]: v };
      },
      subscribe: (_cb) => () => undefined,
      update: (updates) => {
        store = { ...store, ...updates };
      },
      getSnapshot: () => ({ ...store }),
    };

    rs.set('count', 42);
    expect(rs.get('count')).toBe(42);
    expect(rs.getSnapshot().count).toBe(42);

    rs.update({ count: 10 });
    expect(rs.get('count')).toBe(10);
  });
});

// ============================================================================
// ThrowVelocity
// ============================================================================

describe('ThrowVelocity', () => {
  it('accepts linear and angular Vector3', () => {
    const tv: ThrowVelocity = { linear: [1, 2, 3], angular: [0, 1, 0] };
    expect(tv.linear[0]).toBe(1);
    expect(tv.angular[1]).toBe(1);
  });
});

// ============================================================================
// CollisionEvent
// ============================================================================

describe('CollisionEvent', () => {
  it('requires nodeId, otherId, relativeVelocity', () => {
    const ce: CollisionEvent = {
      nodeId: 'obj-a',
      otherId: 'obj-b',
      relativeVelocity: [0, -9.8, 0],
    };
    expect(ce.contactPoint).toBeUndefined();
    expect(ce.force).toBeUndefined();
  });

  it('accepts all optional fields', () => {
    const ce: CollisionEvent = {
      nodeId: 'a',
      otherId: 'b',
      relativeVelocity: [0, 0, 0],
      contactPoint: [1, 0, 0],
      point: [1, 0, 0],
      normal: [0, 1, 0],
      target: 'ground',
      force: 50,
    };
    expect(ce.force).toBe(50);
  });
});

// ============================================================================
// Trait interfaces — BaseTrait extends chain
// ============================================================================

describe('BaseTrait', () => {
  it('enabled is optional', () => {
    const t: BaseTrait = {};
    expect(t.enabled).toBeUndefined();

    const t2: BaseTrait = { enabled: false };
    expect(t2.enabled).toBe(false);
  });
});

describe('GrabbableTrait', () => {
  it('satisfies with only BaseTrait fields', () => {
    const g: GrabbableTrait = { enabled: true };
    expect(g.snap_to_hand).toBeUndefined();
  });

  it('accepts all optional grab fields', () => {
    const g: GrabbableTrait = {
      enabled: true,
      snap_to_hand: true,
      two_handed: false,
      haptic_on_grab: 0.5,
      grab_points: [[0, 0, 0]],
      preserve_rotation: true,
      distance_grab: true,
      max_grab_distance: 2.0,
    };
    expect(g.max_grab_distance).toBe(2.0);
    expect(g.grab_points).toHaveLength(1);
  });
});

describe('ThrowableTrait', () => {
  it('optional velocity_multiplier and physics flags', () => {
    const t: ThrowableTrait = {
      velocity_multiplier: 1.5,
      gravity: true,
      bounce: true,
      bounce_factor: 0.8,
    };
    expect(t.bounce_factor).toBe(0.8);
  });
});

describe('ElasticityTrait', () => {
  it('supports coefficient, restitution, and factor', () => {
    const e: ElasticityTrait = { coefficient: 0.7, restitution: 0.3, factor: 1.0 };
    expect(e.coefficient).toBe(0.7);
  });
});

describe('BounceTrait', () => {
  it('supports mode, bounce_factor, and factor', () => {
    const b: BounceTrait = { mode: true, bounce: true, bounce_factor: 0.5, factor: 0.5 };
    expect(b.mode).toBe(true);
  });
});

describe('StretchableTrait', () => {
  it('accepts min/max stretch', () => {
    const s: StretchableTrait = { minStretch: 0.1, maxStretch: 3.0 };
    expect(s.maxStretch).toBe(3.0);
  });
});

describe('MoldableTrait', () => {
  it('accepts moldResolution', () => {
    const m: MoldableTrait = { moldResolution: 128 };
    expect(m.moldResolution).toBe(128);
  });
});

describe('SkeletonTrait', () => {
  it('accepts bones array', () => {
    const s: SkeletonTrait = { bones: ['spine', 'neck', 'head'] };
    expect(s.bones).toHaveLength(3);
  });
});

// ============================================================================
// ProactiveTrait — intelligence tier enum
// ============================================================================

describe('ProactiveTrait', () => {
  it('accepts all intelligence_tier values', () => {
    const tiers: Array<ProactiveTrait['intelligence_tier']> = ['basic', 'advanced', 'quantum'];
    tiers.forEach((tier) => {
      const t: ProactiveTrait = { intelligence_tier: tier };
      expect(t.intelligence_tier).toBe(tier);
    });
  });

  it('allows observation_range and learning_rate', () => {
    const t: ProactiveTrait = {
      intelligence_tier: 'advanced',
      observation_range: 10,
      learning_rate: 0.01,
      auto_suggest: true,
      context_window: 512,
    };
    expect(t.learning_rate).toBe(0.01);
  });
});

// ============================================================================
// WindTrait
// ============================================================================

describe('WindTrait', () => {
  it('accepts direction and strength', () => {
    const w: WindTrait = { direction: [0, 1, 0], strength: 5.0 };
    expect(w.direction?.[1]).toBe(1);
  });
});

// ============================================================================
// PatrolTrait — Vector3[] waypoints
// ============================================================================

describe('PatrolTrait', () => {
  it('accepts an array of waypoints', () => {
    const p: PatrolTrait = {
      waypoints: [
        [0, 0, 0],
        [5, 0, 0],
        [5, 0, 5],
      ],
    };
    expect(p.waypoints).toHaveLength(3);
  });
});

// ============================================================================
// ZKPrivateTrait — complex optional config
// ============================================================================

describe('ZKPrivateTrait', () => {
  it('accepts all predicate values', () => {
    const predicates: Array<ZKPrivateTrait['predicate']> = [
      'proximity',
      'in_region',
      'has_attribute',
      'is_inside_zone',
      'owns_asset',
      'has_permission',
    ];
    predicates.forEach((pred) => {
      const t: ZKPrivateTrait = { predicate: pred };
      expect(t.predicate).toBe(pred);
    });
  });

  it('accepts wallet_integration with chain options', () => {
    const t: ZKPrivateTrait = {
      predicate: 'owns_asset',
      backend: 'barretenberg',
      wallet_integration: {
        enabled: true,
        chain: 'base',
        verifier_contract: '0xabc',
        auto_submit: true,
      },
    };
    expect(t.wallet_integration?.chain).toBe('base');
  });

  it('accepts fallback options', () => {
    const fallbacks: Array<ZKPrivateTrait['fallback']> = ['hidden', 'transparent', 'dummy_model'];
    fallbacks.forEach((f) => {
      const t: ZKPrivateTrait = { fallback: f };
      expect(t.fallback).toBe(f);
    });
  });
});

// ============================================================================
// Web3Trait / TokenGatedTrait / MintableTrait (required fields)
// ============================================================================

describe('Web3Trait', () => {
  it('requires contractAddress, tokenId, chainId, tokenType', () => {
    const t: Web3Trait = {
      contractAddress: '0xABC',
      tokenId: '1',
      chainId: 8453,
      tokenType: 'ERC721',
    };
    expect(t.chainId).toBe(8453);
    expect(t.tokenType).toBe('ERC721');
  });

  it('accepts ERC1155 tokenType', () => {
    const t: Web3Trait = {
      contractAddress: '0xDEF',
      tokenId: '42',
      chainId: 1,
      tokenType: 'ERC1155',
    };
    expect(t.tokenType).toBe('ERC1155');
  });
});

describe('MintableTrait', () => {
  it('accepts platform variants', () => {
    const platforms: Array<MintableTrait['platform']> = ['zora', 'manifold', 'custom'];
    platforms.forEach((p) => {
      const t: MintableTrait = { platform: p };
      expect(t.platform).toBe(p);
    });
  });
});

// ============================================================================
// Lifecycle Hooks
// ============================================================================

describe('LifecycleHook', () => {
  it('accepts all optional hooks', () => {
    const hook: LifecycleHook = {
      onMount: () => undefined,
      onUnmount: () => undefined,
      onUpdate: (_delta) => undefined,
    };
    expect(typeof hook.onMount).toBe('function');
    expect(typeof hook.onUpdate).toBe('function');
  });

  it('is fully optional (empty object is valid)', () => {
    const hook: LifecycleHook = {};
    expect(hook.onMount).toBeUndefined();
  });
});

describe('CoPresenceLifecycleHook', () => {
  it('extends LifecycleHook with onUserJoin/onUserLeave', () => {
    const hook: CoPresenceLifecycleHook = {
      onUserJoin: (id) => {
        expect(typeof id).toBe('string');
      },
      onUserLeave: (id) => {
        expect(typeof id).toBe('string');
      },
    };
    hook.onUserJoin?.('user-1');
    hook.onUserLeave?.('user-1');
  });
});

// ============================================================================
// HSPlusRuntime — mock satisfying the interface
// ============================================================================

describe('HSPlusRuntime', () => {
  it('a mock object satisfies the interface', () => {
    const events = new Map<string, Array<(p: unknown) => void>>();
    const hologramStates = new Map<string, unknown>();
    let state: Record<string, unknown> = {};

    const runtime: HSPlusRuntime = {
      mount: (_container) => undefined,
      unmount: () => undefined,
      update: (_delta) => undefined,
      on: (event, handler) => {
        const handlers = events.get(event) ?? [];
        handlers.push(handler);
        events.set(event, handlers);
        return () => undefined;
      },
      emit: (event, payload) => {
        events.get(event)?.forEach((h) => h(payload));
      },
      getHologramStates: () => hologramStates,
      setState: (updates) => {
        state = { ...state, ...updates };
      },
      getState: () => state,
    };

    runtime.setState({ x: 1 });
    expect(runtime.getState()['x']).toBe(1);

    let received: unknown;
    runtime.on('tick', (p) => {
      received = p;
    });
    runtime.emit('tick', 42);
    expect(received).toBe(42);
  });
});
