import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpatialAwarenessTrait, createSpatialAwarenessTrait } from './SpatialAwarenessTrait';
import { SpatialContextProvider } from '../spatial/SpatialContextProvider';
import { SpatialEntity } from '../spatial/SpatialTypes';

describe('SpatialAwarenessTrait', () => {
  let trait: SpatialAwarenessTrait;
  let otherEntity: SpatialEntity;

  beforeEach(() => {
    trait = createSpatialAwarenessTrait('agent-1', {
      perceptionRadius: 10,
      autoStart: false,
    });

    otherEntity = {
      id: 'entity-2',
      type: 'npc',
      position: { x: 20, y: 0, z: 0 }, // Out of range initially (radius 10)
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
  });

  it('should start and stop correctly', () => {
    const providerSpy = vi.spyOn(trait['provider'], 'registerAgent');
    const unregisterSpy = vi.spyOn(trait['provider'], 'unregisterAgent');

    trait.start();
    expect(providerSpy).toHaveBeenCalledWith('agent-1', expect.any(Object), expect.any(Object));

    trait.stop();
    expect(unregisterSpy).toHaveBeenCalledWith('agent-1');
  });

  it('should detect entity entering range', () => {
    // We need to use the REAL provider logic or simulate events.
    // Since we want to test the TRAIT's reaction to provider events, we can trigger them on the provider.
    // OR we can use the real provider and move things.
    // Using real provider is robust.

    trait.start();
    // Register another entity in the provider
    trait['provider'].setEntity(otherEntity);

    // Setup listener
    const enteredSpy = vi.fn();
    trait.on('entity:entered', enteredSpy);

    // Update trait position to move closer to entity-2
    // Entity-2 is at x=20. Radius 10.
    // Move agent to x=15. Dist = 5. Inside radius.
    trait.setPosition({ x: 15, y: 0, z: 0 });

    // Force provider update since it's tick-based
    (trait as any).provider.update();

    expect(enteredSpy).toHaveBeenCalled();
    const [entity, dist] = enteredSpy.mock.calls[0];
    expect(entity.id).toBe('entity-2');
    expect(dist).toBe(5);
  });

  it('should detect entity exiting range', () => {
    trait.start();
    // Start close
    trait.setPosition({ x: 0, y: 0, z: 0 });
    const closeEntity = { ...otherEntity, position: { x: 5, y: 0, z: 0 } };
    trait['provider'].setEntity(closeEntity);

    // Initial update to establish "entered" state
    (trait as any).provider.update();

    const exitedSpy = vi.fn();
    trait.on('entity:exited', exitedSpy);

    // Move away
    trait.setPosition({ x: -20, y: 0, z: 0 }); // Dist to x=5 is 25. Radius 10. Exited.

    // Update again to process exit
    (trait as any).provider.update();

    expect(exitedSpy).toHaveBeenCalled();
    expect(exitedSpy.mock.calls[0][0].id).toBe('entity-2');
  });

  it('should filter entities by type', () => {
    // Configure trait to only see 'player'
    trait.setEntityTypeFilter(['player']);
    trait.start();

    const npcEntity = { ...otherEntity, id: 'npc-1', type: 'npc', position: { x: 5, y: 0, z: 0 } };
    const playerEntity = {
      ...otherEntity,
      id: 'player-1',
      type: 'player',
      position: { x: 5, y: 0, z: 0 },
    };

    trait['provider'].setEntity(npcEntity);
    trait['provider'].setEntity(playerEntity);

    const enteredSpy = vi.fn();
    trait.on('entity:entered', enteredSpy);

    // Trigger check
    trait.setPosition({ x: 0, y: 0, z: 0 });
    (trait as any).provider.update();

    expect(enteredSpy).toHaveBeenCalledTimes(1);
    expect(enteredSpy.mock.calls[0][0].id).toBe('player-1');
  });

  it('should access context and nearby entities', () => {
    trait.start();
    trait.setPosition({ x: 0, y: 0, z: 0 });

    // Set entity inside radius
    const nearby = { ...otherEntity, position: { x: 5, y: 0, z: 0 } };
    trait['provider'].setEntity(nearby);
    (trait as any).provider.update();

    const context = trait.getContext();
    expect(context).not.toBeNull();
    expect(context?.nearbyEntities.length).toBe(1);
    expect(context?.nearbyEntities[0].id).toBe('entity-2');

    const entities = trait.getNearbyEntities();
    expect(entities.length).toBe(1);
    expect(entities[0].id).toBe('entity-2');

    expect(trait.getDistanceTo('entity-2')).toBe(5);
    expect(trait.getDistanceTo('unknown')).toBeNull();
  });

  it('should perform queries via provider', () => {
    trait.start();
    trait.setPosition({ x: 0, y: 0, z: 0 });
    const e1 = { ...otherEntity, id: 'e1', position: { x: 5, y: 0, z: 0 } }; // Dist 5
    const e2 = { ...otherEntity, id: 'e2', position: { x: 8, y: 5, z: 0 } }; // Dist sqrt(64+25) = sqrt(89) ~ 9.4

    trait['provider'].setEntities([e1, e2]);

    // findNearest
    const nearest = trait.findNearest();
    expect(nearest).not.toBeNull();
    expect(nearest?.entity.id).toBe('e1');
    expect(nearest?.distance).toBe(5);

    // findWithin
    const within = trait.findWithin(6);
    expect(within.length).toBe(1);
    expect(within[0].entity.id).toBe('e1'); // e2 is at 8, radius 6

    // findVisible (simple line of sight, no obstacles)
    const visible = trait.findVisible(undefined, undefined, 20);
    expect(visible.length).toBe(2);
  });

  it('should handle region events', () => {
    trait.start();

    // Register a region
    const region = {
      id: 'zone-1',
      type: 'safe_zone',
      bounds: { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } },
      priority: 1,
    };
    trait.registerRegion(region); // Should delegate to provider

    const enterSpy = vi.fn();
    trait.on('region:entered', enterSpy);

    // Move inside
    trait.setPosition({ x: 0, y: 0, z: 0 });
    (trait as any).provider.update();

    expect(enterSpy).toHaveBeenCalled();
    expect(enterSpy.mock.calls[0][0].id).toBe('zone-1');
    expect(trait.isInRegion('zone-1')).toBe(true);

    const exitSpy = vi.fn();
    trait.on('region:exited', exitSpy);

    // Move outside
    trait.setPosition({ x: 10, y: 0, z: 0 });
    (trait as any).provider.update();

    expect(exitSpy).toHaveBeenCalled();
    expect(exitSpy.mock.calls[0][0].id).toBe('zone-1');
    expect(trait.isInRegion('zone-1')).toBe(false);
  });

  it('should update configuration dynamically', () => {
    trait.start();
    const unregisterSpy = vi.spyOn(trait['provider'], 'unregisterAgent');
    const registerSpy = vi.spyOn(trait['provider'], 'registerAgent');

    // Change radius
    trait.setPerceptionRadius(50);

    expect(trait.getPerceptionRadius()).toBe(50);
    // Should re-register
    expect(unregisterSpy).toHaveBeenCalledWith('agent-1');
    expect(registerSpy).toHaveBeenCalledWith(
      'agent-1',
      expect.any(Object),
      expect.objectContaining({
        perceptionRadius: 50,
      })
    );
  });
});
