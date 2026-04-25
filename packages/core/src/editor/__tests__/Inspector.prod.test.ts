/**
 * Inspector — Production Tests
 *
 * Tests the Inspector view-model: component type querying,
 * component data retrieval, and setProperty delegation.
 * Uses real World + SelectionManager instances.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Inspector } from '../Inspector';
import { World } from '@holoscript/engine/ecs/World';
import { SelectionManager } from '../SelectionManager';

// =============================================================================
// HELPERS
// =============================================================================

const POSITION = Symbol('position');
const HEALTH = Symbol('health');
const MESH = Symbol('mesh');

type PositionData = [number, number, number];
type HealthData = { hp: number; max: number };
type MeshData = { visible: boolean; castShadow: boolean };

// =============================================================================
// CONSTRUCTION
// =============================================================================

describe('Inspector — Construction', () => {
  it('constructs without error', () => {
    const world = new World();
    const sel = new SelectionManager();
    expect(() => new Inspector(world, sel)).not.toThrow();
  });
});

// =============================================================================
// componentTypes (no selection)
// =============================================================================

describe('Inspector — componentTypes (no selection)', () => {
  let world: World;
  let sel: SelectionManager;
  let inspector: Inspector;

  beforeEach(() => {
    world = new World();
    sel = new SelectionManager();
    inspector = new Inspector(world, sel);
  });

  it('returns [] when nothing selected', () => {
    expect(inspector.componentTypes).toHaveLength(0);
  });

  it('returns [] when selected entity not present in world', () => {
    sel.select(999 as any);
    expect(inspector.componentTypes).toHaveLength(0);
  });
});

// =============================================================================
// componentTypes (with entity)
// =============================================================================

describe('Inspector — componentTypes (entity with components)', () => {
  let world: World;
  let sel: SelectionManager;
  let inspector: Inspector;

  beforeEach(() => {
    world = new World();
    sel = new SelectionManager();
    inspector = new Inspector(world, sel);
  });

  it('returns single component type when entity has one component', () => {
    const entity = world.createEntity();
    world.addComponent(entity, POSITION, [0, 0, 0]);
    sel.select(entity);
    expect(inspector.componentTypes).toContain(POSITION);
  });

  it('returns all component types for entity with multiple components', () => {
    const entity = world.createEntity();
    world.addComponent(entity, POSITION, [1, 2, 3]);
    world.addComponent(entity, HEALTH, { hp: 100, max: 100 });
    world.addComponent(entity, MESH, { visible: true, castShadow: false });
    sel.select(entity);
    const types = inspector.componentTypes;
    expect(types).toContain(POSITION);
    expect(types).toContain(HEALTH);
    expect(types).toContain(MESH);
    expect(types).toHaveLength(3);
  });

  it('updates when selection changes', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    world.addComponent(e1, POSITION, [0, 0, 0]);
    world.addComponent(e2, HEALTH, { hp: 50, max: 100 });
    sel.select(e1);
    expect(inspector.componentTypes).toContain(POSITION);
    sel.select(e2);
    expect(inspector.componentTypes).toContain(HEALTH);
    expect(inspector.componentTypes).not.toContain(POSITION);
  });
});

// =============================================================================
// getComponentData
// =============================================================================

describe('Inspector — getComponentData', () => {
  let world: World;
  let sel: SelectionManager;
  let inspector: Inspector;

  beforeEach(() => {
    world = new World();
    sel = new SelectionManager();
    inspector = new Inspector(world, sel);
  });

  it('returns undefined when no entity selected', () => {
    expect(inspector.getComponentData(POSITION)).toBeUndefined();
  });

  it('returns component data for selected entity', () => {
    const entity = world.createEntity();
    world.addComponent<PositionData>(entity, POSITION, [5, 10, 15]);
    sel.select(entity);
    const data = inspector.getComponentData(POSITION) as PositionData;
    expect(data[0]).toBe(5);
    expect(data[1]).toBe(10);
    expect(data[2]).toBe(15);
  });

  it('returns undefined for component not present on entity', () => {
    const entity = world.createEntity();
    world.addComponent(entity, POSITION, [0, 0, 0]);
    sel.select(entity);
    expect(inspector.getComponentData(HEALTH)).toBeUndefined();
  });

  it('returns live data (same object reference)', () => {
    const entity = world.createEntity();
    world.addComponent<PositionData>(entity, POSITION, [0, 0, 0]);
    sel.select(entity);
    const d1 = inspector.getComponentData(POSITION);
    const d2 = inspector.getComponentData(POSITION);
    expect(d1).toBe(d2);
  });
});

// =============================================================================
// setProperty
// =============================================================================

describe('Inspector — setProperty', () => {
  let world: World;
  let sel: SelectionManager;
  let inspector: Inspector;

  beforeEach(() => {
    world = new World();
    sel = new SelectionManager();
    inspector = new Inspector(world, sel);
  });

  it('setProperty does nothing when no entity selected', () => {
    expect(() => inspector.setProperty(POSITION, 'x', 999)).not.toThrow();
  });

  it('setProperty updates the component data', () => {
    const entity = world.createEntity();
    world.addComponent<PositionData>(entity, POSITION, [0, 0, 0]);
    sel.select(entity);
    inspector.setProperty(POSITION, 'x', 42);
    const data = inspector.getComponentData(POSITION) as PositionData;
    expect(data[0]).toBe(42);
  });

  it('setProperty on missing component does nothing', () => {
    const entity = world.createEntity();
    sel.select(entity);
    expect(() => inspector.setProperty(POSITION, 'x', 0)).not.toThrow();
  });

  it('multiple setProperty calls accumulate', () => {
    const entity = world.createEntity();
    world.addComponent<HealthData>(entity, HEALTH, { hp: 100, max: 100 });
    sel.select(entity);
    inspector.setProperty(HEALTH, 'hp', 75);
    inspector.setProperty(HEALTH, 'max', 200);
    const data = inspector.getComponentData(HEALTH) as HealthData;
    expect(data.hp).toBe(75);
    expect(data.max).toBe(200);
  });
});
