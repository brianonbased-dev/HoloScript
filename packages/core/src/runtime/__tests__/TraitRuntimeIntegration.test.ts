import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Hoisted mocks (vi.mock factories are hoisted above all declarations) ---
const { mockAttachTrait, mockDetachTrait, mockUpdateAllTraits, mockHandleEventForAllTraits } =
  vi.hoisted(() => ({
    mockAttachTrait: vi.fn(),
    mockDetachTrait: vi.fn(),
    mockUpdateAllTraits: vi.fn(),
    mockHandleEventForAllTraits: vi.fn(),
  }));

// Mock VRTraitRegistry to avoid importing all 120+ trait handler modules
vi.mock('../../traits/VRTraitSystem', () => ({
  VRTraitRegistry: vi.fn().mockImplementation(function (this: any) {
    this.attachTrait = mockAttachTrait;
    this.detachTrait = mockDetachTrait;
    this.updateAllTraits = mockUpdateAllTraits;
    this.handleEventForAllTraits = mockHandleEventForAllTraits;
    return this;
  }),
}));

import { TraitRuntimeIntegration, createTraitRuntime } from '../TraitRuntimeIntegration';
import type { TraitContextFactory } from '../TraitContextFactory';
import type { TraitContext, TraitEvent } from '../../traits/TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// =============================================================================
// Helpers
// =============================================================================

function makeMockContextFactory(): TraitContextFactory {
  const mockContext: TraitContext = {
    vr: {
      hands: { left: null, right: null },
      headset: { position: { x: 0, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      getPointerRay: vi.fn().mockReturnValue(null),
      getDominantHand: vi.fn().mockReturnValue(null),
    },
    physics: {
      applyVelocity: vi.fn(),
      applyAngularVelocity: vi.fn(),
      setKinematic: vi.fn(),
      raycast: vi.fn().mockReturnValue(null),
      getBodyPosition: vi.fn().mockReturnValue(null),
      getBodyVelocity: vi.fn().mockReturnValue(null),
    },
    audio: {
      playSound: vi.fn(),
      updateSpatialSource: vi.fn(),
      registerAmbisonicSource: vi.fn(),
      setAudioPortal: vi.fn(),
      updateAudioMaterial: vi.fn(),
    },
    haptics: {
      pulse: vi.fn(),
      rumble: vi.fn(),
    },
    emit: vi.fn(),
    getState: vi.fn().mockReturnValue({}),
    setState: vi.fn(),
    getScaleMultiplier: vi.fn().mockReturnValue(1),
    setScaleContext: vi.fn(),
  };

  return {
    createContext: vi.fn().mockReturnValue(mockContext),
    dispose: vi.fn(),
  } as unknown as TraitContextFactory;
}

function makeNode(id: string, traitEntries?: [string, unknown][]): HSPlusNode {
  const node: HSPlusNode = { type: 'node', id } as any;
  if (traitEntries && traitEntries.length > 0) {
    node.traits = new Map(traitEntries as [any, any]);
  }
  return node;
}

// =============================================================================
// Tests
// =============================================================================

describe('TraitRuntimeIntegration', () => {
  let factory: TraitContextFactory;
  let runtime: TraitRuntimeIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    factory = makeMockContextFactory();
    runtime = new TraitRuntimeIntegration(factory);
  });

  // ---- Construction -------------------------------------------------------

  describe('construction', () => {
    it('creates an integration via constructor', () => {
      expect(runtime).toBeInstanceOf(TraitRuntimeIntegration);
    });

    it('creates via factory function', () => {
      const rt = createTraitRuntime(factory);
      expect(rt).toBeInstanceOf(TraitRuntimeIntegration);
    });

    it('calls createContext on the factory during construction', () => {
      expect(factory.createContext).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Node registration --------------------------------------------------

  describe('registerNode', () => {
    it('registers a node with traits and calls attachTrait for each', () => {
      const node = makeNode('dragon', [
        ['grabbable', { mass: 5 }],
        ['throwable', {}],
      ]);
      runtime.registerNode(node);

      expect(mockAttachTrait).toHaveBeenCalledTimes(2);
      expect(mockAttachTrait).toHaveBeenCalledWith(
        node,
        'grabbable',
        { mass: 5 },
        expect.anything()
      );
      expect(mockAttachTrait).toHaveBeenCalledWith(node, 'throwable', {}, expect.anything());
    });

    it('assigns a generated id when node.id is missing', () => {
      const node = makeNode('', [['hoverable', {}]]);
      node.id = undefined as any;
      runtime.registerNode(node);

      expect(node.id).toMatch(/^node_\d+$/);
      expect(runtime.getNode(node.id!)).toBe(node);
    });

    it('registers a node with no traits (empty traits map)', () => {
      const node = makeNode('empty-node');
      runtime.registerNode(node);
      expect(mockAttachTrait).not.toHaveBeenCalled();
      expect(runtime.getNode('empty-node')).toBe(node);
    });

    it('tracks all trait names on the node', () => {
      const node = makeNode('box', [
        ['scalable', {}],
        ['rotatable', {}],
      ]);
      runtime.registerNode(node);
      expect(runtime.getNodeTraits('box')).toEqual(['scalable', 'rotatable']);
    });
  });

  // ---- attachTraitsFromAST ------------------------------------------------

  describe('attachTraitsFromAST', () => {
    it('walks a flat list and registers nodes with traits', () => {
      const nodes = [
        makeNode('a', [['grabbable', {}]]),
        makeNode('b'), // no traits - should be skipped
        makeNode('c', [['pointable', {}]]),
      ];

      runtime.attachTraitsFromAST(nodes);

      expect(runtime.getNode('a')).toBeDefined();
      expect(runtime.getNode('b')).toBeUndefined(); // skipped (no traits)
      expect(runtime.getNode('c')).toBeDefined();
    });

    it('recursively walks children', () => {
      const child = makeNode('child', [['hoverable', {}]]);
      const parent = makeNode('parent', [['grabbable', {}]]);
      (parent as any).children = [child];

      runtime.attachTraitsFromAST([parent]);

      expect(runtime.getNode('parent')).toBeDefined();
      expect(runtime.getNode('child')).toBeDefined();
      expect(mockAttachTrait).toHaveBeenCalledTimes(2);
    });
  });

  // ---- Dynamic trait attach / detach --------------------------------------

  describe('attachTrait / detachTrait', () => {
    it('dynamically attaches a trait to a registered node', () => {
      const node = makeNode('obj', [['grabbable', {}]]);
      runtime.registerNode(node);
      mockAttachTrait.mockClear();

      runtime.attachTrait('obj', 'throwable' as any, { force: 10 });

      expect(mockAttachTrait).toHaveBeenCalledWith(
        node,
        'throwable',
        { force: 10 },
        expect.anything()
      );
      expect(runtime.getNodeTraits('obj')).toContain('throwable');
    });

    it('does not duplicate trait name if already attached', () => {
      const node = makeNode('obj', [['grabbable', {}]]);
      runtime.registerNode(node);

      runtime.attachTrait('obj', 'grabbable' as any, {});
      const traits = runtime.getNodeTraits('obj');
      expect(traits.filter((t) => t === 'grabbable')).toHaveLength(1);
    });

    it('attachTrait on unknown nodeId is a no-op', () => {
      runtime.attachTrait('does-not-exist', 'grabbable' as any);
      expect(mockAttachTrait).not.toHaveBeenCalled();
    });

    it('detaches a trait from a registered node', () => {
      const node = makeNode('obj', [
        ['grabbable', {}],
        ['throwable', {}],
      ]);
      runtime.registerNode(node);
      mockDetachTrait.mockClear();

      runtime.detachTrait('obj', 'grabbable' as any);

      expect(mockDetachTrait).toHaveBeenCalledWith(node, 'grabbable', expect.anything());
      expect(runtime.getNodeTraits('obj')).not.toContain('grabbable');
      expect(runtime.getNodeTraits('obj')).toContain('throwable');
    });

    it('detachTrait on unknown nodeId is a no-op', () => {
      runtime.detachTrait('nope', 'grabbable' as any);
      expect(mockDetachTrait).not.toHaveBeenCalled();
    });
  });

  // ---- unregisterNode -----------------------------------------------------

  describe('unregisterNode', () => {
    it('detaches all traits and removes the node', () => {
      const node = makeNode('obj', [
        ['grabbable', {}],
        ['throwable', {}],
      ]);
      runtime.registerNode(node);
      mockDetachTrait.mockClear();

      runtime.unregisterNode('obj');

      expect(mockDetachTrait).toHaveBeenCalledTimes(2);
      expect(runtime.getNode('obj')).toBeUndefined();
      expect(runtime.getAllNodeIds()).not.toContain('obj');
    });

    it('unregister unknown node is a no-op', () => {
      expect(() => runtime.unregisterNode('ghost')).not.toThrow();
    });
  });

  // ---- Frame update -------------------------------------------------------

  describe('update (frame loop)', () => {
    it('calls updateAllTraits for each tracked node', () => {
      runtime.registerNode(makeNode('a', [['grabbable', {}]]));
      runtime.registerNode(makeNode('b', [['throwable', {}]]));

      runtime.update(0.016);

      expect(mockUpdateAllTraits).toHaveBeenCalledTimes(2);
      expect(mockUpdateAllTraits).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a' }),
        expect.anything(),
        0.016
      );
    });

    it('does not update when paused', () => {
      runtime.registerNode(makeNode('a', [['grabbable', {}]]));
      runtime.pause();

      runtime.update(0.016);

      expect(mockUpdateAllTraits).not.toHaveBeenCalled();
    });

    it('resumes after pause', () => {
      runtime.registerNode(makeNode('a', [['grabbable', {}]]));
      runtime.pause();
      runtime.resume();

      runtime.update(0.016);

      expect(mockUpdateAllTraits).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Event dispatch -----------------------------------------------------

  describe('event dispatch', () => {
    it('dispatches event to a specific node', () => {
      const node = makeNode('target', [['breakable', {}]]);
      runtime.registerNode(node);

      const event: TraitEvent = { type: 'collision', data: { force: 100 } } as any;
      runtime.dispatchEvent('target', event);

      expect(mockHandleEventForAllTraits).toHaveBeenCalledWith(node, expect.anything(), event);
    });

    it('dispatchEvent to unknown node is a no-op', () => {
      runtime.dispatchEvent('ghost', { type: 'collision' } as any);
      expect(mockHandleEventForAllTraits).not.toHaveBeenCalled();
    });

    it('broadcasts event to ALL tracked nodes', () => {
      runtime.registerNode(makeNode('a', [['grabbable', {}]]));
      runtime.registerNode(makeNode('b', [['throwable', {}]]));

      const event: TraitEvent = { type: 'global_reset' } as any;
      runtime.broadcastEvent(event);

      expect(mockHandleEventForAllTraits).toHaveBeenCalledTimes(2);
    });
  });

  // ---- Pause / Resume -----------------------------------------------------

  describe('pause / resume', () => {
    it('starts unpaused', () => {
      expect(runtime.isPaused()).toBe(false);
    });

    it('pause sets paused state', () => {
      runtime.pause();
      expect(runtime.isPaused()).toBe(true);
    });

    it('resume clears paused state', () => {
      runtime.pause();
      runtime.resume();
      expect(runtime.isPaused()).toBe(false);
    });
  });

  // ---- Refresh context ----------------------------------------------------

  describe('refreshContext', () => {
    it('recreates the TraitContext from the factory', () => {
      expect(factory.createContext).toHaveBeenCalledTimes(1);
      runtime.refreshContext();
      expect(factory.createContext).toHaveBeenCalledTimes(2);
    });
  });

  // ---- Queries ------------------------------------------------------------

  describe('queries', () => {
    it('getAllNodeIds returns all registered node ids', () => {
      runtime.registerNode(makeNode('x', [['grabbable', {}]]));
      runtime.registerNode(makeNode('y', [['throwable', {}]]));

      const ids = runtime.getAllNodeIds();
      expect(ids).toContain('x');
      expect(ids).toContain('y');
      expect(ids).toHaveLength(2);
    });

    it('getNodeTraits returns empty array for unknown node', () => {
      expect(runtime.getNodeTraits('unknown')).toEqual([]);
    });

    it('getStats returns correct counts', () => {
      runtime.registerNode(
        makeNode('a', [
          ['grabbable', {}],
          ['throwable', {}],
        ])
      );
      runtime.registerNode(makeNode('b', [['pointable', {}]]));

      const stats = runtime.getStats();
      expect(stats.trackedNodes).toBe(2);
      expect(stats.totalTraits).toBe(3);
      expect(stats.updatesPerSecond).toBe(0);
      expect(stats.lastUpdateMs).toBe(0);
    });

    it('getRegistry returns the VRTraitRegistry instance', () => {
      const registry = runtime.getRegistry();
      expect(registry).toBeDefined();
      expect(registry.attachTrait).toBe(mockAttachTrait);
    });

    it('getContext returns the TraitContext', () => {
      const ctx = runtime.getContext();
      expect(ctx).toBeDefined();
      expect(ctx.vr).toBeDefined();
      expect(ctx.physics).toBeDefined();
    });
  });

  // ---- Reset / Dispose ----------------------------------------------------

  describe('reset / dispose', () => {
    it('reset unregisters all nodes and clears counters', () => {
      runtime.registerNode(makeNode('a', [['grabbable', {}]]));
      runtime.registerNode(makeNode('b', [['throwable', {}]]));

      runtime.reset();

      expect(runtime.getAllNodeIds()).toHaveLength(0);
      expect(runtime.getStats().trackedNodes).toBe(0);
    });

    it('dispose resets and also disposes the factory', () => {
      runtime.registerNode(makeNode('a', [['grabbable', {}]]));

      runtime.dispose();

      expect(runtime.getAllNodeIds()).toHaveLength(0);
      expect(factory.dispose).toHaveBeenCalled();
    });
  });
});
