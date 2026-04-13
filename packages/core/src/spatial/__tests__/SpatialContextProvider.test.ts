import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SpatialContextProvider } from '../SpatialContextProvider';

describe('SpatialContextProvider', () => {
  let provider: SpatialContextProvider;

  beforeEach(() => {
    provider = new SpatialContextProvider();
  });

  afterEach(() => {
    provider.stop();
  });

  // =========== Agent Registration ===========

  it('registers an agent', () => {
    provider.registerAgent('agent1', { x: 0, y: 0, z: 0 });
    expect(provider.getContext('agent1')).toBeNull(); // no update yet
  });

  it('unregisters an agent', () => {
    provider.registerAgent('agent1', { x: 0, y: 0, z: 0 });
    provider.unregisterAgent('agent1');
    expect(provider.getContext('agent1')).toBeNull();
  });

  it('getContext returns null for unregistered agent', () => {
    expect(provider.getContext('nope')).toBeNull();
  });

  // =========== Entity Management ===========

  it('setEntity adds entity', () => {
    provider.setEntity({ id: 'e1', type: 'npc', position: [1, 0, 0] });
    const entities = provider.getEntities();
    expect(entities).toHaveLength(1);
    expect(entities[0].id).toBe('e1');
  });

  it('removeEntity removes entity', () => {
    provider.setEntity({ id: 'e1', type: 'npc', position: [1, 0, 0] });
    provider.removeEntity('e1');
    expect(provider.getEntities()).toHaveLength(0);
  });

  it('setEntities replaces all entities', () => {
    provider.setEntity({ id: 'e1', type: 'npc', position: [1, 0, 0] });
    provider.setEntities([
      { id: 'e2', type: 'item', position: [2, 0, 0] },
      { id: 'e3', type: 'item', position: [3, 0, 0] },
    ]);
    const entities = provider.getEntities();
    expect(entities).toHaveLength(2);
    expect(entities.map((e) => e.id)).toEqual(['e2', 'e3']);
  });

  // =========== Region Management ===========

  it('setRegion adds region', () => {
    provider.setRegion({
      id: 'r1',
      name: 'Zone A',
      bounds: { center: { x: 0, y: 0, z: 0 }, radius: 10 },
    });
    // No direct getter for regions, but we verify it doesn't throw
  });

  it('removeRegion removes region without error', () => {
    provider.setRegion({
      id: 'r1',
      name: 'Zone A',
      bounds: { center: { x: 0, y: 0, z: 0 }, radius: 10 },
    });
    provider.removeRegion('r1');
  });

  // =========== Manual Update ===========

  it('update populates agent context', () => {
    provider.registerAgent('agent1', { x: 0, y: 0, z: 0 }, { perceptionRadius: 100 });
    provider.setEntity({ id: 'e1', type: 'npc', position: [5, 0, 0] });
    provider.update();
    const ctx = provider.getContext('agent1');
    expect(ctx).not.toBeNull();
    expect(ctx!.nearbyEntities).toHaveLength(1);
    expect(ctx!.nearbyEntities[0].id).toBe('e1');
  });

  it('entities outside perception radius are not in context', () => {
    provider.registerAgent('agent1', { x: 0, y: 0, z: 0 }, { perceptionRadius: 5 });
    provider.setEntity({ id: 'far', type: 'npc', position: [100, 0, 0] });
    provider.update();
    const ctx = provider.getContext('agent1')!;
    expect(ctx.nearbyEntities).toHaveLength(0);
  });

  it('update detects entity entering perception', () => {
    const handler = vi.fn();
    provider.on('entity:entered', handler);

    provider.registerAgent('a', { x: 0, y: 0, z: 0 }, { perceptionRadius: 50 });
    provider.setEntity({ id: 'e1', type: 'npc', position: [10, 0, 0] });
    provider.update();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe('a');
    expect(handler.mock.calls[0][1].entity.id).toBe('e1');
  });

  it('update detects entity exiting perception', () => {
    const handler = vi.fn();
    provider.on('entity:exited', handler);

    provider.registerAgent('a', { x: 0, y: 0, z: 0 }, { perceptionRadius: 50 });
    provider.setEntity({ id: 'e1', type: 'npc', position: [10, 0, 0] });
    provider.update(); // e1 enters

    // Move entity far away
    provider.removeEntity('e1');
    provider.setEntity({ id: 'e1', type: 'npc', position: [999, 0, 0] });
    provider.update(); // e1 exits

    expect(handler).toHaveBeenCalledTimes(1);
  });

  // =========== Region Events ===========

  it('update detects agent entering a spherical region', () => {
    const handler = vi.fn();
    provider.on('region:entered', handler);

    provider.setRegion({
      id: 'zone',
      name: 'Safe Zone',
      bounds: { center: { x: 0, y: 0, z: 0 }, radius: 10 },
    });
    provider.registerAgent('a', { x: 0, y: 0, z: 0 });
    provider.update();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1].type).toBe('region_entered');
  });

  it('region subscription callback fires on entry', () => {
    const callback = vi.fn();

    provider.setRegion({
      id: 'zone',
      name: 'Zone',
      bounds: { center: { x: 0, y: 0, z: 0 }, radius: 10 },
    });
    provider.registerAgent('a', { x: 0, y: 0, z: 0 });
    provider.subscribeToRegion('a', 'zone', callback);
    provider.update();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  // =========== Position Updates ===========

  it('updateAgentPosition updates agent state', () => {
    provider.registerAgent('a', { x: 0, y: 0, z: 0 }, { perceptionRadius: 100 });
    provider.setEntity({ id: 'e1', type: 'npc', position: [50, 0, 0] });
    provider.update();

    provider.updateAgentPosition('a', { x: 49, y: 0, z: 0 });
    provider.update();

    const ctx = provider.getContext('a')!;
    expect(ctx.agentPosition.x).toBe(49);
  });

  // =========== Lifecycle ===========

  it('start/stop lifecycle', () => {
    provider.registerAgent('a', { x: 0, y: 0, z: 0 }, { updateRate: 10 });
    provider.start();
    // Should not throw
    provider.stop();
  });

  it('starting twice is no-op', () => {
    provider.registerAgent('a', { x: 0, y: 0, z: 0 }, { updateRate: 10 });
    provider.start();
    provider.start(); // no-op
    provider.stop();
  });

  it('stopping when not running is no-op', () => {
    provider.stop(); // no-op
  });

  // =========== context:updated event ===========

  it('emits context:updated on update', () => {
    const handler = vi.fn();
    provider.on('context:updated', handler);

    provider.registerAgent('a', { x: 0, y: 0, z: 0 });
    provider.update();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe('a');
  });

  // =========== findNearest / findWithin ===========

  it('findNearest returns closest entity', () => {
    provider.setEntity({ id: 'far', type: 'npc', position: [100, 0, 0] });
    provider.setEntity({ id: 'near', type: 'npc', position: [1, 0, 0] });
    const results = provider.findNearest({ x: 0, y: 0, z: 0 }, 1);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].entity.id).toBe('near');
  });

  it('findWithin returns entities in radius', () => {
    provider.setEntity({ id: 'close', type: 'npc', position: [3, 0, 0] });
    provider.setEntity({ id: 'far', type: 'npc', position: [500, 0, 0] });
    const results = provider.findWithin({ x: 0, y: 0, z: 0 }, 10);
    expect(results).toHaveLength(1);
    expect(results[0].entity.id).toBe('close');
  });

  // =========== Region subscriptions ===========

  it('unsubscribeFromRegion prevents callback', () => {
    const callback = vi.fn();

    provider.setRegion({
      id: 'zone',
      name: 'Zone',
      bounds: { center: { x: 0, y: 0, z: 0 }, radius: 10 },
    });
    provider.registerAgent('a', { x: 0, y: 0, z: 0 });
    provider.subscribeToRegion('a', 'zone', callback);
    provider.unsubscribeFromRegion('a', 'zone');
    provider.update();

    expect(callback).not.toHaveBeenCalled();
  });
});
