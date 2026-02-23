/**
 * SpatialAwarenessTrait — Production Test Suite
 *
 * SpatialAwarenessTrait is a CLASS extending EventEmitter.
 * It depends heavily on SpatialContextProvider, which is mocked here.
 *
 * Strategy:
 * - Mock SpatialContextProvider so all its methods are vi.fn()
 * - Test the trait's own logic: constructor, start/stop, position/velocity,
 *   getContext, getNearbyEntities, getCurrentRegions, isInRegion,
 *   findNearest/findWithin/findVisible, isEntityVisible, getDistanceTo,
 *   registerEntity/unregisterEntity/registerEntities,
 *   registerRegion/unregisterRegion/watchRegion/unwatchRegion,
 *   setPerceptionRadius/getPerceptionRadius/setEntityTypeFilter,
 *   createSpatialAwarenessTrait/createSharedSpatialProvider factories,
 *   dispose, event forwarding via setupEventHandlers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ─── Mock SpatialContextProvider ─────────────────────────────────────────────
// We mock the entire module so the constructor captures a controlled instance

vi.mock('../../spatial/SpatialContextProvider', () => {
  const { EventEmitter } = require('events');
  class MockProvider extends EventEmitter {
    registerAgent = vi.fn();
    unregisterAgent = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    updateAgentPosition = vi.fn();
    getContext = vi.fn(() => null);
    findNearest = vi.fn(() => []);
    findWithin = vi.fn(() => []);
    findVisible = vi.fn(() => []);
    setEntity = vi.fn();
    removeEntity = vi.fn();
    setEntities = vi.fn();
    setRegion = vi.fn();
    removeRegion = vi.fn();
    subscribeToRegion = vi.fn();
    unsubscribeFromRegion = vi.fn();
  }
  return { SpatialContextProvider: MockProvider };
});

import { SpatialAwarenessTrait, createSpatialAwarenessTrait, createSharedSpatialProvider, DEFAULT_TRAIT_CONFIG } from '../SpatialAwarenessTrait';
import { SpatialContextProvider } from '../../spatial/SpatialContextProvider';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTrait(id = 'agent-1', cfg: any = {}) {
  // autoStart=false by default so we don't call start() and can control it
  return new SpatialAwarenessTrait(id, { autoStart: false, ...cfg });
}

function getProvider(trait: SpatialAwarenessTrait): any {
  return (trait as any).provider;
}

// ─── DEFAULT_TRAIT_CONFIG ─────────────────────────────────────────────────────

describe('DEFAULT_TRAIT_CONFIG', () => {
  it('initialPosition = {x:0,y:0,z:0}', () => {
    expect(DEFAULT_TRAIT_CONFIG.initialPosition).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('autoStart=true', () => {
    expect(DEFAULT_TRAIT_CONFIG.autoStart).toBe(true);
  });
});

// ─── constructor ─────────────────────────────────────────────────────────────

describe('SpatialAwarenessTrait constructor', () => {
  it('creates own provider when no sharedProvider', () => {
    const t = makeTrait();
    expect(getProvider(t)).toBeInstanceOf(SpatialContextProvider);
    expect((t as any).ownsProvider).toBe(true);
  });

  it('uses sharedProvider when provided', () => {
    const shared = new SpatialContextProvider();
    const t = makeTrait('x', { sharedProvider: shared });
    expect(getProvider(t)).toBe(shared);
    expect((t as any).ownsProvider).toBe(false);
  });

  it('sets initial position from config', () => {
    const t = makeTrait('x', { initialPosition: { x: 1, y: 2, z: 3 } });
    expect(t.getPosition()).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('isActive=false initially (autoStart=false)', () => {
    const t = makeTrait();
    expect((t as any).isActive).toBe(false);
  });

  it('autoStart=true calls start() immediately', () => {
    // create with autoStart true (default) and spy on registerAgent
    const t = new SpatialAwarenessTrait('auto-agent', { autoStart: true });
    expect(getProvider(t).registerAgent).toHaveBeenCalledWith('auto-agent', expect.any(Object), expect.any(Object));
  });
});

// ─── start / stop ─────────────────────────────────────────────────────────────

describe('SpatialAwarenessTrait start/stop', () => {
  it('start() registers agent and sets isActive=true', () => {
    const t = makeTrait('a1');
    t.start();
    expect(getProvider(t).registerAgent).toHaveBeenCalledWith('a1', expect.any(Object), expect.any(Object));
    expect((t as any).isActive).toBe(true);
  });

  it('start() calls provider.start() when ownsProvider', () => {
    const t = makeTrait('a1');
    t.start();
    expect(getProvider(t).start).toHaveBeenCalled();
  });

  it('start() is idempotent (second call is no-op)', () => {
    const t = makeTrait('a1');
    t.start();
    t.start();
    expect(getProvider(t).registerAgent).toHaveBeenCalledTimes(1);
  });

  it('stop() unregisters agent and sets isActive=false', () => {
    const t = makeTrait('a1');
    t.start();
    t.stop();
    expect(getProvider(t).unregisterAgent).toHaveBeenCalledWith('a1');
    expect((t as any).isActive).toBe(false);
  });

  it('stop() calls provider.stop() when ownsProvider', () => {
    const t = makeTrait('a1');
    t.start();
    t.stop();
    expect(getProvider(t).stop).toHaveBeenCalled();
  });

  it('stop() is idempotent (second call is no-op)', () => {
    const t = makeTrait('a1');
    t.start();
    t.stop();
    t.stop();
    expect(getProvider(t).unregisterAgent).toHaveBeenCalledTimes(1);
  });
});

// ─── dispose ──────────────────────────────────────────────────────────────────

describe('SpatialAwarenessTrait dispose', () => {
  it('stops the trait', () => {
    const t = makeTrait('a1');
    t.start();
    t.dispose();
    expect((t as any).isActive).toBe(false);
  });

  it('removes all EventEmitter listeners', () => {
    const t = makeTrait('a1');
    t.on('entity:entered', vi.fn());
    t.dispose();
    expect(t.listenerCount('entity:entered')).toBe(0);
  });
});

// ─── position & velocity ──────────────────────────────────────────────────────

describe('SpatialAwarenessTrait position & velocity', () => {
  it('getPosition returns copy of position', () => {
    const t = makeTrait('a', { initialPosition: { x: 5, y: 10, z: 15 } });
    const pos = t.getPosition();
    pos.x = 999;
    expect(t.getPosition().x).toBe(5); // copy, not reference
  });

  it('setPosition updates internal position', () => {
    const t = makeTrait('a');
    t.setPosition({ x: 3, y: 4, z: 5 });
    expect(t.getPosition()).toEqual({ x: 3, y: 4, z: 5 });
  });

  it('setPosition calls provider.updateAgentPosition when active', () => {
    const t = makeTrait('a');
    t.start();
    t.setPosition({ x: 1, y: 2, z: 3 });
    expect(getProvider(t).updateAgentPosition).toHaveBeenCalledWith('a', { x: 1, y: 2, z: 3 }, expect.any(Object));
  });

  it('setPosition silent when not active', () => {
    const t = makeTrait('a');
    t.setPosition({ x: 1, y: 2, z: 3 });
    expect(getProvider(t).updateAgentPosition).not.toHaveBeenCalled();
  });

  it('getVelocity returns copy of velocity', () => {
    const t = makeTrait('a');
    const vel = t.getVelocity();
    vel.x = 999;
    expect(t.getVelocity().x).toBe(0);
  });

  it('setVelocity updates internal velocity', () => {
    const t = makeTrait('a');
    t.setVelocity({ x: 0.5, y: 0, z: 1 });
    expect(t.getVelocity()).toEqual({ x: 0.5, y: 0, z: 1 });
  });

  it('move() adds delta to current position', () => {
    const t = makeTrait('a', { initialPosition: { x: 1, y: 2, z: 3 } });
    t.move({ x: 0.5, y: -1, z: 2 });
    expect(t.getPosition()).toEqual({ x: 1.5, y: 1, z: 5 });
  });
});

// ─── context access ───────────────────────────────────────────────────────────

describe('SpatialAwarenessTrait context access', () => {
  it('getNearbyEntities returns [] when no context', () => {
    const t = makeTrait('a');
    expect(t.getNearbyEntities()).toEqual([]);
  });

  it('getNearbyEntities returns entities from lastContext', () => {
    const t = makeTrait('a');
    const entity = { id: 'e1', type: 'npc', position: { x: 0, y: 0, z: 0 } };
    (t as any).lastContext = { nearbyEntities: [entity], currentRegions: [] };
    expect(t.getNearbyEntities()).toContain(entity);
  });

  it('getCurrentRegions returns [] when no context', () => {
    const t = makeTrait('a');
    expect(t.getCurrentRegions()).toEqual([]);
  });

  it('isInRegion returns false when not in region', () => {
    const t = makeTrait('a');
    (t as any).lastContext = { nearbyEntities: [], currentRegions: [{ id: 'r1', name: 'lobby' }] };
    expect(t.isInRegion('r_other')).toBe(false);
  });

  it('isInRegion returns true when in region', () => {
    const t = makeTrait('a');
    (t as any).lastContext = { nearbyEntities: [], currentRegions: [{ id: 'r1', name: 'lobby' }] };
    expect(t.isInRegion('r1')).toBe(true);
  });
});

// ─── queries ──────────────────────────────────────────────────────────────────

describe('SpatialAwarenessTrait queries', () => {
  it('findNearest calls provider.findNearest', () => {
    const t = makeTrait('a');
    t.findNearest(['npc']);
    expect(getProvider(t).findNearest).toHaveBeenCalledWith(t.getPosition(), 1, ['npc']);
  });

  it('findNearest returns null when empty', () => {
    const t = makeTrait('a');
    expect(t.findNearest()).toBeNull();
  });

  it('findWithin calls provider.findWithin with radius', () => {
    const t = makeTrait('a');
    t.findWithin(10, ['enemy']);
    expect(getProvider(t).findWithin).toHaveBeenCalledWith(t.getPosition(), 10, ['enemy']);
  });

  it('findVisible calls provider.findVisible', () => {
    const t = makeTrait('a');
    const dir = { x: 0, y: 0, z: 1 };
    t.findVisible(dir, 60, 20);
    expect(getProvider(t).findVisible).toHaveBeenCalledWith(t.getPosition(), dir, 60, 20);
  });

  it('isEntityVisible returns false by default', () => {
    const t = makeTrait('a');
    expect(t.isEntityVisible('e999')).toBe(false);
  });

  it('getDistanceTo returns null when entity not nearby', () => {
    const t = makeTrait('a');
    (t as any).lastContext = { nearbyEntities: [], currentRegions: [] };
    expect(t.getDistanceTo('ghost')).toBeNull();
  });

  it('getDistanceTo computes 3D euclidean distance', () => {
    const t = makeTrait('a', { initialPosition: { x: 0, y: 0, z: 0 } });
    (t as any).lastContext = {
      nearbyEntities: [{ id: 'e1', type: 'npc', position: { x: 3, y: 4, z: 0 } }],
      currentRegions: [],
    };
    // sqrt(9+16+0) = 5
    expect(t.getDistanceTo('e1')).toBeCloseTo(5, 5);
  });
});

// ─── entity & region management ───────────────────────────────────────────────

describe('SpatialAwarenessTrait entity management', () => {
  it('registerEntity calls provider.setEntity', () => {
    const t = makeTrait('a');
    const entity = { id: 'e1', type: 'bot', position: { x: 0, y: 0, z: 0 } };
    t.registerEntity(entity as any);
    expect(getProvider(t).setEntity).toHaveBeenCalledWith(entity);
  });

  it('unregisterEntity calls provider.removeEntity', () => {
    const t = makeTrait('a');
    t.unregisterEntity('e1');
    expect(getProvider(t).removeEntity).toHaveBeenCalledWith('e1');
  });

  it('registerEntities calls provider.setEntities', () => {
    const t = makeTrait('a');
    const entities = [{ id: 'e1', type: 'npc', position: { x: 0, y: 0, z: 0 } }];
    t.registerEntities(entities as any);
    expect(getProvider(t).setEntities).toHaveBeenCalledWith(entities);
  });
});

describe('SpatialAwarenessTrait region management', () => {
  it('registerRegion calls provider.setRegion', () => {
    const t = makeTrait('a');
    const region = { id: 'r1', name: 'lobby' };
    t.registerRegion(region as any);
    expect(getProvider(t).setRegion).toHaveBeenCalledWith(region);
  });

  it('unregisterRegion calls provider.removeRegion', () => {
    const t = makeTrait('a');
    t.unregisterRegion('r1');
    expect(getProvider(t).removeRegion).toHaveBeenCalledWith('r1');
  });

  it('watchRegion calls provider.subscribeToRegion', () => {
    const t = makeTrait('a');
    const cb = vi.fn();
    t.watchRegion('r1', cb);
    expect(getProvider(t).subscribeToRegion).toHaveBeenCalledWith('a', 'r1', cb);
  });

  it('unwatchRegion calls provider.unsubscribeFromRegion', () => {
    const t = makeTrait('a');
    t.unwatchRegion('r1');
    expect(getProvider(t).unsubscribeFromRegion).toHaveBeenCalledWith('a', 'r1');
  });
});

// ─── configuration ────────────────────────────────────────────────────────────

describe('SpatialAwarenessTrait configuration', () => {
  it('getPerceptionRadius returns config value', () => {
    const t = makeTrait('a', { perceptionRadius: 25 });
    expect(t.getPerceptionRadius()).toBe(25);
  });

  it('setPerceptionRadius updates config', () => {
    const t = makeTrait('a');
    t.setPerceptionRadius(50);
    expect(t.getPerceptionRadius()).toBe(50);
  });

  it('setPerceptionRadius re-registers when active', () => {
    const t = makeTrait('a');
    t.start();
    const before = getProvider(t).registerAgent.mock.calls.length;
    t.setPerceptionRadius(100);
    expect(getProvider(t).unregisterAgent).toHaveBeenCalled();
    expect(getProvider(t).registerAgent.mock.calls.length).toBeGreaterThan(before);
  });

  it('setEntityTypeFilter updates config.entityTypeFilter', () => {
    const t = makeTrait('a');
    t.setEntityTypeFilter(['npc', 'enemy']);
    expect((t as any).config.entityTypeFilter).toEqual(['npc', 'enemy']);
  });
});

// ─── event forwarding ─────────────────────────────────────────────────────────

describe('SpatialAwarenessTrait event forwarding', () => {
  it('forwards entity:entered from provider', () => {
    const t = makeTrait('a');
    const cb = vi.fn();
    t.on('entity:entered', cb);
    const provider = getProvider(t);
    const entity = { id: 'e1', type: 'npc', position: { x: 1, y: 0, z: 0 } };
    provider.emit('entity:entered', 'a', { type: 'entity_entered', entity, distance: 5 });
    expect(cb).toHaveBeenCalledWith(entity, 5);
  });

  it('ignores entity:entered from other agents', () => {
    const t = makeTrait('a');
    const cb = vi.fn();
    t.on('entity:entered', cb);
    const provider = getProvider(t);
    provider.emit('entity:entered', 'other-agent', { type: 'entity_entered', entity: {}, distance: 1 });
    expect(cb).not.toHaveBeenCalled();
  });

  it('forwards context:updated from provider and updates lastContext', () => {
    const t = makeTrait('a');
    const context = { nearbyEntities: [], currentRegions: [] };
    const cb = vi.fn();
    t.on('context:updated', cb);
    const provider = getProvider(t);
    provider.emit('context:updated', 'a', context);
    expect(cb).toHaveBeenCalledWith(context);
    expect((t as any).lastContext).toBe(context);
  });

  it('forwards visibility:changed and updates visibleEntities map', () => {
    const t = makeTrait('a');
    const cb = vi.fn();
    t.on('visibility:changed', cb);
    const provider = getProvider(t);
    provider.emit('visibility:changed', 'a', { type: 'visibility_changed', entityId: 'e1', visible: true });
    expect(cb).toHaveBeenCalledWith('e1', true);
    expect(t.isEntityVisible('e1')).toBe(true);
  });
});

// ─── factories ────────────────────────────────────────────────────────────────

describe('createSpatialAwarenessTrait', () => {
  it('returns SpatialAwarenessTrait instance', () => {
    const t = createSpatialAwarenessTrait('x', { autoStart: false });
    expect(t).toBeInstanceOf(SpatialAwarenessTrait);
    t.dispose();
  });
});

describe('createSharedSpatialProvider', () => {
  it('returns SpatialContextProvider instance', () => {
    const p = createSharedSpatialProvider();
    expect(p).toBeInstanceOf(SpatialContextProvider);
  });
});
