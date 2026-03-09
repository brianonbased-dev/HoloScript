/**
 * Sprint 22 Acceptance Tests — ECS + Events
 *
 * Covers:
 *   packages/core/src/ecs/
 *     World         — entity lifecycle, components, tags, queries, undo/redo
 *     EntityRegistry— create/destroy, queries, hierarchy, component bookkeeping
 *     ComponentStore— pools, CRUD, bulk ops, iteration
 *     ComponentRegistry — schema registration, built-in components
 *     SystemScheduler— registration, phases, execution order, stats
 *
 *   packages/core/src/events/
 *     EventBus       — subscribe/emit, once, priority, wildcard, history, pause
 *     EventChannel   — subscribe/emit, filter, replay buffer, throttle
 *     ChannelManager — multi-channel registry, bridging
 *     CommandSystem  — execute/undo/redo, batching, macros
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { World } from '../ecs/World.js';
import { EntityRegistry } from '../ecs/EntityRegistry.js';
import { ComponentStore } from '../ecs/ComponentStore.js';
import { ComponentRegistry, registerBuiltInComponents } from '../ecs/ComponentRegistry.js';
import { SystemScheduler } from '../ecs/SystemScheduler.js';
import { EventBus, getSharedEventBus, setSharedEventBus } from '../events/EventBus.js';
import { EventChannel, ChannelManager } from '../events/EventChannel.js';
import { CommandSystem, type Command } from '../events/CommandSystem.js';

// =============================================================================
// Feature 1A: World — entity lifecycle
// =============================================================================

describe('Feature 1A: World — entity lifecycle', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  it('createEntity() returns a number', () => {
    expect(typeof world.createEntity()).toBe('number');
  });

  it('hasEntity() is true after create', () => {
    const e = world.createEntity();
    expect(world.hasEntity(e)).toBe(true);
  });

  it('entityCount increases after create', () => {
    world.createEntity();
    world.createEntity();
    expect(world.entityCount).toBe(2);
  });

  it('destroyEntity() removes entity', () => {
    const e = world.createEntity();
    world.destroyEntity(e);
    expect(world.hasEntity(e)).toBe(false);
  });

  it('entityCount decreases after destroy', () => {
    const e = world.createEntity();
    world.createEntity();
    world.destroyEntity(e);
    expect(world.entityCount).toBe(1);
  });

  it('getAllEntities() returns all living entities', () => {
    const a = world.createEntity();
    const b = world.createEntity();
    const all = world.getAllEntities();
    expect(all).toContain(a);
    expect(all).toContain(b);
  });
});

// =============================================================================
// Feature 1B: World — component management
// =============================================================================

describe('Feature 1B: World — component management', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  it('addComponent() + hasComponent() is true', () => {
    const e = world.createEntity();
    world.addComponent(e, 'position', { x: 0, y: 0 });
    expect(world.hasComponent(e, 'position')).toBe(true);
  });

  it('getComponent() returns the data', () => {
    const e = world.createEntity();
    world.addComponent(e, 'velocity', { vx: 1, vy: 2 });
    const c = world.getComponent<{ vx: number; vy: number }>(e, 'velocity');
    expect(c?.vx).toBe(1);
    expect(c?.vy).toBe(2);
  });

  it('removeComponent() removes the component', () => {
    const e = world.createEntity();
    world.addComponent(e, 'hp', { value: 100 });
    world.removeComponent(e, 'hp');
    expect(world.hasComponent(e, 'hp')).toBe(false);
  });

  it('getComponentTypes() lists attached components', () => {
    const e = world.createEntity();
    world.addComponent(e, 'pos', { x: 0 });
    world.addComponent(e, 'vel', { vx: 0 });
    const types = world.getComponentTypes(e);
    expect(types).toContain('pos');
    expect(types).toContain('vel');
  });

  it('addComponent() on non-existent entity is a no-op', () => {
    expect(() => world.addComponent(999, 'pos', { x: 0 })).not.toThrow();
  });

  it('getComponent() returns undefined for missing component', () => {
    const e = world.createEntity();
    expect(world.getComponent(e, 'missing')).toBeUndefined();
  });
});

// =============================================================================
// Feature 1C: World — tags and queries
// =============================================================================

describe('Feature 1C: World — tags and queries', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  it('addTag() + hasTag() is true', () => {
    const e = world.createEntity();
    world.addTag(e, 'enemy');
    expect(world.hasTag(e, 'enemy')).toBe(true);
  });

  it('query() returns entities with all components', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    world.addComponent(e1, 'pos', { x: 0 });
    world.addComponent(e1, 'vel', { vx: 0 });
    world.addComponent(e2, 'pos', { x: 1 });
    const results = world.query('pos', 'vel');
    expect(results).toContain(e1);
    expect(results).not.toContain(e2);
  });

  it('queryByTag() returns entities with the tag', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    world.addTag(e1, 'player');
    const results = world.queryByTag('player');
    expect(results).toContain(e1);
    expect(results).not.toContain(e2);
  });

  it('query() with no args returns all entities', () => {
    world.createEntity();
    world.createEntity();
    expect(world.query().length).toBe(2);
  });

  it('hasTag() is false for missing tag', () => {
    const e = world.createEntity();
    expect(world.hasTag(e, 'nope')).toBe(false);
  });
});

// =============================================================================
// Feature 1D: World — undo / redo
// =============================================================================

describe('Feature 1D: World — undo/redo', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  it('undo() after createEntity removes the entity', () => {
    const e = world.createEntity();
    world.undo();
    expect(world.hasEntity(e)).toBe(false);
  });

  it('redo() after undo restores the entity', () => {
    const e = world.createEntity();
    world.undo();
    world.redo();
    expect(world.hasEntity(e)).toBe(true);
  });

  it('undo() after destroyEntity restores the entity', () => {
    const e = world.createEntity();
    world.undoManager.clear?.(); // clear creation op
    world.destroyEntity(e);
    world.undo();
    expect(world.hasEntity(e)).toBe(true);
  });

  it('undo() when stack is empty does not throw', () => {
    expect(() => world.undo()).not.toThrow();
  });
});

// =============================================================================
// Feature 2A: EntityRegistry — create / destroy
// =============================================================================

describe('Feature 2A: EntityRegistry — create/destroy', () => {
  let reg: EntityRegistry;

  beforeEach(() => {
    reg = new EntityRegistry();
  });

  it('create() returns an entity with id', () => {
    const e = reg.create('hero');
    expect(typeof e.id).toBe('number');
  });

  it('create() assigns name', () => {
    const e = reg.create('hero');
    expect(e.name).toBe('hero');
  });

  it('create() defaults active to true', () => {
    expect(reg.create().active).toBe(true);
  });

  it('getByName() finds by name', () => {
    reg.create('dragon');
    expect(reg.getByName('dragon')).toBeDefined();
  });

  it('destroy() removes entity', () => {
    const e = reg.create('temp');
    reg.destroy(e.id);
    expect(reg.get(e.id)).toBeUndefined();
  });

  it('destroy() returns false for missing entity', () => {
    expect(reg.destroy(9999)).toBe(false);
  });

  it('getTotalCount() tracks correctly', () => {
    reg.create();
    reg.create();
    expect(reg.getTotalCount()).toBe(2);
  });
});

// =============================================================================
// Feature 2B: EntityRegistry — queries and tags
// =============================================================================

describe('Feature 2B: EntityRegistry — queries and tags', () => {
  let reg: EntityRegistry;

  beforeEach(() => {
    reg = new EntityRegistry();
  });

  it('getByTag() returns entities with tag', () => {
    const e = reg.create('goblin', ['enemy']);
    const results = reg.getByTag('enemy');
    expect(results.some((r) => r.id === e.id)).toBe(true);
  });

  it('addTag() / hasTag() work after creation', () => {
    const e = reg.create('npc');
    reg.addTag(e.id, 'friendly');
    expect(reg.hasTag(e.id, 'friendly')).toBe(true);
  });

  it('removeTag() removes the tag', () => {
    const e = reg.create('npc', ['friendly']);
    reg.removeTag(e.id, 'friendly');
    expect(reg.hasTag(e.id, 'friendly')).toBe(false);
  });

  it('setActive(false) removes from active count', () => {
    const e = reg.create();
    reg.setActive(e.id, false);
    expect(reg.getActiveCount()).toBe(0);
  });

  it('getByTag() excludes inactive entities', () => {
    const e = reg.create('thing', ['active-tag']);
    reg.setActive(e.id, false);
    expect(reg.getByTag('active-tag').length).toBe(0);
  });
});

// =============================================================================
// Feature 2C: EntityRegistry — hierarchy
// =============================================================================

describe('Feature 2C: EntityRegistry — hierarchy', () => {
  let reg: EntityRegistry;

  beforeEach(() => {
    reg = new EntityRegistry();
  });

  it('setParent() links parent/child', () => {
    const parent = reg.create('parent');
    const child = reg.create('child');
    reg.setParent(child.id, parent.id);
    expect(reg.get(child.id)?.parent).toBe(parent.id);
  });

  it('getChildren() returns child entities', () => {
    const p = reg.create('p');
    const c = reg.create('c');
    reg.setParent(c.id, p.id);
    const children = reg.getChildren(p.id);
    expect(children.some((ch) => ch.id === c.id)).toBe(true);
  });

  it('destroy(parent) also destroys children', () => {
    const p = reg.create('p');
    const c = reg.create('c');
    reg.setParent(c.id, p.id);
    reg.destroy(p.id);
    expect(reg.get(c.id)).toBeUndefined();
  });

  it('setParent() returns false for missing entities', () => {
    expect(reg.setParent(999, 1000)).toBe(false);
  });
});

// =============================================================================
// Feature 2D: EntityRegistry — component bookkeeping
// =============================================================================

describe('Feature 2D: EntityRegistry — component bookkeeping', () => {
  let reg: EntityRegistry;

  beforeEach(() => {
    reg = new EntityRegistry();
  });

  it('registerComponent() + hasComponent() is true', () => {
    const e = reg.create();
    reg.registerComponent(e.id, 'transform');
    expect(reg.hasComponent(e.id, 'transform')).toBe(true);
  });

  it('unregisterComponent() removes from entity', () => {
    const e = reg.create();
    reg.registerComponent(e.id, 'mesh');
    reg.unregisterComponent(e.id, 'mesh');
    expect(reg.hasComponent(e.id, 'mesh')).toBe(false);
  });

  it('getByComponents() returns matching entities', () => {
    const e1 = reg.create();
    const e2 = reg.create();
    reg.registerComponent(e1.id, 'physics');
    reg.registerComponent(e2.id, 'physics');
    reg.registerComponent(e1.id, 'render');
    const results = reg.getByComponents('physics', 'render');
    expect(results.some((r) => r.id === e1.id)).toBe(true);
    expect(results.some((r) => r.id === e2.id)).toBe(false);
  });
});

// =============================================================================
// Feature 3A: ComponentStore — pool management
// =============================================================================

describe('Feature 3A: ComponentStore — pool management', () => {
  let store: ComponentStore;

  beforeEach(() => {
    store = new ComponentStore();
  });

  it('registerPool() creates a pool', () => {
    store.registerPool('transform');
    expect(store.hasPool('transform')).toBe(true);
  });

  it('getPool() returns the registered pool', () => {
    store.registerPool('velocity');
    expect(store.getPool('velocity')).toBeDefined();
  });

  it('getPoolTypes() lists all pools', () => {
    store.registerPool('a');
    store.registerPool('b');
    expect(store.getPoolTypes()).toContain('a');
    expect(store.getPoolTypes()).toContain('b');
  });

  it('hasPool() is false for unknown pool', () => {
    expect(store.hasPool('unknown')).toBe(false);
  });
});

// =============================================================================
// Feature 3B: ComponentStore — CRUD operations
// =============================================================================

describe('Feature 3B: ComponentStore — CRUD', () => {
  let store: ComponentStore;

  beforeEach(() => {
    store = new ComponentStore();
  });

  it('add() returns true on first add', () => {
    expect(store.add('pos', 1, { x: 0, y: 0 })).toBe(true);
  });

  it('add() returns false on duplicate', () => {
    store.add('pos', 1, { x: 0 });
    expect(store.add('pos', 1, { x: 1 })).toBe(false);
  });

  it('get() returns the stored data', () => {
    store.add('hp', 2, { value: 50 });
    expect(store.get<{ value: number }>('hp', 2)?.value).toBe(50);
  });

  it('has() is true after add', () => {
    store.add('tag', 3, { name: 'hero' });
    expect(store.has('tag', 3)).toBe(true);
  });

  it('remove() deletes the component', () => {
    store.add('vel', 4, { vx: 1 });
    store.remove('vel', 4);
    expect(store.has('vel', 4)).toBe(false);
  });

  it('set() merges fields', () => {
    store.add('stats', 5, { hp: 10, mp: 5 });
    store.set('stats', 5, { hp: 20 });
    expect(store.get<{ hp: number; mp: number }>('stats', 5)?.hp).toBe(20);
    expect(store.get<{ hp: number; mp: number }>('stats', 5)?.mp).toBe(5);
  });
});

// =============================================================================
// Feature 3C: ComponentStore — bulk and iteration
// =============================================================================

describe('Feature 3C: ComponentStore — bulk ops', () => {
  let store: ComponentStore;

  beforeEach(() => {
    store = new ComponentStore();
  });

  it('getEntitiesWithComponent() returns entity IDs', () => {
    store.add('pos', 10, { x: 0 });
    store.add('pos', 11, { x: 1 });
    const ids = store.getEntitiesWithComponent('pos');
    expect(ids).toContain(10);
    expect(ids).toContain(11);
  });

  it('getEntitiesWithAll() returns intersection', () => {
    store.add('pos', 20, { x: 0 });
    store.add('vel', 20, { vx: 0 });
    store.add('pos', 21, { x: 1 }); // no vel
    const ids = store.getEntitiesWithAll('pos', 'vel');
    expect(ids).toContain(20);
    expect(ids).not.toContain(21);
  });

  it('removeAllForEntity() removes from all pools', () => {
    store.add('pos', 30, { x: 0 });
    store.add('vel', 30, { vx: 0 });
    const count = store.removeAllForEntity(30);
    expect(count).toBe(2);
    expect(store.has('pos', 30)).toBe(false);
  });

  it('getTotalComponentCount() sums all pools', () => {
    store.add('pos', 1, { x: 0 });
    store.add('vel', 2, { vx: 0 });
    expect(store.getTotalComponentCount()).toBe(2);
  });

  it('forEach() iterates all entities in pool', () => {
    store.add('pos', 1, { x: 1 });
    store.add('pos', 2, { x: 2 });
    const visited: number[] = [];
    store.forEach('pos', (id) => visited.push(id));
    expect(visited).toContain(1);
    expect(visited).toContain(2);
  });
});

// =============================================================================
// Feature 4A: ComponentRegistry — schemas
// =============================================================================

describe('Feature 4A: ComponentRegistry — schemas', () => {
  let reg: ComponentRegistry;

  beforeEach(() => {
    reg = new ComponentRegistry();
  });

  it('register() + has() is true', () => {
    reg.register({ type: 'health', defaultData: () => ({ value: 100 }) });
    expect(reg.has('health')).toBe(true);
  });

  it('getSchema() returns the schema', () => {
    reg.register({ type: 'mana', defaultData: () => ({ value: 50 }) });
    expect(reg.getSchema('mana')).toBeDefined();
  });

  it('createDefault() returns default data', () => {
    reg.register({ type: 'gold', defaultData: () => ({ amount: 0 }) });
    expect(reg.createDefault('gold')).toEqual({ amount: 0 });
  });

  it('listTypes() includes registered type', () => {
    reg.register({ type: 'speed', defaultData: () => ({ value: 5 }) });
    expect(reg.listTypes()).toContain('speed');
  });

  it('count reflects registered schemas', () => {
    reg.register({ type: 'a', defaultData: () => ({}) });
    reg.register({ type: 'b', defaultData: () => ({}) });
    expect(reg.count).toBe(2);
  });
});

// =============================================================================
// Feature 4B: ComponentRegistry — built-in components
// =============================================================================

describe('Feature 4B: ComponentRegistry — built-in components', () => {
  let reg: ComponentRegistry;

  beforeEach(() => {
    reg = new ComponentRegistry();
    registerBuiltInComponents(reg);
  });

  it('transform is registered', () => {
    expect(reg.has('transform')).toBe(true);
  });

  it('renderable is registered', () => {
    expect(reg.has('renderable')).toBe(true);
  });

  it('collider is registered', () => {
    expect(reg.has('collider')).toBe(true);
  });

  it('rigidbody is registered', () => {
    expect(reg.has('rigidbody')).toBe(true);
  });

  it('createDefault(transform) has position/rotation/scale', () => {
    const d = reg.createDefault('transform');
    expect(d).toHaveProperty('position');
    expect(d).toHaveProperty('rotation');
    expect(d).toHaveProperty('scale');
  });
});

// =============================================================================
// Feature 5A: SystemScheduler — registration and execution
// =============================================================================

describe('Feature 5A: SystemScheduler — registration', () => {
  let sched: SystemScheduler;

  beforeEach(() => {
    sched = new SystemScheduler();
  });

  it('register() increments systemCount', () => {
    sched.register('moveSystem', () => {});
    expect(sched.getSystemCount()).toBe(1);
  });

  it('unregister() decrements systemCount', () => {
    sched.register('sys', () => {});
    sched.unregister('sys');
    expect(sched.getSystemCount()).toBe(0);
  });

  it('disable() / isEnabled() are false', () => {
    sched.register('sys', () => {});
    sched.disable('sys');
    expect(sched.isEnabled('sys')).toBe(false);
  });

  it('enable() restores enabled state', () => {
    sched.register('sys', () => {});
    sched.disable('sys');
    sched.enable('sys');
    expect(sched.isEnabled('sys')).toBe(true);
  });

  it('update() calls registered systems', () => {
    let called = false;
    sched.register('test', () => {
      called = true;
    });
    sched.update(0.016);
    expect(called).toBe(true);
  });

  it('update() skips disabled systems', () => {
    let called = false;
    sched.register('test', () => {
      called = true;
    });
    sched.disable('test');
    sched.update(0.016);
    expect(called).toBe(false);
  });
});

// =============================================================================
// Feature 5B: SystemScheduler — phases and ordering
// =============================================================================

describe('Feature 5B: SystemScheduler — phases', () => {
  let sched: SystemScheduler;

  beforeEach(() => {
    sched = new SystemScheduler();
  });

  it('getExecutionOrder() respects phase ordering', () => {
    sched.register('render', () => {}, 'render');
    sched.register('update', () => {}, 'update');
    sched.register('preUpdate', () => {}, 'preUpdate');
    const order = sched.getExecutionOrder();
    expect(order.indexOf('preUpdate')).toBeLessThan(order.indexOf('update'));
    expect(order.indexOf('update')).toBeLessThan(order.indexOf('render'));
  });

  it('getSystemsByPhase() returns only that phase', () => {
    sched.register('s1', () => {}, 'update');
    sched.register('s2', () => {}, 'render');
    const updateSystems = sched.getSystemsByPhase('update');
    expect(updateSystems.every((s) => s.phase === 'update')).toBe(true);
  });

  it('priority ordering: lower runs first', () => {
    const order: string[] = [];
    sched.register('high', () => order.push('high'), 'update', 0);
    sched.register('low', () => order.push('low'), 'update', 10);
    sched.update(0.016);
    expect(order.indexOf('high')).toBeLessThan(order.indexOf('low'));
  });

  it('setFixedTimeStep() / getFixedTimeStep() round-trip', () => {
    sched.setFixedTimeStep(1 / 30);
    expect(sched.getFixedTimeStep()).toBeCloseTo(1 / 30, 5);
  });

  it('getSystem() returns system def', () => {
    sched.register('mySys', () => {});
    expect(sched.getSystem('mySys')).toBeDefined();
  });
});

// =============================================================================
// Feature 6A: EventBus — basic subscribe / emit
// =============================================================================

describe('Feature 6A: EventBus — subscribe/emit', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('on() + emit() calls callback', () => {
    let got: any;
    bus.on('test', (d) => {
      got = d;
    });
    bus.emit('test', 42);
    expect(got).toBe(42);
  });

  it('listenerCount() reflects subscriptions', () => {
    bus.on('x', () => {});
    bus.on('x', () => {});
    expect(bus.listenerCount('x')).toBe(2);
  });

  it('off() removes listener', () => {
    let count = 0;
    const id = bus.on('ev', () => count++);
    bus.off(id);
    bus.emit('ev');
    expect(count).toBe(0);
  });

  it('offAll() removes all listeners for event', () => {
    bus.on('ev', () => {});
    bus.on('ev', () => {});
    bus.offAll('ev');
    expect(bus.listenerCount('ev')).toBe(0);
  });

  it('getHistory() records emitted events', () => {
    bus.emit('fired', { payload: 1 });
    const h = bus.getHistory();
    expect(h.length).toBe(1);
    expect(h[0].event).toBe('fired');
  });
});

// =============================================================================
// Feature 6B: EventBus — once, priority, wildcard
// =============================================================================

describe('Feature 6B: EventBus — once/priority/wildcard', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('once() fires only one time', () => {
    let count = 0;
    bus.once('tick', () => count++);
    bus.emit('tick');
    bus.emit('tick');
    expect(count).toBe(1);
  });

  it('priority: higher fires before lower', () => {
    const order: number[] = [];
    bus.on('ev', () => order.push(1), 1);
    bus.on('ev', () => order.push(10), 10);
    bus.emit('ev');
    expect(order[0]).toBe(10); // priority 10 first
  });

  it('wildcard * receives all events', () => {
    const received: string[] = [];
    bus.on('*', (d) => received.push(d.event));
    bus.emit('alpha');
    bus.emit('beta');
    expect(received).toContain('alpha');
    expect(received).toContain('beta');
  });

  it('setPaused(true) suppresses emit', () => {
    let called = false;
    bus.on('ev', () => {
      called = true;
    });
    bus.setPaused(true);
    bus.emit('ev');
    expect(called).toBe(false);
  });

  it('clear() removes listeners and history', () => {
    bus.on('ev', () => {});
    bus.emit('ev');
    bus.clear();
    expect(bus.listenerCount('ev')).toBe(0);
    expect(bus.getHistory().length).toBe(0);
  });
});

// =============================================================================
// Feature 6C: getSharedEventBus / setSharedEventBus
// =============================================================================

describe('Feature 6C: EventBus — shared singleton', () => {
  it('getSharedEventBus() returns an EventBus', () => {
    expect(getSharedEventBus()).toBeDefined();
  });

  it('getSharedEventBus() returns same instance twice', () => {
    expect(getSharedEventBus()).toBe(getSharedEventBus());
  });

  it('setSharedEventBus() replaces the shared instance', () => {
    const custom = new EventBus();
    setSharedEventBus(custom);
    expect(getSharedEventBus()).toBe(custom);
  });
});

// =============================================================================
// Feature 7A: EventChannel — subscribe / emit / filter
// =============================================================================

describe('Feature 7A: EventChannel — subscribe/emit/filter', () => {
  it('subscribe() + emit() fires callback', () => {
    const ch = new EventChannel<number>();
    let got: number | undefined;
    ch.subscribe((d) => {
      got = d;
    });
    ch.emit(7);
    expect(got).toBe(7);
  });

  it('emit() returns true on success', () => {
    expect(new EventChannel<string>().emit('hello')).toBe(true);
  });

  it('unsubscribe() stops callback', () => {
    const ch = new EventChannel<number>();
    let count = 0;
    const id = ch.subscribe(() => count++);
    ch.unsubscribe(id);
    ch.emit(1);
    expect(count).toBe(0);
  });

  it('filter function excludes non-matching data', () => {
    const ch = new EventChannel<number>();
    let count = 0;
    ch.subscribe(
      () => count++,
      (d) => d > 5
    );
    ch.emit(3); // filtered out
    ch.emit(10); // passes
    expect(count).toBe(1);
  });

  it('getSubscriberCount() / getEmitCount()', () => {
    const ch = new EventChannel<number>();
    ch.subscribe(() => {});
    ch.emit(1);
    ch.emit(2);
    expect(ch.getSubscriberCount()).toBe(1);
    expect(ch.getEmitCount()).toBe(2);
  });
});

// =============================================================================
// Feature 7B: EventChannel — replay buffer
// =============================================================================

describe('Feature 7B: EventChannel — replay buffer', () => {
  it('late subscriber receives buffered events', () => {
    const ch = new EventChannel<number>({ replayBufferSize: 5 });
    ch.emit(1);
    ch.emit(2);
    const received: number[] = [];
    ch.subscribe((d) => received.push(d));
    // Replay happens immediately on subscribe
    expect(received).toContain(1);
    expect(received).toContain(2);
  });

  it('getBuffer() returns buffered items', () => {
    const ch = new EventChannel<string>({ replayBufferSize: 3 });
    ch.emit('a');
    ch.emit('b');
    expect(ch.getBuffer()).toEqual(['a', 'b']);
  });

  it('buffer respects max size', () => {
    const ch = new EventChannel<number>({ replayBufferSize: 2 });
    ch.emit(1);
    ch.emit(2);
    ch.emit(3);
    expect(ch.getBuffer().length).toBe(2);
    expect(ch.getBuffer()).not.toContain(1);
  });

  it('clear() empties buffer', () => {
    const ch = new EventChannel<number>({ replayBufferSize: 5 });
    ch.emit(1);
    ch.clear();
    expect(ch.getBuffer().length).toBe(0);
  });
});

// =============================================================================
// Feature 8A: ChannelManager — multi-channel registry
// =============================================================================

describe('Feature 8A: ChannelManager — channels and bridging', () => {
  let mgr: ChannelManager;

  beforeEach(() => {
    mgr = new ChannelManager();
  });

  it('createChannel() + getChannel() works', () => {
    mgr.createChannel('input');
    expect(mgr.getChannel('input')).toBeDefined();
  });

  it('getChannelNames() lists all channels', () => {
    mgr.createChannel('audio');
    mgr.createChannel('physics');
    expect(mgr.getChannelNames()).toContain('audio');
    expect(mgr.getChannelNames()).toContain('physics');
  });

  it('removeChannel() deletes it', () => {
    mgr.createChannel('temp');
    mgr.removeChannel('temp');
    expect(mgr.getChannel('temp')).toBeUndefined();
  });

  it('bridge() forwards events between channels', () => {
    mgr.createChannel<number>('src');
    mgr.createChannel<number>('dst');
    const received: number[] = [];
    mgr.getChannel<number>('dst')!.subscribe((d) => received.push(d));
    mgr.bridge('src', 'dst');
    mgr.getChannel<number>('src')!.emit(99);
    expect(received).toContain(99);
  });

  it('bridge() with transform applies transformation', () => {
    mgr.createChannel<number>('a');
    mgr.createChannel<number>('b');
    const received: unknown[] = [];
    mgr.getChannel<number>('b')!.subscribe((d) => received.push(d));
    mgr.bridge('a', 'b', (d) => (d as number) * 2);
    mgr.getChannel<number>('a')!.emit(5);
    expect(received[0]).toBe(10);
  });
});

// =============================================================================
// Feature 9A: CommandSystem — execute / undo / redo
// =============================================================================

function makeCmd(name: string, doFn: () => void, undoFn: () => void): Command {
  return { id: name, name, execute: doFn, undo: undoFn };
}

describe('Feature 9A: CommandSystem — execute/undo/redo', () => {
  let sys: CommandSystem;

  beforeEach(() => {
    sys = new CommandSystem();
  });

  it('execute() runs the command', () => {
    let ran = false;
    sys.execute(
      makeCmd(
        'a',
        () => {
          ran = true;
        },
        () => {}
      )
    );
    expect(ran).toBe(true);
  });

  it('canUndo() is true after execute', () => {
    sys.execute(
      makeCmd(
        'a',
        () => {},
        () => {}
      )
    );
    expect(sys.canUndo()).toBe(true);
  });

  it('undo() calls undo function', () => {
    let undone = false;
    sys.execute(
      makeCmd(
        'a',
        () => {},
        () => {
          undone = true;
        }
      )
    );
    sys.undo();
    expect(undone).toBe(true);
  });

  it('redo() re-executes after undo', () => {
    let count = 0;
    sys.execute(
      makeCmd(
        'a',
        () => count++,
        () => count--
      )
    );
    sys.undo();
    sys.redo();
    expect(count).toBe(1);
  });

  it('canRedo() is true after undo', () => {
    sys.execute(
      makeCmd(
        'a',
        () => {},
        () => {}
      )
    );
    sys.undo();
    expect(sys.canRedo()).toBe(true);
  });

  it('new execute() clears redo stack', () => {
    sys.execute(
      makeCmd(
        'a',
        () => {},
        () => {}
      )
    );
    sys.undo();
    sys.execute(
      makeCmd(
        'b',
        () => {},
        () => {}
      )
    );
    expect(sys.canRedo()).toBe(false);
  });
});

// =============================================================================
// Feature 9B: CommandSystem — batching
// =============================================================================

describe('Feature 9B: CommandSystem — batching', () => {
  let sys: CommandSystem;

  beforeEach(() => {
    sys = new CommandSystem();
  });

  it('beginBatch/endBatch creates single undo entry', () => {
    sys.beginBatch();
    sys.execute(
      makeCmd(
        'a',
        () => {},
        () => {}
      )
    );
    sys.execute(
      makeCmd(
        'b',
        () => {},
        () => {}
      )
    );
    sys.endBatch('myBatch');
    expect(sys.getUndoStackSize()).toBe(1);
  });

  it('batch undo reverts all commands in reverse', () => {
    const log: string[] = [];
    sys.beginBatch();
    sys.execute(
      makeCmd(
        'a',
        () => log.push('doA'),
        () => log.push('undoA')
      )
    );
    sys.execute(
      makeCmd(
        'b',
        () => log.push('doB'),
        () => log.push('undoB')
      )
    );
    sys.endBatch('group');
    sys.undo();
    expect(log).toContain('undoB');
    expect(log).toContain('undoA');
  });

  it('clearHistory() empties stacks', () => {
    sys.execute(
      makeCmd(
        'x',
        () => {},
        () => {}
      )
    );
    sys.clearHistory();
    expect(sys.canUndo()).toBe(false);
  });
});

// =============================================================================
// Feature 9C: CommandSystem — macros
// =============================================================================

describe('Feature 9C: CommandSystem — macros', () => {
  let sys: CommandSystem;

  beforeEach(() => {
    sys = new CommandSystem();
  });

  it('startRecording/stopRecording saves macro', () => {
    sys.startRecording();
    sys.execute(
      makeCmd(
        'a',
        () => {},
        () => {}
      )
    );
    sys.stopRecording('myMacro');
    expect(sys.getMacroNames()).toContain('myMacro');
  });

  it('playMacro() re-executes commands', () => {
    let count = 0;
    sys.startRecording();
    sys.execute(
      makeCmd(
        'inc',
        () => count++,
        () => count--
      )
    );
    sys.stopRecording('inc3');

    const before = count;
    sys.playMacro('inc3');
    expect(count).toBeGreaterThan(before);
  });

  it('playMacro() returns false for unknown macro', () => {
    expect(sys.playMacro('nonexistent')).toBe(false);
  });

  it('getHistory() returns executed commands', () => {
    sys.execute(
      makeCmd(
        'z',
        () => {},
        () => {}
      )
    );
    expect(sys.getHistory().length).toBeGreaterThan(0);
  });
});
