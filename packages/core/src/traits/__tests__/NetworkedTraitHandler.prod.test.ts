/**
 * NetworkedTraitHandler Production Tests
 *
 * TraitHandler wrapper that bridges NetworkedTrait into VRTraitRegistry lifecycle.
 * Tests: defaultConfig, onAttach, onDetach, onUpdate, onEvent.
 */

import { describe, it, expect, vi } from 'vitest';

// Static import of mock — vi.mock is hoisted so NetworkedTrait is the mock constructor
vi.mock('../NetworkedTrait', () => {
  // Regular function (not arrow) so it can be used as a constructor with `new`
  function makeDefaultInstance() {
    return {
      getEntityId: vi.fn().mockReturnValue('entity_default'),
      isLocalOwner: vi.fn().mockReturnValue(true),
      setProperty: vi.fn(),
      syncToNetwork: vi.fn(),
      disconnect: vi.fn(),
      requestOwnership: vi.fn().mockResolvedValue(true),
      setOwner: vi.fn(),
      getInterpolatedState: vi.fn().mockReturnValue(null),
      applyState: vi.fn(),
    };
  }
  const NetworkedTrait = vi.fn().mockImplementation(makeDefaultInstance);
  return { NetworkedTrait };
});

import { networkedHandler } from '../NetworkedTraitHandler';
import { NetworkedTrait } from '../NetworkedTrait';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Unique node each time to avoid handler-state collisions between tests */
let nodeCounter = 0;
function makeNode(overrides: Record<string, unknown> = {}): any {
  return {
    id: `node_test_${++nodeCounter}`,
    properties: { position: [1, 2, 3], rotation: [0, 0, 0] },
    ...overrides,
  };
}

function makeCtx() {
  const state: Record<string, unknown> = {};
  return {
    emit: vi.fn(),
    setState: vi.fn((patch: Record<string, unknown>) => Object.assign(state, patch)),
    getState: vi.fn(() => state),
  };
}

function makeConfig(overrides: Partial<typeof networkedHandler.defaultConfig> = {}) {
  return { ...networkedHandler.defaultConfig, ...overrides };
}

/**
 * Register a specific mock instance that will be returned by the next `new NetworkedTrait(...)`.
 * Call this BEFORE calling doAttach().
 */
function nextInstance(
  overrides: {
    isLocalOwner?: boolean;
    getEntityId?: string;
    interpolatedState?: null | {
      position: number[];
      rotation: number[];
      properties: Record<string, unknown>;
    };
  } = {}
) {
  const inst = {
    getEntityId: vi.fn().mockReturnValue(overrides.getEntityId ?? 'entity_mock'),
    isLocalOwner: vi.fn().mockReturnValue(overrides.isLocalOwner ?? true),
    setProperty: vi.fn(),
    syncToNetwork: vi.fn(),
    disconnect: vi.fn(),
    requestOwnership: vi.fn().mockResolvedValue(true),
    setOwner: vi.fn(),
    getInterpolatedState: vi.fn().mockReturnValue(overrides.interpolatedState ?? null),
    applyState: vi.fn(),
  };
  // Regular function (not arrow) so it can be called with `new` by the handler
  (NetworkedTrait as any).mockImplementationOnce(function () {
    return inst;
  });
  return inst;
}

function doAttach(node: any, cfgOverrides: Partial<typeof networkedHandler.defaultConfig> = {}) {
  const ctx = makeCtx();
  const cfg = makeConfig(cfgOverrides);
  networkedHandler.onAttach!(node, cfg, ctx as any);
  return { ctx, cfg };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NetworkedTraitHandler — Production', () => {
  // ─── defaultConfig ───────────────────────────────────────────────────

  it('has name networked', () => {
    expect(networkedHandler.name).toBe('networked');
  });

  it('defaultConfig mode is owner', () => {
    expect(networkedHandler.defaultConfig.mode).toBe('owner');
  });

  it('defaultConfig syncProperties includes position and rotation', () => {
    expect(networkedHandler.defaultConfig.syncProperties).toContain('position');
    expect(networkedHandler.defaultConfig.syncProperties).toContain('rotation');
  });

  it('defaultConfig syncRate is 20', () => {
    expect(networkedHandler.defaultConfig.syncRate).toBe(20);
  });

  it('defaultConfig interpolation is true', () => {
    expect(networkedHandler.defaultConfig.interpolation).toBe(true);
  });

  it('defaultConfig room is default', () => {
    expect(networkedHandler.defaultConfig.room).toBe('default');
  });

  // ─── onAttach ────────────────────────────────────────────────────────

  it('emits networked:register with nodeId and entityId', () => {
    const inst = nextInstance({ getEntityId: 'entity_reg' });
    const node = makeNode({ id: 'node_reg' });
    const { ctx } = doAttach(node);
    expect(ctx.emit).toHaveBeenCalledWith(
      'networked:register',
      expect.objectContaining({
        nodeId: 'node_reg',
        entityId: 'entity_reg',
      })
    );
    void inst; // used by mock
  });

  it('emits networked:register config with mode and syncRate', () => {
    nextInstance();
    const node = makeNode();
    const { ctx } = doAttach(node, { mode: 'shared', syncRate: 10 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'networked:register',
      expect.objectContaining({
        config: expect.objectContaining({ mode: 'shared', syncRate: 10 }),
      })
    );
  });

  it('calls setState with __networked=true and __networkMode and __networkId', () => {
    nextInstance({ getEntityId: 'entity_setstate' });
    const node = makeNode();
    const { ctx } = doAttach(node);
    expect(ctx.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        __networked: true,
        __networkMode: 'owner',
        __networkId: 'entity_setstate',
      })
    );
  });

  it('attach without node.id (uses anon key, no crash)', () => {
    nextInstance();
    const node = makeNode({ id: undefined });
    expect(() => doAttach(node)).not.toThrow();
  });

  // ─── onDetach ────────────────────────────────────────────────────────

  it('emits networked:unregister on detach', () => {
    nextInstance({ getEntityId: 'entity_det' });
    const node = makeNode({ id: 'node_det' });
    const { ctx, cfg } = doAttach(node);
    ctx.emit.mockClear();
    networkedHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'networked:unregister',
      expect.objectContaining({
        nodeId: 'node_det',
        entityId: 'entity_det',
      })
    );
  });

  it('clears __networked setState on detach', () => {
    nextInstance();
    const node = makeNode();
    const { ctx, cfg } = doAttach(node);
    ctx.setState.mockClear();
    networkedHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        __networked: false,
        __networkId: null,
      })
    );
  });

  it('double-detach (no prior attach) does not throw', () => {
    const node = makeNode({ id: 'node_never' });
    const ctx = makeCtx();
    expect(() => networkedHandler.onDetach!(node, makeConfig(), ctx as any)).not.toThrow();
  });

  // ─── onUpdate — local owner ───────────────────────────────────────────

  it('onUpdate as owner: setProperty called with position array', () => {
    const inst = nextInstance({ isLocalOwner: true });
    const node = makeNode({ properties: { position: [1, 2, 3], rotation: [0, 0, 0] } });
    const { ctx, cfg } = doAttach(node);
    networkedHandler.onUpdate!(node, cfg, ctx as any, 16);
    expect(inst.setProperty).toHaveBeenCalledWith('position', [1, 2, 3]);
    expect(inst.setProperty).toHaveBeenCalledWith('rotation', [0, 0, 0]);
  });

  it('onUpdate as owner: calls syncToNetwork', () => {
    const inst = nextInstance({ isLocalOwner: true });
    const node = makeNode();
    const { ctx, cfg } = doAttach(node);
    networkedHandler.onUpdate!(node, cfg, ctx as any, 16);
    expect(inst.syncToNetwork).toHaveBeenCalled();
  });

  it('onUpdate as remote: applies interpolatedState to node.properties', () => {
    const inst = nextInstance({
      isLocalOwner: false,
      interpolatedState: {
        position: [5, 6, 7],
        rotation: [0.1, 0.2, 0.3],
        properties: { health: 80 },
      },
    });
    const node = makeNode();
    const { ctx, cfg } = doAttach(node);
    networkedHandler.onUpdate!(node, cfg, ctx as any, 16);
    expect(node.properties.position).toEqual([5, 6, 7]);
    expect(inst.getInterpolatedState).toHaveBeenCalled();
  });

  it('handles object-style position {x,y,z} in node.properties', () => {
    const inst = nextInstance({ isLocalOwner: true });
    const node = makeNode({ properties: { position: [3, 4, 5], rotation: [0, 0, 0] } });
    const { ctx, cfg } = doAttach(node);
    networkedHandler.onUpdate!(node, cfg, ctx as any, 16);
    expect(inst.setProperty).toHaveBeenCalledWith('position', [3, 4, 5]);
  });

  it('handles missing position (defaults to [0,0,0])', () => {
    const inst = nextInstance({ isLocalOwner: true });
    const node = makeNode({ properties: {} });
    const { ctx, cfg } = doAttach(node);
    networkedHandler.onUpdate!(node, cfg, ctx as any, 16);
    expect(inst.setProperty).toHaveBeenCalledWith('position', [0, 0, 0]);
  });

  // ─── onEvent — grab_start ─────────────────────────────────────────────

  it('grab_start in shared mode calls requestOwnership', () => {
    const inst = nextInstance({ isLocalOwner: true });
    const node = makeNode();
    const { ctx, cfg } = doAttach(node, { mode: 'shared', auto_claim_on_interact: true });
    networkedHandler.onEvent!(node, cfg, ctx as any, { type: 'grab_start' });
    expect(inst.requestOwnership).toHaveBeenCalled();
  });

  it('grab_start with auto_claim_on_interact=false skips requestOwnership', () => {
    const inst = nextInstance({ isLocalOwner: true });
    const node = makeNode();
    const { ctx, cfg } = doAttach(node, { mode: 'shared', auto_claim_on_interact: false });
    networkedHandler.onEvent!(node, cfg, ctx as any, { type: 'grab_start' });
    expect(inst.requestOwnership).not.toHaveBeenCalled();
  });

  // ─── onEvent — grab_end ───────────────────────────────────────────────

  it('grab_end calls syncToNetwork for final position update', () => {
    const inst = nextInstance({ isLocalOwner: true });
    const node = makeNode();
    const { ctx, cfg } = doAttach(node);
    networkedHandler.onEvent!(node, cfg, ctx as any, { type: 'grab_end' });
    expect(inst.syncToNetwork).toHaveBeenCalled();
  });

  // ─── onEvent — networked:remote_state ────────────────────────────────

  it('networked:remote_state calls applyState when not local owner', () => {
    const inst = nextInstance({ isLocalOwner: false });
    const node = makeNode();
    const { ctx, cfg } = doAttach(node);
    networkedHandler.onEvent!(node, cfg, ctx as any, {
      type: 'networked:remote_state',
      data: { position: [1, 1, 1] },
    });
    expect(inst.applyState).toHaveBeenCalled();
  });

  // ─── onEvent — authority ─────────────────────────────────────────────

  it('networked:authority_granted calls setOwner(true, peerId)', () => {
    const inst = nextInstance();
    const node = makeNode();
    const { ctx, cfg } = doAttach(node);
    networkedHandler.onEvent!(node, cfg, ctx as any, {
      type: 'networked:authority_granted',
      peerId: 'peer_bob',
    });
    expect(inst.setOwner).toHaveBeenCalledWith(true, 'peer_bob');
  });

  it('networked:authority_revoked calls setOwner(false, peerId)', () => {
    const inst = nextInstance();
    const node = makeNode();
    const { ctx, cfg } = doAttach(node);
    networkedHandler.onEvent!(node, cfg, ctx as any, {
      type: 'networked:authority_revoked',
      peerId: 'peer_carol',
    });
    expect(inst.setOwner).toHaveBeenCalledWith(false, 'peer_carol');
  });

  it('unknown event type does not throw', () => {
    nextInstance();
    const node = makeNode();
    const { ctx, cfg } = doAttach(node);
    expect(() =>
      networkedHandler.onEvent!(node, cfg, ctx as any, { type: 'mystery' })
    ).not.toThrow();
  });
});
