/**
 * @holoscript/std - Collections Module
 *
 * Provides List, Map, and Set implementations with functional operations
 * for use in HoloScript Plus programs.
 */

import type { Vec3 } from './types.js';

/**
 * Immutable List with functional operations
 */
export class List<T> {
  private readonly items: readonly T[];

  constructor(items: Iterable<T> = []) {
    this.items = Array.from(items);
  }

  static of<T>(...items: T[]): List<T> {
    return new List(items);
  }

  static from<T>(iterable: Iterable<T>): List<T> {
    return new List(iterable);
  }

  static range(start: number, end: number, step = 1): List<number> {
    const items: number[] = [];
    for (let i = start; step > 0 ? i < end : i > end; i += step) {
      items.push(i);
    }
    return new List(items);
  }

  static repeat<T>(value: T, count: number): List<T> {
    return new List(Array(count).fill(value));
  }

  get length(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  get(index: number): T | undefined {
    return index < 0 ? this.items[this.items.length + index] : this.items[index];
  }

  first(): T | undefined {
    return this.items[0];
  }

  last(): T | undefined {
    return this.items[this.items.length - 1];
  }

  map<U>(fn: (item: T, index: number) => U): List<U> {
    return new List(this.items.map(fn));
  }

  flatMap<U>(fn: (item: T, index: number) => List<U> | U[]): List<U> {
    const result: U[] = [];
    this.items.forEach((item, index) => {
      const mapped = fn(item, index);
      if (mapped instanceof List) {
        result.push(...mapped.toArray());
      } else {
        result.push(...mapped);
      }
    });
    return new List(result);
  }

  filter(predicate: (item: T, index: number) => boolean): List<T> {
    return new List(this.items.filter(predicate));
  }

  reject(predicate: (item: T, index: number) => boolean): List<T> {
    return this.filter((item, index) => !predicate(item, index));
  }

  reduce<U>(fn: (acc: U, item: T, index: number) => U, initial: U): U {
    return this.items.reduce(fn, initial);
  }

  fold<U>(initial: U, fn: (acc: U, item: T) => U): U {
    return this.items.reduce(fn, initial);
  }

  find(predicate: (item: T, index: number) => boolean): T | undefined {
    return this.items.find(predicate);
  }

  findIndex(predicate: (item: T, index: number) => boolean): number {
    return this.items.findIndex(predicate);
  }

  indexOf(item: T): number {
    return this.items.indexOf(item);
  }

  includes(item: T): boolean {
    return this.items.includes(item);
  }

  some(predicate: (item: T, index: number) => boolean): boolean {
    return this.items.some(predicate);
  }

  every(predicate: (item: T, index: number) => boolean): boolean {
    return this.items.every(predicate);
  }

  none(predicate: (item: T, index: number) => boolean): boolean {
    return !this.some(predicate);
  }

  count(predicate: (item: T, index: number) => boolean): number {
    return this.filter(predicate).length;
  }

  forEach(fn: (item: T, index: number) => void): void {
    this.items.forEach(fn);
  }

  concat(...lists: (List<T> | T[])[]): List<T> {
    const arrays = lists.map((l) => (l instanceof List ? l.toArray() : l));
    return new List([...this.items, ...arrays.flat()]);
  }

  append(item: T): List<T> {
    return new List([...this.items, item]);
  }

  prepend(item: T): List<T> {
    return new List([item, ...this.items]);
  }

  insert(index: number, item: T): List<T> {
    const arr = [...this.items];
    arr.splice(index, 0, item);
    return new List(arr);
  }

  remove(index: number): List<T> {
    const arr = [...this.items];
    arr.splice(index, 1);
    return new List(arr);
  }

  update(index: number, item: T): List<T> {
    const arr = [...this.items];
    arr[index] = item;
    return new List(arr);
  }

  slice(start?: number, end?: number): List<T> {
    return new List(this.items.slice(start, end));
  }

  take(n: number): List<T> {
    return this.slice(0, n);
  }

  takeLast(n: number): List<T> {
    return this.slice(-n);
  }

  takeWhile(predicate: (item: T, index: number) => boolean): List<T> {
    const result: T[] = [];
    for (let i = 0; i < this.items.length; i++) {
      if (!predicate(this.items[i], i)) break;
      result.push(this.items[i]);
    }
    return new List(result);
  }

  drop(n: number): List<T> {
    return this.slice(n);
  }

  dropLast(n: number): List<T> {
    return this.slice(0, -n);
  }

  dropWhile(predicate: (item: T, index: number) => boolean): List<T> {
    let startIndex = 0;
    for (let i = 0; i < this.items.length; i++) {
      if (!predicate(this.items[i], i)) break;
      startIndex = i + 1;
    }
    return this.slice(startIndex);
  }

  reverse(): List<T> {
    return new List([...this.items].reverse());
  }

  sort(compareFn?: (a: T, b: T) => number): List<T> {
    return new List([...this.items].sort(compareFn));
  }

  sortBy<U>(fn: (item: T) => U): List<T> {
    return this.sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      if (va < vb) return -1;
      if (va > vb) return 1;
      return 0;
    });
  }

  shuffle(): List<T> {
    const arr = [...this.items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return new List(arr);
  }

  unique(): List<T> {
    return new List([...new Set(this.items)]);
  }

  uniqueBy<U>(fn: (item: T) => U): List<T> {
    const seen = new Set<U>();
    const result: T[] = [];
    for (const item of this.items) {
      const key = fn(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return new List(result);
  }

  groupBy<K>(fn: (item: T) => K): HoloMap<K, List<T>> {
    const groups = new Map<K, T[]>();
    for (const item of this.items) {
      const key = fn(item);
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    }
    const result = new Map<K, List<T>>();
    for (const [key, items] of groups) {
      result.set(key, new List(items));
    }
    return new HoloMap(result);
  }

  partition(predicate: (item: T, index: number) => boolean): [List<T>, List<T>] {
    const pass: T[] = [];
    const fail: T[] = [];
    this.items.forEach((item, index) => {
      if (predicate(item, index)) {
        pass.push(item);
      } else {
        fail.push(item);
      }
    });
    return [new List(pass), new List(fail)];
  }

  zip<U>(other: List<U>): List<[T, U]> {
    const length = Math.min(this.length, other.length);
    const result: [T, U][] = [];
    for (let i = 0; i < length; i++) {
      result.push([this.items[i], other.get(i)!]);
    }
    return new List(result);
  }

  zipWith<U, V>(other: List<U>, fn: (a: T, b: U) => V): List<V> {
    return this.zip(other).map(([a, b]) => fn(a, b));
  }

  flatten<U>(this: List<List<U> | U[]>): List<U> {
    const result: U[] = [];
    for (const item of this.items) {
      if (item instanceof List) {
        result.push(...item.toArray());
      } else if (Array.isArray(item)) {
        result.push(...item);
      }
    }
    return new List(result);
  }

  sum(this: List<number>): number {
    return this.reduce((acc, n) => acc + n, 0);
  }

  min(this: List<number>): number | undefined {
    if (this.isEmpty) return undefined;
    return Math.min(...this.items);
  }

  max(this: List<number>): number | undefined {
    if (this.isEmpty) return undefined;
    return Math.max(...this.items);
  }

  average(this: List<number>): number | undefined {
    if (this.isEmpty) return undefined;
    return this.sum() / this.length;
  }

  join(separator = ','): string {
    return this.items.join(separator);
  }

  toArray(): T[] {
    return [...this.items];
  }

  toSet(): HoloSet<T> {
    return new HoloSet(this.items);
  }

  [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }

  toString(): string {
    return `List(${this.items.join(', ')})`;
  }
}

/**
 * Immutable Map with functional operations
 */
export class HoloMap<K, V> {
  private readonly _map: ReadonlyMap<K, V>;

  constructor(entries?: Iterable<[K, V]> | Map<K, V>) {
    this._map = entries instanceof Map ? entries : new Map(entries);
  }

  static of<K, V>(...entries: [K, V][]): HoloMap<K, V> {
    return new HoloMap(entries);
  }

  static from<K, V>(entries: Iterable<[K, V]>): HoloMap<K, V> {
    return new HoloMap(entries);
  }

  static fromObject<V>(obj: Record<string, V>): HoloMap<string, V> {
    return new HoloMap(Object.entries(obj));
  }

  get size(): number {
    return this._map.size;
  }

  get isEmpty(): boolean {
    return this._map.size === 0;
  }

  get(key: K): V | undefined {
    return this._map.get(key);
  }

  getOrDefault(key: K, defaultValue: V): V {
    return this._map.has(key) ? this._map.get(key)! : defaultValue;
  }

  has(key: K): boolean {
    return this._map.has(key);
  }

  set(key: K, value: V): HoloMap<K, V> {
    const newMap = new Map(this._map);
    newMap.set(key, value);
    return new HoloMap(newMap);
  }

  delete(key: K): HoloMap<K, V> {
    const newMap = new Map(this._map);
    newMap.delete(key);
    return new HoloMap(newMap);
  }

  update(key: K, fn: (value: V | undefined) => V): HoloMap<K, V> {
    return this.set(key, fn(this.get(key)));
  }

  merge(other: HoloMap<K, V>): HoloMap<K, V> {
    const newMap = new Map(this._map);
    for (const [key, value] of other) {
      newMap.set(key, value);
    }
    return new HoloMap(newMap);
  }

  keys(): List<K> {
    return new List(this._map.keys());
  }

  values(): List<V> {
    return new List(this._map.values());
  }

  entries(): List<[K, V]> {
    return new List(this._map.entries());
  }

  map<U>(fn: (value: V, key: K) => U): HoloMap<K, U> {
    const entries: [K, U][] = [];
    for (const [key, value] of this._map) {
      entries.push([key, fn(value, key)]);
    }
    return new HoloMap(entries);
  }

  mapKeys<K2>(fn: (key: K, value: V) => K2): HoloMap<K2, V> {
    const entries: [K2, V][] = [];
    for (const [key, value] of this._map) {
      entries.push([fn(key, value), value]);
    }
    return new HoloMap(entries);
  }

  filter(predicate: (value: V, key: K) => boolean): HoloMap<K, V> {
    const entries: [K, V][] = [];
    for (const [key, value] of this._map) {
      if (predicate(value, key)) {
        entries.push([key, value]);
      }
    }
    return new HoloMap(entries);
  }

  reduce<U>(fn: (acc: U, value: V, key: K) => U, initial: U): U {
    let acc = initial;
    for (const [key, value] of this._map) {
      acc = fn(acc, value, key);
    }
    return acc;
  }

  forEach(fn: (value: V, key: K) => void): void {
    this._map.forEach(fn);
  }

  find(predicate: (value: V, key: K) => boolean): [K, V] | undefined {
    for (const [key, value] of this._map) {
      if (predicate(value, key)) {
        return [key, value];
      }
    }
    return undefined;
  }

  some(predicate: (value: V, key: K) => boolean): boolean {
    for (const [key, value] of this._map) {
      if (predicate(value, key)) return true;
    }
    return false;
  }

  every(predicate: (value: V, key: K) => boolean): boolean {
    for (const [key, value] of this._map) {
      if (!predicate(value, key)) return false;
    }
    return true;
  }

  toObject(this: HoloMap<string, V>): Record<string, V> {
    const obj: Record<string, V> = {};
    for (const [key, value] of this._map) {
      obj[key] = value;
    }
    return obj;
  }

  toNativeMap(): Map<K, V> {
    return new Map(this._map);
  }

  [Symbol.iterator](): Iterator<[K, V]> {
    return this._map[Symbol.iterator]();
  }

  toString(): string {
    const entries = [...this._map].map(([k, v]) => `${k}: ${v}`).join(', ');
    return `HoloMap { ${entries} }`;
  }
}

/**
 * Immutable Set with functional operations
 */
export class HoloSet<T> {
  private readonly set: ReadonlySet<T>;

  constructor(items?: Iterable<T>) {
    this.set = new Set(items);
  }

  static of<T>(...items: T[]): HoloSet<T> {
    return new HoloSet(items);
  }

  static from<T>(iterable: Iterable<T>): HoloSet<T> {
    return new HoloSet(iterable);
  }

  get size(): number {
    return this.set.size;
  }

  get isEmpty(): boolean {
    return this.set.size === 0;
  }

  has(item: T): boolean {
    return this.set.has(item);
  }

  add(item: T): HoloSet<T> {
    const newSet = new Set(this.set);
    newSet.add(item);
    return new HoloSet(newSet);
  }

  delete(item: T): HoloSet<T> {
    const newSet = new Set(this.set);
    newSet.delete(item);
    return new HoloSet(newSet);
  }

  addAll(items: Iterable<T>): HoloSet<T> {
    const newSet = new Set(this.set);
    for (const item of items) {
      newSet.add(item);
    }
    return new HoloSet(newSet);
  }

  union(other: HoloSet<T>): HoloSet<T> {
    return this.addAll(other);
  }

  intersection(other: HoloSet<T>): HoloSet<T> {
    const result = new Set<T>();
    for (const item of this.set) {
      if (other.has(item)) {
        result.add(item);
      }
    }
    return new HoloSet(result);
  }

  difference(other: HoloSet<T>): HoloSet<T> {
    const result = new Set<T>();
    for (const item of this.set) {
      if (!other.has(item)) {
        result.add(item);
      }
    }
    return new HoloSet(result);
  }

  symmetricDifference(other: HoloSet<T>): HoloSet<T> {
    return this.difference(other).union(other.difference(this));
  }

  isSubsetOf(other: HoloSet<T>): boolean {
    for (const item of this.set) {
      if (!other.has(item)) return false;
    }
    return true;
  }

  isSupersetOf(other: HoloSet<T>): boolean {
    return other.isSubsetOf(this);
  }

  isDisjointFrom(other: HoloSet<T>): boolean {
    return this.intersection(other).isEmpty;
  }

  map<U>(fn: (item: T) => U): HoloSet<U> {
    const result = new Set<U>();
    for (const item of this.set) {
      result.add(fn(item));
    }
    return new HoloSet(result);
  }

  filter(predicate: (item: T) => boolean): HoloSet<T> {
    const result = new Set<T>();
    for (const item of this.set) {
      if (predicate(item)) {
        result.add(item);
      }
    }
    return new HoloSet(result);
  }

  reduce<U>(fn: (acc: U, item: T) => U, initial: U): U {
    let acc = initial;
    for (const item of this.set) {
      acc = fn(acc, item);
    }
    return acc;
  }

  forEach(fn: (item: T) => void): void {
    this.set.forEach(fn);
  }

  find(predicate: (item: T) => boolean): T | undefined {
    for (const item of this.set) {
      if (predicate(item)) return item;
    }
    return undefined;
  }

  some(predicate: (item: T) => boolean): boolean {
    for (const item of this.set) {
      if (predicate(item)) return true;
    }
    return false;
  }

  every(predicate: (item: T) => boolean): boolean {
    for (const item of this.set) {
      if (!predicate(item)) return false;
    }
    return true;
  }

  toArray(): T[] {
    return [...this.set];
  }

  toList(): List<T> {
    return new List(this.set);
  }

  toNativeSet(): Set<T> {
    return new Set(this.set);
  }

  [Symbol.iterator](): Iterator<T> {
    return this.set[Symbol.iterator]();
  }

  toString(): string {
    return `HoloSet { ${[...this.set].join(', ')} }`;
  }
}

/**
 * Spatial grid for efficient spatial queries (useful for game worlds)
 */
export class SpatialGrid<T> {
  private readonly cellSize: number;
  private readonly cells: Map<string, T[]> = new Map();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private getCellKey(x: number, y: number, z: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx},${cy},${cz}`;
  }

  insert(position: Vec3, item: T): void {
    const key = this.getCellKey(position.x, position.y, position.z);
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key)!.push(item);
  }

  remove(position: Vec3, item: T): boolean {
    const key = this.getCellKey(position.x, position.y, position.z);
    const cell = this.cells.get(key);
    if (!cell) return false;
    const index = cell.indexOf(item);
    if (index === -1) return false;
    cell.splice(index, 1);
    if (cell.length === 0) {
      this.cells.delete(key);
    }
    return true;
  }

  query(center: Vec3, radius: number): T[] {
    const results: T[] = [];
    const cellRadius = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(center.x / this.cellSize);
    const cy = Math.floor(center.y / this.cellSize);
    const cz = Math.floor(center.z / this.cellSize);

    for (let x = cx - cellRadius; x <= cx + cellRadius; x++) {
      for (let y = cy - cellRadius; y <= cy + cellRadius; y++) {
        for (let z = cz - cellRadius; z <= cz + cellRadius; z++) {
          const cell = this.cells.get(`${x},${y},${z}`);
          if (cell) {
            results.push(...cell);
          }
        }
      }
    }

    return results;
  }

  queryBox(min: Vec3, max: Vec3): T[] {
    const results: T[] = [];
    const minCx = Math.floor(min.x / this.cellSize);
    const minCy = Math.floor(min.y / this.cellSize);
    const minCz = Math.floor(min.z / this.cellSize);
    const maxCx = Math.floor(max.x / this.cellSize);
    const maxCy = Math.floor(max.y / this.cellSize);
    const maxCz = Math.floor(max.z / this.cellSize);

    for (let x = minCx; x <= maxCx; x++) {
      for (let y = minCy; y <= maxCy; y++) {
        for (let z = minCz; z <= maxCz; z++) {
          const cell = this.cells.get(`${x},${y},${z}`);
          if (cell) {
            results.push(...cell);
          }
        }
      }
    }

    return results;
  }

  clear(): void {
    this.cells.clear();
  }

  get cellCount(): number {
    return this.cells.size;
  }

  get itemCount(): number {
    let count = 0;
    for (const cell of this.cells.values()) {
      count += cell.length;
    }
    return count;
  }
}

/**
 * Priority queue (min-heap by default)
 */
export class PriorityQueue<T> {
  private heap: { item: T; priority: number }[] = [];

  constructor(private compareFn: (a: number, b: number) => number = (a, b) => a - b) {}

  static minHeap<T>(): PriorityQueue<T> {
    return new PriorityQueue((a, b) => a - b);
  }

  static maxHeap<T>(): PriorityQueue<T> {
    return new PriorityQueue((a, b) => b - a);
  }

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  enqueue(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): T | undefined {
    if (this.isEmpty) return undefined;
    const result = this.heap[0].item;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return result;
  }

  peek(): T | undefined {
    return this.heap[0]?.item;
  }

  peekPriority(): number | undefined {
    return this.heap[0]?.priority;
  }

  clear(): void {
    this.heap = [];
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compareFn(this.heap[index].priority, this.heap[parentIndex].priority) >= 0) break;
      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < this.heap.length &&
        this.compareFn(this.heap[leftChild].priority, this.heap[smallest].priority) < 0
      ) {
        smallest = leftChild;
      }
      if (
        rightChild < this.heap.length &&
        this.compareFn(this.heap[rightChild].priority, this.heap[smallest].priority) < 0
      ) {
        smallest = rightChild;
      }

      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}

// Convenience aliases
export { HoloMap as Map };
export { HoloSet as Set };
