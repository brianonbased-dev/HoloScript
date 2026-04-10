/**
 * @holoscript/runtime acceptance tests
 * Covers: EventBus, storage (MemoryStorage), timing utilities, math utilities, navigation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus, eventBus, on, once, emit, off } from '../events.js';
import { createMemoryStorage } from '../storage.js';
import {
  lerp,
  clamp,
  inverseLerp,
  remap,
  smoothStep,
  degToRad,
  radToDeg,
  random,
  randomInt,
  randomItem,
  shuffle,
  distance2D,
  distance3D,
  normalize,
  wrap,
  pingPong,
  approximately,
  roundTo,
  noise1D,
  vec2,
  vec3,
} from '../math.js';
import {
  navigate,
  goBack,
  goForward,
  getCurrentPath,
  canGoBack,
  canGoForward,
  getHistory,
  clearHistory,
  parseParams,
  matchRoute,
  parseQuery,
  buildQuery,
  setNavigateCallback,
} from '../navigation.js';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EventBus â€” class
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('EventBus â€” instance', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('creates a new EventBus', () => {
    expect(bus).toBeDefined();
  });

  it('on() subscribes to events', () => {
    const handler = vi.fn();
    bus.on('test', handler);
    bus.emit('test', 'data');
    expect(handler).toHaveBeenCalledWith('data');
  });

  it('on() returns unsubscribe function', () => {
    const handler = vi.fn();
    const unsub = bus.on('test', handler);
    unsub();
    bus.emit('test', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('once() fires only once', () => {
    const handler = vi.fn();
    bus.once('once-event', handler);
    bus.emit('once-event', 1);
    bus.emit('once-event', 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('once() returns unsubscribe function', () => {
    const handler = vi.fn();
    const unsub = bus.once('once-event', handler);
    unsub();
    bus.emit('once-event', 'x');
    expect(handler).not.toHaveBeenCalled();
  });

  it('emit() fires all subscribers for that event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('multi', h1);
    bus.on('multi', h2);
    bus.emit('multi', 42);
    expect(h1).toHaveBeenCalledWith(42);
    expect(h2).toHaveBeenCalledWith(42);
  });

  it('emit() with no data calls handler with undefined', () => {
    const handler = vi.fn();
    bus.on('no-data', handler);
    bus.emit('no-data');
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it('off() removes specific handler', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('evt', h1);
    bus.on('evt', h2);
    bus.off('evt', h1);
    bus.emit('evt', 'x');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it('off() with no callback removes all handlers for event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('evt', h1);
    bus.on('evt', h2);
    bus.off('evt');
    bus.emit('evt', 'x');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('clear() removes all handlers', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('a', h1);
    bus.on('b', h2);
    bus.clear();
    bus.emit('a', 1);
    bus.emit('b', 2);
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('listenerCount() returns count of handlers', () => {
    expect(bus.listenerCount('x')).toBe(0);
    bus.on('x', vi.fn());
    bus.on('x', vi.fn());
    expect(bus.listenerCount('x')).toBe(2);
  });

  it('hasListeners() returns false for empty event', () => {
    expect(bus.hasListeners('empty')).toBe(false);
  });

  it('hasListeners() returns true after subscription', () => {
    bus.on('has', vi.fn());
    expect(bus.hasListeners('has')).toBe(true);
  });

  it('hasListeners() returns false after clear()', () => {
    bus.on('h', vi.fn());
    bus.clear();
    expect(bus.hasListeners('h')).toBe(false);
  });

  it('does not cross-contaminate different events', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('event-a', h1);
    bus.on('event-b', h2);
    bus.emit('event-a', 'a');
    expect(h1).toHaveBeenCalledWith('a');
    expect(h2).not.toHaveBeenCalled();
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EventBus â€” global singleton + convenience bindings
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('global eventBus singleton', () => {
  afterEach(() => {
    eventBus.clear();
  });

  it('eventBus is an EventBus instance', () => {
    expect(eventBus).toBeInstanceOf(EventBus);
  });

  it('on/emit convenience functions use global bus', () => {
    const handler = vi.fn();
    on('global-test', handler);
    emit('global-test', 'hello');
    expect(handler).toHaveBeenCalledWith('hello');
  });

  it('once convenience function fires once', () => {
    const handler = vi.fn();
    once('global-once', handler);
    emit('global-once', 1);
    emit('global-once', 2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('off convenience function removes handler', () => {
    const handler = vi.fn();
    on('global-off', handler);
    off('global-off', handler);
    emit('global-off', 'x');
    expect(handler).not.toHaveBeenCalled();
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MemoryStorage
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('createMemoryStorage', () => {
  it('creates a storage adapter', () => {
    const s = createMemoryStorage();
    expect(s).toBeDefined();
    expect(typeof s.get).toBe('function');
    expect(typeof s.set).toBe('function');
    expect(typeof s.remove).toBe('function');
    expect(typeof s.clear).toBe('function');
    expect(typeof s.keys).toBe('function');
    expect(typeof s.has).toBe('function');
  });

  it('set and get', async () => {
    const s = createMemoryStorage();
    await s.set('key', 'value');
    const v = await s.get('key');
    expect(v).toBe('value');
  });

  it('get returns null for missing key', async () => {
    const s = createMemoryStorage();
    const v = await s.get('missing');
    expect(v).toBeNull();
  });

  it('has returns true for existing key', async () => {
    const s = createMemoryStorage();
    await s.set('exists', 1);
    expect(await s.has('exists')).toBe(true);
  });

  it('has returns false for missing key', async () => {
    const s = createMemoryStorage();
    expect(await s.has('nope')).toBe(false);
  });

  it('remove deletes a key', async () => {
    const s = createMemoryStorage();
    await s.set('key', 'val');
    await s.remove('key');
    expect(await s.get('key')).toBeNull();
  });

  it('keys returns all keys', async () => {
    const s = createMemoryStorage();
    await s.set('a', 1);
    await s.set('b', 2);
    const k = await s.keys();
    expect(k).toContain('a');
    expect(k).toContain('b');
  });

  it('clear removes all entries', async () => {
    const s = createMemoryStorage();
    await s.set('a', 1);
    await s.set('b', 2);
    await s.clear();
    const k = await s.keys();
    expect(k.length).toBe(0);
  });

  it('stores complex objects', async () => {
    const s = createMemoryStorage();
    const obj = { nested: { value: 42 }, arr: [1, 2, 3] };
    await s.set('complex', obj);
    const v = await s.get<typeof obj>('complex');
    expect(v).toEqual(obj);
  });

  it('separate instances are independent', async () => {
    const s1 = createMemoryStorage();
    const s2 = createMemoryStorage();
    await s1.set('key', 'in-s1');
    expect(await s2.get('key')).toBeNull();
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// math utilities
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('math â€” scalar functions', () => {
  it('lerp', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('inverseLerp', () => {
    expect(inverseLerp(0, 10, 5)).toBeCloseTo(0.5);
    expect(inverseLerp(0, 10, 0)).toBe(0);
    expect(inverseLerp(0, 10, 10)).toBe(1);
  });

  it('remap', () => {
    expect(remap(5, 0, 10, 0, 100)).toBeCloseTo(50);
  });

  it('smoothStep', () => {
    expect(smoothStep(0, 1, 0)).toBeCloseTo(0);
    expect(smoothStep(0, 1, 1)).toBeCloseTo(1);
    expect(smoothStep(0, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('degToRad / radToDeg', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI);
    expect(radToDeg(Math.PI)).toBeCloseTo(180);
  });

  it('random returns [min,max)', () => {
    for (let i = 0; i < 20; i++) {
      const v = random(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });

  it('random with no args returns [0,1)', () => {
    for (let i = 0; i < 20; i++) {
      const v = random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('randomInt returns integer', () => {
    for (let i = 0; i < 20; i++) {
      const v = randomInt(1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('randomItem returns element from array', () => {
    const arr = [10, 20, 30];
    const v = randomItem(arr);
    expect(arr).toContain(v);
  });

  it('randomItem returns undefined for empty array', () => {
    expect(randomItem([])).toBeUndefined();
  });

  it('shuffle returns array of same length', () => {
    const arr = [1, 2, 3, 4, 5];
    const s = shuffle([...arr]);
    expect(s.length).toBe(arr.length);
    expect(s.sort()).toEqual(arr.sort());
  });

  it('distance2D', () => {
    expect(distance2D(0, 0, 3, 4)).toBeCloseTo(5);
  });

  it('distance3D', () => {
    expect(distance3D(0, 0, 0, 1, 2, 2)).toBeCloseTo(3);
  });

  it('normalize (scalar)', () => {
    expect(normalize(5, 0, 10)).toBeCloseTo(0.5);
    expect(normalize(0, 0, 10)).toBe(0);
    expect(normalize(10, 0, 10)).toBe(1);
  });

  it('wrap', () => {
    expect(wrap(11, 0, 10)).toBeCloseTo(1);
    expect(wrap(-1, 0, 10)).toBeCloseTo(9);
  });

  it('pingPong', () => {
    expect(pingPong(0, 1)).toBe(0);
    expect(pingPong(0.5, 1)).toBeCloseTo(0.5);
    expect(pingPong(1.5, 1)).toBeCloseTo(0.5);
  });

  it('approximately', () => {
    const result = approximately(0.1 + 0.2, 0.3);
    // Returns number or boolean â€” should be truthy
    expect(result).toBeTruthy();
  });

  it('roundTo', () => {
    expect(roundTo(3.14159, 2)).toBeCloseTo(3.14);
    expect(roundTo(1.005, 2)).toBeCloseTo(1.01, 0);
  });

  it('noise1D returns deterministic values', () => {
    expect(noise1D(0.5)).toBe(noise1D(0.5));
    expect(typeof noise1D(1.23)).toBe('number');
  });
});

describe('math â€” vec2', () => {
  it('vec2.create()', () => {
    const v = vec2.create(3, 4);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
  });

  it('vec2.create() defaults to (0,0)', () => {
    const v = vec2.create();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('vec2.add()', () => {
    const r = vec2.add({ x: 1, y: 2 }, { x: 3, y: 4 });
    expect(r).toEqual({ x: 4, y: 6 });
  });

  it('vec2.sub()', () => {
    const r = vec2.sub({ x: 5, y: 5 }, { x: 2, y: 3 });
    expect(r).toEqual({ x: 3, y: 2 });
  });

  it('vec2.mul()', () => {
    const r = vec2.mul({ x: 2, y: 3 }, 2);
    expect(r).toEqual({ x: 4, y: 6 });
  });

  it('vec2.div()', () => {
    const r = vec2.div({ x: 4, y: 6 }, 2);
    expect(r).toEqual({ x: 2, y: 3 });
  });

  it('vec2.length()', () => {
    expect(vec2.length({ x: 3, y: 4 })).toBeCloseTo(5);
  });

  it('vec2.normalize()', () => {
    const n = vec2.normalize({ x: 3, y: 4 });
    expect(vec2.length(n)).toBeCloseTo(1);
  });

  it('vec2.dot()', () => {
    expect(vec2.dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
  });

  it('vec2.lerp()', () => {
    const r = vec2.lerp({ x: 0, y: 0 }, { x: 10, y: 10 }, 0.5);
    expect(r).toEqual({ x: 5, y: 5 });
  });
});

describe('math â€” vec3', () => {
  it('vec3.create()', () => {
    const v = vec3.create(1, 2, 3);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });

  it('vec3.add()', () => {
    const r = vec3.add({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 });
    expect(r).toEqual({ x: 5, y: 7, z: 9 });
  });

  it('vec3.sub()', () => {
    const r = vec3.sub({ x: 5, y: 5, z: 5 }, { x: 1, y: 2, z: 3 });
    expect(r).toEqual({ x: 4, y: 3, z: 2 });
  });

  it('vec3.mul()', () => {
    const r = vec3.mul({ x: 1, y: 2, z: 3 }, 2);
    expect(r).toEqual({ x: 2, y: 4, z: 6 });
  });

  it('vec3.length()', () => {
    expect(vec3.length({ x: 1, y: 2, z: 2 })).toBeCloseTo(3);
  });

  it('vec3.normalize()', () => {
    const n = vec3.normalize({ x: 0, y: 0, z: 5 });
    expect(vec3.length(n)).toBeCloseTo(1);
  });

  it('vec3.dot()', () => {
    expect(vec3.dot({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(0);
  });

  it('vec3.cross()', () => {
    const c = vec3.cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(c.z).toBeCloseTo(1);
  });

  it('vec3.lerp()', () => {
    const r = vec3.lerp({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 }, 0.5);
    expect(r).toEqual({ x: 1, y: 2, z: 3 });
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// navigation utilities
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('navigation', () => {
  beforeEach(() => {
    clearHistory();
    // Set a no-op navigate callback to prevent errors
    setNavigateCallback(() => {});
  });

  it('navigate changes current path', () => {
    navigate('/home');
    expect(getCurrentPath()).toBe('/home');
  });

  it('navigate pushes to history', () => {
    navigate('/page1');
    navigate('/page2');
    const h = getHistory();
    expect(h).toContain('/page1');
    expect(h).toContain('/page2');
  });

  it('goBack returns to previous path', () => {
    navigate('/step1');
    navigate('/step2');
    goBack();
    expect(getCurrentPath()).toBe('/step1');
  });

  it('goForward goes forward after goBack', () => {
    navigate('/a');
    navigate('/b');
    goBack();
    goForward();
    expect(getCurrentPath()).toBe('/b');
  });

  it('canGoBack is false when no history', () => {
    clearHistory();
    expect(canGoBack()).toBe(false);
  });

  it('canGoBack is true after navigation', () => {
    navigate('/first');
    navigate('/second');
    expect(canGoBack()).toBe(true);
  });

  it('canGoForward is false at end of history', () => {
    navigate('/x');
    expect(canGoForward()).toBe(false);
  });

  it('clearHistory resets history to current path only', () => {
    navigate('/a');
    navigate('/b');
    clearHistory();
    // clearHistory resets to [currentPath], not empty
    expect(getHistory().length).toBe(1);
  });

  it('parseParams extracts params from path', () => {
    const params = parseParams('/user/:id', '/user/42');
    expect(params).not.toBeNull();
    expect(params?.['id']).toBe('42');
  });

  it('parseParams returns null for non-matching path', () => {
    const params = parseParams('/user/:id', '/product/42');
    expect(params).toBeNull();
  });

  it('matchRoute returns true for matching pattern', () => {
    expect(matchRoute('/user/:id', '/user/123')).toBe(true);
  });

  it('matchRoute returns false for non-matching', () => {
    expect(matchRoute('/user/:id', '/admin/123')).toBe(false);
  });

  it('parseQuery parses query string', () => {
    const q = parseQuery('?foo=bar&baz=qux');
    expect(q['foo']).toBe('bar');
    expect(q['baz']).toBe('qux');
  });

  it('buildQuery builds query string', () => {
    const s = buildQuery({ name: 'test', page: 1, active: true });
    expect(s).toContain('name=test');
    expect(s).toContain('page=1');
  });
});
