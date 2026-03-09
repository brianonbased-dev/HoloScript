/**
 * Sprint 33 — @holoscript/std acceptance tests
 * Covers: types, collections, math, string, time
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────
// types.ts
// ─────────────────────────────────────────────
import {
  vec2,
  vec3,
  vec4,
  quat,
  transform,
  rgb,
  rgba,
  hsl,
  aabb,
  ray,
  vec3ToArray,
  arrayToVec3,
  quatToArray,
  arrayToQuat,
  parseColor,
  colorToHex,
} from '../types.js';

// ─────────────────────────────────────────────
// collections.ts
// ─────────────────────────────────────────────
import { List, HoloMap, HoloSet, SpatialGrid, PriorityQueue } from '../collections.js';

// ─────────────────────────────────────────────
// math.ts
// ─────────────────────────────────────────────
import {
  PI,
  TAU,
  HALF_PI,
  DEG_TO_RAD,
  RAD_TO_DEG,
  EPSILON,
  clamp,
  lerp,
  inverseLerp,
  remap,
  smoothstep,
  degToRad,
  radToDeg,
  mod,
  fract,
  sign,
  step,
  vec2Math,
  vec3Math,
  quatMath,
  aabbMath,
  noise,
  random,
} from '../math.js';

// ─────────────────────────────────────────────
// string.ts
// ─────────────────────────────────────────────
import {
  capitalize,
  titleCase,
  camelCase,
  pascalCase,
  snakeCase,
  kebabCase,
  constantCase,
  padLeft,
  padRight,
  center,
  truncate,
  truncateMiddle,
  isBlank,
  isNotBlank,
  containsIgnoreCase,
  startsWithIgnoreCase,
  endsWithIgnoreCase,
  isValidIdentifier,
  isNumeric,
  isAlphanumeric,
  isAlpha,
  repeat,
  reverse,
  count,
  removeWhitespace,
  collapseWhitespace,
  removePrefix,
  removeSuffix,
  wrap,
  unwrap,
  lines,
  words,
  chars,
  format,
  formatBytes,
  formatDuration,
  escapeHtml,
  unescapeHtml,
  escapeRegex,
  slugify,
  levenshtein,
  similarity,
  indent,
  dedent,
  wordWrap,
  randomString,
  uuid,
} from '../string.js';

// ─────────────────────────────────────────────
// time.ts
// ─────────────────────────────────────────────
import {
  now,
  sleep,
  measure,
  debounce,
  throttle,
  Stopwatch,
  FrameTimer,
  DateTime,
} from '../time.js';

// ═══════════════════════════════════════════════
// types.ts
// ═══════════════════════════════════════════════
describe('types — factory functions', () => {
  it('vec2 defaults to (0,0)', () => {
    const v = vec2();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('vec2 with values', () => {
    const v = vec2(3, 4);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
  });

  it('vec3 defaults to (0,0,0)', () => {
    const v = vec3();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('vec3 with values', () => {
    const v = vec3(1, 2, 3);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });

  it('vec4 with values', () => {
    const v = vec4(1, 2, 3, 4);
    expect(v.x).toBe(1);
    expect(v.w).toBe(4);
  });

  it('quat defaults to identity', () => {
    const q = quat();
    expect(q.w).toBe(1);
    expect(q.x).toBe(0);
    expect(q.y).toBe(0);
    expect(q.z).toBe(0);
  });

  it('transform has position, rotation, scale', () => {
    const t = transform();
    expect(t.position).toBeDefined();
    expect(t.rotation).toBeDefined();
    expect(t.scale).toBeDefined();
  });

  it('rgb creates color', () => {
    const c = rgb(255, 0, 0);
    expect(c.r).toBe(255);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });

  it('rgba creates color with alpha', () => {
    const c = rgba(0, 255, 0, 0.5);
    expect(c.a).toBe(0.5);
  });

  it('aabb creates bounding box', () => {
    const box = aabb(vec3(0, 0, 0), vec3(1, 1, 1));
    expect(box.min).toBeDefined();
    expect(box.max).toBeDefined();
  });

  it('ray creates ray with origin and direction', () => {
    const r = ray(vec3(0, 0, 0), vec3(0, 1, 0));
    expect(r.origin).toBeDefined();
    expect(r.direction).toBeDefined();
  });
});

describe('types — conversion utilities', () => {
  it('vec3ToArray / arrayToVec3 round-trip', () => {
    const v = vec3(1, 2, 3);
    const arr = vec3ToArray(v);
    expect(arr).toEqual([1, 2, 3]);
    const v2 = arrayToVec3(arr);
    expect(v2).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('quatToArray / arrayToQuat round-trip', () => {
    const q = quat(0, 0, 0, 1);
    const arr = quatToArray(q);
    expect(arr.length).toBe(4);
    const q2 = arrayToQuat(arr);
    expect(q2.w).toBeCloseTo(1);
  });

  it('parseColor handles hex #RRGGBB', () => {
    const c = parseColor('#ff0000');
    expect(c).not.toBeNull();
  });

  it('parseColor handles named color', () => {
    const c = parseColor('red');
    expect(c).not.toBeNull();
  });

  it('colorToHex produces # string', () => {
    const hex = colorToHex(rgb(255, 0, 0));
    expect(hex).toMatch(/^#/);
  });
});

// ═══════════════════════════════════════════════
// collections — List
// ═══════════════════════════════════════════════
describe('List', () => {
  it('creates empty list', () => {
    const l = new List<number>();
    expect(l.length).toBe(0);
    expect(l.isEmpty).toBe(true);
  });

  it('creates from array', () => {
    const l = new List([1, 2, 3]);
    expect(l.length).toBe(3);
  });

  it('List.of()', () => {
    const l = List.of(10, 20, 30);
    expect(l.length).toBe(3);
    expect(l.get(0)).toBe(10);
  });

  it('List.from()', () => {
    const l = List.from([5, 6, 7]);
    expect(l.get(2)).toBe(7);
  });

  it('List.range()', () => {
    const l = List.range(0, 5, 1);
    expect(l.length).toBe(5);
    expect(l.get(4)).toBe(4);
  });

  it('map transforms elements', () => {
    const l = List.of(1, 2, 3).map((x) => x * 2);
    expect(l.toArray()).toEqual([2, 4, 6]);
  });

  it('filter keeps matching elements', () => {
    const l = List.of(1, 2, 3, 4).filter((x) => x % 2 === 0);
    expect(l.toArray()).toEqual([2, 4]);
  });

  it('reduce accumulates', () => {
    const sum = List.of(1, 2, 3, 4).reduce((acc, x) => acc + x, 0);
    expect(sum).toBe(10);
  });

  it('find returns matching element', () => {
    const v = List.of(1, 2, 3).find((x) => x > 1);
    expect(v).toBe(2);
  });

  it('some / every', () => {
    const l = List.of(2, 4, 6);
    expect(l.some((x) => x > 5)).toBe(true);
    expect(l.every((x) => x % 2 === 0)).toBe(true);
  });

  it('concat combines lists', () => {
    const a = List.of(1, 2);
    const b = List.of(3, 4);
    expect(a.concat(b).length).toBe(4);
  });

  it('append / prepend', () => {
    const l = List.of(2, 3).prepend(1).append(4);
    expect(l.toArray()).toEqual([1, 2, 3, 4]);
  });

  it('reverse', () => {
    expect(List.of(1, 2, 3).reverse().toArray()).toEqual([3, 2, 1]);
  });

  it('sort', () => {
    expect(
      List.of(3, 1, 2)
        .sort((a, b) => a - b)
        .toArray()
    ).toEqual([1, 2, 3]);
  });

  it('unique removes duplicates', () => {
    expect(List.of(1, 2, 2, 3).unique().toArray()).toEqual([1, 2, 3]);
  });

  it('groupBy groups by key', () => {
    const map = List.of('a', 'bb', 'c', 'dd').groupBy((s) => s.length);
    expect(map.has(1)).toBe(true);
    expect(map.has(2)).toBe(true);
  });

  it('partition splits into two', () => {
    const [evens, odds] = List.of(1, 2, 3, 4).partition((x) => x % 2 === 0);
    expect(evens.toArray()).toEqual([2, 4]);
    expect(odds.toArray()).toEqual([1, 3]);
  });

  it('zip combines two lists', () => {
    const z = List.of(1, 2, 3).zip(List.of('a', 'b', 'c'));
    expect(z.get(0)).toEqual([1, 'a']);
  });

  it('flatten flattens one level', () => {
    const l = List.of(List.of(1, 2), List.of(3, 4)).flatten();
    expect(l.toArray()).toEqual([1, 2, 3, 4]);
  });

  it('sum / min / max / average', () => {
    const nums = List.of(1, 2, 3, 4);
    expect(nums.sum()).toBe(10);
    expect(nums.min()).toBe(1);
    expect(nums.max()).toBe(4);
    expect(nums.average()).toBe(2.5);
  });

  it('take / drop', () => {
    const l = List.of(1, 2, 3, 4, 5);
    expect(l.take(3).toArray()).toEqual([1, 2, 3]);
    expect(l.drop(3).toArray()).toEqual([4, 5]);
  });

  it('toSet converts to HoloSet', () => {
    const s = List.of(1, 2, 3).toSet();
    expect(s.has(2)).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// collections — HoloMap
// ═══════════════════════════════════════════════
describe('HoloMap', () => {
  it('creates empty map', () => {
    const m = new HoloMap<string, number>();
    expect(m.size).toBe(0);
  });

  it('HoloMap.of()', () => {
    const m = HoloMap.of(['a', 1], ['b', 2]);
    expect(m.size).toBe(2);
    expect(m.get('a')).toBe(1);
  });

  it('HoloMap.from()', () => {
    const m = HoloMap.from([
      ['x', 10],
      ['y', 20],
    ]);
    expect(m.get('y')).toBe(20);
  });

  it('HoloMap.fromObject()', () => {
    const m = HoloMap.fromObject({ a: 1, b: 2 });
    expect(m.get('a')).toBe(1);
  });

  it('set returns new map with entry', () => {
    const m1 = HoloMap.of<string, number>(['a', 1]);
    const m2 = m1.set('b', 2);
    expect(m2.get('b')).toBe(2);
    expect(m1.has('b')).toBe(false); // immutable
  });

  it('delete removes entry', () => {
    const m = HoloMap.of(['a', 1], ['b', 2]).delete('a');
    expect(m.has('a')).toBe(false);
    expect(m.size).toBe(1);
  });

  it('merge combines maps', () => {
    const a = HoloMap.of(['a', 1]);
    const b = HoloMap.of(['b', 2]);
    const c = a.merge(b);
    expect(c.size).toBe(2);
  });

  it('keys / values / entries', () => {
    const m = HoloMap.of(['a', 1], ['b', 2]);
    expect(m.keys().toArray()).toContain('a');
    expect(m.values().toArray()).toContain(1);
    expect(m.entries().length).toBe(2);
  });

  it('map transforms values', () => {
    const m = HoloMap.of(['a', 1], ['b', 2]).map((v) => v * 10);
    expect(m.get('a')).toBe(10);
  });

  it('filter keeps matching entries', () => {
    const m = HoloMap.of(['a', 1], ['b', 20]).filter((v) => v > 5);
    expect(m.has('b')).toBe(true);
    expect(m.has('a')).toBe(false);
  });

  it('toObject converts to plain object', () => {
    const obj = HoloMap.of(['x', 1]).toObject();
    expect(obj['x']).toBe(1);
  });
});

// ═══════════════════════════════════════════════
// collections — HoloSet
// ═══════════════════════════════════════════════
describe('HoloSet', () => {
  it('creates empty set', () => {
    const s = new HoloSet<number>();
    expect(s.size).toBe(0);
  });

  it('HoloSet.of()', () => {
    const s = HoloSet.of(1, 2, 3);
    expect(s.size).toBe(3);
    expect(s.has(2)).toBe(true);
  });

  it('HoloSet.from()', () => {
    const s = HoloSet.from([4, 5, 6]);
    expect(s.has(5)).toBe(true);
  });

  it('add returns new set', () => {
    const s1 = HoloSet.of(1, 2);
    const s2 = s1.add(3);
    expect(s2.has(3)).toBe(true);
    expect(s1.has(3)).toBe(false); // immutable
  });

  it('delete removes element', () => {
    const s = HoloSet.of(1, 2, 3).delete(2);
    expect(s.has(2)).toBe(false);
  });

  it('union', () => {
    const a = HoloSet.of(1, 2);
    const b = HoloSet.of(2, 3);
    expect(a.union(b).size).toBe(3);
  });

  it('intersection', () => {
    const a = HoloSet.of(1, 2, 3);
    const b = HoloSet.of(2, 3, 4);
    const i = a.intersection(b);
    expect(i.toArray().sort()).toEqual([2, 3]);
  });

  it('difference', () => {
    const a = HoloSet.of(1, 2, 3);
    const b = HoloSet.of(2, 3);
    expect(a.difference(b).toArray()).toEqual([1]);
  });

  it('symmetricDifference', () => {
    const a = HoloSet.of(1, 2, 3);
    const b = HoloSet.of(2, 3, 4);
    const sd = a.symmetricDifference(b);
    expect(sd.has(1)).toBe(true);
    expect(sd.has(4)).toBe(true);
    expect(sd.has(2)).toBe(false);
  });

  it('isSubsetOf / isSupersetOf', () => {
    const small = HoloSet.of(1, 2);
    const big = HoloSet.of(1, 2, 3);
    expect(small.isSubsetOf(big)).toBe(true);
    expect(big.isSupersetOf(small)).toBe(true);
  });

  it('isDisjointFrom', () => {
    const a = HoloSet.of(1, 2);
    const b = HoloSet.of(3, 4);
    expect(a.isDisjointFrom(b)).toBe(true);
  });

  it('toArray / toList / toNativeSet', () => {
    const s = HoloSet.of(1, 2, 3);
    expect(s.toArray().length).toBe(3);
    expect(s.toList().length).toBe(3);
    expect(s.toNativeSet().size).toBe(3);
  });
});

// ═══════════════════════════════════════════════
// collections — PriorityQueue
// ═══════════════════════════════════════════════
describe('PriorityQueue', () => {
  it('minHeap dequeues lowest priority first', () => {
    const pq = PriorityQueue.minHeap<string>();
    pq.enqueue('low', 10);
    pq.enqueue('high', 1);
    pq.enqueue('mid', 5);
    expect(pq.dequeue()).toBe('high');
    expect(pq.dequeue()).toBe('mid');
    expect(pq.dequeue()).toBe('low');
  });

  it('maxHeap dequeues highest priority first', () => {
    const pq = PriorityQueue.maxHeap<string>();
    pq.enqueue('a', 1);
    pq.enqueue('b', 10);
    pq.enqueue('c', 5);
    expect(pq.dequeue()).toBe('b');
  });

  it('peek returns top without removing', () => {
    const pq = PriorityQueue.minHeap<number>();
    pq.enqueue(42, 1);
    expect(pq.peek()).toBe(42);
    expect(pq.size).toBe(1);
  });

  it('isEmpty / size', () => {
    const pq = PriorityQueue.minHeap<number>();
    expect(pq.isEmpty).toBe(true);
    pq.enqueue(1, 1);
    expect(pq.size).toBe(1);
    expect(pq.isEmpty).toBe(false);
  });

  it('clear empties queue', () => {
    const pq = PriorityQueue.minHeap<number>();
    pq.enqueue(1, 1);
    pq.clear();
    expect(pq.isEmpty).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// collections — SpatialGrid
// ═══════════════════════════════════════════════
describe('SpatialGrid', () => {
  it('insert and query by radius', () => {
    const grid = new SpatialGrid<string>(1.0);
    grid.insert({ x: 0, y: 0, z: 0 }, 'origin');
    grid.insert({ x: 10, y: 0, z: 0 }, 'far');
    const results = grid.query({ x: 0, y: 0, z: 0 }, 1.5);
    expect(results).toContain('origin');
    expect(results).not.toContain('far');
  });

  it('remove deletes item', () => {
    const grid = new SpatialGrid<string>(1.0);
    grid.insert({ x: 0, y: 0, z: 0 }, 'item');
    grid.remove({ x: 0, y: 0, z: 0 }, 'item');
    const results = grid.query({ x: 0, y: 0, z: 0 }, 1.5);
    expect(results).not.toContain('item');
  });

  it('queryBox returns items in AABB', () => {
    const grid = new SpatialGrid<string>(1.0);
    grid.insert({ x: 0.5, y: 0.5, z: 0.5 }, 'inside');
    grid.insert({ x: 5, y: 5, z: 5 }, 'outside');
    const results = grid.queryBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    expect(results).toContain('inside');
    expect(results).not.toContain('outside');
  });
});

// ═══════════════════════════════════════════════
// math — constants
// ═══════════════════════════════════════════════
describe('math constants', () => {
  it('PI is ~3.14159', () => expect(PI).toBeCloseTo(3.14159, 4));
  it('TAU is 2*PI', () => expect(TAU).toBeCloseTo(PI * 2, 10));
  it('HALF_PI is PI/2', () => expect(HALF_PI).toBeCloseTo(PI / 2, 10));
  it('DEG_TO_RAD * 180 = PI', () => expect(DEG_TO_RAD * 180).toBeCloseTo(PI, 10));
  it('RAD_TO_DEG * PI = 180', () => expect(RAD_TO_DEG * PI).toBeCloseTo(180, 10));
  it('EPSILON is small', () => expect(EPSILON).toBeGreaterThan(0));
});

// ═══════════════════════════════════════════════
// math — basic functions
// ═══════════════════════════════════════════════
describe('math — basic functions', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('lerp', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('inverseLerp', () => {
    expect(inverseLerp(0, 10, 5)).toBeCloseTo(0.5);
    expect(inverseLerp(0, 10, 0)).toBe(0);
    expect(inverseLerp(0, 10, 10)).toBe(1);
  });

  it('remap', () => {
    const result = remap(5, 0, 10, 0, 100);
    expect(result).toBeCloseTo(50);
  });

  it('smoothstep', () => {
    expect(smoothstep(0, 1, 0)).toBeCloseTo(0);
    expect(smoothstep(0, 1, 1)).toBeCloseTo(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('degToRad / radToDeg', () => {
    expect(degToRad(180)).toBeCloseTo(PI);
    expect(radToDeg(PI)).toBeCloseTo(180);
  });

  it('mod handles negative values correctly', () => {
    expect(mod(7, 3)).toBe(1);
    expect(mod(-1, 3)).toBeGreaterThanOrEqual(0);
  });

  it('fract returns fractional part', () => {
    expect(fract(3.7)).toBeCloseTo(0.7);
    expect(fract(3.0)).toBeCloseTo(0.0);
  });

  it('sign', () => {
    expect(sign(5)).toBe(1);
    expect(sign(-5)).toBe(-1);
    expect(sign(0)).toBe(0);
  });

  it('step', () => {
    expect(step(0.5, 0.3)).toBe(0);
    expect(step(0.5, 0.7)).toBe(1);
  });
});

// ═══════════════════════════════════════════════
// math — vec2Math
// ═══════════════════════════════════════════════
describe('vec2Math', () => {
  it('add', () => {
    const r = vec2Math.add({ x: 1, y: 2 }, { x: 3, y: 4 });
    expect(r).toEqual({ x: 4, y: 6 });
  });

  it('sub', () => {
    const r = vec2Math.sub({ x: 5, y: 5 }, { x: 2, y: 3 });
    expect(r).toEqual({ x: 3, y: 2 });
  });

  it('mul (scalar)', () => {
    const r = vec2Math.mul({ x: 2, y: 3 }, 2);
    expect(r).toEqual({ x: 4, y: 6 });
  });

  it('dot', () => {
    expect(vec2Math.dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
    expect(vec2Math.dot({ x: 1, y: 0 }, { x: 1, y: 0 })).toBe(1);
  });

  it('length', () => {
    expect(vec2Math.length({ x: 3, y: 4 })).toBeCloseTo(5);
  });

  it('normalize produces unit vector', () => {
    const n = vec2Math.normalize({ x: 3, y: 4 });
    expect(vec2Math.length(n)).toBeCloseTo(1);
  });

  it('distance', () => {
    expect(vec2Math.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
  });

  it('lerp', () => {
    const r = vec2Math.lerp({ x: 0, y: 0 }, { x: 10, y: 10 }, 0.5);
    expect(r).toEqual({ x: 5, y: 5 });
  });

  it('angle', () => {
    const a = vec2Math.angle({ x: 1, y: 0 });
    expect(a).toBeCloseTo(0);
  });
});

// ═══════════════════════════════════════════════
// math — vec3Math
// ═══════════════════════════════════════════════
describe('vec3Math', () => {
  it('zero / one factory functions', () => {
    expect(vec3Math.zero()).toEqual({ x: 0, y: 0, z: 0 });
    expect(vec3Math.one()).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('up / down / forward / back factory functions', () => {
    expect(vec3Math.up().y).toBe(1);
    expect(vec3Math.down().y).toBe(-1);
    expect(vec3Math.forward().z).not.toBeUndefined();
    expect(vec3Math.back().z).not.toBeUndefined();
  });

  it('add', () => {
    const r = vec3Math.add({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 });
    expect(r).toEqual({ x: 5, y: 7, z: 9 });
  });

  it('sub', () => {
    const r = vec3Math.sub({ x: 5, y: 5, z: 5 }, { x: 2, y: 3, z: 1 });
    expect(r).toEqual({ x: 3, y: 2, z: 4 });
  });

  it('dot', () => {
    expect(vec3Math.dot({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(0);
  });

  it('cross', () => {
    const c = vec3Math.cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(c).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('length', () => {
    expect(vec3Math.length({ x: 1, y: 2, z: 2 })).toBeCloseTo(3);
  });

  it('normalize', () => {
    const n = vec3Math.normalize({ x: 0, y: 0, z: 5 });
    expect(vec3Math.length(n)).toBeCloseTo(1);
  });

  it('distance', () => {
    expect(vec3Math.distance({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 2 })).toBeCloseTo(3);
  });

  it('lerp', () => {
    const r = vec3Math.lerp({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 }, 0.5);
    expect(r).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('negate', () => {
    const n = vec3Math.negate({ x: 1, y: -2, z: 3 });
    expect(n).toEqual({ x: -1, y: 2, z: -3 });
  });

  it('equals', () => {
    expect(vec3Math.equals({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(true);
    expect(vec3Math.equals({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 4 })).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// math — quatMath
// ═══════════════════════════════════════════════
describe('quatMath', () => {
  it('identity quaternion', () => {
    const q = quatMath.identity();
    expect(q.w).toBeCloseTo(1);
    expect(q.x).toBeCloseTo(0);
    expect(q.y).toBeCloseTo(0);
    expect(q.z).toBeCloseTo(0);
  });

  it('fromAxisAngle', () => {
    const q = quatMath.fromAxisAngle({ x: 0, y: 1, z: 0 }, 0);
    expect(q.w).toBeCloseTo(1);
  });

  it('multiply identity stays identity', () => {
    const id = quatMath.identity();
    const q = quatMath.multiply(id, id);
    expect(q.w).toBeCloseTo(1);
  });

  it('normalize', () => {
    const q = { x: 0, y: 0, z: 0, w: 2 };
    const n = quatMath.normalize(q);
    expect(n.w).toBeCloseTo(1);
  });

  it('conjugate', () => {
    const q = { x: 1, y: 0, z: 0, w: 0 };
    const c = quatMath.conjugate(q);
    expect(c.x).toBe(-1);
  });

  it('toEuler / fromEuler round-trip', () => {
    const euler = { x: 0, y: 90, z: 0 };
    const q = quatMath.fromEuler(euler);
    const e2 = quatMath.toEuler(q);
    expect(e2.y).toBeCloseTo(90, 0);
  });

  it('rotateVec3', () => {
    const id = quatMath.identity();
    const v = { x: 1, y: 0, z: 0 };
    const r = quatMath.rotateVec3(id, v);
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(0);
  });
});

// ═══════════════════════════════════════════════
// math — aabbMath
// ═══════════════════════════════════════════════
describe('aabbMath', () => {
  const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } };

  it('center', () => {
    const c = aabbMath.center(box);
    expect(c).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('size', () => {
    const s = aabbMath.size(box);
    expect(s).toEqual({ x: 2, y: 2, z: 2 });
  });

  it('contains point inside', () => {
    expect(aabbMath.contains(box, { x: 1, y: 1, z: 1 })).toBe(true);
  });

  it('contains point outside', () => {
    expect(aabbMath.contains(box, { x: 5, y: 5, z: 5 })).toBe(false);
  });

  it('intersects overlapping boxes', () => {
    const b2 = { min: { x: 1, y: 1, z: 1 }, max: { x: 3, y: 3, z: 3 } };
    expect(aabbMath.intersects(box, b2)).toBe(true);
  });

  it('intersects non-overlapping boxes', () => {
    const b3 = { min: { x: 5, y: 5, z: 5 }, max: { x: 8, y: 8, z: 8 } };
    expect(aabbMath.intersects(box, b3)).toBe(false);
  });

  it('expand to include point', () => {
    const expanded = aabbMath.expand(box, { x: 5, y: 5, z: 5 });
    expect(expanded.max.x).toBe(5);
    expect(expanded.min.x).toBe(0);
  });

  it('merge', () => {
    const b2 = { min: { x: 1, y: 1, z: 1 }, max: { x: 5, y: 5, z: 5 } };
    const merged = aabbMath.merge(box, b2);
    expect(merged.max.x).toBe(5);
    expect(merged.min.x).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// math — noise
// ═══════════════════════════════════════════════
describe('noise', () => {
  it('perlin2d returns value in range', () => {
    const v = noise.perlin2d(0.5, 0.5);
    expect(typeof v).toBe('number');
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('perlin3d returns value in range', () => {
    const v = noise.perlin3d(0.5, 0.5, 0.5);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('fbm returns numeric value', () => {
    const v = noise.fbm(0.5, 0.5, 4);
    expect(typeof v).toBe('number');
  });

  it('simplex returns value', () => {
    const v = noise.simplex(0.3, 0.7);
    expect(typeof v).toBe('number');
  });

  it('worley returns value in range', () => {
    const v = noise.worley(1, 2, 3);
    expect(v).toBeGreaterThanOrEqual(0);
  });

  it('same inputs produce same output (deterministic)', () => {
    expect(noise.perlin2d(1.23, 4.56)).toBe(noise.perlin2d(1.23, 4.56));
  });
});

// ═══════════════════════════════════════════════
// math — random
// ═══════════════════════════════════════════════
describe('random', () => {
  it('float returns [0,1)', () => {
    for (let i = 0; i < 20; i++) {
      const v = random.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range returns value in [min,max)', () => {
    for (let i = 0; i < 20; i++) {
      const v = random.range(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });

  it('int returns integer in [min,max]', () => {
    for (let i = 0; i < 20; i++) {
      const v = random.int(1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('bool returns boolean', () => {
    expect(typeof random.bool()).toBe('boolean');
  });

  it('pick returns element from array', () => {
    const arr = [10, 20, 30];
    const v = random.pick(arr);
    expect(arr).toContain(v);
  });

  it('shuffle returns array of same length', () => {
    const arr = [1, 2, 3, 4, 5];
    const s = random.shuffle([...arr]);
    expect(s.length).toBe(arr.length);
  });

  it('seeded RNG is deterministic', () => {
    const rng1 = random.seeded(42);
    const rng2 = random.seeded(42);
    expect(rng1()).toBe(rng2());
  });

  it('insideUnitSphere returns point within sphere', () => {
    const p = random.insideUnitSphere();
    const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    expect(len).toBeLessThanOrEqual(1 + EPSILON);
  });

  it('insideUnitCircle returns 2D point within circle', () => {
    const p = random.insideUnitCircle();
    const len = Math.sqrt(p.x * p.x + p.y * p.y);
    expect(len).toBeLessThanOrEqual(1 + EPSILON);
  });
});

// ═══════════════════════════════════════════════
// string utilities
// ═══════════════════════════════════════════════
describe('string — case conversion', () => {
  it('capitalize', () => expect(capitalize('hello world')).toBe('Hello world'));
  it('titleCase', () => expect(titleCase('hello world')).toBe('Hello World'));
  it('camelCase', () => expect(camelCase('hello world')).toBe('helloWorld'));
  it('pascalCase', () => expect(pascalCase('hello world')).toBe('HelloWorld'));
  it('snakeCase', () => expect(snakeCase('helloWorld')).toBe('hello_world'));
  it('kebabCase', () => expect(kebabCase('helloWorld')).toBe('hello-world'));
  it('constantCase', () => expect(constantCase('helloWorld')).toBe('HELLO_WORLD'));
});

describe('string — padding and truncation', () => {
  it('padLeft', () => expect(padLeft('hi', 5)).toBe('   hi'));
  it('padRight', () => expect(padRight('hi', 5)).toBe('hi   '));
  it('center', () => {
    const s = center('hi', 6);
    expect(s.length).toBe(6);
    expect(s).toContain('hi');
  });
  it('truncate', () => {
    const t = truncate('hello world', 8);
    expect(t.length).toBeLessThanOrEqual(8);
  });
  it('truncateMiddle', () => {
    const t = truncateMiddle('hello world', 7);
    expect(t.length).toBeLessThanOrEqual(7);
  });
});

describe('string — checks', () => {
  it('isBlank / isNotBlank', () => {
    expect(isBlank('')).toBe(true);
    expect(isBlank('  ')).toBe(true);
    expect(isNotBlank('a')).toBe(true);
  });

  it('containsIgnoreCase', () => {
    expect(containsIgnoreCase('Hello World', 'world')).toBe(true);
    expect(containsIgnoreCase('Hello World', 'xyz')).toBe(false);
  });

  it('startsWithIgnoreCase', () => {
    expect(startsWithIgnoreCase('Hello', 'hello')).toBe(true);
  });

  it('endsWithIgnoreCase', () => {
    expect(endsWithIgnoreCase('World', 'WORLD')).toBe(true);
  });

  it('isValidIdentifier', () => {
    expect(isValidIdentifier('myVar')).toBe(true);
    expect(isValidIdentifier('123bad')).toBe(false);
  });

  it('isNumeric', () => {
    expect(isNumeric('123')).toBe(true);
    expect(isNumeric('12.5')).toBe(true);
    expect(isNumeric('abc')).toBe(false);
  });

  it('isAlpha', () => {
    expect(isAlpha('abc')).toBe(true);
    expect(isAlpha('abc123')).toBe(false);
  });

  it('isAlphanumeric', () => {
    expect(isAlphanumeric('abc123')).toBe(true);
    expect(isAlphanumeric('abc!')).toBe(false);
  });
});

describe('string — manipulation', () => {
  it('repeat', () => expect(repeat('ab', 3)).toBe('ababab'));
  it('reverse', () => expect(reverse('hello')).toBe('olleh'));
  it('count occurrences', () => expect(count('hello world hello', 'hello')).toBe(2));
  it('removeWhitespace', () => expect(removeWhitespace('h e l l o')).toBe('hello'));
  it('collapseWhitespace', () => expect(collapseWhitespace('a  b   c')).toBe('a b c'));
  it('removePrefix', () => expect(removePrefix('foobar', 'foo')).toBe('bar'));
  it('removeSuffix', () => expect(removeSuffix('foobar', 'bar')).toBe('foo'));
  it('wrap', () => expect(wrap('hello', '"')).toBe('"hello"'));
  it('unwrap', () => expect(unwrap('"hello"', '"')).toBe('hello'));
});

describe('string — splitting', () => {
  it('lines splits by newline', () => {
    const l = lines('a\nb\nc');
    expect(l).toEqual(['a', 'b', 'c']);
  });
  it('words splits by whitespace', () => {
    const w = words('hello world foo');
    expect(w).toEqual(['hello', 'world', 'foo']);
  });
  it('chars splits to characters', () => {
    expect(chars('abc')).toEqual(['a', 'b', 'c']);
  });
});

describe('string — formatting', () => {
  it('format substitutes named placeholders', () => {
    const result = format('Hello {name}, you are {age}!', { name: 'World', age: 42 });
    expect(result).toContain('World');
    expect(result).toContain('42');
  });

  it('formatBytes', () => {
    const s = formatBytes(1024);
    expect(s).toMatch(/KB|KiB/i);
  });

  it('formatDuration', () => {
    const s = formatDuration(3661000);
    expect(s).toMatch(/\d/);
  });
});

describe('string — escaping', () => {
  it('escapeHtml / unescapeHtml', () => {
    const escaped = escapeHtml('<b>hello</b>');
    expect(escaped).toContain('&lt;');
    expect(unescapeHtml(escaped)).toBe('<b>hello</b>');
  });

  it('escapeRegex', () => {
    const s = escapeRegex('a.b*c');
    expect(s).toContain('\\.');
    expect(s).toContain('\\*');
  });

  it('slugify', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });
});

describe('string — similarity', () => {
  it('levenshtein', () => {
    expect(levenshtein('kitten', 'sitting')).toBeGreaterThan(0);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('similarity returns 1 for identical strings', () => {
    expect(similarity('hello', 'hello')).toBe(1);
  });

  it('similarity returns value in [0,1]', () => {
    const s = similarity('hello', 'world');
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe('string — indentation', () => {
  it('indent adds prefix', () => {
    const s = indent('a\nb', 2);
    expect(s).toContain('  a');
    expect(s).toContain('  b');
  });

  it('dedent removes common indentation', () => {
    const s = dedent('  a\n  b\n  c');
    expect(s).not.toMatch(/^  /m);
  });

  it('wordWrap wraps long lines', () => {
    const s = wordWrap('hello world foo bar baz', 10);
    const lineArr = s.split('\n');
    for (const line of lineArr) {
      expect(line.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('string — generation', () => {
  it('randomString generates string of given length', () => {
    const s = randomString(10);
    expect(s.length).toBe(10);
    expect(typeof s).toBe('string');
  });

  it('uuid returns valid UUID format', () => {
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

// ═══════════════════════════════════════════════
// time utilities
// ═══════════════════════════════════════════════
describe('now', () => {
  it('returns number', () => {
    expect(typeof now()).toBe('number');
  });

  it('increases over time', async () => {
    const t1 = now();
    await sleep(10);
    const t2 = now();
    expect(t2).toBeGreaterThan(t1);
  });
});

describe('measure', () => {
  it('returns duration and result', async () => {
    const result = await measure(async () => {
      await sleep(5);
      return 42;
    });
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.result).toBe(42);
  });
});

describe('debounce', () => {
  it('delays function call', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('throttle', () => {
  it('limits call frequency', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('Stopwatch', () => {
  it('starts and stops', async () => {
    const sw = new Stopwatch();
    sw.start();
    await sleep(20);
    sw.stop();
    expect(sw.elapsed).toBeGreaterThan(0);
  });

  it('reset clears elapsed', () => {
    const sw = new Stopwatch();
    sw.start();
    sw.stop();
    sw.reset();
    expect(sw.elapsed).toBe(0);
  });

  it('lap returns elapsed and resets timer', async () => {
    const sw = new Stopwatch();
    sw.start();
    await sleep(10);
    const lapTime = sw.lap();
    expect(lapTime).toBeGreaterThan(0);
    // after lap(), stopwatch restarted
    expect(sw.isRunning).toBe(true);
  });

  it('restart resets and starts again', async () => {
    const sw = new Stopwatch();
    sw.start();
    await sleep(10);
    sw.restart();
    const e = sw.elapsed;
    expect(e).toBeLessThan(50);
  });
});

describe('FrameTimer', () => {
  it('tracks delta via update()', async () => {
    const ft = new FrameTimer();
    ft.update();
    await sleep(16);
    ft.update();
    expect(ft.delta).toBeGreaterThan(0);
    expect(ft.frames).toBeGreaterThan(0);
  });
});

describe('DateTime', () => {
  it('toISO returns ISO string', () => {
    const date = new Date(2024, 0, 15);
    const iso = DateTime.toISO(date);
    expect(iso).toMatch(/2024-01-15/);
  });

  it('format with pattern', () => {
    const date = new Date(2024, 0, 15, 12, 30, 45);
    const s = DateTime.format(date, 'YYYY-MM-DD');
    expect(s).toMatch(/2024-\d{2}-\d{2}/);
  });

  it('diff returns millisecond difference', () => {
    const d1 = new Date(2024, 0, 1);
    const d2 = new Date(2024, 0, 2);
    const diff = DateTime.diff(d1, d2);
    expect(Math.abs(diff)).toBe(86400000);
  });

  it('add adds duration', () => {
    const d = new Date(2024, 0, 1);
    const next = DateTime.add(d, 1, 'd');
    expect(next.getDate()).toBe(2);
  });

  it('startOfDay / endOfDay', () => {
    const d = new Date(2024, 0, 15, 12, 30);
    const start = DateTime.startOfDay(d);
    const end = DateTime.endOfDay(d);
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
  });
});
